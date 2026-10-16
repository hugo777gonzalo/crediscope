// La estructura de la aplicación en un solo lugar: de acá salen el menú
// lateral, la ubicación de la barra superior ("Costos › Tarifas") y qué
// sección queda resaltada.
//
// POR QUÉ EXISTE
//
// El menú (MenuLateral.jsx) y los títulos de la barra superior (App.jsx)
// eran dos listas escritas a mano que se fueron separando. En la revisión del
// 2026-10-10:
//   - TODO el Laboratorio mostraba "CrediScope" arriba: la lista de títulos
//     no tenía ninguna entrada para /laboratorio.
//   - Seguía una entrada para "Retroalimentación", que el Laboratorio
//     reemplazó el 2026-10-03.
//   - En "/" se resaltaban a la vez "Inicio" y "Evaluación Crediticia".
//   - La barra decía a veces la sección ("Evaluación Crediticia") y a veces
//     la página ("Historial de un cliente", que en el menú es "Historial por
//     cédula").
// Con una sola lista, un nombre se cambia en un lugar y el menú y la barra
// dicen lo mismo.
//
// Cómo se escribe cada entrada:
//   texto      lo que dice el menú
//   ruta       a dónde lleva
//   exacta     sólo resalta con esa ruta exacta (si no, con cualquiera que empiece así)
//   conCedula  necesita una cédula: lleva a la del último cliente visto, o a la
//              búsqueda si todavía no hay ninguno (ver ultimaCedula.js)
//   soloAdmin  la ve y entra sólo administración (la ruta también lo exige en App.jsx)
//   prefijos   otras rutas que cuentan como esa sección (para resaltarla)

export const SECCIONES = [
  { id: "inicio", texto: "Inicio", ruta: "/" },
  {
    id: "evaluacion",
    texto: "Evaluación Crediticia",
    prefijos: ["/perfil", "/analisis", "/ingresos", "/aval", "/equifax", "/buro"],
    hijos: [
      { texto: "Perfil del Cliente", ruta: "/perfil", conCedula: true },
      { texto: "Análisis con IA", ruta: "/analisis", conCedula: true },
      { texto: "Fuentes de Ingreso", ruta: "/ingresos", conCedula: true },
      // El buró de la institución, uno solo por IFI (cuestionario, A2): /buro
      // lleva a la pestaña de Equifax o de Aval según cuál eligió (129).
      { texto: "Buró", ruta: "/buro", conCedula: true, tambien: ["/equifax", "/aval"] },
    ],
  },
  {
    id: "solicitudes",
    texto: "Solicitudes",
    prefijos: ["/solicitudes", "/historial"],
    hijos: [
      { texto: "Bandeja", ruta: "/solicitudes", exacta: true },
    ],
  },
  {
    id: "fuentes",
    texto: "Fuentes de Ingreso",
    prefijos: ["/fuentes"],
    hijos: [
      { texto: "Panorama", ruta: "/fuentes", exacta: true },
      { texto: "Personas por segmento", ruta: "/fuentes/clientes" },
      { texto: "Reglas de clasificación", ruta: "/fuentes/reglas" },
      { texto: "Parámetros", ruta: "/fuentes/parametros", soloAdmin: true },
    ],
  },
  {
    // «Reportes» pasó a «Monitoreo» el 2026-10-12 (decisión del negocio): el
    // nombre viejo chocaba con «Laboratorio de Inteligencia de Negocio». El id
    // y la ruta se quedan para no romper enlaces guardados.
    id: "reportes",
    texto: "Monitoreo",
    prefijos: ["/reportes"],
    hijos: [
      { texto: "Panorama", ruta: "/reportes", exacta: true },
      { texto: "Descargas", ruta: "/reportes/descargas", soloAdmin: true },
    ],
  },
  {
    id: "lotes",
    texto: "Consultas por lote",
    prefijos: ["/lotes"],
    soloAdmin: true,
    hijos: [
      { texto: "Lotes consultados", ruta: "/lotes", exacta: true },
      { texto: "Cargar archivo", ruta: "/lotes/nuevo" },
    ],
  },
  {
    id: "costos",
    texto: "Costos",
    prefijos: ["/costos"],
    soloAdmin: true,
    hijos: [
      { texto: "Panorama", ruta: "/costos", exacta: true },
      { texto: "Costo por consulta", ruta: "/costos/consultas" },
      { texto: "Corridas masivas", ruta: "/costos/corridas" },
      { texto: "Detalle de llamadas", ruta: "/costos/llamadas" },
      { texto: "Fallas e incidentes", ruta: "/costos/incidentes" },
      { texto: "Avisos", ruta: "/costos/avisos" },
      { texto: "Tarifas", ruta: "/costos/tarifas" },
    ],
  },
  {
    id: "laboratorio",
    texto: "Laboratorio",
    prefijos: ["/laboratorio"],
    soloAdmin: true,
    hijos: [
      { texto: "Inicio", ruta: "/laboratorio", exacta: true },
      { texto: "Instituciones y proyectos", ruta: "/laboratorio/instituciones" },
      // Cargas y cortes se abren desde "Datos y cartera": cuentan como ella.
      { texto: "Datos y cartera", ruta: "/laboratorio/datos", tambien: ["/laboratorio/cargas", "/laboratorio/cortes"] },
      { texto: "Prueba retrospectiva", ruta: "/laboratorio/desempeno" },
      { texto: "Descubrimiento estadístico", ruta: "/laboratorio/estadistica" },
      // Un caso se abre desde el descubrimiento profundo.
      { texto: "Descubrimiento profundo", ruta: "/laboratorio/profundo", tambien: ["/laboratorio/caso"] },
      { texto: "Propuestas", ruta: "/laboratorio/propuestas" },
    ],
  },
  {
    id: "configuracion",
    texto: "Configuración",
    prefijos: ["/admin", "/explorar"],
    soloAdmin: true,
    hijos: [
      { texto: "Fuentes que consultamos", ruta: "/admin/fuentes" },
      { texto: "Campos del análisis", ruta: "/admin/campos" },
      { texto: "Qué ve el analista", ruta: "/admin/segmentos" },
      { texto: "Explorador de la fuente de datos", ruta: "/explorar" },
    ],
  },
];

// Páginas que no están en el menú (se llega a ellas desde otra) y cómo se
// llaman. Va de lo más específico a lo más general: gana la primera.
const PAGINAS_FUERA_DEL_MENU = [
  [/^\/solicitudes\/./, "solicitudes", "Expediente"],
  [/^\/historial\/perfil\//, "solicitudes", "Perfil del Cliente guardado"],
  [/^\/historial\/analisis\//, "solicitudes", "Análisis con IA guardado"],
  [/^\/lotes\/(?!nuevo)./, "lotes", "Detalle del lote"],
  [/^\/laboratorio\/cargas\/nueva/, "laboratorio", "Cargar resultados de crédito"],
  [/^\/laboratorio\/cargas\/./, "laboratorio", "Carga de cartera"],
  [/^\/laboratorio\/cortes\/nuevo/, "laboratorio", "Nuevo corte"],
  [/^\/laboratorio\/cortes\/./, "laboratorio", "Corte"],
  [/^\/laboratorio\/caso/, "laboratorio", "Investigación de un caso"],
  [/^\/admin\/fuentes\/equifax/, "configuracion", "Fuentes que consultamos › Equifax"],
  [/^\/admin\/fuentes\/aval/, "configuracion", "Fuentes que consultamos › Aval"],
  [/^\/admin\/campos\/aval/, "configuracion", "Campos del análisis › Aval"],
];

const coincide = (ruta, pathname, exacta) => (exacta ? pathname === ruta : pathname === ruta || pathname.startsWith(`${ruta}/`));

export function hijoActivo(hijo, pathname) {
  return [hijo.ruta, ...(hijo.tambien ?? [])].some((r) => coincide(r, pathname, hijo.exacta));
}

export function seccionActiva(seccion, pathname) {
  if (seccion.id === "inicio") return pathname === "/";
  if (seccion.id === "evaluacion" && pathname === "/") return false;
  return (seccion.prefijos ?? []).some((p) => coincide(p, pathname, false));
}

/** Dónde está parada la persona: { seccion, pagina }. `pagina` es null en
 *  las secciones sin hijos (Inicio). */
export function ubicacion(pathname) {
  for (const [patron, idSeccion, pagina] of PAGINAS_FUERA_DEL_MENU) {
    if (patron.test(pathname)) return { seccion: SECCIONES.find((s) => s.id === idSeccion).texto, pagina };
  }
  const seccion = SECCIONES.find((s) => seccionActiva(s, pathname));
  if (!seccion) return { seccion: "CrediScope", pagina: null };
  const hijo = (seccion.hijos ?? []).find((h) => hijoActivo(h, pathname));
  return { seccion: seccion.texto, pagina: hijo?.texto ?? null };
}

/** Los hijos que esta persona puede ver. */
export function hijosVisibles(seccion, admin) {
  return (seccion.hijos ?? []).filter((h) => admin || !h.soloAdmin);
}

export function seccionesVisibles(admin) {
  return SECCIONES.filter((s) => admin || !s.soloAdmin);
}
