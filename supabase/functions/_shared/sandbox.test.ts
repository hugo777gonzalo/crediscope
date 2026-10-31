// El sandbox de la API, de punta a punta: `POST /evaluaciones`, el trabajador y `GET
// /evaluaciones/{id}`, con una base en memoria.
//
// Un error acá consulta a una persona o cobra de verdad, así que lo que se prueba
// es sobre todo lo que NO pasa:
//
// - ninguna salida a la red, con una trampa en `fetch` y un control que demuestra
//   que la trampa ve las salidas de verdad;
// - ninguna escritura fuera de `solicitudes` y `audit_log`: una fila en
//   `consultas_equifax` gastaría el tope diario de la institución;
// - ninguna identificación real entra al sandbox, ni uno de sus simuladores le
//   contesta.
//
// Cada respuesta se valida contra `api/openapi.yaml`: los esquemas de la
// especificación, no una copia.
//
// deno test --no-lock --node-modules-dir=none --allow-env --allow-read=supabase/functions,api supabase/functions/

import { assert, assertEquals, assertFalse, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { parse } from "jsr:@std/yaml@1";
import Ajv2020 from "https://esm.sh/ajv@8.17.1/dist/2020?no-dts";
import formatos from "https://esm.sh/ajv-formats@3.0.1?no-dts";
import { cedulaBienFormada, clasificarIdentificacion, esIdentificacionSimulada } from "./identificacion.ts";
import { baseEnMemoria } from "./base-en-memoria-de-prueba.ts";
import { crearPuertaDeLaApi } from "./puerta-de-la-api.ts";
import { rondaDeEvaluaciones } from "./trabajador-de-evaluaciones.ts";
import { correrPaso } from "./pasos-de-evaluacion.ts";
import { validarPedidoDeLaApi } from "./pedido-de-evaluacion-api.ts";
import { analizarPersona } from "./analisis-de-la-persona.ts";
import { pasosIniciales } from "./modalidades.ts";
import { casoDe, esCasoDelSandbox, IDENTIFICACIONES_DEL_SANDBOX } from "./sandbox-casos.ts";
import { equifaxSimulado, modeloSimulado, proveedorInfo1Simulado, VERSION_DEL_SIMULADOR } from "./sandbox-simuladores.ts";
import type { Actor } from "./autorizacion.ts";

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

// Una cédula de forma válida, inventada: la de los crudos de prueba de Equifax.
const CEDULA_INVENTADA = "0102030405";
const ADMIN: Actor = { id: "11111111-1111-4111-8111-111111111111", rol: "admin" };

// --- La especificación -------------------------------------------------------

const especificacion = parse(await Deno.readTextFile(new URL("../../../api/openapi.yaml", import.meta.url))) as Fila;
// deno-lint-ignore no-explicit-any
const ajv = new (Ajv2020 as any)({ strict: false, allErrors: true });
// deno-lint-ignore no-explicit-any
(formatos as any)(ajv);
ajv.addSchema({ ...especificacion, $id: "openapi" }, "openapi");

function cumpleLaEspecificacion(esquema: string, cuerpo: unknown) {
  const validar = ajv.compile({ $ref: `openapi#/components/schemas/${esquema}` });
  const ok = validar(cuerpo);
  assert(ok, `No cumple ${esquema}: ${JSON.stringify(validar.errors?.slice(0, 5))}\n${JSON.stringify(cuerpo)}`);
}

// --- La trampa en la red -----------------------------------------------------

const fetchOriginal = globalThis.fetch;

async function conTrampaEnLaRed(trabajo: () => Promise<unknown>): Promise<string[]> {
  const salidas: string[] = [];
  globalThis.fetch = ((entrada: unknown) => {
    salidas.push(String(entrada));
    return Promise.reject(new Error("salida a la red"));
  }) as typeof fetch;
  try {
    await trabajo();
  } finally {
    globalThis.fetch = fetchOriginal;
  }
  return salidas;
}

// --- Un entorno de punta a punta ---------------------------------------------

function entorno({ sandboxActivo = true, actor = ADMIN as Actor | null } = {}) {
  let hora = Date.now();
  const ahora = () => new Date(hora);
  const db = baseEnMemoria(ahora);
  const despertar = () => Promise.resolve(null);
  const puerta = crearPuertaDeLaApi({ db, identificar: () => Promise.resolve(actor), despertar, sandboxActivo });
  let n = 0;

  const pedido = (identificacion: string, modalidad: string) => ({
    persona: { tipoIdentificacion: "cedula", identificacion },
    autorizacion: {
      id: "autorizacion-de-prueba",
      otorgadaEl: "2026-10-09T10:02:00-05:00",
      canal: "firma_electronica",
      finalidad: "evaluacion_de_credito",
      huellaDelDocumento: `sha256:${"a".repeat(64)}`,
    },
    modalidad,
    referencia: `prueba-${++n}`,
    operador: { id: "operador-de-prueba" },
    ...(modalidad === "basico" ? {} : { solicitudDeCredito: { monto: 5000, plazoMeses: 24 } }),
  });

  const pedir = (cuerpo: unknown, encabezados: Record<string, string> = {}) =>
    puerta(new Request("https://prueba.local/functions/v1/api-v1/evaluaciones", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...encabezados },
      body: JSON.stringify(cuerpo),
    }));
  const leer = (id: string) => puerta(new Request(`https://prueba.local/functions/v1/api-v1/evaluaciones/${id}`));

  // Lo que hace la agenda de la base: rondas hasta que no quede nada listo.
  async function trabajar() {
    for (let i = 0; i < 12; i++) {
      const { reclamadas } = await rondaDeEvaluaciones({ db, despertar, ahora });
      if (reclamadas === 0) return;
      hora += 1000;
    }
  }

  return { db, pedido, pedir, leer, trabajar, adelantar: (ms: number) => (hora += ms) };
}

async function evaluarHastaElFinal(e: ReturnType<typeof entorno>, identificacion: string, modalidad: string): Promise<Fila> {
  const respuesta = await e.pedir(e.pedido(identificacion, modalidad));
  assertEquals(respuesta.status, 202);
  const aceptada = await respuesta.json();
  cumpleLaEspecificacion("EvaluacionAceptada", aceptada);
  await e.trabajar();
  if (casoDe(identificacion) === "demorada") {
    e.adelantar(120_000);
    await e.trabajar();
  }
  const leida = await e.leer(aceptada.id);
  assertEquals(leida.status, 200);
  const evaluacion = await leida.json();
  cumpleLaEspecificacion("Evaluacion", evaluacion);
  return evaluacion;
}

// --- Qué es una identificación simulada --------------------------------------

Deno.test("una identificación simulada empieza con 00 y ninguna otra lo es", () => {
  for (const id of IDENTIFICACIONES_DEL_SANDBOX) assert(esIdentificacionSimulada(id));
  assert(esIdentificacionSimulada("0000000099"));
  assert(esIdentificacionSimulada(" 00-0000-0001 "));
  for (const v of [CEDULA_INVENTADA, "1712345678", "0900000000", "", null, undefined, "pasaporte", "00ABC"]) assertFalse(esIdentificacionSimulada(v));
});

Deno.test("ninguna cédula válida puede ser simulada: de las 25 provincias, ni una", () => {
  for (const provincia of [...Array(24).keys()].map((i) => i + 1).concat(30)) {
    const nueve = `${String(provincia).padStart(2, "0")}1234567`;
    const suma = [...nueve].reduce((a, d, i) => {
      const p = Number(d) * (i % 2 === 0 ? 2 : 1);
      return a + (p > 9 ? p - 9 : p);
    }, 0);
    const cedula = nueve + String((10 - (suma % 10)) % 10);
    assert(cedulaBienFormada(cedula), cedula);
    assertFalse(esIdentificacionSimulada(cedula));
  }
});

Deno.test("una identificación simulada nunca es consultable por los caminos de siempre", () => {
  // La pantalla, los guiones y las funciones de cada módulo usan esta clasificación.
  for (const id of [...IDENTIFICACIONES_DEL_SANDBOX, "0000000099", "0012345678", "0000000001001"]) {
    assertFalse(cedulaBienFormada(id.slice(0, 10)));
    assertFalse(clasificarIdentificacion(id).consultable);
  }
});

// --- El interruptor ----------------------------------------------------------

Deno.test("con el interruptor apagado, cada identificación de prueba es inválida y no se guarda nada", async () => {
  for (const id of IDENTIFICACIONES_DEL_SANDBOX) {
    const e = entorno({ sandboxActivo: false });
    const respuesta = await e.pedir(e.pedido(id, "basico"));
    assertEquals(respuesta.status, 400);
    const problema = await respuesta.json();
    assertEquals(problema.codigo, "identificacion-invalida");
    cumpleLaEspecificacion("Problema", problema);
    assertEquals(e.db.tablasEscritas(), []);
  }
});

Deno.test("sin decir nada, el interruptor está apagado", () => {
  const e = entorno();
  const v = validarPedidoDeLaApi(e.pedido("0000000001", "basico"));
  assert(!v.ok && v.codigo === "identificacion-invalida");
});

Deno.test("la puerta, si nadie le dice nada, tiene el interruptor apagado", async () => {
  const db = baseEnMemoria();
  const puerta = crearPuertaDeLaApi({ db, identificar: () => Promise.resolve(ADMIN), despertar: () => Promise.resolve(null) });
  const respuesta = await puerta(new Request("https://prueba.local/functions/v1/api-v1/evaluaciones", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
    body: JSON.stringify(entorno().pedido("0000000001", "basico")),
  }));
  assertEquals((await respuesta.json()).codigo, "identificacion-invalida");
  assertEquals(db.tablasEscritas(), []);
});

Deno.test("con el interruptor encendido sólo valen las identificaciones de la especificación", async () => {
  const e = entorno();
  for (const id of ["0000000000", "0000000008", "0012345678"]) {
    const respuesta = await e.pedir(e.pedido(id, "basico"));
    assertEquals((await respuesta.json()).codigo, "identificacion-invalida", id);
  }
  // Como RUC tampoco: los casos son cédulas.
  const ruc = await e.pedir({ ...e.pedido("0000000001", "basico"), persona: { tipoIdentificacion: "ruc", identificacion: "0000000001001" } });
  assertEquals((await ruc.json()).codigo, "identificacion-invalida");
  assertEquals(e.db.tablasEscritas(), []);
});

Deno.test("el sandbox no abre la puerta a nadie: sin sesión, o sin ser administrador, no pasa", async () => {
  const sinSesion = entorno({ actor: null });
  assertEquals((await (await sinSesion.pedir(sinSesion.pedido("0000000001", "plus"))).json()).codigo, "no-autenticado");
  const analista = entorno({ actor: { id: "22222222-2222-4222-8222-222222222222", rol: "analista" } as Actor });
  assertEquals((await (await analista.pedir(analista.pedido("0000000001", "plus"))).json()).codigo, "sin-permiso");
  assertEquals(sinSesion.db.tablasEscritas(), []);
  assertEquals(analista.db.tablasEscritas(), []);
});

// --- De punta a punta --------------------------------------------------------

for (const modalidad of ["basico", "pro", "plus"]) {
  Deno.test(`${modalidad}: las siete identificaciones terminan sin salir a la red ni tocar las tablas de las personas`, async () => {
    const e = entorno();
    const evaluaciones: Fila[] = [];
    const salidas = await conTrampaEnLaRed(async () => {
      for (const id of IDENTIFICACIONES_DEL_SANDBOX) evaluaciones.push(await evaluarHastaElFinal(e, id, modalidad));
    });
    assertEquals(salidas, []);
    assertEquals(e.db.tablasEscritas(), ["audit_log", "solicitudes"]);
    assertEquals(e.db.filas("audit_log").filter((f) => String(f.action).startsWith("equifax.")), []);
    for (const s of e.db.filas("solicitudes")) {
      assertEquals(s.client_id, null);
      assertEquals(s.client_profile_id, null);
      assertEquals(s.consulta_equifax_id, undefined);
      assertEquals(s.analysis_result_id, undefined);
    }

    const [aprobada, parcial, bloqueada, sinVeredicto, noEncontrada, sinFuentes, demorada] = evaluaciones;

    assertEquals(aprobada.estado, "completada");
    assertEquals(aprobada.resultado.recomendacion, "aprobar");
    assertEquals(aprobada.resultado.veredictoOrigen, "modelo");
    assertEquals(aprobada.resultado.score, 742);
    assertEquals(aprobada.disponibilidad.completitud, "completa");
    assertEquals(aprobada.versiones.modelo, VERSION_DEL_SIMULADOR);
    assertEquals(aprobada.versiones.marco, VERSION_DEL_SIMULADOR);

    // El modelo simulado dijo «aprobar»: el «revisar» lo pone la regla real de la entrega.
    assertEquals(parcial.estado, "completada");
    assertEquals(parcial.resultado.recomendacion, "revisar");
    assertEquals(parcial.disponibilidad.completitud, "parcial");
    assert(parcial.disponibilidad.temasNoConsultados.includes("demandas en su contra"));

    assertEquals(bloqueada.estado, "completada");
    assertEquals(bloqueada.resultado.recomendacion, "negar");
    assertEquals(bloqueada.resultado.score, 1);
    assertEquals(bloqueada.resultado.veredictoOrigen, "control_bloqueo");
    assertEquals(bloqueada.resultado.controlesDeBloqueo.bloqueado, true);
    assertEquals(bloqueada.resultado.controlesDeBloqueo.hallazgos[0].codigo, "lista_control");

    assertEquals(sinVeredicto.estado, "completada");
    assertEquals(sinVeredicto.resultado.score, null);
    assertEquals(sinVeredicto.resultado.recomendacion, null);
    assertEquals(sinVeredicto.resultado.veredictoOrigen, "sin_veredicto");
    assertEquals(sinVeredicto.resultado.razonamiento, null);

    assertEquals(noEncontrada.estado, "persona_no_encontrada");
    assertEquals(noEncontrada.resultado, undefined);

    assertEquals(sinFuentes.estado, "fallida");
    assertEquals(sinFuentes.fallo.codigo, "fuentes_no_disponibles");

    assertEquals(demorada.estado, "completada");
    assertEquals(demorada.resultado.recomendacion, "aprobar");
  });
}

Deno.test("básico no trae capacidad; pro la mide con el IESS; plus, con las cuotas del buró", async () => {
  const e = entorno();
  const basico = await evaluarHastaElFinal(e, "0000000001", "basico");
  const pro = await evaluarHastaElFinal(e, "0000000001", "pro");
  const plus = await evaluarHastaElFinal(e, "0000000001", "plus");
  assertEquals(basico.resultado.capacidadDePago, null);
  const conIess = pro.resultado.capacidadDePago;
  const conBuro = plus.resultado.capacidadDePago;
  assertEquals(conIess.datos.ingresos.map((i: Fila) => i.montoMensual), [1500]);
  assertEquals(conIess.datos.fuenteDeLasCuotas, "proveedor_info_1");
  assertEquals(conIess.datos.obligaciones, []);
  assertEquals(conBuro.datos.fuenteDeLasCuotas, "equifax");
  // Del crudo inventado de Equifax: 200 de banco y 20 de comercio. Los 50 de codeudor no cuentan.
  assertEquals(conBuro.datos.obligaciones.reduce((a: number, o: Fila) => a + o.montoMensual, 0), 220);
  assert(conBuro.capacidad.cuotaMaximaAdmisible < conIess.capacidad.cuotaMaximaAdmisible);
});

Deno.test("la demora se hace en la cola, sin dormir: a los 60 s sigue en proceso", async () => {
  const e = entorno();
  const respuesta = await e.pedir(e.pedido("0000000007", "plus"));
  const { id } = await respuesta.json();
  await e.trabajar();
  e.adelantar(60_000);
  await e.trabajar();
  const leida = await (await e.leer(id)).json();
  cumpleLaEspecificacion("Evaluacion", leida);
  assertEquals(leida.estado, "en_proceso");
  assertEquals(leida.etapa, "perfil");
  e.adelantar(60_000);
  await e.trabajar();
  assertEquals((await (await e.leer(id)).json()).estado, "completada");
});

Deno.test("repetir el pedido con la misma clave devuelve la misma evaluación simulada", async () => {
  const e = entorno();
  const cuerpo = e.pedido("0000000001", "plus");
  const clave = { "Idempotency-Key": crypto.randomUUID() };
  const primera = await (await e.pedir(cuerpo, clave)).json();
  await e.trabajar();
  const repetida = await e.pedir(cuerpo, clave);
  assertEquals(repetida.status, 200);
  assertEquals(repetida.headers.get("Idempotent-Replayed"), "true");
  assertEquals((await repetida.json()).id, primera.id);
  assertEquals(e.db.filas("solicitudes").length, 1);
});

Deno.test("Prefer: wait entrega el resultado si termina a tiempo", async () => {
  const e = entorno();
  const respuesta = e.pedir(e.pedido("0000000001", "basico"), { Prefer: "wait=1" });
  // La puerta primero guarda y después espera: el trabajador corre en ese medio.
  await new Promise((r) => setTimeout(r, 100));
  await e.trabajar();
  const final = await respuesta;
  assertEquals(final.status, 200);
  assertEquals(final.headers.get("Preference-Applied"), "wait=1");
  cumpleLaEspecificacion("Evaluacion", await final.json());
});

// --- Las salidas -------------------------------------------------------------

const sinSanitizar = { sanitizeOps: false, sanitizeResources: false };

Deno.test({
  name: "el control: la trampa ve la salida de una identificación real a Proveedor_Info_1 y a Equifax",
  ...sinSanitizar,
  async fn() {
    // Sin esto, «cero salidas» podría querer decir sólo que el cliente no estaba configurado.
    const { consultarTodasLasFuentes } = await import("./proveedor-info-1-client.ts");
    assert((await conTrampaEnLaRed(() => consultarTodasLasFuentes(CEDULA_INVENTADA, { username: "u", password: "c" }, new Set(), 50))).length > 0);

    const ENTORNO_DE_EQUIFAX: Record<string, string> = {
      EQUIFAX_BASE_URL: "https://equifax.prueba", EQUIFAX_CLIENT_ID: "u", EQUIFAX_CLIENT_SECRET: "c", EQUIFAX_BILL_TO: "F", EQUIFAX_SHIP_TO: "E",
      EQUIFAX_CONFIGURATION: "C", EQUIFAX_CUSTOMER: "C", EQUIFAX_MODEL: "M", EQUIFAX_ESPERA_MS: "1", EQUIFAX_PLAZO_MS: "60",
    };
    for (const [k, v] of Object.entries(ENTORNO_DE_EQUIFAX)) Deno.env.set(k, v);
    try {
      const { consultarEquifax } = await import("./equifax-client.ts?sandbox");
      assert((await conTrampaEnLaRed(() => consultarEquifax(CEDULA_INVENTADA))).length > 0);
    } finally {
      for (const k of Object.keys(ENTORNO_DE_EQUIFAX)) Deno.env.delete(k);
    }
  },
});

Deno.test({
  name: "si todo lo demás falla, las tres salidas se niegan a una identificación simulada",
  ...sinSanitizar,
  async fn() {
    const { consultarTodasLasFuentes } = await import("./proveedor-info-1-client.ts");
    const { consultarEquifax } = await import("./equifax-client.ts");
    const db = baseEnMemoria();
    const salidas = await conTrampaEnLaRed(async () => {
      for (const id of [...IDENTIFICACIONES_DEL_SANDBOX, "0000000099"]) {
        await assertRejects(() => consultarTodasLasFuentes(id, { username: "u", password: "c" }), Error, "sandbox");
        await assertRejects(() => consultarEquifax(id), Error, "sandbox");
        await assertRejects(() => analizarPersona({ db, cedula: id, actorId: ADMIN.id }), Error, "sandbox");
      }
    });
    assertEquals(salidas, []);
    assertEquals(db.tablasEscritas(), []);
  },
});

Deno.test("un simulador se niega a contestar por una identificación real", () => {
  for (const id of [CEDULA_INVENTADA, "0000000099", "__proto__"]) {
    assertFalse(esCasoDelSandbox(id));
    assertThrows(() => proveedorInfo1Simulado(id));
    assertThrows(() => equifaxSimulado(id, new Date().toISOString()));
    assertThrows(() => modeloSimulado(id));
  }
});

Deno.test({
  name: "una identificación real va por el camino real: nunca recibe un resultado inventado",
  ...sinSanitizar,
  async fn() {
    const s = { id: "33333333-3333-4333-8333-333333333333", identificacion: CEDULA_INVENTADA, modalidad: "plus", pasos: pasosIniciales("plus"), creada_el: new Date().toISOString() };
    const db = baseEnMemoria();
    const resultado = await correrPaso("perfil", s, { db, actorId: ADMIN.id, puedeCobrarEquifax: false });
    // Sin credenciales de Proveedor_Info_1 en la prueba, el camino real termina en «no contestó».
    assert(!resultado.ok);
    assertEquals(resultado.fallo.codigo, "fuentes_no_disponibles");
  },
});

Deno.test("un 00 fuera de la tabla en la cola falla cerrado, sin salir a ninguna fuente", async () => {
  const s = { id: "33333333-3333-4333-8333-333333333333", identificacion: "0000000099", modalidad: "plus", pasos: pasosIniciales("plus"), creada_el: new Date().toISOString() };
  const db = baseEnMemoria();
  const salidas = await conTrampaEnLaRed(async () => {
    for (const paso of ["perfil", "buro", "analisis", "capacidad"] as const) {
      const r = await correrPaso(paso, s, { db, actorId: ADMIN.id, puedeCobrarEquifax: true });
      assert(!r.ok);
    }
  });
  assertEquals(salidas, []);
  assertEquals(db.tablasEscritas(), []);
});
