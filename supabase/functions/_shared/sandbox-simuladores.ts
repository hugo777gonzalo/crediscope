// Los simuladores del sandbox de la API (api/openapi.yaml, «Sandbox»): lo que
// contestarían Novadata, Equifax y el modelo por cada identificación de prueba.
//
// Se simula la RESPUESTA de cada fuente y nada más: el perfil, los controles de
// bloqueo, la disponibilidad, la estructura de Equifax, la capacidad y la regla
// de «parcial nunca aprueba» corren con el código real sobre esa respuesta. Así,
// un cambio en esas reglas se ve en el sandbox, y una integración de la
// institución prueba lo mismo que va a recibir.
//
// Un simulador se niega a contestar por una identificación real (`casoDe`). Todo lo
// de acá es inventado y el repositorio es público: ni un dato de una persona.

import { RUTAS_POR_FUENTE } from "./novadata-client.ts";
import { CORTE_IESS_CONOCIDO } from "./fuentes-ingreso.ts";
import { calcularEstructura } from "./equifax-estructura.ts";
import { derivarTablas } from "./equifax-tablas.ts";
import { respuestaDePrueba } from "./equifax-respuesta-de-prueba.ts";
import { casoDe } from "./sandbox-casos.ts";
import type { LlmScoringResult, RespuestaNovadata } from "./types.ts";

// Va donde una evaluación real dice con qué versión del marco y qué modelo se hizo:
// la institución ve en la respuesta que no la escribió el modelo.
export const VERSION_DEL_SIMULADOR = "sandbox-v1";

const SALARIO_SIMULADO = 1500;
const MESES_DE_APORTES = 24;
const ESTADO_OK = { codigo: "OK", mensaje: null };

const contesto = (contenido: Record<string, unknown> = {}) => ({ status: "ok" as const, data: { estado: ESTADO_OK, ...contenido } });
const noContesto = () => ({ status: "error" as const, data: null, errorMessage: "La fuente simulada no contestó." });

// Hasta el corte vigente y no hasta una fecha fija: si el aporte quedara detrás del
// corte, la persona dejaría de figurar como dependiente sin que nadie tocara esto.
function aportesAlIess(): Record<string, unknown>[] {
  const [anio, mes] = CORTE_IESS_CONOCIDO.split("-").map(Number);
  return Array.from({ length: MESES_DE_APORTES }, (_, i) => {
    const total = anio * 12 + (mes - 1) - i;
    return {
      anio: Math.floor(total / 12),
      mes: (total % 12) + 1,
      salario: SALARIO_SIMULADO,
      nomEmp: "EMPRESA SIMULADA S.A.",
      rucEmp: "0000000000001",
      tipEmp: "1 - EMPRESA PRIVADA",
      fecIng: "15/03/2019",
      fecSal: "",
    };
  });
}

export function novadataSimulado(identificacion: string): RespuestaNovadata {
  const caso = casoDe(identificacion);
  const fuentes = Object.keys(RUTAS_POR_FUENTE);
  if (caso === "sin_fuentes") return Object.fromEntries(fuentes.map((f) => [f, noContesto()])) as unknown as RespuestaNovadata;

  const raw: Record<string, unknown> = Object.fromEntries(fuentes.map((f) => [f, contesto()]));
  if (caso === "no_encontrada") {
    return { ...raw, general: { status: "faltante", data: null, errorMessage: "No existe la persona." } } as unknown as RespuestaNovadata;
  }
  raw.general = contesto({
    personaNatural: {
      identificacion,
      nombre: "PERSONA SIMULADA",
      fechaNacimiento: "1985-03-05",
      fechaDefuncion: null,
      informacionAdicional: "CIUDADANO.",
      genero: { idGenero: 1, descripcion: "SIMULADO" },
    },
  });
  raw.basesInternas = contesto({ tiess: aportesAlIess() });
  // Las demandas y no un tema del buró: Plus cuenta como consultados los temas que
  // cubre el buró, y con uno de esos la evaluación dejaría de ser parcial.
  if (caso === "parcial") raw.demandas = noContesto();
  if (caso === "bloqueada") raw.listasControl = contesto({ ofacsOpr: [{ nombre: "PERSONA SIMULADA" }] });
  return raw as unknown as RespuestaNovadata;
}

// La estructura que deja una consulta de Equifax, derivada con el código real de la
// respuesta inventada que usan las pruebas de Equifax.
export function equifaxSimulado(identificacion: string, consultadoEl: string) {
  casoDe(identificacion);
  return calcularEstructura(derivarTablas(respuestaDePrueba()), { consultadoEl, ambiente: "prueba", identidadVerificada: true });
}

export function modeloSimulado(identificacion: string): LlmScoringResult {
  const caso = casoDe(identificacion);
  const respuesta: LlmScoringResult = {
    score: 742,
    recomendacion: "aprobar",
    accionesSugeridas: ["Confirmar los datos de la solicitud con la persona."],
    indicadorRiesgo: "bajo",
    indicadorHistorial: "bueno",
    positives: ["Aportes al IESS continuos con el mismo empleador."],
    negatives: ["Respuesta fija del sandbox: no describe a ninguna persona."],
    missingInfo: [],
    reasoning: "Respuesta fija del sandbox. No la escribió el modelo.",
    llmModel: VERSION_DEL_SIMULADOR,
    llamadas: [],
  };
  if (caso !== "sin_veredicto") return respuesta;
  return {
    ...respuesta,
    accionesSugeridas: [],
    indicadorRiesgo: null,
    indicadorHistorial: null,
    positives: [],
    negatives: [],
    reasoning: "",
    fallo: "El modelo simulado no estuvo disponible.",
  };
}
