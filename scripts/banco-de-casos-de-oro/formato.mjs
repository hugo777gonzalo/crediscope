// El formato del banco de casos de oro (README.md de esta carpeta): qué lleva cada
// caso, qué valores admite y cómo se lee. Lo usan la prueba del formato
// (scripts/probar-banco-de-casos.mjs, en el control `guiones`) y lo usará el
// corredor que corre los casos contra el modelo: una sola definición, para que el
// corredor no acepte un caso que la prueba rechazaría.
//
// El repositorio es público. Un caso real guarda su referencia (c-xxxxxxxx) y el
// corredor carga el perfil de la base al correr: ni el perfil, ni cifras, ni
// nombres. `textoQueParecePersonal()` corta lo que tenga forma de cédula, de monto o
// de nombre propio escrito como lo trae la fuente (en mayúsculas).
//
// AVISO: este archivo no pasa por lint ni build.

import fs from "node:fs";
import path from "node:path";

export const VERSION_DEL_FORMATO = 1;
export const CARPETA_DE_CASOS = path.join(import.meta.dirname, "casos");

// Lo que contesta el modelo hoy (marco-v36, PR 151): el esquema de llm-scoring.ts.
export const RECOMENDACIONES_DE_HOY = ["aprobar", "revisar", "negar"];

// Las seis salidas de la versión mayor (negocio, 2026-11-11). La clave va en el
// caso; el nombre es el que verá la institución.
export const SALIDAS_DE_LA_VERSION_MAYOR = {
  aprobacion_directa: "Aprobación Directa",
  aprobar: "Aprobar",
  cambio_de_condiciones: "Cambio de Condiciones",
  condicionado: "Condicionado",
  revisar: "Revisar",
  negar: "Negar",
};

// Qué recomendación de hoy es compatible con cada salida de la versión mayor. Un
// caso que diga «Negar» en la mayor y «aprobar» hoy tiene un error de redacción,
// no un criterio nuevo. Cambio de Condiciones y Condicionado no existen hoy:
// el modelo los expresa como «revisar» o, con la acción que pide el requisito, como
// «aprobar».
export const COMPATIBLES_CON_HOY = {
  aprobacion_directa: ["aprobar"],
  aprobar: ["aprobar"],
  cambio_de_condiciones: ["revisar", "negar"],
  condicionado: ["aprobar", "revisar"],
  revisar: ["revisar"],
  negar: ["negar"],
};

// Por dónde termina la evaluación. Sólo `analisis_del_modelo` llega al modelo; en
// las demás, lo que se prueba es que el modelo NO corra y lo que se entrega.
export const FLUJOS = {
  analisis_del_modelo: "El modelo analiza el perfil y su respuesta se compara con el caso.",
  negado_por_control: "Un control de bloqueo niega sin llamar al modelo.",
  sin_veredicto: "El modelo no contesta: se entrega sin score y nunca «aprobar».",
  persona_no_encontrada: "La fuente dice que la identificación no existe: no hay perfil ni modelo.",
  fuentes_no_disponibles: "Ninguna fuente contestó: no hay perfil ni modelo.",
  consulta_incompleta: "Faltó una fuente obligatoria: el modelo no corre y la entrega dice qué temas faltaron.",
};

// De dónde salió el caso.
export const FUENTES_DEL_CASO = {
  piloto_revision_del_analisis: "Los 12 casos del piloto de la revisión del análisis (2026-11-06), con el dictamen del jefe de crédito.",
  observacion_del_negocio: "Una observación del negocio (docs/observaciones-del-negocio.md, O-1 a O-5).",
  sandbox_api: "Una identificación del sandbox de la API (supabase/functions/_shared/sandbox-casos.ts).",
};

// Las decisiones del negocio del 2026-11-11 que pueden haber cambiado lo que se
// esperaba de un caso.
export const DECISIONES_DEL_2026_11_11 = {
  seis_salidas: "La versión mayor tiene seis salidas; CrediScope recomienda y decide una persona de la institución.",
  comportamiento_interno_cualitativo: "El Comportamiento Interno es referencia cualitativa: se resalta y se contrasta con el buró, no pesa como él.",
  mal_pago_niega_salvo_atenuantes: "Un mal comportamiento de pago, actual o histórico, recomienda negar salvo atenuantes medibles (hoy al día, endeudamiento a la baja, 12 meses o más de estabilidad, ingreso al alza).",
  demanda_antigua_pesa_menos: "Una demanda de cobro de más de 2 años pesa menos.",
  bajar_revisar: "«Revisar» tiene que bajar: hoy es el 72% de las recomendaciones.",
};

// El buró de la institución (Equifax) que necesita el caso. `necesario`: el
// dictamen se apoya en él y, sin una consulta de la persona a la fecha del perfil,
// el corredor marca el caso como «no aplica» en vez de fallarlo.
export const BURO_EQUIFAX = ["necesario", "si_hay", "no"];

// Los campos de la respuesta del modelo (ESQUEMA_RESPUESTA de llm-scoring.ts) en
// que se buscan los textos. `todo` es la respuesta entera.
export const CAMPOS_DE_TEXTO = ["positives", "negatives", "reasoning", "accionesSugeridas", "missingInfo", "todo"];

export const INDICADORES = {
  riesgo: { campo: "indicadorRiesgo", valores: ["muy bajo", "bajo", "moderado", "alto", "muy alto"] },
  historial: { campo: "indicadorHistorial", valores: ["excelente", "bueno", "regular", "malo", "sin historial"] },
};

// Los tipos de acción sugerida que un guion reconoce por sí solo. Un patrón amplio
// a propósito: la afirmación es «existe una acción de este tipo», no su redacción.
export const TIPOS_DE_ACCION = {
  documentar_ingreso: /factura|\bIVA\b|declaraci[oó]n|estados? de cuenta|movimientos|roles? de pago|certificado de ingreso|documentos? de confirmaci[oó]n|ingreso/iu,
  verificar_identidad: /homónim|homonim|identidad|cumplimiento|no (es|sea) (de )?(esta|la) persona/iu,
  verificar_demanda: /demanda|juicio|proceso judicial|causa/iu,
  verificar_pension: /pensi[oó]n alimenticia|\bSUPA\b/iu,
  confirmar_deuda_y_cuota: /cuota|tabla de amortizaci[oó]n|estado de la deuda|saldo/iu,
};

// Las afirmaciones que un guion comprueba solo, con sus parámetros.
export const AFIRMACIONES_AUTOMATICAS = {
  score_entre: ["min", "max"],
  indicador: ["indicador", "valores"],
  texto_prohibido: ["patron", "campos"],
  texto_requerido: ["patron", "campos"],
  // `accion` es una clave de TIPOS_DE_ACCION: alguna acción sugerida tiene que calzar.
  accion: ["accion"],
  primera_frase: ["patron"],
};

const CAMPOS_DEL_CASO = [
  "formato", "id", "fuente", "de_donde_sale", "tema", "perfil", "buro_equifax", "flujo_esperado",
  "dictamen", "recomendacion_hoy", "hoy_tambien_aceptable", "salida_version_mayor",
  "afirmaciones", "ajustes_por_las_decisiones",
];
const OPCIONALES = new Set(["hoy_tambien_aceptable", "ajustes_por_las_decisiones"]);

export const REFERENCIA_REAL = /^c-[0-9a-f]{8}$/;
export const REFERENCIA_DEL_SANDBOX = /^sandbox-(00\d{8})$/;

// Las siglas que sí pueden ir en mayúsculas en un caso real. Una palabra de 4 letras
// o más en mayúsculas que no esté acá suele ser un nombre copiado de la fuente
// (persona, empleador o acreedor), y eso identifica.
const SIGLAS_PERMITIDAS = new Set(["IESS", "BIESS", "SUPA", "OFAC", "CONSEP", "ISSFA", "ISSPOL", "SERCOP"]);

/**
 * Lo que en un texto de un caso real tiene forma de dato personal: devuelve el motivo
 * o null. No es una garantía (un nombre en minúsculas pasa), es la red para lo que se
 * escapa al copiar de un dictamen: la cédula, el monto y el nombre en mayúsculas.
 */
export function textoQueParecePersonal(texto) {
  if (/\d{9,}/.test(texto)) return "un número de 9 dígitos o más (forma de cédula o de RUC)";
  if (/\$\s?\d|\bUSD\s?\d|\d\s?(USD|dólares)\b/iu.test(texto)) return "un monto en dólares";
  if (/\b\d{1,3}(\.\d{3})+\b/.test(texto)) return "una cifra con separador de miles";
  if (/\b\d+,\d+\b/.test(texto)) return "una cifra con decimales";
  if (/\b\d{5,}\b/.test(texto)) return "un número de 5 dígitos o más";
  for (const m of texto.matchAll(/\b\d{4}\b/g)) {
    const n = Number(m[0]);
    if (n < 1980 || n > 2035) return `un número de cuatro cifras que no es un año (${m[0]})`;
  }
  for (const m of texto.matchAll(/(?<![\p{L}\d])[A-ZÁÉÍÓÚÑ]{4,}(?![\p{L}\d])/gu)) {
    if (!SIGLAS_PERMITIDAS.has(m[0])) return `una palabra en mayúsculas que puede ser un nombre (${m[0]})`;
  }
  return null;
}

// Todos los textos de un valor, con la ruta de cada uno, para revisarlos.
function textosDe(valor, ruta = "") {
  if (typeof valor === "string") return [[ruta, valor]];
  if (Array.isArray(valor)) return valor.flatMap((v, i) => textosDe(v, `${ruta}[${i}]`));
  if (valor && typeof valor === "object") return Object.entries(valor).flatMap(([k, v]) => textosDe(v, ruta ? `${ruta}.${k}` : k));
  return [];
}

const esTexto = (v) => typeof v === "string" && v.trim().length > 0;
const listaDeTextos = (v, min = 1) => Array.isArray(v) && v.length >= min && v.every(esTexto);

function compilar(patron) {
  try {
    new RegExp(patron, "iu");
    return null;
  } catch (e) {
    return e.message;
  }
}

function validarAfirmacionAutomatica(a, i, errores) {
  const donde = `afirmaciones.automaticas[${i}]`;
  if (!a || typeof a !== "object") return errores.push(`${donde}: no es un objeto.`);
  const parametros = AFIRMACIONES_AUTOMATICAS[a.tipo];
  if (!parametros) return errores.push(`${donde}: tipo «${a.tipo}» desconocido (${Object.keys(AFIRMACIONES_AUTOMATICAS).join(", ")}).`);
  if (!esTexto(a.porque)) errores.push(`${donde}: falta «porque», qué error del modelo atrapa.`);
  const sobran = Object.keys(a).filter((k) => !["tipo", "porque", ...parametros].includes(k));
  if (sobran.length) errores.push(`${donde}: campos de más: ${sobran.join(", ")}.`);
  for (const p of parametros) if (a[p] === undefined) errores.push(`${donde}: falta «${p}».`);
  if (a.tipo === "score_entre") {
    const enRango = (n) => Number.isInteger(n) && n >= 1 && n <= 999;
    if (!enRango(a.min) || !enRango(a.max) || a.min > a.max) errores.push(`${donde}: el rango tiene que ser de enteros entre 1 y 999, con min <= max.`);
  }
  if (a.tipo === "indicador") {
    const ind = INDICADORES[a.indicador];
    if (!ind) errores.push(`${donde}: indicador «${a.indicador}» desconocido (riesgo o historial).`);
    else if (!listaDeTextos(a.valores) || a.valores.some((v) => !ind.valores.includes(v))) errores.push(`${donde}: valores fuera de ${ind.valores.join(", ")}.`);
  }
  if (a.tipo === "texto_prohibido" || a.tipo === "texto_requerido" || a.tipo === "primera_frase") {
    if (!esTexto(a.patron)) errores.push(`${donde}: «patron» vacío.`);
    else {
      const malo = compilar(a.patron);
      if (malo) errores.push(`${donde}: el patrón no compila (${malo}).`);
    }
  }
  if (a.tipo === "texto_prohibido" || a.tipo === "texto_requerido") {
    if (!listaDeTextos(a.campos) || a.campos.some((c) => !CAMPOS_DE_TEXTO.includes(c))) errores.push(`${donde}: «campos» tiene que ser una lista de ${CAMPOS_DE_TEXTO.join(", ")}.`);
  }
  if (a.tipo === "accion" && !TIPOS_DE_ACCION[a.accion]) {
    errores.push(`${donde}: acción «${a.accion}» desconocida (${Object.keys(TIPOS_DE_ACCION).join(", ")}).`);
  }
}

/**
 * Valida un caso. Devuelve la lista de errores (vacía si está bien). `nombreDeArchivo`
 * es el nombre del .json, que tiene que ser la referencia del caso.
 */
export function validarCaso(caso, nombreDeArchivo, { identificacionesDelSandbox = null } = {}) {
  const errores = [];
  if (!caso || typeof caso !== "object" || Array.isArray(caso)) return ["El caso no es un objeto."];

  for (const campo of CAMPOS_DEL_CASO) if (!OPCIONALES.has(campo) && caso[campo] === undefined) errores.push(`Falta «${campo}».`);
  const sobran = Object.keys(caso).filter((k) => !CAMPOS_DEL_CASO.includes(k));
  if (sobran.length) errores.push(`Campos de más: ${sobran.join(", ")}.`);
  if (caso.formato !== VERSION_DEL_FORMATO) errores.push(`«formato» tiene que ser ${VERSION_DEL_FORMATO}.`);

  // La referencia y su fuente
  const esReal = REFERENCIA_REAL.test(caso.id ?? "");
  const delSandbox = (caso.id ?? "").match(REFERENCIA_DEL_SANDBOX);
  if (!esReal && !delSandbox) errores.push(`«id» tiene que ser c-xxxxxxxx (8 caracteres hexadecimales de clients.id) o sandbox-00xxxxxxxx: «${caso.id}».`);
  if (nombreDeArchivo && nombreDeArchivo !== `${caso.id}.json`) errores.push(`El archivo se llama ${nombreDeArchivo} y el caso es ${caso.id}: tienen que coincidir.`);
  if (!FUENTES_DEL_CASO[caso.fuente]) errores.push(`«fuente» desconocida: ${caso.fuente} (${Object.keys(FUENTES_DEL_CASO).join(", ")}).`);
  if (delSandbox && caso.fuente !== "sandbox_api") errores.push("Un caso del sandbox tiene fuente sandbox_api.");
  if (esReal && caso.fuente === "sandbox_api") errores.push("Un caso real no puede tener fuente sandbox_api.");
  if (delSandbox && identificacionesDelSandbox && !identificacionesDelSandbox.includes(delSandbox[1])) {
    errores.push(`${delSandbox[1]} no es una identificación del sandbox (sandbox-casos.ts).`);
  }
  if (!esTexto(caso.de_donde_sale)) errores.push("«de_donde_sale» vacío.");
  if (!esTexto(caso.tema)) errores.push("«tema» vacío.");
  else if (caso.tema.length > 160 || caso.tema.includes("\n")) errores.push("«tema» va en una línea de hasta 160 caracteres.");

  // El perfil: los reales se cargan de la base; los del sandbox, del simulador
  const p = caso.perfil;
  if (!p || typeof p !== "object") errores.push("Falta «perfil».");
  else if (esReal) {
    if (p.origen !== "base") errores.push("El perfil de un caso real se carga de la base: perfil.origen = «base».");
    if (!["del_analisis_revisado", "ultimo"].includes(p.cual)) errores.push("perfil.cual tiene que ser «del_analisis_revisado» o «ultimo».");
    if (p.cual === "del_analisis_revisado") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(p.fecha_del_analisis ?? "")) errores.push("perfil.fecha_del_analisis tiene que ser una fecha AAAA-MM-DD.");
      if (!/^marco-v\d+$/.test(p.marco_del_analisis ?? "")) errores.push("perfil.marco_del_analisis tiene que ser marco-vNN.");
    }
    const permitidos = ["origen", "cual", "fecha_del_analisis", "marco_del_analisis"];
    const de_mas = Object.keys(p).filter((k) => !permitidos.includes(k));
    if (de_mas.length) errores.push(`perfil: campos de más en un caso real (${de_mas.join(", ")}); el perfil no va al repositorio.`);
  } else if (delSandbox) {
    if (p.origen !== "sandbox") errores.push("El perfil de un caso del sandbox sale del simulador: perfil.origen = «sandbox».");
    if (!["basico", "pro", "plus"].includes(p.modalidad)) errores.push("perfil.modalidad tiene que ser basico, pro o plus.");
  }
  if (!BURO_EQUIFAX.includes(caso.buro_equifax)) errores.push(`«buro_equifax» tiene que ser ${BURO_EQUIFAX.join(", ")}.`);

  // El dictamen y lo que se espera
  if (!FLUJOS[caso.flujo_esperado]) errores.push(`«flujo_esperado» desconocido: ${caso.flujo_esperado} (${Object.keys(FLUJOS).join(", ")}).`);
  if (!listaDeTextos(caso.dictamen, 2) || caso.dictamen.length > 4) errores.push("«dictamen» va en 2 a 4 líneas (una lista de 2 a 4 textos).");

  const conVeredicto = caso.flujo_esperado === "analisis_del_modelo" || caso.flujo_esperado === "negado_por_control";
  if (conVeredicto) {
    if (!RECOMENDACIONES_DE_HOY.includes(caso.recomendacion_hoy)) errores.push(`«recomendacion_hoy» tiene que ser ${RECOMENDACIONES_DE_HOY.join(", ")}.`);
    if (!SALIDAS_DE_LA_VERSION_MAYOR[caso.salida_version_mayor]) errores.push(`«salida_version_mayor» tiene que ser una de ${Object.keys(SALIDAS_DE_LA_VERSION_MAYOR).join(", ")}.`);
    else if (RECOMENDACIONES_DE_HOY.includes(caso.recomendacion_hoy) && !COMPATIBLES_CON_HOY[caso.salida_version_mayor].includes(caso.recomendacion_hoy)) {
      errores.push(`«${caso.recomendacion_hoy}» hoy no es compatible con ${SALIDAS_DE_LA_VERSION_MAYOR[caso.salida_version_mayor]} en la versión mayor.`);
    }
  } else if (caso.recomendacion_hoy !== null || caso.salida_version_mayor !== null) {
    errores.push(`Con el flujo ${caso.flujo_esperado} no hay recomendación: «recomendacion_hoy» y «salida_version_mayor» van en null.`);
  }
  if (caso.flujo_esperado === "negado_por_control" && (caso.recomendacion_hoy !== "negar" || caso.salida_version_mayor !== "negar")) {
    errores.push("Un caso negado por un control espera «negar» hoy y Negar en la versión mayor.");
  }
  if (caso.hoy_tambien_aceptable !== undefined) {
    const otras = caso.hoy_tambien_aceptable;
    if (!Array.isArray(otras) || otras.some((r) => !RECOMENDACIONES_DE_HOY.includes(r) || r === caso.recomendacion_hoy)) {
      errores.push("«hoy_tambien_aceptable» es una lista de otras recomendaciones de hoy, sin repetir la esperada.");
    } else if (otras.includes("aprobar") && caso.recomendacion_hoy === "negar" || otras.includes("negar") && caso.recomendacion_hoy === "aprobar") {
      errores.push("«hoy_tambien_aceptable» no puede saltar de aprobar a negar: eso no es un caso de borde, es un caso sin criterio.");
    }
    if (!conVeredicto && otras?.length) errores.push("Sin veredicto no hay recomendación aceptable.");
  }

  // Las afirmaciones
  const af = caso.afirmaciones;
  if (!af || typeof af !== "object") errores.push("Falta «afirmaciones».");
  else {
    const sobranAf = Object.keys(af).filter((k) => !["automaticas", "de_juicio"].includes(k));
    if (sobranAf.length) errores.push(`afirmaciones: campos de más (${sobranAf.join(", ")}).`);
    if (!Array.isArray(af.automaticas)) errores.push("afirmaciones.automaticas tiene que ser una lista.");
    else {
      af.automaticas.forEach((a, i) => validarAfirmacionAutomatica(a, i, errores));
      if (caso.flujo_esperado === "analisis_del_modelo" && af.automaticas.length === 0) errores.push("Un caso que llega al modelo lleva al menos una afirmación automática.");
      if (caso.flujo_esperado !== "analisis_del_modelo" && af.automaticas.length > 0) errores.push("Sin modelo no hay respuesta que comprobar: afirmaciones.automaticas va vacía.");
    }
    const j = af.de_juicio;
    if (!j || typeof j !== "object") errores.push("Falta afirmaciones.de_juicio.");
    else {
      if (!listaDeTextos(j.debe)) errores.push("afirmaciones.de_juicio.debe: al menos una afirmación.");
      if (!Array.isArray(j.no_debe) || !j.no_debe.every(esTexto)) errores.push("afirmaciones.de_juicio.no_debe tiene que ser una lista de textos.");
      if (caso.flujo_esperado === "analisis_del_modelo" && !listaDeTextos(j.no_debe)) errores.push("afirmaciones.de_juicio.no_debe: al menos una en un caso que llega al modelo.");
      const de_mas = Object.keys(j).filter((k) => !["debe", "no_debe"].includes(k));
      if (de_mas.length) errores.push(`afirmaciones.de_juicio: campos de más (${de_mas.join(", ")}).`);
    }
  }

  // Lo que cambió por las decisiones del 2026-11-11
  if (caso.ajustes_por_las_decisiones !== undefined) {
    if (!Array.isArray(caso.ajustes_por_las_decisiones)) errores.push("«ajustes_por_las_decisiones» tiene que ser una lista.");
    else caso.ajustes_por_las_decisiones.forEach((a, i) => {
      if (!DECISIONES_DEL_2026_11_11[a?.decision]) errores.push(`ajustes_por_las_decisiones[${i}]: decisión desconocida (${Object.keys(DECISIONES_DEL_2026_11_11).join(", ")}).`);
      if (!esTexto(a?.que_cambio)) errores.push(`ajustes_por_las_decisiones[${i}]: falta «que_cambio».`);
    });
  }

  // Un caso real no lleva nada con forma de dato personal
  if (esReal) {
    for (const [ruta, texto] of textosDe(caso)) {
      if (ruta.endsWith(".patron")) continue;
      const motivo = textoQueParecePersonal(texto);
      if (motivo) errores.push(`${ruta}: ${motivo}. Un caso real se escribe como relación, sin cifras ni nombres.`);
    }
  }
  return errores;
}

/** Lee todos los casos de la carpeta: [{ archivo, caso }] o, si un JSON no se lee, { archivo, error }. */
export function leerCasos(carpeta = CARPETA_DE_CASOS) {
  return fs.readdirSync(carpeta)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((archivo) => {
      try {
        return { archivo, caso: JSON.parse(fs.readFileSync(path.join(carpeta, archivo), "utf8")) };
      } catch (e) {
        return { archivo, error: `no es un JSON válido (${e.message})` };
      }
    });
}
