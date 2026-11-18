// E12 (R5): la providencia de certificación avisa y topa la salida en Revisar;
// la de retención y las listas de control siguen bloqueando.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { evaluarControlesBloqueo } from "./controles-bloqueo.ts";
import { filaDelAnalisis } from "./fila-del-analisis.ts";
import { esProvidenciaDeCertificacion } from "./providencias.ts";
import type { LlmScoringResult, RespuestaProveedorInfo1 } from "./types.ts";

const CEDULA = "0000000000";

function crudo(listasControl: Record<string, unknown>, basesInternas: Record<string, unknown> = {}): RespuestaProveedorInfo1 {
  return {
    general: { data: { personaNatural: { identificacion: CEDULA, nombre: "PERSONA DE PRUEBA" } } },
    listasControl: { data: listasControl },
    basesInternas: { data: basesInternas },
  } as unknown as RespuestaProveedorInfo1;
}

Deno.test("el tipo se lee aunque la ñ llegue mal codificada", () => {
  assertEquals(esProvidenciaDeCertificacion({ notificacion: "CERTIFICACI�N" }), true);
  assertEquals(esProvidenciaDeCertificacion({ notificacion: "Certificación" }), true);
  assertEquals(esProvidenciaDeCertificacion({ notificacion: "RETENCION" }), false);
  assertEquals(esProvidenciaDeCertificacion({}), false);
});

Deno.test("sólo certificación: no bloquea, avisa y topa en Revisar", () => {
  const r = evaluarControlesBloqueo(crudo({ providenciasOpr: [{ notificacion: "CERTIFICACIÓN" }] }), CEDULA);
  assertEquals(r.bloqueado, false);
  assertEquals(r.salidaMaxima, "revisar");
  assertEquals(r.hallazgos.map((h) => h.code), ["providencia_certificacion"]);
});

Deno.test("certificación en la base interna también avisa", () => {
  const r = evaluarControlesBloqueo(crudo({}, { tprovidencias: [{ notificacion: "CERTIFICACIÓN" }] }), CEDULA);
  assertEquals(r.bloqueado, false);
  assertEquals(r.salidaMaxima, "revisar");
});

Deno.test("una retención sigue bloqueando, y el tope no se anota", () => {
  const r = evaluarControlesBloqueo(
    crudo({ providenciasOpr: [{ notificacion: "CERTIFICACIÓN" }, { notificacion: "RETENCIÓN" }] }),
    CEDULA,
  );
  assertEquals(r.bloqueado, true);
  assertEquals(r.salidaMaxima, null);
});

Deno.test("una lista OFAC sigue bloqueando (D7)", () => {
  assertEquals(evaluarControlesBloqueo(crudo({ ofacsOpr: [{}] }), CEDULA).bloqueado, true);
});

Deno.test("la fila: aprobar pasa a revisar con el tope, y el resto no cambia", () => {
  const modelo = (recomendacion: LlmScoringResult["recomendacion"]) => ({
    score: 700,
    recomendacion,
    accionesSugeridas: [],
    indicadorRiesgo: "bajo",
    indicadorHistorial: "bueno",
    positives: [],
    negatives: [],
    missingInfo: [],
    reasoning: "x",
  }) as unknown as LlmScoringResult;
  const control = { bloqueado: false, hallazgos: [], salidaMaxima: "revisar" as const };
  const fila = (rec: LlmScoringResult["recomendacion"]) =>
    filaDelAnalisis({ runId: "r", clientId: "c", clientProfileId: "p", marcoVersion: "m", llmResult: modelo(rec), controlBloqueo: control, duracionIngestaMs: 1, duracionLlmMs: 1 });
  assertEquals(fila("aprobar").recomendacion, "revisar");
  assertEquals(fila("negar").recomendacion, "negar");
  assertEquals(fila("aprobar").crediscope_score, 700);
});
