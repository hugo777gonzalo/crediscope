// El paso de capacidad con una base simulada que devuelve el perfil y la consulta de Equifax.

import { assertEquals } from "jsr:@std/assert@1";
import { pasoCapacidad } from "./pasos-de-evaluacion.ts";
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
