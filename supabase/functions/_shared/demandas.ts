// Las demandas judiciales en contra de la persona: cuáles son de cobro, de
// qué categoría es cada una y cómo se lee su tipo. Lo usa el perfil
// (process.ts), y de ahí la pantalla y el modelo: una sola lectura.
//
// POR QUÉ CATEGORÍAS (estructura-v11, 2026-09-28, aprobado por el negocio)
//
// La Función Judicial rotula cada demanda con un texto libre: en la cartera
// hay 615 textos distintos en 4.602 demandas, y los 100 más comunes cubren
// sólo el 80%. Traen el número de artículo del COIP y numerales ("298
// DEFRAUDACIÓN TRIBUTARIA, NUM. 1", "EJECUTIVO ART. 413 C.P.C."). El modelo
// los repetía tal cual. Y el conteo de "demandas civiles" mezclaba juicios
// con investigaciones penales que se cerraron sin cargos (300), trámites que
// no son demandas (187) y tránsito (277): de las 8 "demandas civiles" de
// c-2a50c228, dos eran archivos de investigación y una un principio de
// oportunidad, y se leían como negativos.
//
// Ahora cada demanda cae en una categoría de un catálogo cerrado. El modelo
// recibe cuántas hay de cada una, y el analista ve la categoría con el tipo
// ya legible. Medido sobre la cartera, el catálogo cubre el 89% de las
// demandas; el resto son nombres de procedimiento sin tema ("OTROS",
// "VERBAL SUMARIO", "ORDINARIO") y quedan como "Otras".

type AnyRecord = Record<string, unknown>;

// ---- Texto ----
//
// Proveedor_Info_1 manda algunas letras acentuadas rotas: cada una llega como dos
// caracteres de reemplazo (U+FFFD), y la letra original se perdió
// ("TR��NSITO"). En la cartera son 22 demandas y 11 palabras, todas
// conocidas: casi todas terminan en "-CIÓN", y hay cuatro sueltas.
const PALABRAS_ROTAS: Array<[RegExp, string]> = [
  [/CI�+N\b/g, "CIÓN"],
  [/TR�+NSITO/g, "TRÁNSITO"],
  [/PAGAR�+/g, "PAGARÉ"],
  [/CURADUR�+A/g, "CURADURÍA"],
  [/VEH�+CULO/g, "VEHÍCULO"],
];

export function repararTexto(texto: string): string {
  let reparado = texto;
  for (const [rota, bien] of PALABRAS_ROTAS) reparado = reparado.replace(rota, bien);
  // Una palabra rota que todavía no está en la lista: se marca, no se
  // inventa la letra.
  return reparado.replace(/�+/g, "?");
}

// Sin tildes y en mayúsculas, para comparar palabras.
function sinTildes(s: string): string {
  return s.toUpperCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// Con los espacios colapsados: la fuente a veces separa las palabras con
// dos ("PRIVACIÓN  O  PÉRDIDA  JUDICIAL  DE  LA  PATRIA  POTESTAD") y ni la
// categoría ni el cobro coincidían.
function normalizado(delito: unknown): string {
  return sinTildes(repararTexto(String(delito ?? ""))).replace(/\s+/g, " ").trim();
}

// El tipo de una demanda como se lee: sin el número de artículo del COIP ni
// las referencias que la Función Judicial le pega ("ART. 413 C.P.C.",
// "INC.1, NUM. 6", "LITERAL J"), y en minúsculas con mayúscula inicial.
// "298 DEFRAUDACIÓN TRIBUTARIA, NUM. 1" -> "Defraudación tributaria".
export function tipoDeDemandaLegible(delito: unknown): string | null {
  if (!delito) return null;
  let t = repararTexto(String(delito)).toUpperCase().trim();
  t = t.replace(/^\d+\s*(NUM\.?\s*\d+\)?\s*)?/, "");
  // La referencia también puede venir entre paréntesis: "TRANSACCIÓN
  // EXTRAJUDICIAL (ART. 347 COGEP)".
  t = t.replace(/[\s,(]+(ARTS?\.?\s*\d|ART[IÍ]CULOS?\s*\d|INC\.?\s*\d|NUM\.?\s*\d|NUMERAL\s*\d|LITERAL\s+[A-Z]\b).*$/, "");
  t = t.replace(/\s+/g, " ").replace(/[\s.,;:-]+$/, "").trim();
  if (!t) return null;
  const minusculas = t.toLowerCase();
  return minusculas.charAt(0).toUpperCase() + minusculas.slice(1);
}

// ---- Cobro ----
//
// Unión deduplicada de las 3 listas de palabras clave del pedido de negocio.
const PALABRAS_CLAVE_DE_COBRO = [
  "COBRO DE PAGARÉ A LA ORDEN", "PAGARÉ", "PAGARE", "COBRO DE DINERO", "PAGO DE DINERO",
  "COBRO DE CHEQUE", "CHEQUE", "CHEQUE PRESENTADO AL COBRO FUERA DE PLAZO",
  "COBRO DE LETRA DE CAMBIO", "LETRA DE CAMBIO", "CONTRATO DE MUTUO", "PRÉSTAMO", "PRESTAMO",
  "OBLIGACIONES", "OBLIGACIÓN", "OBLIGACIONES MONETARIAS", "FACTURAS O DOCUMENTOS", "DOCUMENTOS",
  "COBRO DE FACTURAS", "CONCURSO DE ACREEDORES", "ACREEDOR", "EJECUCIÓN DE ACTA DE MEDIACIÓN",
  "EJECUCIÓN DE ACTA DE TRANSACCIÓN", "TRANSACCIÓN", "ACTA DE MEDIACIÓN", "TÍTULO EJECUTIVO",
  "EJECUCIÓN", "COBRO", "JUICIO EJECUTIVO", "PROCESO EJECUTIVO", "VÍA EJECUTIVA",
  // "EJECUTIVO" a secas es como la Función Judicial rotula el juicio
  // ejecutivo -- el cobro de un título: pagaré, letra, cheque -- ("EJECUTIVO",
  // "EJECUTIVO ART. 413 C.P.C."). Hasta estructura-v8 sólo entraban las
  // formas largas y 17 personas con juicio ejecutivo figuraban con demandas
  // civiles, no de cobro (c-2a50c228 entre ellas).
  "EJECUTIVO",
  // Decisión del negocio del 2026-09-28 (estructura-v10): también son
  // cobro "DINERO" a secas (51 personas), la insolvencia (11) y la venta con
  // reserva de dominio (8, y sus variantes de embargo, remate o aprehensión
  // del bien).
  "DINERO", "INSOLVENCIA", "RESERVA DE DOMINIO",
  // Decisión del negocio del 2026-09-29 (estructura-v12), viendo los casos
  // de la cartera que quedaban en "Otras": el embargo (5, tres de bancos o
  // financieras), la aprehensión del bien (6, cuatro de quienes venden o
  // financian autos: la recuperación de lo vendido a plazos) y los vales de
  // tarjeta de crédito (2, de emisoras de tarjeta). La aprehensión de un
  // auto que circula sin matrícula es de tránsito: se excluye abajo.
  "EMBARGO", "APREHENSIÓN", "VALES", "TARJETA DE CRÉDITO",
  "PROCEDIMIENTO EJECUTIVO", "MANDAMIENTO DE EJECUCIÓN", "LIQUIDACIÓN", "APREMIO",
  "INCUMPLIMIENTO", "MORA", "MOROSIDAD", "DEUDA", "OBLIGACIÓN VENCIDA", "OBLIGACIÓN EXIGIBLE",
  "COBRO JUDICIAL", "RECUPERACIÓN DE CARTERA", "CARTERA VENCIDA", "TÍTULO VALOR", "FACTURA",
  "FACTURA COMERCIAL", "FACTURA NEGOCIABLE", "MUTUO", "CONTRATO DE PRÉSTAMO",
  "RECONOCIMIENTO DE DEUDA", "CONVENIO DE PAGO", "DOCUMENTO PRIVADO", "DOCUMENTO RECONOCIDO",
  "GARANTÍA", "FIANZA", "AVAL", "HIPOTECA", "PRENDA",
];

// Hasta estructura-v7 se buscaban las palabras clave como SUBCADENAS, y
// medido sobre la cartera el 2026-09-27 entraban como crediticias ~37
// demandas que no lo son: "divorcio por mutuo consentimiento" (17, por
// MUTUO), "daño moral" (11, MORAL contiene MORA), "ejecución por silencio
// administrativo" (7, por EJECUCIÓN) y dos de pensión alimenticia (por
// OBLIGACIÓN y ACTA DE MEDIACIÓN; una la citó el análisis de c-3293f7eb
// como "demanda crediticia"). Ahora se buscan palabras completas, y lo de
// familia, daño moral y actos administrativos queda afuera aunque
// contenga una palabra clave. "Incumplimiento de contrato" y "cobro de
// honorarios" SÍ son crediticias (decisión del negocio).
//
// Con palabras completas los plurales dejaron de entrar ("FACTURAS",
// "CHEQUES", "CONTRATOS PRENDARIOS": 16 demandas que sí son crediticias)
// y se agregan explícitos -- no con una S opcional, que devolvía "PRENDAS
// DE VESTIR". Sin tildes, "DEVOLUCIÓN DE GARANTÍA" empezaba a coincidir
// con GARANTÍA; es devolver un depósito, no un crédito impago, y se
// excluye.
// "DECRETO EJECUTIVO" es un acto del Presidente, no un cobro: con EJECUTIVO
// como palabra clave entraría si alguna vez se impugna uno. La confesión
// judicial no es cobro aunque prepare uno (decisión del negocio del
// 2026-09-28): se excluye explícita por si una variante trae "DINERO".
// "APREHENSIÓN DEL AUTOMOTOR POR ... CIRCULAR ... SIN POSEER LA MATRÍCULA
// VIGENTE" (2 en la cartera, de 2025) es una sanción de tránsito, no la
// recuperación de un bien impago (estructura-v12).
const NO_ES_COBRO = /\bDIVORCIO\b|\bDANO MORAL\b|\bALIMENT|\bPENSION\b|\bSILENCIO ADMINISTRATIVO\b|\bDEVOLUCION DE GARANTIA\b|\bDECRETO EJECUTIVO\b|\bCONFESION\b|\bMATRICULA\b/;
const PLURALES_DE_COBRO = ["FACTURAS", "CHEQUES", "PRENDARIO", "PRENDARIOS", "PAGARES", "LETRAS DE CAMBIO", "EMBARGOS", "TARJETAS DE CRÉDITO"];
const PATRONES_DE_COBRO = [...new Set([...PALABRAS_CLAVE_DE_COBRO, ...PLURALES_DE_COBRO].map(sinTildes))].map(
  (kw) => new RegExp(`(^|[^A-Z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`)
);

// ---- Quién demanda ----
//
// Decisión del negocio del 2026-09-29 (estructura-v12): cuando el tipo no
// dice el tema -- es el nombre del procedimiento ("OTROS", "ESPECIAL",
// "VERBAL SUMARIO") o no hay tipo -- y demanda un banco, una cooperativa de
// ahorro y crédito, una mutualista, una financiera o una emisora de
// tarjetas, es cobro. De las 299 demandas de la cartera que quedaban en
// "Otras", 29 las había presentado una institución financiera. Con un tipo
// que sí dice el tema ("PROMESA DE VENTA", "NULIDAD DE LAUDO ARBITRAL")
// decide el tipo, aunque demande un banco.
const TIPOS_SIN_TEMA = new Set([
  "", "OTROS", "OTRO", "VARIOS", "GENERAL", "SOLICITUD", "ESPECIAL", "ORDINARIO", "VERBAL SUMARIO", "SUMARIO",
  "ORAL", "LAS ORDENADAS POR LEY", "COMERCIALES", "ASUNTOS DE COMERCIO QUE NO TIENEN TRAMITE ESPECIAL", "INFIMA CUANTIA",
]);
// Quién demanda es texto libre: el nombre de la institución junto con el de
// sus abogados ("... PROCURADORES JUDICIALES DEL BANCO DEL PICHINCHA C.A.").
// La cooperativa se reconoce por "ahorro" o "crédito" en el nombre, con las
// erratas de la fuente ("COOPERATIVA D AHORRO", "DE HORRO Y CREDITO"). Las
// de transporte o de producción no son financieras, y las que no dicen
// "ahorro y crédito" en el nombre (ILALÓ, SANTA ROSA) no se reconocen.
const INSTITUCION_FINANCIERA = new RegExp(
  [
    "\\bBANCO\\b", "\\bCOOPERATIVA\\b[^,;]{0,12}\\b(AHORRO|HORRO|CREDITO)\\b", "\\bCOAC\\b", "\\bMUTUALISTA\\b",
    "\\bFINANCIERA\\b", "\\bCAJA DE AHORRO", "\\bCMAC\\b", "\\bGMAC\\b", "\\bACCEPTANCE\\b", "\\bCFN\\b", "\\bBIESS\\b",
    "\\bDINERS\\b", "\\bINTERDIN\\b", "\\bPACIFICARD\\b", "\\bAMERICAN EXPRESS\\b", "\\bTARJETAS? DE CREDITO\\b",
  ].join("|"),
);

function esTipoSinTema(delito: unknown): boolean {
  return TIPOS_SIN_TEMA.has(normalizado(tipoDeDemandaLegible(delito) ?? ""));
}

// Quién presentó una demanda de cobro (p5 de la revisión del análisis,
// estructura-v21): el marco la lee distinto si demanda un banco o una
// cooperativa (una deuda con el sistema financiero) que si demanda una casa
// comercial o un particular. La institución financiera es la misma lista de
// arriba; una empresa, por su forma o su giro en el nombre; lo demás, una
// persona. Sin demandante, null: no se sabe.
export type QuienDemanda = "institucion_financiera" | "empresa" | "persona";
const EMPRESA =
  /\bS\.? ?A\.?(?=\s|$|,)|\bC\.? ?A\.?(?=\s|$|,)|\bS\.?A\.?S\b|\bCIA\b|\bLTDA\b|\bCOMPANIA\b|\bCORPORACION\b|\bCOMERCIAL\b|\bCOMERCIALIZADORA\b|\bEMPRESA\b|\bIMPORTADORA\b|\bDISTRIBUIDORA\b|\bINDUSTRIA|\bGRUPO\b|\bSOCIEDAD\b|\bFUNDACION\b|\bASOCIACION\b|\bCOOPERATIVA\b|\bINSTITUTO\b|\bUNIVERSIDAD\b|\bUNIDAD EDUCATIVA\b|\bMUNICIPIO\b|\bGAD\b|\bMINISTERIO\b|\bSERVICIO DE RENTAS\b|\bIESS\b|\bCNEL\b|\bCONAFIPS\b/;

export function quienDemanda(demandante: unknown): QuienDemanda | null {
  const texto = normalizado(demandante);
  if (!texto) return null;
  if (INSTITUCION_FINANCIERA.test(texto)) return "institucion_financiera";
  return EMPRESA.test(texto) ? "empresa" : "persona";
}

// El año de una demanda; la fecha llega en milisegundos a la medianoche de
// Ecuador (UTC-5). null = sin fecha.
export function anioDeLaDemanda(fecha: unknown): number | null {
  const ms = typeof fecha === "number" ? fecha : Number.NaN;
  if (!Number.isFinite(ms)) return null;
  return new Date(ms - 5 * 3600 * 1000).getUTCFullYear();
}

// De cobro sólo por quién la presentó: el tipo no lo dice.
export function esCobroPorQuienDemanda(delito: unknown, demandante: unknown): boolean {
  return esTipoSinTema(delito) && INSTITUCION_FINANCIERA.test(normalizado(demandante));
}

// Hasta estructura-v10 se llamaba esDemandaProblemaCrediticio y vivía en
// process.ts. Desde v11 las tildes rotas se reparan antes de comparar:
// "PAGAR��" no coincidía con PAGARÉ. Desde v12 también cuenta quién demanda
// (arriba); sin demandante decide sólo el tipo.
export function esDemandaDeCobro(delito: unknown, demandante?: unknown): boolean {
  const texto = normalizado(delito);
  if (texto && !NO_ES_COBRO.test(texto) && PATRONES_DE_COBRO.some((p) => p.test(texto))) return true;
  return esCobroPorQuienDemanda(delito, demandante);
}

// El tipo de una demanda de cobro como se lee. Bajo "Demandas de cobro",
// "Otros" a secas no dice nada: si es de cobro por quién la presentó, se
// aclara.
export function tipoDeCobroLegible(delito: unknown, demandante?: unknown): string | null {
  if (esCobroPorQuienDemanda(delito, demandante)) {
    return `${tipoDeDemandaLegible(delito) ?? "Sin tipo"} (demanda de una institución financiera)`;
  }
  return tipoDeDemandaLegible(delito);
}

// ---- Categorías ----
//
// El orden importa: gana la primera que coincide. Las investigaciones
// cerradas van antes que los delitos ("archivo de la investigación previa"
// de un robo no es un robo), el tránsito antes que los delitos ("lesiones
// causadas por accidente de tránsito", "contravenciones de tránsito") y los
// delitos antes que familia ("tenencia y porte de armas" no es la tenencia
// de un hijo). La de cobro se decide antes, con esDemandaDeCobro.
export const CATEGORIA_COBRO = "Cobro de deudas";
export const CATEGORIA_OTRAS = "Otras";
// "Constitucional o administrativa" aparece dos veces: las acciones
// constitucionales, que no se confunden con nada, van antes que los
// trámites ("ACCIÓN DE PROTECCIÓN CON MEDIDA CAUTELAR" es una acción de
// protección, no una medida cautelar); lo genérico ("IMPUGNACIÓN") va al
// final, después de familia y laboral ("impugnación de paternidad",
// "impugnación del acta de finiquito").
const CATEGORIAS: Array<[nombre: string, patron: RegExp]> = [
  ["Investigación penal cerrada sin cargos", /\bARCHIVO\b|DESESTIMACION|PRINCIPIO DE OPORTUNIDAD|SOBRESEIMIENTO|EXTINCION DE LA ACCION/],
  ["Tránsito", /\bTRANSITO\b|\bCHOQUE|ACCIDENTE|EMBRIAGUEZ|SIN LICENCIA|DANOS MATERIALES|ATROPELL|\bVEHICULO|BOLETA|\bMATRICULA\b/],
  ["Constitucional o administrativa", /ACCION (EXTRAORDINARIA )?DE PROTECCION|HABEAS|ACCESO A LA INFORMACION/],
  ["Trámite (no es una demanda)", /DEPRECATORIO|REQUERIMIENTO|NOTIFICACION|CONFESION|DILIGENCIA|EXHIBICION|RECONOCIMIENTO DE FIRMA|EXHORTO|APERTURA DE|PROTOCOLIZACION|RECUSACION|MEDIDAS? CAUTELAR|INSPECCION|AUTORIZACION|\bOFICIO\b|CONFLICTO DE COMPETENCIA/],
  ["Delito contra el patrimonio", /ESTAFA|\bROBO\b|\bHURTO\b|ABUSO DE CONFIANZA|DEFRAUDACION|FALSIFICACION|DOCUMENTO FALSO|APROPIACION|RECEPTACION|\bUSURA\b|\bLAVADO\b|PECULADO|COHECHO|ENRIQUECIMIENTO|ALZAMIENTO|USURPACION|DESPOJO|ENGANO AL COMPRADOR/],
  ["Otro delito o contravención", /LESIONES|CALUMNIA|INTIMIDACION|VIOLENCIA|AGRESION|INJURI|AMENAZA|HOMICIDIO|ASESINATO|MUERTE CULPOSA|CONTRA LA VIDA|\bMUERTE\b(?! PRESUNTA)|VIOLACION|ABUSO SEXUAL|ACOSO|SECUESTRO|EXTORSION|TRAFICO|ESTUPEFACIENTES|\bARMAS\b|DELINCUENCIA ORGANIZADA|ASOCIACION ILICITA|ARTICULOS PROHIBIDOS|RESISTENCIA|RECISTENCIA|MALTRA|DANO A BIEN|INCUMPLIMIENTO DE DECISIONES|CONTRAVENCION|ESCANDALO|\bRINA\b/],
  ["Familia", /ALIMENT|DIVORCIO|VISITAS|TENENCIA|PATERNIDAD|UNION DE HECHO|SOCIEDAD CONYUGAL|INVENTARIO|PARTICION|PATRIA POTESTAD|MUJER EMBARAZADA|CUSTODIA|CURADURIA|INTERDICCION|MATRIMONIO/],
  ["Laboral", /HABERES|LABORAL|DESPIDO|VISTO BUENO|FINIQUITO|JUBILACION/],
  // La lesión enorme sólo se alega en la venta de un inmueble (estructura-v12).
  ["Propiedad e inmuebles", /PRESCRIPCION|DOMINIO|POSESORIO|REIVINDICACION|REINVINDICACION|INSCRIPCION|ARRENDAMIENTO|ARRENDADOR|DESAHUCIO|EXPROPIACION|SERVIDUMBRE|LINDEROS|NULIDAD DE (INSTRUMENTO|CONTRATO|ESCRITURA)|TERMINACION DE CONTRATO|DIVISION|DEMARCACION|PROPIEDAD|INVASION|LESION ENORME/],
  ["Constitucional o administrativa", /CONTENCIOSO|SUBJETIVO|OBJETIVO|NULIDAD DE SENTENCIA|IMPUGNACION|SILENCIO ADMINISTRATIVO|CONTRA RESOLUCIONES/],
  ["Daños y perjuicios", /DANOS Y PERJUICIOS|DANO MORAL|INDEMNIZACION/],
];

export function categoriaDeDemanda(delito: unknown, demandante?: unknown): string {
  if (esDemandaDeCobro(delito, demandante)) return CATEGORIA_COBRO;
  const texto = normalizado(delito);
  return CATEGORIAS.find(([, patron]) => patron.test(texto))?.[0] ?? CATEGORIA_OTRAS;
}

export interface DemandasDeUnaCategoria {
  categoria: string;
  cantidad: number;
  tipos: string[];
}

// Las demandas agrupadas por categoría, de la que más tiene a la que menos,
// con los tipos legibles de cada una (sin repetir). `delitoDe` saca el texto
// de cada registro de la fuente, y `demandanteDe`, quién la presentó.
export function demandasPorCategoria(
  demandas: AnyRecord[],
  delitoDe: (d: AnyRecord) => unknown,
  demandanteDe: (d: AnyRecord) => unknown = () => undefined,
): DemandasDeUnaCategoria[] {
  const grupos = new Map<string, { cantidad: number; tipos: Set<string> }>();
  for (const d of demandas) {
    const delito = delitoDe(d);
    const categoria = categoriaDeDemanda(delito, demandanteDe(d));
    const grupo = grupos.get(categoria) ?? { cantidad: 0, tipos: new Set<string>() };
    grupo.cantidad++;
    const tipo = tipoDeDemandaLegible(delito);
    if (tipo) grupo.tipos.add(tipo);
    grupos.set(categoria, grupo);
  }
  return [...grupos.entries()]
    .map(([categoria, g]) => ({ categoria, cantidad: g.cantidad, tipos: [...g.tipos] }))
    .sort((a, b) => b.cantidad - a.cantidad || a.categoria.localeCompare(b.categoria));
}

// ---- ¿La persona es la demandada? ----
//
// Proveedor_Info_1 trae de la Función Judicial las demandas que encuentra por
// el NOMBRE, no por la cédula: el campo `demandado` es texto libre con todos
// los procesados de la causa, a veces separados por comas y a veces sólo por
// espacios, con sus abogados en el medio ("... DEF PART AB. ..."). Hasta
// estructura-v19 el bloqueo por delitos de seguridad ciudadana tomaba toda
// demanda de esa fuente. En la revisión del análisis del 2026-11-06, de 33
// personas bloqueadas por una demanda, en 8 el demandado era otra persona
// (c-14f9ee80, confirmado a mano: comparte un apellido con un procesado y
// el primer nombre con otro), en 1 tenía los apellidos en otro orden y en 2
// no había un nombre que cotejar. Salían con score 1 y «negar».
//
// Decisión del negocio (2026-11-08, p1 de la revisión): la demanda es de la
// persona sólo si UN MISMO demandado lleva sus dos apellidos juntos y su
// primer nombre. Repartidos entre varios demandados no valen, ni tomados del
// abogado o de quien demanda (`ofendido`, que acá no se mira).
//
// "Un mismo demandado", cuando la fuente no los separa, es una secuencia
// seguida: los dos apellidos y enseguida el primer nombre (como los escribe
// el Registro Civil), o el primer nombre, a lo sumo otro nombre, y los dos
// apellidos ("JUAN CARLOS PEREZ LOPEZ"). En una lista pegada
// ("PEREZ LOPEZ MARIA GOMEZ RUIZ JUAN ...") el primer nombre suelto en
// cualquier lugar del texto era casi siempre de otro.
//
// Lo que no coincide queda como aviso para verificar, nunca como delito propio:
//   - apellidos_invertidos: mismos nombres con los apellidos en otro orden. En
//     Ecuador el orden es paterno y materno, y el orden invertido es otra
//     filiación: lo más probable es otra persona, aunque puede ser un error de
//     tipeo del juzgado. Un bloqueo es score 1 y «negar» sin análisis: no se
//     funda en una coincidencia que hay que interpretar. Se avisa aparte para
//     que el analista lo mire primero.
//   - sin_demandado: la fuente no dice a quién se demanda. La única relación con
//     la persona es que la fuente la encontró por el nombre, la misma que tienen
//     los homónimos; sin dato no hay hecho que bloquee (como las denuncias sin
//     su cédula, denuncias.ts).
//   - sin_nombre: no se pudo leer el nombre de la persona. La identidad es una
//     fuente obligatoria: sin ella la consulta queda incompleta y se frena hasta
//     reconsultar (calidad-de-la-consulta.ts), en vez de negar con un bloqueo
//     que no se pudo cotejar.
export type CotejoDelDemandado = "es_la_persona" | "apellidos_invertidos" | "otra_persona" | "sin_demandado" | "sin_nombre";

// Las partículas de un apellido o un nombre compuesto van pegadas a la palabra
// que sigue: "DE LA TORRE" es un apellido, y "MARIA DE LOS ANGELES", un nombre
// y su segundo. Contadas por separado, "DE LA TORRE VASQUEZ JUAN" daba como
// apellidos "DE LA" y como primer nombre "TORRE".
const PARTICULAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "DA", "DAS", "DO", "DOS", "DI", "VAN", "VON", "SAN", "SANTA"]);

// Lo que antecede al nombre de un abogado o un defensor. "AB." llega como "AB"
// porque se quita la puntuación. La Defensoría Pública no está: es una
// institución, y lo que la sigue suele ser el nombre de su defendido.
const ANTES_DE_UN_ABOGADO = new Set([
  "AB", "ABG", "ABOG", "ABOGADO", "ABOGADA", "DR", "DRA", "DOCTOR", "DOCTORA", "DEF", "DEFENSOR", "DEFENSORA",
  "PROCURADOR", "PROCURADORA", "PATROCINADOR", "PATROCINADORA",
]);

// Una letra rota de la fuente (repararTexto la deja como "?") vale por
// cualquier letra al comparar.
function palabraNormalizada(texto: string): string {
  return sinTildes(repararTexto(texto.replace(/Ã‘/g, "Ñ"))).replace(/[^A-Z? ]+/g, " ");
}

// Las palabras de un nombre, con las partículas pegadas a la siguiente.
function gruposDelNombre(texto: string): string[] {
  const palabras = palabraNormalizada(texto).split(/\s+/).filter(Boolean);
  const grupos: string[] = [];
  let pendiente: string[] = [];
  for (const p of palabras) {
    if (PARTICULAS.has(p)) {
      pendiente.push(p);
      continue;
    }
    // "DEL AB." es «del abogado»: la partícula no se pega a la marca, o la
    // marca deja de reconocerse.
    if (ANTES_DE_UN_ABOGADO.has(p)) grupos.push(...pendiente, p);
    else grupos.push([...pendiente, p].join(" "));
    pendiente = [];
  }
  if (pendiente.length) grupos.push(pendiente.join(" "));
  return grupos;
}

// Cada demandado o lista de demandados, separados por lo que la fuente usa
// para separarlos: coma, punto y coma, barra, paréntesis o la «Y» suelta.
function tramosDelDemandado(demandado: string): string[][] {
  return sinTildes(repararTexto(demandado.replace(/Ã‘/g, "Ñ")))
    .split(/[,;/()[\]|]|\bY\b/)
    .map(gruposDelNombre)
    .filter((t) => t.length > 0);
}

function mismoGrupo(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a.includes("?") && !b.includes("?")) return false;
  const comodin = (x: string) => new RegExp(`^${x.replace(/\?+/g, "[A-Z]")}$`);
  return comodin(a).test(b) || comodin(b).test(a);
}

// ¿La secuencia está seguida en el tramo, sin ser el nombre de un abogado?
function apareceSeguida(tramo: string[], secuencia: (string | null)[]): boolean {
  for (let i = 0; i + secuencia.length <= tramo.length; i++) {
    // null = cualquier nombre (el segundo nombre, que puede faltar o no).
    if (!secuencia.every((s, j) => s === null || mismoGrupo(tramo[i + j], s))) continue;
    if (ANTES_DE_UN_ABOGADO.has(tramo[i - 1] ?? "") || ANTES_DE_UN_ABOGADO.has(tramo[i - 2] ?? "")) continue;
    return true;
  }
  return false;
}

function llevaElNombre(tramos: string[][], apellido1: string, apellido2: string, primerNombre: string | undefined): boolean {
  const formas: (string | null)[][] = primerNombre
    ? [[apellido1, apellido2, primerNombre], [primerNombre, apellido1, apellido2], [primerNombre, null, apellido1, apellido2]]
    : [[apellido1, apellido2]];
  return tramos.some((tramo) => formas.some((forma) => apareceSeguida(tramo, forma)));
}

// `nombreDeLaPersona` como lo da la identidad: APELLIDO1 APELLIDO2 NOMBRE1
// [NOMBRE2].
export function cotejarDemandado(demandado: unknown, nombreDeLaPersona: unknown): CotejoDelDemandado {
  const persona = gruposDelNombre(String(nombreDeLaPersona ?? ""));
  if (persona.length < 2) return "sin_nombre";
  const tramos = tramosDelDemandado(String(demandado ?? ""));
  if (tramos.length === 0) return "sin_demandado";
  const [apellido1, apellido2, primerNombre] = persona;
  if (llevaElNombre(tramos, apellido1, apellido2, primerNombre)) return "es_la_persona";
  if (apellido1 !== apellido2 && llevaElNombre(tramos, apellido2, apellido1, primerNombre)) return "apellidos_invertidos";
  return "otra_persona";
}
