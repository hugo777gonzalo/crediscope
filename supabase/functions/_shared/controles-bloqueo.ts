// Verificaciones DURAS, determinísticas — a propósito NO delegadas al
// LLM. Son hechos binarios objetivos (¿está fallecido? ¿aparece en una
// lista de sanciones?), no juicios de riesgo crediticio donde un
// resultado "aproximado" tenga sentido. Cada hallazgo indica si es
// `bloqueante` — solo esos fuerzan `bloqueado: true` (y por tanto, en
// analyze-client/index.ts, el score a 1 y la recomendación de acción a
// "negar", sin importar lo que devuelva el LLM). Un hallazgo
// no-bloqueante se informa igual (aparece en `hallazgos`) pero no
// descalifica al cliente por sí solo.
//
// PEP (persona expuesta políticamente) es a propósito NO bloqueante: ser
// PEP es un dato de cumplimiento/PLA-FT (Prevención de Lavado de
// Activos y Financiamiento del Terrorismo — requiere debida diligencia
// reforzada), no una señal de mal comportamiento de pago — decisión
// explícita del usuario, no asumir lo contrario.
//
// Delitos graves de seguridad (lavado de activos, narcotráfico, trata
// de personas, armas, extorsión) SÍ son bloqueantes — a diferencia de
// PEP, decisión explícita del usuario: tan graves como aparecer en
// listas de sanciones.
//
// El resto de la evaluación (laboral, judicial, financiero, patrimonio)
// SÍ queda a criterio del LLM — ver llm-scoring.ts.

import type { RespuestaProveedorInfo1, ResultadoControlBloqueo } from "./types.ts";
import { hallazgosDelControl } from "./hechos/controles.ts";

// Desde estructura-v28 TODOS los hallazgos salen de la capa de hechos (hechos/controles.ts): el
// fallecido, la cédula inconsistente, las listas de control (por todas las listas del proveedor,
// D7), la lista negra, los homónimos, las listas internas, las providencias de certificación, el PEP
// y la seguridad ciudadana. Hasta la v27 este archivo leía el crudo por su cuenta (salvo seguridad
// ciudadana): el perfil y el bloqueo eran dos lecturas de lo mismo que coincidían por disciplina.
// Las reglas viven en hechos/grupos/cumplimiento.ts y riesgo-judicial.ts. Con una fuente caída el
// hallazgo sale de lo que dicen las que contestaron: no desbloquea a quien tiene evidencia en otra
// fuente ni bloquea sin evidencia (hechos/controles.ts).
export function evaluarControlesBloqueo(raw: RespuestaProveedorInfo1, requestedCedula: string): ResultadoControlBloqueo {
  const hallazgos = hallazgosDelControl(raw, requestedCedula, new Date().toISOString());

  const bloqueado = hallazgos.some((h) => h.bloqueante);
  // Un bloqueo manda sobre cualquier tope: el tope sólo se anota si no hay bloqueo.
  const salidaMaxima = !bloqueado && hallazgos.some((h) => h.salidaMaxima === "revisar") ? "revisar" : null;

  return { bloqueado, hallazgos, salidaMaxima };
}
