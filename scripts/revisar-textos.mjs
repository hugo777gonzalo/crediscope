// Control de textos de pantalla: aplica el glosario del negocio a todo lo que
// un analista lee en CrediScope. Lo usa la habilidad `revision-ux`.
//
//   node scripts/revisar-textos.mjs                     revisa todo src/
//   node scripts/revisar-textos.mjs --archivo=src/pages/Costos.jsx
//   node scripts/revisar-textos.mjs --estricto          las advertencias también cortan (exit 1)
//   node scripts/revisar-textos.mjs --inventario        vuelca todos los textos, uno por línea
//   node scripts/revisar-textos.mjs --glosario          lista las reglas y por qué existen
//   node scripts/revisar-textos.mjs --explicativos --archivo=src/pages/X.jsx
//                                                       los textos que explican (párrafos bajo un
//                                                       título, ayudas ⓘ, title) de una pantalla,
//                                                       para revisarlos uno por uno
//
// Sale con 1 si hay un error (una palabra que el negocio retiró o una regla de
// la casa rota). Las ADVERTENCIAS son lo que casi siempre está mal pero admite
// excepciones: se miran, no cortan.
//
// Una excepción justificada se marca en el código, en la misma línea o en la
// anterior:   // revisar-textos: permitir <id-de-la-regla> -- por qué
//
// Por qué un analizador y no un grep: el 2026-10-10 un grep de términos sobre
// src/ devolvió 569 coincidencias y casi ninguna era un texto de pantalla
// (comentarios, clases de CSS, rutas). Acá sólo se miran los textos que se
// dibujan: ver scripts/lib/textos-de-pantalla.mjs.

import fs from "node:fs";
import path from "node:path";
import { todosLosTextos, textosDeArchivo, archivosDePantalla, parrafosBajoTitulos } from "./lib/textos-de-pantalla.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");

// nivel: "error" corta; "aviso" se mira.
// El orden importa sólo para la lectura del informe.
export const REGLAS = [
  // ---- Palabras que el negocio retiró (CLAUDE.md, "Cómo se escribe")
  // El nombre anterior del proveedor se arma partido: el control no puede ser quien lo vuelva a escribir en el repositorio.
  { id: "proveedor-anterior", nivel: "error", patron: new RegExp("nova" + "data", "i"), motivo: "El proveedor se llama Proveedor_Info_1 (contrato, 2026-10-31); el nombre anterior no vuelve a ninguna pantalla.", cambiar: "Proveedor_Info_1" },
  { id: "asalariado", nivel: "error", patron: /\basalariad[oa]s?\b/i, motivo: "En el negocio se dice «dependiente» (relación de dependencia). El negocio lo corrigió el 2026-09-25.", cambiar: "dependiente" },
  { id: "piso", nivel: "error", patron: /\bpisos?\b/i, motivo: "«Piso» no se usa en Ecuador. Es «ingreso reportado al IESS» y, si es el SBU o está a ±5%, «Ingreso Mínimo SBU» (esIngresoMinimoSbu).", cambiar: "ingreso reportado al IESS / mínimo" },
  { id: "retroalimentacion", nivel: "error", patron: /\bretroalimentaci[oó]n\b/i, permitir: /retirad[oa]|anterior/i, motivo: "El Laboratorio reemplazó a Retroalimentación el 2026-10-03.", cambiar: "Laboratorio / prueba retrospectiva" },
  { id: "backtest", nivel: "error", patron: /\bbacktest\w*\b/i, permitir: /retirad[oa]|anterior/i, motivo: "Anglicismo. En el Laboratorio se llama «Prueba retrospectiva».", cambiar: "prueba retrospectiva" },
  { id: "default", nivel: "error", patron: /\bdefault\b/i, motivo: "Anglicismo. El impago es un parámetro del negocio (lab_definicion_default).", cambiar: "impago" },
  { id: "estado-viejo", nivel: "error", patron: /^(Confirmada|Provisional|Indeterminada)$|\bprovisionales\b|\bindeterminad[oa]s\b/, motivo: "Los estados se renombraron el 2026-09-26.", cambiar: "Confirmado por un tercero / Por confirmar / Sin determinar" },
  { id: "senales-de-escala", nivel: "error", patron: /\bSe[ñn]ales de escala\b/i, motivo: "Se llama «Tamaño del negocio».", cambiar: "Tamaño del negocio" },
  { id: "autodeclarada", nivel: "error", patron: /\bautodeclarad[oa]s?\b/i, permitir: /autodeclarada_/, motivo: "Se llama «Empresa propia» o «Afiliación voluntaria».", cambiar: "Empresa propia / Afiliación voluntaria" },
  { id: "como-puede-fallar", nivel: "error", patron: /\bC[oó]mo puede fallar\b/i, motivo: "Se sacó de todas las pantallas: era una generalidad, no un hecho de la persona.", cambiar: "(quitar)" },
  { id: "corte-del-iess", nivel: "aviso", patron: /\bcorte del IESS\b/i, motivo: "En pantalla se dice «Información IESS» (con el mes: «Ago 2026»).", cambiar: "información IESS" },
  { id: "puntaje", nivel: "error", patron: /\bpuntajes?\b/i, motivo: "El negocio unificó «Puntaje» y «score» en «Score» el 2026-10-12. Una columna de datos que se llama puntaje (plantilla que llenan las instituciones) se marca como excepción.", cambiar: "Score" },
  { id: "lotes-corridos", nivel: "error", patron: /\bLotes corridos\b/i, motivo: "Se llama «Lotes consultados» (decisión del negocio, 2026-10-12): «corridos» era jerga de ejecución.", cambiar: "Lotes consultados" },
  { id: "historial-por-cedula", nivel: "error", patron: /\bHistorial por c[eé]dula\b/i, motivo: "Se retiró el 2026-10-12: la búsqueda abre el Expediente, que ya trae la línea de tiempo.", cambiar: "Expediente" },
  { id: "explorador-de-fuentes", nivel: "error", patron: /\bExplorador de Fuentes\b/, motivo: "Se llama «Explorador de la fuente de datos» (2026-10-12): «fuentes» ya es de dónde viene el ingreso en otro módulo.", cambiar: "Explorador de la fuente de datos" },
  { id: "operaciones-propias-buro", nivel: "error", patron: /\bOperaciones propias en bur[oó] de cr[eé]dito\b/, motivo: "Cuenta filas agrupadas por entidad, tipo y calificación, no operaciones: 12 contra 15 en un caso con el mismo saldo (negocio, 2026-10-31).", cambiar: "Líneas de deuda propias en buró de crédito" },
  { id: "empleos-registrados", nivel: "error", patron: /\bEmpleos (registrados en total|en el historial)\b/, motivo: "Desde estructura-v16 cuenta empleadores distintos, no empleos (negocio, 2026-10-31).", cambiar: "Empleadores registrados en el IESS" },
  { id: "sueldo-mas-alto", nivel: "error", patron: /\bSueldo m[aá]s alto\b/, motivo: "El mismo dato tenía dos nombres, uno por pantalla (negocio, 2026-10-31).", cambiar: "Salario más alto registrado" },
  { id: "reportes-menu", nivel: "error", patron: /^Reportes$/, motivo: "El menú «Reportes» pasó a «Monitoreo» el 2026-10-12.", cambiar: "Monitoreo" },
  { id: "inteligencia-de-negocios", nivel: "error", patron: /\bInteligencia de Negocios\b/, motivo: "Era la página de Reportes, hoy «Monitoreo › Panorama». «Inteligencia de Negocio» (singular) es del Laboratorio.", cambiar: "Monitoreo / Panorama" },
  { id: "cliente-generico", nivel: "aviso", patron: /(?<![Pp]erfil del )\b[Cc]lientes?\b(?! (activo|activa|cerrado|cerrada|interno)\b)/, motivo: "«Cliente» es quien tiene un crédito (Cliente activo, Cliente cerrado); antes es una persona (docs/modelo-de-la-persona.md, decisión del 2026-10-12).", cambiar: "persona" },
  { id: "fuente-de-ingreso-segmento", nivel: "aviso", patron: /^Fuente de ingreso$/i, motivo: "Cuando el valor es Independiente / Dependiente privado / ..., eso es el «Segmento» (el negocio lo dejó con ese nombre).", cambiar: "Segmento" },

  // ---- Jerga y anglicismos (sólo «score» y «colateral» son del negocio)
  { id: "llm", nivel: "error", patron: /\bLLM\b/, motivo: "Jerga de proveedor. Para el analista es «el modelo» o «Análisis con IA».", cambiar: "el modelo / Análisis con IA" },
  { id: "ingesta", nivel: "aviso", patron: /\bingesta\b/i, motivo: "Anglicismo de datos. Es «consulta a la fuente».", cambiar: "consulta a la fuente de datos" },
  { id: "anglicismo", nivel: "error", patron: /\b(dashboard|ranking|feedback|scoring|batch|insights?|workflow|mouse|click|clicks|login|logout|e-?mail|backup|upload|download|ticket|tickets)\b/i, motivo: "Anglicismo: el negocio pidió castellano de Ecuador salvo «score» y «colateral».", cambiar: "(en castellano: tablero, score, lote, hallazgo, puntero, clic, ingreso, correo, respaldo, subir, descargar)" },
  { id: "link", nivel: "aviso", patron: /\blinks?\b/i, motivo: "Anglicismo.", cambiar: "enlace" },

  // ---- Reglas de escritura de la casa
  { id: "plural-con-parentesis", nivel: "error", patron: /[a-zñáéíóú]\(s\)/i, motivo: "El «(s)» es no decidir. Con formatos.js: plural(n, «cliente»).", cambiar: "plural()" },
  { id: "puntos-suspensivos", nivel: "aviso", patron: /…/, motivo: "La casa escribe tres puntos («Cargando...», 67 textos). El carácter «…» mezcla.", cambiar: "..." },
  { id: "tuteo", nivel: "aviso", patron: /\b(tienes|puedes|quieres|necesitas|debes|sabes)\b|\b(haz|pulsa) (el|la|los|las|un|una)\b/i, motivo: "La casa tutea con voseo («podés», «ingresá»), no con «tú».", cambiar: "voseo" },
  { id: "usted", nivel: "aviso", patron: /\b(ingrese|haga|seleccione|escriba|revise|consulte|presione|verifique|intente)\b/i, permitir: /\bque (la |lo |las |los |se |le |les )?(ingrese|haga|seleccione|escriba|revise|consulte|presione|verifique|intente)\b/i, motivo: "La casa tutea con voseo, no con «usted».", cambiar: "voseo" },
  { id: "solo-sin-tilde", nivel: "aviso", patron: /\b[Ss]olo (no|si|el|la|las|los|para|hay|score|cargar)\b/, motivo: "La casa escribe «sólo» (adverbio) con tilde: 40 textos contra 13. El adjetivo («un solo incidente», «de solo lectura») no la lleva.", cambiar: "sólo" },
  { id: "doble-espacio", nivel: "aviso", patron: /\S {2,}\S/, motivo: "Dos espacios seguidos.", cambiar: "un espacio" },
  { id: "tilde-como", nivel: "error", patron: /\bVer como (quedó|se)\b/, motivo: "Interrogativo indirecto: «cómo».", cambiar: "Ver cómo quedó" },
  { id: "cedula-sin-tilde", nivel: "aviso", patron: /\bCedula\b|\bcedula\b(?= (o|del|de la|del cliente|válida))/, motivo: "Se escribe «cédula».", cambiar: "cédula" },

  // ---- Nombres de producto: mayúsculas como las usa el negocio
  { id: "nombre-fuentes-de-ingreso", nivel: "aviso", patron: /\bFuentes de ingreso\b/, motivo: "Nombre de módulo y pestaña: «Fuentes de Ingreso» (mayúscula en Ingreso). Si es un sustantivo común en medio de una frase, va en minúscula.", cambiar: "Fuentes de Ingreso" },
  { id: "perfil-del-cliente", nivel: "error", patron: /\b[Pp]erfil del [Cc]liente\b/, motivo: "El negocio lo renombró «Perfil de la Persona» el 2026-10-18: cliente es sólo quien tiene un crédito (docs/modelo-de-la-persona.md, 5).", cambiar: "Perfil de la Persona" },
  { id: "nombre-perfil", nivel: "aviso", patron: /\bPerfil de la persona\b|\bperfil de la Persona\b/, motivo: "Nombre de producto: «Perfil de la Persona».", cambiar: "Perfil de la Persona" },
  { id: "nombre-analisis", nivel: "aviso", patron: /\bAnálisis con ia\b|\bAnálisis IA\b|\bAnalisis con IA\b/, motivo: "Nombre de producto: «Análisis con IA».", cambiar: "Análisis con IA" },
];

// Bajo el título de una página no va una frase que diga qué hace la pantalla
// ni qué es un concepto de crédito (negocio, 2026-10-20: las pantallas son para
// personal de crédito capacitado). Lo propio de CrediScope (de dónde sale una
// cifra, qué se cobra, una regla nuestra) va en una etiqueta junto al dato o en
// un InfoTooltip. Se mide por el tramo de texto fijo más largo del párrafo: una
// línea de datos («Ventana de 12 meses · congelado el {fecha}») queda debajo.
// Excepciones: Login y NoEncontrada, y un estado vacío o un error, que se marca
//   // revisar-textos: permitir subtitulo-de-pagina -- estado vacío
export const REGLA_SUBTITULO = {
  id: "subtitulo-de-pagina",
  nivel: "error",
  motivo: "Bajo el título de una página no va una frase que explique la pantalla (negocio, 2026-10-20: es para personal de crédito capacitado).",
  cambiar: "borrarla; lo propio de CrediScope (origen de una cifra, un cobro, una regla nuestra) pasa a una etiqueta junto al dato o a un InfoTooltip",
  palabrasMinimas: 5,
  archivosExentos: ["src/pages/Login.jsx", "src/pages/NoEncontrada.jsx"],
};

function subtitulosDePagina(archivos) {
  const hallazgos = [];
  for (const a of archivos) {
    if (REGLA_SUBTITULO.archivosExentos.includes(a)) continue;
    const r = parrafosBajoTitulos(a);
    if (r.errores.length) {
      console.error(`No se pudo leer ${a}: ${r.errores.join("; ")}`);
      process.exit(2);
    }
    for (const h of r.hallazgos) {
      if (h.titulo !== "h2" || h.palabras < REGLA_SUBTITULO.palabrasMinimas) continue;
      if (permitidoPorMarca(a, h.linea, REGLA_SUBTITULO.id)) continue;
      hallazgos.push({ ...h, regla: REGLA_SUBTITULO });
    }
  }
  return hallazgos;
}

// Para revisar una pantalla uno por uno: todo lo que explica algo (el párrafo
// que sigue a un título, las ayudas ⓘ y los title) con su lugar en el archivo.
function listarExplicativos(archivo) {
  const salida = [];
  for (const h of parrafosBajoTitulos(archivo).hallazgos) {
    const error = h.titulo === "h2" && h.palabras >= REGLA_SUBTITULO.palabrasMinimas ? " (¡error!)" : "";
    salida.push({ linea: h.linea, tipo: `párrafo bajo ${h.titulo}${error}`, texto: h.texto });
  }
  const fuente = fs.readFileSync(path.join(RAIZ, archivo), "utf8");
  const lineaDe = (pos) => fuente.slice(0, pos).split("\n").length;
  for (const m of fuente.matchAll(/<InfoTooltip\b[^>]*>([\s\S]*?)<\/InfoTooltip>/g)) {
    salida.push({ linea: lineaDe(m.index), tipo: "ayuda ⓘ", texto: m[1].replace(/\s+/g, " ").trim() });
  }
  for (const t of textosDeArchivo(archivo).textos) {
    if (t.tipo === "atributo:title" || t.tipo === "atributo:texto") salida.push({ linea: t.linea, tipo: t.tipo.replace("atributo:", "ayuda "), texto: t.texto });
  }
  return salida.sort((x, y) => x.linea - y.linea);
}

function leerOpciones() {
  const o = { archivo: null, estricto: false, inventario: false, glosario: false, explicativos: false };
  for (const a of process.argv.slice(2)) {
    if (a === "--estricto") o.estricto = true;
    else if (a === "--explicativos") o.explicativos = true;
    else if (a === "--inventario") o.inventario = true;
    else if (a === "--glosario") o.glosario = true;
    else if (a.startsWith("--archivo=")) o.archivo = a.slice("--archivo=".length);
    else {
      console.error(`Opción desconocida: ${a}`);
      process.exit(2);
    }
  }
  return o;
}

// ¿La línea (o la anterior) trae la marca de excepción para esta regla?
const lineasDe = new Map();
function permitidoPorMarca(archivo, linea, id) {
  if (!lineasDe.has(archivo)) lineasDe.set(archivo, fs.readFileSync(path.join(RAIZ, archivo), "utf8").split(/\r?\n/));
  const l = lineasDe.get(archivo);
  const marca = new RegExp(`revisar-textos:\\s*permitir\\s+(${id}|todo)\\b`);
  return [l[linea - 1], l[linea - 2]].some((x) => x && marca.test(x));
}

export function revisar(textos) {
  const hallazgos = [];
  for (const t of textos) {
    for (const r of REGLAS) {
      const m = t.texto.match(r.patron);
      if (!m) continue;
      if (r.permitir && r.permitir.test(t.texto)) continue;
      if (permitidoPorMarca(t.archivo, t.linea, r.id)) continue;
      hallazgos.push({ ...t, regla: r });
    }
  }
  return hallazgos;
}

function main() {
  const o = leerOpciones();

  if (o.glosario) {
    for (const r of [...REGLAS, REGLA_SUBTITULO]) console.log(`${r.id.padEnd(28)} [${r.nivel}]  ${r.motivo}  →  ${r.cambiar}`);
    return;
  }

  if (o.explicativos) {
    if (!o.archivo) {
      console.error("--explicativos pide --archivo=src/pages/X.jsx");
      process.exit(2);
    }
    for (const e of listarExplicativos(o.archivo)) console.log(`${o.archivo}:${e.linea}\t${e.tipo}\t${e.texto}`);
    return;
  }

  let textos;
  if (o.archivo) {
    const r = textosDeArchivo(o.archivo);
    if (r.errores.length) {
      console.error(`No se pudo leer ${o.archivo}: ${r.errores.join("; ")}`);
      process.exit(2);
    }
    textos = r.textos;
  } else {
    const r = todosLosTextos();
    if (r.fallos.length) {
      for (const f of r.fallos) console.error(`No se pudo leer ${f.archivo}: ${f.errores.join("; ")}`);
      process.exit(2);
    }
    textos = r.textos;
  }

  if (o.inventario) {
    for (const t of textos) console.log(`${t.archivo}:${t.linea}\t${t.tipo}\t${t.texto}`);
    return;
  }

  const hallazgos = [
    ...revisar(textos),
    ...subtitulosDePagina(o.archivo ? [o.archivo] : archivosDePantalla({ incluirLib: false })),
  ];
  const errores = hallazgos.filter((h) => h.regla.nivel === "error");
  const avisos = hallazgos.filter((h) => h.regla.nivel === "aviso");

  const imprimir = (lista, etiqueta) => {
    for (const h of lista) {
      const corto = h.texto.length > 110 ? `${h.texto.slice(0, 107)}...` : h.texto;
      console.log(`${etiqueta} ${h.archivo}:${h.linea}  [${h.regla.id}]  «${corto}»\n        → ${h.regla.cambiar}. ${h.regla.motivo}`);
    }
  };
  imprimir(errores, "ERROR");
  imprimir(avisos, "aviso");

  console.log(`\n${textos.length} textos revisados · ${errores.length} errores · ${avisos.length} avisos`);
  if (errores.length || (o.estricto && avisos.length)) process.exit(1);
}

// Se puede importar (REGLAS, revisar) sin correr el informe.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) main();
