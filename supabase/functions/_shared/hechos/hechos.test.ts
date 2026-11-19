// La capa de hechos es pura (docs/capa-de-hechos.md, 3.2): sin reloj, sin base y
// sin fuentes. Esta prueba lee los fuentes de `hechos/` y corta si alguno lo rompe;
// también comprueba lo que el emisor exige.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { crearEmisor } from "./emisor.ts";
import { derivarHechos, GRUPOS, HECHOS_VERSION } from "./indice.ts";
import type { Contexto } from "./tipos.ts";

const CARPETA = new URL(".", import.meta.url);

function fuentesDeHechos(carpeta: URL): string[] {
  const rutas: string[] = [];
  for (const e of Deno.readDirSync(carpeta)) {
    const url = new URL(e.name + (e.isDirectory ? "/" : ""), carpeta);
    if (e.isDirectory) rutas.push(...fuentesDeHechos(url));
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) rutas.push(url.pathname);
  }
  return rutas;
}

// Sin comentarios: un comentario puede nombrar lo prohibido para explicarlo.
function sinComentarios(codigo: string): string {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PROHIBIDO: Array<[string, RegExp]> = [
  ["reloj (new Date() sin argumento o Date.now())", /new\s+Date\s*\(\s*\)|Date\s*\.\s*now\s*\(/],
  ["escritura en la base", /\.(insert|update|upsert|delete|rpc)\s*\(|supabase-js|createClient/],
  ["llamada a una fuente o a la red", /\bfetch\s*\(|XMLHttpRequest|WebSocket|Deno\.(connect|serve)/],
  ["escritura en disco", /Deno\.(writeFile|writeTextFile|remove|mkdir|rename)/],
];

Deno.test("ningún archivo de hechos/ usa el reloj, escribe en la base ni llama a una fuente", () => {
  const rutas = fuentesDeHechos(CARPETA);
  assertEquals(rutas.length >= 19, true, "hechos/ debería tener sus archivos");
  const faltas: string[] = [];
  for (const ruta of rutas) {
    const codigo = sinComentarios(Deno.readTextFileSync(decodeURIComponent(ruta.replace(/^\/([A-Za-z]:)/, "$1"))));
    for (const [que, patron] of PROHIBIDO) if (patron.test(codigo)) faltas.push(`${ruta}: ${que}`);
  }
  assertEquals(faltas, []);
});

Deno.test("están los dieciséis grupos y cada uno exporta lo que el índice espera", () => {
  assertEquals(Object.keys(GRUPOS).length, 16);
  for (const g of Object.values(GRUPOS)) {
    assertEquals(Array.isArray(g.CATALOGO), true);
    assertEquals(Array.isArray(g.REGLAS_QUE_MEZCLAN), true);
    assertEquals(typeof g.emitir, "function");
  }
});

const contexto: Contexto = {
  cedula: "0000000000",
  consulta: "perfil-de-prueba",
  fechaDeLaConsulta: "2026-11-18T12:00:00.000Z",
  corteIess: "2026-10",
  persona: { nombre: null, fechaDeNacimiento: null },
};

Deno.test("con un crudo vacío, todo hecho dice que la fuente no contestó, y nada más sale", () => {
  const h = derivarHechos({}, contexto);
  assertEquals(h.version, HECHOS_VERSION);
  assertEquals(h.hechos.length > 0, true);
  assertEquals(h.hechos.every((x) => x.valor === null && x.motivo === "fuente_sin_respuesta"), true);
  assertEquals([h.entidades, h.diferencias, h.senales], [[], [], []]);
});

Deno.test("el emisor exige catálogo, registros, motivo y derivaDe", () => {
  const e = crearEmisor(contexto, [{ codigo: "ban.saldo.total", unidad: "usd", descripcion: "x", llegaAlModelo: true, esIdentificador: false }]);
  const base = { regla: "r@1", unidad: "usd" as const, fuentes: [], fechaDelDato: null, registros: [] };
  assertThrows(() => e.hecho({ ...base, codigo: "ban.otro.total", valor: 1, calidad: "calculado" }), Error, "fuera del catálogo");
  assertThrows(() => e.hecho({ ...base, codigo: "ban.saldo.total", valor: 1, calidad: "calculado" }), Error, "sin registros");
  assertThrows(() => e.hecho({ ...base, codigo: "ban.saldo.total", valor: null, calidad: "no_disponible" }), Error, "sin motivo");
  e.hecho({ ...base, codigo: "ban.saldo.total", valor: null, calidad: "no_disponible", motivo: "fuente_sin_respuesta" });
  assertEquals(e.resultado().hechos[0].fechaDeLaConsulta, contexto.fechaDeLaConsulta);
  assertThrows(() => e.senal({ codigo: "ban.saldo.total", regla: "r@1", tipo: "razon", valor: 1, estado: "se_cumple", derivaDe: [] }), Error, "sin derivaDe");
});

Deno.test("la prueba de lo prohibido detecta lo que busca", () => {
  const malos = ["const a = new Date();", "Date.now()", "await fetch(u)", "db.from('t').insert(x)"];
  for (const m of malos) assertEquals(PROHIBIDO.some(([, p]) => p.test(sinComentarios(m))), true, m);
  assertEquals(PROHIBIDO.some(([, p]) => p.test(sinComentarios("new Date(contexto.fechaDeLaConsulta) // no Date.now()"))), false);
});
