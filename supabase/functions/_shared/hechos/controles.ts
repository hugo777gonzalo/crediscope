// Los hallazgos del control de bloqueo, armados desde los hechos (docs/capa-de-hechos.md,
// secciones 3.1 y 6, punto 14). Hasta estructura-v26 `evaluarControlesBloqueo()`
// (controles-bloqueo.ts) leía el crudo otra vez: dos lecturas de lo mismo que coincidían por
// disciplina.
//
// ETAPA B del grupo 3 (estructura-v27): el hallazgo de seguridad ciudadana
// (`delito_seguridad_ciudadana` y `posible_homonimo_en_demanda_penal`) sale de los hechos del grupo
// judicial. ETAPA B del grupo de cumplimiento (estructura-v28): también todos los demás (fallecido,
// cédula inconsistente, listas de control, lista negra, homónimos, listas internas, providencia de
// certificación y PEP) salen de los hechos de `grupos/cumplimiento.ts`. Ningún hallazgo relee el
// crudo: el perfil y el bloqueo leen los mismos hechos.
//
// Los textos de seguridad ciudadana los arma delitos-seguridad.ts; los demás están acá, tal como los
// escribía controles-bloqueo.ts. Lo que se compara en seco (scripts/comparar-hechos.mjs) es qué hallazgos
// salen, en qué orden, con qué texto y si bloquean: el resultado entero del control contra el de la
// versión anterior.
//
// UNA FUENTE CAÍDA NO DESBLOQUEA NI BLOQUEA A NADIE. Un hecho sin valor porque una fuente no
// contestó se lee por su `parcial`: lo que dicen las fuentes que sí contestaron, que es lo que el
// control hizo siempre con las filas que llegaron. Qué pasa con cada hallazgo cuando su fuente no
// contestó está en grupos/cumplimiento.ts (listas, lista negra, fallecido, homónimos, PEP) y
// grupos/riesgo-judicial.ts (seguridad ciudadana). En corto:
//   - un hallazgo con la evidencia en una fuente que contestó sale igual (bloquea si es de los que
//     bloquean), aunque otra fuente esté caída: la caída no lo borra;
//   - uno cuya única evidencia está en la fuente caída no sale: no se bloquea por lo que no se pudo
//     mirar. Esa persona no queda «limpia»: la fuente es obligatoria y la consulta queda incompleta
//     (calidad-de-la-consulta.ts), el modelo no corre, y si luego otro hallazgo bloquea se niega por
//     control sin modelo. Reconsultar la fuente es lo que lo resuelve.
//   - El hallazgo sale idéntico al de siempre (sin la lista `derivaDe`): el análisis guarda y el
//     modelo lee estos hallazgos, y cambiarlos es cambiar el mensaje al modelo.
//
// Un hecho que no se emitió NO se lee como «no hay»: el control corta con un error. Que falte un
// hecho es un error de quien armó el documento, y dejar pasar a alguien por eso sería peor que
// fallar.

import type { HallazgoControlBloqueo } from "../types.ts";
import { type DemandaPenalSinCotejo, mensajeDelDelitoDeSeguridad, mensajeDelPosibleHomonimo } from "../delitos-seguridad.ts";
import type { HechosDeLaPersona } from "./tipos.ts";
import { CATALOGO as CATALOGO_JUDICIAL, emitir as emitirJudicial, type RegistroJudicial } from "./grupos/riesgo-judicial.ts";
import { CATALOGO as CATALOGO_CUMPLIMIENTO, emitir as emitirCumplimiento } from "./grupos/cumplimiento.ts";
import { crearEmisor } from "./emisor.ts";
import { HECHOS_VERSION } from "./indice.ts";

// El hallazgo y los códigos de los que sale: lo que el control de hoy no dice.
export interface HallazgoDesdeHechos extends HallazgoControlBloqueo {
  derivaDe: string[];
}

export const CODIGOS_DE_SEGURIDAD = ["delito_seguridad_ciudadana", "posible_homonimo_en_demanda_penal"];

export function controlesDesdeHechos(doc: HechosDeLaPersona): HallazgoDesdeHechos[] {
  const hallazgos: HallazgoDesdeHechos[] = [];
  const hecho = (codigo: string) => {
    const h = doc.hechos.find((x) => x.codigo === codigo);
    if (!h) throw new Error(`El control de bloqueo necesita el hecho ${codigo} y no se emitió`);
    return h;
  };
  // El valor, o el parcial si la fuente no contestó (lo que dicen las que sí), o null.
  const leer = <T>(codigo: string): T | null => {
    const h = hecho(codigo);
    return (h.valor ?? h.parcial ?? null) as T | null;
  };
  const numero = (codigo: string) => leer<number>(codigo) ?? 0;

  // ---- Identidad ----
  if (leer<boolean>("cum.fallecido.registrado")) {
    hallazgos.push({
      code: "fallecido",
      message: "Proveedor_Info_1 registra a esta persona como fallecida — posible suplantación de identidad",
      bloqueante: true,
      derivaDe: ["cum.fallecido.registrado"],
    });
  }
  const cedulaDeLaFuente = leer<string>("cum.identidad.cedula_de_la_fuente");
  const cedulaConsultada = doc.contexto.cedula;
  if (cedulaDeLaFuente && cedulaConsultada && cedulaDeLaFuente !== cedulaConsultada) {
    hallazgos.push({
      code: "cedula_inconsistente",
      message: `La cédula de la fuente de identidad (${cedulaDeLaFuente}) no coincide con la cédula consultada (${cedulaConsultada})`,
      bloqueante: false,
      derivaDe: ["cum.identidad.cedula_de_la_fuente"],
    });
  }

  // ---- Listas de control del proveedor: bloquean todas, sin distinguir de qué lista viene (D7) ----
  const enListas = numero("cum.listas.registros.cantidad");
  if (enListas > 0) {
    hallazgos.push({
      code: "lista_control",
      message: `Aparece en ${enListas} registro(s) de listas de control (OFAC/providencias)`,
      bloqueante: true,
      derivaDe: ["cum.listas.registros.cantidad"],
    });
  }
  if (leer<boolean>("cum.lista_negra.existe")) {
    hallazgos.push({ code: "lista_negra", message: "Aparece en la lista negra interna de Proveedor_Info_1", bloqueante: true, derivaDe: ["cum.lista_negra.existe"] });
  }

  // ---- Homónimos: otra persona con el mismo nombre. No bloquean ----
  const homonimos = numero("cum.homonimos.cantidad");
  if (homonimos > 0) {
    const cedulas = (leer<string[]>("cum.homonimos.identificaciones") ?? []).join(", ");
    hallazgos.push({
      code: "homonimo_en_lista_control",
      message: `Aparece ${homonimos} homónimo(s) (mismo nombre, cédula distinta: ${cedulas}) en listas de control — no es el cliente, requiere revisión manual si se sospecha relación`,
      bloqueante: false,
      derivaDe: ["cum.homonimos.cantidad", "cum.homonimos.identificaciones"],
    });
  }

  // ---- Listas internas de control: el perfil nunca las contó, el bloqueo sí ----
  const internas = numero("cum.listas_internas.registros.cantidad");
  if (internas > 0) {
    hallazgos.push({
      code: "listas_control_interno",
      message: `Aparece en ${internas} registro(s) de listas internas de control (OFAC/CONSEP/providencias)`,
      bloqueante: true,
      derivaDe: ["cum.listas_internas.registros.cantidad"],
    });
  }

  // ---- Providencias de certificación: un pedido de información, no una retención (R5) ----
  const certificacion = numero("cum.providencias.certificacion.cantidad");
  if (certificacion > 0) {
    hallazgos.push({
      code: "providencia_certificacion",
      message: `Registra ${certificacion} providencia(s) de certificación (un pedido de información de un fiscal o un juez, no una retención): no bloquea, y la salida no pasa de Revisar`,
      bloqueante: false,
      salidaMaxima: "revisar",
      derivaDe: ["cum.providencias.certificacion.cantidad"],
    });
  }

  // ---- PEP: informativo de cumplimiento, no descalifica (decisión explícita del negocio) ----
  if (numero("cum.pep.cantidad") > 0) {
    hallazgos.push({
      code: "pep",
      message: "Persona Expuesta Políticamente (cargo público relevante, actual o pasado) — dato informativo de cumplimiento, NO descalifica al cliente",
      bloqueante: false,
      derivaDe: ["cum.pep.cantidad"],
    });
  }

  // ---- Seguridad ciudadana: control de bloqueo duro, decisión explícita del negocio ----
  const categorias = leer<string[]>("seg.delito.categorias") ?? [];
  if (categorias.length > 0) {
    hallazgos.push({ code: "delito_seguridad_ciudadana", message: mensajeDelDelitoDeSeguridad(categorias), bloqueante: true, derivaDe: ["seg.delito.categorias"] });
  }

  // Las demandas por un delito grave que no son de ella, en el orden de la fuente: salen de
  // las entidades y su atribución, que se calculó una sola vez.
  const sinCotejo: DemandaPenalSinCotejo[] = doc.entidades.flatMap((e) => {
    const a = e.atributos as RegistroJudicial;
    if (a.clase !== "demanda_contra_la_persona" || a.categoriasDeSeguridad.length === 0 || e.atribucion.deLaPersona === "si") return [];
    return [{ categorias: a.categoriasDeSeguridad, cotejo: e.atribucion.detalle as DemandaPenalSinCotejo["cotejo"], anio: a.anio }];
  });
  if (sinCotejo.length > 0) {
    hallazgos.push({ code: "posible_homonimo_en_demanda_penal", message: mensajeDelPosibleHomonimo(sinCotejo), bloqueante: false, derivaDe: ["seg.demandas.posible_homonimo.cantidad"] });
  }
  return hallazgos;
}

// Los hechos del control solos: derivar los dieciséis grupos para leer los hallazgos costaría lo que no
// hace falta. Son los mismos `emitir()` que arman el perfil (process.ts), el judicial y el de cumplimiento,
// con el nombre que lee de `general` y la cédula consultada.
export function hechosDelControl(crudo: unknown, cedula: string, fechaDeLaConsulta: string): HechosDeLaPersona {
  const contexto = {
    cedula,
    consulta: "control",
    // Los grupos no leen el reloj: la marca la pone quien llama (hechos/ no usa el reloj).
    fechaDeLaConsulta,
    corteIess: "",
    persona: { nombre: null, fechaDeNacimiento: null },
  };
  const emisor = crearEmisor(contexto, [...CATALOGO_JUDICIAL, ...CATALOGO_CUMPLIMIENTO]);
  emitirJudicial(crudo, contexto, emisor);
  emitirCumplimiento(crudo, contexto, emisor);
  return { version: HECHOS_VERSION, contexto, ...emisor.resultado() };
}

// Los hallazgos tal como los entrega el control: sin `derivaDe`.
export function hallazgosDelControl(crudo: unknown, cedula: string, fechaDeLaConsulta: string): HallazgoControlBloqueo[] {
  return controlesDesdeHechos(hechosDelControl(crudo, cedula, fechaDeLaConsulta)).map(({ derivaDe: _derivaDe, ...hallazgo }) => hallazgo);
}
