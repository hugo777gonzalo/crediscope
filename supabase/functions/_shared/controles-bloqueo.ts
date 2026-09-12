// Verificaciones DURAS, determinísticas — a propósito NO delegadas al
// LLM. Son hechos binarios objetivos (¿está fallecido? ¿aparece en una
// lista de sanciones?), no juicios de riesgo crediticio donde un
// resultado "aproximado" tenga sentido. Cada hallazgo indica si es
// `bloqueante` — solo esos fuerzan `bloqueado: true` (y por tanto el
// score a 1 en analyze-client/index.ts sin importar lo que devuelva el
// LLM). Un hallazgo no-bloqueante se informa igual (aparece en
// `hallazgos`) pero no descalifica al cliente por sí solo.
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

import type { HallazgoControlBloqueo, ResultadoControlBloqueo, RawNovadataResponse } from "./types.ts";

function esFallecido(persona?: { fechaDefuncion?: string | null; informacionAdicional?: string | null } | null): boolean {
  if (!persona) return false;
  if (persona.fechaDefuncion) return true;
  return Boolean((persona.informacionAdicional as string | undefined)?.toUpperCase().includes("FALLEC"));
}

export function evaluarControlesBloqueo(raw: RawNovadataResponse, requestedCedula: string): ResultadoControlBloqueo {
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
      message: `La cédula del bloque "Información general" (${cedulaGeneral}) no coincide con la cédula consultada (${requestedCedula})`,
      bloqueante: false,
    });
  }

  const bancos = raw.bancos.data;
  const listasControl = bancos?.listasControl?.data as Record<string, unknown> | undefined;
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

  const listaNegra = bancos?.listaNegra?.data?.listaNegra;
  if (listaNegra) {
    hallazgos.push({ code: "lista_negra", message: "Aparece en la lista negra interna de Novadata", bloqueante: true });
  }

  const basesInternas = bancos?.basesInternas?.data as Record<string, unknown> | undefined;
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

  // Delitos de seguridad ciudadana (lavado de activos, narcotráfico/
  // tráfico de sustancias, trata de personas, tenencia/porte de armas,
  // extorsión, delincuencia organizada, asociación ilícita, asesinato/
  // homicidio intencional) — mismo trato que las listas de sanciones,
  // decisión explícita del usuario: control de bloqueo duro. Se revisan
  // demandas (funcion_judicial), denuncias y descripción de antecedentes
  // penales (fiscalía). Expuesto también como grupo propio del profile
  // — ver riesgoSeguridadCiudadana en process.ts.
  //
  // *** SIN VALIDAR CONTRA CASOS REALES *** salvo lavado de activos,
  // extorsión, tenencia de armas, delincuencia organizada, asociación
  // ilícita y asesinato/homicidio — confirmados con casos reales
  // (cédulas 0704385103, 1204212029, 1309022935, 0927016063). Narco-
  // tráfico/tráfico de sustancias y trata de personas siguen siendo
  // terminología del COIP por conocimiento general — ajustar si aparece
  // un caso real que no se detecta.
  const demandas = (raw.funcion_judicial.data?.demandas?.data as Record<string, unknown> | undefined)?.demandas as Record<string, unknown>[] | undefined;
  const denuncias = (raw.fiscalia.data?.denuncias?.data as Record<string, unknown> | undefined)?.denuncias as Record<string, unknown>[] | undefined;
  const antecedentesDescripcion = (raw.fiscalia.data?.antecedentesPenales?.data as Record<string, unknown> | undefined)?.antecedentes as
    | Record<string, unknown>
    | undefined;
  const CATEGORIAS_DELITO_GRAVE_SEGURIDAD: Array<{ categoria: string; palabrasClave: string[]; excluir?: string[] }> = [
    { categoria: "Lavado de activos", palabrasClave: ["LAVADO"] },
    {
      categoria: "Narcotráfico / tráfico de sustancias",
      palabrasClave: ["TRÁFICO ILÍCITO", "TRAFICO ILICITO", "SUSTANCIAS ESTUPEFACIENTES", "SUSTANCIAS CATALOGADAS", "NARCOTRÁFICO", "NARCOTRAFICO", "MICROTRÁFICO", "MICROTRAFICO", "MICRO TRÁFICO", "MICRO TRAFICO"],
    },
    { categoria: "Trata de personas", palabrasClave: ["TRATA DE PERSONAS", "TRATA DE BLANCAS"] },
    { categoria: "Tenencia/porte de armas", palabrasClave: ["TENENCIA Y PORTE DE ARMAS", "TENENCIA DE ARMAS", "PORTE DE ARMAS", "TRÁFICO DE ARMAS", "TRAFICO DE ARMAS"] },
    { categoria: "Extorsión", palabrasClave: ["EXTORSIÓN", "EXTORSION"] },
    { categoria: "Delincuencia organizada", palabrasClave: ["DELINCUENCIA ORGANIZADA"] },
    { categoria: "Asociación ilícita", palabrasClave: ["ASOCIACIÓN ILÍCITA", "ASOCIACION ILICITA"] },
    // HOMICIDIO a secas también matchea "homicidio culposo"/"preterin-
    // tencional" (COIP Art. 145-147: negligente, ej. accidente de
    // tránsito con muerte) — severidad y perfil de riesgo muy distintos
    // a un homicidio intencional. Se excluyen explícitamente.
    {
      categoria: "Asesinato / homicidio intencional",
      palabrasClave: ["ASESINATO", "HOMICIDIO"],
      excluir: ["CULPOSO", "PRETERINTENCIONAL"],
    },
  ].map((c) => ({ categoria: c.categoria, palabrasClave: c.palabrasClave.map((k) => k.toUpperCase()), excluir: c.excluir?.map((k) => k.toUpperCase()) }));
  const categoriasEnTexto = (texto: unknown): string[] => {
    if (!texto) return [];
    const up = String(texto).toUpperCase();
    return CATEGORIAS_DELITO_GRAVE_SEGURIDAD.filter(
      (c) => c.palabrasClave.some((kw) => up.includes(kw)) && !(c.excluir ?? []).some((kw) => up.includes(kw))
    ).map((c) => c.categoria);
  };
  const categoriasEncontradas = new Set([
    ...(demandas ?? []).flatMap((d) => categoriasEnTexto((d.demanda as Record<string, unknown> | undefined)?.delito)),
    ...(denuncias ?? []).flatMap((d) => categoriasEnTexto(d.delito)),
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
