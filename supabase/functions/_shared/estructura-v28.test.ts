// estructura-v28 (E7, etapa B de los grupos penal y de cumplimiento de la capa de hechos): riesgoPenal y
// cumplimiento salen de los hechos, el control de bloqueo toma de los mismos hechos todos sus hallazgos,
// y una fuente que no contestó deja el campo sin dato. Lo que se prueba:
//   - sin fuentes caídas el perfil es el de siempre y no lleva `camposSinDato`;
//   - con una fuente caída el campo es null, el grupo lo marca con el parcial, y el modelo y la capacidad
//     de pago leen lo de antes (campos-sin-dato.ts);
//   - el caso que lo motivó: con la fuente de denuncias caída, la tarjeta de «Riesgo Penal / Fiscalía» ya
//     no puede decir «sin denuncias»;
//   - el bloqueo no se mueve por una fuente caída.
// Todo valor es inventado: el repositorio es público.

import { assertEquals } from "jsr:@std/assert@1";
import { buildStandardProfile, PROCESS_VERSION } from "./process.ts";
import { evaluarControlesBloqueo } from "./controles-bloqueo.ts";
import { camposSinDato, conLosValoresDeAntes } from "./campos-sin-dato.ts";
import { armarPerfilDelModelo } from "./perfil-del-modelo.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

const CEDULA = "0000000000";
const ok = (data: unknown) => ({ status: "ok", data });
const caida = { status: "error", data: null };

function crudo(cambios: Record<string, unknown> = {}): RespuestaProveedorInfo1 {
  return {
    general: ok({ personaNatural: { identificacion: CEDULA, nombre: "PRUEBA FICTICIO UNO" } }),
    listasControl: ok({ ofacsOpr: [], providenciasOpr: [], homonimosOpr: [], personaPublicasOpr: [] }),
    basesInternas: ok({ tofac: [], tprovidencias: [], tconsephomonimos: [], tpeps: [] }),
    listaNegra: ok({ listaNegra: null }),
    impedimentoCargosPublicos: { status: "faltante", data: null },
    sercop: { status: "faltante", data: null },
    demandas: ok({ demandas: [] }),
    denuncias: ok({ denuncias: [] }),
    antecedentesPenales: ok({ antecedentes: { descripcion: "NO" } }),
    ...cambios,
  } as unknown as RespuestaProveedorInfo1;
}
const perfilDe = (raw: RespuestaProveedorInfo1) => buildStandardProfile(raw, CEDULA).profile;

Deno.test("la versión de la estructura es la v28", () => {
  assertEquals(PROCESS_VERSION, "estructura-v28");
});

Deno.test("sin fuentes caídas el perfil penal y el de cumplimiento no llevan la marca, y el orden de las claves es el de siempre", () => {
  const p = perfilDe(crudo());
  assertEquals("camposSinDato" in p.riesgoPenal, false);
  assertEquals("camposSinDato" in p.cumplimiento, false);
  assertEquals(Object.keys(p.riesgoPenal), ["tieneAntecedentesPenales", "descripcionAntecedentes", "numeroDenunciasComoSospechoso", "numeroDenunciasComoVictima"]);
  assertEquals(Object.keys(p.cumplimiento), [
    "enListaControl", "tieneProvidenciaDeCertificacion", "tieneHomonimoEnListaControl", "enListaNegra", "impedimentoCargosPublicos",
    "causalImpedimento", "registraSercopContraloria", "esPersonaExpuestaPoliticamente", "detallePep",
  ]);
  assertEquals(p.riesgoPenal, { tieneAntecedentesPenales: false, descripcionAntecedentes: null, numeroDenunciasComoSospechoso: 0, numeroDenunciasComoVictima: 0 });
});

// El caso de la sesión (2026-11-20, c-dfeb4f7c): `denuncias` en `faltante`.
Deno.test("denuncias en «faltante»: los dos campos de denuncias son null y quedan marcados, con el parcial", () => {
  const p = perfilDe(crudo({ denuncias: { status: "faltante", data: null } }));
  assertEquals([p.riesgoPenal.numeroDenunciasComoSospechoso, p.riesgoPenal.numeroDenunciasComoVictima], [null, null]);
  assertEquals(camposSinDato(p.riesgoPenal).sort(), ["numeroDenunciasComoSospechoso", "numeroDenunciasComoVictima"]);
  assertEquals(p.riesgoPenal.tieneAntecedentesPenales, false); // la otra fuente contestó
  // Lo mismo que dice la tarjeta de seguridad ciudadana: la fuente de denuncias no contestó.
  assertEquals(p.riesgoSeguridadCiudadana.tieneDelitoSeguridadCiudadana, null);
  assertEquals(camposSinDato(p.riesgoSeguridadCiudadana).length > 0, true);
});

Deno.test("el modelo y la capacidad de pago leen los valores de antes, byte a byte", () => {
  const p = perfilDe(crudo({ denuncias: caida, listasControl: caida, listaNegra: caida }));
  const leido = conLosValoresDeAntes(p);
  assertEquals(leido.riesgoPenal, { tieneAntecedentesPenales: false, descripcionAntecedentes: null, numeroDenunciasComoSospechoso: 0, numeroDenunciasComoVictima: 0 });
  assertEquals(leido.cumplimiento.enListaControl, false);
  assertEquals(leido.cumplimiento.enListaNegra, false);
  assertEquals("camposSinDato" in leido.cumplimiento, false);
  const delModelo = armarPerfilDelModelo(p as unknown as Record<string, unknown>) as unknown as Record<string, Record<string, unknown>>;
  assertEquals("camposSinDato" in delModelo.riesgoPenal, false);
  assertEquals("camposSinDato" in delModelo.cumplimiento, false);
  assertEquals(delModelo.riesgoPenal.numeroDenunciasComoSospechoso, 0);
  assertEquals(delModelo.cumplimiento.enListaControl, false);
});

// ---- El bloqueo, hallazgo por hallazgo ----

Deno.test("bloqueo: las listas caídas no bloquean ni dejan hallazgo, y no limpian a nadie", () => {
  for (const cambios of [{ listasControl: caida }, { basesInternas: caida }, { listaNegra: caida }, { general: caida }]) {
    const r = evaluarControlesBloqueo(crudo(cambios), CEDULA);
    assertEquals([r.bloqueado, r.hallazgos], [false, []]);
  }
});

Deno.test("bloqueo: lo que bloquea en una fuente que contestó sigue bloqueando con otra caída", () => {
  const r = evaluarControlesBloqueo(crudo({ listasControl: caida, basesInternas: ok({ tofac: [{ nombre: "A" }], tprovidencias: [], tconsephomonimos: [], tpeps: [] }) }), CEDULA);
  assertEquals([r.bloqueado, r.hallazgos.map((h) => h.code)], [true, ["listas_control_interno"]]);
  const negra = evaluarControlesBloqueo(crudo({ listasControl: caida, listaNegra: ok({ listaNegra: { idListaNegra: 1 } }) }), CEDULA);
  assertEquals([negra.bloqueado, negra.hallazgos.map((h) => h.code)], [true, ["lista_negra"]]);
});

Deno.test("bloqueo: el orden de los hallazgos y el tope de la salida son los de siempre", () => {
  const r = evaluarControlesBloqueo(crudo({
    general: ok({ personaNatural: { identificacion: "1111111111", fechaDefuncion: "2024-01-01" } }),
    listasControl: ok({ ofacsOpr: [{ n: 1 }], providenciasOpr: [{ notificacion: "CERTIFICACION" }], homonimosOpr: [{ identificacion: "0100000001" }], personaPublicasOpr: [{ cargo: "X", fecha: "2020-01-01" }] }),
    listaNegra: ok({ listaNegra: { id: 1 } }),
    antecedentesPenales: ok({ antecedentes: { descripcion: "EXTORSION" } }),
  }), CEDULA);
  assertEquals(r.hallazgos.map((h) => h.code), [
    "fallecido", "cedula_inconsistente", "lista_control", "lista_negra", "homonimo_en_lista_control", "providencia_certificacion", "pep", "delito_seguridad_ciudadana",
  ]);
  assertEquals([r.bloqueado, r.salidaMaxima], [true, null]); // un bloqueo manda sobre cualquier tope
  for (const h of r.hallazgos) assertEquals(Object.keys(h).every((k) => ["bloqueante", "code", "message", "salidaMaxima"].includes(k)), true); // sin `derivaDe`
  const soloTope = evaluarControlesBloqueo(crudo({ listasControl: ok({ ofacsOpr: [], providenciasOpr: [{ notificacion: "CERTIFICACION" }], homonimosOpr: [], personaPublicasOpr: [] }) }), CEDULA);
  assertEquals([soloTope.bloqueado, soloTope.salidaMaxima], [false, "revisar"]);
});
