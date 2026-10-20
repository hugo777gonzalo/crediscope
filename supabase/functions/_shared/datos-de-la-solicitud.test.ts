// Los datos que la solicitud guarda de la especificación de la API: la
// autorización del titular (sin el documento), la referencia, el operador, la
// prioridad y a quién reemplaza.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals } from "jsr:@std/assert@1";
import { hoyEnEcuador, validarDatosDeLaSolicitud } from "./datos-de-la-solicitud.ts";

const ahora = new Date("2026-10-19T12:00:00Z");
const huella = `sha256:${"0f".repeat(32)}`;
const autorizacion = {
  id: "AUT-2026-0001",
  otorgadaEl: "2026-10-19T09:30:00-05:00",
  canal: "aceptacion_electronica",
  finalidad: "evaluacion_de_credito",
  huellaDelDocumento: huella,
};

const errores = (cuerpo: Record<string, unknown>) => {
  const r = validarDatosDeLaSolicitud(cuerpo, ahora);
  return r.ok ? [] : r.errores;
};

Deno.test("sin ninguno de los datos, la validación pasa y todo queda vacío", () => {
  const r = validarDatosDeLaSolicitud({}, ahora);
  assert(r.ok);
  if (r.ok) assertEquals(r.datos, { autorizacion: null, referencia: null, operador: null, prioridad: null, reemplazaA: null });
  // null vale como ausente.
  const nulos = validarDatosDeLaSolicitud({ autorizacion: null, referencia: null, operador: null, prioridad: null, reemplazaA: null }, ahora);
  assert(nulos.ok);
});

Deno.test("la autorización completa se guarda con la hora en ISO", () => {
  const r = validarDatosDeLaSolicitud({ autorizacion: { ...autorizacion, vigenteHasta: "2027-01-31" } }, ahora);
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.datos.autorizacion, {
      id: "AUT-2026-0001",
      otorgadaEl: "2026-10-19T14:30:00.000Z",
      vigenteHasta: "2027-01-31",
      canal: "aceptacion_electronica",
      finalidad: "evaluacion_de_credito",
      huellaDelDocumento: huella,
    });
  }
  // Sin vigenteHasta, la autorización no vence.
  const sinVencimiento = validarDatosDeLaSolicitud({ autorizacion }, ahora);
  assert(sinVencimiento.ok && sinVencimiento.datos.autorizacion?.vigenteHasta === null);
});

Deno.test("el documento de la autorización nunca llega a lo que se guarda", () => {
  const conDocumento = { ...autorizacion, documento: "JVBERi0xLjQK", contenido: "texto del documento", archivo: { base64: "AAAA" } };
  const r = validarDatosDeLaSolicitud({ autorizacion: conDocumento, documento: "JVBERi0xLjQK" }, ahora);
  assert(r.ok);
  if (r.ok) {
    const guardado = JSON.stringify(r.datos);
    assert(!guardado.includes("JVBERi0xLjQK") && !guardado.includes("texto del documento") && !guardado.includes("AAAA"));
    assertEquals(Object.keys(r.datos.autorizacion!).sort(), ["canal", "finalidad", "huellaDelDocumento", "id", "otorgadaEl", "vigenteHasta"]);
  }
});

Deno.test("una autorización incompleta o mal armada se rechaza, y dice qué falta", () => {
  assert(errores({ autorizacion: "AUT-1" })[0].includes("como objeto"));
  assert(errores({ autorizacion: [] })[0].includes("como objeto"));
  // Falta cada campo obligatorio.
  for (const campo of ["id", "otorgadaEl", "canal", "finalidad", "huellaDelDocumento"]) {
    const sin: Record<string, unknown> = { ...autorizacion };
    delete sin[campo];
    assertEquals(errores({ autorizacion: sin }).length, 1, campo);
  }
  const malas: Array<[string, unknown]> = [
    ["id", ""],
    ["id", "x".repeat(65)],
    ["id", 7],
    ["otorgadaEl", "2026-10-19"],
    ["otorgadaEl", "ayer"],
    ["otorgadaEl", "2026-13-45T10:00:00Z"],
    ["canal", "verbal"],
    ["finalidad", "marketing"],
    ["huellaDelDocumento", "sha256:abc"],
    ["huellaDelDocumento", `sha1:${"0f".repeat(32)}`],
    ["huellaDelDocumento", `sha256:${"0F".repeat(32)}`],
    ["huellaDelDocumento", "0f".repeat(32)],
    ["vigenteHasta", "2027-02-30"],
    ["vigenteHasta", "mañana"],
  ];
  for (const [campo, valor] of malas) {
    assert(errores({ autorizacion: { ...autorizacion, [campo]: valor } }).length >= 1, `${campo} = ${valor}`);
  }
});

Deno.test("una autorización vencida se rechaza; la que vence hoy, en Ecuador, todavía vale", () => {
  assert(errores({ autorizacion: { ...autorizacion, vigenteHasta: "2026-10-18" } })[0].includes("vencida"));
  assertEquals(errores({ autorizacion: { ...autorizacion, vigenteHasta: "2026-10-19" } }), []);
  // A las 20:00 de Ecuador del 19 la fecha UTC ya es la del 20: el 19 todavía vale.
  const noche = new Date("2026-10-20T01:00:00Z");
  assertEquals(hoyEnEcuador(noche), "2026-10-19");
  assertEquals(validarDatosDeLaSolicitud({ autorizacion: { ...autorizacion, vigenteHasta: "2026-10-19" } }, noche).ok, true);
  assertEquals(validarDatosDeLaSolicitud({ autorizacion: { ...autorizacion, vigenteHasta: "2026-10-19" } }, new Date("2026-10-20T05:00:00Z")).ok, false);
});

Deno.test("la referencia: de 1 a 64 caracteres de la lista, sin espacios ni acentos", () => {
  const r = validarDatosDeLaSolicitud({ referencia: " SOL-2026/55555.a_b " }, ahora);
  assert(r.ok && r.datos.referencia === "SOL-2026/55555.a_b");
  for (const mala of ["", "   ", "con espacio", "sólo", "x".repeat(65), "a;b", 12345, {}]) {
    assert(errores({ referencia: mala }).length === 1, JSON.stringify(mala));
  }
  assertEquals(errores({ referencia: "x".repeat(64) }), []);
});

Deno.test("el operador lleva id y, si hay, agencia; la prioridad es una de las dos", () => {
  const r = validarDatosDeLaSolicitud({ operador: { id: "op-1" }, prioridad: "interactiva" }, ahora);
  assert(r.ok && r.datos.operador?.agencia === null && r.datos.prioridad === "interactiva");
  assert(errores({ operador: "op-1" })[0].includes("como objeto"));
  assertEquals(errores({ operador: { agencia: "Matriz" } }).length, 1);
  assertEquals(errores({ operador: { id: "" } }).length, 1);
  assertEquals(errores({ operador: { id: "op", agencia: "a".repeat(101) } }).length, 1);
  assertEquals(errores({ operador: { id: "op", agencia: "a".repeat(100) } }), []);
  for (const mala of ["urgente", "", 1, true]) assertEquals(errores({ prioridad: mala }).length, 1, String(mala));
});

Deno.test("reemplazaA es el id de otra solicitud (uuid)", () => {
  const id = "3F2B8C1A-4D5E-4F60-9A7B-1C2D3E4F5A6B";
  const r = validarDatosDeLaSolicitud({ reemplazaA: id }, ahora);
  assert(r.ok && r.datos.reemplazaA === id.toLowerCase());
  for (const mala of ["ev_01JABCD2EFGH3JKMN4PQRS5TVW", "123", "", 5, {}]) assertEquals(errores({ reemplazaA: mala }).length, 1, JSON.stringify(mala));
});

Deno.test("todos los errores juntos, para que quien llama los corrija de una vez", () => {
  const e = errores({ autorizacion: { id: "" }, referencia: "con espacio", operador: {}, prioridad: "ya", reemplazaA: "x" });
  assert(e.length >= 6, e.join(" | "));
});
