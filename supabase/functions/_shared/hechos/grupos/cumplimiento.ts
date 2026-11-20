// Grupo «cumplimiento» de la capa de hechos (docs/capa-de-hechos.md, 4.5 y 6, puntos 10 y 14):
// los 9 campos de `cumplimiento` del perfil (listas de control, providencias de certificación,
// homónimos, lista negra, impedimento para cargos públicos, SERCOP y Contraloría, PEP) y lo que
// el control de bloqueo (controles-bloqueo.ts) todavía leía del crudo por su cuenta: el
// fallecido, la cédula que dice la fuente de identidad y los registros de las listas internas
// (OFAC, CONSEP, providencias de `basesInternas`), que el perfil nunca contó.
//
// ETAPA B (estructura-v28). process.ts arma `cumplimiento` con `perfilDesdeHechos()` y
// `evaluarControlesBloqueo()` toma todos sus hallazgos de `controlesDesdeHechos()`
// (hechos/controles.ts): ningún hallazgo relee el crudo, y el perfil y el bloqueo salen de los
// mismos hechos.
//
// Las listas siguen bloqueando por TODAS las listas del proveedor (D7, negocio, 2026-11-18, que
// recomendó pedir de qué lista viene cada coincidencia): un registro de `ofacsOpr`, una providencia
// de retención o un registro de las listas internas bloquea sin distinguir de qué lista salió. Los
// homónimos (otra persona con el mismo nombre, cédula distinta) y las providencias de certificación
// (un pedido de información, R5) no cuentan para el bloqueo, y quedan como descartados con su motivo.
//
// PEP de dos fuentes (6, punto 10): `personaPublicasOpr` (listasControl) y `tpeps` (basesInternas)
// se SUMAN, sin unir; el detalle sale del registro de fecha más reciente (texto, no fecha). Si el
// mismo cargo y la misma fecha vienen en las dos, el hecho no cambia (la persona es PEP igual) y
// queda `dif.cum.pep.repetido`.
//
// UNA FUENTE QUE NO CONTESTÓ NO ES UNA FUENTE QUE DICE «NO HAY». Un hecho cuyas fuentes no
// contestaron todas no tiene valor y lleva el `parcial` (lo que dicen las filas que sí llegaron): el
// perfil escribe null y lista el campo en `camposSinDato`, y el control lee el parcial. Cuando una
// fuente no contestó:
//   - `listasControl` caída: ni `lista_control`, ni homónimos, ni PEP, ni providencia de certificación
//     de esa fuente. No sale hallazgo que bloquee: no se bloquea por lo que no se pudo mirar, y
//     tampoco queda «limpia» (`listasControl` es obligatoria: la consulta queda incompleta y el modelo
//     no corre). Una lista que sí contestó (`basesInternas`, `listaNegra`) sigue bloqueando.
//   - `basesInternas` caída: lo mismo para `listas_control_interno`, y para lo que suma de tprovidencias,
//     tconsephomonimos y tpeps. Un OFAC en `listasControl` sigue bloqueando.
//   - `listaNegra` caída: no sale `lista_negra`. Es obligatoria: la consulta queda incompleta.
//     (Hay personas en las que `listaNegra` queda en `faltante` aun reconsultando: calidad-de-la-consulta.ts.)
//   - `general` caída: no salen `fallecido` ni `cedula_inconsistente`. Es obligatoria.
//   - `impedimentoCargosPublicos` y `sercop` dicen «no hay» con `faltante` (FUENTES): sólo un `error` o
//     `deshabilitado` las deja sin dato; no bloquean nunca.
// Nadie queda desbloqueado por una caída: el parcial es lo que el control hacía con las filas que llegaban.

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { type AnyRecord, citar, type Fila, filasDe, num, obj, ref, refDeFila, refDeRespuesta, respuestaDe } from "../lectura-del-crudo.ts";
import type { CodigoDelCatalogo, Contexto, Descarte, DiferenciaEsperada, ElementoDeLista, Hecho, MotivoDeNoDisponible, RefDeRegistro } from "../tipos.ts";
import { separarProvidencias } from "../../providencias.ts";

const CUM = "cumplimiento.";

type Opciones = { campo?: string; sinValor?: CodigoDelCatalogo["enElPerfilSinValor"]; recuento?: CodigoDelCatalogo["recuento"]; modelo?: boolean; identificador?: boolean };
function codigo(cod: string, unidad: CodigoDelCatalogo["unidad"], descripcion: string, o: Opciones = {}): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo: cod, unidad, descripcion, llegaAlModelo: o.campo !== undefined && (o.modelo ?? true), esIdentificador: o.identificador ?? false };
  if (o.campo !== undefined) {
    c.campoDelPerfil = CUM + o.campo;
    c.enElPerfilSinValor = o.sinValor;
  }
  if (o.recuento) c.recuento = o.recuento;
  return c;
}

export const CATALOGO: CodigoDelCatalogo[] = [
  // Listas de control del proveedor (`listasControl`): bloquean
  codigo("cum.listas.en_lista_control", "si_no", "Figura en alguna lista de control del proveedor (OFAC o providencia de retención)", { campo: "enListaControl", sinValor: false }),
  codigo("cum.listas.registros.cantidad", "cantidad", "Registros de las listas de control del proveedor que bloquean", { recuento: "conteo" }),
  // Listas internas (`basesInternas`): bloquean y el perfil nunca las contó
  codigo("cum.listas_internas.registros.cantidad", "cantidad", "Registros de las listas internas de control (OFAC, CONSEP, providencias) que bloquean"),
  // Providencias de certificación: un pedido de información, no bloquean
  codigo("cum.providencias.certificacion.existe", "si_no", "Registra una providencia de certificación", { campo: "tieneProvidenciaDeCertificacion", sinValor: false, modelo: false }),
  codigo("cum.providencias.certificacion.cantidad", "cantidad", "Providencias de certificación, de las dos fuentes", { recuento: "conteo" }),
  // Homónimos: otra persona con el mismo nombre. No bloquean
  codigo("cum.homonimos.existe", "si_no", "Aparece un homónimo (mismo nombre, otra cédula) en una lista de control", { campo: "tieneHomonimoEnListaControl", sinValor: false }),
  codigo("cum.homonimos.cantidad", "cantidad", "Homónimos en las listas de control, de las dos fuentes", { recuento: "conteo" }),
  codigo("cum.homonimos.identificaciones", "lista", "Identificaciones de los homónimos, como las trae la fuente", { identificador: true }),
  codigo("cum.lista_negra.existe", "si_no", "Figura en la lista negra interna del proveedor", { campo: "enListaNegra", sinValor: false }),
  // Cargos públicos y contratación
  codigo("cum.impedimento.existe", "si_no", "Registra un impedimento para cargos públicos", { campo: "impedimentoCargosPublicos", sinValor: false }),
  codigo("cum.impedimento.causal", "texto", "Causal del primer impedimento registrado", { campo: "causalImpedimento", sinValor: null }),
  codigo("cum.sercop.registra", "si_no", "Registra algo en SERCOP o en Contraloría", { campo: "registraSercopContraloria", sinValor: false }),
  // Persona expuesta políticamente: dos fuentes que se suman
  codigo("cum.pep.existe", "si_no", "Es una persona expuesta políticamente", { campo: "esPersonaExpuestaPoliticamente", sinValor: false }),
  codigo("cum.pep.cantidad", "cantidad", "Registros de persona expuesta políticamente, de las dos fuentes sumadas sin unir", { recuento: "conteo" }),
  codigo("cum.pep.detalle", "objeto", "Cargo, entidad, sueldo y fecha del registro más reciente de persona expuesta políticamente", { campo: "detallePep", sinValor: null }),
  codigo("dif.cum.pep.repetido", "texto", "El mismo cargo y la misma fecha de persona expuesta políticamente en las dos fuentes"),
  // Lo que el control de bloqueo lee y el perfil de cumplimiento no guarda
  codigo("cum.fallecido.registrado", "si_no", "La fuente de identidad registra a la persona como fallecida"),
  codigo("cum.identidad.cedula_de_la_fuente", "texto", "La cédula que dice la fuente de identidad, para cotejarla con la consultada", { identificador: true }),
];

// Las que unen, eligen o descartan registros: un crudo inventado en que aplica y uno en que no.
export const REGLAS_QUE_MEZCLAN: string[] = [
  "cum.listas@1", // cuenta lo que bloquea (OFAC, retención, listas internas) y descarta homónimos y providencias de certificación
  "cum.pep@1", // suma las dos fuentes sin unir y elige el registro más reciente
];

// Contra estructura-v27, la única diferencia es el «sin dato» (etapa B): con una fuente que no
// contestó, el campo pasa del parcial o de false a null, marcado en camposSinDato. El bloqueo no
// cambia: el control lee el parcial.
export const DIFERENCIAS_ESPERADAS: DiferenciaEsperada[] = [
  {
    campo: "cumplimiento.*",
    detector: "dato-penal-o-de-cumplimiento-de-fuente-sin-respuesta-escrito-como-total",
    aprobadaEl: "pendiente: la aprueba el negocio con el PR de estructura-v28",
    motivo: "una fuente que no contestó deja el campo sin dato en vez del parcial o false",
    cuando: "sin_dato",
  },
];

const FUENTE_LISTAS = "listasControl";
const FUENTE_INTERNAS = "basesInternas";
const FUENTE_NEGRA = "listaNegra";
const FUENTE_IMPEDIMENTO = "impedimentoCargosPublicos";
const FUENTE_SERCOP = "sercop";
const FUENTE_IDENTIDAD = "general";
// `faltante` es su «no hay» (calidad-de-la-consulta.ts, FUENTES): sólo un `error` o `deshabilitado` es una caída.
const DICEN_NO_HAY_CON_FALTANTE = new Set([FUENTE_IMPEDIMENTO, FUENTE_SERCOP]);

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const h = ayudanteDelGrupo(emisor, CATALOGO);

  const estado = new Map<string, "contesto" | MotivoDeNoDisponible>();
  const contesto = (fuente: string) => {
    if (!estado.has(fuente)) {
      const r = respuestaDe(crudo, fuente);
      estado.set(fuente, DICEN_NO_HAY_CON_FALTANTE.has(fuente) && (crudo[fuente] as AnyRecord | undefined)?.status === "faltante" ? "contesto" : r);
    }
    return estado.get(fuente)!;
  };
  // Un hecho con valor si contestaron todas las fuentes que lee; si no, sin valor y con el parcial.
  function emitirHecho(cod: string, regla: string, fuentes: string[], valor: Hecho["valor"], registros: RefDeRegistro[], descartados: Descarte[] = []) {
    const caidas = fuentes.filter((f) => contesto(f) !== "contesto");
    if (caidas.length) {
      h.sinValor(cod, regla, fuentes, caidas.some((f) => contesto(f) === "fuente_sin_respuesta") ? "fuente_sin_respuesta" : "fuente_deshabilitada", valor);
      return;
    }
    if (valor === null) return void h.sinValor(cod, regla, fuentes, "no_aplica");
    h.confirmado(cod, regla, fuentes, valor, registros, null, { descartados });
  }
  const respuestas = (pares: Array<[fuente: string, lista: string]>) => pares.map(([f, l]) => refDeRespuesta(crudo, consulta, f, l));
  const refs = (filas: Fila[], campo?: string) => filas.map((f) => refDeFila(consulta, f, campo));
  const descarte = (filas: Fila[], motivo: string): Descarte[] => filas.map((f) => ({ registro: refDeFila(consulta, f), motivo }));
  const filasDeLasListas = (lista: string) => filasDe(crudo, FUENTE_LISTAS, lista);
  const filasDeLasInternas = (lista: string) => filasDe(crudo, FUENTE_INTERNAS, lista);
  // Las providencias de cada fuente, separadas por la regla de R5 sin perder su posición en la lista.
  const partirProvidencias = (filas: Fila[]) => {
    const { bloquean, certificacion } = separarProvidencias(filas.map((f) => f.r));
    return { bloquean: filas.filter((f) => bloquean.includes(f.r)), certificacion: filas.filter((f) => certificacion.includes(f.r)) };
  };

  // ---- Identidad: el fallecido y la cédula que dice la fuente ----
  const persona = obj(crudo, FUENTE_IDENTIDAD, "personaNatural");
  const refIdentidad = [ref(consulta, FUENTE_IDENTIDAD)];
  const fallecido = Boolean(persona?.fechaDefuncion) || String(persona?.informacionAdicional ?? "").toUpperCase().includes("FALLEC");
  emitirHecho("cum.fallecido.registrado", "cum.simple@1", [FUENTE_IDENTIDAD], fallecido, refIdentidad);
  const cedulaDeLaFuente = (persona?.identificacion ? persona.identificacion : null) as string | null;
  emitirHecho("cum.identidad.cedula_de_la_fuente", "cum.simple@1", [FUENTE_IDENTIDAD], cedulaDeLaFuente, refIdentidad);

  // ---- Listas de control del proveedor y listas internas ----
  const ofacs = filasDeLasListas("ofacsOpr");
  const providenciasOpr = partirProvidencias(filasDeLasListas("providenciasOpr"));
  const homonimosOpr = filasDeLasListas("homonimosOpr");
  const bloqueanListas = [...ofacs, ...providenciasOpr.bloquean];
  const respuestaListas = respuestas([[FUENTE_LISTAS, "ofacsOpr"], [FUENTE_LISTAS, "providenciasOpr"]]);
  const descartadosListas = [...descarte(providenciasOpr.certificacion, "providencia_de_certificacion"), ...descarte(homonimosOpr, "homonimo_de_otra_persona")];
  emitirHecho("cum.listas.registros.cantidad", "cum.listas@1", [FUENTE_LISTAS], bloqueanListas.length, citar(refs(bloqueanListas), [], respuestaListas), descartadosListas);
  emitirHecho("cum.listas.en_lista_control", "cum.listas@1", [FUENTE_LISTAS], bloqueanListas.length > 0, citar(refs(bloqueanListas), [], respuestaListas), descartadosListas);

  // Las listas internas que bloquean: tofac, tofac2, tconsepvinculados (una lista, o un registro suelto
  // que cuenta como uno) y las providencias internas que no son de certificación. El perfil nunca las contó.
  const internasSueltas: RefDeRegistro[] = [];
  const internas: Fila[] = [];
  const datosInternos = ((crudo[FUENTE_INTERNAS] as AnyRecord | undefined)?.data as AnyRecord | undefined) ?? null;
  for (const campo of ["tofac", "tofac2", "tconsepvinculados"]) {
    const v = datosInternos?.[campo];
    if (Array.isArray(v)) internas.push(...filasDeLasInternas(campo));
    else if (v) internasSueltas.push(ref(consulta, FUENTE_INTERNAS, undefined, undefined, campo));
  }
  const tprovidencias = datosInternos?.tprovidencias;
  const providenciasInternas = partirProvidencias(filasDeLasInternas("tprovidencias"));
  // `tprovidencias` suelta (no es una lista) cuenta como una, y sin tipo legible bloquea (como siempre).
  if (!Array.isArray(tprovidencias) && tprovidencias) internasSueltas.push(ref(consulta, FUENTE_INTERNAS, undefined, undefined, "tprovidencias"));
  const bloqueanInternas = [...internas, ...providenciasInternas.bloquean];
  const totalInternas = bloqueanInternas.length + internasSueltas.length;
  emitirHecho(
    "cum.listas_internas.registros.cantidad",
    "cum.listas@1",
    [FUENTE_INTERNAS],
    totalInternas,
    citar([...refs(bloqueanInternas), ...internasSueltas], [], [ref(consulta, FUENTE_INTERNAS)]),
    descarte(providenciasInternas.certificacion, "providencia_de_certificacion"),
  );

  // ---- Providencias de certificación: un pedido de información, no bloquean ----
  const certificacion = [...providenciasOpr.certificacion, ...providenciasInternas.certificacion];
  const respuestaCertificacion = respuestas([[FUENTE_LISTAS, "providenciasOpr"], [FUENTE_INTERNAS, "tprovidencias"]]);
  emitirHecho("cum.providencias.certificacion.cantidad", "cum.listas@1", [FUENTE_LISTAS, FUENTE_INTERNAS], certificacion.length, citar(refs(certificacion), [], respuestaCertificacion));
  emitirHecho("cum.providencias.certificacion.existe", "cum.listas@1", [FUENTE_LISTAS, FUENTE_INTERNAS], certificacion.length > 0, citar(refs(certificacion), [], respuestaCertificacion));

  // ---- Homónimos: mismo nombre, cédula distinta. No es la persona ----
  const homonimosInternos = filasDeLasInternas("tconsephomonimos");
  const homonimos = [...homonimosOpr, ...homonimosInternos];
  const respuestaHomonimos = respuestas([[FUENTE_LISTAS, "homonimosOpr"], [FUENTE_INTERNAS, "tconsephomonimos"]]);
  const fuentesHomonimos = [FUENTE_LISTAS, FUENTE_INTERNAS];
  emitirHecho("cum.homonimos.cantidad", "cum.listas@1", fuentesHomonimos, homonimos.length, citar(refs(homonimos), [], respuestaHomonimos));
  emitirHecho("cum.homonimos.existe", "cum.listas@1", fuentesHomonimos, homonimos.length > 0, citar(refs(homonimos), [], respuestaHomonimos));
  // Las identificaciones que traen los homónimos, para el texto del hallazgo: las que vienen vacías no se listan.
  const identificaciones = homonimos.map((f) => (f.r.identificacion as string) ?? (f.r.cedula as string)).filter(Boolean).map(String);
  emitirHecho("cum.homonimos.identificaciones", "cum.listas@1", fuentesHomonimos, identificaciones, citar(refs(homonimos), [], respuestaHomonimos));

  // ---- Lista negra interna ----
  const datosNegra = (crudo[FUENTE_NEGRA] as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const refNegra = [datosNegra && "listaNegra" in datosNegra ? ref(consulta, FUENTE_NEGRA, undefined, undefined, "listaNegra") : ref(consulta, FUENTE_NEGRA)];
  emitirHecho("cum.lista_negra.existe", "cum.simple@1", [FUENTE_NEGRA], Boolean(datosNegra?.listaNegra), refNegra);

  // ---- Impedimento para cargos públicos: `data` trae la lista, a veces con un registro ----
  const impedimentos = filasDe(crudo, FUENTE_IMPEDIMENTO, "data");
  const impedimentoActivo = impedimentos.find((f) => f.r.registraImpedimento === true) ?? null;
  const citaImpedimento = citar(impedimentoActivo ? [refDeFila(consulta, impedimentoActivo, "registraImpedimento")] : [], refs(impedimentos), respuestas([[FUENTE_IMPEDIMENTO, "data"]]));
  emitirHecho("cum.impedimento.existe", "cum.simple@1", [FUENTE_IMPEDIMENTO], Boolean(impedimentoActivo), citaImpedimento);
  const causal = ((impedimentoActivo?.r.causales as AnyRecord[] | undefined)?.[0]?.causal ?? null) as string | null;
  emitirHecho("cum.impedimento.causal", "cum.simple@1", [FUENTE_IMPEDIMENTO], causal, impedimentoActivo ? [refDeFila(consulta, impedimentoActivo, "causales")] : citaImpedimento);

  // ---- SERCOP y Contraloría: los registros van anidados en `data.data` ----
  const sercopData = obj(crudo, FUENTE_SERCOP, "data");
  const largo = (v: unknown) => ((v as AnyRecord | undefined)?.registros as unknown[] | undefined)?.length ?? 0;
  const registraSercop = largo(sercopData?.contraloria) > 0 || largo(sercopData?.sercop) > 0;
  emitirHecho("cum.sercop.registra", "cum.simple@1", [FUENTE_SERCOP], registraSercop, [ref(consulta, FUENTE_SERCOP, undefined, undefined, "data")]);

  // ---- PEP: dos fuentes que se suman, sin unir ----
  const pepListas = filasDeLasListas("personaPublicasOpr");
  const pepInternas = filasDeLasInternas("tpeps");
  const pepRegistros = [...pepListas, ...pepInternas];
  const fuentesPep = [FUENTE_LISTAS, FUENTE_INTERNAS];
  const respuestaPep = respuestas([[FUENTE_LISTAS, "personaPublicasOpr"], [FUENTE_INTERNAS, "tpeps"]]);
  emitirHecho("cum.pep.cantidad", "cum.pep@1", fuentesPep, pepRegistros.length, citar(refs(pepRegistros), [], respuestaPep));
  emitirHecho("cum.pep.existe", "cum.pep@1", fuentesPep, pepRegistros.length > 0, citar(refs(pepRegistros), [], respuestaPep));
  // El más reciente por la fecha como texto (el orden de siempre); con la misma fecha manda el primero.
  const masReciente = [...pepRegistros].sort((a, b) => String(b.r.fecha ?? "").localeCompare(String(a.r.fecha ?? "")))[0] as Fila | undefined;
  const detalle: ElementoDeLista | null = masReciente
    ? {
        cargo: (masReciente.r.cargo as string) ?? null,
        empresa: (masReciente.r.empresa as string) ?? (masReciente.r.empresaSector as string) ?? null,
        sueldo: num(masReciente.r.sueldo),
        fecha: (masReciente.r.fecha as string) ?? null,
      }
    : null;
  emitirHecho("cum.pep.detalle", "cum.pep@1", fuentesPep, detalle, masReciente ? [refDeFila(consulta, masReciente)] : []);
  // El mismo cargo y la misma fecha en las dos fuentes: se cuentan las dos (se suman sin unir) y se dice.
  for (const interna of pepInternas) {
    const igual = pepListas.find((l) => l.r.cargo && String(l.r.cargo) === String(interna.r.cargo) && l.r.fecha && String(l.r.fecha) === String(interna.r.fecha));
    if (!igual) continue;
    emisor.diferencia({
      codigo: "dif.cum.pep.repetido",
      regla: "cum.pep@1",
      sobre: "cum.pep.cantidad",
      manda: { fuente: igual.fuente, valor: String(igual.r.fecha), registro: refDeFila(consulta, igual) },
      cede: [{ fuente: interna.fuente, valor: String(interna.r.fecha), registro: refDeFila(consulta, interna) }],
      magnitud: { absoluta: 1, relativa: null },
      lectura: "esperada",
    });
  }
}
