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

for (const cedula of cedulas) {
  const outFile = path.join(OUT_DIR, `${cedula}.json`);
  if (!FORCE && fs.existsSync(outFile)) {
    saltadas++;
    continue;
  }
  process.stdout.write(`Consultando ${cedula}... `);
  try {
    const res = await fetch(`${FUNCTIONS_URL}/explore-novadata`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, cedula }),
    });
    const data = await res.json();
    if (!res.ok) {
      console.log(`ERROR HTTP ${res.status}: ${data?.error ?? "?"}`);
      fallidas++;
      continue;
    }
    fs.writeFileSync(outFile, JSON.stringify(data));
    console.log(`OK (${JSON.stringify(data).length} bytes)`);
    consultadas++;
  } catch (err) {
    console.log("ERROR:", String(err));
    fallidas++;
  }
}

console.log(`\nListo. Nuevas: ${consultadas} | Ya en caché (saltadas): ${saltadas} | Fallidas: ${fallidas}`);
console.log(`Total en caché ahora: ${fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".json")).length}`);
