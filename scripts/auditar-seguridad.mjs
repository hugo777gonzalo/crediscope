// Control de seguridad: repite las pruebas de la auditoría del 2026-10-09
// y dice, control por control, si sigue cerrado. Es el control mensual
// del procedimiento (auditoria/), y lo que hay que correr después de
// tocar permisos, políticas, funciones o la publicación.
//
//   node scripts/auditar-seguridad.mjs
//
// Dos partes:
//   1. El catálogo de la base viva (por el CLI de Supabase): RLS,
//      políticas, permisos del rol anónimo, funciones, vistas, depósitos,
//      la agenda de tareas y el registro de auditoría.
//   2. Pruebas desde afuera, como un atacante que sólo tiene la clave
//      pública de la página. Ninguna escribe datos ni consulta a una
//      persona: usan identificaciones inválidas, que la función rechaza
//      antes de llegar a la fuente.
//
// No imprime claves, cédulas ni filas: sólo conteos y estados. Sale con
// código 1 si algún control falla.
//
// AVISO: este guion no pasa por lint ni build. Si cambia el nombre de una
// tabla, de una función o la forma de la publicación, ajustarlo acá o el
// control mide otra cosa sin avisar.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync, rmSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const leerEnv = (archivo) =>
  Object.fromEntries(
    readFileSync(archivo, "utf8")
      .split(/\r?\n/)
      .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")])
  );

const front = leerEnv(".env");
const URL_SUPABASE = front.VITE_SUPABASE_URL;
const CLAVE_PUBLICA = front.VITE_SUPABASE_ANON_KEY;
// Para las pruebas del camino de los guiones (E4). Sin el archivo, esas
// pruebas se informan como no hechas.
const SERVICIO = existsSync(".env.functions") ? leerEnv(".env.functions") : {};
const SITIO = process.argv.find((a) => a.startsWith("--sitio="))?.slice("--sitio=".length) ?? "https://hugo777gonzalo.github.io/crediscope/";

const resultados = [];
const anotar = (area, control, ok, detalle = "", informativo = false) =>
  resultados.push({ area, control, estado: informativo ? "INFO" : ok ? "OK" : "FALLA", detalle });

// ---------------------------------------------------------------
// 1. Catálogo de la base
// ---------------------------------------------------------------
const SQL = `
select 'tabla_sin_rls' as k, c.relname as v from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
union all
select 'rls_sin_politicas', c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
  and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname)
union all
select 'anon_en_tabla', c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r','v','m')
  and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
       or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))
union all
select 'anon_en_funcion', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
union all
select 'definer_sin_search_path', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
union all
select 'vista_sin_invoker', c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'v'
  and coalesce((select option_value from pg_options_to_table(c.reloptions) where option_name = 'security_invoker'), 'false') not in ('on', 'true')
union all
select 'bucket_publico', id from storage.buckets where public
union all
select 'escritura_para_cualquier_usuario', tablename || '.' || policyname from pg_policies
  where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
  and coalesce(qual, '') || coalesce(with_check, '') ilike '%auth.role() = ''authenticated''%'
union all
select 'audit_inalterable', tgname from pg_trigger where tgrelid = 'public.audit_log'::regclass and tgname in ('audit_log_sin_cambios', 'audit_log_sin_vaciar')
union all
select 'cron_clave_en_texto', jobname from cron.job where command ilike '%x-vigia-clave%' and command not ilike '%vault.decrypted_secrets%'
union all
select 'audit_sin_actor_30d', count(*)::text from audit_log where actor is null
  -- Desde el arreglo del 2026-10-09: las 6 anteriores están explicadas en
  -- la auditoría (guiones con la clave de servicio sin responsable).
  and created_at > greatest(now() - interval '30 days', timestamptz '2026-10-09 20:00:00-05')
union all
select 'mfa_factores', count(*)::text from auth.mfa_factors where status = 'verified'
union all
select 'usuarios', coalesce(p.rol, 'sin_perfil') || '=' || count(*) from auth.users u left join profiles p on p.id = u.id group by p.rol
union all
select 'usuario_sin_ingreso_90d', count(*)::text from auth.users where coalesce(last_sign_in_at, created_at) < now() - interval '90 days'
union all
select 'version_esquema', max(version)::text from esquema_version
union all
-- Corridas de guiones que no se cerraron (ejecuciones_operativas, 117): un
-- guion que se cortó a la mitad sin que nadie lo explique.
select 'ejecucion_sin_cerrar', count(*)::text from ejecuciones_operativas
  where estado = 'en_curso' and iniciada_en < now() - interval '1 day'
union all
select 'ejecucion_sin_commit_30d', count(*)::text from ejecuciones_operativas
  where not arbol_limpio and iniciada_en > now() - interval '30 days'
union all
select 'ultimo_despliegue', coalesce((select commit_git || ' el ' || to_char(desplegado_en at time zone 'America/Guayaquil', 'YYYY-MM-DD HH24:MI')
  from despliegues order by desplegado_en desc limit 1), 'ninguno anotado')
`;

let filas = [];
const carpeta = mkdtempSync(path.join(tmpdir(), "auditar-"));
const archivoSql = path.join(carpeta, "catalogo.sql");
writeFileSync(archivoSql, SQL);
try {
  const salida = execSync(`npx --yes supabase@latest db query --linked --file "${archivoSql}" -o json`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const json = JSON.parse(salida.slice(salida.indexOf("{")));
  filas = json.rows ?? [];
} catch (e) {
  anotar("Base", "Leer el catálogo", false, `no se pudo consultar: ${String(e.message).split("\n")[0]}`);
} finally {
  rmSync(carpeta, { recursive: true, force: true });
}

if (filas.length > 0 || resultados.length === 0) {
  const de = (k) => filas.filter((f) => f.k === k).map((f) => f.v);
  const lista = (xs) => (xs.length ? xs.slice(0, 6).join(", ") + (xs.length > 6 ? ` (+${xs.length - 6})` : "") : "");
  for (const [k, control] of [
    ["tabla_sin_rls", "Toda tabla tiene RLS"],
    ["rls_sin_politicas", "Toda tabla con RLS tiene políticas"],
    ["anon_en_tabla", "El rol anónimo no tiene permisos en tablas ni vistas"],
    ["anon_en_funcion", "El rol anónimo no ejecuta funciones"],
    ["definer_sin_search_path", "Las funciones security definer fijan search_path"],
    ["vista_sin_invoker", "Las vistas son security_invoker"],
    ["bucket_publico", "Ningún depósito de Storage es público"],
    ["escritura_para_cualquier_usuario", "Ninguna política deja escribir a cualquier usuario con sesión"],
    ["cron_clave_en_texto", "La clave de la agenda vive en Vault, no en texto plano"],
  ]) {
    const xs = de(k);
    anotar("Base", control, xs.length === 0, lista(xs));
  }
  anotar("Base", "audit_log no se puede modificar ni borrar", de("audit_inalterable").length === 2, de("audit_inalterable").join(", "));
  const sinActor = Number(de("audit_sin_actor_30d")[0] ?? 0);
  anotar("Base", "Toda consulta de los últimos 30 días tiene responsable", sinActor === 0, `${sinActor} sin actor`);
  anotar("Usuarios", "Usuarios por rol", true, de("usuarios").join(", "), true);
  anotar("Usuarios", "Cuentas sin ingresar hace más de 90 días (revisar si siguen haciendo falta)", true, de("usuario_sin_ingreso_90d")[0] ?? "-", true);
  anotar("Usuarios", "Factores de doble autenticación (MFA pendiente de decidir)", true, de("mfa_factores")[0] ?? "-", true);

  // La base contra la última migración del repositorio (116): una base
  // atrasada es la deriva que el corredor existe para evitar.
  const ultima = Math.max(
    ...readdirSync("supabase/migrations").filter((f) => /^\d+_/.test(f)).map((f) => Number(f.match(/^\d+/)[0]))
  );
  const enLaBase = Number(de("version_esquema")[0] ?? 0);
  anotar("Base", "La base está en la última migración del repositorio", enLaBase === ultima, `base ${enLaBase || "sin control"}, repositorio ${ultima}`);
  anotar("Operación", "Corridas de guiones sin cerrar hace más de un día (se cortaron)", true, de("ejecucion_sin_cerrar")[0] ?? "-", true);
  anotar("Operación", "Corridas de guiones con cambios sin commit (30 días)", true, de("ejecucion_sin_commit_30d")[0] ?? "-", true);
  anotar("Operación", "Último despliegue anotado", true, de("ultimo_despliegue")[0] ?? "-", true);
}

// ---------------------------------------------------------------
// 1b. Ninguna cédula de un cliente real en el repositorio
// ---------------------------------------------------------------
// El repositorio fue público desde el 2026-10-04 y tenía 31 cédulas reales
// en 121 menciones (docs, comentarios del código, migraciones); el
// 2026-10-09 se reemplazaron por referencias c-xxxxxxxx (8 primeros
// caracteres de clients.id). Se cruzan los números de 10 dígitos de lo
// versionado con clients; las cédulas sintéticas de pruebas/aval/ no
// cuentan (Novadata no las conoce).
{
  const versionados = execSync("git ls-files", { encoding: "utf8" })
    .split(/\r?\n/)
    .filter((f) => f && !f.startsWith("pruebas/aval/") && f !== "package-lock.json");
  const sinteticas = new Set();
  const numeros = new Set();
  for (const f of execSync("git ls-files pruebas/aval", { encoding: "utf8" }).split(/\r?\n/).filter(Boolean)) {
    for (const n of readFileSync(f, "utf8").match(/\b\d{10}\b/g) ?? []) sinteticas.add(n);
  }
  for (const f of versionados) {
    let texto = "";
    try {
      texto = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const n of texto.match(/\b\d{10}\b/g) ?? []) if (!sinteticas.has(n)) numeros.add(n);
  }
  if (numeros.size === 0) {
    anotar("Repositorio", "Ninguna cédula de un cliente real en los archivos versionados", true, "0 números de 10 dígitos");
  } else {
    const carpetaC = mkdtempSync(path.join(tmpdir(), "auditar-"));
    const archivoC = path.join(carpetaC, "cedulas.sql");
    writeFileSync(archivoC, `select count(*)::int as n from clients where cedula in (${[...numeros].map((n) => `'${n}'`).join(",")});`);
    try {
      const salida = execSync(`npx --yes supabase@latest db query --linked --file "${archivoC}" -o json`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      const n = JSON.parse(salida.slice(salida.indexOf("{"))).rows?.[0]?.n ?? 0;
      anotar("Repositorio", "Ninguna cédula de un cliente real en los archivos versionados", n === 0, `${n} de ${numeros.size} números de 10 dígitos son de clientes`);
    } catch (e) {
      anotar("Repositorio", "Ninguna cédula de un cliente real en los archivos versionados", false, `no se pudo consultar: ${String(e.message).split("\n")[0]}`);
    } finally {
      rmSync(carpetaC, { recursive: true, force: true });
    }
  }
}

// ---------------------------------------------------------------
// 2. Desde afuera, con la clave pública
// ---------------------------------------------------------------
const h = { apikey: CLAVE_PUBLICA, Authorization: `Bearer ${CLAVE_PUBLICA}` };
const pedir = async (url, opciones = {}) => {
  try {
    const res = await fetch(url, opciones);
    const texto = await res.text();
    let cuerpo = null;
    try {
      cuerpo = JSON.parse(texto);
    } catch {
      /* no es JSON */
    }
    return { status: res.status, cuerpo, texto, headers: res.headers };
  } catch (e) {
    return { status: 0, error: e.message };
  }
};

const ajustes = await pedir(`${URL_SUPABASE}/auth/v1/settings`, { headers: { apikey: CLAVE_PUBLICA } });
anotar("Afuera", "El registro público de cuentas está cerrado", ajustes.cuerpo?.disable_signup === true, `disable_signup=${ajustes.cuerpo?.disable_signup}`);

for (const tabla of ["clients", "client_profiles", "analysis_results", "consultas_aval", "audit_log", "profiles", "lotes", "lab_solicitudes"]) {
  const r = await pedir(`${URL_SUPABASE}/rest/v1/${tabla}?select=*&limit=1`, { headers: h });
  const filasLeidas = Array.isArray(r.cuerpo) ? r.cuerpo.length : 0;
  anotar("Afuera", `Anónimo no lee ${tabla}`, filasLeidas === 0, `HTTP ${r.status}, ${filasLeidas} filas`);
}

for (const fn of ["metricas_gerenciales", "resumen_fuentes_ingreso", "lab_centro_de_datos", "crear_lote"]) {
  const r = await pedir(`${URL_SUPABASE}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json" },
    body: "{}",
  });
  anotar("Afuera", `Anónimo no ejecuta ${fn}`, r.status === 401 || r.status === 403 || r.status === 404, `HTTP ${r.status}`);
}

// Cuerpos que no apuntan a ninguna persona. consultar-aval valida la
// cédula ANTES del rol, así que con "abc" contesta 400 sin llegar a mirar
// la sesión; un pasaporte inventado pasa la validación (los tipos que no
// son cédula van tal cual) y llega al control de rol.
const cuerpos = {
  "structure-client": { cedula: "abc" },
  "analyze-client": { cedula: "abc" },
  "consultar-aval": { identificacion: "AUDITORIA-SIN-PERSONA", tipoIdentificacion: "P" },
  "explore-novadata": { username: "x", password: "x", cedula: "abc" },
};
for (const [fn, cuerpo] of Object.entries(cuerpos)) {
  const r = await pedir(`${URL_SUPABASE}/functions/v1/${fn}`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  anotar("Afuera", `${fn} rechaza la clave pública`, r.status === 401 || r.status === 403, `HTTP ${r.status}`);
}
for (const fn of ["vigia", "procesar-lote"]) {
  const r = await pedir(`${URL_SUPABASE}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-vigia-clave": "no-es-la-clave" },
    body: "{}",
  });
  anotar("Afuera", `${fn} rechaza una clave equivocada`, r.status === 401, `HTTP ${r.status}`);
}

// El camino de los guiones de structure-client (auditoría externa, E4).
// Hasta el 2026-10-09 se reconocía por el rol "service_role" leído del token
// sin verificar la firma: con verify_jwt apagado, un token armado a mano lo
// abría. Ahora exige x-guiones-clave. Estas pruebas tienen que dar lo mismo
// con verify_jwt prendido o apagado. Ninguna llega a la fuente: "abc" no es
// una cédula, y sin responsable el guion se rechaza antes.
{
  const b64url = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const fabricado = `${b64url({ alg: "none", typ: "JWT" })}.${b64url({ role: "service_role", iss: "supabase", exp: Math.floor(Date.now() / 1000) + 3600 })}.`;
  const sc = (cabeceras) =>
    pedir(`${URL_SUPABASE}/functions/v1/structure-client`, {
      method: "POST",
      headers: { "content-type": "application/json", ...cabeceras },
      body: JSON.stringify({ cedula: "abc" }),
    });
  const r1 = await sc({ apikey: CLAVE_PUBLICA, Authorization: `Bearer ${fabricado}` });
  anotar("Afuera", "structure-client rechaza un token fabricado que dice service_role", r1.status === 401, `HTTP ${r1.status}`);
  const r2 = await sc({ apikey: CLAVE_PUBLICA, Authorization: `Bearer ${fabricado}`, "x-guiones-clave": "no-es-la-clave" });
  anotar("Afuera", "structure-client rechaza una clave de guiones equivocada", r2.status === 401, `HTTP ${r2.status}`);
  if (SERVICIO.SUPABASE_SERVICE_ROLE_KEY) {
    const conServicio = { apikey: SERVICIO.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICIO.SUPABASE_SERVICE_ROLE_KEY}` };
    const r3 = await sc(conServicio);
    anotar("Afuera", "structure-client no acepta la clave de servicio sola (sin la de guiones)", r3.status === 401, `HTTP ${r3.status}`);
    if (SERVICIO.GUIONES_CLAVE) {
      const r4 = await sc({ ...conServicio, "x-guiones-clave": SERVICIO.GUIONES_CLAVE });
      // 400 por falta de responsable: la clave entró y el guion se rechaza
      // antes de mirar la cédula.
      anotar("Afuera", "structure-client acepta la clave de guiones y exige responsable", r4.status === 400 && /actorId/.test(r4.texto ?? ""), `HTTP ${r4.status}`);
    } else {
      anotar("Afuera", "structure-client acepta la clave de guiones", true, "no se probó: falta GUIONES_CLAVE en .env.functions", true);
    }
  }
}

// verify_jwt desplegado contra config.toml: el 2026-09-16 cuatro funciones
// se desplegaron con --no-verify-jwt "de una" y dos quedaron abiertas. Lo
// escrito en config.toml es lo que se revisa; lo desplegado tiene que
// coincidir.
try {
  // Línea por línea y sin comentarios: un comentario que mencione
  // verify_jwt no puede pasar por la configuración.
  const esperado = {};
  let seccion = null;
  for (const linea of readFileSync("supabase/config.toml", "utf8").split(/\r?\n/)) {
    const s = linea.match(/^\s*\[functions\.([a-z0-9-]+)\]\s*$/);
    if (s) seccion = s[1];
    else if (/^\s*\[/.test(linea)) seccion = null;
    const v = linea.match(/^\s*verify_jwt\s*=\s*(true|false)\s*(#.*)?$/);
    if (v && seccion) esperado[seccion] = v[1] === "true";
  }
  const salida = execSync("npx --yes supabase@latest functions list -o json", { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const desplegadas = JSON.parse(salida.slice(salida.indexOf("["), salida.lastIndexOf("]") + 1));
  const distintas = desplegadas
    .filter((f) => f.verify_jwt !== (esperado[f.slug] ?? true))
    .map((f) => `${f.slug}=${f.verify_jwt}`);
  anotar("Afuera", "verify_jwt de cada función desplegada coincide con config.toml", distintas.length === 0, distintas.join(", ") || `${desplegadas.length} funciones`);
} catch (e) {
  anotar("Afuera", "verify_jwt de cada función desplegada coincide con config.toml", false, `no se pudo leer: ${String(e.message).split("\n")[0]}`);
}

// Qué commit está desplegado (x-crediscope-version, auditoría externa E2).
// "sin-sello" = desplegada a mano, por fuera del corredor.
{
  const head = execSync("git rev-parse --short=12 HEAD", { encoding: "utf8" }).trim();
  const versiones = {};
  for (const fn of ["structure-client", "analyze-client", "consultar-aval", "explore-novadata", "vigia", "procesar-lote"]) {
    const r = await pedir(`${URL_SUPABASE}/functions/v1/${fn}`, { method: "OPTIONS" });
    versiones[fn] = r.headers?.get("x-crediscope-version") ?? "sin dato";
  }
  const distintas = [...new Set(Object.values(versiones))];
  const enLaHistoria = (v) => {
    try {
      execSync(`git merge-base --is-ancestor ${v} HEAD`, { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  };
  const detalle = Object.entries(versiones).map(([f, v]) => `${f}=${v}`).join(", ");
  if (distintas.some((v) => v === "sin dato" || v === "sin-sello" || !/^[0-9a-f]{7,40}$/.test(v))) {
    anotar("Afuera", "Las funciones desplegadas salen del corredor (con su commit)", false, detalle);
  } else if (distintas.some((v) => !enLaHistoria(v))) {
    anotar("Afuera", "Lo desplegado está en la historia del repositorio", false, detalle);
  } else {
    const alDia = distintas.length === 1 && distintas[0] === head;
    anotar("Afuera", "Versión desplegada de las funciones", true, alDia ? `${head} (la del repositorio)` : `${detalle}; el repositorio va por ${head}`, !alDia);
  }
}

const cors = await pedir(`${URL_SUPABASE}/functions/v1/structure-client`, {
  method: "OPTIONS",
  headers: { Origin: "https://sitio-ajeno.example", "Access-Control-Request-Method": "POST" },
});
const permitido = cors.headers?.get("access-control-allow-origin") ?? "";
anotar("Afuera", "Las funciones no aceptan pedidos de un sitio ajeno (CORS)", permitido !== "*" && permitido !== "https://sitio-ajeno.example", permitido);

for (const deposito of ["crudo-novadata", "lab-archivos"]) {
  const r = await pedir(`${URL_SUPABASE}/storage/v1/object/list/${deposito}`, {
    method: "POST",
    headers: { ...h, "content-type": "application/json" },
    body: JSON.stringify({ prefix: "", limit: 1 }),
  });
  const n = Array.isArray(r.cuerpo) ? r.cuerpo.length : 0;
  anotar("Afuera", `Anónimo no lista el depósito ${deposito}`, n === 0, `HTTP ${r.status}, ${n} objetos`);
}

// ---------------------------------------------------------------
// 3. El sitio publicado
// ---------------------------------------------------------------
const sitio = await pedir(SITIO);
if (sitio.status !== 200) {
  anotar("Sitio", `El sitio responde (${SITIO})`, false, `HTTP ${sitio.status}`);
} else {
  const cabeceras = ["content-security-policy", "x-frame-options", "x-content-type-options", "referrer-policy"];
  const faltan = cabeceras.filter((c) => !sitio.headers.get(c));
  // En GitHub Pages no se pueden poner cabeceras: se informa, no falla,
  // hasta que la publicación esté en Cloudflare (public/_headers).
  const enGithub = SITIO.includes("github.io");
  anotar("Sitio", "Cabeceras de seguridad", faltan.length === 0, faltan.length ? `faltan: ${faltan.join(", ")}` : "todas", enGithub && faltan.length > 0);
  const scripts = [...sitio.texto.matchAll(/src="([^"]+\.js)"/g)].map((m) => new URL(m[1], SITIO).href);
  for (const js of scripts) {
    const codigo = await (await fetch(js)).text();
    // Claves con su cuerpo, no el prefijo suelto: supabase-js trae el
    // texto "sb_secret_" para avisar si alguien pone una clave secreta en
    // el navegador, y eso no es una fuga.
    const secretos = [
      /sb_secret_[A-Za-z0-9_-]{20,}/,
      /sk-ant-[A-Za-z0-9_-]{20,}/,
      /"role"\s*:\s*"service_role"/,
      /eyJhbGciOi[A-Za-z0-9_-]{20,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl/,
      /NOVADATA_PASS/,
    ]
      .filter((re) => re.test(codigo))
      .map(String);
    anotar("Sitio", `Sin secretos en ${js.split("/").pop()}`, secretos.length === 0, secretos.join(", "));
    const mapa = await pedir(`${js}.map`);
    anotar("Sitio", "Sin mapas de fuente publicados", mapa.status !== 200, `HTTP ${mapa.status}`);
  }
}

// ---------------------------------------------------------------
console.log("");
let area = "";
for (const r of resultados) {
  if (r.area !== area) {
    area = r.area;
    console.log(`\n== ${area}`);
  }
  const marca = r.estado === "OK" ? "  OK   " : r.estado === "INFO" ? "  INFO " : "  FALLA";
  console.log(`${marca} ${r.control}${r.detalle ? `  [${r.detalle}]` : ""}`);
}
const fallas = resultados.filter((r) => r.estado === "FALLA").length;
console.log(`\n${fallas === 0 ? "Todo cerrado." : `${fallas} control(es) con falla.`} ${resultados.length} controles, ${new Date().toLocaleDateString("en-CA", { timeZone: "America/Guayaquil" })}.`);
process.exit(fallas === 0 ? 0 : 1);
