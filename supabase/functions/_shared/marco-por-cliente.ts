// El marco armado según el cliente (marco-v29, en preparación desde el
// 2026-10-03; apagado hasta validarlo: CONFIG_LLM.marcoPorCliente).
//
// Por qué: con Sonnet 5.5 el razonamiento bajó a ~1.400 tokens y el marco
// (~12.000) pasó a ser el 36% del costo de cada análisis. Muchas de sus
// secciones explican datos que casi nadie tiene: la de pensión alimenticia
// no aplica al 93% de la cartera, la de PEP al 98%, la de demandas civiles
// al 64% (medido sobre 2.567 perfiles). Mandarlas igual es pagar por leer
// instrucciones sobre datos que no están.
//
// Cómo: una sección se omite cuando el perfil del modelo no trae nada de
// ese tema, sea porque la persona no tiene registros o porque la fuente no
// contestó. Lo segundo lo cubre "QUÉ SE PUDO CONSULTAR", que va siempre: no
// se concluye ni se penaliza por lo que nadie miró.
//
// Las secciones se marcan por dónde empiezan y dónde termina el texto que
// se corta, sobre MARCO_INTERPRETATIVO tal cual: el marco sigue siendo uno
// solo, y con todo aplicable el resultado es idéntico a él. Si alguien edita
// el marco y una marca deja de existir, componerMarco() lanza un error en
// vez de cortar mal.
//
// En lote no se usa: ahí el marco entero va en caché y se cobra a la décima
// parte, y un marco distinto por cliente rompería la caché.

import { MARCO_INTERPRETATIVO } from "./marco-interpretativo.ts";

type AnyRecord = Record<string, unknown>;
type Hallazgo = { code?: string; bloqueante?: boolean };

interface Seccion {
  id: string;
  desde: string; // el texto cortado empieza acá...
  hasta: string; // ...y termina justo antes de esto
  aplica: (p: AnyRecord, hallazgos: Hallazgo[]) => boolean;
  corto?: string; // lo que queda en su lugar, si hace falta decir algo
}

const g = (p: AnyRecord, grupo: string) => (p?.[grupo] ?? {}) as AnyRecord;
const n = (v: unknown) => (typeof v === "number" ? v : 0);
const hay = (v: unknown) =>
  Array.isArray(v) ? v.length > 0 : v && typeof v === "object" ? Object.keys(v as AnyRecord).length > 0 : Boolean(v);
const conCodigo = (hs: Hallazgo[], codigo: string) => hs.some((h) => h?.code === codigo);

const SECCIONES: Seccion[] = [
  {
    id: "pep",
    desde: "PEP (cumplimiento.esPersonaExpuestaPoliticamente",
    hasta: "Homónimo (cumplimiento",
    aplica: (p, hs) => g(p, "cumplimiento").esPersonaExpuestaPoliticamente === true || conCodigo(hs, "pep"),
  },
  {
    id: "homonimo",
    desde: "Homónimo (cumplimiento",
    hasta: "CÓMO PENSAR EL SCORE",
    aplica: (p, hs) => g(p, "cumplimiento").tieneHomonimoEnListaControl === true || conCodigo(hs, "homonimo_en_lista_control"),
  },
  {
    id: "impedimento",
    desde: "   impedimentoCargosPublicos: mirá siempre",
    hasta: "\n2. riesgoSeguridadCiudadana",
    aplica: (p) => g(p, "cumplimiento").impedimentoCargosPublicos === true,
  },
  {
    // La misma regla, repetida en la recomendación: se va con su sección.
    id: "impedimento-en-la-recomendacion",
    desde: " Un impedimento para\n  cargos públicos",
    hasta: "\nCon un hallazgo bloqueante=true",
    aplica: (p) => g(p, "cumplimiento").impedimentoCargosPublicos === true,
  },
  {
    id: "garantias",
    desde: "   - Garantías: numeroOperacionesComoGaranteOCodeudor",
    hasta: "   - numeroPrestamosIessBiess",
    aplica: (p) => {
      const b = g(p, "comportamientoBancario");
      return n(b.numeroOperacionesComoGaranteOCodeudor) > 0 || n(b.deudaComoGaranteOCodeudor) > 0;
    },
  },
  {
    id: "prestamos-iess-biess",
    desde: "   - numeroPrestamosIessBiess",
    hasta: "   - Retail (",
    aplica: (p) => {
      const b = g(p, "comportamientoBancario");
      return n(b.numeroPrestamosIessBiess) > 0 || b.tieneCreditoIessBiess === true;
    },
  },
  {
    id: "retail",
    desde: "   - Retail (",
    hasta: "\n4. comportamientoCooperativas",
    aplica: (p) => n(g(p, "comportamientoBancario").numeroDeudasRetail) > 0,
  },
  {
    id: "cooperativas",
    desde: "4. comportamientoCooperativas: las mismas",
    hasta: "   endeudamiento (bloque",
    aplica: (p) => n(g(p, "comportamientoCooperativas").numeroOperaciones) > 0,
  },
  {
    id: "demandas-de-cobro",
    desde: "5. riesgoJudicialCrediticio",
    hasta: "6. riesgoJudicialCivil",
    aplica: (p) => n(g(p, "riesgoJudicialCrediticio").numeroDemandasComoDemandado) > 0,
  },
  {
    id: "demandas-civiles",
    desde: "6. riesgoJudicialCivil: el resto",
    hasta: "   - numeroDemandasComoOfendido es sólo contexto",
    aplica: (p) => {
      const c = g(p, "riesgoJudicialCivil");
      return hay(c.demandasPorCategoria) || hay(c.tiposDemandasComoDemandado) || n(c.numeroDemandasComoDemandado) > 0;
    },
  },
  {
    id: "demandas-como-ofendido",
    desde: "   - numeroDemandasComoOfendido es sólo contexto",
    hasta: "   - Pensión alimenticia",
    aplica: (p) => n(g(p, "riesgoJudicialCivil").numeroDemandasComoOfendido) > 0,
  },
  {
    id: "pension-alimenticia",
    desde: "   - Pensión alimenticia",
    hasta: "7. riesgoPenal",
    aplica: (p) => g(p, "riesgoJudicialCivil").tienePensionAlimenticia === true,
  },
  {
    id: "penal",
    desde: "7. riesgoPenal",
    hasta: "8. fuentesIngreso",
    aplica: (p) => {
      const r = g(p, "riesgoPenal");
      return r.tieneAntecedentesPenales === true || n(r.numeroDenunciasComoSospechoso) > 0 || n(r.numeroDenunciasComoVictima) > 0;
    },
  },
  {
    id: "indicios-de-ingreso",
    desde: "   - Cómo leer cada indicio",
    hasta: "   - Jubilados:",
    aplica: (p) => hay(g(p, "fuentesIngreso").indiciosIngresoMayor),
  },
  {
    id: "jubilados",
    desde: "   - Jubilados:",
    hasta: "   - Militares y policías",
    aplica: (p) => {
      const s = g(p, "seguridadSocial");
      const pl = g(g(p, "fuentesIngreso"), "perfilLaboral");
      return pl.registraJubilacion === true || s.esJubilado === true || s.esPensionista === true;
    },
  },
  {
    id: "militares-y-policias",
    desde: "   - Militares y policías",
    hasta: "   - estado: \"Confirmado",
    aplica: (p) => {
      const s = g(p, "seguridadSocial");
      return s.servicioMilitarOPolicial != null || s.afiliadoSeguridadMilitar === true || s.afiliadoSeguridadPolicial === true;
    },
  },
  {
    id: "tamano-del-negocio",
    desde: "   - tamanoDelNegocio (empleados",
    hasta: "   - estabilidad.continuidadLaboral",
    aplica: (p) => g(p, "fuentesIngreso").tamanoDelNegocio != null,
  },
  {
    id: "empleador-con-apellido",
    desde: "   - empleadorConApellidoDelCliente:",
    hasta: "   - clienteEsSuPropioEmpleador:",
    aplica: (p) => g(p, "laboral").empleadorConApellidoDelCliente === true,
  },
  {
    id: "propio-patrono",
    desde: "   - clienteEsSuPropioEmpleador:",
    hasta: "   - antiguedadEmpleoActualMeses",
    aplica: (p) => g(p, "laboral").clienteEsSuPropioEmpleador === true,
  },
  {
    id: "actividad-economica",
    desde: "   - estadoActividadEconomica, antiguedadUltimaEtapaActivaMeses",
    hasta: "\n9. seguridadSocial",
    // "sin_ruc" es el 10% de la cartera: nunca tuvo actividad registrada.
    aplica: (p) => {
      const e = g(p, "laboral").estadoActividadEconomica;
      return e != null && e !== "sin_ruc";
    },
  },
  {
    id: "patrimonio",
    desde: "10. patrimonio:",
    hasta: "11. familia:",
    aplica: (p) => {
      const pa = g(p, "patrimonio");
      return n(pa.numeroVehiculos) > 0 || n(pa.numeroInmuebles) > 0;
    },
    // Sin esta línea el modelo podría leer la falta de bienes como un
    // negativo. Neutra a propósito: si el tema no se consultó, "no tiene"
    // sería falso.
    corto: "10. patrimonio: no tener vehículos ni inmuebles no es negativo (puede\n    ser alguien joven o de bajos ingresos formales, no un mal pagador).\n\n",
  },
  {
    id: "cliente-interno",
    desde: "15. comportamientoInterno:",
    hasta: "QUÉ SE PUDO CONSULTAR",
    aplica: (p) => "comportamientoInterno" in (p ?? {}),
  },
];

function posicion(texto: string, marca: string, id: string): number {
  const i = texto.indexOf(marca);
  if (i < 0 || texto.indexOf(marca, i + 1) >= 0) {
    throw new Error(`marco-por-cliente: la marca de "${id}" no está, o está más de una vez: ${JSON.stringify(marca.slice(0, 40))}`);
  }
  return i;
}

// Los cortes, calculados una vez sobre el marco vigente.
const CORTES = SECCIONES.map((s) => {
  const inicio = posicion(MARCO_INTERPRETATIVO, s.desde, s.id);
  const fin = posicion(MARCO_INTERPRETATIVO, s.hasta, s.id);
  if (fin <= inicio) throw new Error(`marco-por-cliente: "${s.id}" termina antes de empezar`);
  return { ...s, inicio, fin };
}).sort((a, b) => a.inicio - b.inicio);
for (let i = 1; i < CORTES.length; i++) {
  if (CORTES[i].inicio < CORTES[i - 1].fin) throw new Error(`marco-por-cliente: "${CORTES[i - 1].id}" y "${CORTES[i].id}" se pisan`);
}

export function componerMarco(
  perfilDelModelo: AnyRecord,
  hallazgos: Hallazgo[] = [],
): { texto: string; omitidas: string[] } {
  let texto = "";
  let desde = 0;
  const omitidas: string[] = [];
  for (const c of CORTES) {
    if (c.aplica(perfilDelModelo ?? {}, hallazgos ?? [])) continue;
    texto += MARCO_INTERPRETATIVO.slice(desde, c.inicio) + (c.corto ?? "");
    desde = c.fin;
    omitidas.push(c.id);
  }
  texto += MARCO_INTERPRETATIVO.slice(desde);
  return { texto, omitidas };
}

export const SECCIONES_DEL_MARCO = SECCIONES.map((s) => s.id);
