// Corre los cálculos de las pestañas del Laboratorio (src/lib/analisis*.js)
// sobre los cortes reales de la base, con las mismas filas que baja el
// navegador, y controla que cuadren: conteos que suman lo que tienen que
// sumar, el AUC igual al de la base, curvas que no se dan vuelta. Es la
// prueba que tienen las pantallas mientras no se puedan ver con sesión, y
// después sigue sirviendo: lo que no pasa por lint ni build se rompe en
// silencio.
//
// Uso: node scripts/probar-pantallas-laboratorio.mjs

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const importar = (archivo) => import(pathToFileURL(path.join(RAIZ, "src/lib", archivo)).href);
const F = await importar("filasDelCorte.js");
const R = await importar("analisisRetrospectivo.js");

const env = Object.fromEntries(fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
  .filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const auth = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };
async function rest(ruta, opciones = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, { ...opciones, headers: { ...auth, ...(opciones.headers ?? {}) } });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${ruta.split("?")[0]}: HTTP ${res.status} ${texto.slice(0, 300)}`);
  return texto ? JSON.parse(texto) : null;
}
async function filasDe(corteId, poblacion) {
  const solicitudes = poblacion === "solicitudes";
  const tabla = solicitudes ? "lab_corte_solicitudes" : "lab_corte_operaciones";
  const select = encodeURIComponent((solicitudes ? F.SELECT_SOLICITUDES : F.SELECT_OPERACIONES).replace(/\s+/g, ""));
  const orden = solicitudes ? "solicitud_id" : "operacion_id";
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const pagina = await rest(`${tabla}?select=${select}&corte_id=eq.${corteId}&order=${orden}.asc&offset=${desde}&limit=1000`);
    filas.push(...pagina);
    if (pagina.length < 1000) break;
  }
  return filas.map(solicitudes ? F.normalizarSolicitud : F.normalizarOperacion);
}

let fallas = 0;
function control(nombre, ok, detalle = "") {
  if (!ok) fallas++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre}${detalle ? `: ${detalle}` : ""}`);
}
const p = (x) => (x === null || x === undefined ? "—" : `${(x * 100).toFixed(1)}%`);

const cortes = await rest("lab_cortes?select=id,nombre,resumen&order=congelado_en.asc");
const catalogo = await rest("lab_catalogo_variables?select=id,nombre,grupo,tipo,uso,en_perfil_del_modelo&activa=is.true&order=grupo.asc,nombre.asc");
const porCorte = {};

for (const corte of cortes) {
  const poblaciones = corte.resumen?.solicitudes ? ["operaciones", "solicitudes"] : ["operaciones"];
  for (const poblacion of poblaciones) {
    const filas = await filasDe(corte.id, poblacion);
    porCorte[`${corte.id}|${poblacion}`] = filas;
    console.log(`\n== ${corte.nombre} · ${poblacion}: ${filas.length} filas, ${F.filasObservadas(filas).length} observadas`);

    // Discriminación.
    const d = R.discriminacion(filas);
    if (poblacion === "operaciones") {
      const [aucBase] = await rest("rpc/lab_auc", { method: "POST", body: JSON.stringify({ p_corte: corte.id }) });
      control("AUC = lab_auc", d.auc.auc === null ? aucBase.auc === null : Math.abs(d.auc.auc - Number(aucBase.auc)) < 5e-5, `${d.auc.auc?.toFixed(4)} contra ${aucBase.auc}`);
    }
    if (d.auc.auc !== null) {
      control("deciles suman la base", d.deciles.reduce((s, x) => s + x.n, 0) === d.base.length, `${d.base.length} con puntaje, ${d.rompen} deciles suben`);
      control("distribución por clase suma 1", Math.abs(d.malos.reduce((s, x) => s + x, 0) - 1) < 1e-9 && Math.abs(d.buenos.reduce((s, x) => s + x, 0) - 1) < 1e-9);
      control("ROC termina en (1, 1)", d.roc.puntos.at(-1).x === 1 && d.roc.puntos.at(-1).y === 1);

      // Umbrales.
      const u = R.curvaDeUmbrales(d.base);
      control("la aprobación baja al subir el umbral", u.curva.every((x, i) => !i || x.tasaAprobacion <= u.curva[i - 1].tasaAprobacion), `${u.curva.length} umbrales`);
      const a = Math.round(u.puntajes[Math.floor(u.puntajes.length * 0.3)]), b = Math.round(u.puntajes[Math.floor(u.puntajes.length * 0.1)]);
      const zonas = R.politica(d.base, a, b);
      control("las zonas de la política suman la base", zonas.reduce((s, [, z]) => s + z.n, 0) === d.base.length, zonas.map(([r, z]) => `${r} ${z.n} (${p(z.tasa)})`).join(" · "));

      // Calibración en dos mitades por fecha.
      const [est, pru] = R.dividirPorFecha(d.base);
      const cal = R.calibrar(est, pru);
      if (cal.insuficiente) console.log("     calibración: casos insuficientes");
      else {
        control("probabilidades entre 0 y 1", cal.cal.tabla.every((t) => t.predicho >= 0 && t.predicho <= 1), `a ${cal.modelo.coeficientes[0].toFixed(3)} b ${cal.modelo.coeficientes[1].toFixed(5)} · Brier ${cal.cal.brier.toFixed(4)} contra ${cal.brierReferencia.toFixed(4)} · ECE ${p(cal.cal.ece)} · HL p ${cal.cal.hosmerLemeshow.p.toFixed(3)}`);
        control("la pendiente es negativa (más puntaje, menos riesgo)", cal.modelo.coeficientes[1] < 0);
      }
    }

    // Cosechas.
    const k = R.cosechas(filas, "mes");
    if (k.sujetos.length) {
      const malosConFecha = k.sujetos.filter((s) => s.evento).length;
      control("cosechas suman los sujetos", k.cosechas.reduce((s, x) => s + x.n, 0) === k.sujetos.length, `${k.cosechas.length} cosechas, ${malosConFecha} caídas con fecha, ${k.sinFecha} malos sin fecha, seguimiento ${k.seguimientoTotal.toFixed(1)} meses`);
      const final = 1 - k.todas.at(-1).supervivencia;
      control("la caída acumulada final está entre 0 y 1", final >= 0 && final <= 1, `${p(final)} al final; a 12 meses ${p(R.acumuladaA(k.todas, 12, k.seguimientoTotal))}`);
    }

    // Segmentos: cada dimensión suma la población observada.
    const obs = F.filasObservadas(filas).length;
    for (const dim of Object.keys(R.DIMENSIONES)) {
      if (R.DIMENSIONES[dim].soloSolicitudes && poblacion !== "solicitudes") continue;
      const s = R.segmentar(filas, dim);
      if (s.n !== obs || s.segmentos.reduce((t, x) => t + x.n, 0) !== obs) control(`segmentos por ${dim} suman las observadas`, false);
    }
    control("los segmentos de todas las dimensiones suman las observadas", true);

    // Lo que decidió la institución.
    if (poblacion === "solicitudes") {
      const t = R.decisionesDeLaInstitucion(filas);
      const total = t.reduce((s, x) => s + x.n, 0);
      control("recomendación × decisión suma las solicitudes", total === filas.length, `${total} de ${filas.length}`);
    }
  }
}

// Estabilidad y comparación entre los dos primeros cortes (operaciones).
if (cortes.length > 1) {
  const a = porCorte[`${cortes[0].id}|operaciones`], b = porCorte[`${cortes[1].id}|operaciones`];
  const psis = R.psiDeVariables(a, b, catalogo);
  control("PSI de variables no negativo", psis.every((v) => v.psi >= 0), `${psis.length} variables; las que más cambiaron: ${psis.slice(0, 3).map((v) => `${v.id} ${v.psi.toFixed(3)}`).join(", ")}`);
  const c = R.compararCortes(b, a);
  control("comparación de cortes", c.pruebaTasa !== null, `tasa ${p(c.a.tasa)} contra ${p(c.b.tasa)} (p ${c.pruebaTasa.p.toFixed(4)}); AUC ${c.a.auc.auc?.toFixed(3)} contra ${c.b.auc.auc?.toFixed(3)} (p ${c.pruebaAuc?.p.toFixed(4)})`);
}

console.log(fallas ? `\n${fallas} FALLAS` : "\nTodo cuadra.");
process.exit(fallas ? 1 : 0);
