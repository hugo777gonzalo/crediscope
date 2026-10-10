// El corredor de migraciones: aplica las migraciones del repositorio a
// TODAS las bases del directorio (clientes/directorio.json), en orden, y
// registra cada una en esquema_version (116). Es la pieza 1 de
// docs/plan-segundo-cliente.md: con una base por cliente, aplicar a mano
// una por una es como una base se queda atrás sin que nadie se entere.
//
//   node scripts/migrar-clientes.mjs
//       Estado: la versión de cada base contra la última migración.
//   node scripts/migrar-clientes.mjs --seco [--cliente=<clave>]
//       Qué se aplicaría, sin tocar nada.
//   node scripts/migrar-clientes.mjs --aplicar [--cliente=<clave>]
//       Aplica lo que falta. Cada migración va en una transacción junto con
//       su fila en esquema_version: o entran las dos o ninguna. En una base
//       se detiene en la primera que falle y sigue con la siguiente base.
//   node scripts/migrar-clientes.mjs --funciones [--cliente=<clave>]
//       Despliega las Edge Functions en cada base (después de migrar: el
//       código nuevo puede necesitar el esquema nuevo, ver
//       _shared/version-esquema.ts). Sólo despliega un commit sin cambios
//       pendientes que ya esté en origin/main, sella ese commit en las
//       funciones (encabezado x-crediscope-version) y lo anota en la tabla
//       despliegues (117). Hasta el 2026-10-09 nada decía qué código corría
//       en cada función (auditoría externa, E2).
//   node scripts/migrar-clientes.mjs --iniciar --cliente=<clave>
//       Sólo para una base que ya tiene aplicadas a mano las 001 a 115 (la
//       plantilla): aplica la 116, que crea el control de versión.
//
// Marcadores (<<PROYECTO_URL>>, <<VIGIA_CLAVE>>...): se rellenan desde el
// archivo de secretos de cada base, en un temporal que se borra después
// (regla 3 de CLAUDE.md). PROYECTO_URL sale del directorio. Una migración
// con un marcador sin valor no se aplica.
//
// Una base NUEVA (cliente nuevo) no se arma con este corredor desde cero:
// las 001-115 tienen datos y arreglos de esta base y no se probó
// reproducirlas en una vacía. Ver docs/cumplimiento/alta-de-un-cliente-nuevo.md.
//
// AVISO: este guion no pasa por lint ni build. No imprime secretos.

import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const opcion = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const bandera = (n) => process.argv.includes(`--${n}`);

const directorio = JSON.parse(fs.readFileSync(path.join(RAIZ, "clientes", "directorio.json"), "utf8"));
const soloCliente = opcion("cliente");
const clientes = directorio.clientes.filter((c) => !soloCliente || c.clave === soloCliente);
if (clientes.length === 0) {
  console.error(`No hay ningún cliente "${soloCliente}" en clientes/directorio.json.`);
  process.exit(1);
}

const migraciones = fs
  .readdirSync(path.join(RAIZ, "supabase", "migrations"))
  .filter((f) => /^\d+_.*\.sql$/.test(f))
  .map((f) => ({ numero: Number(f.match(/^(\d+)/)[1]), archivo: f }))
  .sort((a, b) => a.numero - b.numero);
const ULTIMA = migraciones.at(-1).numero;

const leerSecretos = (archivo) => {
  const ruta = path.join(RAIZ, archivo ?? "");
  if (!archivo || !fs.existsSync(ruta)) return {};
  return Object.fromEntries(
    fs.readFileSync(ruta, "utf8").split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()])
  );
};

// Corre SQL contra una base por la API de gestión (el CLI con la sesión
// iniciada). El SQL va en un temporal porque puede llevar secretos.
function correrSql(proyecto, sql, secretos = []) {
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), "migrar-"));
  const archivo = path.join(carpeta, "consulta.sql");
  fs.writeFileSync(archivo, sql);
  try {
    const salida = execSync(`npx --yes supabase@latest db query --linked --project-ref ${proyecto} --file "${archivo}" -o json`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const json = salida.includes("{") ? JSON.parse(salida.slice(salida.indexOf("{"))) : {};
    return { ok: true, filas: json.rows ?? [] };
  } catch (e) {
    let mensaje = String(e.stderr || e.message);
    for (const s of secretos) if (s) mensaje = mensaje.replaceAll(s, "***");
    return { ok: false, error: mensaje.split("\n").filter(Boolean).slice(0, 3).join(" | ") };
  } finally {
    fs.rmSync(carpeta, { recursive: true, force: true });
  }
}

function versionDe(cliente) {
  // query_to_xml corre la consulta sólo si se llega a evaluar: una
  // subconsulta directa a esquema_version falla al analizarse en una base
  // que todavía no tiene la tabla, aunque el case no la alcance.
  const r = correrSql(
    cliente.proyecto,
    "select case when to_regclass('public.esquema_version') is null then null else (xpath('/row/v/text()', query_to_xml('select max(version) as v from public.esquema_version', false, true, '')))[1]::text::int end as version;"
  );
  if (!r.ok) return { error: r.error };
  return { version: r.filas[0]?.version ?? null };
}

function rellenar(sql, cliente, secretos) {
  const valores = { PROYECTO_URL: cliente.url, ...secretos };
  const faltan = [];
  const lleno = sql.replace(/<<([A-Z_]+)>>/g, (m, nombre) => {
    if (valores[nombre] === undefined || valores[nombre] === "") {
      faltan.push(nombre);
      return m;
    }
    return valores[nombre];
  });
  return { lleno, faltan: [...new Set(faltan)] };
}

function aplicar(cliente, migracion) {
  const secretos = leerSecretos(cliente.secretos);
  const original = fs.readFileSync(path.join(RAIZ, "supabase", "migrations", migracion.archivo), "utf8");
  const { lleno, faltan } = rellenar(original, cliente, secretos);
  if (faltan.length) return { ok: false, error: `faltan valores para ${faltan.join(", ")} en ${cliente.secretos}` };
  // Una migración que maneja su propia transacción (como la 112) no se
  // envuelve: begin dentro de begin rompe. Las nuevas no deberían hacerlo.
  const propia = /^\s*(begin|commit)\s*;/im.test(original);
  const registro = `insert into esquema_version (version, archivo, aplicada_por) values (${migracion.numero}, '${migracion.archivo.replaceAll("'", "''")}', 'corredor');`;
  const sql = propia ? `${lleno}\n;\n${registro}\n` : `begin;\n${lleno}\n;\n${registro}\ncommit;\n`;
  return correrSql(cliente.proyecto, sql, Object.values(secretos));
}

const modo = bandera("aplicar") ? "aplicar" : bandera("seco") ? "seco" : bandera("funciones") ? "funciones" : bandera("iniciar") ? "iniciar" : "estado";
let fallas = 0;

if (modo === "iniciar") {
  if (!soloCliente) {
    console.error("--iniciar va con --cliente=<clave>: es una base por vez.");
    process.exit(1);
  }
  const cliente = clientes[0];
  const actual = versionDe(cliente);
  if (actual.error) throw new Error(actual.error);
  if (actual.version !== null) {
    console.log(`${cliente.clave} ya tiene control de versión (en la ${actual.version}).`);
    process.exit(0);
  }
  const la116 = migraciones.find((m) => m.numero === 116);
  const r = aplicar(cliente, la116);
  console.log(r.ok ? `${cliente.clave}: control de versión creado (116).` : `${cliente.clave}: FALLÓ la 116: ${r.error}`);
  process.exit(r.ok ? 0 : 1);
}

// El sello del despliegue: el commit, escrito en version-despliegue.ts sólo
// mientras dura el despliegue. Al salir, pase lo que pase, el archivo
// vuelve a decir "sin-sello" (process.on("exit") corre también si algo
// revienta a la mitad).
let sello = null;
if (modo === "funciones") {
  const git = (args) => execSync(`git ${args}`, { cwd: RAIZ, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (git("status --porcelain --untracked-files=no") !== "") {
    console.error("Hay cambios sin guardar en git: sólo se despliega código commiteado.");
    process.exit(1);
  }
  git("fetch origin main --quiet");
  try {
    git("merge-base --is-ancestor HEAD origin/main");
  } catch {
    console.error("Este commit no está en origin/main: primero se integra (PR a main) y después se despliega.");
    process.exit(1);
  }
  sello = git("rev-parse --short=12 HEAD");
  const archivoVersion = path.join(RAIZ, "supabase", "functions", "_shared", "version-despliegue.ts");
  const original = fs.readFileSync(archivoVersion, "utf8");
  if (!original.includes('"sin-sello"')) {
    console.error(`${archivoVersion} no dice "sin-sello": quedó sellado de un despliegue anterior. Restaurarlo con git antes de seguir.`);
    process.exit(1);
  }
  fs.writeFileSync(archivoVersion, original.replace('"sin-sello"', `"${sello}"`));
  process.on("exit", () => fs.writeFileSync(archivoVersion, original));
}
const FUNCIONES = fs
  .readdirSync(path.join(RAIZ, "supabase", "functions"), { withFileTypes: true })
  .filter((d) => d.isDirectory() && !d.name.startsWith("_"))
  .map((d) => d.name);

console.log(`Última migración del repositorio: ${ULTIMA}\n`);
for (const cliente of clientes) {
  const actual = versionDe(cliente);
  if (actual.error) {
    console.log(`${cliente.clave.padEnd(14)} NO SE PUDO LEER: ${actual.error}`);
    fallas++;
    continue;
  }
  if (actual.version === null) {
    console.log(`${cliente.clave.padEnd(14)} sin control de versión (falta la 116: --iniciar --cliente=${cliente.clave})`);
    fallas++;
    continue;
  }
  const pendientes = migraciones.filter((m) => m.numero > actual.version);
  const estado = pendientes.length === 0 ? "al día" : `ATRASADA: le faltan ${pendientes.length}`;
  console.log(`${cliente.clave.padEnd(14)} en la ${actual.version}  ${estado}`);

  if (modo === "seco") for (const m of pendientes) console.log(`               aplicaría ${m.archivo}`);

  if (modo === "aplicar") {
    for (const m of pendientes) {
      const r = aplicar(cliente, m);
      if (!r.ok) {
        console.log(`               FALLÓ ${m.archivo}: ${r.error}`);
        console.log(`               ${cliente.clave} queda en la ${versionDe(cliente).version}; se sigue con la próxima base.`);
        fallas++;
        break;
      }
      console.log(`               aplicada ${m.archivo}`);
    }
  }

  if (modo === "funciones") {
    if (pendientes.length) {
      console.log("               no se despliega: primero migrar (--aplicar)");
      fallas++;
      continue;
    }
    // De a una función, y comprobando después que cada una contesta con el
    // sello. El 2026-10-09 el despliegue de todas juntas (`functions
    // deploy` sin nombre) dijo que había terminado bien y subió el archivo
    // sin sellar; la segunda vez falló con TransportError en las seis. De a
    // una, el mismo código salió sellado. Un despliegue no se da por hecho
    // hasta que la función lo confirma.
    const desplegadas = [];
    for (const funcion of FUNCIONES) {
      try {
        execSync(`npx --yes supabase@latest functions deploy ${funcion} --project-ref ${cliente.proyecto}`, {
          cwd: RAIZ,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        });
      } catch (e) {
        console.log(`               FALLÓ ${funcion}: ${String(e.stderr || e.message).split("\n").filter(Boolean).slice(-2).join(" | ")}`);
        fallas++;
        continue;
      }
      // La versión vieja puede contestar unos segundos más.
      let contesta = "sin respuesta";
      for (let intento = 1; intento <= 6 && contesta !== sello; intento++) {
        try {
          const r = await fetch(`${cliente.url}/functions/v1/${funcion}`, { method: "OPTIONS" });
          contesta = r.headers.get("x-crediscope-version") ?? "sin encabezado";
        } catch (e) {
          contesta = `sin respuesta (${e.message})`;
        }
        if (contesta !== sello) await new Promise((r) => setTimeout(r, 5_000));
      }
      if (contesta === sello) {
        desplegadas.push(funcion);
      } else {
        console.log(`               ${funcion}: desplegada pero contesta "${contesta}" y no ${sello}`);
        fallas++;
      }
    }
    console.log(`               desplegadas y confirmadas ${desplegadas.length} de ${FUNCIONES.length} (${sello})`);
    if (desplegadas.length) {
      const texto = (s) => `'${String(s).replaceAll("'", "''")}'`;
      const anotado = correrSql(
        cliente.proyecto,
        `insert into despliegues (base, commit_git, funciones, esquema, usuario_equipo) values (${texto(cliente.clave)}, ${texto(sello)}, array[${desplegadas.map(texto).join(", ")}]::text[], ${actual.version}, ${texto(os.userInfo().username)});`
      );
      if (anotado.ok) {
        console.log("               anotado en despliegues");
      } else {
        console.log(`               desplegado pero NO anotado en despliegues: ${anotado.error}`);
        fallas++;
      }
    }
  }
}
process.exit(fallas ? 1 : 0);
