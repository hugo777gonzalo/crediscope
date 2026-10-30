// La cola de las evaluaciones de la API: ids, estados y qué se anota después de
// cada paso. Las filas son inventadas.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import {
  despuesDeUnPaso,
  despuesDeUnPasoCortadoDemasiadasVeces,
  despuesDelPlazo,
  conElPlazoAplicado,
  GRACIA_DE_LECTURA_MS,
  esperaTrasFallo,
  estadoDeLaApi,
  etapaDeLaApi,
  type FilaDeLaCola,
  idDeLaEvaluacion,
  MAX_INTENTOS,
  plazoDeLaEvaluacion,
  PLAZO_DIFERIDA_MS,
  PLAZO_INTERACTIVA_MS,
  uuidDeLaEvaluacion,
} from "./cola-de-evaluaciones.ts";
import { type FalloDeUnPaso, pasosIniciales, type RegistroDePaso } from "./modalidades.ts";

const AHORA = new Date("2026-10-21T15:00:00.000Z");
const en = (ms: number) => new Date(AHORA.getTime() + ms);

function fila(cambios: Partial<FilaDeLaCola> = {}): FilaDeLaCola {
  return {
    id: "0192f0e3-8a1b-7c4d-9e5f-0123456789ab",
    estado: "en_evaluacion",
    prioridad: "interactiva",
    creada_el: AHORA.toISOString(),
    plazo_hasta: en(PLAZO_INTERACTIVA_MS).toISOString(),
    pasos: pasosIniciales("plus"),
    resultado: { version: "modalidades-v1" },
    intentos: 0,
    fallo_codigo: null,
    terminada_el: null,
    ...cambios,
  };
}

const fallo = (codigo: FalloDeUnPaso["codigo"], esperarMs = 0): FalloDeUnPaso => ({ detalle: `falló con ${codigo}`, codigo, esperarMs });

Deno.test("el id de la evaluación es ev_ y 26 caracteres de Crockford, y vuelve al uuid", () => {
  const uuid = "0192f0e3-8a1b-7c4d-9e5f-0123456789ab";
  const id = idDeLaEvaluacion(uuid);
  assert(/^ev_[0-9A-HJKMNP-TV-Z]{26}$/.test(id), id);
  assertEquals(uuidDeLaEvaluacion(id), uuid);
  // Los extremos: todo ceros y todo unos.
  assertEquals(uuidDeLaEvaluacion(idDeLaEvaluacion("00000000-0000-0000-0000-000000000000")), "00000000-0000-0000-0000-000000000000");
  assertEquals(uuidDeLaEvaluacion(idDeLaEvaluacion("ffffffff-ffff-ffff-ffff-ffffffffffff")), "ffffffff-ffff-ffff-ffff-ffffffffffff");
});

Deno.test("un id que no generó esta API no se acepta: otro formato, letras que Crockford no usa o más de 128 bits", () => {
  assert(uuidDeLaEvaluacion("ev_01JABCD2EFGH3JKMN4PQRS5TVW") !== null); // el ejemplo de la especificación sí se lee
  assertEquals(uuidDeLaEvaluacion("0192f0e3-8a1b-7c4d-9e5f-0123456789ab"), null);
  assertEquals(uuidDeLaEvaluacion("ev_01JABCD2EFGH3JKMN4PQRS5TV"), null); // 25 caracteres
  assertEquals(uuidDeLaEvaluacion("ev_01JABCD2EFGH3JKMN4PQRS5TVI"), null); // la I no existe
  assertEquals(uuidDeLaEvaluacion("ev_81JABCD2EFGH3JKMN4PQRS5TVW"), null); // el primer carácter pasa de 7: serían 129 bits
  assertEquals(uuidDeLaEvaluacion(undefined), null);
});

Deno.test("dos uuid distintos no dan el mismo id", () => {
  assertNotEquals(idDeLaEvaluacion("0192f0e3-8a1b-7c4d-9e5f-0123456789ab"), idDeLaEvaluacion("0192f0e3-8a1b-7c4d-9e5f-0123456789ac"));
});

Deno.test("el plazo es de 15 minutos si es interactiva y de 24 horas si es diferida", () => {
  assertEquals(plazoDeLaEvaluacion("interactiva", AHORA).getTime() - AHORA.getTime(), PLAZO_INTERACTIVA_MS);
  assertEquals(plazoDeLaEvaluacion("diferida", AHORA).getTime() - AHORA.getTime(), PLAZO_DIFERIDA_MS);
  assertEquals(plazoDeLaEvaluacion(null, AHORA).getTime() - AHORA.getTime(), PLAZO_INTERACTIVA_MS);
});

Deno.test("estado: recibida hasta que empieza, en proceso mientras avanza", () => {
  assertEquals(estadoDeLaApi(fila()), "recibida");
  const pasos = pasosIniciales("plus");
  pasos[0] = { paso: "perfil", estado: "en_curso", el: AHORA.toISOString() };
  assertEquals(estadoDeLaApi(fila({ pasos })), "en_proceso");
  // Un paso que falló y se reprogramó ya no es «recibida».
  assertEquals(estadoDeLaApi(fila({ intentos: 1 })), "en_proceso");
});

Deno.test("estado: completada, y fallida salvo que la fuente no conozca la identificación", () => {
  assertEquals(estadoDeLaApi(fila({ estado: "evaluada" })), "completada");
  const sinPersona = pasosIniciales("plus");
  sinPersona[0] = { paso: "perfil", estado: "fallido", codigo: "identificacion_no_encontrada" };
  assertEquals(estadoDeLaApi(fila({ estado: "fallida", pasos: sinPersona, fallo_codigo: "identificacion_no_encontrada" })), "persona_no_encontrada");
  // El buró que no acepta la identificación no dice que la persona no exista.
  const buro = pasosIniciales("plus");
  buro[0] = { paso: "perfil", estado: "hecho" };
  buro[1] = { paso: "buro", estado: "fallido", codigo: "identificacion_no_encontrada" };
  assertEquals(estadoDeLaApi(fila({ estado: "fallida", pasos: buro, fallo_codigo: "identificacion_no_encontrada" })), "fallida");
  assertEquals(estadoDeLaApi(fila({ estado: "fallida", pasos: buro, fallo_codigo: "error_interno" })), "fallida");
});

Deno.test("la etapa es la del paso en curso o, si no, la del que sigue", () => {
  assertEquals(etapaDeLaApi(fila()), "perfil");
  const pasos = pasosIniciales("plus");
  pasos[0] = { paso: "perfil", estado: "hecho" };
  pasos[1] = { paso: "buro", estado: "en_curso", el: AHORA.toISOString() };
  assertEquals(etapaDeLaApi(fila({ pasos }), AHORA), "buro");
});

Deno.test("un paso que termina bien deja la evaluación en proceso, con los intentos en cero y sin reclamo", () => {
  const c = despuesDeUnPaso(fila({ intentos: 2, pasos: pasosIniciales("plus") }), "perfil", { ok: true, cambios: { client_id: "c1" }, detalle: "Se consultó a la persona en Novadata.", resultado: { perfil: { reutilizado: false } } }, AHORA);
  assertEquals(c.estado, "en_evaluacion");
  assertEquals(c.intentos, 0);
  assertEquals(c.reclamada_hasta, null);
  assertEquals(c.proximo_intento_el, null);
  assertEquals(c.client_id, "c1");
  assertEquals((c.resultado as Record<string, unknown>).perfil, { reutilizado: false });
  // Lo que ya tenía el resultado se conserva.
  assertEquals((c.resultado as Record<string, unknown>).version, "modalidades-v1");
  assertEquals((c.pasos as Array<{ paso: string; estado: string }>)[0].estado, "hecho");
});

Deno.test("el último paso cierra la evaluación como evaluada", () => {
  const pasos: RegistroDePaso[] = pasosIniciales("pro").map((p) => ({ ...p, estado: "hecho" }));
  pasos[2] = { paso: "capacidad", estado: "pendiente" };
  const c = despuesDeUnPaso(fila({ pasos }), "capacidad", { ok: true, cambios: {}, detalle: "Listo.", resultado: { capacidad: { capacidad: { cumple: true } } } }, AHORA);
  assertEquals(c.estado, "evaluada");
  assertEquals(c.terminada_el, AHORA.toISOString());
  assertEquals(c.evaluada_el, AHORA.toISOString());
});

Deno.test("un fallo pasajero reprograma el paso con espera creciente y no cierra la evaluación", () => {
  const c1 = despuesDeUnPaso(fila(), "perfil", { ok: false, fallo: fallo("fuentes_no_disponibles") }, AHORA);
  assertEquals(c1.estado, "en_evaluacion");
  assertEquals(c1.intentos, 1);
  assertEquals(c1.proximo_intento_el, en(esperaTrasFallo(1)).toISOString());
  assertEquals((c1.pasos as Array<Record<string, unknown>>)[0], { paso: "perfil", estado: "pendiente", el: AHORA.toISOString(), detalle: "falló con fuentes_no_disponibles", codigo: "fuentes_no_disponibles" });
  assertEquals(c1.reclamada_hasta, null);
  const c2 = despuesDeUnPaso(fila({ intentos: 2 }), "perfil", { ok: false, fallo: fallo("error_interno") }, AHORA);
  assertEquals(c2.proximo_intento_el, en(esperaTrasFallo(2)).toISOString());
  assert(esperaTrasFallo(2) > esperaTrasFallo(1));
});

Deno.test("la espera del propio fallo manda cuando es mayor: un paso que pudo cobrarse no se retoma antes", () => {
  const c = despuesDeUnPaso(fila(), "buro", { ok: false, fallo: fallo("buro_no_disponible", 3 * 60_000) }, AHORA);
  assertEquals(c.proximo_intento_el, en(3 * 60_000).toISOString());
});

Deno.test("un fallo definitivo cierra la evaluación enseguida, sin reintentar", () => {
  for (const codigo of ["identificacion_no_encontrada", "buro_requiere_consulta_previa", "tope_diario_agotado"] as const) {
    const c = despuesDeUnPaso(fila(), "perfil", { ok: false, fallo: fallo(codigo) }, AHORA);
    assertEquals(c.estado, "fallida", codigo);
    assertEquals(c.fallo_codigo, codigo);
    assertEquals(c.terminada_el, AHORA.toISOString());
    assertEquals(c.proximo_intento_el, null);
  }
});

Deno.test("al llegar al tope de intentos se rinde con el último código, no con plazo_vencido", () => {
  const c = despuesDeUnPaso(fila({ intentos: MAX_INTENTOS.analisis }), "analisis", { ok: false, fallo: fallo("error_interno") }, AHORA);
  assertEquals(c.estado, "fallida");
  assertEquals(c.fallo_codigo, "error_interno");
});

Deno.test("el buró, que se cobra, se intenta menos veces que los demás pasos", () => {
  const con = (intentos: number) => despuesDeUnPaso(fila({ intentos }), "buro", { ok: false, fallo: fallo("buro_no_disponible") }, AHORA).estado;
  assertEquals(con(MAX_INTENTOS.buro - 1), "en_evaluacion");
  assertEquals(con(MAX_INTENTOS.buro), "fallida");
  assert(MAX_INTENTOS.buro < MAX_INTENTOS.perfil);
});

Deno.test("un paso que se tomó todas las veces y siempre quedó en curso no se retoma: podría pagar el buró otra vez", () => {
  const enCurso = (intentos: number, estado: "en_curso" | "pendiente" = "en_curso"): FilaDeLaCola => {
    const pasos: RegistroDePaso[] = pasosIniciales("plus");
    pasos[0] = { paso: "perfil", estado: "hecho" };
    pasos[1] = { paso: "buro", estado, el: AHORA.toISOString() };
    return fila({ pasos, intentos });
  };
  assertEquals(despuesDeUnPasoCortadoDemasiadasVeces(enCurso(MAX_INTENTOS.buro - 1), "buro", AHORA), null);
  const c = despuesDeUnPasoCortadoDemasiadasVeces(enCurso(MAX_INTENTOS.buro), "buro", AHORA);
  assertEquals(c?.estado, "fallida");
  assertEquals(c?.fallo_codigo, "error_interno");
  // Un paso pendiente (reprogramado tras un fallo avisado) no es un paso cortado.
  assertEquals(despuesDeUnPasoCortadoDemasiadasVeces(enCurso(MAX_INTENTOS.buro, "pendiente"), "buro", AHORA), null);
});

Deno.test("si el próximo intento caería fuera del plazo, se cierra ya con el código y el detalle del último fallo", () => {
  const casiVencida = fila({ plazo_hasta: en(60_000).toISOString(), intentos: 2 }); // la espera siguiente es de 2 minutos
  const c = despuesDeUnPaso(casiVencida, "perfil", { ok: false, fallo: fallo("fuentes_no_disponibles") }, AHORA);
  assertEquals(c.estado, "fallida");
  assertEquals(c.fallo_codigo, "fuentes_no_disponibles");
  const paso = (c.pasos as Array<Record<string, unknown>>)[0];
  assertEquals(paso.estado, "fallido");
  assertEquals(paso.detalle, "falló con fuentes_no_disponibles");
});

Deno.test("sin plazo cargado no se inventa uno", () => {
  const c = despuesDeUnPaso(fila({ plazo_hasta: null }), "perfil", { ok: false, fallo: fallo("fuentes_no_disponibles") }, AHORA);
  assertEquals(c.estado, "en_evaluacion");
});

Deno.test("pasado el plazo, la evaluación se cierra en el paso que quedaba; antes del plazo no pasa nada", () => {
  assertEquals(despuesDelPlazo(fila(), AHORA), null);
  const pasos = pasosIniciales("plus");
  pasos[0] = { paso: "perfil", estado: "hecho" };
  const c = despuesDelPlazo(fila({ pasos, plazo_hasta: en(-1000).toISOString() }), AHORA);
  assertEquals(c?.estado, "fallida");
  assertEquals(c?.fallo_codigo, "plazo_vencido");
  assertEquals((c?.pasos as Array<Record<string, unknown>>)[1].paso, "buro");
  assertEquals((c?.pasos as Array<Record<string, unknown>>)[1].estado, "fallido");
});

Deno.test("si el paso que quedaba ya había fallado, el plazo cierra con esa causa, no con plazo_vencido", () => {
  const pasos = pasosIniciales("plus");
  pasos[0] = { paso: "perfil", estado: "pendiente", detalle: "Las fuentes no respondieron.", codigo: "fuentes_no_disponibles" };
  const c = despuesDelPlazo(fila({ pasos, plazo_hasta: en(-1000).toISOString(), intentos: 1 }), AHORA);
  assertEquals(c?.fallo_codigo, "fuentes_no_disponibles");
});

Deno.test("al leerla, una evaluación vencida hace rato se presenta fallida; dentro de la gracia, no", () => {
  const vencida = fila({ plazo_hasta: en(-GRACIA_DE_LECTURA_MS - 1000).toISOString() });
  const vista = conElPlazoAplicado(vencida, AHORA);
  assertEquals(vista.estado, "fallida");
  assertEquals(vista.fallo_codigo, "plazo_vencido");
  // Lo guardado no se toca: la vista es otra fila.
  assertEquals(vencida.estado, "en_evaluacion");
  const reciente = fila({ plazo_hasta: en(-60_000).toISOString() });
  assertEquals(conElPlazoAplicado(reciente, AHORA).estado, "en_evaluacion");
  // Una evaluación terminada no vence.
  assertEquals(conElPlazoAplicado(fila({ estado: "evaluada", plazo_hasta: en(-10 * 3600_000).toISOString() }), AHORA).estado, "evaluada");
});

Deno.test("un fallo marcado noReintentar cierra la evaluación aunque el código sea pasajero (se cobró y no se guardó)", () => {
  const c = despuesDeUnPaso(fila(), "buro", { ok: false, fallo: { detalle: "Se cobró y no se guardó.", codigo: "buro_no_disponible", esperarMs: 0, noReintentar: true } }, AHORA);
  assertEquals(c.estado, "fallida");
  assertEquals(c.fallo_codigo, "buro_no_disponible");
  assertEquals(c.proximo_intento_el, null);
});

Deno.test("una evaluación ya hecha no vence", () => {
  const pasos: RegistroDePaso[] = pasosIniciales("basico").map((p) => ({ ...p, estado: "hecho" }));
  assertEquals(despuesDelPlazo(fila({ pasos, plazo_hasta: en(-1000).toISOString() }), AHORA), null);
});
