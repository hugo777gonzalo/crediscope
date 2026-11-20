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

import type { HallazgoControlBloqueo, ResultadoControlBloqueo, RespuestaProveedorInfo1 } from "./types.ts";
import { separarProvidencias } from "./providencias.ts";
import { hallazgosDeSeguridadCiudadana } from "./hechos/controles.ts";

function esFallecido(persona?: { fechaDefuncion?: string | null; informacionAdicional?: string | null } | null): boolean {
  if (!persona) return false;
  if (persona.fechaDefuncion) return true;
  return Boolean((persona.informacionAdicional as string | undefined)?.toUpperCase().includes("FALLEC"));
}

export function evaluarControlesBloqueo(raw: RespuestaProveedorInfo1, requestedCedula: string): ResultadoControlBloqueo {
  const hallazgos: HallazgoControlBloqueo[] = [];

  const persona = raw.general.data?.personaNatural;

  if (esFallecido(persona as { fechaDefuncion?: string | null; informacionAdicional?: string | null } | undefined)) {
    hallazgos.push({
      code: "fallecido",
      message: "Proveedor_Info_1 registra a esta persona como fallecida — posible suplantación de identidad",
      bloqueante: true,
    });
  }

  const cedulaGeneral = persona?.identificacion;
  if (cedulaGeneral && requestedCedula && cedulaGeneral !== requestedCedula) {
    hallazgos.push({
      code: "cedula_inconsistente",
      message: `La cédula de la fuente de identidad (${cedulaGeneral}) no coincide con la cédula consultada (${requestedCedula})`,
      bloqueante: false,
    });
  }

  const listasControl = raw.listasControl?.data as Record<string, unknown> | undefined;
  // personaPublicasOpr = PEP — se cuenta aparte, NO entra en este total
  // (ver nota de cabecera: PEP no es bloqueante).
  // Las providencias de certificación (un pedido de información) no bloquean
  // (R5, 2026-11-18): se avisan aparte, con la salida en Revisar como máximo.
  const providenciasOpr = separarProvidencias(
    Array.isArray(listasControl?.providenciasOpr) ? (listasControl!.providenciasOpr as Record<string, unknown>[]) : [],
  );
  const ofacsOpr = Array.isArray(listasControl?.ofacsOpr) ? (listasControl!.ofacsOpr as unknown[]).length : 0;
  const totalListasControl = ofacsOpr + providenciasOpr.bloquean.length;
  if (totalListasControl > 0) {
    hallazgos.push({
      code: "lista_control",
      message: `Aparece en ${totalListasControl} registro(s) de listas de control (OFAC/providencias)`,
      bloqueante: true,
    });
  }

  const listaNegra = raw.listaNegra?.data?.listaNegra;
  if (listaNegra) {
    hallazgos.push({ code: "lista_negra", message: "Aparece en la lista negra interna de Proveedor_Info_1", bloqueante: true });
  }

  const basesInternas = raw.basesInternas?.data as Record<string, unknown> | undefined;
  // homonimosOpr/tconsephomonimos excluidos a propósito de los totales
  // bloqueantes de arriba/abajo: Proveedor_Info_1 reporta que EXISTE alguien más
  // con el mismo nombre en alguna lista — el registro trae una
  // identificación DISTINTA a la del cliente consultado (confirmado en
  // varios casos reales: nunca coincide la cédula). No es evidencia de
  // que el cliente esté en una lista, es evidencia de que su nombre es
  // parecido al de alguien que sí lo está — por eso es informativo, no
  // bloqueante (mismo trato que PEP). Se reporta aparte abajo.
  const homonimosOpr = Array.isArray(listasControl?.homonimosOpr)
    ? (listasControl!.homonimosOpr as Record<string, unknown>[])
    : [];
  const tconsephomonimos = Array.isArray(basesInternas?.tconsephomonimos)
    ? (basesInternas!.tconsephomonimos as Record<string, unknown>[])
    : [];
  const todosHomonimos = [...homonimosOpr, ...tconsephomonimos];
  if (todosHomonimos.length > 0) {
    const cedulasHomonimos = todosHomonimos
      .map((h) => (h.identificacion as string) ?? (h.cedula as string))
      .filter(Boolean)
      .join(", ");
    hallazgos.push({
      code: "homonimo_en_lista_control",
      message: `Aparece ${todosHomonimos.length} homónimo(s) (mismo nombre, cédula distinta: ${cedulasHomonimos}) en listas de control — no es el cliente, requiere revisión manual si se sospecha relación`,
      bloqueante: false,
    });
  }

  const providenciasInternas = separarProvidencias(
    Array.isArray(basesInternas?.tprovidencias) ? (basesInternas!.tprovidencias as Record<string, unknown>[]) : [],
  );
  // tprovidencias puede venir como un objeto suelto y no como lista: se cuenta
  // como una, y sin tipo legible bloquea (el comportamiento de siempre).
  const providenciaInternaSuelta = !Array.isArray(basesInternas?.tprovidencias) && basesInternas?.tprovidencias ? 1 : 0;
  const controlInterno =
    ["tofac", "tofac2", "tconsepvinculados"].reduce((sum, campo) => {
      const v = basesInternas?.[campo];
      return sum + (Array.isArray(v) ? v.length : v ? 1 : 0);
    }, 0) +
    providenciasInternas.bloquean.length +
    providenciaInternaSuelta;
  if (controlInterno > 0) {
    hallazgos.push({
      code: "listas_control_interno",
      message: `Aparece en ${controlInterno} registro(s) de listas internas de control (OFAC/CONSEP/providencias)`,
      bloqueante: true,
    });
  }

  const providenciasDeCertificacion = providenciasOpr.certificacion.length + providenciasInternas.certificacion.length;
  if (providenciasDeCertificacion > 0) {
    hallazgos.push({
      code: "providencia_certificacion",
      message: `Registra ${providenciasDeCertificacion} providencia(s) de certificación (un pedido de información de un fiscal o un juez, no una retención): no bloquea, y la salida no pasa de Revisar`,
      bloqueante: false,
      salidaMaxima: "revisar",
    });
  }

  const totalPep =
    (Array.isArray(listasControl?.personaPublicasOpr) ? (listasControl!.personaPublicasOpr as unknown[]).length : 0) +
    (Array.isArray(basesInternas?.tpeps) ? (basesInternas!.tpeps as unknown[]).length : 0);
  if (totalPep > 0) {
    hallazgos.push({
      code: "pep",
      message:
        "Persona Expuesta Políticamente (cargo público relevante, actual o pasado) — dato informativo de cumplimiento, NO descalifica al cliente",
      bloqueante: false,
    });
  }

  // Delitos de seguridad ciudadana: control de bloqueo duro, decisión explícita del
  // usuario. Desde estructura-v27 el hallazgo sale de los mismos hechos con que el perfil
  // arma riesgoSeguridadCiudadana (hechos/controles.ts): hasta la v26 este control leía las
  // demandas, las denuncias y los antecedentes por su cuenta, dos lecturas de lo mismo. Las
  // reglas (qué delitos, qué papel en la denuncia, qué demandas son de ella) viven en
  // hechos/grupos/riesgo-judicial.ts, demandas.ts, denuncias.ts y delitos-seguridad.ts.
  // Con una fuente caída, el hallazgo sale de lo que dicen las que contestaron: no
  // desbloquea a quien tiene un delito en otra ni bloquea sin evidencia (controles.ts).
  hallazgos.push(...hallazgosDeSeguridadCiudadana(raw, requestedCedula, new Date().toISOString()));

  const bloqueado = hallazgos.some((h) => h.bloqueante);
  // Un bloqueo manda sobre cualquier tope: el tope sólo se anota si no hay bloqueo.
  const salidaMaxima = !bloqueado && hallazgos.some((h) => h.salidaMaxima === "revisar") ? "revisar" : null;

  return { bloqueado, hallazgos, salidaMaxima };
}
