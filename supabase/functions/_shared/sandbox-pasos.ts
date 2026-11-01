// Los pasos de una evaluación del sandbox, y lo que se entrega al leerla.
//
// Función pura, sin base: nada de acá escribe en `clients`, `client_profiles`,
// `consultas_equifax`, `analysis_results` ni `llm_llamadas`. El trabajador anota el
// resultado en la solicitud, como con cualquier paso, y lo demás se vuelve a armar
// de los simuladores al leer. Esas tablas no se usan porque cada una alimenta algo
// real: una fila en `consultas_equifax` gasta el tope diario de la institución y
// parece un cobro, y una persona en `clients` entra a los totales de la cartera.
//
// Los pasos usan las mismas reglas que los de verdad (`leerLaConsulta`,
// `falloDeUnPaso`, `filaDelAnalisis`, `capacidadDeLaSolicitud`), no una copia.

import { buildStandardProfile, PROCESS_VERSION } from "./process.ts";
import { CORTE_IESS_CONOCIDO } from "./fuentes-ingreso.ts";
import { estadoPorFuente } from "./calidad-de-la-consulta.ts";
import { evaluarControlesBloqueo } from "./controles-bloqueo.ts";
import { leerLaConsulta } from "./consulta-de-perfil.ts";
import { filaDelAnalisis } from "./fila-del-analisis.ts";
import { capacidadDeLaSolicitud } from "./capacidad-de-la-solicitud.ts";
import { falloDeUnPaso, type Paso, type RegistroDePaso, resumenDelAnalisis } from "./modalidades.ts";
import type { ResultadoDelPaso } from "./cola-de-evaluaciones.ts";
import type { DatosDeLaEvaluacion } from "./evaluacion-de-la-api.ts";
import type { ResultadoControlBloqueo } from "./types.ts";
import { casoDe } from "./sandbox-casos.ts";
import { equifaxSimulado, modeloSimulado, proveedorInfo1Simulado, VERSION_DEL_SIMULADOR } from "./sandbox-simuladores.ts";

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

// La especificación: `0000000007` tarda 120 segundos, para probar la espera y los
// avisos. Con la cola y no durmiendo: un paso dormido ocupa un lugar del trabajador
// y vive menos que la función.
const DEMORA_MS = 120_000;

function perfilSimulado(identificacion: string) {
  const raw = proveedorInfo1Simulado(identificacion);
  return {
    raw,
    standard_profile: buildStandardProfile(raw, identificacion, CORTE_IESS_CONOCIDO).profile,
    control_bloqueo: evaluarControlesBloqueo(raw, identificacion),
    estado_por_fuente: estadoPorFuente(raw),
    structure_version: PROCESS_VERSION,
  };
}

function analisisSimulado(identificacion: string, controlBloqueo: ResultadoControlBloqueo) {
  return filaDelAnalisis({
    runId: "",
    clientId: "",
    clientProfileId: "",
    marcoVersion: VERSION_DEL_SIMULADOR,
    llmResult: modeloSimulado(identificacion),
    controlBloqueo,
    duracionIngestaMs: null,
    duracionLlmMs: null,
  });
}

function pasoPerfil(s: Fila, ahora: Date): ResultadoDelPaso {
  const id = s.identificacion as string;
  if (casoDe(id) === "demorada") {
    const faltan = DEMORA_MS - (ahora.getTime() - Date.parse(s.creada_el));
    if (faltan > 0) return { ok: false, fallo: { detalle: "La evaluación simulada todavía no termina.", codigo: "fuentes_no_disponibles", esperarMs: faltan } };
  }
  const { raw, standard_profile: perfil } = perfilSimulado(id);
  const lectura = leerLaConsulta(raw, { cedula: id, ingresado: id, tipoIdentificacion: "cedula" });
  // Sin reintentos: la especificación promete una respuesta fija, y una integración
  // no tiene por qué esperar los ocho minutos de reintentos de una caída de verdad.
  if (!lectura.ok) return { ok: false, fallo: { ...falloDeUnPaso("perfil", lectura.status), noReintentar: true } };
  const f = perfil.fuentesIngreso;
  return {
    ok: true,
    cambios: {},
    detalle: "Sandbox: perfil simulado, sin consultar a ninguna fuente.",
    resultado: { perfil: { perfilId: null, perfilDel: ahora.toISOString(), reutilizado: false, segmento: f?.segmento ?? null, ingresoReportadoIess: f?.pisoIngresoMensualReportado ?? null } },
  };
}

function pasoAnalisis(s: Fila): ResultadoDelPaso {
  const id = s.identificacion as string;
  const resumen = resumenDelAnalisis(analisisSimulado(id, perfilSimulado(id).control_bloqueo));
  return { ok: true, cambios: {}, detalle: "Sandbox: análisis simulado, sin llamar al modelo.", resultado: { analisis: resumen } };
}

export function correrPasoSimulado(paso: Paso, s: Fila, ahora: Date): ResultadoDelPaso {
  const id = s.identificacion as string;
  if (paso === "perfil") return pasoPerfil(s, ahora);
  if (paso === "buro") {
    casoDe(id);
    return { ok: true, cambios: {}, detalle: "Sandbox: buró simulado, sin consultar ni cobrar.", resultado: { buro: { consultaId: null, consultadoEl: ahora.toISOString(), reutilizada: false } } };
  }
  if (paso === "analisis") return pasoAnalisis(s);
  const estructura = s.modalidad === "plus" ? equifaxSimulado(id, s.resultado?.buro?.consultadoEl ?? ahora.toISOString()) : null;
  return capacidadDeLaSolicitud(s, perfilSimulado(id).standard_profile, estructura);
}

// Lo que `armarEvaluacion` lee de la base en una evaluación real.
export function datosDeLaEvaluacionSimulada(s: Fila): DatosDeLaEvaluacion {
  const id = s.identificacion as string;
  if (!s.resultado?.perfil) return { solicitud: s, analisis: null, perfil: null, conBuro: false };
  const { standard_profile, control_bloqueo, estado_por_fuente, structure_version } = perfilSimulado(id);
  const paso = (s.pasos as RegistroDePaso[]).find((p) => p.paso === "analisis");
  return {
    solicitud: s,
    analisis: s.resultado.analisis ? { ...analisisSimulado(id, control_bloqueo), created_at: paso?.el ?? null } : null,
    perfil: { created_at: s.resultado.perfil.perfilDel, structure_version, control_bloqueo, estado_por_fuente, standard_profile },
    conBuro: Boolean(s.resultado.buro),
  };
}
