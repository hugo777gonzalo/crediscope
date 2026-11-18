// La comparación en seco de la capa de hechos (docs/capa-de-hechos.md, sección 5).
//
// Por persona, con el reloj del perfil fijado en `capturadoEl`:
//   1. arma el perfil con `buildStandardProfile` (el código de hoy);
//   2. deriva los hechos con `derivarHechos` (sin fijar el reloj: no lo usa);
//   3. paridad: `perfilDesdeHechos` contra cada grupo del perfil que arman los
//      grupos elegidos, campo por campo y con las claves ordenadas, y todo campo
//      de esos grupos tiene su código en el catálogo;
//   4. procedencia: todo registro citado (hechos, descartes, diferencias y
//      vistas de las entidades) existe en el crudo;
//   5. recuento independiente: lo que el catálogo declara como suma, conteo o
//      máximo se vuelve a calcular desde los registros citados, leyendo el crudo
//      con este código y no con el de la regla;
//   6. con --deposito, además, el grupo guardado en la base contra el del paso 1
//      (informativo: un perfil que quedó sin recalcular no decide nada).
// Con --medir agrega los bytes en JSON y en gzip y el tiempo de derivar, contra
// el presupuesto del diseño (2.3): p99 por debajo de 16 KB en gzip y de 50 ms.
//
// Una diferencia de paridad donde alguna fuente del hecho no contestó se cuenta
// aparte: hoy el perfil escribe 0 o false cuando la fuente falla, y el hecho dice
// «no disponible». Ésa es una diferencia explicada, no un error de la regla.
//
// SOLO LEE. Sin --deposito, sólo el respaldo local del crudo. Con --deposito, el
// último perfil de cada persona real (client_profiles por PostgREST, sólo
// lectura) y su crudo de la carpeta o del depósito. No llama a Proveedor_Info_1,
// a Equifax ni al modelo, y no escribe en la base. El detalle, con montos, va a
// research/comparar-hechos/ (fuera de git); por consola, conteos y referencias
// p-xxxxxxxx (el perfil), nunca una cédula.
//
// Sale con 1 si hay una diferencia de paridad sin explicar, un campo sin
// procedencia, un registro que no resuelve, un recuento que no cuadra o, con
// --medir, si el p99 pasa el presupuesto.
//
// Uso:
//   node scripts/comparar-hechos.mjs [--grupo=comportamientoBancario,cooperativas] [--medir]
//     [--carpeta=research/proveedor-info-1-raw-2026-10-03] [--deposito] [--limite=N]
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo
// con --limite=5 antes de confiar en los números.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { performance } from "node:perf_hooks";
import { fileURLToPath, pathToFileURL } from "node:url";
import { candidatosDelUltimoPerfil, leerCrudo } from "./_comun/crudo-del-ultimo-perfil.mjs";
import { cargarEntorno, raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, ...v] = a.replace(/^--/, "").split("=");
    return [k, v.length ? v.join("=") : true];
  }),
);

const PRINCIPAL = raizPrincipal(RAIZ);
const CARPETA = path.resolve(PRINCIPAL, typeof args.carpeta === "string" ? args.carpeta : "research/proveedor-info-1-raw-2026-10-03");
if (!fs.existsSync(CARPETA)) {
  console.error("No existe la carpeta del respaldo del crudo.");
  process.exit(1);
}
const LIMITE = args.limite ? Number(args.limite) : Infinity;
const importar = (ruta) => import(pathToFileURL(path.join(RAIZ, ruta)).href);
const { derivarHechos, GRUPOS } = await importar("supabase/functions/_shared/hechos/indice.ts");
const { perfilDesdeHechos, gruposDelPerfil } = await importar("supabase/functions/_shared/hechos/perfil-desde-hechos.ts");
const { buildStandardProfile } = await importar("supabase/functions/_shared/process.ts");

const conCodigos = Object.keys(GRUPOS).filter((g) => GRUPOS[g].CATALOGO.length > 0);
const ELEGIDOS = typeof args.grupo === "string" ? args.grupo.split(",") : conCodigos;
for (const g of ELEGIDOS) {
  if (!GRUPOS[g]) {
    console.error(`No existe el grupo «${g}». Con códigos: ${conCodigos.join(", ") || "ninguno"}.`);
    process.exit(1);
  }
}
const CATALOGO = new Map(Object.values(GRUPOS).flatMap((g) => g.CATALOGO.map((c) => [c.codigo, c])));
const PERFIL_DE = Object.fromEntries(ELEGIDOS.map((g) => [g, gruposDelPerfil(GRUPOS[g].CATALOGO)]));
const ESPERADAS = new Set(ELEGIDOS.flatMap((g) => (GRUPOS[g].DIFERENCIAS_ESPERADAS ?? []).map((d) => d.campo)));
// Los campos que un grupo declara pendientes, con su porqué: se informan aparte.
const PENDIENTES = new Map(ELEGIDOS.flatMap((g) => (GRUPOS[g].CAMPOS_PENDIENTES ?? []).map((p) => [p.campo, p.motivo])));
const pendientesVistos = new Set();

// ---- De dónde salen los crudos ----

let candidatos;
let guardadoDe = async () => new Map();
if (args.deposito) {
  cargarEntorno(RAIZ);
  const cabeceras = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  const pedir = async (ruta) => {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, { headers: cabeceras });
    const texto = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
    return JSON.parse(texto);
  };
  // Sólo personas reales: las 240 sintéticas de Aval no cuentan (118).
  const sinteticas = new Set();
  for (let despues = null; ; ) {
    const filas = await pedir(`clients?select=id&es_sintetico=eq.true&order=id&limit=1000${despues ? `&id=gt.${despues}` : ""}`);
    for (const f of filas) sinteticas.add(f.id);
    if (filas.length < 1000) break;
    despues = filas.at(-1).id;
  }
  const ultimoPorCliente = new Map();
  for (let despues = null; ; ) {
    const filas = await pedir(`client_profiles?select=id,client_id,created_at,crudo_ruta&order=id&limit=1000${despues ? `&id=gt.${despues}` : ""}`);
    for (const p of filas) {
      if (sinteticas.has(p.client_id)) continue;
      const a = ultimoPorCliente.get(p.client_id);
      if (!a || p.created_at > a.created_at) ultimoPorCliente.set(p.client_id, p);
    }
    if (filas.length === 0) break;
    despues = filas.at(-1).id;
  }
  const r = candidatosDelUltimoPerfil(CARPETA, ultimoPorCliente);
  console.log(`Personas reales: ${ultimoPorCliente.size}; crudo en la carpeta ${r.cuenta.enLaCarpeta}, en el depósito ${r.cuenta.delDeposito}, sin crudo ${r.cuenta.sinCrudo}.`);
  // Un caso real se cita como c-xxxxxxxx (CLAUDE.md): el id de la persona.
  const clientePorPerfil = new Map([...ultimoPorCliente.values()].map((p) => [p.id, p.client_id]));
  candidatos = r.candidatos.map((c) => ({ ...c, cita: `c-${clientePorPerfil.get(c.perfilId).slice(0, 8)}`, leer: () => leerCrudo(c, process.env.SUPABASE_URL, cabeceras) }));
  guardadoDe = async (ids) => {
    const filas = await pedir(`client_profiles?id=in.(${ids.join(",")})&select=id,standard_profile`);
    return new Map(filas.map((f) => [f.id, f.standard_profile]));
  };
} else {
  candidatos = fs.readdirSync(CARPETA).filter((a) => a.endsWith(".json")).map((a) => {
    const archivo = path.join(CARPETA, a);
    return { archivo, leer: () => leerCrudo({ archivo }) };
  });
}
candidatos = candidatos.slice(0, LIMITE);

// ---- Ayudantes ----

function armarEnFecha(instante, fn) {
  const DateReal = globalThis.Date;
  const fijo = new DateReal(instante).getTime();
  class DateFijo extends DateReal {
    constructor(...a) { super(...(a.length ? a : [fijo])); }
    static now() { return fijo; }
  }
  globalThis.Date = DateFijo;
  try { return fn(); } finally { globalThis.Date = DateReal; }
}
const canonico = (v) =>
  JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));
// La lectura del crudo de esta comparación, a propósito sin las funciones de la capa.
const numero = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? null : Number(v));
const fila = (raw, r) => raw?.[r.fuente]?.data?.[r.lista]?.[r.indice];
function resuelve(raw, r) {
  if (!raw?.[r.fuente]) return false;
  if (r.lista === undefined) return true;
  const lista = raw[r.fuente]?.data?.[r.lista];
  if (!Array.isArray(lista)) return false;
  if (r.indice === undefined) return true;
  const f = lista[r.indice];
  return !!f && (r.campo === undefined || r.campo in f);
}
function recontar(raw, tipo, registros) {
  const conFila = registros.filter((r) => r.indice !== undefined);
  if (tipo === "conteo") return new Set(conFila.map((r) => `${r.fuente}/${r.lista}/${r.indice}`)).size;
  // Una fila citada sin campo es una que la regla miró y no aportó (o el campo
  // no vino): cuenta como cero.
  const valores = conFila.map((r) => (r.campo === undefined ? 0 : numero(fila(raw, r)?.[r.campo]) ?? 0));
  if (tipo === "suma") return Math.round(valores.reduce((s, v) => s + v, 0) * 100) / 100;
  return valores.length ? Math.max(...valores) : null;
}
const gzip = (s) => zlib.gzipSync(Buffer.from(s, "utf8")).length;
function estadistica(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const en = (p) => v[Math.min(v.length - 1, Math.floor(p * v.length))];
  return { media: v.reduce((a, b) => a + b, 0) / v.length, mediana: en(0.5), p90: en(0.9), p99: en(0.99), max: v[v.length - 1] };
}

// ---- La corrida ----

const cuenta = { personas: 0, sinCrudo: 0, noLeidas: 0, campos: 0, paridadOk: 0, hechos: 0, conValor: 0, registros: 0, recuentos: 0 };
const fallas = { paridad: [], explicadas: [], sinProcedencia: new Set(), noResuelve: [], recuento: [], contraLoGuardado: [] };
const porCampo = {};
const medidas = { documentoJson: [], documentoGzip: [], ms: [], hechos: [], entidades: [], diferencias: [] };
// Sin la base no se sabe el id de la persona: se cita el perfil (p-xxxxxxxx).
const referencia = (c, crudo) => c.cita ?? `p-${String(crudo?.perfilId ?? path.basename(c.archivo ?? "x")).slice(0, 8)}`;

for (let i = 0; i < candidatos.length; i += 50) {
  const lote = candidatos.slice(i, i + 50);
  const crudos = await Promise.all(lote.map((c) => c.leer().catch((e) => ({ error: e.message }))));
  const guardados = args.deposito ? await guardadoDe(lote.map((c) => c.perfilId)) : new Map();
  lote.forEach((c, j) => {
    const crudo = crudos[j];
    if (crudo.error) return void cuenta.noLeidas++;
    if (!crudo.raw || !crudo.capturadoEl) return void cuenta.sinCrudo++;
    if (c.perfilId && crudo.perfilId !== c.perfilId) return void cuenta.noLeidas++;
    cuenta.personas++;
    const ref = referencia(c, crudo);
    const raw = crudo.raw;
    const perfil = armarEnFecha(crudo.capturadoEl, () => buildStandardProfile(raw, crudo.cedula, undefined).profile);
    const contexto = {
      cedula: crudo.cedula,
      consulta: crudo.perfilId ?? "sin-perfil",
      fechaDeLaConsulta: crudo.capturadoEl,
      corteIess: String(crudo.capturadoEl).slice(0, 7),
      persona: { nombre: null, fechaDeNacimiento: null },
    };
    const t0 = performance.now();
    const doc = derivarHechos(raw, contexto);
    const json = JSON.stringify(doc);
    medidas.ms.push(performance.now() - t0);
    medidas.documentoJson.push(Buffer.byteLength(json));
    medidas.documentoGzip.push(gzip(json));
    medidas.hechos.push(doc.hechos.length);
    medidas.entidades.push(doc.entidades.length);
    medidas.diferencias.push(doc.diferencias.length);

    // 3. Paridad, y todo campo del perfil con su código.
    const porCodigo = new Map(doc.hechos.map((h) => [h.codigo, h]));
    for (const g of ELEGIDOS) {
      for (const gp of PERFIL_DE[g]) {
        const desdeHechos = perfilDesdeHechos(doc, gp);
        const delPerfil = perfil[gp] ?? {};
        for (const campo of Object.keys(delPerfil)) {
          if (campo in desdeHechos) continue;
          if (PENDIENTES.has(`${gp}.${campo}`)) pendientesVistos.add(`${gp}.${campo}`);
          else fallas.sinProcedencia.add(`${gp}.${campo}`);
        }
        for (const [campo, valor] of Object.entries(desdeHechos)) {
          cuenta.campos++;
          const ruta = `${gp}.${campo}`;
          porCampo[ruta] ??= { iguales: 0, distintos: 0, explicados: 0 };
          if (canonico(valor) === canonico(delPerfil[campo])) {
            cuenta.paridadOk++;
            porCampo[ruta].iguales++;
            continue;
          }
          const codigo = [...CATALOGO.values()].find((x) => x.campoDelPerfil === ruta)?.codigo;
          const hecho = porCodigo.get(codigo);
          const sinRespuesta = hecho?.calidad === "no_disponible" && /fuente_sin_respuesta|fuente_deshabilitada/.test(hecho.motivo ?? "");
          const detalle = { ref, campo: ruta, perfil: delPerfil[campo], hechos: valor, motivo: hecho?.motivo ?? null };
          if (sinRespuesta || ESPERADAS.has(ruta)) {
            porCampo[ruta].explicados++;
            fallas.explicadas.push(detalle);
          } else {
            porCampo[ruta].distintos++;
            fallas.paridad.push(detalle);
          }
        }
        // 6. Contra lo guardado, informativo.
        const guardado = guardados.get(c.perfilId)?.[gp];
        if (guardado) {
          const distintos = Object.keys(desdeHechos).filter((k) => canonico(guardado[k]) !== canonico(perfil[gp]?.[k]));
          if (distintos.length) fallas.contraLoGuardado.push({ ref, grupo: gp, campos: distintos });
        }
      }
    }

    // 4 y 5. Procedencia y recuento.
    const citas = [];
    for (const h of doc.hechos) {
      cuenta.hechos++;
      if (h.valor !== null) cuenta.conValor++;
      if (!CATALOGO.has(h.codigo)) fallas.sinProcedencia.add(h.codigo);
      citas.push(...h.registros.map((r) => [h.codigo, r]), ...(h.descartados ?? []).map((d) => [h.codigo, d.registro]));
      const tipo = CATALOGO.get(h.codigo)?.recuento;
      if (tipo && h.valor !== null) {
        cuenta.recuentos++;
        const otra = recontar(raw, tipo, h.registros);
        if (otra === null || Math.abs(otra - Number(h.valor)) > 0.011) fallas.recuento.push({ ref, codigo: h.codigo, valor: h.valor, recuento: otra });
      }
    }
    for (const d of doc.diferencias) citas.push([d.codigo, d.manda.registro], ...d.cede.map((x) => [d.codigo, x.registro]));
    for (const e of doc.entidades) citas.push(...e.vistas.map((v) => [e.clave, v.registro]));
    for (const [quien, r] of citas) {
      cuenta.registros++;
      if (!resuelve(raw, r)) fallas.noResuelve.push({ ref, quien, registro: r });
    }
  });
}

if (!cuenta.personas) {
  console.error("Ningún crudo comparable.");
  process.exit(1);
}

// ---- El informe ----

const n = (x) => x.toLocaleString("es-EC");
console.log(`Grupos: ${ELEGIDOS.join(", ")} (perfil: ${ELEGIDOS.flatMap((g) => PERFIL_DE[g]).join(", ")}).`);
console.log(`Personas comparadas: ${n(cuenta.personas)} (sin crudo: ${cuenta.sinCrudo}, no leídas o de otro perfil: ${cuenta.noLeidas}).`);
console.log(`Paridad: ${n(cuenta.paridadOk)} de ${n(cuenta.campos)} campos iguales; ${fallas.paridad.length} distintos sin explicar; ${fallas.explicadas.length} explicados (fuente sin respuesta o diferencia esperada).`);
for (const [ruta, c] of Object.entries(porCampo)) if (c.distintos || c.explicados) console.log(`  ${ruta}: ${c.distintos} distintos, ${c.explicados} explicados`);
for (const d of [...fallas.paridad, ...fallas.explicadas].slice(0, 12)) console.log(`  ${d.ref} ${d.campo}${d.motivo ? ` (${d.motivo})` : ""}`);
console.log(`Campos sin procedencia: ${fallas.sinProcedencia.size}${fallas.sinProcedencia.size ? ` (${[...fallas.sinProcedencia].join(", ")})` : ""}.`);
for (const campo of pendientesVistos) console.log(`  Pendiente declarado: ${campo} (${PENDIENTES.get(campo)}).`);
console.log(`Hechos: ${n(cuenta.hechos)} (${n(cuenta.conValor)} con valor); registros citados: ${n(cuenta.registros)}, ${fallas.noResuelve.length} que no resuelven.`);
for (const d of fallas.noResuelve.slice(0, 5)) console.log(`  ${d.ref} ${d.quien}: ${d.registro.fuente}.${d.registro.lista}#${d.registro.indice}.${d.registro.campo}`);
console.log(`Recuentos independientes: ${n(cuenta.recuentos)}, ${fallas.recuento.length} que no cuadran.`);
for (const d of fallas.recuento.slice(0, 5)) console.log(`  ${d.ref} ${d.codigo}`);
if (args.deposito) console.log(`Contra lo guardado (informativo): ${fallas.contraLoGuardado.length} perfiles con algún campo del grupo distinto del rearmado.`);

let fueraDelPresupuesto = false;
if (args.medir) {
  const kb = (x) => `${(x / 1024).toFixed(1).replace(".", ",")} KB`.padStart(9);
  const ms = (x) => `${x.toFixed(2).replace(".", ",")} ms`.padStart(9);
  const cant = (x) => String(Math.round(x)).padStart(9);
  const tabla = (titulo, v, f) => {
    const e = estadistica(v);
    console.log(`${titulo.padEnd(26)} media ${f(e.media)}  mediana ${f(e.mediana)}  p90 ${f(e.p90)}  p99 ${f(e.p99)}  máx ${f(e.max)}`);
    return e;
  };
  tabla("Documento, JSON", medidas.documentoJson, kb);
  const gz = tabla("Documento, gzip", medidas.documentoGzip, kb);
  const t = tabla("Derivar", medidas.ms, ms);
  tabla("Hechos", medidas.hechos, cant);
  tabla("Entidades", medidas.entidades, cant);
  tabla("Diferencias", medidas.diferencias, cant);
  const okTam = gz.p99 < 16 * 1024;
  const okTiempo = t.p99 < 50;
  fueraDelPresupuesto = !okTam || !okTiempo;
  console.log(`Presupuesto (2.3): p99 gzip ${kb(gz.p99).trim()} contra 16 KB: ${okTam ? "dentro" : "FUERA"}; p99 derivar ${ms(t.p99).trim()} contra 50 ms: ${okTiempo ? "dentro" : "FUERA"}.`);
}

const destino = path.join(PRINCIPAL, "research", "comparar-hechos");
fs.mkdirSync(destino, { recursive: true });
const sello = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
const archivo = path.join(destino, `comparar-${ELEGIDOS.join("+")}-${sello}.json`);
fs.writeFileSync(archivo, JSON.stringify({ grupos: ELEGIDOS, cuenta, porCampo, fallas: { ...fallas, sinProcedencia: [...fallas.sinProcedencia] } }, null, 1));
console.log(`Detalle (con montos, fuera de git): ${path.relative(PRINCIPAL, archivo)}`);

const malo = fallas.paridad.length || fallas.sinProcedencia.size || fallas.noResuelve.length || fallas.recuento.length || fueraDelPresupuesto;
process.exit(malo ? 1 : 0);
