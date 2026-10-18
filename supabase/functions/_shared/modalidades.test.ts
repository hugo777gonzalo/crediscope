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

// --- Revisión del 2026-10-18 -------------------------------------------------

Deno.test("un paso en curso sin fecha o con una que no se entiende se da por caído, no se traba para siempre", () => {
  const ahora = new Date("2026-10-18T12:00:00Z");
  const sinFecha = pasosIniciales("pro").map((p, i) => (i === 0 ? { paso: p.paso, estado: "en_curso" as const } : p));
  assertEquals(siguientePaso(sinFecha, ahora), "perfil");
  const fechaRota = pasosIniciales("pro").map((p, i) => (i === 0 ? { paso: p.paso, estado: "en_curso" as const, el: "ayer" } : p));
  assertEquals(siguientePaso(fechaRota, ahora), "perfil");
});

Deno.test("un paso en curso se da por caído pasados exactamente tres minutos y un milisegundo", () => {
  const ahora = new Date("2026-10-18T12:00:00Z");
  const enCurso = marcarPaso(pasosIniciales("basico"), "perfil", "en_curso", undefined, ahora);
  assertEquals(siguientePaso(enCurso, new Date(ahora.getTime() + PASO_CAIDO_MS)), null);
  assertEquals(siguientePaso(enCurso, new Date(ahora.getTime() + PASO_CAIDO_MS + 1)), "perfil");
});

Deno.test("un estado que no existe detiene la evaluación: no se saltea para correr el paso siguiente", () => {
  // El buró de Plus se cobra: no puede correr si el perfil quedó en un estado raro.
  const raro = [{ paso: "perfil", estado: "cancelado" }, { paso: "buro", estado: "pendiente" }] as unknown as Parameters<typeof siguientePaso>[0];
  assertEquals(siguientePaso(raro), null);
});

Deno.test("sin pasos no hay siguiente ni está todo hecho; un paso pendiente detrás de uno fallido no corre", () => {
  assertEquals(siguientePaso([]), null);
  assertEquals(todosHechos([]), false);
  const pasos = marcarPaso(pasosIniciales("plus"), "perfil", "fallido", "Novadata no contestó.");
  assertEquals(siguientePaso(pasos), null);
  assertEquals(todosHechos(pasos), false);
});

Deno.test("reintentar no toca lo hecho ni lo pendiente, no muta y repetirlo da lo mismo", () => {
  let pasos = marcarPaso(pasosIniciales("plus"), "perfil", "hecho", "ok");
  pasos = marcarPaso(pasos, "buro", "fallido", "Equifax no contestó.");
  const copia = structuredClone(pasos);
  const otraVez = reintentarPasos(pasos);
  assertEquals(pasos, copia);
  assertEquals(otraVez.map((p) => p.estado), ["hecho", "pendiente", "pendiente", "pendiente"]);
  assertEquals(otraVez[0], pasos[0]);
  assertEquals(reintentarPasos(otraVez), otraVez);
  // Sin nada fallido queda igual.
  assertEquals(reintentarPasos(pasosIniciales("pro")), pasosIniciales("pro"));
});

Deno.test("marcarPaso no muta los pasos, ignora un paso que la modalidad no tiene y no arrastra el detalle anterior", () => {
  const ahora = new Date("2026-10-18T12:00:00Z");
  const pasos = pasosIniciales("basico");
  assertEquals(marcarPaso(pasos, "capacidad", "hecho"), pasos);
  assertEquals(pasos.map((p) => p.estado), ["pendiente", "pendiente"]);
  const fallido = marcarPaso(pasos, "perfil", "fallido", "Se cayó.", ahora);
  const hecho = marcarPaso(fallido, "perfil", "hecho", undefined, ahora);
  assertEquals(hecho[0], { paso: "perfil", estado: "hecho", el: "2026-10-18T12:00:00.000Z" });
});

Deno.test("la tasa máxima del cuerpo no se acepta: se valida lo que se guarda", () => {
  // Antes, un `tasaNominalMaximaPorcentaje` de 99 dejaba pasar una tasa de 50%
  // que el paso de capacidad rechazaba después, con la solicitud ya creada.
  const r = validarPedidoDeSolicitud({ modalidad: "pro", solicitud: { ...condiciones, tasaNominalAnualPorcentaje: 50, tasaNominalMaximaPorcentaje: 99 } });
  assert(!r.ok && r.errores.includes("La tasa supera la máxima del producto."));
  const ok = validarPedidoDeSolicitud({ modalidad: "pro", solicitud: { ...condiciones, tasaNominalMaximaPorcentaje: 99 } });
  assert(ok.ok && !("tasaNominalMaximaPorcentaje" in (ok.pedido.condiciones ?? {})));
});

Deno.test("las condiciones mal armadas se rechazan con el mensaje del simulador, sin romper", () => {
  const malas: Array<Record<string, unknown>> = [
    { modalidad: "pro", solicitud: [] },
    { modalidad: "pro", solicitud: "5000" },
    { modalidad: "pro", solicitud: { ...condiciones, monto: -1 } },
    { modalidad: "plus", solicitud: { ...condiciones, plazoMeses: 481 } },
    { modalidad: "plus", solicitud: { ...condiciones, sistema: "japones" } },
    { modalidad: "pro", solicitud: { ...condiciones, desgravamen: { tasaPorcentaje: 0.6, periodicidad: "diaria", base: "saldo" } } },
    { modalidad: "pro", solicitud: { monto: 1000, plazoMeses: 12 } },
  ];
  for (const cuerpo of malas) {
    const r = validarPedidoDeSolicitud(cuerpo);
    assert(!r.ok && r.errores.length > 0, JSON.stringify(cuerpo));
  }
  const sinTasa = validarPedidoDeSolicitud({ modalidad: "pro", solicitud: { monto: 1000, plazoMeses: 12 } });
  assert(!sinTasa.ok && sinTasa.errores.includes("La tasa tiene que ser un número."));
  // El cuerpo no es un objeto: la validación responde, no lanza.
  assertEquals(validarPedidoDeSolicitud(null as unknown as Record<string, unknown>).ok, false);
  // Básico ignora las condiciones, también las malas.
  assertEquals(validarPedidoDeSolicitud({ modalidad: "basico", solicitud: { monto: -1 } }).ok, true);
});

Deno.test("el Ingreso declarado: menos de medio centavo es no declarar; negativo, texto, booleano o desmedido se rechazan", () => {
  const con = (ingresoDeclarado: unknown) => validarPedidoDeSolicitud({ modalidad: "basico", ingresoDeclarado });
  const chico = con(0.004);
  assert(chico.ok && chico.pedido.ingresoDeclarado === null);
  const redondeado = con(1234.567);
  assert(redondeado.ok && redondeado.pedido.ingresoDeclarado === 1234.57);
  for (const [valor, texto] of [[-1, "dólares por mes"], ["1800", "dólares por mes"], [true, "dólares por mes"], [2e9, "no puede pasar"]] as const) {
    const r = con(valor);
    assert(!r.ok && r.errores[0].includes(texto), String(valor));
  }
  for (const vacio of [undefined, null, ""]) {
    const r = con(vacio);
    assert(r.ok && r.pedido.ingresoDeclarado === null);
  }
});

Deno.test("del análisis se guarda el score, la recomendación y la versión del marco, no el razonamiento", () => {
  const r = resumenDelAnalisis({ id: "a1", crediscope_score: 640, recomendacion: "revisar", veredicto_origen: "modelo", indicador_riesgo: "moderado", rules_version: "marco-v30", narrative_summary: "largo" });
  assertEquals(r, { analisisId: "a1", score: 640, recomendacion: "revisar", veredictoOrigen: "modelo", indicadorRiesgo: "moderado", marco: "marco-v30" });
});
