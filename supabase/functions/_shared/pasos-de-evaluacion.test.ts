// El paso de capacidad con una base simulada que devuelve el perfil y la consulta de Equifax.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { correrPaso, falloDeConsultaIncompleta, pasoCapacidad } from "./pasos-de-evaluacion.ts";
import { FUENTES } from "./calidad-de-la-consulta.ts";
import { perfilDePrueba } from "./perfil-de-prueba.ts";

const base = (estructura: unknown) => ({
  from: (tabla: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: () => Promise.resolve({
          data: tabla === "client_profiles" ? { standard_profile: perfilDePrueba() } : { estructura },
        }),
      }),
    }),
  }),
});

const solicitud = {
  modalidad: "plus",
  client_profile_id: "perfil",
  consulta_equifax_id: "consulta",
  monto: 5000,
  plazo_meses: 36,
  tasa_nominal_anual: 15.6,
  ingreso_declarado: null,
};

Deno.test("Plus no calcula la capacidad con una respuesta de Equifax sin reporte de crédito", async () => {
  const sinReporte = { deudaActualTitular: { bancos: null, cooperativas: null, comercial: null, total: { cuotaMensualUsd: 0 } } };
  const r = await pasoCapacidad(solicitud, base(sinReporte));
  assertEquals(r.ok, false);
  if (!r.ok) assertEquals(r.fallo.codigo, "buro_no_disponible");
});

Deno.test("Plus calcula la capacidad cuando el buró trae el detalle de un sistema", async () => {
  const conReporte = { deudaActualTitular: { bancos: { cuotaMensualUsd: 100, saldoDeudaUsd: 1000 }, cooperativas: null, comercial: null } };
  const r = await pasoCapacidad(solicitud, base(conReporte));
  assertEquals(r.ok, true);
});

Deno.test("Pro no pide el buró", async () => {
  const r = await pasoCapacidad({ ...solicitud, modalidad: "pro", consulta_equifax_id: null }, base(null));
  assertEquals(r.ok, true);
});

// Provincia 99, que no existe, y no 00: esa se iría al sandbox.
const CEDULA = "9900000000";
const completo = (): Record<string, string> => Object.fromEntries(Object.keys(FUENTES).map((f) => [f, "ok"]));

// Una base que contesta por tabla, cualquiera sea la cadena de filtros.
function basePorTabla(filas: Record<string, unknown>) {
  const leidas: string[] = [];
  const from = (tabla: string) => {
    leidas.push(tabla);
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "neq", "not", "lte", "order", "limit", "insert"]) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve({ data: filas[tabla] ?? null, error: null });
    q.then = (ok: (r: unknown) => void) => ok({ data: [], error: null });
    return q;
  };
  return { from, leidas };
}

const contexto = (db: unknown) => ({ db, actorId: "institucion", puedeCobrarEquifax: true });
const conReporte = { deudaActualTitular: { bancos: { cuotaMensualUsd: 100 }, cooperativas: null, comercial: null } };
const sinReporte = { deudaActualTitular: { bancos: null, cooperativas: null, comercial: null } };
const consultaDeEquifax = (estructura: unknown) => ({ id: "consulta", created_at: new Date().toISOString(), estructura });

Deno.test("una respuesta de Equifax sin reporte corta en el paso del buró, antes de pagar el modelo", async () => {
  const db = basePorTabla({ consultas_equifax: consultaDeEquifax(sinReporte) });
  const r = await correrPaso("buro", { identificacion: CEDULA, client_id: "persona", pasos: [] }, contexto(db));
  assert(!r.ok);
  if (r.ok) return;
  assertEquals([r.fallo.codigo, r.fallo.noReintentar], ["buro_no_disponible", true]);
});

Deno.test("una consulta de Equifax con reporte sigue al análisis", async () => {
  const db = basePorTabla({ consultas_equifax: consultaDeEquifax(conReporte) });
  const r = await correrPaso("buro", { identificacion: CEDULA, client_id: "persona", pasos: [] }, contexto(db));
  assert(r.ok);
});

Deno.test("con un bloqueo y la consulta incompleta el perfil reutilizado sigue, marcado", async () => {
  const db = basePorTabla({
    client_profiles: { id: "perfil", created_at: new Date().toISOString(), fuentes_ok: 30, estado_por_fuente: { ...completo(), demandas: "error" }, control_bloqueo: { bloqueado: true } },
    config_operativa: { valor: 7 },
  });
  const r = await correrPaso("perfil", { id: "s", identificacion: CEDULA, client_id: "persona" }, contexto(db));
  assert(r.ok);
  if (!r.ok) return;
  assertEquals((r.resultado.perfil as Record<string, unknown>).negadaPorControl, true);
});

Deno.test("una persona que se niega por control no paga el buró ni calcula la capacidad", async () => {
  const s = { identificacion: CEDULA, client_id: "persona", modalidad: "plus", pasos: [], resultado: { perfil: { negadaPorControl: true } } };
  for (const paso of ["buro", "capacidad"] as const) {
    const db = basePorTabla({});
    const r = await correrPaso(paso, s, contexto(db));
    assert(r.ok, paso);
    if (!r.ok) return;
    assertEquals(r.cambios, {});
    assertEquals(db.leidas, []);
  }
});

Deno.test("el fallo de una consulta incompleta se reintenta, salvo que la falla no se vaya", async () => {
  const estado = { ...completo(), listaNegra: "faltante" };
  const consultas = (historia: unknown[]) => {
    const q = { select: () => q, eq: () => q, order: () => q, limit: () => Promise.resolve({ data: historia, error: null }) };
    return { from: () => q };
  };
  const pasajera = await falloDeConsultaIncompleta(consultas([{ created_at: "2026-10-03T12:00:00.000Z", estado_por_fuente: estado }]), "persona", estado);
  assertEquals([pasajera.codigo, pasajera.noReintentar], ["fuentes_no_disponibles", undefined]);
  const queNoSeVa = await falloDeConsultaIncompleta(
    consultas([{ created_at: "2026-10-03T12:00:00.000Z", estado_por_fuente: estado }, { created_at: "2026-09-25T12:00:00.000Z", estado_por_fuente: estado }]),
    "persona",
    estado,
  );
  assertEquals([queNoSeVa.codigo, queNoSeVa.noReintentar], ["fuentes_no_disponibles", true]);
  assert(/revisión manual/.test(queNoSeVa.detalle), queNoSeVa.detalle);
});

// F13: Pro y Plus leen la misma consulta de Equifax para la misma persona. Una base
// que contesta lo guardado: el perfil, quién es el buró y las consultas (por id y en lista).
function baseConBuroGuardado(estructura: unknown | null, clave = "equifax") {
  const filas = estructura
    ? [{ id: "consulta", created_at: "2026-01-10T15:00:00Z", ambiente: "produccion", estructura, crudo_ruta: null, id_aws: null }]
    : [];
  return {
    from: (tabla: string) => {
      // deno-lint-ignore no-explicit-any
      const q: any = {};
      for (const m of ["select", "eq", "not", "lte", "order", "limit"]) q[m] = () => q;
      q.maybeSingle = () => Promise.resolve({
        data: tabla === "client_profiles" ? { standard_profile: perfilDePrueba() } : tabla === "proveedores" ? { clave } : { estructura },
        error: null,
      });
      q.then = (ok: (r: unknown) => unknown, mal: (e: unknown) => unknown) => Promise.resolve({ data: filas, error: null }).then(ok, mal);
      return q;
    },
    storage: { from: () => ({ download: () => Promise.resolve({ data: null, error: { message: "Object not found", statusCode: "404" } }) }) },
  };
}

Deno.test("Pro lee la última consulta guardada y calcula la misma capacidad que Plus", async () => {
  const guardada = { consulta: { identidadVerificada: true }, deudaActualTitular: { bancos: { cuotaMensualUsd: 100, saldoDeudaUsd: 1000 }, cooperativas: null, comercial: null } };
  const persona = { client_id: "persona-1", identificacion: "9900000000" };
  const plus = await pasoCapacidad({ ...solicitud, ...persona }, baseConBuroGuardado(guardada));
  const pro = await pasoCapacidad({ ...solicitud, ...persona, modalidad: "pro", consulta_equifax_id: null }, baseConBuroGuardado(guardada));
  assert(plus.ok && pro.ok);
  if (plus.ok && pro.ok) {
    assertEquals(pro.resultado, plus.resultado);
    assert(pro.detalle.includes("consulta de Equifax guardada"));
  }
});

Deno.test("Pro sin ninguna consulta guardada sigue con Proveedor_Info_1 y lo dice", async () => {
  const r = await pasoCapacidad({ ...solicitud, client_id: "persona-1", identificacion: "9900000000", modalidad: "pro", consulta_equifax_id: null }, baseConBuroGuardado(null));
  assert(r.ok);
  if (r.ok) assert(r.detalle.includes("No hay consulta de Equifax guardada"));
});
