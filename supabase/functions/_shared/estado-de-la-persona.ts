// El estado de la persona (docs/modelo-de-la-persona.md), calculado desde los
// hechos: sus solicitudes, lo que recomendó el modelo y lo que decidió la
// institución (134). No se escribe a mano en ningún lado (negocio, 2026-10-12):
// un estado guardado aparte se desfasa de los hechos el primer día que alguien
// corrige una decisión.
//
// Lo importan la pantalla y las funciones: una sola implementación.
//
// Decisiones que el negocio no tomó y que se resolvieron así hasta que diga
// otra cosa (modelo-de-la-persona.md, sección 5, punto 6):
//   - manda la última solicitud. Quien quedó No aprobado y vuelve a pedir un
//     crédito pasa a En proceso; quien fue aprobado y pide otro, también;
//   - Preaprobado es sólo cuando el modelo recomienda Aprobar (P3 del plan de la
//     demo). Con Revisar o Negar la persona sigue En proceso hasta que el
//     analista decide: el modelo aconseja, no rechaza.
// Cliente activo y Cliente cerrado necesitan los créditos, que todavía no
// existen como entidad: esta función no los devuelve nunca.

export const ESTADO_DE_LA_PERSONA_VERSION = "estado-persona-v1";

export type EstadoDeLaPersona =
  | "prospecto"
  // «En proceso». No se usa el código en_proceso: ya es un estado de la
  // evaluación en api/openapi.yaml (modelo-de-la-persona.md, 5).
  | "con_solicitud"
  | "preaprobado"
  | "aprobado"
  | "no_aprobado"
  | "cliente_activo"
  | "cliente_cerrado";

export const NOMBRE_DEL_ESTADO: Record<EstadoDeLaPersona, string> = {
  prospecto: "Prospecto",
  con_solicitud: "En proceso",
  preaprobado: "Preaprobado",
  aprobado: "Aprobado",
  no_aprobado: "No aprobado",
  cliente_activo: "Cliente activo",
  cliente_cerrado: "Cliente cerrado",
};

export type Decision = "aprobado" | "rechazado" | "desistido";

export const NOMBRE_DE_LA_DECISION: Record<Decision, string> = {
  aprobado: "Aprobado",
  rechazado: "Rechazado",
  desistido: "Desistió",
};

// Lo que hace falta de una fila de `solicitudes`. La recomendación es la de
// resultado.analisis.recomendacion.
export interface HechosDeUnaSolicitud {
  id: string;
  creada_el: string;
  estado: string;
  evaluada_el?: string | null;
  decision?: string | null;
  decidida_el?: string | null;
  recomendacion?: string | null;
}

export interface CambioDeEstado {
  estado: EstadoDeLaPersona;
  desde: string | null;
  solicitudId: string | null;
}

const marca = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : -Infinity;
};

function estadoPorDecision(decision: string | null | undefined): EstadoDeLaPersona | null {
  if (decision === "aprobado") return "aprobado";
  if (decision === "rechazado" || decision === "desistido") return "no_aprobado";
  return null;
}

// Los estados por los que pasó la persona con UNA solicitud, en orden.
function cambiosDeUnaSolicitud(s: HechosDeUnaSolicitud): CambioDeEstado[] {
  const cambios: CambioDeEstado[] = [{ estado: "con_solicitud", desde: s.creada_el, solicitudId: s.id }];
  // Un desistimiento puede llegar antes de que termine la evaluación: entonces
  // la persona nunca estuvo Preaprobada, aunque la evaluación termine después.
  const decididaAntes = s.decision && marca(s.decidida_el) < marca(s.evaluada_el);
  if (s.estado === "evaluada" && s.recomendacion === "aprobar" && !decididaAntes) {
    cambios.push({ estado: "preaprobado", desde: s.evaluada_el ?? null, solicitudId: s.id });
  }
  const porDecision = estadoPorDecision(s.decision);
  if (porDecision) cambios.push({ estado: porDecision, desde: s.decidida_el ?? null, solicitudId: s.id });
  return cambios;
}

// Ordena por fecha de creación; el id desempata para que el resultado no
// dependa del orden en que llegaron las filas.
function enOrden(solicitudes: HechosDeUnaSolicitud[]): HechosDeUnaSolicitud[] {
  return [...solicitudes]
    .filter((s) => s && typeof s.id === "string")
    .sort((a, b) => marca(a.creada_el) - marca(b.creada_el) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// El historial completo: un cambio por cada estado por el que pasó, el
// primero siempre Prospecto (sin fecha: no se sabe desde cuándo la conocemos).
export function historialDeLaPersona(solicitudes: HechosDeUnaSolicitud[]): CambioDeEstado[] {
  const historial: CambioDeEstado[] = [{ estado: "prospecto", desde: null, solicitudId: null }];
  for (const s of enOrden(solicitudes)) historial.push(...cambiosDeUnaSolicitud(s));
  return historial;
}

export function estadoDeLaPersona(solicitudes: HechosDeUnaSolicitud[]): CambioDeEstado {
  const historial = historialDeLaPersona(solicitudes);
  return historial[historial.length - 1];
}

// Desde una fila de `solicitudes` tal como la lee la pantalla o la función.
export function hechosDeLaFila(fila: Record<string, any>): HechosDeUnaSolicitud {
  return {
    id: fila.id,
    creada_el: fila.creada_el,
    estado: fila.estado,
    evaluada_el: fila.evaluada_el ?? null,
    decision: fila.decision ?? null,
    decidida_el: fila.decidida_el ?? null,
    recomendacion: fila.recomendacion ?? fila.resultado?.analisis?.recomendacion ?? null,
  };
}

// Qué decisiones se pueden marcar sobre una solicitud. La regla es la misma que
// aplica decidir_solicitud() en la base (134).
export function decisionesPosibles(estadoDeLaSolicitud: string): Decision[] {
  return estadoDeLaSolicitud === "evaluada" ? ["aprobado", "rechazado", "desistido"] : ["desistido"];
}

export const MOTIVO_MINIMO = 5;
export const MOTIVO_MAXIMO = 1000;

export function validarDecision(decision: unknown, motivo: unknown, estadoDeLaSolicitud: string): string[] {
  const errores: string[] = [];
  if (decision !== "aprobado" && decision !== "rechazado" && decision !== "desistido") {
    errores.push("La decisión es «aprobado», «rechazado» o «desistido».");
  } else if (!decisionesPosibles(estadoDeLaSolicitud).includes(decision)) {
    errores.push("Aprobar o rechazar se puede sólo con la evaluación terminada.");
  }
  const texto = typeof motivo === "string" ? motivo.trim() : "";
  if (texto.length < MOTIVO_MINIMO) errores.push("Escribí el motivo de la decisión.");
  if (texto.length > MOTIVO_MAXIMO) errores.push("El motivo puede tener hasta 1.000 caracteres.");
  return errores;
}
