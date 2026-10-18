// Las modalidades: qué pasos corre cada una, qué exige, y cómo se avanza un
// paso sin repetirlo ni saltearlo.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assert } from "jsr:@std/assert@1";
import {
  marcarPaso,
  MODALIDADES,
  pasosIniciales,
  PASO_CAIDO_MS,
  reintentarPasos,
  resumenDelAnalisis,
  siguientePaso,
  todosHechos,
  validarPedidoDeSolicitud,
} from "./modalidades.ts";

const condiciones = { monto: 5000, plazoMeses: 36, tasaNominalAnualPorcentaje: 15 };

Deno.test("cada modalidad corre sus pasos, y Plus es la única con buró", () => {
  assertEquals(MODALIDADES.basico.pasos, ["perfil", "analisis"]);
  assertEquals(MODALIDADES.pro.pasos, ["perfil", "analisis", "capacidad"]);
  assertEquals(MODALIDADES.plus.pasos, ["perfil", "buro", "analisis", "capacidad"]);
  assert(!MODALIDADES.basico.exigeCondiciones && MODALIDADES.pro.exigeCondiciones && MODALIDADES.plus.exigeCondiciones);
});

Deno.test("se avanza en orden, un paso a la vez, hasta terminar", () => {
  let pasos = pasosIniciales("plus");
  const corridos: string[] = [];
  for (let i = 0; i < 10; i++) {
    const p = siguientePaso(pasos);
    if (!p) break;
    corridos.push(p);
    pasos = marcarPaso(pasos, p, "hecho", "ok");
  }
  assertEquals(corridos, ["perfil", "buro", "analisis", "capacidad"]);
  assert(todosHechos(pasos));
  assertEquals(siguientePaso(pasos), null);
});

Deno.test("un paso en curso no se vuelve a tomar, salvo que haya quedado caído", () => {
  const ahora = new Date("2026-10-17T12:00:00Z");
  const enCurso = marcarPaso(pasosIniciales("pro"), "perfil", "en_curso", undefined, ahora);
  assertEquals(siguientePaso(enCurso, new Date(ahora.getTime() + 60_000)), null);
  assertEquals(siguientePaso(enCurso, new Date(ahora.getTime() + PASO_CAIDO_MS + 1)), "perfil");
});

Deno.test("un paso fallido detiene la evaluación; reintentar repite sólo ése", () => {
  let pasos = marcarPaso(pasosIniciales("pro"), "perfil", "hecho");
  pasos = marcarPaso(pasos, "analisis", "fallido", "El modelo no contestó.");
  assertEquals(siguientePaso(pasos), null);
  assertEquals(pasos[1].detalle, "El modelo no contestó.");
  const otraVez = reintentarPasos(pasos);
  assertEquals(otraVez.map((p) => p.estado), ["hecho", "pendiente", "pendiente"]);
  assertEquals(siguientePaso(otraVez), "analisis");
});

Deno.test("Básico no pide condiciones; Pro y Plus sí, y las valida con el simulador", () => {
  const basico = validarPedidoDeSolicitud({ modalidad: "basico" });
  assert(basico.ok && basico.pedido.condiciones === null);

  const sinCondiciones = validarPedidoDeSolicitud({ modalidad: "pro" });
  assert(!sinCondiciones.ok && sinCondiciones.errores[0].includes("monto, plazo y tasa"));

  const tasaAlta = validarPedidoDeSolicitud({ modalidad: "plus", solicitud: { ...condiciones, tasaNominalAnualPorcentaje: 16 } });
  assert(!tasaAlta.ok && tasaAlta.errores.includes("La tasa supera la máxima del producto."));

  const pro = validarPedidoDeSolicitud({ modalidad: "pro", solicitud: condiciones, ingresoDeclarado: 1800 });
  assert(pro.ok);
  if (pro.ok) {
    assertEquals(pro.pedido.condiciones?.sistema, "frances");
    assertEquals(pro.pedido.condiciones?.desgravamen, { tasaPorcentaje: 0.6, periodicidad: "anual", base: "saldo" });
    assertEquals(pro.pedido.ingresoDeclarado, 1800);
  }
});

Deno.test("una modalidad desconocida o un Ingreso declarado que no es número se rechazan", () => {
  assertEquals(validarPedidoDeSolicitud({ modalidad: "premium" }).ok, false);
  assertEquals(validarPedidoDeSolicitud({ modalidad: "basico", ingresoDeclarado: "mil" }).ok, false);
  const cero = validarPedidoDeSolicitud({ modalidad: "basico", ingresoDeclarado: 0 });
  assert(cero.ok && cero.pedido.ingresoDeclarado === null);
});

Deno.test("del análisis se guarda el score, la recomendación y la versión del marco, no el razonamiento", () => {
  const r = resumenDelAnalisis({ id: "a1", crediscope_score: 640, recomendacion: "revisar", veredicto_origen: "modelo", indicador_riesgo: "moderado", rules_version: "marco-v30", narrative_summary: "largo" });
  assertEquals(r, { analisisId: "a1", score: 640, recomendacion: "revisar", veredictoOrigen: "modelo", indicadorRiesgo: "moderado", marco: "marco-v30" });
});
