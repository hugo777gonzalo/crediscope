// El marco por cliente (apagado) corta el marco vigente por marcas. Desde
// marco-v36 el aviso de un posible homónimo en una demanda penal (p1) tiene su
// sección: va sólo con ese hallazgo, y el homónimo de las listas sigue aparte.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals } from "jsr:@std/assert@1";
import { componerMarco } from "./marco-por-cliente.ts";
import { MARCO_INTERPRETATIVO } from "./marco-interpretativo.ts";

const AVISO = "Posible homónimo en una demanda penal";
const LISTAS = "Homónimo (cumplimiento";

Deno.test("el aviso de un posible homónimo en una demanda penal va sólo con su hallazgo", () => {
  const con = componerMarco({}, [{ code: "posible_homonimo_en_demanda_penal" }]);
  assert(con.texto.includes(AVISO));
  assert(!con.omitidas.includes("homonimo-en-demanda-penal"));
  // Uno no arrastra al otro.
  assert(!con.texto.includes(LISTAS));

  const sin = componerMarco({}, []);
  assert(!sin.texto.includes(AVISO));
  assert(sin.omitidas.includes("homonimo-en-demanda-penal"));
});

Deno.test("el homónimo de las listas no trae el aviso de la demanda penal", () => {
  const { texto } = componerMarco({}, [{ code: "homonimo_en_lista_control" }]);
  assert(texto.includes(LISTAS));
  assert(!texto.includes(AVISO));
});

Deno.test("con los dos hallazgos el marco por cliente queda igual al vigente en ese tramo", () => {
  const { texto } = componerMarco({}, [{ code: "homonimo_en_lista_control" }, { code: "posible_homonimo_en_demanda_penal" }]);
  const tramo = (t: string) => t.slice(t.indexOf(LISTAS), t.indexOf("CÓMO PENSAR EL SCORE"));
  assertEquals(tramo(texto), tramo(MARCO_INTERPRETATIVO));
});
