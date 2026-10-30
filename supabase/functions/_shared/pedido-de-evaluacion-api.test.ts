// El pedido de POST /evaluaciones y los errores de la API. Los datos son
// inventados: la cédula es una secuencia con dígito verificador válido, sin
// persona detrás.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals } from "jsr:@std/assert@1";
import { validarPedidoDeLaApi } from "./pedido-de-evaluacion-api.ts";
import { cuerpoDeProblema, nuevoIdDePedido, PROBLEMAS } from "./problema.ts";
import { idDeLaEvaluacion } from "./cola-de-evaluaciones.ts";

const AHORA = new Date("2026-10-21T15:00:00.000Z");
const CEDULA = "0102030400";

const autorizacion = {
  id: "AUT-2026-000123",
  otorgadaEl: "2026-10-21T10:02:00-05:00",
  canal: "firma_electronica",
  finalidad: "evaluacion_de_credito",
  huellaDelDocumento: "sha256:" + "ab".repeat(32),
};

const base = () => ({
  persona: { tipoIdentificacion: "cedula", identificacion: CEDULA },
  autorizacion: { ...autorizacion },
  referencia: "SOL-2026-55555",
  operador: { id: "u-4821", agencia: "Matriz" },
});

const plus = () => ({
  ...base(),
  modalidad: "plus",
  solicitudDeCredito: { producto: "consumo", monto: 8000, moneda: "USD", plazoMeses: 36, tasaNominalAnualPorcentaje: 15 },
});

const campos = (r: ReturnType<typeof validarPedidoDeLaApi>) => (r.ok ? [] : r.errores.map((e) => e.campo));

Deno.test("la cédula de las pruebas tiene bien su dígito verificador", () => {
  assert(validarPedidoDeLaApi(base(), AHORA).ok);
});

Deno.test("sin modalidad es básico, y no pide las condiciones del crédito", () => {
  const r = validarPedidoDeLaApi(base(), AHORA);
  assert(r.ok);
  assertEquals(r.pedido.modalidad, "basico");
  assertEquals(r.pedido.condiciones, null);
  assertEquals(r.pedido.identificacion, CEDULA);
  assertEquals(r.pedido.recibirPerfil, true);
});

Deno.test("plus guarda las condiciones y sin tasa evalúa con la Tasa máxima del producto", () => {
  const r = validarPedidoDeLaApi(plus(), AHORA);
  assert(r.ok);
  assertEquals(r.pedido.modalidad, "plus");
  assertEquals(r.pedido.condiciones?.monto, 8000);
  const sinTasa = plus();
  delete (sinTasa.solicitudDeCredito as Record<string, unknown>).tasaNominalAnualPorcentaje;
  const s = validarPedidoDeLaApi(sinTasa, AHORA);
  assert(s.ok);
  assertEquals(s.pedido.condiciones?.tasaNominalAnualPorcentaje, 15.6);
});

Deno.test("un RUC de persona natural se reduce a su cédula", () => {
  const r = validarPedidoDeLaApi({ ...base(), persona: { tipoIdentificacion: "ruc", identificacion: CEDULA + "001" } }, AHORA);
  assert(r.ok);
  assertEquals(r.pedido.identificacion, CEDULA);
  assertEquals(r.pedido.ingresado, CEDULA + "001");
});

Deno.test("la persona, la autorización, la referencia y el operador son obligatorios en la API", () => {
  for (const falta of ["persona", "autorizacion", "referencia", "operador"]) {
    const p = base() as Record<string, unknown>;
    delete p[falta];
    const r = validarPedidoDeLaApi(p, AHORA);
    assert(!r.ok, falta);
    assertEquals(r.codigo, "cuerpo-invalido");
    assert(campos(r).includes(`/${falta}`), `${falta}: ${campos(r)}`);
  }
});

Deno.test("un campo de más es un error, también adentro de los objetos", () => {
  const r = validarPedidoDeLaApi({ ...base(), documento: "JVBERi0=", autorizacion: { ...autorizacion, pdf: "x" }, operador: { id: "u", rol: "jefe" }, persona: { tipoIdentificacion: "cedula", identificacion: CEDULA, nombre: "x" } }, AHORA);
  assert(!r.ok);
  for (const c of ["/documento", "/autorizacion/pdf", "/operador/rol", "/persona/nombre"]) assert(campos(r).includes(c), `${c}: ${campos(r)}`);
});

Deno.test("una identificación con mal dígito verificador es identificacion-invalida si es el único problema", () => {
  const r = validarPedidoDeLaApi({ ...base(), persona: { tipoIdentificacion: "cedula", identificacion: "0102030401" } }, AHORA);
  assert(!r.ok);
  assertEquals(r.codigo, "identificacion-invalida");
  assertEquals(campos(r), ["/persona/identificacion"]);
});

Deno.test("si además hay otros problemas, todo va junto en cuerpo-invalido", () => {
  const r = validarPedidoDeLaApi({ ...base(), persona: { tipoIdentificacion: "cedula", identificacion: "0102030401" }, referencia: "con espacio" }, AHORA);
  assert(!r.ok);
  assertEquals(r.codigo, "cuerpo-invalido");
  assert(campos(r).includes("/persona/identificacion"));
  assert(campos(r).includes("/referencia"));
});

Deno.test("las identificaciones de prueba del sandbox (provincia 00) las rechaza producción", () => {
  const r = validarPedidoDeLaApi({ ...base(), persona: { tipoIdentificacion: "cedula", identificacion: "0000000001" } }, AHORA);
  assert(!r.ok);
  assertEquals(r.codigo, "identificacion-invalida");
});

Deno.test("el tipo tiene que coincidir con los dígitos y el formato se exige antes de consultar", () => {
  for (const persona of [
    { tipoIdentificacion: "cedula", identificacion: CEDULA + "001" },
    { tipoIdentificacion: "ruc", identificacion: CEDULA },
    { tipoIdentificacion: "pasaporte", identificacion: CEDULA },
    { tipoIdentificacion: "cedula", identificacion: "01020304AB" },
    { tipoIdentificacion: "cedula", identificacion: 102030400 },
  ]) {
    const r = validarPedidoDeLaApi({ ...base(), persona }, AHORA);
    assert(!r.ok, JSON.stringify(persona));
    assertEquals(r.codigo, "cuerpo-invalido", JSON.stringify(persona));
  }
});

Deno.test("pro y plus exigen las condiciones, con el código y el campo de cada error", () => {
  const sin = validarPedidoDeLaApi({ ...base(), modalidad: "pro" }, AHORA);
  assert(!sin.ok);
  assertEquals(sin.errores.find((e) => e.campo === "/solicitudDeCredito")?.codigo, "faltan-condiciones");

  const fuera = validarPedidoDeLaApi({ ...plus(), solicitudDeCredito: { monto: 500, plazoMeses: 3, tasaNominalAnualPorcentaje: 30 } }, AHORA);
  assert(!fuera.ok);
  const porCampo = Object.fromEntries(fuera.errores.map((e) => [e.campo, e.codigo]));
  assertEquals(porCampo["/solicitudDeCredito/monto"], "monto-fuera-de-limites");
  assertEquals(porCampo["/solicitudDeCredito/plazoMeses"], "plazo-fuera-de-limites");
  assertEquals(porCampo["/solicitudDeCredito/tasaNominalAnualPorcentaje"], "tasa-mayor-que-la-maxima");
});

Deno.test("la capacidad de pago sólo se calcula para el producto de consumo y en dólares", () => {
  const otro = validarPedidoDeLaApi({ ...plus(), solicitudDeCredito: { ...plus().solicitudDeCredito, producto: "inmobiliario" } }, AHORA);
  assert(!otro.ok);
  assert(campos(otro).includes("/solicitudDeCredito/producto"));
  const euros = validarPedidoDeLaApi({ ...plus(), solicitudDeCredito: { ...plus().solicitudDeCredito, moneda: "EUR" } }, AHORA);
  assert(!euros.ok);
  assert(campos(euros).includes("/solicitudDeCredito/moneda"));
  // En básico las condiciones son opcionales y sólo se guardan.
  assert(validarPedidoDeLaApi({ ...base(), solicitudDeCredito: { producto: "inmobiliario", monto: 90000, plazoMeses: 240 } }, AHORA).ok);
});

Deno.test("la autorización vencida es 422 (autorizacion-insuficiente), y mal escrita es 400 con su campo", () => {
  const vencida = validarPedidoDeLaApi({ ...base(), autorizacion: { ...autorizacion, vigenteHasta: "2026-10-01" } }, AHORA);
  assert(!vencida.ok);
  assertEquals(vencida.codigo, "autorizacion-insuficiente");
  assert(campos(vencida).includes("/autorizacion/vigenteHasta"));
  // Vencida y además otro problema: es un pedido malformado.
  const dos = validarPedidoDeLaApi({ ...base(), referencia: "con espacio", autorizacion: { ...autorizacion, vigenteHasta: "2026-10-01" } }, AHORA);
  assert(!dos.ok);
  assertEquals(dos.codigo, "cuerpo-invalido");
  const huella = validarPedidoDeLaApi({ ...base(), autorizacion: { ...autorizacion, huellaDelDocumento: "abc" } }, AHORA);
  assert(!huella.ok);
  assert(campos(huella).includes("/autorizacion/huellaDelDocumento"));
});

Deno.test("destino, garantía y desgravamen se validan en todas las modalidades: no llegan a la base como un 500", () => {
  const largo = "x".repeat(201);
  for (const cuerpo of [
    { ...plus(), solicitudDeCredito: { ...plus().solicitudDeCredito, destino: largo } },
    { ...plus(), solicitudDeCredito: { ...plus().solicitudDeCredito, garantia: { a: 1 } } },
    { ...base(), solicitudDeCredito: { destino: largo } },
    { ...base(), solicitudDeCredito: { desgravamen: { cualquier: "cosa" } } },
    { ...base(), solicitudDeCredito: { desgravamen: { tasaPorcentaje: -1, periodicidad: "anual", base: "saldo" } } },
  ]) {
    const r = validarPedidoDeLaApi(cuerpo, AHORA);
    assert(!r.ok, JSON.stringify(cuerpo).slice(0, 80));
  }
  assert(validarPedidoDeLaApi({ ...base(), solicitudDeCredito: { destino: "x".repeat(200), desgravamen: { tasaPorcentaje: 0.6, periodicidad: "anual", base: "saldo" } } }, AHORA).ok);
});

Deno.test("reemplazaA viaja como ev_ y por dentro es el uuid de la solicitud", () => {
  const uuid = "0192f0e3-8a1b-7c4d-9e5f-0123456789ab";
  const r = validarPedidoDeLaApi({ ...base(), reemplazaA: idDeLaEvaluacion(uuid) }, AHORA);
  assert(r.ok);
  assertEquals(r.pedido.datos.reemplazaA, uuid);
  const mal = validarPedidoDeLaApi({ ...base(), reemplazaA: uuid }, AHORA);
  assert(!mal.ok);
  assert(campos(mal).includes("/reemplazaA"));
});

Deno.test("un cuerpo que no es un objeto, y un recibirPerfil que no es booleano", () => {
  for (const c of [null, [], "x", 5]) assertEquals(validarPedidoDeLaApi(c, AHORA).ok, false);
  const r = validarPedidoDeLaApi({ ...base(), recibirPerfil: "si" }, AHORA);
  assert(!r.ok);
  assert(campos(r).includes("/recibirPerfil"));
  const no = validarPedidoDeLaApi({ ...base(), recibirPerfil: false }, AHORA);
  assert(no.ok);
  assertEquals(no.pedido.recibirPerfil, false);
});

Deno.test("el puntero JSON escapa la barra y la tilde de un nombre de campo", () => {
  const r = validarPedidoDeLaApi({ ...base(), "a/b~c": 1 }, AHORA);
  assert(!r.ok);
  assert(campos(r).includes("/a~1b~0c"));
});

Deno.test("el problema lleva type, title, status, codigo e idPedido, y sólo lo que tiene", () => {
  const id = nuevoIdDePedido();
  assert(/^ped_[0-9a-f]{10}$/.test(id));
  const p = cuerpoDeProblema("clave-reutilizada", id);
  assertEquals(p, { type: "https://api.crediscope.example/problemas/clave-reutilizada", title: PROBLEMAS["clave-reutilizada"].titulo, status: 409, codigo: "clave-reutilizada", idPedido: id });
  const con = cuerpoDeProblema("cuerpo-invalido", id, "Revisá los campos.", [{ campo: "/referencia", motivo: "Mal." }]);
  assertEquals(con.errores?.length, 1);
  assertEquals(con.detail, "Revisá los campos.");
});
