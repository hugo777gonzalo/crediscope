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

export interface RegistroDePaso {
  paso: Paso;
  estado: EstadoDelPaso;
  /** Cuándo cambió de estado por última vez (ISO). */
  el?: string;
  /** Lo que pasó, dicho para el analista: «Se reutilizó el perfil del 15/10», «Novadata no contestó». */
  detalle?: string;
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

// Reintentar: el paso fallido vuelve a pendiente; lo hecho no se repite.
export function reintentarPasos(pasos: RegistroDePaso[]): RegistroDePaso[] {
  return pasos.map((p) => (p.estado === "fallido" ? { paso: p.paso, estado: "pendiente" } : p));
}

export function todosHechos(pasos: RegistroDePaso[]): boolean {
  return pasos.length > 0 && pasos.every((p) => p.estado === "hecho");
}

export interface PedidoDeSolicitud {
  modalidad: Modalidad;
  condiciones: PedidoDeSimulacion | null;
  ingresoDeclarado: number | null;
}

// Lo que exige cada modalidad, antes de crear nada. Los mensajes van tal cual
// a la pantalla y a la API.
export function validarPedidoDeSolicitud(cuerpo: Record<string, unknown>): { ok: true; pedido: PedidoDeSolicitud } | { ok: false; errores: string[] } {
  const errores: string[] = [];
  const modalidad = cuerpo?.modalidad;
  if (!esModalidad(modalidad)) return { ok: false, errores: ["La modalidad es «basico», «pro» o «plus»."] };

  let condiciones: PedidoDeSimulacion | null = null;
  if (MODALIDADES[modalidad].exigeCondiciones) {
    const c = (cuerpo.solicitud ?? null) as PedidoDeSimulacion | null;
    if (!c || typeof c !== "object") {
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

  const declarado = cuerpo.ingresoDeclarado;
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

  return errores.length ? { ok: false, errores } : { ok: true, pedido: { modalidad, condiciones, ingresoDeclarado } };
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
