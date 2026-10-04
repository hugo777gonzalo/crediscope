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
const D = await importar("analisisEstadistico.js");
const P = await importar("analisisProfundo.js");

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

    // Descubrimiento estadístico (fase D).
    const datos = D.columnasDelCorte(filas, catalogo);
    const nObs = datos.filas.length;
    control("columnas alineadas con las filas", datos.columnas.every((c) => c.valores.length === nObs), `${datos.columnas.length} variables con datos, ${datos.sinDatos.length} sin datos (${datos.sinDatos.join(", ")})`);
    const num = D.descriptivasNumericas(datos), cat = D.descriptivasCategoricas(datos);
    control("descriptivas: n + faltantes = observadas", num.every((d) => d.n + d.faltantes === nObs) && cat.every((d) => d.n + d.faltantes === nObs), `${num.length} numéricas, ${cat.length} categóricas o sí/no`);
    const dist = D.distribucion(datos.columnas.find((c) => c.id === "deuda_en_atraso") ?? datos.columnas[0], datos.malos);
    control("el histograma cuenta a todos los que tienen el dato", dist.tramos.reduce((s, t) => s + t.n, 0) + dist.fuera === dist.todos.n, `${dist.tramos.length} tramos`);
    const falt = D.faltantes(datos);
    control("faltantes: una fila por variable", falt.porVariable.length === datos.columnas.length, `la que más falta: ${falt.porVariable[0]?.id} ${p(falt.porVariable[0]?.parte)}; anticipan el impago (q < 0,05): ${falt.porVariable.filter((v) => (v.q ?? 1) < 0.05).map((v) => v.id).join(", ") || "ninguna"}`);
    const cor = D.correlaciones(datos, "spearman");
    control("matriz de correlación simétrica con 1 en la diagonal", cor.matriz.every((fila, i) => fila[i] === 1 && fila.every((v, j) => v === null || Math.abs(v - cor.matriz[j][i]) < 1e-12)), `${cor.variables.length} variables, ${cor.pares.length} pares con |r| ≥ 0,7, VIF máximo ${cor.vif[0]?.vif?.toFixed(1)} (${cor.vif[0]?.id}) sobre ${cor.filasCompletas} filas completas`);
    const sig = D.explorarSignificancia(datos);
    const res = D.resumenDeVariables(datos, sig);
    control("explorador de significancia", sig.length === datos.columnas.length, `IV ≥ 0,1: ${res.ivRelevante}; significativas: ${res.significativas}; candidatas: ${res.candidatas.map((c) => c.id).join(", ") || "ninguna"}; arriba: ${sig.slice(0, 3).map((s) => `${s.id} ${s.iv.toFixed(3)}`).join(", ")}`);
    // La variable plantada que el modelo no recibe (ciclo simulado): tiene que verse.
    const oculta = sig.find((s) => s.id === "meses_con_aporte_24");
    if (oculta) console.log(`     meses_con_aporte_24: IV ${oculta.iv.toFixed(3)} (mitades ${oculta.ivPrimera.toFixed(3)} y ${oculta.ivSegunda.toFixed(3)}), q ${oculta.q?.toExponential(2)}, cobertura ${p(oculta.cobertura)}, candidata ${oculta.candidata}, puesto ${sig.indexOf(oculta) + 1}`);
    const numerica = datos.columnas.find((c) => c.tipo === "numero");
    const inf = D.inferencia(numerica, datos.malos, datos.filas);
    control("inferencia de una numérica", inf.mannWhitney !== null && inf.welch !== null, `${numerica.id}: Welch p ${inf.welch?.p?.toExponential(2)}, Mann-Whitney p ${inf.mannWhitney?.p?.toExponential(2)}`);
    // El IV del navegador con los tramos de la base tiene que ser el de lab_calcular_variables.
    const [vars] = await rest(`lab_resultados?select=resultado,metodologia&corte_id=eq.${corte.id}&tipo=eq.variables&order=created_at.desc&limit=5`).then((rs) => rs.filter((r) => (r.metodologia?.poblacion ?? "operaciones") === poblacion));
    if (vars) {
      const sql = new Map(vars.resultado.variables.map((v) => [v.variable, v.iv]));
      const comparables = sig.filter((s) => sql.has(s.id));
      const diferencias = comparables.map((s) => Math.abs(s.iv - sql.get(s.id)));
      // Desde la 106 la base y el navegador usan la misma regla de tramos.
      control("IV del navegador = IV de lab_calcular_variables", Math.max(...diferencias) < 1e-3, `${comparables.length} variables, la mayor diferencia ${Math.max(...diferencias).toFixed(4)}`);
    }

    // Descubrimiento profundo (fase E).
    const cayeron = P.losQueCayeron(filas, catalogo, "aprobar");
    if (cayeron.insuficiente) console.log(`     los que cayeron (aprobar): ${cayeron.malos} malos, insuficiente`);
    else control("los que cayeron entre los aprobados", cayeron.diferencias.length > 0, `${cayeron.malos} malos contra ${cayeron.buenos}; más diferentes: ${cayeron.diferencias.slice(0, 3).map((x) => `${x.id} ${x.efecto?.toFixed(2)}`).join(", ")}; ${cayeron.combinaciones.length} combinaciones, la mejor refuerza ${cayeron.combinaciones[0]?.refuerzo?.toFixed(2) ?? "—"}; no lineales: ${cayeron.noLineales.map((x) => x.id).join(", ") || "ninguna"}`);
    const errores = P.casosDeError(filas);
    control("casos de error", errores.aprobadosQueCayeron.every((f) => f.malo && f.recomendacion === "aprobar") && errores.negadosQuePagaron.every((f) => !f.malo), `${errores.aprobadosQueCayeron.length} aprobados que cayeron, ${errores.negadosQuePagaron.length} negados que pagaron`);
    if (errores.aprobadosQueCayeron.length) {
      const caso = errores.aprobadosQueCayeron[0];
      const par = P.parecidos(caso, filas, catalogo, 5);
      control("parecidos: del otro resultado y con la misma recomendación", par.vecinos.every((v) => v.fila.malo !== caso.malo && v.fila.recomendacion === caso.recomendacion), `${par.vecinos.length} vecinos, distancia ${par.vecinos[0]?.distancia.toFixed(2)}; hipótesis: ${par.hipotesis.slice(0, 3).map((h) => h.id).join(", ")}`);
    }
    if (poblacion === "solicitudes") {
      const motivos = await rest("rpc/lab_motivos_de_cada_malo", { method: "POST", body: JSON.stringify({ p_corte: corte.id }) });
      control("motivos de cada malo = malos observados", motivos.length === F.filasObservadas(filas).filter((f) => f.malo).length, `${motivos.length} malos con su motivo`);
      // Una variable derivada que reconstruye la señal plantada: aportó en
      // parte de los últimos 24 meses (ni nunca ni siempre).
      const derivada = P.probarFormula(filas, catalogo, "meses_con_aporte_24 > 0 y meses_con_aporte_24 < 24");
      control("taller: la derivada de la señal plantada anticipa", derivada.tipo === "booleano" && derivada.iv.iv > 0.05, `IV ${derivada.iv.iv.toFixed(3)} (mitades ${derivada.iv.primera.iv.toFixed(3)} y ${derivada.iv.segunda.iv.toFixed(3)}), usa ${derivada.usadas.join(", ")}`);
    }

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

// Auditoría de la entrada al modelo: el último análisis real, rearmado con
// el código de hoy. Del perfil a la entrada tiene que sacarse metaConsulta y
// agregarse la disponibilidad y el endeudamiento.
const { armarPerfilDelModelo } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/perfil-del-modelo.ts")).href);
const [analisis] = await rest("analysis_results?select=id,client_profile_id,mensaje_al_modelo&client_profile_id=not.is.null&order=created_at.desc&limit=1");
if (analisis) {
  const [perfil] = await rest(`client_profiles?select=standard_profile&id=eq.${analisis.client_profile_id}`);
  const apagados = new Set((await rest("standard_profile_field_config?select=grupo,campo&enabled=is.false")).map((x) => `${x.grupo}.${x.campo}`));
  const entrada = armarPerfilDelModelo(perfil.standard_profile, apagados);
  const pasos = P.delPerfilAlModelo(perfil.standard_profile, entrada);
  control("entrada al modelo: se saca metaConsulta, se agregan disponibilidad y endeudamiento",
    pasos.quitado.some((d) => d.ruta === "metaConsulta") && pasos.agregado.some((d) => d.ruta === "disponibilidad") && pasos.agregado.some((d) => d.ruta === "endeudamiento"),
    `sacados ${pasos.quitado.length}, en null ${pasos.enNull.length}, transformados ${pasos.transformado.length}, agregados ${pasos.agregado.length}; entrada guardada: ${analisis.mensaje_al_modelo ? "sí" : "no (anterior a la 090)"}`);
}
const cobertura = await rest("rpc/lab_cobertura_de_la_estructura", { method: "POST", body: JSON.stringify({ p_corte: cortes.at(-1).id }) });
control("cobertura de la estructura", cobertura.campos.length > 0 && cobertura.campos.every((c) => c.con_valor <= cobertura.perfiles), `${cobertura.perfiles} perfiles, ${cobertura.campos.length} campos, ${cobertura.campos.filter((c) => c.con_valor === 0).length} siempre vacíos, ${cobertura.sin_configurar.length} fuera de la configuración`);

// El intérprete de fórmulas del taller, con valores conocidos y con errores.
const ids = new Set(["a", "b", "c"]);
const casosFormula = [
  ["a / max(b, 1)", { a: 10, b: 0 }, 10],
  ["a + b * 2", { a: 1, b: 3 }, 7],
  ["(a + b) * 2", { a: 1, b: 3 }, 8],
  ["si(a > 5, 1, 0)", { a: 7 }, 1],
  ["a > 5 y b <= 2", { a: 7, b: 2 }, true],
  ["no (a = 1) o b <> 3", { a: 1, b: 3 }, false],
  ["a + c", { a: 1, c: null }, null],
  ["falta(c)", { c: null }, true],
  ["a / b", { a: 1, b: 0 }, null],
  ["-a + 2.5", { a: 1 }, 1.5],
];
for (const [texto, vars, esperado] of casosFormula) {
  const r = P.compilarFormula(texto, ids).evaluar(vars);
  control(`fórmula «${texto}»`, r === esperado, `${r}`);
}
for (const malo of ["a +", "x + 1", "max(a", "a ; b", "a b"]) {
  let mensaje = null;
  try { P.compilarFormula(malo, ids); } catch (e) { mensaje = e.message; }
  control(`fórmula mal escrita «${malo}» da un error legible`, Boolean(mensaje), mensaje ?? "no dio error");
}

console.log(fallas ? `\n${fallas} FALLAS` : "\nTodo cuadra.");
process.exit(fallas ? 1 : 0);
