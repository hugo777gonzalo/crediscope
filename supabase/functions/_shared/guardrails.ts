// Verificaciones DURAS, determinísticas — a propósito NO delegadas al
// LLM. Son hechos binarios objetivos (¿está fallecido? ¿aparece en una
// lista de sanciones?), no juicios de riesgo crediticio donde un
// resultado "aproximado" tenga sentido. Cada hallazgo indica si es
// `blocking` — solo esos fuerzan `bloqueado: true` (y por tanto el
// score a 1 en analyze-client/index.ts sin importar lo que devuelva el
// LLM). Un hallazgo no-blocking se informa igual (aparece en
// `hallazgos`) pero no descalifica al cliente por sí solo.
//
// PEP (persona expuesta políticamente) es a propósito NO blocking: ser
// PEP es un dato de compliance/AML (requiere debida diligencia
// reforzada), no una señal de mal comportamiento de pago — decisión
// explícita del usuario, no asumir lo contrario.
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
      blocking: true,
    });
  }

  const cedulaGeneral = persona?.identificacion;
  if (cedulaGeneral && requestedCedula && cedulaGeneral !== requestedCedula) {
    hallazgos.push({
      code: "cedula_inconsistente",
      message: `La cédula del bloque "Información general" (${cedulaGeneral}) no coincide con la cédula consultada (${requestedCedula})`,
      blocking: false,
    });
  }

  const bancos = raw.bancos.data;
  const listasControl = bancos?.listasControl?.data as Record<string, unknown> | undefined;
  // personaPublicasOpr = PEP — se cuenta aparte, NO entra en este total
  // (ver nota de cabecera: PEP no es blocking).
  const totalListasControl = ["ofacsOpr", "homonimosOpr", "providenciasOpr"].reduce((sum, campo) => {
    const v = listasControl?.[campo];
    return sum + (Array.isArray(v) ? v.length : 0);
  }, 0);
  if (totalListasControl > 0) {
    hallazgos.push({
      code: "lista_control",
      message: `Aparece en ${totalListasControl} registro(s) de listas de control (OFAC/homónimos/providencias)`,
      blocking: true,
    });
  }

  const listaNegra = bancos?.listaNegra?.data?.listaNegra;
  if (listaNegra) {
    hallazgos.push({ code: "lista_negra", message: "Aparece en la lista negra interna de Novadata", blocking: true });
  }

  const basesInternas = bancos?.basesInternas?.data as Record<string, unknown> | undefined;
  const controlInterno = ["tofac", "tofac2", "tconsepvinculados", "tconsephomonimos", "tprovidencias"].reduce(
    (sum, campo) => {
      const v = basesInternas?.[campo];
      return sum + (Array.isArray(v) ? v.length : v ? 1 : 0);
    },
    0
  );
  if (controlInterno > 0) {
    hallazgos.push({
      code: "listas_control_interno",
      message: `Aparece en ${controlInterno} registro(s) de listas internas de control (OFAC/CONSEP/providencias)`,
      blocking: true,
    });
  }

  const totalPep =
    (Array.isArray(listasControl?.personaPublicasOpr) ? (listasControl!.personaPublicasOpr as unknown[]).length : 0) +
    (Array.isArray(basesInternas?.tpeps) ? (basesInternas!.tpeps as unknown[]).length : 0);
  if (totalPep > 0) {
    hallazgos.push({
      code: "pep",
      message:
        "Persona Expuesta Políticamente (cargo público relevante, actual o pasado) — dato informativo de compliance, NO descalifica al cliente",
      blocking: false,
    });
  }

  const bloqueado = hallazgos.some((h) => h.blocking);

  return { bloqueado, hallazgos };
}
