// Consulta explore-novadata para una lista de cédulas y CACHEA cada
// respuesta en research/novadata-raw/<cedula>.json — para poder ir
// enriqueciendo la muestra de diseño (estructura estandarizada) sin
// re-consultar Novadata cada vez que se agregan cédulas nuevas.
//
// Uso:
//   NOVADATA_USERNAME=hpichucho NOVADATA_PASSWORD=... \
//     node scripts/sample-novadata.mjs research/cedulas.txt
//
// research/cedulas.txt: una cédula por línea. Las que ya tengan un JSON
// cacheado en research/novadata-raw/ se saltan automáticamente — pasa
// --force para re-consultarlas todas igual.
//
// research/ está en .gitignore completo (son datos reales de clientes).

import fs from "node:fs";
import path from "node:path";

const FUNCTIONS_URL =
  process.env.CREDISCOPE_FUNCTIONS_URL ?? "https://ibrptvrjyclpmqbjdxyq.supabase.co/functions/v1";
const OUT_DIR = path.resolve("research/novadata-raw");
const FORCE = process.argv.includes("--force");
// Cuántas cédulas se consultan a la vez. Cada cédula dispara ~50
// recursos EN PARALELO dentro de explore-novadata, así que la carga
// real contra la fuente es concurrencia x 50 peticiones simultáneas.
// El default queda en 1 y subirlo es una decisión consciente.
const CONCURRENCIA = Math.max(
  1,
  Number(process.argv.find((a) => a.startsWith("--concurrency="))?.split("=")[1] ?? 1)
);
const listFile = process.argv.find((a) => !a.startsWith("--") && a.endsWith(".txt"));

if (!listFile) {
  console.error("Uso: node scripts/sample-novadata.mjs <archivo-de-cedulas.txt> [--force]");
  process.exit(1);
}

const username = process.env.NOVADATA_USERNAME;
const password = process.env.NOVADATA_PASSWORD;
if (!username || !password) {
  console.error("Faltan NOVADATA_USERNAME / NOVADATA_PASSWORD en el entorno.");
  process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });

const cedulas = fs
  .readFileSync(listFile, "utf8")
  .split(/\r?\n/)
  .map((l) => l.trim())
  .filter(Boolean);

console.log(`Cédulas en la lista: ${cedulas.length}`);

let consultadas = 0;
let saltadas = 0;
let fallidas = 0;

const total = cedulas.length;

async function consultarUna(cedula) {
  const outFile = path.join(OUT_DIR, `${cedula}.json`);
  if (!FORCE && fs.existsSync(outFile)) {
    saltadas++;
    return;
  }
  try {
    const res = await fetch(`${FUNCTIONS_URL}/explore-novadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, cedula }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.log(`${cedula}: ERROR HTTP ${res.status} — ${data?.error ?? "?"}`);
      fallidas++;
      return;
    }
    fs.writeFileSync(outFile, JSON.stringify(data));
    consultadas++;
  } catch (err) {
    console.log(`${cedula}: ERROR ${String(err)}`);
    fallidas++;
  }
  const hechas = consultadas + fallidas + saltadas;
  if (hechas % 10 === 0 || hechas === total) {
    console.log(`avance ${hechas}/${total} — ok: ${consultadas} | fallidas: ${fallidas} | en caché: ${saltadas}`);
  }
}

// Pool de trabajadores sobre una cola compartida: mantiene CONCURRENCIA
// consultas vivas todo el tiempo, en vez de avanzar por tandas (donde
// cada tanda espera a la cédula más lenta antes de empezar la
// siguiente, y algunas tardan 50s contra 11s de otras).
const cola = [...cedulas];
console.log(`Consultando con ${CONCURRENCIA} hilo(s) en paralelo...`);
await Promise.all(
  Array.from({ length: CONCURRENCIA }, async () => {
    for (let cedula = cola.shift(); cedula; cedula = cola.shift()) {
      await consultarUna(cedula);
    }
  })
);

console.log(`\nListo. Nuevas: ${consultadas} | Ya en caché (saltadas): ${saltadas} | Fallidas: ${fallidas}`);
console.log(`Total en caché ahora: ${fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).length}`);
