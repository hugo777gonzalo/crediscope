// Cómo se lee el crudo de Proveedor_Info_1 (docs/capa-de-hechos.md, sección 3.1).
//
// Los ayudantes de arriba se MOVIERON de process.ts sin cambiar su cuerpo
// (tarea E4): process.ts los importa de acá, y los grupos de hechos también.
// Una sola implementación para que el perfil y los hechos lean igual el mismo
// registro; dos copias es como aparecen las diferencias silenciosas.
//
// Lo de abajo de la línea es nuevo de la capa de hechos: la referencia a un
// registro y si una fuente contestó.

import type { MotivoDeNoDisponible, RefDeRegistro } from "./tipos.ts";

export type AnyRecord = Record<string, unknown>;

export function parseFecha(v: unknown): Date | null {
  if (v === null || v === undefined || v === "") return null;
  const d = new Date(v as string | number);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

// Sumas de dinero a centavos: sumar decimales en coma flotante dejaba
// saldos como 258798.83000000002, que el modelo copiaba tal cual.
export function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

export function arr(multi: AnyRecord | null | undefined, recurso: string, campo: string): AnyRecord[] {
  const v = (multi?.[recurso] as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const items = v?.[campo];
  return Array.isArray(items) ? (items as AnyRecord[]) : [];
}

// Status de la fuente puntual (ResultadoFuente.status) — a diferencia de
// arr()/obj(), que solo miran si HAY registros, esto distingue "el
// recurso se consultó bien y no trajo nada" (status "ok", 0 registros
// reales) de "el recurso falló/no trajo datos" (status "faltante"/
// "error"/"deshabilitado") — necesario para no confundir "confirmado
// que NO aplica" con "no lo sabemos" (ver seguridadSocial en process.ts).
export function estadoRecurso(multi: AnyRecord | null | undefined, recurso: string): string | undefined {
  return (multi?.[recurso] as AnyRecord | undefined)?.status as string | undefined;
}

export function obj(multi: AnyRecord | null | undefined, recurso: string, campo: string): AnyRecord | null {
  const v = (multi?.[recurso] as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const val = v?.[campo];
  return val && typeof val === "object" && !Array.isArray(val) ? (val as AnyRecord) : null;
}

export function textoDe(v: unknown): string | null {
  const t = String(v ?? "").trim();
  return t === "" ? null : t;
}

// ---------------------------------------------------------------------------

// Un registro de una lista del crudo, o la respuesta entera de una fuente
// (sin `indice`): es lo que se cita cuando la fuente dijo que no hay nada.
export function ref(consulta: string, fuente: string, lista?: string, indice?: number, campo?: string): RefDeRegistro {
  const r: RefDeRegistro = { consulta, fuente };
  if (lista !== undefined) r.lista = lista;
  if (indice !== undefined) r.indice = indice;
  if (campo !== undefined) r.campo = campo;
  return r;
}

// ¿Contestó la fuente? Todas las del grupo 1 dicen «no hay» con la lista vacía
// (`noHay: "vacio"` en FUENTES), así que un `faltante` es una falla, igual que
// un `error` o la clave ausente; `deshabilitado` lo apagó la configuración. Hoy
// process.ts no distingue nada de esto: arr() devuelve [] y el perfil dice 0.
export function respuestaDe(crudo: AnyRecord | null | undefined, fuente: string): "contesto" | MotivoDeNoDisponible {
  const estado = estadoRecurso(crudo, fuente);
  if (estado === "ok") return "contesto";
  if (estado === "deshabilitado") return "fuente_deshabilitada";
  return "fuente_sin_respuesta";
}

// Una fila de una lista del crudo con su posición: la posición es lo que la
// cita guarda, así que se lleva desde que se lee.
export interface Fila {
  fuente: string;
  lista: string;
  indice: number;
  r: AnyRecord;
}

export function filasDe(crudo: AnyRecord | null | undefined, fuente: string, lista: string): Fila[] {
  return arr(crudo, fuente, lista).map((r, indice) => ({ fuente, lista, indice, r }));
}

// Un campo que la fila no trae no se cita: la regla lo leyó como vacío, y la
// cita diría que existe. Se cita la fila.
export function refDeFila(consulta: string, f: Fila, campo?: string): RefDeRegistro {
  return ref(consulta, f.fuente, f.lista, f.indice, campo !== undefined && campo in f.r ? campo : undefined);
}

// La respuesta de una fuente, que es lo que se cita cuando dijo que no hay nada.
// Si la lista no vino, se cita la fuente entera: es lo único que existe.
export function refDeRespuesta(crudo: AnyRecord | null | undefined, consulta: string, fuente: string, lista: string): RefDeRegistro {
  const v = (crudo?.[fuente] as AnyRecord | undefined)?.data as AnyRecord | undefined;
  return Array.isArray(v?.[lista]) ? ref(consulta, fuente, lista) : ref(consulta, fuente);
}

// Qué cita un hecho, en este orden: las filas que aportaron al valor (con el
// campo leído); si ninguna aportó, las que la regla miró; si no había ninguna,
// la respuesta de cada fuente, que es el registro de «la fuente dice que no hay».
export function citar(aportaron: RefDeRegistro[], miradas: RefDeRegistro[], respuestas: RefDeRegistro[]): RefDeRegistro[] {
  if (aportaron.length) return aportaron;
  if (miradas.length) return miradas;
  return respuestas;
}

// Las filas que aportan a una suma de un campo: las que traen un número
// distinto de cero. Con eso, sumar el campo de lo citado da el valor.
export function aportesDe(consulta: string, filas: Fila[], campoDe: (f: Fila) => string): RefDeRegistro[] {
  const salida: RefDeRegistro[] = [];
  for (const f of filas) {
    const campo = campoDe(f);
    const v = num(f.r[campo]);
    if (v !== null && v !== 0) salida.push(refDeFila(consulta, f, campo));
  }
  return salida;
}

// El campo con el corte de cada fuente que lo trae. Medido sobre el respaldo
// del 03/10 (2.567 personas): bancos y Diners traen `fecha` en todas las filas,
// con un solo valor por persona en las 2.427 que tienen filas; cooperativas,
// `fec_corte_saldo`; el retail, `fecha` (su corte, julio de 2025); los préstamos
// del IESS/BIESS, `fechaCorte`. La base interna del BIESS no trae corte.
export const CAMPO_DE_CORTE: Readonly<Record<string, string>> = {
  buroCreditoSuper: "fecha",
  buroCreditoDiners: "fecha",
  buroCreditoCoop: "fec_corte_saldo",
  retails: "fecha",
  creditoQuirografario: "fechaCorte",
  creditoHipotecario: "fechaCorte",
};

// El corte más antiguo de los registros citados: lo que se afirma no es más
// reciente que eso. null si ninguno trae un corte que se pueda leer.
export function corteMasAntiguo(crudo: AnyRecord | null | undefined, registros: RefDeRegistro[]): string | null {
  let minimo: string | null = null;
  for (const r of registros) {
    const campo = CAMPO_DE_CORTE[r.fuente];
    if (!campo || r.lista === undefined || r.indice === undefined) continue;
    const iso = fechaIsoDe(arr(crudo, r.fuente, r.lista)[r.indice]?.[campo]);
    if (iso && (minimo === null || iso < minimo)) minimo = iso;
  }
  return minimo;
}

// «2025/07/31» (bancos, Diners y cooperativas) o «31/07/2025» y «31/07/25»
// (préstamos del IESS/BIESS y casas comerciales) a «2025-07-31»; null si no es
// una fecha que exista. Para `fechaDelDato`: el corte que dice la fuente.
export function fechaIsoDe(v: unknown): string | null {
  const t = String(v ?? "").trim();
  let anio: number, mes: number, dia: number;
  let m = t.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
  if (m) [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else {
    m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (!m) return null;
    [dia, mes, anio] = [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])];
  }
  const d = new Date(Date.UTC(anio, mes - 1, dia));
  if (d.getUTCFullYear() !== anio || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return d.toISOString().slice(0, 10);
}
