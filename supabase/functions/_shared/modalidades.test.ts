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
  assert(!sinCondiciones.ok && sinCondiciones.errores[0].includes("monto y plazo"));

  const tasaAlta = validarPedidoDeSolicitud({ modalidad: "plus", solicitudDeCredito: { ...condiciones, tasaNominalAnualPorcentaje: 16 } });
  assert(!tasaAlta.ok && tasaAlta.errores.includes("La tasa no puede ser mayor que la Tasa máxima del producto (15,6%)."));

  const pro = validarPedidoDeSolicitud({ modalidad: "pro", solicitudDeCredito: { ...condiciones, ingresoDeclarado: 1800 } });
  assert(pro.ok);
  if (pro.ok) {
    assertEquals(pro.pedido.condiciones?.sistema, "frances");
    assertEquals(pro.pedido.condiciones?.desgravamen, { tasaPorcentaje: 0.6, periodicidad: "anual", base: "saldo" });
    assertEquals(pro.pedido.ingresoDeclarado, 1800);
  }
});

Deno.test("una modalidad desconocida o un Ingreso declarado que no es número se rechazan", () => {
  assertEquals(validarPedidoDeSolicitud({ modalidad: "premium" }).ok, false);
  assertEquals(validarPedidoDeSolicitud({ modalidad: "basico", solicitudDeCredito: { ingresoDeclarado: "mil" } }).ok, false);
  const cero = validarPedidoDeSolicitud({ modalidad: "basico", solicitudDeCredito: { ingresoDeclarado: 0 } });
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
  const r = validarPedidoDeSolicitud({ modalidad: "pro", solicitudDeCredito: { ...condiciones, tasaNominalAnualPorcentaje: 50, tasaNominalMaximaPorcentaje: 99 } });
  assert(!r.ok && r.errores.includes("La tasa no puede ser mayor que la Tasa máxima del producto (15,6%)."));
  const ok = validarPedidoDeSolicitud({ modalidad: "pro", solicitudDeCredito: { ...condiciones, tasaNominalMaximaPorcentaje: 99 } });
  assert(ok.ok && !("tasaNominalMaximaPorcentaje" in (ok.pedido.condiciones ?? {})));
});

Deno.test("las condiciones mal armadas se rechazan con el mensaje del simulador, sin romper", () => {
  const malas: Array<Record<string, unknown>> = [
    { modalidad: "pro", solicitudDeCredito: [] },
    { modalidad: "pro", solicitudDeCredito: "5000" },
    { modalidad: "pro", solicitudDeCredito: { ...condiciones, monto: -1 } },
    { modalidad: "plus", solicitudDeCredito: { ...condiciones, plazoMeses: 481 } },
    { modalidad: "plus", solicitudDeCredito: { ...condiciones, sistema: "japones" } },
    { modalidad: "pro", solicitudDeCredito: { ...condiciones, desgravamen: { tasaPorcentaje: 0.6, periodicidad: "diaria", base: "saldo" } } },
    { modalidad: "pro", solicitudDeCredito: { ...condiciones, tasaNominalAnualPorcentaje: -0.5 } },
  ];
  for (const cuerpo of malas) {
    const r = validarPedidoDeSolicitud(cuerpo);
    assert(!r.ok && r.errores.length > 0, JSON.stringify(cuerpo));
  }
  // Sin tasa se evalúa con la Tasa máxima, y se guarda la que se va a usar (negocio, 2026-10-19).
  const sinTasa = validarPedidoDeSolicitud({ modalidad: "pro", solicitudDeCredito: { monto: 1000, plazoMeses: 12 } });
  assert(sinTasa.ok && sinTasa.pedido.condiciones?.tasaNominalAnualPorcentaje === 15.6);
  const sinInteres = validarPedidoDeSolicitud({ modalidad: "pro", solicitudDeCredito: { monto: 1000, plazoMeses: 12, tasaNominalAnualPorcentaje: 0 } });
  assert(sinInteres.ok && sinInteres.pedido.condiciones?.tasaNominalAnualPorcentaje === 0);
  // El cuerpo no es un objeto: la validación responde, no lanza.
  assertEquals(validarPedidoDeSolicitud(null as unknown as Record<string, unknown>).ok, false);
  // Básico ignora las condiciones, también las malas.
  assertEquals(validarPedidoDeSolicitud({ modalidad: "basico", solicitudDeCredito: { monto: -1 } }).ok, true);
});

Deno.test("el Ingreso declarado: menos de medio centavo es no declarar; negativo, texto, booleano o desmedido se rechazan", () => {
  const con = (ingresoDeclarado: unknown) => validarPedidoDeSolicitud({ modalidad: "basico", solicitudDeCredito: { ingresoDeclarado } });
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

Deno.test("un paso que pudo dejar algo en vuelo no se reintenta hasta que pasó la espera", () => {
  const ahora = new Date("2026-10-18T12:00:00Z");
  let pasos = marcarPaso(pasosIniciales("plus"), "perfil", "hecho", undefined, ahora);
  pasos = marcarFallido(pasos, "buro", "Equifax no completó la consulta.", "buro_no_disponible", PASO_CAIDO_MS, ahora);
  assertEquals(pasos[1].reintentarDesde, new Date(ahora.getTime() + PASO_CAIDO_MS).toISOString());
  assertEquals(reintentarPasos(pasos, new Date(ahora.getTime() + 60_000)), pasos);
  const despues = reintentarPasos(pasos, new Date(ahora.getTime() + PASO_CAIDO_MS + 1));
  assertEquals(despues[1], { paso: "buro", estado: "pendiente" });
  // Sin espera, se reintenta en el momento.
  const sinEspera = marcarFallido(pasosIniciales("pro"), "perfil", "Las fuentes no respondieron.", "fuentes_no_disponibles", 0, ahora);
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

// --- Datos de la especificación de la API (135, negocio 2026-10-19) ------------

Deno.test("el Ingreso declarado y las condiciones se leen dentro de solicitudDeCredito, no de la raíz", () => {
  // La forma anterior (condiciones en `solicitud`, ingreso en la raíz) ya no se lee:
  // una IFI que manda lo que dice la especificación no puede quedar sin ingreso declarado.
  const vieja = validarPedidoDeSolicitud({ modalidad: "pro", solicitud: condiciones, ingresoDeclarado: 1800 });
  assert(!vieja.ok && vieja.errores[0].includes("monto y plazo"));
  const raiz = validarPedidoDeSolicitud({ modalidad: "basico", ingresoDeclarado: 1800 });
  assert(raiz.ok && raiz.pedido.ingresoDeclarado === null);
  const nueva = validarPedidoDeSolicitud({ modalidad: "plus", solicitudDeCredito: { ...condiciones, ingresoDeclarado: 1800 } });
  assert(nueva.ok && nueva.pedido.ingresoDeclarado === 1800);
  // En Básico las condiciones no se exigen, pero el Ingreso declarado que viene se guarda.
  const basico = validarPedidoDeSolicitud({ modalidad: "basico", solicitudDeCredito: { ingresoDeclarado: 900 } });
  assert(basico.ok && basico.pedido.ingresoDeclarado === 900 && basico.pedido.condiciones === null);
});

Deno.test("los datos de la API viajan en el pedido, y un error de ellos lo rechaza con su mensaje", () => {
  const ahora = new Date("2026-10-19T12:00:00Z");
  const huella = `sha256:${"a1".repeat(32)}`;
  const completo = validarPedidoDeSolicitud(
    {
      modalidad: "pro",
      solicitudDeCredito: condiciones,
      autorizacion: { id: "AUT-1", otorgadaEl: "2026-10-19T09:00:00-05:00", canal: "firma_electronica", finalidad: "evaluacion_de_credito", huellaDelDocumento: huella },
      referencia: "SOL-2026-1",
      operador: { id: "op-7", agencia: "Matriz" },
      prioridad: "diferida",
    },
    ahora,
  );
  assert(completo.ok);
  if (completo.ok) {
    assertEquals(completo.pedido.datos.referencia, "SOL-2026-1");
    assertEquals(completo.pedido.datos.operador, { id: "op-7", agencia: "Matriz" });
    assertEquals(completo.pedido.datos.prioridad, "diferida");
    assertEquals(completo.pedido.datos.autorizacion?.huellaDelDocumento, huella);
  }
  // Sin ninguno: todos null (la pantalla del analista no los manda).
  const vacio = validarPedidoDeSolicitud({ modalidad: "basico" }, ahora);
  assert(vacio.ok && vacio.pedido.datos.autorizacion === null && vacio.pedido.datos.referencia === null && vacio.pedido.datos.reemplazaA === null);
  // Un error de los datos se suma a los de las condiciones.
  const mal = validarPedidoDeSolicitud({ modalidad: "pro", solicitudDeCredito: { ...condiciones, monto: -1 }, prioridad: "urgente" }, ahora);
  assert(!mal.ok && mal.errores.length === 2);
});

Deno.test("un fallo lleva el código de la especificación de la API, sacado del estado y del motivo", () => {
  const codigo = (...a: Parameters<typeof falloDeUnPaso>) => falloDeUnPaso(...a).codigo;
  // El buró: quién puede consultar, el tope, la disponibilidad y la identificación.
  assertEquals(codigo("buro", 403), "buro_requiere_consulta_previa");
  assertEquals(codigo("buro", 429, "tope_diario"), "tope_diario_agotado");
  assertEquals(codigo("buro", 503, "proveedor_apagado"), "buro_no_disponible");
  assertEquals(codigo("buro", 503, "consumo_no_medible"), "buro_no_disponible");
  assertEquals(codigo("buro", 400), "identificacion_no_encontrada");
  assertEquals(codigo("buro", 502, "otra_persona"), "buro_no_disponible");
  assertEquals(codigo("buro", 0), "buro_no_disponible");
  assertEquals(codigo("buro", 504, "fallo"), "buro_no_disponible");
  // El perfil: la fuente no la encuentra, o no contestó.
  assertEquals(codigo("perfil", 404), "identificacion_no_encontrada");
  assertEquals(codigo("perfil", 503), "fuentes_no_disponibles");
  assertEquals(codigo("perfil", 0), "fuentes_no_disponibles");
  // Lo nuestro, y el modelo, son errores internos.
  assertEquals(codigo("perfil", 500), "error_interno");
  assertEquals(codigo("analisis", 500), "error_interno");
  assertEquals(codigo("analisis", 0), "error_interno");
  assertEquals(codigo("capacidad", 401), "error_interno");
  // Los códigos son un conjunto cerrado: los de la especificación, menos plazo_vencido (de la cola).
  const permitidos = ["fuentes_no_disponibles", "buro_requiere_consulta_previa", "tope_diario_agotado", "buro_no_disponible", "identificacion_no_encontrada", "error_interno"];
  for (const paso of ["perfil", "buro", "analisis", "capacidad"] as const) {
    for (const status of [0, 400, 401, 403, 404, 429, 500, 502, 503, 504]) {
      for (const motivo of [null, "tope_diario", "proveedor_apagado", "consumo_no_medible", "otra_persona", "fallo"]) {
        assert(permitidos.includes(falloDeUnPaso(paso, status, motivo).codigo), `${paso} ${status} ${motivo}`);
      }
    }
  }
});

Deno.test("la solicitud guarda el código junto al paso fallido, y reintentar lo borra con el detalle", () => {
  const ahora = new Date("2026-10-19T12:00:00Z");
  const f = falloDeUnPaso("buro", 429, "tope_diario");
  const pasos = marcarFallido(pasosIniciales("plus"), "buro", f.detalle, f.codigo, f.esperarMs, ahora);
  assertEquals(pasos[1], { paso: "buro", estado: "fallido", el: ahora.toISOString(), detalle: f.detalle, codigo: "tope_diario_agotado" });
  // Los pasos que no fallaron no llevan código.
  assertEquals(pasos.filter((p) => "codigo" in p).length, 1);
  // Con espera, el código y la fecha de reintento conviven.
  const conEspera = marcarFallido(pasosIniciales("plus"), "buro", "x", "buro_no_disponible", PASO_CAIDO_MS, ahora);
  assertEquals(conEspera[1].codigo, "buro_no_disponible");
  assert(conEspera[1].reintentarDesde);
  // Reintentar y terminar no arrastran el fallo anterior.
  const reintentado = reintentarPasos(conEspera, new Date(ahora.getTime() + PASO_CAIDO_MS + 1));
  assertEquals(reintentado[1], { paso: "buro", estado: "pendiente" });
  assertEquals("codigo" in marcarPaso(conEspera, "buro", "hecho")[1], false);
});
