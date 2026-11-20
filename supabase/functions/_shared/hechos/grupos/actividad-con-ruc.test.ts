// La prueba del grupo 4, parte 2 (docs/capa-de-hechos.md, 4.4.1): el RUC de referencia, los
// cinco estados de la actividad, los establecimientos como entidades y la diferencia entre
// las fechas del RUC y sus establecimientos. La paridad contra el perfil, en los guiones.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { derivarHechos } from "../indice.ts";
import type { Contexto } from "../tipos.ts";

const contexto: Contexto = {
  cedula: "0000000000",
  consulta: "perfil-de-prueba",
  fechaDeLaConsulta: "2026-10-01T12:00:00-05:00",
  corteIess: "2026-10",
  persona: { nombre: null, fechaDeNacimiento: null },
};

const ok = (data: unknown) => ({ status: "ok", data });
const ruc = (extra: Record<string, unknown> = {}) => ({ ruc: "0000000000001", fecha_inicio_actividades: "2019/01/15", obligado: "NO", ...extra });
const establecimiento = (extra: Record<string, unknown> = {}) => ({ ruc: "0000000000001", num_establecimiento: "001", estado_establecimiento: "ABIERTO", act_economica: "VENTA", ...extra });
const crudo = (registros: unknown[], establecimientos: unknown[] = []) => ({
  contribuyente: ok({ datosContribuyente: registros }),
  establecimientoActEconomica: ok({ datosEstablecimientoActEco: establecimientos }),
});
type Doc = ReturnType<typeof derivarHechos>;
const hecho = (doc: Doc, codigo: string) => doc.hechos.find((h) => h.codigo === codigo)!;
const estado = (c: unknown) => hecho(derivarHechos(c, contexto), "ruc.actividad.estado").valor;

Deno.test("los cinco estados de la actividad económica salen de las fechas del RUC", () => {
  assertEquals(estado(crudo([])), "sin_ruc");
  assertEquals(estado(crudo([ruc()])), "activa_sin_interrupciones");
  assertEquals(estado(crudo([ruc({ fecha_cancelacion: "2021/06/30", fecha_reinicio_actividades: "2023/01/10" })])), "activa_reactivada");
  assertEquals(estado(crudo([ruc({ fecha_cancelacion: "2021/06/30" })])), "inactiva_nunca_reactivada");
  assertEquals(estado(crudo([ruc({ fecha_reinicio_actividades: "2019/06/01", fecha_cancelacion: "2021/06/30" })])), "inactiva_tras_reactivacion");
});

Deno.test("el RUC de referencia es el primero activo, y los demás quedan descartados con su motivo", () => {
  const doc = derivarHechos(crudo([ruc({ ruc: "0000000000002", fecha_cancelacion: "2020/01/01" }), ruc({ ruc: "0000000000003" })]), contexto);
  const h = hecho(doc, "ruc.referencia.numero");
  assertEquals([h.valor, h.registros.map((r) => r.indice)], ["0000000000003", [1]]);
  assertEquals((h.descartados ?? []).map((d) => `${d.registro.indice}:${d.motivo}`), ["0:no_es_el_ruc_de_referencia"]);
  // Sin ninguno activo, el primero de la lista.
  const sinActivo = derivarHechos(crudo([ruc({ ruc: "0000000000002", fecha_cancelacion: "2020/01/01" }), ruc({ ruc: "0000000000003", fecha_cancelacion: "2020/02/01" })]), contexto);
  assertEquals(hecho(sinActivo, "ruc.referencia.numero").valor, "0000000000002");
  assertEquals(hecho(sinActivo, "ruc.activo").valor, false);
});

Deno.test("un establecimiento es una entidad con su estado, y un RUC sin establecimiento abierto no es activo", () => {
  const doc = derivarHechos(crudo([ruc()], [establecimiento(), establecimiento({ num_establecimiento: "002", estado_establecimiento: "CERRADO" })]), contexto);
  const entidades = doc.entidades.filter((e) => e.tipo === "establecimiento");
  assertEquals(entidades.length, 2);
  assertEquals(entidades.map((e) => (e.atributos as { abierto: boolean }).abierto), [true, false]);
  assertEquals([hecho(doc, "ruc.establecimientos.activos").valor, hecho(doc, "ruc.establecimientos.inactivos").valor], [1, 1]);
  const todosCerrados = derivarHechos(crudo([ruc()], [establecimiento({ estado_establecimiento: "CERRADO" })]), contexto);
  assertEquals([hecho(todosCerrados, "ruc.activo").valor, hecho(todosCerrados, "ruc.establecimientos.activos").valor], [false, 0]);
  const dif = todosCerrados.diferencias.filter((d) => d.codigo === "dif.ruc.estado");
  assertEquals([dif.length, dif[0].cede[0].valor, dif[0].lectura], [1, "ruc_vigente_con_todos_los_establecimientos_cerrados", "revisar"]);
});

Deno.test("obligado y depuración se leen como ruc.ts (S y SI cuentan, N y NO no, otro valor es null)", () => {
  const obligado = (v: string) => hecho(derivarHechos(crudo([ruc({ obligado: v })]), contexto), "ruc.obligado_contabilidad");
  assertEquals([obligado("SI").valor, obligado("S").valor, obligado("N").valor, obligado("NO").valor], [true, true, false, false]);
  assertEquals(obligado("TAL VEZ").valor, null);
  const depurado = hecho(derivarHechos(crudo([ruc({ fecha_cancelacion: "2021/06/30", observ_solicitud_suspension: "depuración" })]), contexto), "ruc.depurado_por_el_sri");
  assertEquals(depurado.valor, true);
  assertEquals(depurado.calidad, "confirmado_por_tercero");
  // Si el RUC está activo o no es una regla nuestra: calculado.
  assertEquals(hecho(derivarHechos(crudo([ruc()]), contexto), "ruc.activo").calidad, "calculado");
});

Deno.test("sin la respuesta del SRI los hechos no tienen valor y dicen por qué, con el parcial", () => {
  const caido = { contribuyente: { status: "error", data: null }, establecimientoActEconomica: ok({ datosEstablecimientoActEco: [] }) };
  const doc = derivarHechos(caido, contexto);
  const h = hecho(doc, "ruc.activo");
  assertEquals([h.valor, h.motivo, h.parcial], [null, "fuente_sin_respuesta", false]);
  assertEquals(hecho(doc, "ruc.actividad.estado").parcial, "sin_ruc");
  assertEquals(doc.diferencias.length, 0);
});
