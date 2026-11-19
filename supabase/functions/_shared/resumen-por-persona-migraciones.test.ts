// El INSERT de refrescar_resumen_por_persona() y su DO UPDATE SET tienen que
// cubrir las mismas columnas. La 151 sumó consulta_posterior_incompleta sólo al
// INSERT: la marca no se actualizaba en filas existentes (0 de 19.015 en vez de
// 57) y nadie lo vio hasta medir. Se mira la última migración que define la función.
import { assert, assertEquals } from "jsr:@std/assert@1";

const CARPETA = new URL("../../migrations/", import.meta.url);

function ultimaDefinicion(): { archivo: string; texto: string } {
  const archivos = [...Deno.readDirSync(CARPETA)]
    .map((e) => e.name)
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort();
  for (const archivo of archivos.reverse()) {
    const texto = Deno.readTextFileSync(new URL(archivo, CARPETA));
    if (/function\s+(public\.)?refrescar_resumen_por_persona\s*\(/i.test(texto)) {
      return { archivo, texto };
    }
  }
  throw new Error("Ninguna migración define refrescar_resumen_por_persona");
}

Deno.test("refrescar_resumen_por_persona: el DO UPDATE cubre las columnas del INSERT", () => {
  const { archivo, texto } = ultimaDefinicion();
  const insert = texto.match(/insert into resumen_por_persona as r \(([\s\S]*?)\)\s*select/i);
  assert(insert, `${archivo}: no se encontró la lista de columnas del INSERT`);
  const columnas = insert[1].split(",").map((c) => c.trim()).filter(Boolean);
  const upsert = texto.match(/on conflict \(client_id\) do update set([\s\S]*?);\s*end;/i);
  assert(upsert, `${archivo}: no se encontró el DO UPDATE SET`);
  const actualizadas = [...upsert[1].matchAll(/^\s*(\w+)\s*=\s*excluded\.(\w+)/gm)];
  for (const [, izq, der] of actualizadas) assertEquals(izq, der, `${archivo}: ${izq} = excluded.${der}`);
  const set = new Set(actualizadas.map((m) => m[1]));
  const faltan = columnas.filter((c) => c !== "client_id" && !set.has(c));
  assertEquals(faltan, [], `${archivo}: columnas del INSERT sin actualizar en el DO UPDATE`);
});
