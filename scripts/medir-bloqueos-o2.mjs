// E12 (O-2): cuántos de los bloqueados hoy dejan de bloquearse, por motivo.
// Sólo lee: recorre el crudo de Proveedor_Info_1 de una carpeta y corre los
// controles de bloqueo dos veces, el anterior (--anterior=<copia de
// controles-bloqueo.ts de main, en _shared/>) y el de ahora. No llama a nadie ni
// escribe en la base. El detalle por persona queda en research/ (fuera de git).
//
// Uso: node scripts/medir-bloqueos-o2.mjs --anterior=supabase/functions/_shared/controles-bloqueo-anterior.ts [--carpeta=research/proveedor-info-1-raw-2026-10-03]
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const PRINCIPAL = raizPrincipal(RAIZ);
const arg = (n, d) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? d;
const CARPETA = path.join(PRINCIPAL, arg("carpeta", "research/proveedor-info-1-raw-2026-10-03"));
const anterior = arg("anterior");
if (!anterior) {
  console.error("Falta --anterior=<controles-bloqueo.ts de main>");
  process.exit(1);
}
const { evaluarControlesBloqueo: ahora } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/controles-bloqueo.ts")).href);
const { evaluarControlesBloqueo: antes } = await import(pathToFileURL(path.resolve(RAIZ, anterior)).href);

const motivos = (r) => r.hallazgos.filter((h) => h.bloqueante).map((h) => h.code);
const porMotivo = {};
let personas = 0, bloqueadosAntes = 0, bloqueadosAhora = 0, desbloqueados = 0, conTope = 0;
const detalle = [];
for (const f of fs.readdirSync(CARPETA).filter((x) => x.endsWith(".json"))) {
  const { cedula, raw } = JSON.parse(fs.readFileSync(path.join(CARPETA, f), "utf8"));
  personas++;
  const a = antes(raw, cedula), b = ahora(raw, cedula);
  if (a.bloqueado) bloqueadosAntes++;
  if (b.bloqueado) bloqueadosAhora++;
  if (b.salidaMaxima === "revisar") conTope++;
  if (a.bloqueado && !b.bloqueado) {
    desbloqueados++;
    detalle.push({ cedula, motivosAntes: motivos(a), motivosAhora: motivos(b), salidaMaxima: b.salidaMaxima });
  }
  for (const m of new Set(motivos(a))) {
    porMotivo[m] ??= { antes: 0, desbloqueadosPorEse: 0, seguiriaBloqueadoPorOtro: 0 };
    porMotivo[m].antes++;
    if (!b.bloqueado) porMotivo[m].desbloqueadosPorEse++;
    else if (!motivos(b).includes(m)) porMotivo[m].seguiriaBloqueadoPorOtro++;
  }
}
const resumen = { carpeta: path.relative(PRINCIPAL, CARPETA), personas, bloqueadosAntes, bloqueadosAhora, desbloqueados, conTopeRevisar: conTope, porMotivo };
console.log(JSON.stringify(resumen, null, 1));
const salida = path.join(PRINCIPAL, "research", "medicion-bloqueos-o2.json");
fs.writeFileSync(salida, JSON.stringify({ ...resumen, detalle }, null, 1));
console.log(`detalle en ${path.relative(PRINCIPAL, salida)}`);
