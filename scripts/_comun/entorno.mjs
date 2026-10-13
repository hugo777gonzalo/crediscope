// Dónde viven los archivos que no están en git (.env.functions, research/) y
// cómo se leen, para los guiones que corren desde un worktree.
//
// Un worktree es una copia del repositorio sin lo que git ignora: no trae
// .env.functions ni research/. Copiar los secretos a cada worktree los
// multiplica; en cambio se leen de la carpeta principal, que es donde ya
// están protegidos. `git rev-parse --git-common-dir` apunta al .git de esa
// carpeta desde cualquier worktree.
//
// Los secretos se leen del archivo y no se imprimen nunca.
//
// AVISO: este archivo no pasa por lint ni build.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/** La carpeta principal del repositorio (la misma raíz si no es un worktree). */
export function raizPrincipal(raiz) {
  try {
    const comun = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
      cwd: raiz,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return path.dirname(comun);
  } catch {
    return raiz;
  }
}

/**
 * Lee .env.functions (de la raíz dada o, si no está, de la carpeta principal)
 * y lo vuelca en process.env sin pisar lo que ya esté definido.
 * Devuelve la ruta que usó, nunca los valores.
 */
export function cargarEntorno(raiz) {
  const archivo = [path.join(raiz, ".env.functions"), path.join(raizPrincipal(raiz), ".env.functions")].find((a) => fs.existsSync(a));
  if (!archivo) throw new Error("No se encontró .env.functions ni en esta carpeta ni en la principal.");
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    if (!linea.includes("=") || linea.trimStart().startsWith("#")) continue;
    const i = linea.indexOf("=");
    const clave = linea.slice(0, i).trim();
    if (clave && process.env[clave] === undefined) process.env[clave] = linea.slice(i + 1).trim();
  }
  return archivo;
}

/** Una carpeta de research/ en la raíz principal (fuera de git: datos personales). */
export function carpetaDeResearch(raiz, ...partes) {
  const carpeta = path.join(raizPrincipal(raiz), "research", ...partes);
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}
