// estructura-v29 (E7, etapa B del grupo 2 de la capa de hechos): comportamientoInterno sale de los
// hechos y una base interna que no contestó deja el campo sin dato. Lo que se prueba:
//   - con la base interna contestando el perfil es el de siempre, en el mismo orden de claves y sin
//     `camposSinDato`, con una sola operación (D5) y con «no es cliente» como valor cuando no hay ninguna;
//   - con la base interna caída los campos son null, el grupo los marca con lo que escribía la v28, y el
//     modelo y la capacidad de pago leen lo de antes;
//   - los hechos nuevos de cantidad y de vigentes no llegan al perfil.
// Todo valor es inventado: el repositorio es público.

import { assertEquals } from "jsr:@std/assert@1";
import { buildStandardProfile, PROCESS_VERSION } from "./process.ts";
import { camposSinDato, conLosValoresDeAntes } from "./campos-sin-dato.ts";
import { armarPerfilDelModelo } from "./perfil-del-modelo.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

const CEDULA = "0000000000";
const op = (numero: number, estado: string, extra: Record<string, unknown> = {}) => ({
  identificacion: CEDULA, fechaCorte: "2026-09-30", operacion: numero, estadoOperacion: estado, cuotaNova: 100, plazoCuotas: 12,
  saldoCapital: 0, diasMoraVigentes: 0, diasMoraMax: 0, perfilInterno: "A", resultadoHabitoPago: "BUENO", ...extra,
});
const crudo = (operaciones: unknown[] | null): RespuestaProveedorInfo1 => ({
  general: { status: "ok", data: { personaNatural: { identificacion: CEDULA, nombre: "PRUEBA FICTICIO UNO" } } },
  basesInternas: operaciones === null ? { status: "error", data: null } : { status: "ok", data: { personasIncumplimientos: operaciones, tofac: [], tprovidencias: [], tconsephomonimos: [], tpeps: [] } },
} as unknown as RespuestaProveedorInfo1);
const perfilDe = (raw: RespuestaProveedorInfo1) => buildStandardProfile(raw, CEDULA).profile;

const CLAVES = [
  "proveedorInfo1ResultadoHabitoPago", "proveedorInfo1PerfilInterno", "proveedorInfo1DiasMoraMaxima", "proveedorInfo1DiasMoraVigente",
  "proveedorInfo1SaldoCapitalVigente", "esClienteInterno", "proveedorInfo1EstadoOperacion",
];

Deno.test("la versión de la estructura es la v29 o posterior", () => {
  assertEquals(Number(PROCESS_VERSION.replace("estructura-v", "")) >= 29, true, PROCESS_VERSION);
});

Deno.test("con la base interna contestando no hay marca y el orden de las claves es el de siempre", () => {
  const p = perfilDe(crudo([op(1, "VIGENTE", { saldoCapital: 800, diasMoraMax: 3, perfilInterno: "B" })]));
  assertEquals(Object.keys(p.comportamientoInterno), CLAVES);
  assertEquals(p.comportamientoInterno, {
    proveedorInfo1ResultadoHabitoPago: "BUENO", proveedorInfo1PerfilInterno: "B", proveedorInfo1DiasMoraMaxima: 3, proveedorInfo1DiasMoraVigente: 0,
    proveedorInfo1SaldoCapitalVigente: 800, esClienteInterno: true, proveedorInfo1EstadoOperacion: "VIGENTE",
  });
});

Deno.test("D5: con varias operaciones se reporta una, la de mayor saldo, y nada de cantidad llega al perfil", () => {
  const p = perfilDe(crudo([op(1, "CANCELADA", { cuotaNova: 300, plazoCuotas: 36 }), op(2, "VIGENTE", { saldoCapital: 800 }), op(3, "VIGENTE", { saldoCapital: 2000, perfilInterno: "C" })]));
  assertEquals([p.comportamientoInterno.proveedorInfo1SaldoCapitalVigente, p.comportamientoInterno.proveedorInfo1PerfilInterno], [2000, "C"]);
  assertEquals(Object.keys(p.comportamientoInterno), CLAVES);
});

Deno.test("la base interna contestó y no hay operaciones: «no es cliente» es un valor, no un sin dato", () => {
  const p = perfilDe(crudo([]));
  assertEquals(p.comportamientoInterno, {
    proveedorInfo1ResultadoHabitoPago: null, proveedorInfo1PerfilInterno: null, proveedorInfo1DiasMoraMaxima: null, proveedorInfo1DiasMoraVigente: null,
    proveedorInfo1SaldoCapitalVigente: null, esClienteInterno: false, proveedorInfo1EstadoOperacion: null,
  });
  assertEquals(camposSinDato(p.comportamientoInterno), []);
});

Deno.test("la base interna caída: los siete campos son null, quedan marcados y esClienteInterno no es «false»", () => {
  const p = perfilDe(crudo(null));
  for (const c of CLAVES) assertEquals((p.comportamientoInterno as unknown as Record<string, unknown>)[c], null, c);
  assertEquals(camposSinDato(p.comportamientoInterno).sort(), [...CLAVES].sort());
  assertEquals(Object.keys(p.comportamientoInterno), [...CLAVES, "camposSinDato"]);
  assertEquals(p.comportamientoInterno.camposSinDato?.esClienteInterno, false);
});

Deno.test("el modelo y la capacidad de pago leen los valores de antes, byte a byte", () => {
  const p = perfilDe(crudo(null));
  const leido = conLosValoresDeAntes(p);
  assertEquals(leido.comportamientoInterno, {
    proveedorInfo1ResultadoHabitoPago: null, proveedorInfo1PerfilInterno: null, proveedorInfo1DiasMoraMaxima: null, proveedorInfo1DiasMoraVigente: null,
    proveedorInfo1SaldoCapitalVigente: null, esClienteInterno: false, proveedorInfo1EstadoOperacion: null,
  });
  assertEquals(Object.keys(leido.comportamientoInterno), CLAVES);
  // El modelo: «no es cliente» se saca del perfil, como siempre (perfil-del-modelo.ts), y no ve la marca.
  const delModelo = armarPerfilDelModelo(p as unknown as Record<string, unknown>) as unknown as Record<string, unknown>;
  assertEquals("comportamientoInterno" in delModelo, false);
  assertEquals(JSON.stringify(delModelo).includes("camposSinDato"), false);
});
