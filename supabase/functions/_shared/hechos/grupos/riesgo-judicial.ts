// Grupo 3 de la capa de hechos: el riesgo judicial (docs/capa-de-hechos.md, 4.3).
// Fuentes: `demandas` (las que presentaron contra la persona), `demandasOfendido` (las
// que presentó ella), `denuncias`, `antecedentesPenales` y las dos de pensiones
// alimenticias (`pensionAlimenticia` y `pensionAlimenticiaProveedorInfo1`). Alimenta tres
// grupos del perfil: `riesgoJudicialCrediticio` (las demandas de cobro),
// `riesgoJudicialCivil` (las demás, y las pensiones) y `riesgoSeguridadCiudadana`.
//
// ETAPA A. process.ts sigue armando los tres grupos; las reglas de abajo son una copia
// hasta la etapa B y `comparar-hechos.mjs` compara campo por campo contra el perfil. Lo
// que SÍ es una sola implementación: el cotejo del demandado (`atribuirDemandas()`,
// demandas.ts), la regla de cobro y las categorías (demandas.ts), el papel en una
// denuncia (denuncias.ts), los delitos de seguridad y los textos del bloqueo
// (delitos-seguridad.ts) y `mismoNombre()` (mismo-nombre.ts).
//
// La regla que se reproduce es la de estructura-v24 (D2, 2026-11-19): una demanda de cobro
// o civil de OTRA persona no cuenta, y los apellidos invertidos también son otra persona.
// Sin demandado o sin nombre cuentan, como «sin cotejo». Cada demanda es una entidad con su
// atribución, calculada UNA vez por `atribuirDemandas()`; todo hecho filtra por ella.
//
// Cuando falta una fuente de las que lee un hecho, el hecho no tiene valor y lleva el
// `parcial`: lo que dice la regla con las filas que sí llegaron, que es lo que el perfil
// escribe hoy (hechos-v2). La identidad (`general`) sólo aporta el nombre del cotejo: su
// caída la frena la consulta incompleta, no cambia estos hechos.

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { type AnyRecord, citar, type Fila, filasDe, num, obj, redondear, refDeFila, refDeRespuesta, respuestaDe, textoDe } from "../lectura-del-crudo.ts";
import type { CodigoDelCatalogo, Contexto, Descarte, DiferenciaEsperada, ElementoDeLista, Entidad, Hecho, MotivoDeNoDisponible, RefDeRegistro } from "../tipos.ts";
import {
  anioDeLaDemanda,
  atribuirDemandas,
  categoriaDeDemanda,
  type CotejoDelDemandado,
  demandasPorCategoria,
  esDemandaDeCobro,
  type QuienDemanda,
  quienDemanda,
  tipoDeCobroLegible,
  tipoDeDemandaLegible,
} from "../../demandas.ts";
import { rolEnDenuncia, type RolEnDenuncia } from "../../denuncias.ts";
import { categoriasDelitoGraveSeguridad } from "../../delitos-seguridad.ts";
import { mismoNombre } from "../../mismo-nombre.ts";

const CRED = "riesgoJudicialCrediticio.";
const CIVIL = "riesgoJudicialCivil.";
const SEG = "riesgoSeguridadCiudadana.";

type Perfil = { campo: string; enSinValor: CodigoDelCatalogo["enElPerfilSinValor"] } | null;
function codigo(
  codigo: string,
  unidad: CodigoDelCatalogo["unidad"],
  descripcion: string,
  perfil: Perfil,
  opciones: { llegaAlModelo?: boolean; recuento?: CodigoDelCatalogo["recuento"] } = {},
): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo, unidad, descripcion, llegaAlModelo: perfil !== null && (opciones.llegaAlModelo ?? true), esIdentificador: false };
  if (perfil) {
    c.campoDelPerfil = perfil.campo;
    c.enElPerfilSinValor = perfil.enSinValor;
  }
  if (opciones.recuento) c.recuento = opciones.recuento;
  return c;
}
const en = (campo: string, enSinValor: CodigoDelCatalogo["enElPerfilSinValor"]): Perfil => ({ campo, enSinValor });
// Los avisos de la v24 (D2) no llegan al modelo (perfil-del-modelo.ts).
const AVISO = { llegaAlModelo: false, recuento: "conteo" } as const;

export const CATALOGO: CodigoDelCatalogo[] = [
  // Demandas de cobro (riesgoJudicialCrediticio)
  codigo("jud.cobro.cantidad", "cantidad", "Demandas de cobro cuyo demandado es la persona o no se puede descartar", en(CRED + "numeroDemandasComoDemandado", 0), { recuento: "conteo" }),
  codigo("jud.cobro.tipos", "lista", "Tipos de las demandas de cobro, como se leen", en(CRED + "tiposDemandasComoDemandado", null)),
  codigo("jud.cobro.detalle", "lista", "Año y quién demanda en cada demanda de cobro, de la más reciente a la más vieja", en(CRED + "demandasDeCobro", null)),
  codigo("jud.cobro.de_otro_demandado.cantidad", "cantidad", "Demandas de cobro que no se cuentan porque el demandado es otra persona", en(CRED + "numeroDemandasDeOtroDemandado", 0), AVISO),
  codigo("jud.cobro.sin_cotejo.cantidad", "cantidad", "Demandas de cobro que se cuentan sin poder confirmar que son de la persona", en(CRED + "numeroDemandasSinCotejo", 0), AVISO),
  // Demandas civiles (riesgoJudicialCivil)
  codigo("jud.civil.cantidad", "cantidad", "Demandas que no son de cobro cuyo demandado es la persona o no se puede descartar", en(CIVIL + "numeroDemandasComoDemandado", 0), { recuento: "conteo" }),
  codigo("jud.civil.tipos", "lista", "Tipos de las demandas civiles, como se leen", en(CIVIL + "tiposDemandasComoDemandado", null)),
  codigo("jud.civil.por_categoria", "lista", "Demandas civiles por categoría, con sus tipos", en(CIVIL + "demandasPorCategoria", null)),
  codigo("jud.civil.de_otro_demandado.cantidad", "cantidad", "Demandas civiles que no se cuentan porque el demandado es otra persona", en(CIVIL + "numeroDemandasDeOtroDemandado", 0), AVISO),
  codigo("jud.civil.sin_cotejo.cantidad", "cantidad", "Demandas civiles que se cuentan sin poder confirmar que son de la persona", en(CIVIL + "numeroDemandasSinCotejo", 0), AVISO),
  codigo("jud.ofendido.cantidad", "cantidad", "Demandas que presentó la persona", en(CIVIL + "numeroDemandasComoOfendido", 0), { recuento: "conteo" }),
  // Pensiones alimenticias (riesgoJudicialCivil): sólo las que debe pagar la persona, un proceso una vez
  codigo("jud.pension.existe", "si_no", "Tiene una pensión alimenticia a su cargo", en(CIVIL + "tienePensionAlimenticia", false)),
  codigo("jud.pension.con_mora", "si_no", "Alguna de sus pensiones alimenticias tiene deuda", en(CIVIL + "pensionAlimenticiaEnMora", false)),
  codigo("jud.pension.deuda", "usd", "Deuda de pensiones alimenticias a su cargo, sumada por proceso", en(CIVIL + "deudaPensionAlimenticia", null), { recuento: "suma" }),
  codigo("jud.pension.cantidad", "cantidad", "Pensiones alimenticias a su cargo, un proceso una vez", en(CIVIL + "numeroPensionesAlimenticias", 0), { recuento: "conteo" }),
  codigo("jud.pension.vigentes", "cantidad", "Pensiones alimenticias con pago mensual", en(CIVIL + "numeroPensionesVigentes", 0), { recuento: "conteo" }),
  codigo("jud.pension.valor_mensual", "usd", "Pago mensual de las pensiones alimenticias vigentes", en(CIVIL + "valorMensualPensiones", 0), { recuento: "suma" }),
  codigo("jud.pension.en_mora.cantidad", "cantidad", "Pensiones alimenticias con deuda", en(CIVIL + "numeroPensionesEnMora", 0), { recuento: "conteo" }),
  codigo("dif.jud.pension.deuda", "usd", "Deuda de un proceso de pensión alimenticia según cada fuente", null),
  // Seguridad ciudadana (riesgoSeguridadCiudadana): bloqueo duro
  codigo("seg.delito.existe", "si_no", "Registra un delito de seguridad ciudadana propio", en(SEG + "tieneDelitoSeguridadCiudadana", false)),
  codigo("seg.delito.categorias", "lista", "Categorías de delito de seguridad ciudadana propias", en(SEG + "categoriasDelitoSeguridadCiudadana", null)),
  codigo("seg.demandas.posible_homonimo.cantidad", "cantidad", "Demandas por un delito de seguridad ciudadana que no se atribuyen a la persona: posible homónimo", null, { recuento: "conteo" }),
];

// Las que unen, eligen o descartan registros: cada una con un crudo inventado en que
// aplica y uno en que no (scripts/crudos-sinteticos/, campo `reglas`).
export const REGLAS_QUE_MEZCLAN: string[] = [
  "jud.atribucion@1", // descarta las demandas de otro demandado (v24) y las cuenta como sin cotejo si no se puede decir
  "jud.pension@1", // descarta las que no debe pagar; une las dos fuentes por proceso y manda la de mayor deuda
  "seg.delito@1", // descarta las demandas sin cotejo y las denuncias en que no es la acusada
];

export const DIFERENCIAS_ESPERADAS: DiferenciaEsperada[] = [];

// ---- Lo que cuenta de cada registro, para quien lo abre desde la entidad ----

export interface RegistroJudicial {
  clase: "demanda_contra_la_persona" | "demanda_de_la_persona" | "denuncia" | "pension_alimenticia";
  numeroDeProceso: string | null;
  delito: string | null;
  anio: number | null;
  esCobro: boolean | null;
  categoria: string | null;
  quienDemanda: QuienDemanda | null;
  // Las categorías de seguridad ciudadana del delito: de ahí sale el bloqueo.
  categoriasDeSeguridad: string[];
  papelEnLaDenuncia: RolEnDenuncia | null;
  totalDeuda: number | null;
  valorMensual: number | null;
}
const SIN_ATRIBUTOS: RegistroJudicial = {
  clase: "demanda_contra_la_persona", numeroDeProceso: null, delito: null, anio: null, esCobro: null, categoria: null,
  quienDemanda: null, categoriasDeSeguridad: [], papelEnLaDenuncia: null, totalDeuda: null, valorMensual: null,
};

type TipoDeAtribucion = Entidad["atribucion"];
const DE_LA_PERSONA = (cotejo: CotejoDelDemandado): TipoDeAtribucion => ({
  deLaPersona: cotejo === "es_la_persona" ? "si" : cotejo === "otra_persona" || cotejo === "apellidos_invertidos" ? "no" : "sin_cotejo",
  metodo: "nombre",
  detalle: cotejo,
});

// La regla de `esClienteObligadoSupa` de process.ts. Una pensión sin `obligadoPrincipal`
// (todas las de `pensionAlimenticia`) nunca cuenta: si la persona es la representante legal
// es a quien le deben, y si no coincide con ninguno de los dos campos no se penaliza por
// datos faltantes.
export function esClienteObligadoSupa(p: AnyRecord, nombreCliente: string | null): boolean {
  if (p.obligadoPrincipal) return mismoNombre(p.obligadoPrincipal, nombreCliente);
  return false;
}

const FUENTE_DEMANDAS = "demandas";
const FUENTE_OFENDIDO = "demandasOfendido";
const FUENTE_DENUNCIAS = "denuncias";
const FUENTE_ANTECEDENTES = "antecedentesPenales";
const FUENTES_PENSION = ["pensionAlimenticia", "pensionAlimenticiaProveedorInfo1"];

const demandaDe = (r: AnyRecord) => (r.demanda ?? {}) as AnyRecord;
const delitoDe = (r: AnyRecord): string | undefined => demandaDe(r).delito as string | undefined;
const demandanteDe = (r: AnyRecord): unknown => demandaDe(r).ofendido;
const motivoDeCotejo: Record<Exclude<CotejoDelDemandado, "es_la_persona">, string> = {
  otra_persona: "demandado_es_otra_persona",
  apellidos_invertidos: "demandado_con_los_apellidos_invertidos",
  sin_demandado: "la_fuente_no_dice_el_demandado",
  sin_nombre: "no_se_pudo_leer_el_nombre_de_la_persona",
};

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const h = ayudanteDelGrupo(emisor, CATALOGO);
  // Como process.ts (identidad.nombreCompleto) y el control de bloqueo (persona?.nombre).
  const nombre = (((crudo.general as AnyRecord | undefined)?.data as AnyRecord | undefined)?.personaNatural as AnyRecord | undefined)?.nombre as string | null ?? null;
  const cedula = contexto.cedula;

  const estado = new Map<string, "contesto" | MotivoDeNoDisponible>();
  // `antecedentesPenales` dice «no hay» con `faltante` (calidad-de-la-consulta.ts, FUENTES):
  // no es una falla.
  const contesto = (fuente: string) => {
    if (!estado.has(fuente)) {
      const r = respuestaDe(crudo, fuente);
      estado.set(fuente, fuente === FUENTE_ANTECEDENTES && (crudo[fuente] as AnyRecord | undefined)?.status === "faltante" ? "contesto" : r);
    }
    return estado.get(fuente)!;
  };

  // Un hecho con valor si contestaron todas las fuentes de datos que lee; si no, sin valor y
  // con el parcial. `general` no cuenta: sólo aporta el nombre.
  function emitirHecho(
    cod: string,
    regla: string,
    fuentes: string[],
    valor: Hecho["valor"],
    registros: RefDeRegistro[],
    extra: { descartados?: Descarte[]; entidades?: string[] } = {},
  ) {
    const caidas = fuentes.filter((f) => f !== "general" && contesto(f) !== "contesto");
    if (caidas.length) {
      h.sinValor(cod, regla, fuentes, caidas.some((f) => contesto(f) === "fuente_sin_respuesta") ? "fuente_sin_respuesta" : "fuente_deshabilitada", valor);
      return;
    }
    if (valor === null) return void h.sinValor(cod, regla, fuentes, "no_aplica");
    h.confirmado(cod, regla, fuentes, valor, registros, null, extra);
  }
  const respuestasDe = (fuentes: Array<[fuente: string, lista: string]>) => fuentes.map(([f, l]) => refDeRespuesta(crudo, consulta, f, l));
  const claves = (xs: Fila[], de: Map<Fila, Entidad["clave"]>) => xs.map((f) => de.get(f)!);

  // ---- Demandas contra la persona: cada una es una entidad con su atribución ----
  const demandas = filasDe(crudo, FUENTE_DEMANDAS, "demandas");
  // La atribución se calcula UNA vez, acá, y todo lo de abajo la lee.
  const atribuidas = atribuirDemandas(demandas.map((f) => f.r), nombre);
  const cotejoDe = (f: Fila) => atribuidas.cotejos.get(f.r)!;
  const esCobro = (f: Fila) => esDemandaDeCobro(delitoDe(f.r), demandanteDe(f.r));
  const claveDe = new Map<Fila, Entidad["clave"]>();
  const entidadDe = (clase: RegistroJudicial["clase"], f: Fila, identidad: string, atributos: RegistroJudicial, atribucion: TipoDeAtribucion) => {
    const clave = emisor.clave("dem", identidad);
    claveDe.set(f, clave);
    emisor.entidad({ clave, tipo: "demanda", atributos: { ...atributos, clase }, vistas: [{ registro: refDeFila(consulta, f), fechaDelDato: null, atributos: { ...atributos, clase } }], union: null, atribucion });
  };
  const identidadDeDemanda = (prefijo: string, f: Fila) => {
    const d = demandaDe(f.r);
    const proceso = textoDe(d.numeroProceso);
    return proceso ? `${prefijo}#${proceso}` : `${prefijo}#${d.delito}|${d.fecha}|${d.demandado}|${d.ofendido}`;
  };
  for (const f of demandas) {
    const d = demandaDe(f.r);
    const delito = delitoDe(f.r);
    entidadDe("demanda_contra_la_persona", f, identidadDeDemanda("dem", f), {
      ...SIN_ATRIBUTOS,
      numeroDeProceso: textoDe(d.numeroProceso),
      delito: textoDe(delito),
      anio: anioDeLaDemanda(d.fecha),
      esCobro: esCobro(f),
      categoria: categoriaDeDemanda(delito, demandanteDe(f.r)),
      quienDemanda: quienDemanda(demandanteDe(f.r)),
      categoriasDeSeguridad: categoriasDelitoGraveSeguridad(delito),
    }, DE_LA_PERSONA(cotejoDe(f)));
  }
  const ofendido = filasDe(crudo, FUENTE_OFENDIDO, "demandas");
  for (const f of ofendido) {
    const d = demandaDe(f.r);
    // La fuente las busca por el nombre, y el perfil las cuenta todas: no se cotejan.
    entidadDe("demanda_de_la_persona", f, identidadDeDemanda("ofe", f), {
      ...SIN_ATRIBUTOS, clase: "demanda_de_la_persona", numeroDeProceso: textoDe(d.numeroProceso), delito: textoDe(delitoDe(f.r)), anio: anioDeLaDemanda(d.fecha),
    }, { deLaPersona: "sin_cotejo", metodo: "nombre", detalle: "no_se_cotejan_las_que_presento_ella" });
  }
  const denuncias = filasDe(crudo, FUENTE_DENUNCIAS, "denuncias");
  const rolDe = new Map(denuncias.map((f) => [f, rolEnDenuncia(f.r, cedula)] as const));
  for (const f of denuncias) {
    const rol = rolDe.get(f)!;
    entidadDe("denuncia", f, `den#${textoDe(f.r.nroNoticia) ?? `${f.r.delito}|${f.r.fecha}`}`, {
      ...SIN_ATRIBUTOS, clase: "denuncia", numeroDeProceso: textoDe(f.r.nroNoticia), delito: textoDe(f.r.delito),
      categoriasDeSeguridad: categoriasDelitoGraveSeguridad(f.r.delito), papelEnLaDenuncia: rol,
    }, { deLaPersona: rol === "no_figura" ? "no" : "si", metodo: "identificacion", detalle: rol === "no_figura" ? "su_cedula_no_figura" : rol });
  }

  // ---- Demandas de cobro y civiles ----
  const cuentan = demandas.filter((f) => atribuidas.cuentan.includes(f.r));
  const deOtro = demandas.filter((f) => atribuidas.deOtroDemandado.includes(f.r));
  const sinCotejo = demandas.filter((f) => atribuidas.sinCotejo.includes(f.r));
  const respuestaDemandas = respuestasDe([[FUENTE_DEMANDAS, "demandas"]]);
  const filasCitadas = (filas: Fila[], respuesta: RefDeRegistro[]) => citar(filas.map((f) => refDeFila(consulta, f)), [], respuesta);
  const motivoDeOtro = (f: Fila) => motivoDeCotejo[cotejoDe(f) as Exclude<CotejoDelDemandado, "es_la_persona">];
  const descarteDeOtro = (filas: Fila[]): Descarte[] => filas.map((f) => ({ registro: refDeFila(consulta, f), motivo: motivoDeOtro(f) }));
  const FD = [FUENTE_DEMANDAS, "general"];

  const cobro = cuentan.filter(esCobro);
  const civiles = cuentan.filter((f) => !esCobro(f));
  const cobroDeOtro = deOtro.filter(esCobro);
  const civilDeOtro = deOtro.filter((f) => !esCobro(f));
  const tiposUnicos = (filas: Fila[], legible: (f: Fila) => string | null) => [...new Set(filas.map(legible).filter((x): x is string => Boolean(x)))];

  emitirHecho("jud.cobro.cantidad", "jud.atribucion@1", FD, cobro.length, filasCitadas(cobro, respuestaDemandas), { descartados: descarteDeOtro(cobroDeOtro), entidades: claves(cobro, claveDe) });
  emitirHecho("jud.cobro.tipos", "jud.atribucion@1", FD, tiposUnicos(cobro, (f) => tipoDeCobroLegible(delitoDe(f.r), demandanteDe(f.r))), filasCitadas(cobro, respuestaDemandas), { descartados: descarteDeOtro(cobroDeOtro), entidades: claves(cobro, claveDe) });
  const detalleDeCobro: ElementoDeLista[] = cobro
    .map((f) => ({ anio: anioDeLaDemanda(demandaDe(f.r).fecha), quienDemanda: quienDemanda(demandanteDe(f.r)) }))
    .sort((a, b) => (b.anio ?? 0) - (a.anio ?? 0));
  emitirHecho("jud.cobro.detalle", "jud.atribucion@1", FD, detalleDeCobro, filasCitadas(cobro, respuestaDemandas), { descartados: descarteDeOtro(cobroDeOtro), entidades: claves(cobro, claveDe) });
  emitirHecho("jud.cobro.de_otro_demandado.cantidad", "jud.atribucion@1", FD, cobroDeOtro.length, filasCitadas(cobroDeOtro, respuestaDemandas), { entidades: claves(cobroDeOtro, claveDe) });
  const cobroSinCotejo = sinCotejo.filter(esCobro);
  emitirHecho("jud.cobro.sin_cotejo.cantidad", "jud.atribucion@1", FD, cobroSinCotejo.length, filasCitadas(cobroSinCotejo, respuestaDemandas), { entidades: claves(cobroSinCotejo, claveDe) });

  emitirHecho("jud.civil.cantidad", "jud.atribucion@1", FD, civiles.length, filasCitadas(civiles, respuestaDemandas), { descartados: descarteDeOtro(civilDeOtro), entidades: claves(civiles, claveDe) });
  emitirHecho("jud.civil.tipos", "jud.atribucion@1", FD, tiposUnicos(civiles, (f) => tipoDeDemandaLegible(delitoDe(f.r))), filasCitadas(civiles, respuestaDemandas), { descartados: descarteDeOtro(civilDeOtro), entidades: claves(civiles, claveDe) });
  emitirHecho("jud.civil.por_categoria", "jud.atribucion@1", FD, demandasPorCategoria(civiles.map((f) => f.r), delitoDe, demandanteDe) as unknown as ElementoDeLista[], filasCitadas(civiles, respuestaDemandas), { descartados: descarteDeOtro(civilDeOtro), entidades: claves(civiles, claveDe) });
  emitirHecho("jud.civil.de_otro_demandado.cantidad", "jud.atribucion@1", FD, civilDeOtro.length, filasCitadas(civilDeOtro, respuestaDemandas), { entidades: claves(civilDeOtro, claveDe) });
  const civilSinCotejo = sinCotejo.filter((f) => !esCobro(f));
  emitirHecho("jud.civil.sin_cotejo.cantidad", "jud.atribucion@1", FD, civilSinCotejo.length, filasCitadas(civilSinCotejo, respuestaDemandas), { entidades: claves(civilSinCotejo, claveDe) });

  emitirHecho("jud.ofendido.cantidad", "jud.ofendido@1", [FUENTE_OFENDIDO], ofendido.length, filasCitadas(ofendido, respuestasDe([[FUENTE_OFENDIDO, "demandas"]])), { entidades: claves(ofendido, claveDe) });

  // ---- Pensiones alimenticias: dos fuentes, un proceso una vez ----
  const filasPension = [...filasDe(crudo, FUENTES_PENSION[0], "supas"), ...filasDe(crudo, FUENTES_PENSION[1], "supas")];
  const aCargo: Fila[] = [];
  const noEsDeEl: Descarte[] = [];
  for (const f of filasPension) {
    if (esClienteObligadoSupa(f.r, nombre)) aCargo.push(f);
    else {
      noEsDeEl.push({
        registro: refDeFila(consulta, f, f.r.obligadoPrincipal ? "obligadoPrincipal" : "representanteLegal"),
        motivo: f.r.obligadoPrincipal ? "la_persona_no_es_el_obligado" : "la_fuente_no_trae_al_obligado",
      });
    }
  }
  // Un proceso una sola vez; sin número, cada registro vale por uno. Con el mismo proceso
  // y deudas distintas vale la mayor (no se sabe cuál es la última). El criterio y su
  // orden son los de process.ts.
  const porProceso = new Map<string, { elegida: Fila; otras: Fila[] }>();
  aCargo.forEach((f, i) => {
    const clave = String(f.r.numeroProceso ?? `sin-proceso-${i}`);
    const previa = porProceso.get(clave);
    if (!previa) porProceso.set(clave, { elegida: f, otras: [] });
    else if ((num(f.r.totalDeuda) ?? 0) > (num(previa.elegida.r.totalDeuda) ?? 0)) {
      previa.otras.push(previa.elegida);
      previa.elegida = f;
    } else previa.otras.push(f);
  });
  const deuda = (f: Fila) => num(f.r.totalDeuda) ?? 0;
  const repetidos: Descarte[] = [];
  const clavesPension: Entidad["clave"][] = [];
  const pensiones: Fila[] = [];
  for (const [proceso, { elegida, otras }] of porProceso) {
    pensiones.push(elegida);
    const atributos = (f: Fila): RegistroJudicial => ({ ...SIN_ATRIBUTOS, clase: "pension_alimenticia", numeroDeProceso: textoDe(f.r.numeroProceso), totalDeuda: num(f.r.totalDeuda), valorMensual: num(f.r.valorMensual) });
    const clave = emisor.clave("dem", `pen#${proceso}`);
    clavesPension.push(clave);
    emisor.entidad({
      clave,
      tipo: "demanda",
      atributos: atributos(elegida),
      vistas: [elegida, ...otras].map((f) => ({ registro: refDeFila(consulta, f), fechaDelDato: null, atributos: atributos(f) })),
      union: otras.length ? { regla: "jud.pension@1", criterio: "proceso" } : null,
      atribucion: { deLaPersona: "si", metodo: "nombre", detalle: "obligado_principal" },
    });
    for (const o of otras) repetidos.push({ registro: refDeFila(consulta, o, "totalDeuda"), motivo: deuda(o) < deuda(elegida) ? "mismo_proceso_de_menor_deuda" : "mismo_proceso_misma_deuda_gana_la_primera" });
    // Lo que la otra fuente dice distinto del mismo proceso: se guarda aunque se prefiera la mayor.
    const distintas = otras.filter((o) => deuda(o) !== deuda(elegida));
    if (distintas.length) {
      const todas = [deuda(elegida), ...distintas.map(deuda)];
      const absoluta = redondear(Math.max(...todas) - Math.min(...todas));
      emisor.diferencia({
        codigo: "dif.jud.pension.deuda",
        regla: "jud.pension@1",
        sobre: `${clave}.totalDeuda`,
        manda: { fuente: elegida.fuente, valor: deuda(elegida), registro: refDeFila(consulta, elegida, "totalDeuda") },
        cede: distintas.map((o) => ({ fuente: o.fuente, valor: deuda(o), registro: refDeFila(consulta, o, "totalDeuda") })),
        magnitud: { absoluta, relativa: deuda(elegida) ? Math.round((absoluta / deuda(elegida)) * 10_000) / 10_000 : null },
        lectura: "revisar",
      });
    }
  }
  const descartadasPension = [...noEsDeEl, ...repetidos];
  const respuestaPension = respuestasDe(FUENTES_PENSION.map((f) => [f, "supas"] as [string, string]));
  const FP = [...FUENTES_PENSION, "general"];
  const refs = (filas: Fila[], campo?: string) => filas.map((f) => refDeFila(consulta, f, campo));
  const vigentes = pensiones.filter((f) => (num(f.r.valorMensual) ?? 0) > 0);
  const enMora = pensiones.filter((f) => deuda(f) > 0);
  const extraPension = { descartados: descartadasPension, entidades: clavesPension };

  emitirHecho("jud.pension.existe", "jud.pension@1", FP, pensiones.length > 0, citar(refs(pensiones), [], respuestaPension), extraPension);
  emitirHecho("jud.pension.con_mora", "jud.pension@1", FP, enMora.length > 0, citar(refs(enMora, "totalDeuda"), refs(pensiones, "totalDeuda"), respuestaPension), extraPension);
  emitirHecho("jud.pension.deuda", "jud.pension@1", FP, pensiones.length ? redondear(pensiones.reduce((s, f) => s + deuda(f), 0)) : null, citar(refs(pensiones, "totalDeuda"), [], respuestaPension), extraPension);
  emitirHecho("jud.pension.cantidad", "jud.pension@1", FP, pensiones.length, citar(refs(pensiones), [], respuestaPension), extraPension);
  emitirHecho("jud.pension.vigentes", "jud.pension@1", FP, vigentes.length, citar(refs(vigentes, "valorMensual"), [], respuestaPension), extraPension);
  emitirHecho("jud.pension.valor_mensual", "jud.pension@1", FP, redondear(vigentes.reduce((s, f) => s + (num(f.r.valorMensual) ?? 0), 0)), citar(refs(vigentes, "valorMensual"), [], respuestaPension), extraPension);
  emitirHecho("jud.pension.en_mora.cantidad", "jud.pension@1", FP, enMora.length, citar(refs(enMora, "totalDeuda"), [], respuestaPension), extraPension);

  // ---- Seguridad ciudadana: demandas propias, denuncias como acusada y antecedentes ----
  const categorias = new Set<string>();
  const aportaron: RefDeRegistro[] = [];
  const descartadasSeg: Descarte[] = [];
  const homonimos: Fila[] = [];
  for (const f of demandas) {
    const cats = categoriasDelitoGraveSeguridad(delitoDe(f.r));
    if (cats.length === 0) continue;
    if (cotejoDe(f) === "es_la_persona") {
      cats.forEach((c) => categorias.add(c));
      aportaron.push(refDeFila(consulta, f));
    } else {
      homonimos.push(f);
      descartadasSeg.push({ registro: refDeFila(consulta, f), motivo: motivoDeCotejo[cotejoDe(f) as Exclude<CotejoDelDemandado, "es_la_persona">] });
    }
  }
  for (const f of denuncias) {
    const cats = categoriasDelitoGraveSeguridad(f.r.delito);
    if (cats.length === 0) continue;
    if (rolDe.get(f) === "acusada") {
      cats.forEach((c) => categorias.add(c));
      aportaron.push(refDeFila(consulta, f));
    } else {
      // Ser denunciante o víctima no es una acusación; si su cédula ni figura, la denuncia no es suya.
      descartadasSeg.push({ registro: refDeFila(consulta, f), motivo: rolDe.get(f) === "no_figura" ? "su_cedula_no_figura_en_la_denuncia" : "figura_con_otro_papel_que_el_de_acusada" });
    }
  }
  const antecedentes = obj(crudo, FUENTE_ANTECEDENTES, "antecedentes");
  const catsAntecedentes = categoriasDelitoGraveSeguridad(antecedentes?.descripcion);
  if (catsAntecedentes.length) {
    catsAntecedentes.forEach((c) => categorias.add(c));
    aportaron.push({ consulta, fuente: FUENTE_ANTECEDENTES, campo: "descripcion" });
  }
  const respuestaSeg = respuestasDe([[FUENTE_DEMANDAS, "demandas"], [FUENTE_DENUNCIAS, "denuncias"], [FUENTE_ANTECEDENTES, "antecedentes"]]);
  const FS = [FUENTE_DEMANDAS, FUENTE_DENUNCIAS, FUENTE_ANTECEDENTES, "general"];
  const hallados = [...categorias];
  emitirHecho("seg.delito.existe", "seg.delito@1", FS, hallados.length > 0, citar(aportaron, [], respuestaSeg), { descartados: descartadasSeg });
  emitirHecho("seg.delito.categorias", "seg.delito@1", FS, hallados, citar(aportaron, [], respuestaSeg), { descartados: descartadasSeg });
  emitirHecho("seg.demandas.posible_homonimo.cantidad", "seg.delito@1", FD, homonimos.length, filasCitadas(homonimos, respuestaDemandas), { entidades: claves(homonimos, claveDe) });
}
