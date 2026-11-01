// La cola de las evaluaciones que llegan por la API: qué pasa con una evaluación
// después de cada paso, cuándo se reintenta y en qué estado la ve la institución.
//
// La evaluación de la API ES una fila de `solicitudes` (origen = 'api'): los
// mismos pasos, los mismos módulos y la misma tabla que usa la pantalla. Lo que
// cambia es quién la hace avanzar. En la pantalla, el analista vuelve a llamar
// hasta que no quede paso; en la API la hace avanzar el trabajador
// (`procesar-evaluaciones`) y la institución sólo pregunta. Por eso acá aparece
// lo que la pantalla no necesita: un plazo, reintentos automáticos con espera,
// y estados finales que no cambian nunca (api/openapi.yaml, `Estado`).
//
// Todo función pura: la usan el trabajador, la puerta y las pruebas. Nada acá
// toca la base.

import {
  type CodigoDeFallo,
  type FalloDeUnPaso,
  marcarFallido,
  marcarPaso,
  type Paso,
  type RegistroDePaso,
  siguientePaso,
  todosHechos,
} from "./modalidades.ts";

type Fila = Record<string, unknown>;

// El plazo de la especificación (`Evaluacion.plazoHasta`): la persona que espera
// en la ventanilla no puede esperar una hora, y una campaña de cartera sí puede
// esperar un día.
export const PLAZO_INTERACTIVA_MS = 15 * 60_000;
export const PLAZO_DIFERIDA_MS = 24 * 3_600_000;

// Cuántas veces se intenta un mismo paso antes de rendirse. Sin un tope, un paso
// que falla por algo nuestro volvía a llamar al buró (que se cobra) cada pocos
// minutos hasta el plazo. Cuenta los intentos que se TOMARON, no sólo los que
// fallaron con un aviso: un trabajador que muere a mitad de un paso no deja
// anotado ningún fallo, y sin contarlo una consulta cobrada que no llegó a
// guardarse se pagaba otra vez en cada vuelta. El buró tiene menos intentos
// porque es el único paso que cuesta plata.
export const MAX_INTENTOS: Record<Paso, number> = { perfil: 5, buro: 3, analisis: 5, capacidad: 3 };

// La espera después del intento 1, 2, 3... La de un paso que pudo haber dejado
// algo en vuelo (el buró) es mayor y viene del propio fallo (`esperarMs`).
const ESPERAS_MS = [30_000, 120_000, 300_000, 600_000, 1_200_000];

export function esperaTrasFallo(intentos: number): number {
  return ESPERAS_MS[Math.min(Math.max(intentos, 1), ESPERAS_MS.length) - 1];
}

// Reintentar no cambia nada: la identificación no existe, hace falta una consulta
// que la API no hace, o el tope del día se agotó (se resetea mañana; `Fallo`
// dice «reintentar al día siguiente»).
const FALLOS_DEFINITIVOS: ReadonlySet<CodigoDeFallo> = new Set<CodigoDeFallo>([
  "identificacion_no_encontrada",
  "buro_requiere_consulta_previa",
  "tope_diario_agotado",
]);

export const esFalloDefinitivo = (codigo: CodigoDeFallo) => FALLOS_DEFINITIVOS.has(codigo);

export function plazoDeLaEvaluacion(prioridad: string | null | undefined, recibidaEl: Date): Date {
  return new Date(recibidaEl.getTime() + (prioridad === "diferida" ? PLAZO_DIFERIDA_MS : PLAZO_INTERACTIVA_MS));
}

// ---------------------------------------------------------------------------
// El id que ve la institución
// ---------------------------------------------------------------------------

// `ev_` y 26 caracteres de base32 de Crockford (el formato de un ULID). El id de
// la fila es un uuid de 128 bits: se escribe en esos 26 caracteres (130 bits, los
// dos de arriba en cero) y se lee de vuelta. Sin una columna aparte, y sin que
// el uuid interno aparezca en la API.
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function idDeLaEvaluacion(uuid: string): string {
  const hex = uuid.replaceAll("-", "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new RangeError("No es un uuid.");
  let n = BigInt("0x" + hex);
  let salida = "";
  for (let i = 0; i < 26; i++) {
    salida = CROCKFORD[Number(n & 31n)] + salida;
    n >>= 5n;
  }
  return "ev_" + salida;
}

export function uuidDeLaEvaluacion(id: unknown): string | null {
  if (typeof id !== "string" || !/^ev_[0-9A-HJKMNP-TV-Z]{26}$/.test(id)) return null;
  let n = 0n;
  for (const c of id.slice(3)) n = (n << 5n) | BigInt(CROCKFORD.indexOf(c));
  // Más de 128 bits: no lo generó esta API.
  if (n >> 128n !== 0n) return null;
  const hex = n.toString(16).padStart(32, "0");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// ---------------------------------------------------------------------------
// El estado de la evaluación, en el vocabulario de la especificación
// ---------------------------------------------------------------------------

export type EstadoDeLaApi = "recibida" | "en_proceso" | "completada" | "persona_no_encontrada" | "fallida" | "cancelada";

export interface FilaDeLaCola {
  id: string;
  estado: "en_evaluacion" | "evaluada" | "fallida";
  prioridad: "interactiva" | "diferida" | null;
  creada_el: string;
  plazo_hasta: string | null;
  pasos: RegistroDePaso[];
  resultado: Fila | null;
  intentos: number;
  fallo_codigo: CodigoDeFallo | null;
  terminada_el: string | null;
}

// `fallida` en la tabla es un estado de la pantalla, donde el analista reintenta;
// para una evaluación de la API es final, y por eso el trabajador nunca la deja
// ahí mientras haya algo que reintentar (ver `despuesDeUnFallo`).
export function estadoDeLaApi(s: Pick<FilaDeLaCola, "estado" | "pasos" | "fallo_codigo" | "intentos">): EstadoDeLaApi {
  if (s.estado === "evaluada") return "completada";
  if (s.estado === "fallida") {
    // Que la fuente no conozca la identificación es «persona_no_encontrada»; que
    // el buró no la acepte, no: la persona sí existe.
    const fallido = s.pasos.find((p) => p.estado === "fallido");
    return s.fallo_codigo === "identificacion_no_encontrada" && fallido?.paso === "perfil" ? "persona_no_encontrada" : "fallida";
  }
  const sinEmpezar = s.intentos === 0 && s.pasos.every((p) => p.estado === "pendiente" && !p.detalle);
  return sinEmpezar ? "recibida" : "en_proceso";
}

export const esEstadoFinal = (e: EstadoDeLaApi) => e !== "recibida" && e !== "en_proceso";

// La etapa que está corriendo, sólo mientras está en proceso. Son los pasos de
// la modalidad, con los nombres de `Evaluacion.etapa`.
export function etapaDeLaApi(s: Pick<FilaDeLaCola, "pasos">, ahora: Date = new Date()): Paso | null {
  const enCurso = s.pasos.find((p) => p.estado === "en_curso");
  return enCurso?.paso ?? siguientePaso(s.pasos, ahora) ?? s.pasos.find((p) => p.estado !== "hecho")?.paso ?? null;
}

// Cuándo conviene volver a preguntar (Retry-After), según lo que se está
// haciendo: Proveedor_Info_1 tarda del orden de un minuto, el modelo unos 20 segundos y
// la capacidad es un cálculo.
export function segundosParaVolver(etapa: Paso | null): number {
  return etapa === "perfil" ? 15 : etapa === "buro" ? 10 : etapa === "analisis" ? 10 : 2;
}

// ---------------------------------------------------------------------------
// Qué se anota después de cada paso
// ---------------------------------------------------------------------------

export type ResultadoDelPaso =
  | { ok: true; cambios: Fila; detalle: string; resultado: Fila }
  | { ok: false; fallo: FalloDeUnPaso };

// Las columnas de `solicitudes` que cambian. Siempre sueltan el reclamo
// (`reclamada_hasta`): el paso terminó, bien o mal, y el que sigue lo toma
// quien reclame después.
export type CambiosDeLaCola = Fila;

const suelta = (ahora: Date): Fila => ({ reclamada_hasta: null, actualizada_el: ahora.toISOString() });

export function despuesDeUnPaso(s: FilaDeLaCola, paso: Paso, r: ResultadoDelPaso, ahora: Date = new Date()): CambiosDeLaCola {
  if (r.ok) {
    const pasos = marcarPaso(s.pasos, paso, "hecho", r.detalle, ahora);
    const listo = todosHechos(pasos);
    return {
      ...r.cambios,
      ...suelta(ahora),
      pasos,
      resultado: { ...(s.resultado ?? {}), ...r.resultado },
      estado: listo ? "evaluada" : "en_evaluacion",
      evaluada_el: listo ? ahora.toISOString() : null,
      terminada_el: listo ? ahora.toISOString() : null,
      // El paso siguiente empieza de cero: sus intentos no son los de este.
      intentos: 0,
      proximo_intento_el: null,
    };
  }
  return despuesDeUnFallo(s, paso, r.fallo, ahora);
}

function final(s: FilaDeLaCola, paso: Paso, detalle: string, codigo: CodigoDeFallo, ahora: Date): CambiosDeLaCola {
  return {
    ...suelta(ahora),
    pasos: marcarFallido(s.pasos, paso, detalle, codigo, 0, ahora),
    estado: "fallida",
    fallo_codigo: codigo,
    terminada_el: ahora.toISOString(),
    proximo_intento_el: null,
  };
}

function despuesDeUnFallo(s: FilaDeLaCola, paso: Paso, fallo: FalloDeUnPaso, ahora: Date): CambiosDeLaCola {
  if (esFalloDefinitivo(fallo.codigo) || fallo.noReintentar) return final(s, paso, fallo.detalle, fallo.codigo, ahora);

  // `intentos` ya cuenta el que acaba de fallar: el trabajador lo suma al tomar
  // el paso. Quien llame sin haberlo sumado (una prueba) es el primero.
  const intentos = Math.max(s.intentos, 1);
  if (intentos >= MAX_INTENTOS[paso]) return final(s, paso, fallo.detalle, fallo.codigo, ahora);

  // La espera del propio fallo manda cuando es mayor: un paso que pudo dejar algo
  // en vuelo no se vuelve a tomar antes de que esa función termine seguro.
  const espera = Math.max(esperaTrasFallo(intentos), fallo.esperarMs);
  const proximo = new Date(ahora.getTime() + espera);
  // Si el próximo intento cae fuera del plazo no tiene sentido esperarlo: se le
  // dice ya a la institución, que puede pedirla de nuevo (la especificación
  // prefiere rechazar a tiempo a entregar tarde). Con el código de lo que falló:
  // «plazo_vencido» a secas taparía que fueron las fuentes, y la institución
  // decide distinto si puede reintentar más tarde o no.
  if (s.plazo_hasta && proximo.getTime() > Date.parse(s.plazo_hasta)) return final(s, paso, fallo.detalle, fallo.codigo, ahora);

  return {
    ...suelta(ahora),
    // El paso vuelve a pendiente, con lo que pasó a la vista de quien lea la fila.
    pasos: s.pasos.map((p) => (p.paso === paso ? { paso, estado: "pendiente", el: ahora.toISOString(), detalle: fallo.detalle, codigo: fallo.codigo } : p)),
    estado: "en_evaluacion",
    intentos,
    proximo_intento_el: proximo.toISOString(),
  };
}

// Un paso que ya se tomó todas las veces que se podía y quedó «en curso»: el
// trabajador murió con él a mitad de camino cada vez. Retomarlo de nuevo podría
// pagar el buró otra vez, así que se cierra la evaluación (y se avisa) en vez de
// seguir intentando. Si el paso está pendiente, el tope ya lo cerró al fallar.
export function despuesDeUnPasoCortadoDemasiadasVeces(s: FilaDeLaCola, paso: Paso, ahora: Date = new Date()): CambiosDeLaCola | null {
  const registro = s.pasos.find((p) => p.paso === paso);
  if (registro?.estado !== "en_curso" || s.intentos < MAX_INTENTOS[paso]) return null;
  return final(s, paso, "El paso se cortó varias veces sin terminar. Pedí la evaluación de nuevo; si se repite, citá el idPedido a CrediScope.", "error_interno", ahora);
}

// La evaluación llegó a su plazo sin terminar. Se anota en el paso que quedaba.
export function despuesDelPlazo(s: FilaDeLaCola, ahora: Date = new Date()): CambiosDeLaCola | null {
  if (!s.plazo_hasta || ahora.getTime() < Date.parse(s.plazo_hasta)) return null;
  const pendiente = s.pasos.find((p) => p.estado !== "hecho");
  if (!pendiente) return null;
  const detalle = pendiente.detalle ?? "La evaluación no terminó dentro de su plazo.";
  // Si el paso ya había fallado antes, esa es la causa; sin un fallo anotado, el plazo.
  return final(s, pendiente.paso, detalle, pendiente.codigo ?? "plazo_vencido", ahora);
}

// Cuánto después del plazo se sigue esperando al trabajador antes de ENTREGAR la
// evaluación como vencida al leerla: un paso que arrancó antes del plazo puede
// terminar hasta 3 minutos después, y una evaluación que se leyó como fallida no
// puede pasar a completada (los estados finales no cambian nunca).
export const GRACIA_DE_LECTURA_MS = 5 * 60_000;

// La evaluación tal como se entrega al leerla: si el plazo pasó hace rato y el
// trabajador no la cerró (no corre, o la clave de la agenda está mal), no se
// presenta «en proceso» para siempre. Sólo la vista: la fila no se toca desde una
// lectura, que no es quien debe cerrar algo que un trabajador puede estar corriendo.
export function conElPlazoAplicado(s: FilaDeLaCola, ahora: Date = new Date()): FilaDeLaCola {
  if (s.estado !== "en_evaluacion" || !s.plazo_hasta || ahora.getTime() < Date.parse(s.plazo_hasta) + GRACIA_DE_LECTURA_MS) return s;
  const cambios = despuesDelPlazo(s, ahora);
  return cambios ? ({ ...s, ...cambios } as FilaDeLaCola) : s;
}
