// Los nombres con que se habla de las fuentes de ingreso: los eligió el
// negocio, uno por uno, el 2026-09-26 (tabla en CLAUDE.md).
//
// Viven en _shared y no en la pantalla porque los usan las dos: la pestaña
// Fuentes de ingreso y el perfil del modelo (perfil-del-modelo.ts), que es
// lo que lee el análisis con IA. Si el analista lee "Empresa propia" en la
// pantalla y el análisis dice "aporte autodeclarado", son dos idiomas para
// el mismo dato. Una sola implementación, nunca una copia.

type AnyRecord = Record<string, unknown>;

export const ETIQUETA_SEGMENTO: Record<string, string> = {
  dependiente_privado: "Dependiente privado",
  publico: "Sector público",
  diplomatico: "Misión diplomática u organismo internacional",
  independiente: "Independiente",
  empleo_domestico: "Empleo doméstico",
  agricola: "Agrícola",
  trabajo_hogar: "Trabajo no remunerado del hogar",
  jubilado: "Jubilado",
  jubilado_con_ingreso_adicional: "Jubilado con ingreso adicional",
  ingresos_mixtos: "Ingresos mixtos",
  informal_o_sin_actividad: "Informal o sin actividad",
  sin_datos: "Sin datos: la fuente no respondió",
  no_clasificado: "Tipo de aporte no reconocido",
};

// Hasta el 2026-09-26 había un "cómo puede fallar" por segmento ("quiebra
// del empleador, despido, crisis del sector"). Se sacó de todas las
// pantallas y de la exportación a pedido del negocio: eran generalidades
// del segmento, no hechos de la persona, y se leían como si lo fueran.

// Los estados dicen qué falta, no una categoría interna. Antes:
// Confirmada / Provisional / Indeterminada.
export const ETIQUETA_ESTADO: Record<string, string> = {
  confirmada: "Confirmado por un tercero",
  provisional: "Por confirmar",
  indeterminada: "Sin determinar",
};

// Quién declara el monto, en genérico (reglas, panorama). Hasta el
// 2026-09-26 eran "Reportada por un tercero", "Autodeclarada" e
// "Indirecta", que no se entendían sin haber estado en el diseño. Para una
// fuente concreta se usa quienDeclara(), que nombra el tipo de empleador.
export const ETIQUETA_EVIDENCIA: Record<string, string> = {
  reportada_por_tercero: "Empleador privado, público, diplomático, externo u otros",
  autodeclarada_sobre_minimo: "Empresa propia o afiliación voluntaria, más que el SBU",
  autodeclarada_en_minimo: "Empresa propia o afiliación voluntaria",
  // RUC activo, nómina, jubilación o pensión: consta que existen, pero
  // ninguna fuente pública trae cuánto dejan.
  indirecta: "Sin monto: consta que existe",
};

const EMPLEADOR_POR_NATURALEZA: Record<string, string> = { privado: "Empleador privado", publico: "Empleador público" };

// El código 29 del IESS junta embajadas y organismos internacionales
// ("29-EMBAJADAS, MISIONES DIPL., CONSULARES, ORG. INTERNACIONALES") y no
// hay otro campo que los separe: se distinguen por el nombre del empleador.
// Al 2026-09-26 las 2 personas de la cartera con código 29 trabajan en
// organismos internacionales (Universidad Andina Simón Bolívar, OIM).
const ES_MISION_DIPLOMATICA = /EMBAJADA|CONSULADO|CONSULAR|MISI[OÓ]N DIPLOM/i;

// Quién declara el monto de UNA fuente:
//   Empleador privado / público;
//   Empleador diplomático (embajada, consulado) / Empleador externo (sólo
//     organismos internacionales);
//   Otros empleadores (doméstico, agrícola y código no reconocido);
//   Empresa propia (se afilia como patrono o tiene RUC activo) /
//     Afiliación voluntaria (aporta por su cuenta sin negocio registrado:
//     puede ser sólo para no perder la seguridad social).
export function quienDeclara(fuente: AnyRecord, perfil: AnyRecord | null | undefined): string {
  if (fuente.evidencia === "reportada_por_tercero") {
    if (fuente.naturaleza === "diplomatico") {
      return ES_MISION_DIPLOMATICA.test(String(fuente.empleador ?? "")) ? "Empleador diplomático" : "Empleador externo";
    }
    return EMPLEADOR_POR_NATURALEZA[String(fuente.naturaleza)] ?? "Otros empleadores";
  }
  if (fuente.evidencia === "indirecta") return ETIQUETA_EVIDENCIA.indirecta;
  const laboral = (perfil?.laboral ?? {}) as AnyRecord;
  const conNegocio = fuente.tipo === "aporte como patrono de su propio negocio" || laboral.tieneRucActivo === true;
  return conNegocio ? "Empresa propia" : "Afiliación voluntaria";
}

// Los nombres de lo que el perfil guarda como senalesDeEscala ("Tamaño del
// negocio" en pantalla). "establecimientos registrados" es de perfiles
// anteriores a fuentes-v8, que contaban también los cerrados.
export const ETIQUETA_SENAL: Record<string, string> = {
  "nómina que paga": "Nómina",
  "establecimientos activos": "Establecimientos Activos (SRI)",
  "establecimientos registrados": "Establecimientos registrados (SRI)",
  "obligado a llevar contabilidad": "Obligado a llevar contabilidad",
};

export const DOCUMENTOS_DE_CONFIRMACION = "Documentos de Confirmación de Ingresos";
