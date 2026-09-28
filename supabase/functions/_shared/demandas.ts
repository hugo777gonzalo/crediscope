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
// 1715532469, dos eran archivos de investigación y una un principio de
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
// Novadata manda algunas letras acentuadas rotas: cada una llega como dos
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
  // civiles, no de cobro (1715532469 entre ellas).
  "EJECUTIVO",
  // Decisión del negocio del 2026-09-28 (estructura-v10): también son
  // cobro "DINERO" a secas (51 personas), la insolvencia (11) y la venta con
  // reserva de dominio (8, y sus variantes de embargo, remate o aprehensión
  // del bien).
  "DINERO", "INSOLVENCIA", "RESERVA DE DOMINIO",
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
// OBLIGACIÓN y ACTA DE MEDIACIÓN; una la citó el análisis de 1308725470
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
const NO_ES_COBRO = /\bDIVORCIO\b|\bDANO MORAL\b|\bALIMENT|\bPENSION\b|\bSILENCIO ADMINISTRATIVO\b|\bDEVOLUCION DE GARANTIA\b|\bDECRETO EJECUTIVO\b|\bCONFESION\b/;
const PLURALES_DE_COBRO = ["FACTURAS", "CHEQUES", "PRENDARIO", "PRENDARIOS", "PAGARES", "LETRAS DE CAMBIO"];
const PATRONES_DE_COBRO = [...new Set([...PALABRAS_CLAVE_DE_COBRO, ...PLURALES_DE_COBRO].map(sinTildes))].map(
  (kw) => new RegExp(`(^|[^A-Z0-9])${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Z0-9]|$)`)
);

// Hasta estructura-v10 se llamaba esDemandaProblemaCrediticio y vivía en
// process.ts. Desde v11 las tildes rotas se reparan antes de comparar:
// "PAGAR��" no coincidía con PAGARÉ.
export function esDemandaDeCobro(delito: unknown): boolean {
  if (!delito) return false;
  const texto = normalizado(delito);
  if (NO_ES_COBRO.test(texto)) return false;
  return PATRONES_DE_COBRO.some((p) => p.test(texto));
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
  ["Tránsito", /\bTRANSITO\b|\bCHOQUE|ACCIDENTE|EMBRIAGUEZ|SIN LICENCIA|DANOS MATERIALES|ATROPELL|\bVEHICULO|BOLETA/],
  ["Constitucional o administrativa", /ACCION (EXTRAORDINARIA )?DE PROTECCION|HABEAS|ACCESO A LA INFORMACION/],
  ["Trámite (no es una demanda)", /DEPRECATORIO|REQUERIMIENTO|NOTIFICACION|CONFESION|DILIGENCIA|EXHIBICION|RECONOCIMIENTO DE FIRMA|EXHORTO|APERTURA DE|PROTOCOLIZACION|RECUSACION|MEDIDAS? CAUTELAR|INSPECCION|AUTORIZACION|\bOFICIO\b|CONFLICTO DE COMPETENCIA/],
  ["Delito contra el patrimonio", /ESTAFA|\bROBO\b|\bHURTO\b|ABUSO DE CONFIANZA|DEFRAUDACION|FALSIFICACION|DOCUMENTO FALSO|APROPIACION|RECEPTACION|\bUSURA\b|\bLAVADO\b|PECULADO|COHECHO|ENRIQUECIMIENTO|ALZAMIENTO|USURPACION|DESPOJO|ENGANO AL COMPRADOR/],
  ["Otro delito o contravención", /LESIONES|CALUMNIA|INTIMIDACION|VIOLENCIA|AGRESION|INJURI|AMENAZA|HOMICIDIO|ASESINATO|MUERTE CULPOSA|CONTRA LA VIDA|\bMUERTE\b(?! PRESUNTA)|VIOLACION|ABUSO SEXUAL|ACOSO|SECUESTRO|EXTORSION|TRAFICO|ESTUPEFACIENTES|\bARMAS\b|DELINCUENCIA ORGANIZADA|ASOCIACION ILICITA|ARTICULOS PROHIBIDOS|RESISTENCIA|RECISTENCIA|MALTRA|DANO A BIEN|INCUMPLIMIENTO DE DECISIONES|CONTRAVENCION|ESCANDALO|\bRINA\b/],
  ["Familia", /ALIMENT|DIVORCIO|VISITAS|TENENCIA|PATERNIDAD|UNION DE HECHO|SOCIEDAD CONYUGAL|INVENTARIO|PARTICION|PATRIA POTESTAD|MUJER EMBARAZADA|CUSTODIA|CURADURIA|INTERDICCION|MATRIMONIO/],
  ["Laboral", /HABERES|LABORAL|DESPIDO|VISTO BUENO|FINIQUITO|JUBILACION/],
  ["Propiedad e inmuebles", /PRESCRIPCION|DOMINIO|POSESORIO|REIVINDICACION|REINVINDICACION|INSCRIPCION|ARRENDAMIENTO|ARRENDADOR|DESAHUCIO|EXPROPIACION|SERVIDUMBRE|LINDEROS|NULIDAD DE (INSTRUMENTO|CONTRATO|ESCRITURA)|TERMINACION DE CONTRATO|DIVISION|DEMARCACION|PROPIEDAD|INVASION/],
  ["Constitucional o administrativa", /CONTENCIOSO|SUBJETIVO|OBJETIVO|NULIDAD DE SENTENCIA|IMPUGNACION|SILENCIO ADMINISTRATIVO|CONTRA RESOLUCIONES/],
  ["Daños y perjuicios", /DANOS Y PERJUICIOS|DANO MORAL|INDEMNIZACION/],
];

export function categoriaDeDemanda(delito: unknown): string {
  if (esDemandaDeCobro(delito)) return CATEGORIA_COBRO;
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
// de cada registro de la fuente.
export function demandasPorCategoria(demandas: AnyRecord[], delitoDe: (d: AnyRecord) => unknown): DemandasDeUnaCategoria[] {
  const grupos = new Map<string, { cantidad: number; tipos: Set<string> }>();
  for (const d of demandas) {
    const delito = delitoDe(d);
    const categoria = categoriaDeDemanda(delito);
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
