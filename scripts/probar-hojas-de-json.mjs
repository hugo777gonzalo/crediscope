// Prueba de la conversión de una respuesta JSON a hojas de Excel, con una
// respuesta INVENTADA: ningún dato de nadie.
//
//   node scripts/probar-hojas-de-json.mjs
//
// Correrla después de tocar scripts/_comun/hojas-de-json.mjs o
// scripts/exportar-equifax.mjs.

import assert from "node:assert/strict";
import { jsonAHojas, nombreDeHoja } from "./_comun/hojas-de-json.mjs";

let n = 0;
const prueba = (nombre, f) => { f(); n++; console.log(`ok    ${nombre}`); };

const inventada = {
  decision: { resultado: "APROBADO", puntaje: 612, detalle: { motivo: "prueba" } },
  titular: { nombre: "PERSONA DE PRUEBA", etiquetas: ["a", "b", null, "c"] },
  operaciones: [
    { entidad: "BANCO UNO", saldo: 100.5, cuotas: [{ numero: 1, valor: 10 }, { numero: 2, valor: 10 }] },
    { entidad: "BANCO DOS", saldo: 0, garantia: { tipo: "personal" } },
  ],
  vacia: [],
  nada: null,
  consultas: [{ entidad: "X", fecha: "2026-10-01" }],
};

prueba("los campos sueltos van al resumen, aplanados con puntos", () => {
  const { resumen } = jsonAHojas(inventada);
  const campos = Object.fromEntries(resumen.map((r) => [r.Campo, r.Valor]));
  assert.equal(campos["decision.resultado"], "APROBADO");
  assert.equal(campos["decision.detalle.motivo"], "prueba");
  assert.equal(campos["titular.etiquetas"], "a; b; ; c");
  assert.equal(campos.nada, "");
  assert.equal(campos.vacia, "");
});

prueba("cada lista de objetos es una hoja, con una fila por elemento", () => {
  const { tablas } = jsonAHojas(inventada);
  assert.deepEqual([...tablas.keys()].sort(), ["consultas", "operaciones", "operaciones.cuotas"]);
  assert.equal(tablas.get("operaciones").length, 2);
  assert.equal(tablas.get("operaciones")[0].entidad, "BANCO UNO");
  assert.equal(tablas.get("operaciones")[1]["garantia.tipo"], "personal");
});

prueba("una lista dentro de otra tiene su hoja y dice de qué fila viene", () => {
  const { tablas } = jsonAHojas(inventada);
  const cuotas = tablas.get("operaciones.cuotas");
  assert.equal(cuotas.length, 2);
  assert.equal(cuotas[0]["fila padre"], "operaciones #1");
  assert.equal(cuotas[1]["#"], 2);
});

prueba("una lista vacía no inventa una hoja", () => {
  const { tablas } = jsonAHojas({ vacia: [] });
  assert.equal(tablas.size, 0);
});

prueba("la estructura inventaría cada nodo con su tipo y cantidad", () => {
  const { estructura } = jsonAHojas(inventada);
  const por = Object.fromEntries(estructura.map((e) => [e.Ruta, `${e.Tipo}:${e.Cantidad}`]));
  assert.equal(por.operaciones, "lista de objetos:2");
  assert.equal(por["operaciones.cuotas"], "lista de objetos:2");
  assert.equal(por["decision.puntaje"], "number:");
  assert.equal(por["titular.etiquetas"], "lista de valores:4");
});

prueba("una celda que pasa el límite de Excel se corta", () => {
  const { resumen } = jsonAHojas({ largo: "x".repeat(40000) });
  assert.ok(resumen[0].Valor.length <= 32001);
});

prueba("una respuesta que es una lista en la raíz tiene su hoja", () => {
  const { tablas } = jsonAHojas([{ a: 1 }, { a: 2 }]);
  assert.equal(tablas.get("").length, 2);
});

prueba("los nombres de hoja son válidos y no se repiten", () => {
  const usados = new Set();
  const a = nombreDeHoja("operaciones.cuotas[0]/saldos", usados);
  assert.doesNotMatch(a, /[[\]:*?/\\]/);
  const largo = "uno.dos.tres.cuatro.cinco.seis.siete.ocho.nueve.diez";
  const b = nombreDeHoja(largo, usados);
  const c = nombreDeHoja(largo, usados);
  assert.ok(b.length <= 31 && c.length <= 31);
  assert.notEqual(b.toLowerCase(), c.toLowerCase());
  assert.notEqual(nombreDeHoja("Resumen", usados).toLowerCase(), nombreDeHoja("RESUMEN", usados).toLowerCase());
});

prueba("una ruta larga usa su último tramo y no se corta por el principio", () => {
  const usados = new Set();
  assert.equal(nombreDeHoja("reporteCrediticio.deuda_historica", usados), "deuda_historica");
  assert.equal(nombreDeHoja("interconnectResponse.HabitoPago", usados), "HabitoPago");
  // el mismo último tramo en otra parte de la respuesta: se le suman tramos de adelante
  assert.equal(nombreDeHoja("otra.deuda_historica", usados), "otra.deuda_historica");
  // un último tramo más largo que Excel: se corta por el final, no por el principio
  assert.equal(nombreDeHoja("a.historico_endeudamiento_comercial_muy_largo", usados), "historico_endeudamiento_comerci");
});

console.log(`\nTodo cuadra (${n} pruebas).`);
