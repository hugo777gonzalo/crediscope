// Registro local de los casos reales que cita el repositorio.
//
// Desde el 2026-10-09 un caso real se cita como c-xxxxxxxx (los 8 primeros
// caracteres de clients.id), nunca con la cédula: el repositorio es
// público. Pero esos casos son el desarrollo mismo: cada regla de
// process.ts, de fuentes de ingreso o del marco salió de una persona
// concreta, y costaron tiempo y dinero. Este guion arma, FUERA del
// repositorio, el registro que dice qué cédula es cada referencia, dónde
// se cita y con qué texto, para volver a esos casos al mejorar una regla.
//
//   node scripts/registrar-casos-reales.mjs
//
// Escribe research/casos-reales/registro-de-casos.md (para leer) y
// registro-de-casos.json (para guiones). research/ está fuera de git: son
// datos personales. Por consola sólo salen conteos.
//
// También VALIDA: cada referencia del repositorio tiene que resolver a
// exactamente un cliente; si no, sale con código 1. Correrlo después de
// citar un caso nuevo.
//
// AVISO: este guion no pasa por lint ni build.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const SALIDA = path.join(RAIZ, "research", "casos-reales");
const REF = /\bc-[0-9a-f]{8}\b/g;
// El último commit con el texto original, antes del enmascarado: con
// `git show 0f4a768:<archivo>` se lee la línea tal como estaba (mientras
// el historial no se reescriba).
const COMMIT_ORIGINAL = "0f4a768";

// 1. Dónde se cita cada referencia
const archivos = execSync("git ls-files", { cwd: RAIZ, encoding: "utf8" })
  .split(/\r?\n/)
  .filter((f) => f && f !== "package-lock.json" && !f.startsWith("pruebas/aval/"));

const menciones = [];
for (const archivo of archivos) {
  let texto;
  try {
    texto = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
  } catch {
    continue;
  }
  if (!REF.test(texto)) continue;
  REF.lastIndex = 0;
  const lineas = texto.split(/\r?\n/);
  lineas.forEach((linea, i) => {
    for (const ref of linea.match(REF) ?? []) {
      menciones.push({
        ref,
        archivo,
        linea: i + 1,
        contexto: lineas.slice(Math.max(0, i - 2), i + 3).join("\n"),
      });
    }
  });
}
const refs = [...new Set(menciones.map((m) => m.ref))].sort();

// 2. Qué cliente es cada una (en la base; la cédula no sale por consola)
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "casos-"));
const archivoSql = path.join(carpeta, "casos.sql");
const prefijos = refs.map((r) => `'${r.slice(2)}'`).join(",");
fs.writeFileSync(
  archivoSql,
  `select left(c.id::text, 8) as prefijo, c.cedula, c.id::text as client_id, c.created_at::date::text as alta,
     (select count(*) from clients x where left(x.id::text, 8) = left(c.id::text, 8))::int as iguales,
     (select count(*) from client_profiles p where p.client_id = c.id)::int as perfiles,
     (select max(p.created_at)::date::text from client_profiles p where p.client_id = c.id) as ultima_consulta,
     (select count(*) from analysis_results a where a.client_id = c.id)::int as analisis,
     (select count(*) from consultas_aval v where v.client_id = c.id)::int as consultas_aval
   from clients c where left(c.id::text, 8) in (${prefijos || "''"});`
);
let clientes = [];
try {
  const salida = execSync(`npx --yes supabase@latest db query --linked --file "${archivoSql}" -o json`, {
    cwd: RAIZ,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  clientes = JSON.parse(salida.slice(salida.indexOf("{"))).rows ?? [];
} finally {
  fs.rmSync(carpeta, { recursive: true, force: true });
}

// 3. Validar y armar el registro
const casos = refs.map((ref) => {
  const encontrados = clientes.filter((c) => c.prefijo === ref.slice(2));
  const citas = menciones.filter((m) => m.ref === ref);
  return {
    ref,
    estado: encontrados.length === 1 ? "resuelve" : encontrados.length === 0 ? "NO RESUELVE" : "AMBIGUA",
    cliente: encontrados.length === 1 ? encontrados[0] : null,
    archivos: [...new Set(citas.map((c) => c.archivo))],
    citas,
  };
});
casos.sort((a, b) => b.citas.length - a.citas.length || a.ref.localeCompare(b.ref));
const malos = casos.filter((c) => c.estado !== "resuelve");

fs.mkdirSync(SALIDA, { recursive: true });
fs.writeFileSync(
  path.join(SALIDA, "registro-de-casos.json"),
  JSON.stringify({ generado: new Date().toISOString(), commitConTextoOriginal: COMMIT_ORIGINAL, casos }, null, 2)
);

const md = [];
md.push("# Registro de casos reales del desarrollo");
md.push("");
md.push(`Generado el ${new Date().toISOString().slice(0, 10)} por \`node scripts/registrar-casos-reales.mjs\`. **Datos personales: no sale de esta máquina ni va a git.** Se rearma solo; no editar a mano (las notas propias van en \`notas.md\`, al lado).`);
md.push("");
md.push(`Cada caso es una persona real que el repositorio cita como \`c-xxxxxxxx\` (8 primeros caracteres de \`clients.id\`). El texto citado es el actual; la línea original, con la cédula, se lee con \`git show ${COMMIT_ORIGINAL}:<archivo>\` mientras el historial no se reescriba.`);
md.push("");
md.push(`**${casos.length} casos, ${menciones.length} menciones en ${new Set(menciones.map((m) => m.archivo)).size} archivos.** ${malos.length === 0 ? "Todas las referencias resuelven a un único cliente." : `${malos.length} referencias NO resuelven: revisar.`}`);
md.push("");
md.push("| Referencia | Cédula | Menciones | Perfiles | Análisis | Última consulta | Dónde se cita |");
md.push("|---|---|---|---|---|---|---|");
for (const c of casos) {
  md.push(
    `| [${c.ref}](#${c.ref}) | ${c.cliente?.cedula ?? c.estado} | ${c.citas.length} | ${c.cliente?.perfiles ?? "-"} | ${c.cliente?.analisis ?? "-"} | ${c.cliente?.ultima_consulta ?? "-"} | ${c.archivos.map((a) => a.replace("supabase/functions/_shared/", "_shared/")).join(", ")} |`
  );
}
for (const c of casos) {
  md.push("");
  md.push(`## ${c.ref}`);
  md.push("");
  if (c.cliente) {
    md.push(`Cédula **${c.cliente.cedula}** · client_id \`${c.cliente.client_id}\` · alta ${c.cliente.alta} · ${c.cliente.perfiles} perfiles (último ${c.cliente.ultima_consulta ?? "-"}) · ${c.cliente.analisis} análisis · ${c.cliente.consultas_aval} consultas a Aval`);
  } else {
    md.push(`**${c.estado}**: ninguna fila de clients (o más de una) empieza con ${c.ref.slice(2)}.`);
  }
  for (const m of c.citas) {
    md.push("");
    md.push(`**${m.archivo}:${m.linea}**`);
    md.push("");
    md.push("```");
    md.push(m.contexto);
    md.push("```");
  }
}
fs.writeFileSync(path.join(SALIDA, "registro-de-casos.md"), md.join("\n") + "\n");

console.log(`${casos.length} casos, ${menciones.length} menciones en ${new Set(menciones.map((m) => m.archivo)).size} archivos.`);
console.log(malos.length === 0 ? "Todas las referencias resuelven a un único cliente." : `${malos.length} referencias NO resuelven: ${malos.map((m) => `${m.ref} (${m.estado})`).join(", ")}`);
console.log(`Registro en ${path.relative(RAIZ, SALIDA)}/ (fuera de git).`);
process.exit(malos.length === 0 ? 0 : 1);
