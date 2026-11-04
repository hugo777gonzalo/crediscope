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
