// Delitos de seguridad ciudadana (lavado de activos, narcotráfico/
// tráfico de sustancias, trata de personas, tenencia/porte de armas,
// extorsión, delincuencia organizada, asociación ilícita, asesinato/
// homicidio intencional) — mismo tratamiento que las listas de
// sanciones: control de bloqueo duro (controles-bloqueo.ts), no un
// juicio del LLM, a pedido explícito del usuario (son "los principales
// problemas de seguridad del Ecuador" hoy). Se revisan demandas
// (funcion_judicial), denuncias y descripción de antecedentes penales
// (fiscalía). Expuesto también como grupo propio del perfil
// (riesgoSeguridadCiudadana en process.ts).
//
// Hasta estructura-v10 esta lista estaba copiada en process.ts y en
// controles-bloqueo.ts. Eran idénticas, pero agregar una palabra en una
// sola dejaba al perfil y al bloqueo en desacuerdo: una sola lista desde
// estructura-v11.
//
// Confirmados con casos reales: lavado de activos, extorsión, tenencia de
// armas, delincuencia organizada, asociación ilícita y asesinato/homicidio
// (cédulas c-4e0fe648, c-7b1a4b5d, c-57faa96e, c-13e359f8). Trata de
// personas sigue siendo terminología del COIP por conocimiento general —
// ajustar si aparece un caso real que no se detecta.
//
// Se compara sin tildes (desde estructura-v11): las palabras clave ya
// traían las dos formas ("TRÁFICO ILÍCITO" y "TRAFICO ILICITO"), y así una
// variante que falte no deja pasar a nadie.

type Categoria = { categoria: string; palabrasClave: string[]; excluir?: string[] };

function sinTildes(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

const CATEGORIAS: Categoria[] = [
  { categoria: "Lavado de activos", palabrasClave: ["LAVADO"] },
  {
    categoria: "Narcotráfico / tráfico de sustancias",
    // "ESTUPEFACIENTES" a secas: 9 demandas de la cartera vienen rotuladas
    // así, sin "sustancias", y no bloqueaban. Decisión del negocio del
    // 2026-09-28: bloquean como narcotráfico.
    palabrasClave: ["TRÁFICO ILÍCITO", "TRAFICO ILICITO", "SUSTANCIAS ESTUPEFACIENTES", "SUSTANCIAS CATALOGADAS", "NARCOTRÁFICO", "NARCOTRAFICO", "MICROTRÁFICO", "MICROTRAFICO", "MICRO TRÁFICO", "MICRO TRAFICO", "ESTUPEFACIENTES"],
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
].map((c) => ({ categoria: c.categoria, palabrasClave: c.palabrasClave.map(sinTildes), excluir: c.excluir?.map(sinTildes) }));

export function categoriasDelitoGraveSeguridad(texto: unknown): string[] {
  if (!texto) return [];
  const t = sinTildes(String(texto));
  return CATEGORIAS.filter(
    (c) => c.palabrasClave.some((kw) => t.includes(kw)) && !(c.excluir ?? []).some((kw) => t.includes(kw))
  ).map((c) => c.categoria);
}
