// Las modalidades: qué pasos corre cada una, qué exige, y cómo se avanza un
// paso sin repetirlo ni saltearlo.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assert } from "jsr:@std/assert@1";
import {
  falloDeUnPaso,
  marcarFallido,
  marcarPaso,
  MODALIDADES,
  pasoEnCurso,
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

Deno.test("un paso que pudo dejar algo en vuelo no se reintenta hasta que pasó la espera", () => {
  const ahora = new Date("2026-10-18T12:00:00Z");
  let pasos = marcarPaso(pasosIniciales("plus"), "perfil", "hecho", undefined, ahora);
  pasos = marcarFallido(pasos, "buro", "Equifax no completó la consulta.", PASO_CAIDO_MS, ahora);
  assertEquals(pasos[1].reintentarDesde, new Date(ahora.getTime() + PASO_CAIDO_MS).toISOString());
  assertEquals(reintentarPasos(pasos, new Date(ahora.getTime() + 60_000)), pasos);
  const despues = reintentarPasos(pasos, new Date(ahora.getTime() + PASO_CAIDO_MS + 1));
  assertEquals(despues[1], { paso: "buro", estado: "pendiente" });
  // Sin espera, se reintenta en el momento.
  const sinEspera = marcarFallido(pasosIniciales("pro"), "perfil", "Las fuentes no respondieron.", 0, ahora);
  assertEquals(sinEspera[0].reintentarDesde, undefined);
  assertEquals(reintentarPasos(sinEspera, ahora)[0].estado, "pendiente");
});

Deno.test("el buró de otra solicitud cuenta como en curso sólo mientras no se dio por caído", () => {
  const ahora = new Date("2026-10-18T12:00:00Z");
  const pasos = marcarPaso(pasosIniciales("plus"), "buro", "en_curso", undefined, ahora);
  assert(pasoEnCurso(pasos, "buro", new Date(ahora.getTime() + 60_000)));
  assert(!pasoEnCurso(pasos, "buro", new Date(ahora.getTime() + PASO_CAIDO_MS + 1)));
  assert(!pasoEnCurso(pasos, "perfil", ahora));
  assert(!pasoEnCurso(pasosIniciales("pro"), "buro", ahora));
  assert(!pasoEnCurso(null, "buro", ahora));
});

Deno.test("un fallo se anota con un mensaje propio, y el del buró que pudo cobrarse pide esperar", () => {
  // Lo que no llegó a Equifax se reintenta en el momento.
  for (const [status, motivo] of [[403, null], [400, null], [429, "tope_diario"], [503, "proveedor_apagado"], [503, "consumo_no_medible"]] as const) {
    assertEquals(falloDeUnPaso("buro", status, motivo).esperarMs, 0, `${status} ${motivo}`);
  }
  // Lo que pudo salir hacia Equifax espera a que la función llamada termine.
  for (const [status, motivo] of [[0, null], [500, "no_se_pudo_guardar"], [502, "otra_persona"], [504, "fallo"], [503, "fallo"], [503, null]] as const) {
    const f = falloDeUnPaso("buro", status, motivo);
    assertEquals(f.esperarMs, PASO_CAIDO_MS, `${status} ${motivo}`);
    assert(/cobr/.test(f.detalle), f.detalle);
  }
  assert(/administrador/.test(falloDeUnPaso("buro", 403).detalle));
  // Novadata y el modelo: un corte de la espera también espera; lo demás no.
  assertEquals(falloDeUnPaso("perfil", 0).esperarMs, PASO_CAIDO_MS);
  assertEquals(falloDeUnPaso("analisis", 0).esperarMs, PASO_CAIDO_MS);
  assertEquals(falloDeUnPaso("perfil", 503).esperarMs, 0);
  assertEquals(falloDeUnPaso("analisis", 500).detalle, "El modelo no pudo analizar a la persona.");
  // Nunca una cifra de la persona en el mensaje: no hay de dónde sacarla.
  for (const paso of ["perfil", "buro", "analisis"] as const) {
    for (const status of [0, 400, 401, 403, 404, 429, 500, 502, 503, 504]) assert(!/\d{6,}/.test(falloDeUnPaso(paso, status).detalle));
  }
});
