// Las tres modalidades de evaluación de una solicitud: qué exige cada una y
// qué pasos corre (docs/plan-demo-ifi.md, sección 4; decisiones del negocio
// del 2026-10-17).
//
// Una modalidad es una configuración, no un camino de código aparte: el
// orquestador (`evaluar-solicitud`) es uno solo y corre los pasos que la
// modalidad dice. Así Básico, Pro y Plus no son tres botones en la pantalla
// sino tres recorridos distintos con los mismos módulos.
//
// Función pura: la usan la función, la pantalla (para dibujar los pasos) y
// las pruebas.

import { MONTO_MAXIMO, type PedidoDeSimulacion, validarPedido, PRODUCTO_CONSUMO } from "./simulador-credito.ts";
import { type DatosDeLaSolicitud, validarDatosDeLaSolicitud } from "./datos-de-la-solicitud.ts";

export const MODALIDADES_VERSION = "modalidades-v1";

export type Modalidad = "basico" | "pro" | "plus";
export type Paso = "perfil" | "buro" | "analisis" | "capacidad";

export interface DefinicionDeModalidad {
  nombre: string;
  descripcion: string;
  exigeCondiciones: boolean;
  pasos: Paso[];
}

// Básico: preaprobación sin capacidad de pago (perfil, fuentes de ingreso y
// la recomendación del modelo). Pro: más la cuota y la capacidad de pago con
// lo que ya se sabe de la persona. Plus: más el buró de la institución, que
// trae las cuotas de cada operación. La recomendación del modelo y la
// capacidad se muestran por separado: no se combinan (negocio, 2026-10-17).
export const MODALIDADES: Record<Modalidad, DefinicionDeModalidad> = {
  basico: {
    nombre: "Básico",
    descripcion: "Perfil, fuentes de ingreso y la recomendación del modelo. Sin capacidad de pago.",
    exigeCondiciones: false,
    pasos: ["perfil", "analisis"],
  },
  pro: {
    nombre: "Pro",
    descripcion: "Lo de Básico, más la cuota del crédito pedido y si entra en el ingreso de la persona.",
    exigeCondiciones: true,
    pasos: ["perfil", "analisis", "capacidad"],
  },
  plus: {
    nombre: "Plus",
    descripcion: "Lo de Pro, con el buró de la institución: las cuotas de cada crédito que tiene la persona.",
    exigeCondiciones: true,
    pasos: ["perfil", "buro", "analisis", "capacidad"],
  },
};

export const NOMBRE_DEL_PASO: Record<Paso, string> = {
  perfil: "Perfil y fuentes de ingreso",
  buro: "Buró de la institución",
  analisis: "Recomendación del modelo",
  capacidad: "Cuota y capacidad de pago",
};

export type EstadoDelPaso = "pendiente" | "en_curso" | "hecho" | "fallido";

// Por qué falló un paso, en el vocabulario de `Fallo.codigo` de la
// especificación de la API (api/openapi.yaml). El texto (`detalle`) es para el
// analista; el código es para quien programa contra la API y no puede leer
// castellano para decidir si reintenta. `plazo_vencido` no está acá: es de la
// cola de la API (Fase 1), no de un paso.
export type CodigoDeFallo =
  | "fuentes_no_disponibles"
  | "buro_requiere_consulta_previa"
  | "tope_diario_agotado"
  | "buro_no_disponible"
  | "identificacion_no_encontrada"
  | "error_interno";

export interface RegistroDePaso {
  paso: Paso;
  estado: EstadoDelPaso;
  /** Cuándo cambió de estado por última vez (ISO). */
  el?: string;
  /** Lo que pasó, dicho para el analista: «Se reutilizó el perfil del 15/10», «Novadata no contestó». */
  detalle?: string;
  /** Un paso fallido que pudo haber dejado algo corriendo (o cobrado) no se reintenta antes de esto (ISO). */
  reintentarDesde?: string;
  /** Sólo en un paso fallido: por qué falló, para máquinas. Reintentar lo borra con el resto. */
  codigo?: CodigoDeFallo;
}

export function esModalidad(v: unknown): v is Modalidad {
  return v === "basico" || v === "pro" || v === "plus";
}

export function pasosIniciales(modalidad: Modalidad): RegistroDePaso[] {
  return MODALIDADES[modalidad].pasos.map((paso) => ({ paso, estado: "pendiente" }));
}

// Un paso que quedó «en curso» más de este tiempo se da por caído (la función
// se cortó a los 150 s) y se puede volver a tomar.
export const PASO_CAIDO_MS = 3 * 60 * 1000;

// El próximo paso a correr, o null si no queda ninguno (o uno falló: la
// evaluación se detiene hasta que alguien la reintente).
export function siguientePaso(pasos: RegistroDePaso[], ahora: Date = new Date()): Paso | null {
  if (pasos.some((p) => p.estado === "fallido")) return null;
  for (const p of pasos) {
    if (p.estado === "hecho") continue;
    if (p.estado === "pendiente") return p.paso;
    if (p.estado === "en_curso") {
      // Sin fecha, o con una que no se entiende, no hay forma de saber cuándo
      // empezó: se da por caído. Con NaN la resta daba falso y la evaluación
      // quedaba trabada para siempre.
      const desde = p.el ? Date.parse(p.el) : Number.NaN;
      return Number.isNaN(desde) || ahora.getTime() - desde > PASO_CAIDO_MS ? p.paso : null;
    }
    // Un estado que no existe: se detiene. Saltearlo correría el paso siguiente
    // (que puede cobrarse) sin que este haya terminado.
    return null;
  }
  return null;
}

export function marcarPaso(pasos: RegistroDePaso[], paso: Paso, estado: EstadoDelPaso, detalle?: string, ahora: Date = new Date()): RegistroDePaso[] {
  return pasos.map((p) => (p.paso === paso ? { paso, estado, el: ahora.toISOString(), ...(detalle ? { detalle } : {}) } : p));
}

// Un paso fallido, con la espera antes de poder reintentarlo.
export function marcarFallido(
  pasos: RegistroDePaso[],
  paso: Paso,
  detalle: string,
  codigo: CodigoDeFallo,
  esperarMs = 0,
  ahora: Date = new Date(),
): RegistroDePaso[] {
  const desde = esperarMs > 0 ? new Date(ahora.getTime() + esperarMs).toISOString() : null;
  return marcarPaso(pasos, paso, "fallido", detalle, ahora).map((p) =>
    p.paso === paso ? { ...p, codigo, ...(desde ? { reintentarDesde: desde } : {}) } : p
  );
}

// Reintentar: el paso fallido vuelve a pendiente; lo hecho no se repite. Un
// paso que todavía tiene que esperar queda fallido: la función a la que se
// llamó puede seguir corriendo hasta 150 s después de que se dejó de
// esperarla, y una consulta a Equifax que sigue en vuelo, pedida otra vez,
// se cobra dos veces.
export function reintentarPasos(pasos: RegistroDePaso[], ahora: Date = new Date()): RegistroDePaso[] {
  return pasos.map((p) => {
    if (p.estado !== "fallido") return p;
    if (p.reintentarDesde && Date.parse(p.reintentarDesde) > ahora.getTime()) return p;
    return { paso: p.paso, estado: "pendiente" };
  });
}

// ¿Este paso está corriendo ahora (en curso y no caído)? Para no consultar
// Equifax desde dos solicitudes de la misma persona a la vez: la reutilización
// mira lo guardado, y una consulta en vuelo todavía no lo está.
export function pasoEnCurso(pasos: RegistroDePaso[] | null | undefined, paso: Paso, ahora: Date = new Date()): boolean {
  const p = (pasos ?? []).find((x) => x.paso === paso);
  if (!p || p.estado !== "en_curso") return false;
  return ahora.getTime() - (p.el ? Date.parse(p.el) : 0) <= PASO_CAIDO_MS;
}

// Lo que se anota cuando la función de un paso no contestó bien. El mensaje
// es siempre nuestro: el de la función llamada puede traer el de un tercero
// (Novadata, Equifax, el modelo) o el de la base, y la solicitud la lee todo
// analista. El código también: sale del estado y del motivo, nunca del texto
// de quien contestó. `status` 0 = no llegó la respuesta (se cortó la espera o
// no se pudo llamar); `motivo` es el que devuelve consultar-equifax al rechazar.
export interface FalloDeUnPaso {
  detalle: string;
  codigo: CodigoDeFallo;
  esperarMs: number;
}

export function falloDeUnPaso(paso: Paso, status: number, motivo?: string | null): FalloDeUnPaso {
  const sinRespuesta = "No llegó la respuesta a tiempo; el servicio pudo haber seguido trabajando.";
  const enUnosMinutos = " Se puede reintentar en unos minutos.";
  // Una sesión vencida no es un fallo de la evaluación: pasa sólo con la pantalla
  // del analista, y la API de la institución no tiene sesión que se venza.
  if (status === 401) return { detalle: "La sesión no es válida: volvé a ingresar y reintentá.", codigo: "error_interno", esperarMs: 0 };

  if (paso === "buro") {
    if (status === 403) {
      return {
        detalle: "La persona no tiene una consulta de Equifax vigente, y consultar Equifax se cobra: lo hace un administrador. Pedile que la consulte o usá la modalidad Pro.",
        codigo: "buro_requiere_consulta_previa",
        esperarMs: 0,
      };
    }
    if (status === 400) return { detalle: "Equifax no acepta esta identificación. No se consultó.", codigo: "identificacion_no_encontrada", esperarMs: 0 };
    if (motivo === "tope_diario") {
      return { detalle: "Se llegó al tope diario de consultas a Equifax (cada una se cobra). Se puede reintentar mañana.", codigo: "tope_diario_agotado", esperarMs: 0 };
    }
    if (motivo === "equifax_no_responde") {
      // No salió nada hacia Equifax: no hay nada en vuelo que esperar. El freno se abre solo.
      return { detalle: "Equifax no está respondiendo (varios fallos seguidos). No se consultó ni se cobró." + enUnosMinutos, codigo: "buro_no_disponible", esperarMs: 0 };
    }
    if (motivo === "proveedor_apagado" || motivo === "consumo_no_medible") {
      return { detalle: "Equifax no está disponible para consultar (está apagado o no se pudo medir el consumo del día). No se consultó.", codigo: "buro_no_disponible", esperarMs: 0 };
    }
    if (motivo === "otra_persona") {
      return {
        detalle: "Equifax contestó por otra identificación: la consulta se cobró y no se guardó. Revisalo con administración antes de reintentar, porque reintentar vuelve a cobrar.",
        codigo: "buro_no_disponible",
        esperarMs: PASO_CAIDO_MS,
      };
    }
    // Todo lo demás pudo salir hacia Equifax: se espera a que termine y, si
    // quedó guardada, el reintento la reutiliza sin volver a pagar.
    return {
      detalle: `${status === 0 ? sinRespuesta : "Equifax no completó la consulta."} La consulta pudo haberse cobrado: si quedó guardada, al reintentar se reutiliza.${enUnosMinutos}`,
      codigo: "buro_no_disponible",
      esperarMs: PASO_CAIDO_MS,
    };
  }

  if (status === 0) {
    return { detalle: sinRespuesta + enUnosMinutos, codigo: paso === "perfil" ? "fuentes_no_disponibles" : "error_interno", esperarMs: PASO_CAIDO_MS };
  }
  if (status === 403) return { detalle: "Tu rol no puede correr este paso.", codigo: "error_interno", esperarMs: 0 };
  if (paso === "perfil") {
    if (status === 404) {
      return {
        detalle: "La fuente no encuentra a ninguna persona con esa cédula: puede ser un dígito cambiado o una cédula que la fuente todavía no tiene.",
        codigo: "identificacion_no_encontrada",
        esperarMs: 0,
      };
    }
    if (status === 503) {
      return { detalle: "Las fuentes de datos no respondieron y no se guardó nada. Volvé a intentar en unos minutos.", codigo: "fuentes_no_disponibles", esperarMs: 0 };
    }
    // La cédula ya pasó la validación al crear la solicitud: que la función la
    // rechace es un desacuerdo entre las dos, no un dato de la persona.
    if (status === 400) return { detalle: "La identificación no se puede consultar.", codigo: "error_interno", esperarMs: 0 };
    return { detalle: "No se pudo consultar a la persona.", codigo: "error_interno", esperarMs: 0 };
  }
  return { detalle: "El modelo no pudo analizar a la persona.", codigo: "error_interno", esperarMs: 0 };
}

export function todosHechos(pasos: RegistroDePaso[]): boolean {
  return pasos.length > 0 && pasos.every((p) => p.estado === "hecho");
}

export interface PedidoDeSolicitud {
  modalidad: Modalidad;
  condiciones: PedidoDeSimulacion | null;
  ingresoDeclarado: number | null;
  /** Autorización, referencia, operador, prioridad y reemplazaA: todos opcionales acá. */
  datos: DatosDeLaSolicitud;
}

// Lo que exige cada modalidad, antes de crear nada. Los mensajes van tal cual
// a la pantalla y a la API.
//
// Las condiciones del crédito y el Ingreso declarado vienen juntos en
// `solicitudDeCredito`, como en PedidoDeEvaluacion de la especificación de la
// API (negocio, 2026-10-19). Antes las condiciones iban en `solicitud` y el
// Ingreso declarado en la raíz del cuerpo: lo que mandaba la IFI según la
// especificación no coincidía con lo que leía la función.
export function validarPedidoDeSolicitud(
  cuerpo: Record<string, unknown>,
  ahora: Date = new Date(),
): { ok: true; pedido: PedidoDeSolicitud } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  const modalidad = cuerpo?.modalidad;
  if (!esModalidad(modalidad)) return { ok: false, errores: ["La modalidad es «basico», «pro» o «plus»."] };

  const solicitudDeCredito = cuerpo.solicitudDeCredito;
  const sc = solicitudDeCredito && typeof solicitudDeCredito === "object" && !Array.isArray(solicitudDeCredito)
    ? (solicitudDeCredito as Record<string, unknown>)
    : null;

  let condiciones: PedidoDeSimulacion | null = null;
  if (MODALIDADES[modalidad].exigeCondiciones) {
    const c = sc as PedidoDeSimulacion | null;
    if (!c) {
      errores.push(`La modalidad ${MODALIDADES[modalidad].nombre} necesita las condiciones del crédito: monto, plazo y tasa.`);
    } else {
      // Se valida lo que se va a guardar, no lo que llegó: la solicitud no guarda
      // `tasaNominalMaximaPorcentaje`, así que una tasa de 50% con un máximo de
      // 99 pasaba la validación y el paso de capacidad la rechazaba después.
      condiciones = {
        monto: c.monto,
        plazoMeses: c.plazoMeses,
        tasaNominalAnualPorcentaje: c.tasaNominalAnualPorcentaje,
        sistema: c.sistema ?? PRODUCTO_CONSUMO.sistema,
        desgravamen: c.desgravamen ?? PRODUCTO_CONSUMO.desgravamen,
      };
      errores.push(...validarPedido(condiciones));
    }
  }

  const declarado = sc?.ingresoDeclarado;
  let ingresoDeclarado: number | null = null;
  if (declarado !== undefined && declarado !== null && declarado !== "") {
    if (typeof declarado !== "number" || !Number.isFinite(declarado) || declarado < 0) errores.push("El Ingreso declarado va en dólares por mes, como número.");
    else if (declarado > MONTO_MAXIMO) errores.push("El Ingreso declarado no puede pasar de 1.000.000.000 de dólares por mes.");
    else {
      // Menos de medio centavo queda en cero: es lo mismo que no declarar.
      const redondeado = Math.round(declarado * 100) / 100;
      if (redondeado > 0) ingresoDeclarado = redondeado;
    }
  }

  const datos = validarDatosDeLaSolicitud(cuerpo, ahora);
  if (!datos.ok) errores.push(...datos.errores);

  return errores.length || !datos.ok ? { ok: false, errores } : { ok: true, pedido: { modalidad, condiciones, ingresoDeclarado, datos: datos.datos } };
}

// Lo que se guarda del análisis del modelo en el resultado de la solicitud:
// el score, la recomendación y de dónde salió, con la versión del marco. El
// razonamiento completo se lee del análisis (analysis_results), no se copia.
export function resumenDelAnalisis(fila: Record<string, unknown>) {
  return {
    analisisId: fila.id ?? null,
    score: fila.crediscope_score ?? null,
    recomendacion: fila.recomendacion ?? null,
    veredictoOrigen: fila.veredicto_origen ?? null,
    indicadorRiesgo: fila.indicador_riesgo ?? null,
    marco: fila.rules_version ?? null,
  };
}
