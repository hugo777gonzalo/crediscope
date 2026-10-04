// Los cálculos de la Prueba retrospectiva (fase C de
// docs/laboratorio-pantallas.md), sin React: las pestañas los llaman y
// scripts/probar-pantallas-laboratorio.mjs los corre en Node contra los
// cortes reales, que es la prueba que tienen antes de verse en pantalla.

import {
  aucPuntaje, curvaRoc, ks, curvaPrecision, histograma, wilson, acumuladosPorPuntaje, umbral, cuantil, ordenar,
  kaplanMeier, logRank, chiCuadrado, cortesPorCuantiles, tramosDeCortes, enTramo, etiquetaDeTramo, esNumero,
  regresionLogistica, calibracion, media, psi, tramosPorDefecto, pNormal,
} from "./estadistica.js";
import { filasObservadas, filasConPuntaje, mesesEntre, mesDe } from "./filasDelCorte.js";

// ------------------------------------------------------- discriminación
export function discriminacion(filas) {
  const base = filasConPuntaje(filas);
  const bloqueados = filasObservadas(filas).filter((f) => f.bloqueado).length;
  const auc = aucPuntaje(base);
  if (auc.auc === null) return { base, bloqueados, auc };
  const roc = curvaRoc(base), k = ks(base), pr = curvaPrecision(base);
  // Distribución del puntaje por clase, en porcentaje de cada clase (las dos
  // formas se comparan aunque haya diez buenos por cada malo).
  const { tramos } = histograma(base.map((f) => f.puntaje), { tramos: 20 });
  const enEsteTramo = (t, x) => x >= t.desde && (x < t.hasta || t === tramos[tramos.length - 1]);
  const porClase = (malo) => {
    const xs = base.filter((f) => f.malo === malo).map((f) => f.puntaje);
    return tramos.map((t) => xs.filter((x) => enEsteTramo(t, x)).length / (xs.length || 1));
  };
  return { base, bloqueados, auc, roc, k, pr, tramos, malos: porClase(true), buenos: porClase(false), ...deciles(base) };
}

// Diez grupos del mismo tamaño por puntaje, de menor a mayor: si el motor
// ordena bien, la tasa de malos baja decil a decil.
export function deciles(base) {
  const orden = [...base].sort((a, b) => a.puntaje - b.puntaje);
  const lista = Array.from({ length: 10 }, (_, i) => {
    const parte = orden.slice(Math.floor((i * orden.length) / 10), Math.floor(((i + 1) * orden.length) / 10));
    const malos = parte.filter((f) => f.malo).length;
    return { decil: i + 1, desde: parte[0]?.puntaje, hasta: parte[parte.length - 1]?.puntaje, n: parte.length, malos, tasa: parte.length ? malos / parte.length : null, ic: wilson(malos, parte.length) };
  });
  return { deciles: lista, rompen: lista.filter((d, i) => i > 0 && d.tasa > lista[i - 1].tasa).length };
}

// -------------------------------------------------------------- umbrales
function zona(base, desde, hasta) {
  const parte = base.filter((f) => f.puntaje >= desde && f.puntaje < hasta);
  const malos = parte.filter((f) => f.malo).length;
  return { n: parte.length, malos, tasa: parte.length ? malos / parte.length : null, ic: wilson(malos, parte.length) };
}

// Política "aprobar desde A; revisar desde B" (B = A: sin revisión).
export function politica(base, aprobarDesde, revisarDesde) {
  const b = Math.min(revisarDesde, aprobarDesde);
  return [
    ["aprobar", zona(base, aprobarDesde, Infinity)],
    ...(b < aprobarDesde ? [["revisar", zona(base, b, aprobarDesde)]] : []),
    ["negar", zona(base, -Infinity, b)],
  ];
}

export function motorPorRecomendacion(base) {
  return ["aprobar", "revisar", "negar"].map((rec) => {
    const parte = base.filter((f) => f.recomendacion === rec);
    const malos = parte.filter((f) => f.malo).length;
    return [rec, { n: parte.length, malos, tasa: parte.length ? malos / parte.length : null, ic: wilson(malos, parte.length) }];
  }).filter(([, z]) => z.n);
}

// Cada medida a lo largo de ~60 umbrales (cuantiles del puntaje).
export function curvaDeUmbrales(base) {
  const acumulados = acumuladosPorPuntaje(base);
  const puntajes = ordenar(base.map((f) => f.puntaje));
  if (!puntajes.length) return { acumulados, puntajes, curva: [] };
  const us = [...new Set(Array.from({ length: 61 }, (_, i) => Math.round(cuantil(puntajes, i / 60))))];
  return { acumulados, puntajes, curva: us.map((u) => umbral(acumulados, u)) };
}

// -------------------------------------------------------------- cosechas
export const HORIZONTES = [6, 12, 24];
const trimestreDe = (d) => (d ? `${d.getUTCFullYear()}-T${Math.floor(d.getUTCMonth() / 3) + 1}` : "sin fecha");

// La caída acumulada a los `meses`, o null si nadie de la cosecha se siguió
// tanto tiempo (no se inventa la cola de la curva).
export function acumuladaA(pasos, meses, seguimientoMaximo) {
  if (seguimientoMaximo < meses) return null;
  let s = 1;
  for (const p of pasos) { if (p.tiempo <= meses) s = p.supervivencia; else break; }
  return 1 - s;
}

// Kaplan-Meier por cosecha: un crédito que todavía no maduró no se tira,
// aporta los meses que sí se vieron. El reloj arranca en el desembolso (o
// en la solicitud) y para en el primer impago o en el fin del seguimiento.
export function cosechas(filas, agrupar = "mes") {
  const observadas = filasObservadas(filas).filter((f) => f.fecha);
  const sinFecha = observadas.filter((f) => f.malo && !f.fechaDefault).length;
  const sujetos = observadas
    .filter((f) => !(f.malo && !f.fechaDefault))
    .map((f) => ({
      cosecha: agrupar === "mes" ? mesDe(f.fecha) : trimestreDe(f.fecha),
      tiempo: f.malo ? Math.max(0, mesesEntre(f.fecha, f.fechaDefault)) : mesesEntre(f.fecha, f.finObservacion),
      evento: Boolean(f.malo),
    }))
    .filter((s) => Number.isFinite(s.tiempo));
  const grupos = new Map();
  for (const s of sujetos) grupos.set(s.cosecha, [...(grupos.get(s.cosecha) ?? []), s]);
  const lista = [...grupos.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([nombre, ss]) => {
    const pasos = kaplanMeier(ss);
    const seguimiento = Math.max(...ss.map((s) => s.tiempo));
    return { nombre, n: ss.length, malos: ss.filter((s) => s.evento).length, pasos, seguimiento, acumulada: HORIZONTES.map((h) => acumuladaA(pasos, h, seguimiento)) };
  });
  const todas = kaplanMeier(sujetos);
  const seguimientoTotal = sujetos.length ? Math.max(...sujetos.map((s) => s.tiempo)) : 0;
  return { cosechas: lista, todas, sujetos, sinFecha, prueba: lista.length > 1 ? logRank([...grupos.values()]) : null, seguimientoTotal };
}

// ------------------------------------------------------------- segmentos
export const MIN_PERSONAS_SEGMENTO = 50, MIN_MALOS_SEGMENTO = 10;

export const DIMENSIONES = {
  mes: { texto: "Mes (de desembolso o de la solicitud)", porNombre: true, valor: (f) => mesDe(f.fecha) },
  producto: { texto: "Producto", valor: (f) => f.producto },
  canal: { texto: "Canal", valor: (f) => f.canal },
  recomendacion: { texto: "Recomendación del motor", valor: (f) => f.recomendacion },
  segmento_ingreso: { texto: "Segmento de ingreso", valor: (f) => f.variables.segmento_ingreso },
  estado_ingreso: { texto: "Estado del ingreso", valor: (f) => f.variables.estado_ingreso },
  peor_calificacion: { texto: "Peor calificación propia", valor: (f) => f.variables.peor_calificacion },
  ingreso_reportado_iess: { texto: "Ingreso reportado al IESS (cuartiles)", numerica: true, valor: (f) => f.variables.ingreso_reportado_iess },
  continuidad_laboral_meses: { texto: "Continuidad laboral (cuartiles)", numerica: true, valor: (f) => f.variables.continuidad_laboral_meses },
  decision: { texto: "Decisión de la institución", soloSolicitudes: true, valor: (f) => f.decisionInstitucion },
  marco: { texto: "Versión del marco", valor: (f) => f.marco },
  edad: { texto: "Edad (cuartiles) · protegida", numerica: true, protegida: true, valor: (f) => f.variables.edad },
  genero: { texto: "Género · protegida", protegida: true, valor: (f) => f.variables.genero },
};

export function segmentar(filas, clave) {
  const d = DIMENSIONES[clave];
  const base = filasObservadas(filas);
  let etiquetar = (f) => String(d.valor(f) ?? "sin dato");
  if (d.numerica) {
    const tramos = tramosDeCortes(cortesPorCuantiles(base.map(d.valor).filter(esNumero), 4));
    etiquetar = (f) => {
      const t = tramos.find((x) => enTramo(x, d.valor(f)));
      return t ? etiquetaDeTramo(t, (x) => Math.round(x).toLocaleString("es-EC")) : "sin dato";
    };
  }
  const grupos = new Map();
  for (const f of base) {
    const e = etiquetar(f);
    grupos.set(e, [...(grupos.get(e) ?? []), f]);
  }
  const segmentos = [...grupos.entries()].map(([nombre, fs]) => {
    const malos = fs.filter((f) => f.malo).length;
    const auc = aucPuntaje(fs.filter((f) => !f.bloqueado && esNumero(f.puntaje)));
    const conPuntaje = fs.filter((f) => esNumero(f.puntaje));
    return {
      nombre, n: fs.length, malos, tasa: malos / fs.length, ic: wilson(malos, fs.length), auc, chico: fs.length < MIN_PERSONAS_SEGMENTO || malos < MIN_MALOS_SEGMENTO,
      puntajeMedio: conPuntaje.length ? conPuntaje.reduce((s, f) => s + f.puntaje, 0) / conPuntaje.length : null,
    };
  }).sort((a, b) => (d.porNombre ? a.nombre.localeCompare(b.nombre) : b.n - a.n));
  const malosTotal = base.filter((f) => f.malo).length;
  return {
    segmentos, prueba: segmentos.length > 1 ? chiCuadrado(segmentos.map((s) => [s.malos, s.n - s.malos])) : null,
    tasaTotal: base.length ? malosTotal / base.length : null, n: base.length,
  };
}

// ------------------------------------------------------------ calibración
// La primera mitad por fecha para estimar, la segunda para probar.
export function dividirPorFecha(base) {
  const orden = [...base].sort((a, b) => (a.fecha ?? 0) - (b.fecha ?? 0));
  return [orden.slice(0, Math.floor(orden.length / 2)), orden.slice(Math.floor(orden.length / 2))];
}

// Logística sobre el puntaje en la cohorte de estimación; la calibración se
// mide en la de prueba. La referencia es predecir para todos la tasa de la
// cohorte de estimación: la habilidad dice cuánto mejora el puntaje eso.
export function calibrar(estimacion, prueba) {
  const malosE = estimacion.filter((f) => f.malo).length, malosP = prueba.filter((f) => f.malo).length;
  if (malosE < 10 || estimacion.length - malosE < 10 || !malosP) return { insuficiente: true, malosE, malosP };
  const modelo = regresionLogistica(estimacion.map((f) => [f.puntaje]), estimacion.map((f) => (f.malo ? 1 : 0)));
  const predichas = prueba.map((f) => modelo.predecir([f.puntaje]));
  const cal = calibracion(predichas, prueba.map((f) => f.malo), 10);
  const tasaE = malosE / estimacion.length;
  const brierReferencia = media(prueba.map((f) => (tasaE - (f.malo ? 1 : 0)) ** 2));
  return { modelo, cal, brierReferencia, habilidad: 1 - cal.brier / brierReferencia, malosE, malosP };
}

// ----------------------------------------------------------- estabilidad
// PSI de cada variable del catálogo con los tramos (quintiles o
// categorías) del corte base.
export function psiDeVariables(filasBase, filasNuevo, catalogo) {
  const b = filasObservadas(filasBase), n = filasObservadas(filasNuevo);
  return catalogo.map((v) => {
    const valoresBase = b.map((f) => f.variables[v.id] ?? null);
    if (valoresBase.every((x) => x === null)) return null;
    const tramos = tramosPorDefecto(valoresBase, 5);
    const contar = (fs) => tramos.map((t) => fs.filter((f) => enTramo(t, f.variables[v.id] ?? null)).length);
    const r = psi(contar(b), contar(n));
    return { id: v.id, nombre: v.nombre, grupo: v.grupo, psi: r.psi, tramos: tramos.map((t, i) => ({ tramo: etiquetaDeTramo(t), base: r.tramos[i].base, nuevo: r.tramos[i].nuevo })) };
  }).filter(Boolean).sort((x, y) => y.psi - x.psi);
}

// ------------------------------------------------------- comparar cortes
export function medidasDelCorte(filas) {
  const obs = filasObservadas(filas), base = filasConPuntaje(filas);
  const malos = obs.filter((f) => f.malo).length;
  const auc = aucPuntaje(base);
  const porRecomendacion = Object.fromEntries(["aprobar", "revisar", "negar", "bloqueado"].map((r) => {
    const parte = obs.filter((f) => f.recomendacion === r);
    const m = parte.filter((f) => f.malo).length;
    return [r, { n: parte.length, malos: m, tasa: parte.length ? m / parte.length : null }];
  }));
  return {
    n: obs.length, malos, tasa: obs.length ? malos / obs.length : null, ic: wilson(malos, obs.length), auc,
    ks: auc.auc === null ? null : ks(base).ks, pr: auc.auc === null ? null : curvaPrecision(base).precisionMedia,
    roc: auc.auc === null ? null : curvaRoc(base), porRecomendacion,
  };
}

// La diferencia de tasas, con chi cuadrado; la de AUC, con una z sobre los
// errores de Hanley-McNeil, que supone cortes con personas distintas (si
// comparten personas, la prueba es conservadora).
export function compararCortes(filasA, filasB) {
  const a = medidasDelCorte(filasA), b = medidasDelCorte(filasB);
  const pruebaTasa = chiCuadrado([[a.malos, a.n - a.malos], [b.malos, b.n - b.malos]]);
  let pruebaAuc = null;
  if (a.auc.auc !== null && b.auc.auc !== null) {
    const ee = (x) => (x.ic[1] - x.ic[0]) / (2 * 1.96);
    const z = (a.auc.auc - b.auc.auc) / Math.sqrt(ee(a.auc) ** 2 + ee(b.auc) ** 2);
    pruebaAuc = { z, p: pNormal(z) };
  }
  return { a, b, pruebaTasa, pruebaAuc };
}

// ------------------------------------------- lo que decidió la institución
export const DECISIONES = [["desembolsada", "Desembolsó"], ["negada", "Negó"], ["desistio", "Desistió el cliente"], ["en_tramite", "En trámite"], [null, "Sin dato"]];

export function decisionesDeLaInstitucion(filas) {
  return ["aprobar", "revisar", "negar", "bloqueado"].map((r) => {
    const deR = filas.filter((f) => f.recomendacion === r);
    return {
      r, n: deR.length,
      celdas: DECISIONES.map(([d]) => {
        const parte = deR.filter((f) => (f.decisionInstitucion ?? null) === d);
        const observadas = parte.filter((f) => f.incluida && typeof f.malo === "boolean");
        const malos = observadas.filter((f) => f.malo).length;
        return { d, n: parte.length, observadas: observadas.length, malos, tasa: observadas.length ? malos / observadas.length : null, ic: wilson(malos, observadas.length) };
      }),
    };
  }).filter((x) => x.n);
}
