// Grupo 4 de la capa de hechos, parte 2: los ingresos (docs/capa-de-hechos.md, 4.4 y 4.4.1).
// `fuentesIngreso` y su `detalle`: de qué vive la persona, con el segmento que se le asigna.
//
// ETAPA B (estructura-v31). process.ts arma `fuentesIngreso` con `perfilDesdeHechos()` y este grupo es
// quien llama a `analizarFuentesIngreso()`, UNA sola vez por perfil (hasta la v30 corría también en
// process.ts). Las reglas NO se mudaron a este archivo, a propósito: son 1.386 líneas de reglas y de
// textos que el analista y el modelo leen, con su propia versión (`FUENTES_INGRESO_VERSION`), y moverlas
// sólo habría agregado una copia que revisar sin cambiar un valor. `fuentes-ingreso.ts` sigue siendo la
// única implementación y este grupo la llama, nunca la copia. Lo que el grupo agrega es lo que la función
// no dice: qué filas del crudo sostienen cada cifra, de quién es el aporte (calidad) y las lecturas que
// hoy no se ven. `comparar-hechos.mjs` mide la procedencia: que cada fila citada exista y que las sumas y
// los recuentos de lo citado den el valor.
//
// Con una fuente que no contestó el campo es null y el grupo lo lista en `camposSinDato` con el parcial
// (lo que dice la función con las fuentes que sí contestaron, que es lo que escribía el perfil hasta la
// v30). Los campos del `detalle` van con su nombre con punto («detalle.aportesPorMes»).
//
// La calidad (docs, 4.4.1): el aporte de un empleador es `confirmado_por_tercero`; el de quien
// es su propio patrono o aporta por cuenta propia, `declarado`; el impuesto a la renta es lo que
// la persona declaró al SRI (`declarado`); un segmento y una fuente que este módulo deduce, sin
// que ninguna fuente lo afirme (una actividad propia por tener RUC activo), son `calculado`.
//
// Lo que queda dicho por primera vez: cuánto de lo reportado lo confirma un tercero y cuánto lo
// elige la propia persona (`ing.reportado.por_tercero` y `.autodeclarado`), y una diferencia que
// ya existía y no se veía: «obligado a llevar contabilidad» se lee distinto en ruc.ts («SI», «S»,
// «NO», «N») y en fuentes-ingreso.ts (sólo «SI»); `dif.ing.obligado` la cuenta, sin corregirla
// (riesgo 3: cambiarla es una versión mayor del marco, F16).

import { ayudanteDelGrupo, type Emisor } from "../emisor.ts";
import { type AnyRecord, type Fila, filasDe, refDeFila, refDeRespuesta, respuestaDe } from "../lectura-del-crudo.ts";
import { CODIGOS_DE_AFILIACION_PROPIA, codigoDeTipoDeEmpleador, mesClave, mesMenos } from "../lectura-del-iess.ts";
import type { Calidad, CodigoDelCatalogo, Contexto, Descarte, DiferenciaEsperada, ElementoDeLista, Hecho, MotivoDeNoDisponible, RefDeRegistro } from "../tipos.ts";
import { analizarFuentesIngreso } from "../../fuentes-ingreso.ts";
import { FUENTES } from "../../calidad-de-la-consulta.ts";
import { aporteDeSuPropioPatrono, esElPropioAfiliado } from "../../patrono.ts";
import { mismoNombre } from "../../mismo-nombre.ts";
import { esRegistroDeRuc, obligadoALlevarContabilidad, rucActivo } from "../../ruc.ts";
import type { RespuestaProveedorInfo1 } from "../../types.ts";

const P = "fuentesIngreso.";

type Perfil = { campo: string; enSinValor: CodigoDelCatalogo["enElPerfilSinValor"] } | null;
function codigo(
  codigo: string,
  unidad: CodigoDelCatalogo["unidad"],
  descripcion: string,
  perfil: Perfil,
  opciones: { esIdentificador?: boolean; recuento?: CodigoDelCatalogo["recuento"] } = {},
): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo, unidad, descripcion, llegaAlModelo: perfil !== null, esIdentificador: opciones.esIdentificador ?? false };
  if (perfil) {
    c.campoDelPerfil = P + perfil.campo;
    c.enElPerfilSinValor = perfil.enSinValor;
  }
  if (opciones.recuento) c.recuento = opciones.recuento;
  return c;
}
const en = (campo: string, enSinValor: CodigoDelCatalogo["enElPerfilSinValor"]): Perfil => ({ campo, enSinValor });

// `fuentesIngreso` llega al modelo resumido (perfil-del-modelo.ts) y la renta nunca: eso lo decide
// aquel archivo, no este catálogo. Los nuevos no llegan a ninguna parte.
export const CATALOGO: CodigoDelCatalogo[] = [
  codigo("ing.version", "texto", "Versión de las reglas con que se clasificó el ingreso", en("version", null)),
  codigo("ing.corte.usado", "texto", "Mes del último corte del IESS con que se mide la vigencia", en("corteIessUsado", null)),
  codigo("ing.corte.desactualizado", "si_no", "La persona trae un mes posterior al corte configurado", en("corteDesactualizado", false)),
  codigo("ing.aparece_en_ultimo_corte", "si_no", "Aparece con aportes en el último corte del IESS", en("apareceEnUltimoCorte", null)),
  codigo("ing.cortes_desde_la_desvinculacion", "meses", "Meses entre su último aporte y el corte", en("cortesDesdeLaDesvinculacion", null)),
  codigo("ing.segmento.codigo", "texto", "Segmento de ingreso que se le asigna", en("segmento", null)),
  codigo("ing.segmento.estado", "texto", "Si el segmento está confirmado, es provisional o indeterminado", en("estadoSegmento", null)),
  codigo("ing.segmento.motivo", "texto", "Por qué se le asignó ese segmento", en("motivoSegmento", null)),
  codigo("ing.fuentes", "lista", "De dónde sale su ingreso: aportes, jubilación, pensión, servicio activo y actividad propia, con su evidencia", en("fuentes", null), { esIdentificador: true }),
  codigo("ing.reportado.mensual", "usd", "Ingreso mensual reportado al IESS en el corte, sumado entre sus aportes vigentes", en("pisoIngresoMensualReportado", null), { recuento: "suma" }),
  codigo("ing.senales_de_escala", "lista", "Tamaño de la actividad: nómina que paga, obligación de contabilidad y establecimientos activos", en("senalesDeEscala", null)),
  codigo("ing.para_confirmar", "lista", "Qué pedir para confirmar el ingreso", en("paraConfirmar", null)),
  codigo("ing.aportes.por_mes", "lista", "Total aportado por mes en los 24 meses hasta el corte", en("detalle.aportesPorMes", null)),
  codigo("ing.vinculos", "lista", "Empleadores o afiliaciones propias de los últimos 24 meses", en("detalle.vinculos", null), { esIdentificador: true }),
  codigo("ing.aportes.meses_12", "cantidad", "Meses con aporte en los últimos 12", en("detalle.mesesConAporteUltimos12", null)),
  codigo("ing.aportes.meses_24", "cantidad", "Meses con aporte en los últimos 24", en("detalle.mesesConAporteUltimos24", null)),
  codigo("ing.promedio.ultimos_6", "usd", "Promedio mensual aportado en los últimos 6 meses", en("detalle.promedioUltimos6", null)),
  codigo("ing.promedio.ultimos_12", "usd", "Promedio mensual aportado en los últimos 12 meses", en("detalle.promedioUltimos12", null)),
  codigo("ing.total.hace_12_meses", "usd", "Total aportado el mismo mes un año antes del corte", en("detalle.totalHace12Meses", null)),
  codigo("ing.continuidad", "objeto", "Continuidad laboral: desde cuándo trabaja sin interrupciones de más de 2 meses", en("detalle.continuidadLaboral", null)),
  codigo("ing.actividades_economicas", "lista", "Actividades económicas de sus establecimientos ante el SRI", en("detalle.actividadesEconomicas", null)),
  codigo("ing.impuesto_renta.por_anio", "lista", "Impuesto a la renta causado por año fiscal, lo que declaró al SRI", en("detalle.impuestoRentaPorAnio", null)),
  // Lo nuevo: no llega a ninguna parte.
  codigo("ing.reportado.por_tercero", "usd", "Parte del ingreso reportado que paga un empleador", null, { recuento: "suma" }),
  codigo("ing.reportado.autodeclarado", "usd", "Parte del ingreso reportado cuya base elige la propia persona", null, { recuento: "suma" }),
  codigo("dif.ing.obligado", "texto", "«Obligado a llevar contabilidad» según ruc.ts contra según fuentes-ingreso.ts", null),
];

// Las que unen, eligen o descartan registros: cada una con un crudo inventado en que
// aplica y uno en que no (scripts/crudos-sinteticos/, campo `reglas`).
export const REGLAS_QUE_MEZCLAN: string[] = [
  "ing.segmento@1", // elige el segmento entre varias fuentes de ingreso: la que domina, o ingresos mixtos
  "ing.obligado@1", // dos lectores del mismo campo del RUC que no coinciden con «S»
];

export const DIFERENCIAS_ESPERADAS: DiferenciaEsperada[] = [
  {
    campo: "fuentesIngreso.*",
    detector: "dato-de-ingresos-de-fuente-sin-respuesta-escrito-como-total",
    aprobadaEl: "pendiente: la aprueba el negocio con el PR de estructura-v31",
    motivo: "una fuente que no contestó deja el campo sin dato en vez del parcial (hasta la v30, el segmento «sin_datos» o el que daban las otras fuentes)",
    cuando: "sin_dato",
  },
];

const TIESS: [string, string] = ["basesInternas", "tiess"];
const EMPLEADOS: [string, string] = ["empleados", "empleados"];
const CONTRIBUYENTE: [string, string] = ["contribuyente", "datosContribuyente"];
const RENTA: [string, string] = ["sriImpuestoRenta", "data"];
const JUBILADOS: [string, string] = ["jubilados", "trabajos"];

// Las fuentes que el segmento lee y que son obligatorias (calidad-de-la-consulta.ts). Las
// secundarias (la pensión de otra fuente, la afiliación de ISSFAC por otro camino) no cuentan
// como caídas: la ausencia de una secundaria no cambia lo que dice una obligatoria.
const FUENTES_DEL_SEGMENTO = [
  "basesInternas", "jubilados", "contribuyente", "establecimientoActEconomica", "empleados",
  "afiliacionIssfacCertMedico", "afiliacionSiisspol", "pensionAlimenticiaProveedorInfo1", "sriImpuestoRenta",
];
const FUENTES_DE_LA_CONTINUIDAD = ["basesInternas", "contribuyente", "establecimientoActEconomica"];

const montoValido = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};
const redondear2 = (n: number): number => Math.round(n * 100) / 100;

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const cedula = contexto.cedula;
  const h = ayudanteDelGrupo(emisor, CATALOGO);
  // Como process.ts (identidad.nombreCompleto): el cotejo del propio patrono y de la pensión que percibe.
  const nombre = (((crudo.general as AnyRecord | undefined)?.data as AnyRecord | undefined)?.personaNatural as AnyRecord | undefined)?.nombre as string | null ?? null;
  // Con el corte vacío (process.ts lo pasa así cuando no hay uno) se usa el conocido.
  const A = analizarFuentesIngreso(crudo as unknown as RespuestaProveedorInfo1, nombre, contexto.corteIess || undefined, cedula);
  const regla = `ing.analisis@${A.version}`;

  const estado = new Map<string, "contesto" | MotivoDeNoDisponible>();
  // Una fuente que dice «no hay» con `faltante` (la renta) no es una falla.
  const contesto = (fuente: string) => {
    if (!estado.has(fuente)) {
      const r = respuestaDe(crudo, fuente);
      estado.set(fuente, r !== "contesto" && FUENTES[fuente]?.noHay === "faltante" && (crudo[fuente] as AnyRecord | undefined)?.status === "faltante" ? "contesto" : r);
    }
    return estado.get(fuente)!;
  };

  // ---- Las filas ----
  const anidado = Boolean((((crudo.basesInternas as AnyRecord | undefined)?.data as AnyRecord | undefined)?.data));
  // Los aportes con la forma `basesInternas.data.data` (0 en las 3.766) no se pueden citar por
  // su lista: se cita la respuesta entera.
  const tiess = anidado ? [] : filasDe(crudo, ...TIESS);
  const nominaCompleta = filasDe(crudo, ...EMPLEADOS);
  const nomina = nominaCompleta.filter((f) => !esElPropioAfiliado(f.r, cedula, nombre));
  const contribuyentes = filasDe(crudo, ...CONTRIBUYENTE);
  const mesDe = (f: Fila) => mesClave(f.r.anio, f.r.mes);

  const corte = A.corteIessUsado;
  let ultimoMes: string | null = null;
  let filaDelUltimoMes: Fila | null = null;
  for (const f of tiess) {
    const k = mesDe(f);
    if (k && (!ultimoMes || k > ultimoMes)) {
      ultimoMes = k;
      filaDelUltimoMes = f;
    }
  }
  const vigentes = A.apareceEnUltimoCorte ? tiess.filter((f) => mesDe(f) === corte) : [];
  const desde24 = mesMenos(corte, 23);
  const enVentana = tiess.filter((f) => {
    const k = mesDe(f);
    return k !== null && k >= desde24 && k <= corte;
  });

  // Un aporte es propio si el patrono es ella o si aporta por cuenta propia o del hogar.
  const esPropio = (f: Fila) => aporteDeSuPropioPatrono(f.r, cedula, nombre) || CODIGOS_DE_AFILIACION_PROPIA.has(codigoDeTipoDeEmpleador(f.r.tipEmp) ?? "");
  const calidadDeAportes = (filas: Fila[]): Calidad => (filas.some(esPropio) ? "declarado" : "confirmado_por_tercero");

  const respuestas = (...listas: Array<[string, string]>) => listas.map(([f, l]) => refDeRespuesta(crudo, consulta, f, l));
  const citas = (filas: Fila[], campo?: string) => filas.map((f) => refDeFila(consulta, f, campo));

  // Un hecho con valor si contestaron todas las fuentes que lee; si no, sin valor y con el
  // parcial (lo que dice la regla con las que sí contestaron: lo que el perfil escribe hoy).
  function emitirHecho(
    cod: string,
    fuentes: string[],
    valor: Hecho["valor"],
    registros: RefDeRegistro[],
    listas: Array<[string, string]>,
    opciones: { calidad?: Calidad; descartados?: Descarte[]; sinValor?: MotivoDeNoDisponible } = {},
  ) {
    const caidas = fuentes.filter((f) => contesto(f) !== "contesto");
    if (caidas.length) return void h.sinValor(cod, regla, fuentes, caidas.some((f) => contesto(f) === "fuente_sin_respuesta") ? "fuente_sin_respuesta" : "fuente_deshabilitada", valor);
    if (valor === null) return void h.sinValor(cod, regla, fuentes, opciones.sinValor ?? "no_aplica");
    const hecho: Omit<Hecho, "clase" | "fechaDeLaConsulta"> = {
      codigo: cod, regla, unidad: CATALOGO.find((c) => c.codigo === cod)!.unidad, valor, calidad: opciones.calidad ?? "calculado",
      fuentes, fechaDelDato: null, registros: registros.length ? registros : respuestas(...listas),
    };
    if (opciones.descartados?.length) hecho.descartados = opciones.descartados;
    emisor.hecho(hecho);
  }
  const lista = (x: unknown) => x as ElementoDeLista[];
  const SOLO_APORTES = ["basesInternas"];

  // ---- El corte y la vigencia ----
  const delCorte = A.corteDesactualizado && filaDelUltimoMes ? [refDeFila(consulta, filaDelUltimoMes, "anio")] : [];
  emitirHecho("ing.version", SOLO_APORTES, A.version, [], [TIESS]);
  emitirHecho("ing.corte.usado", SOLO_APORTES, A.corteIessUsado, delCorte, [TIESS]);
  emitirHecho("ing.corte.desactualizado", SOLO_APORTES, A.corteDesactualizado, delCorte, [TIESS]);
  const delUltimo = filaDelUltimoMes ? [refDeFila(consulta, filaDelUltimoMes, "anio")] : [];
  emitirHecho("ing.aparece_en_ultimo_corte", SOLO_APORTES, A.apareceEnUltimoCorte, delUltimo, [TIESS], { calidad: "confirmado_por_tercero" });
  emitirHecho("ing.cortes_desde_la_desvinculacion", SOLO_APORTES, A.cortesDesdeLaDesvinculacion, delUltimo, [TIESS]);

  // ---- Lo que sostiene cada fuente de ingreso ----
  const tipos = new Set(A.fuentes.map((f) => f.tipo));
  const supas = [...filasDe(crudo, "pensionAlimenticia", "supas"), ...filasDe(crudo, "pensionAlimenticiaProveedorInfo1", "supas")];
  const militares: Array<[string, string]> = [["afiliacionIssfacCertMedico", "afiliaciones"], ["afiliacionIssfacFuerzaArmada", "afiliaciones"], ["afiliacionSiisspol", "afiliacionSiisspol"]];
  const establecimientosDeLasListas = establecimientosDe(crudo);
  const activos = contribuyentes.filter((f) => esRegistroDeRuc(f.r) && rucActivo(f.r, establecimientosDeLasListas.map((e) => e.r)));
  const mesDeLaNomina = nomina.reduce((m, f) => { const k = mesDe(f); return k && k > m ? k : m; }, "");
  const nominaDelMes = nomina.filter((f) => mesDe(f) === mesDeLaNomina);
  const queSostiene: RefDeRegistro[] = [
    ...citas(vigentes),
    ...(tipos.has("jubilación") ? citas(filasDe(crudo, ...JUBILADOS)) : []),
    ...(A.fuentes.some((f) => /ISSFAC|ISSPOL|militar|policial/i.test(`${f.tipo} ${f.detalle}`)) ? respuestas(...militares) : []),
    ...(tipos.has("pensión alimenticia percibida") ? citas(supas.filter((f) => mismoNombre(f.r.representanteLegal, nombre))) : []),
    ...(tipos.has("actividad económica propia") ? citas(activos) : []),
    ...(tipos.has("actividad empresarial propia") ? citas(nominaDelMes) : []),
  ];
  // La evidencia dice de quién es cada fuente: el aporte propio se declara; lo que este módulo deduce, se calcula.
  const calidadDeLasFuentes: Calidad = A.fuentes.some((f) => f.evidencia === "autodeclarada_en_minimo" || f.evidencia === "autodeclarada_sobre_minimo")
    ? "declarado"
    : A.fuentes.some((f) => f.tipo === "actividad económica propia" || f.tipo === "actividad empresarial propia")
      ? "calculado"
      : "confirmado_por_tercero";
  const listasDelSegmento: Array<[string, string]> = [TIESS, JUBILADOS, CONTRIBUYENTE, EMPLEADOS];
  emitirHecho("ing.fuentes", FUENTES_DEL_SEGMENTO, lista(A.fuentes), queSostiene, listasDelSegmento, { calidad: calidadDeLasFuentes });
  emitirHecho("ing.segmento.codigo", FUENTES_DEL_SEGMENTO, A.segmento, queSostiene, listasDelSegmento);
  emitirHecho("ing.segmento.estado", FUENTES_DEL_SEGMENTO, A.estadoSegmento, queSostiene, listasDelSegmento);
  emitirHecho("ing.segmento.motivo", FUENTES_DEL_SEGMENTO, A.motivoSegmento, queSostiene, listasDelSegmento);
  emitirHecho("ing.para_confirmar", FUENTES_DEL_SEGMENTO, A.paraConfirmar, queSostiene, listasDelSegmento);

  // ---- Cuánto se reporta, y quién lo confirma ----
  // Un aporte vigente sin monto (llegó en cero o sin el campo) queda descartado de la suma.
  const sinMonto: Descarte[] = vigentes.filter((f) => montoValido(f.r.salario) === null).map((f) => ({ registro: refDeFila(consulta, f), motivo: "aporte_sin_monto_valido" }));
  const conMonto = vigentes.filter((f) => montoValido(f.r.salario) !== null);
  emitirHecho("ing.reportado.mensual", SOLO_APORTES, A.pisoIngresoMensualReportado, citas(conMonto, "salario"), [TIESS],
    { calidad: conMonto.length ? calidadDeAportes(conMonto) : "calculado", descartados: sinMonto });
  // A.fuentes trae primero los aportes vigentes, en el orden de las filas: la evidencia de cada uno.
  const evidenciaDe = new Map<Fila, string>(vigentes.map((f, i) => [f, A.fuentes[i]?.evidencia ?? ""]));
  const sumarPor = (cod: string, esDeEsta: (evidencia: string) => boolean) => {
    const filas = conMonto.filter((f) => esDeEsta(evidenciaDe.get(f) ?? ""));
    const total = redondear2(filas.reduce((s, f) => s + (montoValido(f.r.salario) ?? 0), 0));
    emitirHecho(cod, SOLO_APORTES, total, citas(filas, "salario"), [TIESS], { calidad: cod.endsWith("por_tercero") ? "confirmado_por_tercero" : "declarado" });
  };
  sumarPor("ing.reportado.por_tercero", (e) => e === "reportada_por_tercero");
  sumarPor("ing.reportado.autodeclarado", (e) => e === "autodeclarada_en_minimo" || e === "autodeclarada_sobre_minimo");

  // ---- El tamaño de la actividad: la nómina la declara ella como empleadora; el RUC lo informa el SRI ----
  const conObligado = contribuyentes.filter((f) => esRegistroDeRuc(f.r) && String(f.r.obligado).toUpperCase() === "SI");
  const senalesDeNomina = A.senalesDeEscala.some((s) => s.senal === "nómina que paga");
  const deLasSenales: RefDeRegistro[] = [
    ...(senalesDeNomina ? citas(nominaDelMes) : []),
    ...citas(conObligado),
    ...(A.senalesDeEscala.some((s) => s.senal === "establecimientos activos") ? citas(establecimientosDeLasListas) : []),
  ];
  emitirHecho("ing.senales_de_escala", ["empleados", "contribuyente", "establecimientoActEconomica"], lista(A.senalesDeEscala), deLasSenales, [EMPLEADOS, CONTRIBUYENTE],
    { calidad: senalesDeNomina ? "declarado" : "confirmado_por_tercero" });

  // ---- El detalle: los 24 meses hasta el corte ----
  const delDetalle = { calidad: enVentana.length ? calidadDeAportes(enVentana) : ("calculado" as Calidad) };
  const d = A.detalle!;
  emitirHecho("ing.aportes.por_mes", SOLO_APORTES, lista(d.aportesPorMes), citas(enVentana, "salario"), [TIESS], delDetalle);
  emitirHecho("ing.vinculos", SOLO_APORTES, lista(d.vinculos), citas(enVentana), [TIESS], delDetalle);
  emitirHecho("ing.aportes.meses_12", SOLO_APORTES, d.mesesConAporteUltimos12, citas(enVentana.filter((f) => (mesDe(f) ?? "") >= mesMenos(corte, 11))), [TIESS], delDetalle);
  emitirHecho("ing.aportes.meses_24", SOLO_APORTES, d.mesesConAporteUltimos24, citas(enVentana), [TIESS], delDetalle);
  emitirHecho("ing.promedio.ultimos_6", SOLO_APORTES, d.promedioUltimos6, citas(enVentana.filter((f) => (mesDe(f) ?? "") >= mesMenos(corte, 5)), "salario"), [TIESS], delDetalle);
  emitirHecho("ing.promedio.ultimos_12", SOLO_APORTES, d.promedioUltimos12, citas(enVentana.filter((f) => (mesDe(f) ?? "") >= mesMenos(corte, 11)), "salario"), [TIESS], delDetalle);
  emitirHecho("ing.total.hace_12_meses", SOLO_APORTES, d.totalHace12Meses, citas(enVentana.filter((f) => mesDe(f) === mesMenos(corte, 12)), "salario"), [TIESS], delDetalle);
  const continuidad = d.continuidadLaboral ?? null;
  const deLaContinuidad = continuidad ? tiess.filter((f) => { const k = mesDe(f); return k !== null && k >= continuidad.desde && k <= continuidad.hasta; }) : [];
  emitirHecho("ing.continuidad", FUENTES_DE_LA_CONTINUIDAD, continuidad as unknown as ElementoDeLista | null, citas(deLaContinuidad), [TIESS], { calidad: "calculado" });

  // Las actividades de TODAS las listas de establecimientos (así las lee fuentes-ingreso.ts): una por actividad y nombre.
  const unaPorActividad: Fila[] = [];
  const vistas = new Set<string>();
  for (const f of establecimientosDeLasListas) {
    const actividad = textoONull(f.r.act_economica);
    const nombreComercial = textoONull(f.r.nombre_comercial);
    const clave = `${actividad}|${nombreComercial}`;
    if (vistas.has(clave) || (!actividad && !nombreComercial)) continue;
    vistas.add(clave);
    unaPorActividad.push(f);
  }
  emitirHecho("ing.actividades_economicas", ["establecimientoActEconomica"], lista(d.actividadesEconomicas), citas(unaPorActividad), [["establecimientoActEconomica", "datosEstablecimientoActEco"]], { calidad: "confirmado_por_tercero" });

  // La renta es lo que la persona declaró al SRI, año por año.
  const filasDeRenta = filasDe(crudo, ...RENTA).filter((f) => Array.isArray(f.r.impuestosRenta) && (f.r.impuestosRenta as unknown[]).length > 0);
  emitirHecho("ing.impuesto_renta.por_anio", ["sriImpuestoRenta"], lista(d.impuestoRentaPorAnio), citas(filasDeRenta), [RENTA], { calidad: "declarado" });

  // ---- Los dos lectores de «obligado» ----
  // fuentes-ingreso.ts compara sólo «SI»; ruc.ts también «S». Con «S», uno dice obligado y el otro no.
  for (const f of contribuyentes) {
    if (!esRegistroDeRuc(f.r) || obligadoALlevarContabilidad(f.r) !== true || String(f.r.obligado).toUpperCase() === "SI") continue;
    emisor.diferencia({
      codigo: "dif.ing.obligado",
      regla: "ing.obligado@1",
      sobre: "ing.senales_de_escala",
      manda: { fuente: "contribuyente", valor: "no_obligado_segun_fuentes_ingreso", registro: refDeFila(consulta, f, "obligado") },
      cede: [{ fuente: "contribuyente", valor: "obligado_segun_ruc", registro: refDeFila(consulta, f, "obligado") }],
      magnitud: { absoluta: null, relativa: null },
      lectura: "revisar",
    });
  }
}

// Todas las listas de `establecimientoActEconomica`, como las lee fuentes-ingreso.ts, con su
// lista y su posición para poder citarlas.
function establecimientosDe(crudo: AnyRecord): Fila[] {
  const data = (((crudo.establecimientoActEconomica as AnyRecord | undefined)?.data ?? {}) as AnyRecord);
  return Object.entries(data).flatMap(([lista, items]) => (Array.isArray(items) ? (items as AnyRecord[]).map((r, indice) => ({ fuente: "establecimientoActEconomica", lista, indice, r })) : []));
}

const textoONull = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v.trim() : null);
