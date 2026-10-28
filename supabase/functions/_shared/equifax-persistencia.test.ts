// El recorrido de una consulta a Equifax contra una base falsa en memoria: sin
// red y sin datos de nadie. Lo que se prueba es lo que cuesta plata: que una
// consulta vigente se reutilice, que el tope diario frene, que simular no
// cobre y que una respuesta cobrada no se pierda aunque falle el guardado.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  FRENO_ESPERA_MS,
  frenoDeEquifax,
  guardarTablasDeLaConsulta,
  identidadDeLaConsulta,
  inicioDelDiaEcuador,
  procesarConsultaEquifax,
} from "./equifax-persistencia.ts";
import type { RespuestaEquifax } from "./equifax-client.ts";
import { CEDULA_DE_PRUEBA, respuestaDePrueba } from "./equifax-respuesta-de-prueba.ts";

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

// Una base mínima: lo justo de supabase-js que usa el módulo.
function baseFalsa(
  inicial: Partial<Record<string, Fila[]>> = {},
  opciones: {
    fallanInsertsDeConsultas?: number;
    rpcFalla?: { code: string; message: string };
    rpcLanza?: boolean;
  } = {},
) {
  // Cada base copia sus listas: dos bases armadas con la misma lista se la
  // compartían, y lo que insertaba una (con la hora real) lo veía la otra. La
  // prueba del freno pasó hasta las 14:50 UTC del 2026-10-20 y desde ahí falló
  // siempre: el fallo insertado quedaba después de AHORA y cerraba el freno.
  const copias = Object.fromEntries(Object.entries(inicial).map(([tabla, filas]) => [tabla, [...(filas ?? [])]]));
  const tablas: Record<string, Fila[]> = {
    proveedores: [{ clave: "equifax", activo: true, notas: null }],
    consultas_equifax: [],
    audit_log: [],
    clients: [],
    ...copias,
  };
  let secuencia = 0;
  let fallosPendientes = opciones.fallanInsertsDeConsultas ?? 0;
  const intentosDeInsertEnConsultas = { n: 0 };

  function constructor(tabla: string) {
    const filtros: Array<(f: Fila) => boolean> = [];
    let cuenta = false;
    let insertar: Fila | null = null;
    let limite = Infinity;
    const filas = () => tablas[tabla].filter((f) => filtros.every((p) => p(f))).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    const ejecutar = (modo: "uno" | "muchos" | "cuenta") => {
      if (insertar) {
        if (tabla === "consultas_equifax") {
          intentosDeInsertEnConsultas.n++;
          if (fallosPendientes > 0) { fallosPendientes--; return { data: null, error: { message: "falla simulada", code: "XX000" } }; }
        }
        const fila = { id: `id-${++secuencia}`, created_at: new Date().toISOString(), ...insertar };
        tablas[tabla].push(fila);
        return { data: fila, error: null };
      }
      if (modo === "cuenta") return { count: filas().length, error: null };
      // Una lista (se espera la consulta sin maybeSingle ni single) trae las filas hasta el límite.
      if (modo === "muchos") return { data: filas().slice(0, limite), error: null };
      return { data: filas()[0] ?? null, error: null };
    };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: (_c?: string, o?: { count?: string; head?: boolean }) => { if (o?.count) cuenta = true; return b; },
      eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return b; },
      gte: (c: string, v: string) => { filtros.push((f) => String(f[c]) >= v); return b; },
      in: (c: string, valores: unknown[]) => { filtros.push((f) => valores.includes(f[c])); return b; },
      filter: (c: string, _op: string, v: string) => {
        const [col, campo] = c.split("->>");
        filtros.push((f) => String(f[col]?.[campo]) === v);
        return b;
      },
      order: () => b,
      limit: (n: number) => { limite = n; return b; },
      insert: (fila: Fila) => { insertar = fila; return b; },
      maybeSingle: () => Promise.resolve(ejecutar("uno")),
      single: () => Promise.resolve(ejecutar("uno")),
      // Se espera con await igual que el constructor real de supabase-js.
      // oxlint-disable-next-line unicorn/no-thenable
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(ejecutar(cuenta ? "cuenta" : "muchos")).then(ok, ko),
    };
    return b;
  }
  // La función de la base que rehace las tablas de una consulta (126): se anota cada llamada y cuántas
  // consultas había guardadas CUANDO se llamó (tiene que ser después de guardar el crudo).
  const llamadasRpc: Array<{ nombre: string; args: Fila; consultasGuardadas: number }> = [];
  const rpc = (nombre: string, args: Fila) => {
    llamadasRpc.push({ nombre, args, consultasGuardadas: tablas.consultas_equifax.length });
    if (opciones.rpcLanza) throw new Error("la base no contesta\nsegunda línea con detalle");
    if (opciones.rpcFalla) return Promise.resolve({ data: null, error: opciones.rpcFalla });
    return Promise.resolve({ data: { equifax_operaciones: 5, equifax_resumen: 1 }, error: null });
  };
  return { from: constructor, rpc, tablas, intentosDeInsertEnConsultas, llamadasRpc };
}

const respuestaOk = (): RespuestaEquifax => ({
  status: "ok", familia: "exito", httpStatus: 200, httpEquifax: 200,
  cuerpo: { decision: "X", listas: [{ a: 1 }], reporteCrediticio: { identificacion_consultada: [{ numero_documento: "0102030405" }] } },
  cabeceras: { "x-correlation-id": "abc" },
  parametros: { tipoProducto: "1", monto: 5000, plazo: 12, restaGastoFinanciero: 0 },
  duracionMs: 1234, intentos: 1, puedeHaberCobrado: true,
});

const respuestaTimeout = (): RespuestaEquifax => ({
  status: "error", familia: "sin_respuesta", httpStatus: 504, duracionMs: 60000, intentos: 1,
  puedeHaberCobrado: true, mensaje: "Equifax no contestó a tiempo.",
});

function llamadas() {
  const cuenta = { n: 0 };
  return { cuenta, consultar: () => { cuenta.n++; return Promise.resolve(respuestaOk()); } };
}

const BASE = { cedula: "0102030405", actorId: "actor-1", baseLegal: "Contrato de prueba para el test", origen: "consulta" as const, transporte: { tipo: "local" as const } };
const AHORA = new Date("2026-10-20T15:00:00Z"); // 10:00 en Ecuador

Deno.test("una consulta nueva se paga, se guarda entera y se audita con su base legal", async () => {
  const db = baseFalsa();
  const { cuenta, consultar } = llamadas();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar, ahora: AHORA });
  assertEquals(r.resultado, "consultada");
  assertEquals(cuenta.n, 1);
  assertEquals(db.tablas.consultas_equifax.length, 1);
  assertEquals(db.tablas.consultas_equifax[0].respuesta_cruda, respuestaOk().cuerpo);
  assertEquals(db.tablas.consultas_equifax[0].base_legal, BASE.baseLegal);
  assertEquals(db.tablas.consultas_equifax[0].requested_by, "actor-1");
  const auditoria = db.tablas.audit_log.find((f) => f.action === "equifax.consulta");
  assert(auditoria, "falta la auditoría");
  assertEquals(auditoria.meta.base_legal, BASE.baseLegal);
});

Deno.test("una consulta vigente se reutiliza y no se paga de nuevo", async () => {
  const db = baseFalsa({ consultas_equifax: [{ id: "previa", identificacion: "0102030405", tipo_identificacion: "C", created_at: "2026-10-19T12:00:00Z" }] });
  const { cuenta, consultar } = llamadas();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar, ahora: AHORA });
  assertEquals(r.resultado, "reutilizada");
  assertEquals(cuenta.n, 0);
});

Deno.test("una consulta de antes del corte del 18 ya no sirve y se vuelve a pagar", async () => {
  const db = baseFalsa({ consultas_equifax: [{ id: "vieja", identificacion: "0102030405", tipo_identificacion: "C", created_at: "2026-10-10T12:00:00Z" }] });
  const { cuenta, consultar } = llamadas();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar, ahora: AHORA });
  assertEquals(r.resultado, "consultada");
  assertEquals(cuenta.n, 1);
});

Deno.test("forzar salta la reutilización", async () => {
  const db = baseFalsa({ consultas_equifax: [{ id: "previa", identificacion: "0102030405", tipo_identificacion: "C", created_at: "2026-10-19T12:00:00Z" }] });
  const { cuenta, consultar } = llamadas();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar, ahora: AHORA, forzar: true });
  assertEquals(r.resultado, "consultada");
  assertEquals(cuenta.n, 1);
});

Deno.test("con el proveedor apagado no se reutiliza ni se consulta", async () => {
  const db = baseFalsa({
    proveedores: [{ clave: "equifax", activo: false, notas: "Contrato suspendido." }],
    consultas_equifax: [{ id: "previa", identificacion: "0102030405", tipo_identificacion: "C", created_at: "2026-10-19T12:00:00Z" }],
  });
  const { cuenta, consultar } = llamadas();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar, ahora: AHORA });
  assertEquals(r.resultado, "rechazada");
  assertEquals(r.resultado === "rechazada" && r.motivo, "proveedor_apagado");
  assertEquals(cuenta.n, 0);
});

Deno.test("sin fila de proveedor tampoco se consulta", async () => {
  const db = baseFalsa({ proveedores: [] });
  const { cuenta, consultar } = llamadas();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar, ahora: AHORA });
  assertEquals(r.resultado, "rechazada");
  assertEquals(cuenta.n, 0);
});

Deno.test("el tope diario frena antes de pagar", async () => {
  Deno.env.set("EQUIFAX_TOPE_DIARIO", "2");
  try {
    const hoy = "2026-10-20T14:00:00Z";
    const db = baseFalsa({ consultas_equifax: [
      { id: "a", identificacion: "0000000001", tipo_identificacion: "C", created_at: hoy },
      { id: "b", identificacion: "0000000002", tipo_identificacion: "C", created_at: hoy },
    ] });
    const { cuenta, consultar } = llamadas();
    const r = await procesarConsultaEquifax({ ...BASE, db, consultar, ahora: AHORA });
    assertEquals(r.resultado === "rechazada" && r.motivo, "tope_diario");
    assertEquals(r.resultado === "rechazada" && r.http, 429);
    assertEquals(cuenta.n, 0);
  } finally {
    Deno.env.delete("EQUIFAX_TOPE_DIARIO");
  }
});

Deno.test("un fallo que pudo cobrarse cuenta para el tope y uno que no, no", async () => {
  Deno.env.set("EQUIFAX_TOPE_DIARIO", "1");
  try {
    const hoy = "2026-10-20T14:00:00Z";
    const sinCobro = baseFalsa({ audit_log: [{ action: "equifax.consulta.fallo", created_at: hoy, meta: { puede_haber_cobrado: false } }] });
    const a = await procesarConsultaEquifax({ ...BASE, db: sinCobro, consultar: llamadas().consultar, ahora: AHORA });
    assertEquals(a.resultado, "consultada", "un 400 no cobró: no resta del tope");

    const dudoso = baseFalsa({ audit_log: [{ action: "equifax.consulta.fallo", created_at: hoy, meta: { puede_haber_cobrado: true } }] });
    const { cuenta, consultar } = llamadas();
    const b = await procesarConsultaEquifax({ ...BASE, db: dudoso, consultar, ahora: AHORA });
    assertEquals(b.resultado === "rechazada" && b.motivo, "tope_diario", "un timeout pudo cobrarse: cuenta");
    assertEquals(cuenta.n, 0);
  } finally {
    Deno.env.delete("EQUIFAX_TOPE_DIARIO");
  }
});

Deno.test("simular recorre todo menos la llamada que cobra", async () => {
  const db = baseFalsa();
  const { cuenta, consultar } = llamadas();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar, ahora: AHORA, simular: true });
  assertEquals(r.resultado, "simulada");
  assertEquals(cuenta.n, 0);
  assertEquals(db.tablas.consultas_equifax.length + db.tablas.audit_log.length, 0, "simular no escribe nada");
});

Deno.test("simular dice que reutilizaría cuando hay una vigente", async () => {
  const db = baseFalsa({ consultas_equifax: [{ id: "previa", identificacion: "0102030405", tipo_identificacion: "C", created_at: "2026-10-19T12:00:00Z" }] });
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: llamadas().consultar, ahora: AHORA, simular: true });
  assertEquals(r.resultado === "simulada" && r.reutilizaria, true);
});

// audit_log lo lee todo usuario con sesión y no se corrige después: hasta el 2026-10-13 cada
// consulta dejaba ahí la cédula (22 filas). La persona va por client_id.
Deno.test("la auditoría nombra a la persona por client_id, nunca por su número", async () => {
  const nueva = baseFalsa();
  await procesarConsultaEquifax({ ...BASE, db: nueva, ahora: AHORA, consultar: llamadas().consultar });
  const consulta = nueva.tablas.audit_log.find((f) => f.action === "equifax.consulta");
  assertEquals(consulta?.client_id, nueva.tablas.clients[0].id);
  assert(!JSON.stringify(consulta?.meta).includes(BASE.cedula), "la cédula quedó en meta");

  const conocida = baseFalsa({ clients: [{ id: "persona-1", cedula: BASE.cedula }] });
  await procesarConsultaEquifax({ ...BASE, db: conocida, ahora: AHORA, consultar: () => Promise.resolve(respuestaTimeout()) });
  const fallo = conocida.tablas.audit_log.find((f) => f.action === "equifax.consulta.fallo");
  assertEquals(fallo?.client_id, "persona-1");
  assert(!JSON.stringify(fallo?.meta).includes(BASE.cedula), "la cédula quedó en meta");

  // Un fallo no crea a la persona: si no existe, la constancia queda sin enlace.
  const desconocida = baseFalsa();
  await procesarConsultaEquifax({ ...BASE, db: desconocida, ahora: AHORA, consultar: () => Promise.resolve(respuestaTimeout()) });
  assertEquals(desconocida.tablas.clients.length, 0);
  assertEquals(desconocida.tablas.audit_log.find((f) => f.action === "equifax.consulta.fallo")?.client_id, null);
});

Deno.test("un timeout no deja fila, deja constancia de que pudo cobrarse", async () => {
  const db = baseFalsa();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: () => Promise.resolve(respuestaTimeout()), ahora: AHORA });
  assertEquals(r.resultado === "rechazada" && r.motivo, "fallo");
  assertEquals(db.tablas.consultas_equifax.length, 0);
  const fallo = db.tablas.audit_log.find((f) => f.action === "equifax.consulta.fallo");
  assert(fallo);
  assertEquals(fallo.meta.puede_haber_cobrado, true);
});

Deno.test("la respuesta cobrada llega a quien llama ANTES de guardarse", async () => {
  const db = baseFalsa();
  const orden: string[] = [];
  const insertOriginal = db.from;
  db.from = (t: string) => { if (t === "consultas_equifax") orden.push("tabla-consultada"); return insertOriginal(t); };
  await procesarConsultaEquifax({
    ...BASE, db, consultar: llamadas().consultar, ahora: AHORA,
    alRecibir: () => { orden.push("recibida"); },
  });
  assert(orden.indexOf("recibida") < orden.lastIndexOf("tabla-consultada"), "primero se avisa de la respuesta y después se guarda");
});

Deno.test("si el guardado falla la respuesta no se pierde y se dice que se cobró", async () => {
  const db = baseFalsa({}, { fallanInsertsDeConsultas: 2 });
  let recibida: RespuestaEquifax | null = null;
  const r = await procesarConsultaEquifax({
    ...BASE, db, consultar: llamadas().consultar, ahora: AHORA, alRecibir: (x) => { recibida = x; },
  });
  assertEquals(r.resultado === "rechazada" && r.motivo, "no_se_pudo_guardar");
  assertEquals(db.intentosDeInsertEnConsultas.n, 2, "se intenta dos veces antes de rendirse");
  assert(recibida, "quien llamó ya tenía la respuesta");
  assert(r.resultado === "rechazada" && r.error.includes("se cobró"));
});

Deno.test("un guardado que falla una vez y funciona la segunda termina bien", async () => {
  const db = baseFalsa({}, { fallanInsertsDeConsultas: 1 });
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: llamadas().consultar, ahora: AHORA });
  assertEquals(r.resultado, "consultada");
  assertEquals(db.tablas.consultas_equifax.length, 1);
});

Deno.test("una respuesta por OTRA persona no se guarda, se cobró y cuenta para el tope", async () => {
  const db = baseFalsa();
  const otra = (): RespuestaEquifax => ({
    ...respuestaOk(),
    cuerpo: { reporteCrediticio: { identificacion_consultada: [{ numero_documento: "0999999999" }] } },
  });
  let recibida = false;
  const r = await procesarConsultaEquifax({
    ...BASE, db, consultar: () => Promise.resolve(otra()), ahora: AHORA, alRecibir: () => { recibida = true; },
  });
  assertEquals(r.resultado === "rechazada" && r.motivo, "otra_persona");
  assertEquals(db.tablas.consultas_equifax.length, 0, "no deja fila: serviría para calificar a la persona equivocada");
  assert(recibida, "el crudo llegó a quien llama para que quede en disco como evidencia");
  const fallo = db.tablas.audit_log.find((f) => f.action === "equifax.consulta.fallo");
  assert(fallo);
  assertEquals(fallo.meta.familia, "otra_persona");
  assertEquals(fallo.meta.puede_haber_cobrado, true);
  assertFalse(JSON.stringify(fallo).includes("0999999999"), "el documento ajeno es dato de un tercero: no va a la auditoría");
});

Deno.test("una respuesta sin documento se guarda y la auditoría dice que no se pudo verificar", async () => {
  const db = baseFalsa();
  const sinDocumento = (): RespuestaEquifax => ({ ...respuestaOk(), cuerpo: { reporteCrediticio: {} } });
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: () => Promise.resolve(sinDocumento()), ahora: AHORA });
  assertEquals(r.resultado, "consultada");
  assertEquals(db.tablas.audit_log.find((f) => f.action === "equifax.consulta")?.meta.identidad_verificada, false);
});

Deno.test("una respuesta de la persona pedida queda con la identidad verificada", async () => {
  const db = baseFalsa();
  await procesarConsultaEquifax({ ...BASE, db, consultar: llamadas().consultar, ahora: AHORA });
  assertEquals(db.tablas.audit_log.find((f) => f.action === "equifax.consulta")?.meta.identidad_verificada, true);
});

// ---------- las tablas y la estructura (126) ----------
const respuestaCompleta = (): RespuestaEquifax => ({ ...respuestaOk(), cuerpo: respuestaDePrueba() });

Deno.test("una consulta nueva deriva las tablas y las guarda DESPUÉS de guardar el crudo, en una sola llamada", async () => {
  const db = baseFalsa();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: () => Promise.resolve(respuestaCompleta()), ahora: AHORA });
  assertEquals(r.resultado, "consultada");
  assertEquals(db.llamadasRpc.length, 1, "una sola llamada atómica, no una por tabla");
  const llamada = db.llamadasRpc[0];
  assertEquals(llamada.nombre, "equifax_reemplazar_tablas");
  assertEquals(llamada.consultasGuardadas, 1, "el crudo ya estaba guardado cuando se derivaron las tablas");
  assertEquals(llamada.args.p_consulta, db.tablas.consultas_equifax[0].id);
  assertEquals(llamada.args.p_version_tablas, "equifax-tablas-v2");
  assertEquals(llamada.args.p_version_estructura, "equifax-estructura-v1");
  assertEquals(Object.keys(llamada.args.p_tablas).length, 12);
  assertEquals(llamada.args.p_tablas.equifax_operaciones.length, 5);
  assertEquals(llamada.args.p_estructura.deudaActualTitular.bancos.conciliaConElResumen, "si");
  assertEquals(llamada.args.p_estructura.consulta.identidadVerificada, true);
  assert(r.resultado === "consultada" && r.tablas.ok);
  assertEquals(db.tablas.audit_log.filter((f) => f.action === "equifax.tablas.fallo").length, 0);
});

Deno.test("si las tablas fallan la consulta cobrada NO se pierde ni se da por fallida, y queda constancia", async () => {
  const db = baseFalsa({}, { rpcFalla: { code: "23514", message: "falló una restricción\nsegunda línea con un valor de la respuesta" } });
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: () => Promise.resolve(respuestaCompleta()), ahora: AHORA });
  assertEquals(r.resultado, "consultada", "se cobró y el crudo quedó guardado");
  assertEquals(db.tablas.consultas_equifax.length, 1);
  assert(r.resultado === "consultada" && !r.tablas.ok);
  assertEquals(r.resultado === "consultada" && r.tablas.codigo, "23514");
  const fallo = db.tablas.audit_log.find((f) => f.action === "equifax.tablas.fallo");
  assert(fallo, "queda constancia para rehacerlas sin volver a pagar");
  assertEquals(fallo.meta.consulta_equifax_id, db.tablas.consultas_equifax[0].id);
  assertEquals(fallo.meta.codigo, "23514");
  assertFalse(String(fallo.meta.mensaje).includes("segunda línea"), "sólo la primera línea del error: el resto puede repetir un valor de la respuesta");
  assert(db.tablas.audit_log.some((f) => f.action === "equifax.consulta"), "la consulta se audita igual");
});

Deno.test("si la base lanza una excepción al guardar las tablas, tampoco se pierde la consulta", async () => {
  const db = baseFalsa({}, { rpcLanza: true });
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: () => Promise.resolve(respuestaCompleta()), ahora: AHORA });
  assertEquals(r.resultado, "consultada");
  assert(r.resultado === "consultada" && !r.tablas.ok);
  assertEquals(db.tablas.consultas_equifax.length, 1);
  assertEquals(db.tablas.audit_log.filter((f) => f.action === "equifax.tablas.fallo").length, 1);
});

Deno.test("una consulta reutilizada no vuelve a derivar nada", async () => {
  const db = baseFalsa({ consultas_equifax: [{ id: "previa", identificacion: "0102030405", tipo_identificacion: "C", created_at: "2026-10-19T12:00:00Z" }] });
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: llamadas().consultar, ahora: AHORA });
  assertEquals(r.resultado, "reutilizada");
  assertEquals(db.llamadasRpc.length, 0);
});

Deno.test("una consulta rechazada (fallo, otra persona) no deriva tablas", async () => {
  const fallo = baseFalsa();
  await procesarConsultaEquifax({ ...BASE, db: fallo, consultar: () => Promise.resolve(respuestaTimeout()), ahora: AHORA });
  assertEquals(fallo.llamadasRpc.length, 0);
  const otra = baseFalsa();
  await procesarConsultaEquifax({
    ...BASE, db: otra, ahora: AHORA,
    consultar: () => Promise.resolve({ ...respuestaOk(), cuerpo: { reporteCrediticio: { identificacion_consultada: [{ numero_documento: "0999999999" }] } } }),
  });
  assertEquals(otra.llamadasRpc.length, 0, "no se derivan tablas de la respuesta de otra persona");
});

Deno.test("rehacer las tablas de una consulta guardada usa la misma función y no toca nada más", async () => {
  const db = baseFalsa();
  const fila = { id: "c1", identificacion: CEDULA_DE_PRUEBA, created_at: "2026-10-13T02:54:14.996Z", ambiente: "produccion", respuesta_cruda: respuestaDePrueba() };
  const r = await guardarTablasDeLaConsulta(db, fila);
  assert(r.ok);
  assertEquals(db.llamadasRpc.length, 1);
  assertEquals(db.llamadasRpc[0].args.p_consulta, "c1");
  assertEquals(db.llamadasRpc[0].args.p_estructura.consulta.consultadoEl, "2026-10-13T02:54:14.996Z", "la estructura lleva la fecha de la consulta original, no la de hoy");
  assertEquals(db.llamadasRpc[0].args.p_estructura.consulta.ambiente, "produccion");
  assertEquals(db.tablas.audit_log.length, 0);
});

Deno.test("la identidad de la consulta: true si el documento es el pedido, null si la respuesta no lo trae", () => {
  assertEquals(identidadDeLaConsulta(respuestaDePrueba(), CEDULA_DE_PRUEBA), true);
  assertEquals(identidadDeLaConsulta({ reporteCrediticio: {} }, CEDULA_DE_PRUEBA), null);
  assertEquals(identidadDeLaConsulta(respuestaDePrueba(), "0999999999"), false);
});

Deno.test("el día del tope empieza a las 00:00 de Ecuador, no de UTC", () => {
  // 2026-10-20T03:00Z es el 19 a las 22:00 en Ecuador: el día es el 19.
  assertEquals(inicioDelDiaEcuador(new Date("2026-10-20T03:00:00Z")).toISOString(), "2026-10-19T05:00:00.000Z");
  assertEquals(inicioDelDiaEcuador(new Date("2026-10-20T05:00:00Z")).toISOString(), "2026-10-20T05:00:00.000Z");
  assertFalse(inicioDelDiaEcuador(AHORA).toISOString() === "2026-10-20T00:00:00.000Z");
});

// --- El freno (2026-10-19) ---------------------------------------------------

const hace = (minutos: number) => new Date(AHORA.getTime() - minutos * 60_000).toISOString();
const fallo = (minutos: number, familia: string) => ({ action: "equifax.consulta.fallo", created_at: hace(minutos), meta: { familia, puede_haber_cobrado: false } });
const sirvio = (minutos: number) => ({ action: "equifax.consulta", created_at: hace(minutos), meta: {} });

Deno.test("tres fallos seguidos de Equifax abren el freno: no se llama, no se cobra y se dice por qué", async () => {
  const db = baseFalsa({ audit_log: [fallo(9, "sin_respuesta"), fallo(5, "transitorio"), fallo(2, "transitorio")] });
  const { cuenta, consultar } = llamadas();
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar, ahora: AHORA });
  assert(r.resultado === "rechazada" && r.motivo === "equifax_no_responde");
  assertEquals(r.http, 503);
  assertEquals(cuenta.n, 0, "no se llamó a Equifax");
  assertEquals(db.tablas.consultas_equifax.length, 0);
  assertEquals(db.tablas.audit_log.length, 3, "el rechazo del freno no suma otro fallo: la espera termina a los 10 minutos del último");
  assert(r.error.includes("3 fallos seguidos") && r.error.includes("No se consultó ni se cobró"));
});

Deno.test("con menos de tres, o con una consulta que sirvió entre medio o después, el freno no se abre", async () => {
  for (const audit_log of [
    [fallo(5, "transitorio"), fallo(2, "transitorio")],
    [fallo(9, "transitorio"), sirvio(5), fallo(2, "transitorio")],
    [fallo(9, "transitorio"), fallo(5, "transitorio"), sirvio(2)],
    [fallo(30, "transitorio"), fallo(25, "sin_respuesta"), fallo(2, "transitorio"), sirvio(1)],
  ]) {
    const { cuenta, consultar } = llamadas();
    const r = await procesarConsultaEquifax({ ...BASE, db: baseFalsa({ audit_log }), consultar, ahora: AHORA });
    assertEquals(r.resultado, "consultada", JSON.stringify(audit_log.map((f) => f.action + f.created_at)));
    assertEquals(cuenta.n, 1);
  }
});

Deno.test("un fallo de la persona (identificación, pedido mal armado) no cuenta: no es que Equifax no responda", async () => {
  const db = baseFalsa({ audit_log: [fallo(9, "identificacion"), fallo(5, "solicitud"), fallo(2, "identificacion")] });
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: llamadas().consultar, ahora: AHORA });
  assertEquals(r.resultado, "consultada");
  // Ni una respuesta de otra persona, que Equifax sí contestó.
  const otra = baseFalsa({ audit_log: [fallo(9, "otra_persona"), fallo(5, "transitorio"), fallo(2, "transitorio")] });
  assertEquals((await procesarConsultaEquifax({ ...BASE, db: otra, consultar: llamadas().consultar, ahora: AHORA })).resultado, "consultada");
});

Deno.test("pasados diez minutos del último fallo sale UNA consulta de prueba: si falla se cierra, si sirve se reinicia", async () => {
  const antes = [fallo(40, "sin_respuesta"), fallo(30, "transitorio")];
  const minutosDeEspera = FRENO_ESPERA_MS / 60000;
  assertEquals((await frenoDeEquifax(baseFalsa({ audit_log: [...antes, fallo(minutosDeEspera, "transitorio")] }), AHORA)).abierto, false, "a los 10 minutos justos ya se prueba");
  assertEquals((await frenoDeEquifax(baseFalsa({ audit_log: [...antes, fallo(minutosDeEspera - 0.1, "transitorio")] }), AHORA)).abierto, true);

  const caida = [...antes, fallo(11, "transitorio")];
  // La prueba falla: el fallo nuevo queda en la auditoría y el freno se cierra otra vez.
  const db = baseFalsa({ audit_log: caida });
  const r = await procesarConsultaEquifax({ ...BASE, db, consultar: () => Promise.resolve({ ...respuestaTimeout(), puedeHaberCobrado: false }), ahora: AHORA });
  assert(r.resultado === "rechazada" && r.motivo === "fallo");
  assertEquals(db.tablas.audit_log.filter((f) => f.action === "equifax.consulta.fallo").length, 4, "el fallo de la prueba queda anotado");
  assertEquals((await frenoDeEquifax(baseFalsa({ audit_log: [...caida, fallo(0, "sin_respuesta")] }), AHORA)).abierto, true, "con ese fallo se cierra otra vez");

  // La prueba sirve: se reinicia.
  const bien = baseFalsa({ audit_log: caida });
  const { cuenta, consultar } = llamadas();
  const ok = await procesarConsultaEquifax({ ...BASE, db: bien, consultar, ahora: AHORA });
  assertEquals(ok.resultado, "consultada");
  assertEquals(cuenta.n, 1);
  assert(bien.tablas.audit_log.some((f) => f.action === "equifax.consulta"));
  assertEquals((await frenoDeEquifax(baseFalsa({ audit_log: [...caida, sirvio(0)] }), AHORA)).abierto, false, "con una que sirve se reinicia");
});

Deno.test("el freno no impide reutilizar una consulta vigente, ni cuenta cuando se simula", async () => {
  const caida = [fallo(9, "sin_respuesta"), fallo(5, "transitorio"), fallo(2, "transitorio")];
  const vigente = baseFalsa({ audit_log: caida, consultas_equifax: [{ id: "previa", identificacion: "0102030405", tipo_identificacion: "C", created_at: "2026-10-19T12:00:00Z" }] });
  const r = await procesarConsultaEquifax({ ...BASE, db: vigente, consultar: llamadas().consultar, ahora: AHORA });
  assertEquals(r.resultado, "reutilizada", "lo guardado no necesita a Equifax");
  const simulada = await procesarConsultaEquifax({ ...BASE, db: baseFalsa({ audit_log: caida }), consultar: llamadas().consultar, simular: true, ahora: AHORA });
  assertEquals(simulada.resultado, "simulada");
});

Deno.test("si no se puede leer la auditoría, el freno no se cierra solo", async () => {
  const mal = { from: () => ({ select: () => ({ in: () => ({ order: () => ({ limit: () => Promise.resolve({ data: null, error: { message: "sin conexión", code: "XX000" } }) }) }) }) }) };
  assertEquals((await frenoDeEquifax(mal, AHORA)).abierto, false);
});
