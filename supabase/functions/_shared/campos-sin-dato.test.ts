// El «sin dato» de estructura-v25 no cambia lo que leen el modelo ni la
// capacidad de pago hasta la versión mayor del marco: con la marca, el mismo
// mensaje y el mismo cálculo que con los valores que escribía la v24. Datos
// inventados: el repositorio es público.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { camposSinDato, conLosValoresDeAntes } from "./campos-sin-dato.ts";
import { datosDeCapacidad } from "./capacidad-de-pago.ts";
import { mensajeParaElModelo } from "./perfil-del-modelo.ts";
import { perfilDePrueba } from "./perfil-de-prueba.ts";

type Registro = Record<string, unknown>;

// El perfil de prueba como lo guarda la v25 si Super o Diners y la cooperativa
// no contestaron: cada campo de esos grupos en null, y lo de antes en la marca.
function conSinDato(antes: Registro): Registro {
  const p = structuredClone(antes);
  for (const [grupo, campos] of [
    ["comportamientoBancario", ["numeroOperacionesBuroCredito", "peorCalificacionRiesgo", "saldoTotalVigente", "deudaEnAtraso"]],
    ["comportamientoCooperativas", ["numeroOperaciones", "saldoTotal", "cuotaMensualTotal"]],
  ] as const) {
    const g = p[grupo] as Registro;
    g.camposSinDato = Object.fromEntries(campos.map((c) => [c, g[c]]));
    for (const c of campos) g[c] = null;
  }
  return p;
}

Deno.test("conLosValoresDeAntes devuelve cada campo a su valor y en su lugar, y saca la marca", () => {
  const antes = perfilDePrueba();
  const marcado = conSinDato(antes);
  assertEquals(camposSinDato(marcado.comportamientoBancario).length, 4);
  const vuelto = conLosValoresDeAntes(marcado);
  assertEquals(JSON.stringify(vuelto), JSON.stringify(antes));
  // No toca el perfil que recibe.
  assertEquals((marcado.comportamientoBancario as Registro).saldoTotalVigente, null);
  // Un perfil sin la marca vuelve tal cual.
  assertEquals(conLosValoresDeAntes(antes), antes);
  assertEquals(camposSinDato(antes.comportamientoBancario), []);
});

Deno.test("el modelo lee lo mismo con la marca que con los valores de la v24", () => {
  const antes = perfilDePrueba();
  const ahora = new Date("2026-11-19T12:00:00-05:00");
  const conMarca = JSON.stringify(mensajeParaElModelo(conSinDato(antes), [], new Set(), null, ahora));
  assertEquals(conMarca, JSON.stringify(mensajeParaElModelo(antes, [], new Set(), null, ahora)));
  assertEquals(conMarca.includes("camposSinDato"), false);
});

Deno.test("la capacidad de pago calcula igual con la marca que con los valores de la v24", () => {
  const antes = perfilDePrueba();
  const hoy = new Date("2026-11-19T12:00:00-05:00");
  assertEquals(datosDeCapacidad(conSinDato(antes), null, hoy), datosDeCapacidad(antes, null, hoy));
});
