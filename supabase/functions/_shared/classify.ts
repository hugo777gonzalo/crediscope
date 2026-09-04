// Clasifica un StandardClientProfile en 4 segmentos, campo por campo:
//   positivo | negativo | complementario | sin_informacion
//
// *** ESTO ES UNA VERSIÓN PRELIMINAR (clasificacion-v1) — a afinar ***
// Cada campo tiene una regla fija (qué valor es positivo/negativo); los
// campos sin regla explícita caen en "complementario" (informativos, no
// se juzgan), y CUALQUIER campo cuyo valor real sea null/undefined/vacío
// cae en "sin_informacion" sin importar su regla — el catálogo de reglas
// dice qué SIGNIFICARÍA el campo si tuviera valor, no obliga a que lo
// tenga.
//
// Interpretación tomada de la petición del usuario ("demandas como
// ofensor" = negativo, "sin demandas ofensor" = positivo): se mapeó a
// riesgoJudicialCivil.numeroDemandasComoDemandado (ser DEMANDADO, no
// "ofendido"/víctima — eso sigue como complementario, no penaliza, ver
// interpretive-framework.ts). Confirmar si la intención era otra.
//
// Sin lógica de Deno — se puede importar igual desde process.ts (Deno)
// o probar con tsx/Node contra research/standard-profiles/*.json.

import type { StandardClientProfile } from "./types.ts";

export type Bucket = "positivo" | "negativo" | "complementario" | "sin_informacion";

export interface CampoClasificado {
  grupo: string;
  campo: string;
  etiqueta: string;
  valor: unknown;
  bucket: Bucket;
}

export interface ClassifiedProfile {
  version: string;
  positivos: CampoClasificado[];
  negativos: CampoClasificado[];
  complementarios: CampoClasificado[];
  sinInformacion: CampoClasificado[];
}

export const CLASSIFICATION_VERSION = "clasificacion-v1";

// Orden de grupos por importancia para el análisis crediticio (ver
// docs/reagrupacion-propuesta.md) — el mismo orden se usa para mostrar
// los grupos en la web.
export const ORDEN_GRUPOS = [
  "comportamientoInterno",
  "comportamientoBancario",
  "comportamientoCooperativas",
  "riesgoJudicialCivil",
  "riesgoPenal",
  "compliance",
  "laboral",
  "tributario",
  "seguridadSocial",
  "patrimonio",
  "transitoVehicular",
  "familia",
  "contacto",
  "identidad",
  "metaConsulta",
] as const;

export const ETIQUETAS_GRUPO: Record<string, string> = {
  comportamientoInterno: "Comportamiento Interno (Novadata)",
  comportamientoBancario: "Comportamiento Bancos / BIESS / Diners",
  comportamientoCooperativas: "Comportamiento Cooperativas",
  riesgoJudicialCivil: "Riesgo Judicial / Civil",
  riesgoPenal: "Riesgo Penal / Fiscalía",
  compliance: "Compliance y Listas de Control",
  laboral: "Situación Laboral e Ingresos",
  tributario: "Situación Tributaria (SRI)",
  seguridadSocial: "Seguridad Social",
  patrimonio: "Patrimonio",
  transitoVehicular: "Tránsito Vehicular",
  familia: "Núcleo Familiar",
  contacto: "Contacto y Domicilio",
  identidad: "SocioDemográficas",
  metaConsulta: "Metadata de la Consulta",
};

function esVacio(v: unknown): boolean {
  return v === null || v === undefined || (Array.isArray(v) && v.length === 0) || v === "";
}

type Regla = (v: unknown) => "positivo" | "negativo" | null; // null = sin regla especial => complementario

// Reglas explícitas por campo (grupo.campo). Todo lo que no está acá
// queda "complementario" cuando tiene valor.
const REGLAS: Record<string, Regla> = {
  // ---- comportamientoInterno ⭐ ----
  "comportamientoInterno.novadataResultadoHabitoPago": (v) => {
    const s = String(v).toUpperCase();
    if (s.includes("MAL")) return "negativo";
    if (s.includes("BUEN")) return "positivo";
    return null;
  },
  "comportamientoInterno.novadataPerfilInterno": (v) => (v === "MALO" ? "negativo" : v === "BUENO" ? "positivo" : null),
  "comportamientoInterno.novadataDiasMoraMaxima": (v) => ((v as number) > 0 ? "negativo" : (v as number) === 0 ? "positivo" : null),
  "comportamientoInterno.novadataDiasMoraVigente": (v) => ((v as number) > 0 ? "negativo" : (v as number) === 0 ? "positivo" : null),

  // ---- comportamientoBancario ----
  "comportamientoBancario.peorCalificacionRiesgo": (v) => (["A1", "A2", "A3"].includes(String(v)) ? "positivo" : "negativo"),
  "comportamientoBancario.tieneOperacionJudicializada": (v) => (v ? "negativo" : "positivo"),
  "comportamientoBancario.tieneOperacionCastigada": (v) => (v ? "negativo" : "positivo"),
  "comportamientoBancario.diasMoraMaximaRetail": (v) => ((v as number) > 0 ? "negativo" : (v as number) === 0 ? "positivo" : null),
  "comportamientoBancario.diasMoraCreditoIessBiess": (v) => ((v as number) > 0 ? "negativo" : (v as number) === 0 ? "positivo" : null),

  // ---- comportamientoCooperativas ----
  "comportamientoCooperativas.tieneOperacionJudicializada": (v) => (v ? "negativo" : "positivo"),
  "comportamientoCooperativas.tieneOperacionCastigada": (v) => (v ? "negativo" : "positivo"),
  "comportamientoCooperativas.diasMoraMaxima": (v) => ((v as number) > 0 ? "negativo" : (v as number) === 0 ? "positivo" : null),

  // ---- riesgoJudicialCivil ----
  // "demandas como ofensor" (usuario) = DEMANDADO — ver nota al inicio.
  "riesgoJudicialCivil.numeroDemandasComoDemandado": (v) => ((v as number) > 0 ? "negativo" : "positivo"),
  "riesgoJudicialCivil.pensionAlimenticiaEnMora": (v) => (v ? "negativo" : null),
  "riesgoJudicialCivil.demandaProblemaCrediticio": (v) => (v ? "negativo" : null),

  // ---- riesgoPenal ----
  "riesgoPenal.tieneAntecedentesPenales": (v) => (v === true ? "negativo" : v === false ? "positivo" : null),
  "riesgoPenal.numeroDenunciasFiscalia": (v) => ((v as number) > 0 ? "negativo" : null),

  // ---- compliance ----
  "compliance.enListaControl": (v) => (v ? "negativo" : "positivo"),
  "compliance.enListaNegra": (v) => (v ? "negativo" : "positivo"),
  "compliance.impedimentoCargosPublicos": (v) => (v ? "negativo" : "positivo"),
  "compliance.registraSercopContraloria": (v) => (v ? "negativo" : "positivo"),
  // esPersonaExpuestaPoliticamente: SIN regla a propósito — PEP es un
  // dato de compliance/AML, no una señal de riesgo crediticio (decisión
  // explícita del usuario). Cae en "complementario" sea true o false.

  // ---- laboral ----
  "laboral.tieneEstablecimientoActivo": (v) => (v ? "positivo" : null),
  "laboral.tieneRucActivo": (v) => (v ? "positivo" : null),
  "laboral.obligacionesPatronalesEnMora": (v) => (v === true ? "negativo" : v === false ? "positivo" : null),

  // ---- seguridadSocial ----
  "seguridadSocial.afiliadoIessActivo": (v) => (v ? "positivo" : null),
  "seguridadSocial.esPensionista": (v) => (v ? "positivo" : null),
  "seguridadSocial.esJubilado": (v) => (v ? "positivo" : null),

  // ---- identidad ----
  "identidad.fallecido": (v) => (v ? "negativo" : null),

  // ---- transitoVehicular ----
  "transitoVehicular.numeroMultas": (v) => ((v as number) > 0 ? "negativo" : null),
};

// Grupos que se excluyen de la clasificación campo por campo (metadata
// técnica, no información del cliente en sí).
const GRUPOS_EXCLUIDOS = new Set(["metaConsulta"]);

function etiquetaCampo(campo: string): string {
  // separa camelCase en palabras, capitaliza la primera
  const s = campo.replace(/([a-z])([A-Z])/g, "$1 $2");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function flatten(obj: Record<string, unknown>, grupo: string, out: Array<{ campo: string; valor: unknown }>) {
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      // objetos anidados (ej. empleoActual) se muestran como un solo
      // campo (JSON) en vez de aplanarse más — son pocos y ya son legibles
      out.push({ campo: k, valor: v });
    } else {
      out.push({ campo: k, valor: v });
    }
  }
}

export function classifyProfile(profile: StandardClientProfile): ClassifiedProfile {
  const positivos: CampoClasificado[] = [];
  const negativos: CampoClasificado[] = [];
  const complementarios: CampoClasificado[] = [];
  const sinInformacion: CampoClasificado[] = [];

  for (const grupo of ORDEN_GRUPOS) {
    if (GRUPOS_EXCLUIDOS.has(grupo)) continue;
    const seccion = (profile as unknown as Record<string, Record<string, unknown>>)[grupo];
    if (!seccion) continue;
    const campos: Array<{ campo: string; valor: unknown }> = [];
    flatten(seccion, grupo, campos);

    for (const { campo, valor } of campos) {
      const item: CampoClasificado = {
        grupo,
        campo,
        etiqueta: etiquetaCampo(campo),
        valor,
        bucket: "complementario",
      };
      if (esVacio(valor)) {
        item.bucket = "sin_informacion";
        sinInformacion.push(item);
        continue;
      }
      const regla = REGLAS[`${grupo}.${campo}`];
      const resultado = regla ? regla(valor) : null;
      if (resultado === "positivo") {
        item.bucket = "positivo";
        positivos.push(item);
      } else if (resultado === "negativo") {
        item.bucket = "negativo";
        negativos.push(item);
      } else {
        item.bucket = "complementario";
        complementarios.push(item);
      }
    }
  }

  return { version: CLASSIFICATION_VERSION, positivos, negativos, complementarios, sinInformacion };
}
