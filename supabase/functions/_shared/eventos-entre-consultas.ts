// Lo que pasó entre dos consultas de la misma persona (Laboratorio, fase 6,
// docs/laboratorio-de-riesgo.md sección 14).
//
// Compara la consulta del día del análisis (t0) con la de "un año después"
// (t1): créditos nuevos, mora en lo que ya tenía, demandas, pensiones,
// procesos en Fiscalía, trabajo perdido o nuevo, negocio cerrado. Lo usan
// igual la simulación y la corrida real. En la simulación nadie le dice qué
// se plantó: la verdad vive aparte y sólo sirve para calificarlo.
//
// Lee el crudo cuando hace falta la fecha o la identidad de un registro
// (número de proceso, de noticia, de operación) y el perfil cuando la regla
// ya vive allí (RUC activo, pensiones como obligado, aportes vigentes): una
// sola regla por cosa. Las copias es como aparecen las diferencias
// silenciosas.
//
// Lo que NO decide: si la persona "cayó". Devuelve los hechos del buró
// (operaciones nuevas y deterioros, con calificación, días, castigo y
// juicio) y la definición de default la aplica el corte, que es donde se
// elige. El mismo archivo tiene que poder leerse con otra definición.

import { categoriaDeDemanda, CATEGORIA_COBRO } from "./demandas.ts";
import { rolEnDenuncia } from "./denuncias.ts";
import { fechasDelRuc } from "./ruc.ts";

type AnyRecord = Record<string, unknown>;

export type TipoEvento =
  | "credito_institucion"
  | "credito_otra_institucion"
  | "mora_credito_previo"
  | "demanda_cobro"
  | "demanda_civil"
  | "pension_alimenticia"
  | "proceso_fiscalia"
  | "perdida_trabajo"
  | "cierre_negocio"
  | "trabajo_nuevo";

export type ClaseEvento = "coherencia" | "causa_interna" | "causa_externa" | "consecuencia" | "protege";

// La mora en otros créditos y las demandas de cobro llegan DESPUÉS de dejar
// de pagar: son consecuencias, no causas. Contarlas como causa haría que
// todo impago "se explique" por sí mismo.
export const CLASE_DEL_EVENTO: Record<TipoEvento, ClaseEvento> = {
  credito_institucion: "coherencia",
  credito_otra_institucion: "causa_interna",
  mora_credito_previo: "consecuencia",
  demanda_cobro: "consecuencia",
  demanda_civil: "causa_externa",
  pension_alimenticia: "causa_externa",
  proceso_fiscalia: "causa_externa",
  perdida_trabajo: "causa_externa",
  cierre_negocio: "causa_externa",
  trabajo_nuevo: "protege",
};

export interface Evento {
  tipo: TipoEvento;
  clase: ClaseEvento;
  // null cuando la fuente no trae la fecha: el buró de bancos es una foto.
  fecha: string | null;
  detalle: AnyRecord;
}

export interface EstadoDeOperacion {
  canal: "bancos" | "cooperativas" | "retail";
  entidad: string;
  calificacion: string | null;
  dias: number | null;
  castigo: boolean;
  judicial: boolean;
  vencido: number;
  saldo: number;
}

export interface HechosDelBuro {
  // Operaciones propias en t1 que no estaban en t0, de otras instituciones.
  creditosNuevos: EstadoDeOperacion[];
  // Operaciones propias que estaban en t0 y en t1 están peor.
  deterioros: (EstadoDeOperacion & { calificacionT0: string | null; diasT0: number | null; castigoT0: boolean; judicialT0: boolean })[];
  // La operación de la institución que entregó el archivo, si el buró la trae.
  institucion: (EstadoDeOperacion & { numeroOperacion: string | null }) | null;
}

export interface Consulta {
  raw: AnyRecord;
  perfil: AnyRecord;
  fecha: string; // yyyy-mm-dd
}

export interface OpcionesDelDetector {
  cedula: string;
  // Reconoce en el buró la operación de la institución del archivo. Sin él,
  // su crédito se cuenta como "de otra institución".
  esDeLaInstitucion?: (fila: AnyRecord, canal: EstadoDeOperacion["canal"]) => boolean;
}

const ESCALA = ["A1", "A2", "A3", "B1", "B2", "C1", "C2", "D", "E"];
const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const texto = (v: unknown): string => String(v ?? "").trim();

function arr(raw: AnyRecord, recurso: string, campo: string): AnyRecord[] {
  const fuente = raw?.[recurso] as AnyRecord | undefined;
  const datos = (recurso === "basesInternas"
    ? ((fuente?.data as AnyRecord | undefined)?.data ?? fuente?.data)
    : fuente?.data) as AnyRecord | undefined;
  const v = datos?.[campo];
  return Array.isArray(v) ? (v as AnyRecord[]) : [];
}

// "yyyy/mm/dd", "dd/mm/yyyy", "dd/mm/yy" o milisegundos -> "yyyy-mm-dd".
// Los milisegundos se leen en hora de Ecuador (UTC-5, sin horario de
// verano): a las 20:00 de Ecuador la fecha UTC ya es la de mañana.
export function diaDe(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return new Date(v - 5 * 3600 * 1000).toISOString().slice(0, 10);
  const s = texto(v);
  let m = /^(\d{4})[-/](\d{2})[-/](\d{2})/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(s);
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null;
}
const restarDias = (dia: string, d: number): string => {
  const f = new Date(`${dia}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() - d);
  return f.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------- buró
interface Fila { clave: string; estado: EstadoDeOperacion; fila: AnyRecord; corte: string | null }

function operacionesPropias(raw: AnyRecord): Fila[] {
  const filas: Fila[] = [];
  for (const recurso of ["buroCreditoSuper", "buroCreditoDiners"]) {
    for (const r of arr(raw, recurso, "datosSuper")) {
      // Lo garantizado no es de la persona (estructura-v8).
      if (r.riesgo === "G" || r.riesgo === "C") continue;
      const saldomora = num(r.saldomora);
      const mora = saldomora > 0 ? saldomora : num(r.mora);
      filas.push({
        clave: `bancos|${recurso}|${texto(r.codEntidad) || texto(r.entnombre)}`,
        fila: r,
        corte: diaDe(r.fecha),
        estado: {
          canal: "bancos", entidad: texto(r.entnombre), calificacion: texto(r.calificacion) || null, dias: null,
          castigo: num(r.castigo) > 0, judicial: num(r.judicial) > 0,
          vencido: mora + num(r.noDevengaInteres) + num(r.judicial) + num(r.castigo),
          saldo: num(r.saldoVigente) + mora + num(r.noDevengaInteres),
        },
      });
    }
  }
  for (const r of arr(raw, "buroCreditoCoop", "datosSuper")) {
    const vencido = ["val_venc_1", "val_venc_2", "val_venc_3", "val_venc_4", "val_venc_5", "val_venc_6", "val_venc_7", "val_venc_8", "val_venc_9", "val_venc_10", "val_venc_11"]
      .reduce((s, c) => s + num(r[c]), 0);
    filas.push({
      clave: `cooperativas|${texto(r.codRuc)}|${texto(r.num_operacion)}`,
      fila: r,
      corte: diaDe(r.fec_corte_saldo),
      estado: {
        canal: "cooperativas", entidad: texto(r.razon_social), calificacion: null, dias: num(r.num_dias_morosidad),
        castigo: num(r.val_cart_castigada) > 0, judicial: num(r.val_dem_judicial) > 0, vencido, saldo: num(r.val_saldo_total),
      },
    });
  }
  for (const r of arr(raw, "retails", "retails")) {
    filas.push({
      clave: `retail|${texto(r.institucion)}`,
      fila: r,
      corte: diaDe(r.fecha),
      estado: {
        canal: "retail", entidad: texto(r.institucion), calificacion: null, dias: num(r.diasMora),
        castigo: num(r.valorProcesoCastigado) > 0, judicial: num(r.valorProcesoJudicial) > 0, vencido: num(r.valorVencido), saldo: num(r.totalDeuda),
      },
    });
  }
  return filas;
}

// Las entidades con operaciones propias de la persona, como "canal|entidad".
// Sirve para mirar la carga entera: una entidad que en t0 no tenía a nadie y
// en t1 tiene a muchos empezó a reportar al buró; sus operaciones no son
// créditos que la persona sacó en el año.
// Sin la institución del archivo: su crédito aparece en t1 para todos los que
// desembolsó y la haría pasar por una entidad que empezó a reportar.
export function entidadesDelBuro(raw: AnyRecord, esDeLaInstitucion?: OpcionesDelDetector["esDeLaInstitucion"]): Set<string> {
  return new Set(
    operacionesPropias(raw)
      .filter((f) => !esDeLaInstitucion?.(f.fila, f.estado.canal))
      .map((f) => `${f.estado.canal}|${f.estado.entidad}`),
  );
}

const indice = (c: string | null): number => (c ? ESCALA.indexOf(c) : -1);
// Peor en t1 que en t0: por lo menos 30 días más de mora, una calificación
// que bajó hasta B2 o peor (pasar de A1 a A2 no es un deterioro), o un
// castigo o un juicio que no estaba.
function empeoro(a: EstadoDeOperacion, b: EstadoDeOperacion): boolean {
  const bajoLaCalificacion = indice(b.calificacion) > indice(a.calificacion) && indice(b.calificacion) >= indice("B2");
  return (b.dias ?? 0) >= (a.dias ?? 0) + 30 || bajoLaCalificacion || (b.castigo && !a.castigo) || (b.judicial && !a.judicial);
}

// ------------------------------------------------------------------ IESS
const mesClave = (anio: unknown, mes: unknown): string | null => {
  const a = num(anio), m = num(mes);
  return a && m ? `${a}-${String(m).padStart(2, "0")}` : null;
};
function aportesPorMes(raw: AnyRecord): Map<string, Map<string, AnyRecord>> {
  const porMes = new Map<string, Map<string, AnyRecord>>();
  for (const a of arr(raw, "basesInternas", "tiess")) {
    const k = mesClave(a.anio, a.mes);
    if (!k) continue;
    const empleadores = porMes.get(k) ?? new Map<string, AnyRecord>();
    empleadores.set(texto(a.rucEmp) || texto(a.nomEmp), a);
    porMes.set(k, empleadores);
  }
  return porMes;
}
const corteDe = (perfil: AnyRecord): string | null =>
  ((perfil.fuentesIngreso as AnyRecord | undefined)?.corteIessUsado as string | undefined) ?? null;
const mesSiguiente = (mes: string): string => {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
};

// ------------------------------------------------------------- detector
export function eventosEntreConsultas(t0: Consulta, t1: Consulta, opciones: OpcionesDelDetector): { eventos: Evento[]; buro: HechosDelBuro } {
  const eventos: Evento[] = [];
  const agregar = (tipo: TipoEvento, fecha: string | null, detalle: AnyRecord = {}) =>
    eventos.push({ tipo, clase: CLASE_DEL_EVENTO[tipo], fecha, detalle });
  const esDeLaInstitucion = opciones.esDeLaInstitucion ?? (() => false);

  // Créditos nuevos, deterioros y el crédito de la institución.
  const antes = new Map(operacionesPropias(t0.raw).map((f) => [f.clave, f]));
  const buro: HechosDelBuro = { creditosNuevos: [], deterioros: [], institucion: null };
  for (const f of operacionesPropias(t1.raw)) {
    if (esDeLaInstitucion(f.fila, f.estado.canal)) {
      buro.institucion = { ...f.estado, numeroOperacion: texto(f.fila.num_operacion) || null };
      agregar("credito_institucion", null, { numero_operacion: buro.institucion.numeroOperacion, dias: f.estado.dias, castigo: f.estado.castigo });
      continue;
    }
    const previa = antes.get(f.clave);
    if (!previa) {
      buro.creditosNuevos.push(f.estado);
      agregar("credito_otra_institucion", null, { canal: f.estado.canal, entidad: f.estado.entidad, saldo: Math.round(f.estado.saldo) });
      continue;
    }
    if (empeoro(previa.estado, f.estado)) {
      buro.deterioros.push({ ...f.estado, calificacionT0: previa.estado.calificacion, diasT0: previa.estado.dias, castigoT0: previa.estado.castigo, judicialT0: previa.estado.judicial });
      // Con días de mora se sabe cuándo empezó; con calificación, no.
      const desde = f.estado.dias && f.corte ? restarDias(f.corte, f.estado.dias) : null;
      agregar("mora_credito_previo", desde, {
        canal: f.estado.canal, entidad: f.estado.entidad, calificacion_t0: previa.estado.calificacion, calificacion_t1: f.estado.calificacion,
        dias_t0: previa.estado.dias, dias_t1: f.estado.dias,
      });
    }
  }

  // Demandas nuevas en su contra.
  const procesosAntes = new Set(arr(t0.raw, "demandas", "demandas").map((d) => texto((d.demanda as AnyRecord | undefined)?.numeroProceso)));
  for (const d of arr(t1.raw, "demandas", "demandas")) {
    const demanda = (d.demanda ?? {}) as AnyRecord;
    const proceso = texto(demanda.numeroProceso);
    if (proceso && procesosAntes.has(proceso)) continue;
    const fecha = diaDe(demanda.fecha);
    // Una demanda vieja que recién aparece en el registro no pasó en el año.
    if (fecha && fecha <= t0.fecha) continue;
    const categoria = categoriaDeDemanda(demanda.delito, demanda.ofendido);
    if (categoria === CATEGORIA_COBRO) agregar("demanda_cobro", fecha, { tipo: demanda.delito, demandante: demanda.ofendido });
    else if (!/^(Trámite|Investigación penal cerrada)/.test(categoria)) agregar("demanda_civil", fecha, { tipo: demanda.delito, categoria });
  }

  // Procesos en Fiscalía en los que la persona es la acusada, con su cédula.
  const noticiasAntes = new Set(arr(t0.raw, "denuncias", "denuncias").map((d) => texto(d.nroNoticia)));
  for (const d of arr(t1.raw, "denuncias", "denuncias")) {
    if (noticiasAntes.has(texto(d.nroNoticia))) continue;
    if (rolEnDenuncia(d, opciones.cedula) !== "acusada") continue;
    const fecha = diaDe(d.fecha);
    if (fecha && fecha <= t0.fecha) continue;
    agregar("proceso_fiscalia", fecha, { delito: d.delito });
  }

  // Pensión alimenticia nueva o mayor, como obligado (la regla del perfil).
  const civil0 = (t0.perfil.riesgoJudicialCivil ?? {}) as AnyRecord;
  const civil1 = (t1.perfil.riesgoJudicialCivil ?? {}) as AnyRecord;
  if (num(civil1.valorMensualPensiones) > num(civil0.valorMensualPensiones) || (civil1.tienePensionAlimenticia === true && civil0.tienePensionAlimenticia !== true)) {
    agregar("pension_alimenticia", null, {
      valor_mensual_t0: num(civil0.valorMensualPensiones), valor_mensual_t1: num(civil1.valorMensualPensiones), en_mora_t1: civil1.pensionAlimenticiaEnMora === true,
    });
  }

  // Trabajo: quien aportaba al corte de t0 y al de t1 ya no; o un empleador
  // nuevo al corte de t1.
  const corte0 = corteDe(t0.perfil), corte1 = corteDe(t1.perfil);
  if (corte0 && corte1 && corte1 > corte0) {
    const m0 = aportesPorMes(t0.raw), m1 = aportesPorMes(t1.raw);
    const vigentes0 = m0.get(corte0) ?? new Map();
    const vigentes1 = m1.get(corte1) ?? new Map();
    const jubilado = (t1.perfil.seguridadSocial as AnyRecord | undefined)?.esJubilado === true;
    const empleadores0 = [...vigentes0.keys()];
    if (empleadores0.length > 0 && !empleadores0.some((c) => vigentes1.has(c)) && !jubilado) {
      const ultimoViejo = [...m1.entries()].filter(([k, e]) => k > corte0 && empleadores0.some((c) => e.has(c))).map(([k]) => k).sort().at(-1) ?? corte0;
      const primeroNuevo = [...m1.entries()].filter(([k, e]) => k > ultimoViejo && e.size > 0).map(([k]) => k).sort()[0] ?? null;
      const sinAporte = mesSiguiente(ultimoViejo);
      // Entrar a otro empleador al mes siguiente es cambiar de trabajo, no
      // perderlo: hace falta por lo menos un mes sin aportes.
      if (!primeroNuevo || primeroNuevo > sinAporte) {
        agregar("perdida_trabajo", `${sinAporte}-01`, { ultimo_mes_con_aporte: ultimoViejo, empleadores_t0: [...vigentes0.values()].map((x) => x.nomEmp ?? null) });
      }
    }
    for (const [clave, aporte] of vigentes1) {
      if (vigentes0.has(clave)) continue;
      // Si t1 lo trae en el mes del corte de t0 o antes, ya trabajaba ahí: el
      // IESS completó ese mes después de la consulta. Pasó con 81 personas
      // entre la consulta del 2026-09-25 y la del 2026-10-03 (empleadores de
      // agosto que en septiembre todavía no figuraban).
      if ([...m1.entries()].some(([k, e]) => k <= corte0 && e.has(clave))) continue;
      const desde = [...m1.entries()].filter(([k, e]) => k > corte0 && e.has(clave)).map(([k]) => k).sort()[0] ?? corte1;
      agregar("trabajo_nuevo", `${desde}-01`, { empleador: aporte.nomEmp ?? null, salario: num(aporte.salario) || null });
    }
  }

  // El negocio cerró: el RUC estaba activo y ya no (regla de ruc.ts por
  // medio del perfil). La fecha es el cese que trae el SRI.
  const ruc0 = (t0.perfil.laboral as AnyRecord | undefined)?.tieneRucActivo === true;
  const ruc1 = (t1.perfil.laboral as AnyRecord | undefined)?.tieneRucActivo === true;
  if (ruc0 && !ruc1) {
    const ceses = arr(t1.raw, "contribuyente", "datosContribuyente")
      .filter((c) => texto(c.ruc).startsWith(opciones.cedula))
      .map((c) => fechasDelRuc(c).cese)
      .filter((d): d is string => Boolean(d))
      .sort();
    const enElAnio = ceses.filter((d) => d > t0.fecha);
    // Un cese con fecha anterior a t0 que recién aparece es el SRI
    // corrigiendo su registro, no un cierre en el año: entre la consulta del
    // 2026-09-25 y la del 2026-10-03 aparecieron ceses de 2010 a 2024.
    if (enElAnio.length || !ceses.length) agregar("cierre_negocio", enElAnio.at(-1) ?? null, {});
  }

  eventos.sort((a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999"));
  return { eventos, buro };
}
