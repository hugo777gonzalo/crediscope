// El estado de la persona desde sus solicitudes: qué hecho la mueve de un
// estado al siguiente y qué pasa cuando vuelve a pedir.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import {
  decisionesPosibles,
  estadoDeLaPersona,
  hechosDeLaFila,
  historialDeLaPersona,
  validarDecision,
} from "./estado-de-la-persona.ts";

const base = { id: "a", creada_el: "2026-10-18T10:00:00Z", estado: "en_evaluacion" };

Deno.test("sin solicitudes es Prospecto", () => {
  assertEquals(estadoDeLaPersona([]).estado, "prospecto");
});

Deno.test("una solicitud en evaluación, fallida o con el modelo en Revisar o Negar: En proceso", () => {
  assertEquals(estadoDeLaPersona([base]).estado, "con_solicitud");
  assertEquals(estadoDeLaPersona([{ ...base, estado: "fallida" }]).estado, "con_solicitud");
  assertEquals(estadoDeLaPersona([{ ...base, estado: "evaluada", recomendacion: "revisar" }]).estado, "con_solicitud");
  assertEquals(estadoDeLaPersona([{ ...base, estado: "evaluada", recomendacion: "negar" }]).estado, "con_solicitud");
});

Deno.test("Preaprobado sólo cuando la evaluación terminó y el modelo recomienda Aprobar", () => {
  const e = estadoDeLaPersona([{ ...base, estado: "evaluada", evaluada_el: "2026-10-18T10:02:00Z", recomendacion: "aprobar" }]);
  assertEquals(e, { estado: "preaprobado", desde: "2026-10-18T10:02:00Z", solicitudId: "a" });
  // La recomendación sola no alcanza: falta terminar la evaluación (Pro calcula la capacidad después).
  assertEquals(estadoDeLaPersona([{ ...base, recomendacion: "aprobar" }]).estado, "con_solicitud");
});

Deno.test("la decisión del analista manda: Aprobado, o No aprobado si rechazó o desistió", () => {
  const evaluada = { ...base, estado: "evaluada", evaluada_el: "2026-10-18T10:02:00Z", recomendacion: "negar" };
  assertEquals(estadoDeLaPersona([{ ...evaluada, decision: "aprobado", decidida_el: "2026-10-18T11:00:00Z" }]).estado, "aprobado");
  assertEquals(estadoDeLaPersona([{ ...evaluada, decision: "rechazado", decidida_el: "2026-10-18T11:00:00Z" }]).estado, "no_aprobado");
  assertEquals(estadoDeLaPersona([{ ...evaluada, decision: "desistido", decidida_el: "2026-10-18T11:00:00Z" }]).estado, "no_aprobado");
});

Deno.test("el historial pasa por cada estado en orden, con su fecha", () => {
  const h = historialDeLaPersona([
    { ...base, estado: "evaluada", evaluada_el: "2026-10-18T10:02:00Z", recomendacion: "aprobar", decision: "aprobado", decidida_el: "2026-10-18T11:00:00Z" },
  ]);
  assertEquals(h.map((c) => c.estado), ["prospecto", "con_solicitud", "preaprobado", "aprobado"]);
  assertEquals(h.map((c) => c.desde), [null, "2026-10-18T10:00:00Z", "2026-10-18T10:02:00Z", "2026-10-18T11:00:00Z"]);
});

Deno.test("quien desistió antes de que terminara la evaluación nunca estuvo Preaprobado", () => {
  const h = historialDeLaPersona([
    { ...base, estado: "evaluada", evaluada_el: "2026-10-18T10:05:00Z", recomendacion: "aprobar", decision: "desistido", decidida_el: "2026-10-18T10:01:00Z" },
  ]);
  assertEquals(h.map((c) => c.estado), ["prospecto", "con_solicitud", "no_aprobado"]);
});

Deno.test("manda la última solicitud: No aprobado que vuelve a pedir pasa a En proceso", () => {
  const vieja = { ...base, id: "v", estado: "evaluada", decision: "rechazado", decidida_el: "2026-09-01T00:00:00Z", creada_el: "2026-08-30T00:00:00Z" };
  const nueva = { ...base, id: "n" };
  // El orden en que llegan las filas no cambia nada.
  assertEquals(estadoDeLaPersona([nueva, vieja]), { estado: "con_solicitud", desde: base.creada_el, solicitudId: "n" });
  assertEquals(estadoDeLaPersona([vieja, nueva]).solicitudId, "n");
});

Deno.test("hechosDeLaFila lee la recomendación guardada en el resultado", () => {
  const f = hechosDeLaFila({ id: "x", creada_el: base.creada_el, estado: "evaluada", resultado: { analisis: { recomendacion: "aprobar" } } });
  assertEquals(f.recomendacion, "aprobar");
  assertEquals(f.decision, null);
});

Deno.test("aprobar o rechazar sólo con la evaluación terminada; desistir siempre; el motivo es obligatorio", () => {
  assertEquals(decisionesPosibles("evaluada"), ["aprobado", "rechazado", "desistido"]);
  assertEquals(decisionesPosibles("en_evaluacion"), ["desistido"]);
  assertEquals(validarDecision("aprobado", "Cumple la política de la institución.", "evaluada"), []);
  assertEquals(validarDecision("desistido", "La persona llamó y no sigue.", "fallida"), []);
  assertEquals(validarDecision("aprobado", "Cumple la política.", "en_evaluacion").length, 1);
  assertEquals(validarDecision("rechazado", "   ", "evaluada"), ["Escribí el motivo de la decisión."]);
  assertEquals(validarDecision("negado", "Por el buró.", "evaluada").length, 1);
  assertEquals(validarDecision("rechazado", "x".repeat(1001), "evaluada").length, 1);
});
