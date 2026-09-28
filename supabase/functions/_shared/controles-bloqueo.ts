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

import type { HallazgoControlBloqueo, ResultadoControlBloqueo, RespuestaNovadata } from "./types.ts";
import { rolEnDenuncia } from "./denuncias.ts";
import { categoriasDelitoGraveSeguridad } from "./delitos-seguridad.ts";

function esFallecido(persona?: { fechaDefuncion?: string | null; informacionAdicional?: string | null } | null): boolean {
  if (!persona) return false;
  if (persona.fechaDefuncion) return true;
  return Boolean((persona.informacionAdicional as string | undefined)?.toUpperCase().includes("FALLEC"));
}

export function evaluarControlesBloqueo(raw: RespuestaNovadata, requestedCedula: string): ResultadoControlBloqueo {
  const hallazgos: HallazgoControlBloqueo[] = [];

  const persona = raw.general.data?.personaNatural;

  if (esFallecido(persona as { fechaDefuncion?: string | null; informacionAdicional?: string | null } | undefined)) {
    hallazgos.push({
      code: "fallecido",
      message: "Novadata registra a esta persona como fallecida — posible suplantación de identidad",
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
  const totalListasControl = ["ofacsOpr", "providenciasOpr"].reduce((sum, campo) => {
    const v = listasControl?.[campo];
    return sum + (Array.isArray(v) ? v.length : 0);
  }, 0);
  if (totalListasControl > 0) {
    hallazgos.push({
      code: "lista_control",
      message: `Aparece en ${totalListasControl} registro(s) de listas de control (OFAC/providencias)`,
      bloqueante: true,
    });
  }

  const listaNegra = raw.listaNegra?.data?.listaNegra;
  if (listaNegra) {
    hallazgos.push({ code: "lista_negra", message: "Aparece en la lista negra interna de Novadata", bloqueante: true });
  }

  const basesInternas = raw.basesInternas?.data as Record<string, unknown> | undefined;
  // homonimosOpr/tconsephomonimos excluidos a propósito de los totales
  // bloqueantes de arriba/abajo: Novadata reporta que EXISTE alguien más
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

  const controlInterno = ["tofac", "tofac2", "tconsepvinculados", "tprovidencias"].reduce((sum, campo) => {
    const v = basesInternas?.[campo];
    return sum + (Array.isArray(v) ? v.length : v ? 1 : 0);
  }, 0);
  if (controlInterno > 0) {
    hallazgos.push({
      code: "listas_control_interno",
      message: `Aparece en ${controlInterno} registro(s) de listas internas de control (OFAC/CONSEP/providencias)`,
      bloqueante: true,
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

  // Delitos de seguridad ciudadana: control de bloqueo duro, decisión
  // explícita del usuario. La lista de delitos vive en
  // delitos-seguridad.ts, la misma que usa el perfil (estructura-v11: hasta
  // v10 había una copia acá y otra en process.ts).
  const demandas = (raw.demandas?.data as Record<string, unknown> | undefined)?.demandas as Record<string, unknown>[] | undefined;
  const denuncias = (raw.denuncias?.data as Record<string, unknown> | undefined)?.denuncias as Record<string, unknown>[] | undefined;
  const antecedentesDescripcion = (raw.antecedentesPenales?.data as Record<string, unknown> | undefined)?.antecedentes as
    | Record<string, unknown>
    | undefined;
  const categoriasEnTexto = categoriasDelitoGraveSeguridad;
  // Las denuncias cuentan sólo si la persona es la ACUSADA (sospechosa,
  // procesada o aprehendida, con su cédula): ver denuncias.ts. Hasta
  // estructura-v8 entraban todas, y 42 de las 59 personas bloqueadas por
  // este control eran quienes habían denunciado o sufrido el delito (31
  // extorsiones), testigos, un policía y un abogado defensor. Las demandas
  // son las de la fuente de demandas CONTRA la persona.
  const categoriasEncontradas = new Set([
    ...(demandas ?? []).flatMap((d) => categoriasEnTexto((d.demanda as Record<string, unknown> | undefined)?.delito)),
    ...(denuncias ?? [])
      .filter((d) => rolEnDenuncia(d, requestedCedula) === "acusada")
      .flatMap((d) => categoriasEnTexto(d.delito)),
    ...categoriasEnTexto(antecedentesDescripcion?.descripcion),
  ]);
  if (categoriasEncontradas.size > 0) {
    hallazgos.push({
      code: "delito_seguridad_ciudadana",
      message: `Registra delito(s) de seguridad ciudadana: ${[...categoriasEncontradas].join(", ")}`,
      bloqueante: true,
    });
  }

  const bloqueado = hallazgos.some((h) => h.bloqueante);

  return { bloqueado, hallazgos };
}
