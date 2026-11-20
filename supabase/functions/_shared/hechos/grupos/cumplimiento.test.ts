// La prueba del grupo de cumplimiento (docs/capa-de-hechos.md, 4.5 y 6, puntos 10 y 14): cada campo de
// `cumplimiento` tiene su código, las listas bloquean por todas las listas del proveedor (D7) y descartan
// homónimos y providencias de certificación, el PEP de dos fuentes se suma sin unir, y el control de
// bloqueo sale de los mismos hechos, hallazgo por hallazgo. Una fuente caída no bloquea ni desbloquea a
// nadie: se lee el parcial. Todo valor es inventado: el repositorio es público.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import { controlesDesdeHechos } from "../controles.ts";
import { evaluarControlesBloqueo } from "../../controles-bloqueo.ts";
import { buildStandardProfile } from "../../process.ts";
import type { Contexto, Hecho } from "../tipos.ts";
import { CATALOGO } from "./cumplimiento.ts";

const CEDULA = "0000000000";
const contexto: Contexto = { cedula: CEDULA, consulta: "perfil-de-prueba", fechaDeLaConsulta: "2026-10-01T12:00:00-05:00", corteIess: "2026-10", persona: { nombre: null, fechaDeNacimiento: null } };
const ok = (data: unknown) => ({ status: "ok", data });
const caida = { status: "error", data: null };
const listas = (extra: Record<string, unknown> = {}) => ok({ ofacsOpr: [], providenciasOpr: [], homonimosOpr: [], personaPublicasOpr: [], ...extra });
const internas = (extra: Record<string, unknown> = {}) => ok({ tofac: [], tofac2: [], tconsepvinculados: [], tprovidencias: [], tconsephomonimos: [], tpeps: [], ...extra });
const base = () => ({
  general: ok({ personaNatural: { nombre: "PRUEBA FICTICIO", identificacion: CEDULA } }),
  listasControl: listas(),
  basesInternas: internas(),
  listaNegra: ok({ listaNegra: null }),
  impedimentoCargosPublicos: { status: "faltante", data: null },
  sercop: { status: "faltante", data: null },
});
let ultimoCrudo: Record<string, unknown> = {};
function derivar(cambios: Record<string, unknown> = {}) {
  ultimoCrudo = { ...base(), ...cambios };
  return derivarHechos(ultimoCrudo, contexto);
}
const hecho = (doc: ReturnType<typeof derivarHechos>, codigo: string): Hecho => doc.hechos.find((h) => h.codigo === codigo)!;
const perfilDelCrudo = () => buildStandardProfile(ultimoCrudo as never, CEDULA).profile.cumplimiento;
const codigos = (doc: ReturnType<typeof derivarHechos>) => controlesDesdeHechos(doc).map((h) => `${h.code}${h.bloqueante ? "*" : ""}`);
const retencion = { notificacion: "ORDEN DE RETENCION", enteEmisor: "JUZGADO INVENTADO" };
const certificacion = { notificacion: "CERTIFICACION", enteEmisor: "FISCALIA INVENTADA" };

Deno.test("cero campos sin procedencia: todo campo de cumplimiento tiene su código", () => {
  const texto = Deno.readTextFileSync(new URL("../../types.ts", import.meta.url));
  const desde = texto.indexOf("  cumplimiento: {");
  const hasta = texto.indexOf("\n  };", desde);
  const campos = [...texto.slice(desde, hasta).matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]).filter((c) => c !== "camposSinDato");
  assertEquals(campos.length, 9);
  const conCodigo = new Set(CATALOGO.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil] : [])));
  assertEquals(campos.filter((c) => !conCodigo.has(`cumplimiento.${c}`)), []);
});

Deno.test("sin coincidencias no hay hallazgos, y el perfil es el de siempre", () => {
  const doc = derivar();
  assertEquals(controlesDesdeHechos(doc), []);
  assertEquals(perfilDesdeHechos(doc, "cumplimiento"), {
    enListaControl: false, tieneProvidenciaDeCertificacion: false, tieneHomonimoEnListaControl: false, enListaNegra: false,
    impedimentoCargosPublicos: false, causalImpedimento: null, registraSercopContraloria: false, esPersonaExpuestaPoliticamente: false, detallePep: null,
  });
  assertEquals(perfilDesdeHechos(doc, "cumplimiento"), perfilDelCrudo());
});

Deno.test("las listas del proveedor bloquean todas (D7); homónimos y providencias de certificación se descartan con su motivo", () => {
  const doc = derivar({
    listasControl: listas({
      ofacsOpr: [{ nombre: "INVENTADO UNO" }],
      providenciasOpr: [retencion, certificacion],
      homonimosOpr: [{ nombre: "INVENTADO DOS", identificacion: "0100000001" }],
    }),
  });
  const h = hecho(doc, "cum.listas.registros.cantidad");
  assertEquals(h.valor, 2);
  assertEquals(h.registros.map((r) => `${r.lista}#${r.indice}`), ["ofacsOpr#0", "providenciasOpr#0"]);
  assertEquals((h.descartados ?? []).map((d) => `${d.registro.lista}#${d.registro.indice}:${d.motivo}`), ["providenciasOpr#1:providencia_de_certificacion", "homonimosOpr#0:homonimo_de_otra_persona"]);
  assertEquals(codigos(doc), ["lista_control*", "homonimo_en_lista_control", "providencia_certificacion"]);
  const hallazgos = controlesDesdeHechos(doc);
  assertEquals(hallazgos[0].message, "Aparece en 2 registro(s) de listas de control (OFAC/providencias)");
  assertEquals(hallazgos[1].message, "Aparece 1 homónimo(s) (mismo nombre, cédula distinta: 0100000001) en listas de control — no es el cliente, requiere revisión manual si se sospecha relación");
  assertEquals(hallazgos[2].salidaMaxima, "revisar");
  assertEquals(perfilDesdeHechos(doc, "cumplimiento"), perfilDelCrudo());
  // El resultado entero del control es el de los hechos.
  assertEquals(evaluarControlesBloqueo(ultimoCrudo as never, CEDULA).hallazgos.map((x) => x.code), ["lista_control", "homonimo_en_lista_control", "providencia_certificacion"]);
});

Deno.test("las listas internas bloquean y el perfil nunca las contó: lista, registro suelto y providencia de retención", () => {
  const doc = derivar({
    basesInternas: internas({ tofac: [{ nombre: "A" }], tconsepvinculados: { nombre: "suelto" }, tprovidencias: [retencion, certificacion] }),
  });
  assertEquals(hecho(doc, "cum.listas_internas.registros.cantidad").valor, 3);
  assertEquals(codigos(doc), ["listas_control_interno*", "providencia_certificacion"]);
  assertEquals(controlesDesdeHechos(doc)[0].message, "Aparece en 3 registro(s) de listas internas de control (OFAC/CONSEP/providencias)");
  assertEquals(perfilDesdeHechos(doc, "cumplimiento").enListaControl, false);
  assertEquals(perfilDesdeHechos(doc, "cumplimiento").tieneProvidenciaDeCertificacion, true);
  // `tprovidencias` suelta (no es una lista): cuenta como una, y sin tipo legible bloquea.
  const suelta = derivar({ basesInternas: internas({ tprovidencias: { enteEmisor: "X" } }) });
  assertEquals(hecho(suelta, "cum.listas_internas.registros.cantidad").valor, 1);
});

Deno.test("la lista negra, el fallecido y la cédula inconsistente salen de la identidad y de su fuente", () => {
  assertEquals(codigos(derivar({ listaNegra: ok({ listaNegra: { idListaNegra: 1 } }) })), ["lista_negra*"]);
  assertEquals(codigos(derivar({ general: ok({ personaNatural: { identificacion: CEDULA, fechaDefuncion: "2024-01-01" } }) })), ["fallecido*"]);
  assertEquals(codigos(derivar({ general: ok({ personaNatural: { identificacion: CEDULA, informacionAdicional: "persona fallecida" } }) })), ["fallecido*"]);
  const otra = derivar({ general: ok({ personaNatural: { identificacion: "1111111111" } }) });
  assertEquals(codigos(otra), ["cedula_inconsistente"]);
  assertEquals(controlesDesdeHechos(otra)[0].message, `La cédula de la fuente de identidad (1111111111) no coincide con la cédula consultada (${CEDULA})`);
});

Deno.test("PEP: las dos fuentes se suman sin unir, manda el registro más reciente, y el mismo cargo y fecha en las dos queda dicho", () => {
  const doc = derivar({
    listasControl: listas({ personaPublicasOpr: [{ cargo: "ALCALDE INVENTADO", empresa: "MUNICIPIO INVENTADO", sueldo: 3000, fecha: "2020-01-01" }] }),
    basesInternas: internas({
      tpeps: [
        { cargo: "ALCALDE INVENTADO", empresaSector: "MUNICIPIO INVENTADO", sueldo: "3000", fecha: "2020-01-01" },
        { cargo: "CONCEJAL INVENTADO", empresa: "CONCEJO INVENTADO", fecha: "2022-05-05" },
      ],
    }),
  });
  assertEquals(hecho(doc, "cum.pep.cantidad").valor, 3);
  assertEquals(hecho(doc, "cum.pep.detalle").valor, { cargo: "CONCEJAL INVENTADO", empresa: "CONCEJO INVENTADO", sueldo: null, fecha: "2022-05-05" });
  assertEquals(hecho(doc, "cum.pep.detalle").registros.map((r) => `${r.lista}#${r.indice}`), ["tpeps#1"]);
  assertEquals(doc.diferencias.filter((d) => d.codigo === "dif.cum.pep.repetido").length, 1);
  assertEquals(codigos(doc), ["pep"]);
  assertEquals(perfilDesdeHechos(doc, "cumplimiento"), perfilDelCrudo());
  // Una sola fuente, o cargos distintos: nada que decir.
  const una = derivar({ listasControl: listas({ personaPublicasOpr: [{ cargo: "X", fecha: "2020-01-01" }] }), basesInternas: internas({ tpeps: [{ cargo: "Y", fecha: "2020-01-01" }] }) });
  assertEquals(una.diferencias.length, 0);
});

Deno.test("impedimento y SERCOP: el «faltante» es su «no hay»; un error los deja sin dato; ninguno bloquea", () => {
  const con = derivar({
    impedimentoCargosPublicos: ok({ estado: {}, data: [{ registraImpedimento: true, causales: [{ causal: "CAUSAL INVENTADA" }] }] }),
    sercop: ok({ estado: {}, data: { contraloria: { registros: [{ x: 1 }] }, sercop: { registros: [] } } }),
  });
  assertEquals([hecho(con, "cum.impedimento.existe").valor, hecho(con, "cum.impedimento.causal").valor, hecho(con, "cum.sercop.registra").valor], [true, "CAUSAL INVENTADA", true]);
  assertEquals(controlesDesdeHechos(con), []);
  assertEquals(perfilDesdeHechos(con, "cumplimiento"), perfilDelCrudo());
  const faltante = derivar();
  assertEquals([hecho(faltante, "cum.impedimento.existe").motivo, hecho(faltante, "cum.sercop.registra").motivo], [undefined, undefined]);
  const error = derivar({ impedimentoCargosPublicos: caida, sercop: caida });
  assertEquals(perfilDesdeHechos(error, "cumplimiento").camposSinDato, { impedimentoCargosPublicos: false, causalImpedimento: null, registraSercopContraloria: false });
});

// Una fuente caída no bloquea ni desbloquea a nadie: el control lee el parcial (lo que dicen las que contestaron).
Deno.test("fuente caída: listasControl sin respuesta deja sin dato lo suyo, y lo que bloquea en otra fuente sigue bloqueando", () => {
  const doc = derivar({
    listasControl: caida,
    basesInternas: internas({ tofac: [{ nombre: "A" }], tpeps: [{ cargo: "X", fecha: "2020-01-01" }] }),
  });
  const lista = hecho(doc, "cum.listas.en_lista_control");
  assertEquals([lista.valor, lista.calidad, lista.motivo, lista.parcial], [null, "no_disponible", "fuente_sin_respuesta", false]);
  // El PEP lee las dos fuentes: la caída deja el campo sin dato, y el parcial trae el de basesInternas.
  assertEquals([hecho(doc, "cum.pep.existe").valor, hecho(doc, "cum.pep.existe").parcial], [null, true]);
  // La lista interna contestó: sigue bloqueando. Sin evidencia en la caída, no sale lista_control.
  assertEquals(codigos(doc), ["listas_control_interno*", "pep"]);
  const perfil = perfilDesdeHechos(doc, "cumplimiento");
  assertEquals(perfil.enListaControl, null);
  assertEquals((perfil.camposSinDato as Record<string, unknown>).enListaControl, false);
  assertEquals((perfil.camposSinDato as Record<string, unknown>).esPersonaExpuestaPoliticamente, true);
  assertEquals(evaluarControlesBloqueo(ultimoCrudo as never, CEDULA).hallazgos.map((h) => h.code), ["listas_control_interno", "pep"]);
});

Deno.test("fuente caída: sin evidencia en las que contestaron no sale hallazgo, y nadie queda bloqueado por lo que no se pudo mirar", () => {
  for (const cambios of [{ listasControl: caida }, { basesInternas: caida }, { listaNegra: caida }, { general: caida }]) {
    const doc = derivar(cambios);
    assertEquals(controlesDesdeHechos(doc), []);
    assertEquals(evaluarControlesBloqueo(ultimoCrudo as never, CEDULA).bloqueado, false);
  }
  // Una caída de listaNegra no borra un OFAC que sí contestó.
  const doc = derivar({ listaNegra: caida, listasControl: listas({ ofacsOpr: [{ nombre: "A" }] }) });
  assertEquals(codigos(doc), ["lista_control*"]);
});

Deno.test("deshabilitada no es caída: el motivo lo dice", () => {
  const doc = derivar({ listaNegra: { status: "deshabilitado", data: null } });
  assertEquals(hecho(doc, "cum.lista_negra.existe").motivo, "fuente_deshabilitada");
});

Deno.test("el control corta si un hecho que necesita no se emitió (no se lee como «no hay»)", () => {
  const doc = derivar();
  const incompleto = { ...doc, hechos: doc.hechos.filter((h) => h.codigo !== "cum.listas.registros.cantidad") };
  let error = "";
  try { controlesDesdeHechos(incompleto); } catch (e) { error = (e as Error).message; }
  assertEquals(error.includes("cum.listas.registros.cantidad"), true);
});
