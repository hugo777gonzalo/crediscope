// Verificaciones DURAS, determinísticas — a propósito NO delegadas al
// LLM. Son hechos binarios objetivos (¿está fallecido? ¿aparece en una
// lista de sanciones/PEP?), no juicios de riesgo crediticio donde un
// resultado "aproximado" tenga sentido. Si algún guardrail se activa
// (`bloqueado: true`), el score se fuerza a 1 en analyze-client/index.ts
// sin importar lo que devuelva el LLM.
//
// El resto de la evaluación (laboral, judicial, financiero, patrimonio)
// SÍ queda a criterio del LLM — ver llm-scoring.ts.

import type { GuardrailFinding, GuardrailResult, RawNovadataResponse } from "./types.ts";

function esFallecido(persona?: { fechaDefuncion?: string | null; informacionAdicional?: string | null } | null): boolean {
  if (!persona) return false;
  if (persona.fechaDefuncion) return true;
  return Boolean((persona.informacionAdicional as string | undefined)?.toUpperCase().includes("FALLEC"));
}

export function runGuardrails(raw: RawNovadataResponse, requestedCedula: string): GuardrailResult {
  const hallazgos: GuardrailFinding[] = [];

  const persona = raw.general.data?.personaNatural;

  if (esFallecido(persona as { fechaDefuncion?: string | null; informacionAdicional?: string | null } | undefined)) {
    hallazgos.push({
      code: "fallecido",
      message: "Novadata registra a esta persona como fallecida — posible suplantación de identidad",
    });
  }

  const cedulaGeneral = persona?.identificacion;
  if (cedulaGeneral && requestedCedula && cedulaGeneral !== requestedCedula) {
    hallazgos.push({
      code: "cedula_inconsistente",
      message: `La cédula del bloque "Información general" (${cedulaGeneral}) no coincide con la cédula consultada (${requestedCedula})`,
    });
  }

  const bancos = raw.bancos.data;
  const listasControl = bancos?.listasControl?.data as Record<string, unknown> | undefined;
  const totalListasControl = ["ofacsOpr", "homonimosOpr", "providenciasOpr", "personaPublicasOpr"].reduce((sum, campo) => {
    const v = listasControl?.[campo];
    return sum + (Array.isArray(v) ? v.length : 0);
  }, 0);
  if (totalListasControl > 0) {
    hallazgos.push({
      code: "lista_control",
      message: `Aparece en ${totalListasControl} registro(s) de listas de control (OFAC/homónimos/providencias/personas públicas)`,
    });
  }

  const listaNegra = bancos?.listaNegra?.data?.listaNegra;
  if (listaNegra) {
    hallazgos.push({ code: "lista_negra", message: "Aparece en la lista negra interna de Novadata" });
  }

  const basesInternas = bancos?.basesInternas?.data as Record<string, unknown> | undefined;
  const controlInterno = ["tpeps", "tofac", "tofac2", "tconsepvinculados", "tconsephomonimos", "tprovidencias"].reduce(
    (sum, campo) => {
      const v = basesInternas?.[campo];
      return sum + (Array.isArray(v) ? v.length : v ? 1 : 0);
    },
    0
  );
  if (controlInterno > 0) {
    hallazgos.push({
      code: "pep_ofac_interno",
      message: `Aparece en ${controlInterno} registro(s) de listas internas de control (PEP/OFAC/CONSEP/providencias)`,
    });
  }

  const bloqueado = hallazgos.some((h) => h.code === "fallecido" || h.code === "lista_control" || h.code === "lista_negra" || h.code === "pep_ofac_interno");

  return { bloqueado, hallazgos };
}
