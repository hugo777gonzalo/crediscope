// Grupo «penal» de la capa de hechos (docs/capa-de-hechos.md, 4.5): `riesgoPenal`, los cuatro
// campos del perfil que salen de `antecedentesPenales` y de `denuncias`. Es el grupo del
// caso que lo motivó (2026-11-20): a una persona no le contestó la fuente de denuncias
// (status `faltante`) y la tarjeta de «Riesgo Penal / Fiscalía» decía «Sin antecedentes
// penales ni denuncias registradas», una afirmación sobre lo que no se pudo mirar, mientras
// la tarjeta de seguridad ciudadana ya decía «sin dato».
//
// ETAPA B (estructura-v28). process.ts arma `riesgoPenal` con `perfilDesdeHechos()` y estas
// reglas son la única implementación. El papel de la persona en cada denuncia sale de
// denuncias.ts (`rolEnDenuncia()`), la misma regla de la que lee el grupo judicial para el
// bloqueo de seguridad ciudadana: una denuncia sin su cédula entre las partes no es suya y no
// cuenta (decisión del negocio, 2026-09-28); ser denunciante, víctima o testigo es sólo
// contexto.
//
// Las denuncias ya son entidades `dem-*` en el grupo judicial (con su atribución por
// identificación): este grupo no las repite, porque dos grupos no emiten la misma entidad
// (3.2). Cada hecho cita las filas de `denuncias` que usó y descarta las otras con su motivo.
//
// UNA FUENTE QUE NO CONTESTÓ NO ES UNA FUENTE QUE DICE «NO HAY». Con `denuncias` caída (`faltante`
// o `error`: su «no hay» es la lista vacía, calidad-de-la-consulta.ts), los dos campos de denuncias
// no tienen valor y llevan el `parcial` (0): el perfil escribe null y los lista en `camposSinDato`.
// `antecedentesPenales` es la excepción, como en riesgo-judicial.ts: dice «no hay» con
// `faltante` y no es una falla; sólo un `error` o `deshabilitado` la deja sin dato. Con un
// `faltante` el campo queda como el perfil siempre lo escribió: null.

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { type AnyRecord, citar, type Fila, filasDe, obj, refDeFila, refDeRespuesta, respuestaDe } from "../lectura-del-crudo.ts";
import type { CodigoDelCatalogo, Contexto, Descarte, DiferenciaEsperada, MotivoDeNoDisponible, RefDeRegistro } from "../tipos.ts";
import { rolEnDenuncia } from "../../denuncias.ts";

const PEN = "riesgoPenal.";

function codigo(cod: string, unidad: CodigoDelCatalogo["unidad"], descripcion: string, campo: string, enSinValor: CodigoDelCatalogo["enElPerfilSinValor"], recuento?: CodigoDelCatalogo["recuento"]): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo: cod, unidad, descripcion, llegaAlModelo: true, esIdentificador: false, campoDelPerfil: PEN + campo, enElPerfilSinValor: enSinValor };
  if (recuento) c.recuento = recuento;
  return c;
}

export const CATALOGO: CodigoDelCatalogo[] = [
  codigo("pen.antecedentes.existe", "si_no", "Tiene antecedentes penales (la descripción que trae la fuente no es «NO»)", "tieneAntecedentesPenales", null),
  codigo("pen.antecedentes.descripcion", "texto", "Descripción de los antecedentes penales, como la escribe la fuente", "descripcionAntecedentes", null),
  codigo("pen.denuncias.como_acusada.cantidad", "cantidad", "Denuncias en las que figura con su cédula como acusada o procesada", "numeroDenunciasComoSospechoso", 0, "conteo"),
  codigo("pen.denuncias.con_otro_papel.cantidad", "cantidad", "Denuncias en las que figura con su cédula como denunciante, víctima, perjudicada o testigo", "numeroDenunciasComoVictima", 0, "conteo"),
];

// La que descarta registros: cada denuncia se cuenta sólo si su cédula figura entre las partes,
// y según el papel. Un crudo inventado en que aplica y uno en que no.
export const REGLAS_QUE_MEZCLAN: string[] = [
  "pen.denuncias@1", // descarta las denuncias sin su cédula y reparte el resto por papel
];

// Contra estructura-v27, la única diferencia es el «sin dato» (E6/E7, etapa B): con una fuente que
// no contestó, el campo pasa del parcial o de 0 a null, marcado en camposSinDato.
export const DIFERENCIAS_ESPERADAS: DiferenciaEsperada[] = [
  {
    campo: "riesgoPenal.*",
    detector: "dato-penal-o-de-cumplimiento-de-fuente-sin-respuesta-escrito-como-total",
    aprobadaEl: "pendiente: la aprueba el negocio con el PR de estructura-v28",
    motivo: "una fuente que no contestó deja el campo sin dato en vez del parcial o 0",
    cuando: "sin_dato",
  },
];

const FUENTE_DENUNCIAS = "denuncias";
const FUENTE_ANTECEDENTES = "antecedentesPenales";

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const h = ayudanteDelGrupo(emisor, CATALOGO);

  const estado = new Map<string, "contesto" | MotivoDeNoDisponible>();
  // `antecedentesPenales` dice «no hay» con `faltante` (calidad-de-la-consulta.ts, FUENTES): no es una falla.
  const contesto = (fuente: string) => {
    if (!estado.has(fuente)) {
      const r = respuestaDe(crudo, fuente);
      estado.set(fuente, fuente === FUENTE_ANTECEDENTES && (crudo[fuente] as AnyRecord | undefined)?.status === "faltante" ? "contesto" : r);
    }
    return estado.get(fuente)!;
  };
  // Un hecho con valor si contestó la fuente que lee; si no, sin valor y con el parcial: lo que dice
  // la regla con las filas que sí llegaron.
  function emitirHecho(cod: string, regla: string, fuente: string, valor: string | number | boolean | null, registros: RefDeRegistro[], descartados: Descarte[] = []) {
    const caida = contesto(fuente);
    if (caida !== "contesto") {
      h.sinValor(cod, regla, [fuente], caida, valor);
      return;
    }
    if (valor === null) return void h.sinValor(cod, regla, [fuente], "no_aplica");
    h.confirmado(cod, regla, [fuente], valor, registros, null, { descartados });
  }

  // ---- Antecedentes penales: un objeto suelto, no una lista ----
  const antecedentes = obj(crudo, FUENTE_ANTECEDENTES, "antecedentes");
  const refAntecedentes: RefDeRegistro[] = antecedentes ? [{ consulta, fuente: FUENTE_ANTECEDENTES, ...("descripcion" in antecedentes ? { campo: "descripcion" } : {}) }] : [];
  // Como lo escribía process.ts: sin el objeto es null; con él, todo lo que no sea «NO» es un antecedente.
  const tiene = antecedentes ? antecedentes.descripcion !== "NO" : null;
  emitirHecho("pen.antecedentes.existe", "pen.antecedentes@1", FUENTE_ANTECEDENTES, tiene, refAntecedentes);
  const descripcion = antecedentes && antecedentes.descripcion !== "NO" && typeof antecedentes.descripcion === "string" ? antecedentes.descripcion : null;
  emitirHecho("pen.antecedentes.descripcion", "pen.antecedentes@1", FUENTE_ANTECEDENTES, descripcion, refAntecedentes);

  // ---- Denuncias: el papel de la persona en cada una ----
  const denuncias = filasDe(crudo, FUENTE_DENUNCIAS, "denuncias");
  const rolDe = new Map(denuncias.map((f) => [f, rolEnDenuncia(f.r, contexto.cedula)] as const));
  const deRol = (rol: "acusada" | "otro_papel") => denuncias.filter((f) => rolDe.get(f) === rol);
  const descarte = (filas: Fila[]): Descarte[] =>
    filas.map((f) => ({ registro: refDeFila(consulta, f), motivo: rolDe.get(f) === "no_figura" ? "su_cedula_no_figura_en_la_denuncia" : rolDe.get(f) === "acusada" ? "figura_como_acusada_y_se_cuenta_aparte" : "figura_con_otro_papel_y_se_cuenta_aparte" }));
  const respuesta = [refDeRespuesta(crudo, consulta, FUENTE_DENUNCIAS, "denuncias")];
  const cita = (filas: Fila[]) => citar(filas.map((f) => refDeFila(consulta, f)), [], respuesta);

  const acusadas = deRol("acusada");
  const otroPapel = deRol("otro_papel");
  emitirHecho("pen.denuncias.como_acusada.cantidad", "pen.denuncias@1", FUENTE_DENUNCIAS, acusadas.length, cita(acusadas), descarte(denuncias.filter((f) => rolDe.get(f) !== "acusada")));
  emitirHecho("pen.denuncias.con_otro_papel.cantidad", "pen.denuncias@1", FUENTE_DENUNCIAS, otroPapel.length, cita(otroPapel), descarte(denuncias.filter((f) => rolDe.get(f) !== "otro_papel")));
}
