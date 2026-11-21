// La prueba del grupo 4, parte 2, ingresos (docs/capa-de-hechos.md, 4.4.1): cada campo de
// `fuentesIngreso` y de su `detalle` tiene su código, el perfil armado desde los hechos es el
// que arma analizarFuentesIngreso(), la calidad separa lo que confirma un tercero de lo que
// elige la persona, y una fuente caída deja el hecho sin valor con su parcial. La paridad sobre
// el crudo real la mide comparar-hechos.mjs.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { catalogoCompleto, derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import type { Contexto } from "../tipos.ts";
import { analizarFuentesIngreso } from "../../fuentes-ingreso.ts";
import type { RespuestaProveedorInfo1 } from "../../types.ts";
import { CATALOGO } from "./ingresos.ts";

const contexto: Contexto = {
  cedula: "0000000000",
  consulta: "perfil-de-prueba",
  fechaDeLaConsulta: "2026-10-01T12:00:00-05:00",
  corteIess: "2026-10",
  persona: { nombre: null, fechaDeNacimiento: null },
};

const ok = (data: unknown) => ({ status: "ok", data });
const aporte = (mes: number, extra: Record<string, unknown> = {}) => ({
  ci: "0000000000", rucEmp: "1790000000001", tipEmp: "2-EMPRESA PRIVADA", nomEmp: "EMPRESA FICTICIA S.A.", nomAfi: "PRUEBA FICTICIO MARTA",
  salario: "800", fecIng: "01/03/2020", fecSal: "", ocupacion: "ANALISTA", anio: 2026, mes, ...extra,
});
const crudoCon = (extra: Record<string, unknown>) => ({
  general: ok({ personaNatural: { nombre: "PRUEBA FICTICIO MARTA" } }),
  jubilados: ok({ trabajos: [] }), empleados: ok({ empleados: [] }), contribuyente: ok({ datosContribuyente: [] }),
  establecimientoActEconomica: ok({ datosEstablecimientoActEco: [] }),
  afiliacionIssfacCertMedico: ok({ afiliaciones: [] }), afiliacionSiisspol: ok({ afiliacionSiisspol: [] }),
  pensionAlimenticiaProveedorInfo1: ok({ supas: [] }), sriImpuestoRenta: ok({ data: [] }),
  basesInternas: ok({ tiess: [] }),
  ...extra,
});
type Doc = ReturnType<typeof derivarHechos>;
const hecho = (doc: Doc, codigo: string) => doc.hechos.find((h) => h.codigo === codigo)!;
const registros = (doc: Doc, codigo: string) => hecho(doc, codigo).registros.map((r) => `${r.fuente}#${r.indice}`);

const mixto = () => crudoCon({
  basesInternas: ok({ tiess: [aporte(8), aporte(9), aporte(10), aporte(10, { rucEmp: "1790000000009", tipEmp: "3-AFILIADO VOLUNTARIO", nomEmp: "PRUEBA OTRO", salario: "700" })] }),
});

// Los campos de `fuentesIngreso` (AnalisisFuentesIngreso y DetalleIngresos) en fuentes-ingreso.ts,
// leídos del archivo: un campo nuevo sin su código corta acá, sin datos.
Deno.test("cero campos sin procedencia: todo campo de fuentesIngreso y de su detalle tiene su código", () => {
  const texto = Deno.readTextFileSync(new URL("../../fuentes-ingreso.ts", import.meta.url));
  const campos = (interfaz: string) => {
    const desde = texto.indexOf(`export interface ${interfaz} {`);
    const hasta = texto.indexOf("\n}", desde);
    return [...texto.slice(desde, hasta).matchAll(/^ {2}(\w+)\??:/gm)].map((m) => m[1]);
  };
  const delAnalisis = campos("AnalisisFuentesIngreso");
  const delDetalle = campos("DetalleIngresos").filter((c) => c !== "recalculo"); // sólo en perfiles reclasificados
  assertEquals([delAnalisis.length, delDetalle.length], [13, 10]);
  const conCodigo = new Set(CATALOGO.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil] : [])));
  assertEquals(delAnalisis.filter((c) => c !== "detalle" && !conCodigo.has(`fuentesIngreso.${c}`)), []);
  assertEquals(delDetalle.filter((c) => !conCodigo.has(`fuentesIngreso.detalle.${c}`)), []);
  assertEquals(catalogoCompleto().filter((c) => c.codigo.startsWith("ing.") || c.codigo.startsWith("dif.ing.")).length, CATALOGO.length);
});

const canonico = (v: unknown) =>
  JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));

Deno.test("el perfil armado desde los hechos es el de analizarFuentesIngreso, con el detalle anidado", () => {
  for (const crudo of [mixto(), crudoCon({}), crudoCon({ basesInternas: ok({ tiess: [aporte(6), aporte(7), aporte(8), aporte(9), aporte(10)] }) })]) {
    const esperado = analizarFuentesIngreso(crudo as unknown as RespuestaProveedorInfo1, "PRUEBA FICTICIO MARTA", "2026-10", "0000000000");
    assertEquals(canonico(perfilDesdeHechos(derivarHechos(crudo, contexto), "fuentesIngreso")), canonico(esperado));
  }
  assertEquals(perfilDesdeHechos(derivarHechos(mixto(), contexto), "fuentesIngreso").segmento, "ingresos_mixtos");
});

Deno.test("la calidad: lo que paga un empleador es de un tercero; la base que elige la persona, declarada", () => {
  const doc = derivarHechos(mixto(), contexto);
  assertEquals([hecho(doc, "ing.reportado.por_tercero").valor, hecho(doc, "ing.reportado.por_tercero").calidad], [800, "confirmado_por_tercero"]);
  assertEquals([hecho(doc, "ing.reportado.autodeclarado").valor, hecho(doc, "ing.reportado.autodeclarado").calidad], [700, "declarado"]);
  assertEquals(registros(doc, "ing.reportado.por_tercero"), ["basesInternas#2"]);
  assertEquals(registros(doc, "ing.reportado.autodeclarado"), ["basesInternas#3"]);
  // El total toma la más débil de las dos.
  assertEquals([hecho(doc, "ing.reportado.mensual").valor, hecho(doc, "ing.reportado.mensual").calidad], [1500, "declarado"]);
  assertEquals(hecho(doc, "ing.fuentes").calidad, "declarado");
  // Sólo un empleador: confirmado por un tercero.
  const solo = derivarHechos(crudoCon({ basesInternas: ok({ tiess: [aporte(10)] }) }), contexto);
  assertEquals([hecho(solo, "ing.reportado.mensual").calidad, hecho(solo, "ing.fuentes").calidad], ["confirmado_por_tercero", "confirmado_por_tercero"]);
  // Quien es su propio patrono (su RUC es su cédula más 001) se declara a sí mismo.
  const propio = derivarHechos(crudoCon({ basesInternas: ok({ tiess: [aporte(10, { rucEmp: "0000000000001", nomEmp: "PRUEBA FICTICIO MARTA" })] }) }), contexto);
  assertEquals(hecho(propio, "ing.reportado.mensual").calidad, "declarado");
  // La renta es lo que declaró al SRI.
  assertEquals(hecho(doc, "ing.impuesto_renta.por_anio").calidad, "declarado");
  // La actividad que este módulo deduce del RUC se calcula.
  const conRuc = derivarHechos(crudoCon({ contribuyente: ok({ datosContribuyente: [{ ruc: "0000000000001", fecha_inicio_actividades: "2024/05/01", obligado: "NO" }] }) }), contexto);
  assertEquals([hecho(conRuc, "ing.fuentes").calidad, hecho(conRuc, "ing.segmento.codigo").valor], ["calculado", "independiente"]);
});

Deno.test("«obligado» se lee distinto en ruc.ts y en fuentes-ingreso.ts: con «S» hay una diferencia, con «SI» no", () => {
  const conObligado = (v: string) => derivarHechos(crudoCon({ contribuyente: ok({ datosContribuyente: [{ ruc: "0000000000001", fecha_inicio_actividades: "2024/05/01", obligado: v }] }) }), contexto);
  const s = conObligado("S").diferencias.filter((d) => d.codigo === "dif.ing.obligado");
  assertEquals([s.length, s[0].lectura], [1, "revisar"]);
  assertEquals(conObligado("SI").diferencias.filter((d) => d.codigo === "dif.ing.obligado").length, 0);
  assertEquals(conObligado("N").diferencias.filter((d) => d.codigo === "dif.ing.obligado").length, 0);
  // La señal de escala de fuentes-ingreso.ts no la ve con «S»: se reproduce tal cual.
  assertEquals(JSON.stringify(hecho(conObligado("S"), "ing.senales_de_escala").valor).includes("obligado a llevar contabilidad"), false);
  assertEquals(JSON.stringify(hecho(conObligado("SI"), "ing.senales_de_escala").valor).includes("obligado a llevar contabilidad"), true);
});

Deno.test("un aporte vigente sin monto queda descartado de la suma", () => {
  const doc = derivarHechos(crudoCon({ basesInternas: ok({ tiess: [aporte(10), aporte(10, { rucEmp: "1790000000002", salario: "0" })] }) }), contexto);
  assertEquals(hecho(doc, "ing.reportado.mensual").valor, 800);
  assertEquals(registros(doc, "ing.reportado.mensual"), ["basesInternas#0"]);
  assertEquals((hecho(doc, "ing.reportado.mensual").descartados ?? []).map((d) => `${d.registro.indice}:${d.motivo}`), ["1:aporte_sin_monto_valido"]);
});

Deno.test("el corte vacío (process.ts lo pasa así) es el conocido, y un mes posterior del cliente lo avanza", () => {
  const sinCorte = derivarHechos(crudoCon({ basesInternas: ok({ tiess: [aporte(10)] }) }), { ...contexto, corteIess: "" });
  assertEquals(hecho(sinCorte, "ing.corte.usado").valor, "2026-10");
  const adelantado = derivarHechos(crudoCon({ basesInternas: ok({ tiess: [aporte(12)] }) }), contexto);
  assertEquals([hecho(adelantado, "ing.corte.usado").valor, hecho(adelantado, "ing.corte.desactualizado").valor], ["2026-12", true]);
  assertEquals(registros(adelantado, "ing.corte.usado"), ["basesInternas#0"]);
});

Deno.test("una fuente caída deja el hecho sin valor, con el parcial que el perfil escribe hoy", () => {
  const doc = derivarHechos(crudoCon({ basesInternas: { status: "error", data: null } }), contexto);
  const h = hecho(doc, "ing.segmento.codigo");
  assertEquals([h.valor, h.motivo, h.parcial, h.calidad], [null, "fuente_sin_respuesta", "sin_datos", "no_disponible"]);
  // Etapa B (estructura-v31): el perfil escribe null y deja el parcial en camposSinDato.
  const perfil = perfilDesdeHechos(doc, "fuentesIngreso");
  assertEquals(perfil.segmento, null);
  assertEquals((perfil.camposSinDato as Record<string, unknown>).segmento, "sin_datos");
  assertEquals((perfil.detalle as Record<string, unknown>).aportesPorMes, null);
  assertEquals(Object.hasOwn(perfil, "detalle.aportesPorMes"), false); // un campo del detalle va anidado, no con el punto en el nombre
  assertEquals(Object.hasOwn(perfil.camposSinDato as object, "detalle.aportesPorMes"), true);
  // La renta dice «no hay» con `faltante`: no es una falla.
  const sinRenta = derivarHechos(crudoCon({ sriImpuestoRenta: { status: "faltante", data: null }, basesInternas: ok({ tiess: [aporte(10)] }) }), contexto);
  assertEquals(hecho(sinRenta, "ing.segmento.codigo").valor, "dependiente_privado");
});

Deno.test("con datos raros en los campos (tipos que no son los esperados) los hechos no se caen", () => {
  const raro = crudoCon({
    basesInternas: ok({ tiess: [aporte(10, { salario: null, fecIng: 12, fecSal: 0, nomEmp: undefined, rucEmp: 5, tipEmp: null }), aporte(11, { anio: "x", mes: [] })] }),
    contribuyente: ok({ datosContribuyente: [{ ruc: 5, fecha_cancelacion: {}, obligado: 1 }] }),
    establecimientoActEconomica: ok({ datosEstablecimientoActEco: [{ estado_establecimiento: 7, act_economica: 3 }], otraLista: [{ nombre_comercial: "X" }] }),
    sriImpuestoRenta: ok({ data: [{ impuestosRenta: [{ periodoFiscal: "x" }] }] }),
  });
  assertEquals(derivarHechos(raro, contexto).hechos.length > 0, true);
});
