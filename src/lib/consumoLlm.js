// Agregación del consumo del LLM. La vista llm_costos ya trae cada
// llamada valuada; acá solo se agrupa por los cortes que necesita cada
// pantalla de Costos.
//
// Regla que atraviesa todo este archivo: una llamada sin tokens NO vale
// cero, vale desconocido. Por eso el costo y el conteo de llamadas se
// devuelven siempre acompañados de cuántas quedaron sin medir. Un total
// que se lee solo, sin ese número al lado, invita a creer que es
// completo cuando no lo es.

export const ETIQUETA_FUNCION = {
  "analyze-client": "Análisis de cliente",
  "analizar-feedback": "Informe de retroalimentación",
  "proponer-ajustes": "Propuestas de ajuste",
  "correr-backtest": "Backtest",
};

export const ETIQUETA_NATURALEZA = {
  consulta: "Consulta de cliente",
  prueba: "Prueba interna",
  calibracion: "Calibración del criterio",
};

export const DESCRIPCION_NATURALEZA = {
  consulta: "Lo que se le cobra a alguien. Es el número que define la tarifa.",
  prueba: "Análisis que corrimos nosotros para validar. Se paga igual y no se factura.",
  calibracion: "Retroalimentación y backtesting. Una acción dispara muchas llamadas.",
};

export const ETIQUETA_ORIGEN = {
  medida: "Medida en vivo",
  reconstruida: "Reconstruida",
  sin_datos: "Sin medición",
};

export const DESCRIPCION_ORIGEN = {
  medida: "El registro grabó la llamada con sus tokens en el momento.",
  reconstruida: "Los tokens son reales; se rescataron de la fila del análisis.",
  sin_datos: "Sabemos que la llamada ocurrió pero sus tokens se perdieron. El costo es desconocido, no cero.",
};

const MONEDA4 = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 4 });
const MONEDA2 = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const NUM = new Intl.NumberFormat("es-EC");

export const money = (n) => (n === null || n === undefined ? "—" : MONEDA4.format(n));
export const money2 = (n) => (n === null || n === undefined ? "—" : MONEDA2.format(n));
export const num = (n) => (n === null || n === undefined ? "—" : NUM.format(Math.round(n)));
export const centavos = (n) => (n === null || n === undefined ? "—" : `${(n * 100).toFixed(1)}¢`);

export const dia = (iso) => (iso ?? "").slice(0, 10);
export const fechaHora = (iso) => (iso ?? "").slice(0, 16).replace("T", " ");

const vacio = () => ({
  llamadas: 0,
  sinMedir: 0,
  costo: 0,
  entrada: 0,
  salida: 0,
  razonamiento: 0,
  cacheEscritura: 0,
  cacheLectura: 0,
  fallidas: 0,
  ms: 0,
  conMs: 0,
});

function acumular(a, r) {
  a.llamadas++;
  if (r.costo_usd === null || r.costo_usd === undefined) {
    a.sinMedir++;
  } else {
    a.costo += Number(r.costo_usd);
    a.entrada += r.tokens_entrada ?? 0;
    a.salida += r.tokens_salida ?? 0;
    a.razonamiento += r.tokens_razonamiento ?? 0;
    a.cacheEscritura += r.tokens_cache_escritura ?? 0;
    a.cacheLectura += r.tokens_cache_lectura ?? 0;
  }
  if (!r.exito) a.fallidas++;
  if (r.duracion_ms) {
    a.ms += r.duracion_ms;
    a.conMs++;
  }
  return a;
}

// Agrupa por la clave que devuelva `clave`, saltando las filas para las
// que devuelva null.
export function agrupar(filas, clave) {
  const g = new Map();
  for (const r of filas) {
    const k = clave(r);
    if (k === null || k === undefined) continue;
    if (!g.has(k)) g.set(k, vacio());
    acumular(g.get(k), r);
  }
  return [...g.entries()].map(([k, a]) => ({ clave: k, ...a, msPromedio: a.conMs ? Math.round(a.ms / a.conMs) : null }));
}

export function totales(filas) {
  const a = filas.reduce(acumular, vacio());
  return { ...a, msPromedio: a.conMs ? Math.round(a.ms / a.conMs) : null };
}

// Costo promedio por llamada, calculado SOLO sobre las que se pudieron
// medir. Dividir por el total incluyendo las no medidas daría un
// promedio artificialmente bajo.
export function promedioMedido(a) {
  const medidas = a.llamadas - a.sinMedir;
  return medidas > 0 ? a.costo / medidas : null;
}

// Para preguntas de costo unitario -- cuánto cuesta analizar a alguien
// -- solo cuentan las llamadas que produjeron un análisis. Una fallida
// se paga si alcanzó a generar tokens, pero promediarla junto a las
// buenas responde otra pregunta y baja el número sin que se note: las
// que fallan antes de empezar valen cero.
export function soloExitosas(filas) {
  return filas.filter((r) => r.exito);
}

// Una acción del usuario puede ser muchas llamadas: un backtest de 7
// casos son 7 pedidos al modelo. Se agrupan por función + momento
// (redondeado al minuto) porque las corridas masivas disparan sus
// llamadas casi simultáneas, y para las de calibración además por el
// identificador de paquete que viaja en el contexto.
export function corridas(filas) {
  const g = new Map();
  for (const r of filas) {
    const minuto = (r.created_at ?? "").slice(0, 16);
    const paquete = r.contexto?.paquete_id ?? r.contexto?.informe_id ?? "";
    const k = `${r.funcion}|${minuto}|${paquete}`;
    if (!g.has(k)) {
      g.set(k, { ...vacio(), funcion: r.funcion, inicio: r.created_at, naturaleza: r.naturaleza, paquete, modelos: new Set() });
    }
    const a = g.get(k);
    acumular(a, r);
    if (r.modelo && r.modelo !== "desconocido") a.modelos.add(r.modelo);
    if (r.created_at < a.inicio) a.inicio = r.created_at;
  }
  return [...g.values()]
    .map((a) => ({ ...a, modelos: [...a.modelos], msPromedio: a.conMs ? Math.round(a.ms / a.conMs) : null }))
    .sort((x, y) => (x.inicio < y.inicio ? 1 : -1));
}
