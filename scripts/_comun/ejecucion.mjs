// Constancia de cada corrida de un guion que escribe en la base
// (tabla ejecuciones_operativas, 117; auditoría externa del 2026-10-09, E3).
//
// Hasta ese día, 19 de los 26 guiones usaban la clave de servicio contra la
// única base, que es producción, y sólo 4 dejaban rastro. Un recálculo con
// un error cambiaba perfiles reales y no quedaba quién lo corrió, cuándo,
// con qué parámetros, con qué código ni cuántas filas tocó.
//
// Uso, una línea al principio del guion, después de leer el entorno:
//
//   import { abrirEjecucion } from "./_comun/ejecucion.mjs";
//   const ejecucion = await abrirEjecucion({ url, clave, guion: "recalcular-grupos", seco: SECO });
//   ...
//   ejecucion.sumarFilas(n);                 // opcional, cuántas filas tocó
//   ejecucion.anotar({ perfiles: 2572 });    // opcional, lo que convenga
//
// No hace falta cerrarla: al salir el proceso se cierra sola, "terminada" si
// salió con código 0 y "fallida" si no (con el último error, si lo hubo).
// Un corte de luz la deja "en_curso": el control de seguridad la señala.
//
// Reglas:
// - Una corrida en seco no escribe y no se registra.
// - Con cambios sin guardar en git no corre: el commit que se anota tiene
//   que ser el código que corrió. --sin-commit lo permite igual y queda
//   anotado (arbol_limpio = false).
// - Si no se puede registrar, no corre: sin constancia no se toca la base.
// - Números de 10 dígitos en los argumentos se enmascaran: una cédula no va
//   en un registro operativo.
//
// AVISO: este archivo no pasa por lint ni build.

import { execFileSync, execSync } from "node:child_process";
import os from "node:os";

const enmascarar = (texto) => String(texto).replace(/\b\d{10}\b/g, "##########");

const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return null;
  }
};

const SIN_REGISTRO = Object.freeze({ id: null, sumarFilas() {}, anotar() {} });

export async function abrirEjecucion({ url, clave, guion, seco = false, argumentos = process.argv.slice(2) }) {
  if (seco) return SIN_REGISTRO;
  if (!url || !clave) throw new Error("abrirEjecucion: falta la URL de la base o la clave de servicio");

  const commit = git("rev-parse HEAD") ?? "desconocido";
  const cambios = git("status --porcelain --untracked-files=no");
  const arbolLimpio = cambios === "";
  if (!arbolLimpio && !argumentos.includes("--sin-commit")) {
    console.error(
      "Hay cambios sin guardar en git: el commit que se anota no sería el código que corre.\n" +
        "Guardá los cambios (commit) primero, o corré con --sin-commit (queda anotado)."
    );
    process.exit(1);
  }

  const cabeceras = { apikey: clave, Authorization: `Bearer ${clave}`, "content-type": "application/json" };
  const res = await fetch(`${url}/rest/v1/ejecuciones_operativas`, {
    method: "POST",
    headers: { ...cabeceras, Prefer: "return=representation" },
    body: JSON.stringify({
      guion,
      modo: "aplicar",
      argumentos: argumentos.map(enmascarar),
      commit_git: commit,
      arbol_limpio: arbolLimpio,
      usuario_equipo: os.userInfo().username,
    }),
  });
  if (!res.ok) {
    console.error(`No se pudo registrar la ejecución (HTTP ${res.status}): ${enmascarar(await res.text()).slice(0, 300)}`);
    console.error("Sin constancia no se toca la base. ¿Falta aplicar la 117?");
    process.exit(1);
  }
  const [fila] = await res.json();
  console.log(`Ejecución registrada: ${fila.id}`);

  let filas = null;
  let detalle = {};
  let ultimoError = null;
  process.on("uncaughtExceptionMonitor", (err) => {
    ultimoError = err?.message ?? String(err);
  });

  // El cierre corre en el evento "exit", que no espera nada asíncrono: por
  // eso el aviso a la base sale por un proceso hijo sincrónico. La clave va
  // por el entorno del hijo, no en la línea de comandos.
  process.on("exit", (codigo) => {
    const cierre = {
      estado: codigo === 0 ? "terminada" : "fallida",
      filas,
      detalle,
      error: codigo === 0 ? null : enmascarar(ultimoError ?? `salió con código ${codigo}`).slice(0, 1000),
      terminada_en: new Date().toISOString(),
    };
    const avisar =
      "fetch(process.env.EJ_URL + '/rest/v1/ejecuciones_operativas?id=eq.' + process.env.EJ_ID, {" +
      " method: 'PATCH', headers: { apikey: process.env.EJ_CLAVE, Authorization: 'Bearer ' + process.env.EJ_CLAVE," +
      " 'content-type': 'application/json' }, body: process.env.EJ_CUERPO })" +
      ".then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1));";
    try {
      execFileSync(process.execPath, ["-e", avisar], {
        env: { ...process.env, EJ_URL: url, EJ_CLAVE: clave, EJ_ID: fila.id, EJ_CUERPO: JSON.stringify(cierre) },
        stdio: "ignore",
        timeout: 15_000,
      });
    } catch {
      console.error(`No se pudo cerrar la ejecución ${fila.id}: queda "en_curso" y el control de seguridad la va a señalar.`);
    }
  });

  return {
    id: fila.id,
    sumarFilas(n) {
      filas = (filas ?? 0) + (Number(n) || 0);
    },
    anotar(datos) {
      detalle = { ...detalle, ...datos };
    },
  };
}
