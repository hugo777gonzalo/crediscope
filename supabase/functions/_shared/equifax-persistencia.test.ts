// El recorrido de una consulta a Equifax contra una base falsa en memoria: sin
// red y sin datos de nadie. Lo que se prueba es lo que cuesta plata: que una
// consulta vigente se reutilice, que el tope diario frene, que simular no
// cobre y que una respuesta cobrada no se pierda aunque falle el guardado.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import { inicioDelDiaEcuador, procesarConsultaEquifax } from "./equifax-persistencia.ts";
import type { RespuestaEquifax } from "./equifax-client.ts";

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

// Una base mínima: lo justo de supabase-js que usa el módulo.
function baseFalsa(inicial: Partial<Record<string, Fila[]>> = {}, opciones: { fallanInsertsDeConsultas?: number } = {}) {
  const tablas: Record<string, Fila[]> = {
    proveedores: [{ clave: "equifax", activo: true, notas: null }],
    consultas_equifax: [],
    audit_log: [],
    clients: [],
    ...inicial,
  };
  let secuencia = 0;
  let fallosPendientes = opciones.fallanInsertsDeConsultas ?? 0;
  const intentosDeInsertEnConsultas = { n: 0 };

  function constructor(tabla: string) {
    const filtros: Array<(f: Fila) => boolean> = [];
    let cuenta = false;
    let insertar: Fila | null = null;
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
      return { data: filas()[0] ?? null, error: null };
    };
    // deno-lint-ignore no-explicit-any
    const b: any = {
      select: (_c?: string, o?: { count?: string; head?: boolean }) => { if (o?.count) cuenta = true; return b; },
      eq: (c: string, v: unknown) => { filtros.push((f) => f[c] === v); return b; },
      gte: (c: string, v: string) => { filtros.push((f) => String(f[c]) >= v); return b; },
      filter: (c: string, _op: string, v: string) => {
        const [col, campo] = c.split("->>");
        filtros.push((f) => String(f[col]?.[campo]) === v);
        return b;
      },
      order: () => b,
      limit: () => b,
      insert: (fila: Fila) => { insertar = fila; return b; },
      maybeSingle: () => Promise.resolve(ejecutar("uno")),
      single: () => Promise.resolve(ejecutar("uno")),
      // Se espera con await igual que el constructor real de supabase-js.
      // oxlint-disable-next-line unicorn/no-thenable
      then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => Promise.resolve(ejecutar(cuenta ? "cuenta" : "muchos")).then(ok, ko),
    };
    return b;
  }
  return { from: constructor, tablas, intentosDeInsertEnConsultas };
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

Deno.test("el día del tope empieza a las 00:00 de Ecuador, no de UTC", () => {
  // 2026-10-20T03:00Z es el 19 a las 22:00 en Ecuador: el día es el 19.
  assertEquals(inicioDelDiaEcuador(new Date("2026-10-20T03:00:00Z")).toISOString(), "2026-10-19T05:00:00.000Z");
  assertEquals(inicioDelDiaEcuador(new Date("2026-10-20T05:00:00Z")).toISOString(), "2026-10-20T05:00:00.000Z");
  assertFalse(inicioDelDiaEcuador(AHORA).toISOString() === "2026-10-20T00:00:00.000Z");
});
