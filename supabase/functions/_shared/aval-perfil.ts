// Builder del Perfil de Aval: toma el `result` crudo de la respuesta de
// Aval y arma un perfil normalizado. Análogo a buildStandardProfile de
// Novadata, pero para el sobre único de Aval (34 segmentos en persona
// natural). Mapeado contra dos respuestas reales del ambiente de prueba
// (2026-09-20): cédula 0101154151 (score 73) y 0100062181 (score 979).
//
// FILOSOFÍA (igual que en el resto del proyecto): los huecos se marcan, no
// se rellenan con cero. Un campo que Aval no trajo queda en null; solo se
// suma cero donde Aval mismo dice "$0,00".
//
// Esta v1 es una normalización FIEL: no decide todavía qué segmentos
// alimentan el marco interpretativo ni qué pasa con el score de Aval
// (eso es el paso siguiente). Acá solo se deja el dato limpio y tipado.

export const PERFIL_AVAL_VERSION = "aval-v1";

// Aval manda montos como string con formato local: "$14.621,52" (miles con
// punto, decimales con coma). Otros números vienen como Number crudo. Este
// parser convierte solo lo que TIENE forma de monto; una razón social o un
// nombre no matchea y queda intacto.
const RE_MONTO = /^-?\$?\s?\d{1,3}(\.\d{3})*(,\d{1,2})?$/;

export function montoANumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (s === "" || !RE_MONTO.test(s)) return null;
  const limpio = s.replace(/[$\s.]/g, "").replace(",", ".");
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

// tasaMalos viene como "0.7676" (decimal con punto, NO formato monto).
function decimalANumero(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : null;
}

// Un archivo sin historial trae strings vacíos (ej. tipoScore=""): un hueco
// se marca como null, no como "".
function textoONull(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

// Recorre todo el árbol y convierte los strings con forma de monto a Number.
// Deja el resto (fechas, razones sociales, códigos) tal cual.
function normalizarMontos(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(normalizarMontos);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) o[k] = normalizarMontos(val);
    return o;
  }
  if (typeof v === "string") {
    const n = montoANumero(v);
    return n === null ? v : n;
  }
  return v;
}

function comoArreglo(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

// titularConsultado12Meses trae CIENTOS de filas (292 y 329 en las pruebas):
// quién consultó a esta persona en los últimos 12 meses. Guardarlo crudo
// infla el perfil sin aportar; lo que el análisis necesita es el pulso de
// consultas, así que se agrega.
export interface TitularConsultado12Meses {
  total: number;
  entidadesDistintas: number;
  primeraConsulta: string | null;
  ultimaConsulta: string | null;
}

function agregarTitular(lista: Record<string, unknown>[]): TitularConsultado12Meses {
  const fechas = lista.map((x) => x.fechaConsulta).filter((f): f is string => typeof f === "string" && f !== "").sort();
  const entidades = new Set(lista.map((x) => x.nombreComercial).filter((n) => typeof n === "string" && n !== ""));
  return {
    total: lista.length,
    entidadesDistintas: entidades.size,
    primeraConsulta: fechas[0] ?? null,
    ultimaConsulta: fechas[fechas.length - 1] ?? null,
  };
}

export interface ResumenAval {
  nombre: string | null;
  tipoScore: string | null;
  score: number | null;
  clientesPeorScore: number | null;
  tasaMalos: number | null;
  totalDeuda: number;
  numTarjetasVigentes: number;
  saldoPromedio36M: number | null;
  fechaUltimoVencido: string | null;
  consultas12Meses: number;
}

export interface PerfilAval {
  version: string;
  identificacion: string;
  resumen: ResumenAval;
  // Los 34 segmentos, con montos ya numéricos y titularConsultado12Meses
  // reemplazado por su agregado.
  segmentos: Record<string, unknown>;
}

export function construirPerfilAval(result: Record<string, unknown> | null | undefined, identificacion: string): PerfilAval {
  // El sobre A500 trae result=null; el gate laConsultaAvalSirve ya debería
  // frenar antes, pero un hueco no tiene que reventar el builder.
  const datos = (result ?? {}) as Record<string, unknown>;
  const score0 = comoArreglo(datos.scoreFinanciero)[0] ?? {};
  const indDeuda0 = comoArreglo(datos.indicadoresDeuda)[0] ?? {};
  const indTarjeta0 = comoArreglo(datos.indicadoresTarjeta)[0] ?? {};

  const saldos = comoArreglo(datos.resumenSaldosTipoDeuda);
  // Redondeo a centavos: sumar montos en punto flotante deja colas (20090.9699…).
  const totalDeuda = Math.round(saldos.reduce((acc, r) => acc + (montoANumero(r.totalDeuda) ?? 0), 0) * 100) / 100;

  const titular = agregarTitular(comoArreglo(datos.titularConsultado12Meses));

  // Segmentos fieles: montos a número, y el listón de titular reemplazado
  // por su agregado para no arrastrar cientos de filas.
  const segmentos = normalizarMontos(datos) as Record<string, unknown>;
  segmentos.titularConsultado12Meses = titular;

  const resumen: ResumenAval = {
    nombre: textoONull(score0.nombreSujeto),
    tipoScore: textoONull(score0.tipoScore),
    score: typeof score0.score === "number" ? score0.score : null,
    clientesPeorScore: typeof score0.clientesPeorScore === "number" ? score0.clientesPeorScore : decimalANumero(score0.clientesPeorScore),
    tasaMalos: decimalANumero(score0.tasaMalos),
    totalDeuda,
    numTarjetasVigentes: typeof indTarjeta0.numTarjetasVigentes === "number" ? indTarjeta0.numTarjetasVigentes : 0,
    saldoPromedio36M: typeof indDeuda0.saldoPromedio36M === "number" ? indDeuda0.saldoPromedio36M : null,
    fechaUltimoVencido: textoONull(indDeuda0.fechaUltimoVencido),
    consultas12Meses: titular.total,
  };

  return { version: PERFIL_AVAL_VERSION, identificacion, resumen, segmentos };
}
