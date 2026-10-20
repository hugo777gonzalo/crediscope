// Verificador de pantalla de CrediScope. Se ejecuta DENTRO de la página, con
// la herramienta `javascript_tool` del navegador de vista previa (sesión de
// QA iniciada por el usuario). No modifica nada: sólo lee el DOM.
//
// Uso (una vez por carga de página, define window.__revisionUx):
//   1. Pegar este archivo entero en javascript_tool.
//   2. `await __revisionUx.verificar()`            → hallazgos de la pantalla actual
//   3. `await __revisionUx.recorrer(["/costos"])`  → navega sin recargar (SPA) y verifica cada ruta
//
// Qué mira y por qué (cada regla salió de un defecto real del 2026-10-10):
//   - valor-roto           NaN, undefined, null, [object Object]
//   - numero-sin-miles     "2812" donde otra pantalla dice "2.812"
//   - miles-con-coma       "$1,784" (estilo inglés) en vez de "$1.784"
//   - decimal-con-punto    "37.0 s", "4.3¢": en Ecuador la coma decimal
//   - puntos-suspensivos   el carácter "…" donde la casa escribe "..."
//   - fecha-iso / mes-iso  "2026-08" donde el negocio dice "Ago 2026"
//   - identificador        códigos internos en pantalla (expediente.vista, snake_case)
//   - version-interna      marco-v28, estructura-v13 en tarjetas principales
//   - termino-prohibido    palabras que el negocio retiró (ver terminologia.md)
//   - plural-parentesis    "cliente(s)"
//   - sin-nombre           botones/enlaces con sólo ícono y sin aria-label/title
//   - campo-sin-etiqueta   input/select sin label ni aria-label
//   - contraste            texto bajo 4,5:1 (3:1 si es grande)
//   - texto-chico          menos de 12 px
//   - blanco               la pantalla no dibujó nada (guardia que devuelve null)
//   - desborde             scroll horizontal de la página
//   - cifra-repetida       el mismo monto en 3 lugares o más (2026-10-18)
//
// Los números largos (7+ dígitos: cédulas, RUC) se enmascaran en la salida:
// el repositorio y el chat no deben recibir datos de personas reales.

(() => {
  const MESES = "ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic";

  const TERMINOS_PROHIBIDOS = [
    [/\basalariad[oa]s?\b/i, "usar «dependiente»"],
    [/\bpisos?\b/i, "no se usa en Ecuador: «ingreso reportado al IESS» / «Ingreso Mínimo SBU»"],
    [/\bretroalimentaci[oó]n\b/i, "reemplazada por el Laboratorio"],
    [/\bbacktest\w*\b/i, "usar «prueba retrospectiva»"],
    [/\bdefault\b/i, "usar «impago»"],
    [/\b(dashboard|ranking|feedback|scoring|batch|insights?|workflow)\b/i, "anglicismo"],
    [/\bprovisional(es)?\b/i, "ahora «Por confirmar»"],
    [/\bindeterminad[oa]s?\b/i, "ahora «Sin determinar»"],
    [/^(Confirmada|Provisional|Indeterminada)$/, "ahora «Confirmado por un tercero» / «Por confirmar» / «Sin determinar»"],
    [/\bSe[ñn]ales de escala\b/i, "ahora «Tamaño del negocio»"],
    [/\bautodeclarad[oa]s?\b/i, "ahora «Empresa propia» / «Afiliación voluntaria»"],
    [/\bC[oó]mo puede fallar\b/i, "se sacó de todas las pantallas"],
    [/\bLLM\b/, "jerga: decir «el modelo» o «Análisis con IA»"],
    [/\bingesta\b/i, "decir «consulta a la fuente»"],
    [/\bpuntajes?\b/i, "ahora «Score» (decisión del 2026-10-12)"],
    [/\bLotes corridos\b/i, "ahora «Lotes consultados»"],
    [/\bHistorial por c[eé]dula\b/i, "se retiró: la búsqueda abre el Expediente"],
    [/\bExplorador de Fuentes\b/, "ahora «Explorador de la fuente de datos»"],
    [/\bInteligencia de Negocios\b/, "ahora «Monitoreo»"],
    [/\bClientes por segmento\b/, "ahora «Personas por segmento»"],
  ];

  const mascara = (s) => s.replace(/\d{7,}/g, (m) => "#".repeat(m.length));

  const REGLAS_TEXTO = [
    ["valor-roto", /\b(NaN|undefined|Infinity|Invalid Date)\b|\[object Object\]|\bnull\b/],
    // Miles ausentes: 4 a 6 dígitos solos. Se filtran años y códigos abajo.
    ["numero-sin-miles", /(?<![\w.,/:#-])\d{4,6}(?![\w.,/:%-])/],
    // Sólo con "$" o con dos grupos o más: "0,695" es un decimal válido en
    // es-EC (el índice de un modelo), no un millar.
    ["miles-con-coma", /\$\s?\d{1,3}(,\d{3})+(?!\d)|(?<![\w.,])[1-9]\d{0,2}(,\d{3}){2,}(?![\d,])/],
    // En es-EC "1.784" son miles, así que el punto sólo es decimal si lo
    // siguen 1-2 dígitos (o 4+ en las tarifas). Un 3 es siempre miles.
    ["decimal-con-punto", /(?<![\d.])\d{1,3}\.\d{1,2}\s?(s|¢|ms|min|h|%)(?![\w])|\$\s?\d{1,3}(\.\d{3})*\.(\d{1,2}|\d{4,})(?![\d.])/],
    // La casa escribe "..." (tres puntos, 67 textos): el carácter "…" mezcla.
    ["puntos-suspensivos", /…/],
    ["fecha-iso", /\b20\d{2}-\d{2}-\d{2}\b/],
    ["mes-iso", /\b20\d{2}-(0[1-9]|1[0-2])\b(?!-)/],
    ["identificador", /\b[a-z][a-z0-9]*(_[a-z0-9]+)+\b|\b(?:expediente|client|lote|lab|bandeja)\.[a-z_]+\b/],
    ["version-interna", /\b(marco|estructura|fuentes|perfil-laboral)-v\d+\b/i],
    ["plural-parentesis", /[a-zñáéíóú]\(s\)/i],
    ["falta-tilde", /\bVer como quedó\b|\bcomo se\b(?= calcul| arm| clasific)/],
  ];

  function esAnio(texto, indice, numero) {
    if (!/^(19|20)\d{2}$/.test(numero)) return false;
    const antes = texto.slice(Math.max(0, indice - 12), indice);
    return new RegExp(`(${MESES})[a-záéíóú]*\\.?\\s+(de\\s+)?$`, "i").test(antes) || /(\/|-|\bde |\bdesde |\bhasta |\baño |\ben )$/i.test(antes);
  }

  function visible(el) {
    if (!el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false;
    const s = getComputedStyle(el);
    return s.display !== "none" && s.visibility !== "hidden" && Number(s.opacity) > 0;
  }

  function recorrerTextos(raiz) {
    const salida = [];
    const w = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      const t = n.nodeValue.replace(/\s+/g, " ").trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || ["SCRIPT", "STYLE", "NOSCRIPT", "OPTION"].includes(el.tagName)) continue;
      if (!visible(el)) continue;
      salida.push({ texto: t, el });
    }
    return salida;
  }

  // ---- contraste (WCAG 2.x) ----
  function parseColor(c) {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  }
  function mezclar(sobre, base) {
    const a = sobre.a;
    return { r: sobre.r * a + base.r * (1 - a), g: sobre.g * a + base.g * (1 - a), b: sobre.b * a + base.b * (1 - a), a: 1 };
  }
  function fondoEfectivo(el) {
    const capas = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parseColor(getComputedStyle(e).backgroundColor);
      if (c && c.a > 0) {
        capas.push(c);
        if (c.a >= 1) break;
      }
    }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = capas.length - 1; i >= 0; i--) base = mezclar(capas[i], base);
    return base;
  }
  const lum = ({ r, g, b }) => {
    const f = (v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contraste = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  function verificar() {
    const raiz = document.querySelector("main") || document.body;
    const hallazgos = [];
    const agregar = (tipo, muestra, extra) => hallazgos.push({ tipo, muestra: mascara(String(muestra)).slice(0, 140), ...extra });

    const textos = recorrerTextos(raiz);
    const todo = textos.map((t) => t.texto);
    if (!todo.join("").trim()) agregar("blanco", "la pantalla no dibujó contenido");

    for (const { texto } of textos) {
      for (const [tipo, re] of REGLAS_TEXTO) {
        const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
        let m;
        while ((m = g.exec(texto))) {
          if (tipo === "numero-sin-miles" && (esAnio(texto, m.index, m[0]) || /^(0\d+)$/.test(m[0]))) continue;
          const ini = Math.max(0, m.index - 22);
          agregar(tipo, texto.slice(ini, m.index + m[0].length + 22));
          if (!g.global) break;
        }
      }
      for (const [re, motivo] of TERMINOS_PROHIBIDOS) {
        const m = texto.match(re);
        if (m) agregar("termino-prohibido", texto.slice(Math.max(0, m.index - 22), m.index + m[0].length + 22), { motivo });
      }
    }

    // La misma cifra dicha varias veces: la pestaña Equifax mostraba la deuda
    // en el indicador, en la fila del sistema y en la fila de total, y Costos ›
    // Equifax el gasto del mes cuatro veces (2026-10-18). Se cuenta un monto
    // (desde $100, el texto entero de un elemento) una vez por lugar: en una
    // misma fila, «Deuda» y «Al día» pueden coincidir sin que sobre nada. Es un
    // aviso para mirar, no siempre un defecto.
    const lugares = new Map();
    for (const { texto, el } of textos) {
      const m = /^\$\s?(\d{1,3}(?:\.\d{3})*)(?:,\d{1,2})?$/.exec(texto);
      if (!m || Number(m[1].replace(/\./g, "")) < 100) continue;
      // Las filas de un mismo cuerpo de tabla son un lugar: en la bandeja, cinco
      // personas con el SBU ($482) no son una redundancia. El pie (el total) es
      // otro lugar, y cada tarjeta o indicador, otro.
      const lugar = el.closest("tfoot") ?? el.closest("tbody, table") ?? el.closest(".crediscope-card") ?? el;
      if (!lugares.has(texto)) lugares.set(texto, new Set());
      lugares.get(texto).add(lugar);
    }
    for (const [cifra, donde] of lugares) {
      if (donde.size >= 3) agregar("cifra-repetida", `${cifra} en ${donde.size} lugares: ¿indicador y total de tabla, o un resumen que repite lo de arriba?`);
    }

    // Texto cortado por el diseño: una celda con puntos suspensivos del
    // navegador que oculta datos sin dar manera de verlos completos.
    const cortados = [...raiz.querySelectorAll("*")].filter((e) => {
      const s = getComputedStyle(e);
      return s.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1 && !e.title && !e.getAttribute("aria-label");
    });
    if (cortados.length) agregar("recortado-sin-ayuda", `${cortados.length} elementos recortan su texto sin title: «${mascara(cortados[0].textContent.trim().slice(0, 60))}»`);

    // Accesibilidad
    const sinNombre = [...raiz.querySelectorAll("button, a[href], [role=button]")].filter((e) => {
      if (!visible(e)) return false;
      const nombre = (e.textContent || "").trim() || e.getAttribute("aria-label") || e.getAttribute("title") || e.getAttribute("aria-labelledby");
      return !nombre;
    });
    for (const e of sinNombre.slice(0, 6)) agregar("sin-nombre", e.outerHTML.slice(0, 90));
    if (sinNombre.length > 6) agregar("sin-nombre", `… y ${sinNombre.length - 6} más`);

    const camposSinEtiqueta = [...raiz.querySelectorAll("input:not([type=hidden]), select, textarea")].filter((e) => {
      if (!visible(e)) return false;
      if (e.getAttribute("aria-label") || e.getAttribute("aria-labelledby")) return false;
      if (e.id && document.querySelector(`label[for="${CSS.escape(e.id)}"]`)) return false;
      if (e.closest("label")) return false;
      return true;
    });
    for (const e of camposSinEtiqueta.slice(0, 6)) agregar("campo-sin-etiqueta", `${e.tagName.toLowerCase()} ${e.getAttribute("type") ?? ""} placeholder=«${e.getAttribute("placeholder") ?? ""}»`);
    if (camposSinEtiqueta.length > 6) agregar("campo-sin-etiqueta", `… y ${camposSinEtiqueta.length - 6} más`);

    const imgSinAlt = [...raiz.querySelectorAll("img:not([alt])")];
    if (imgSinAlt.length) agregar("imagen-sin-alt", `${imgSinAlt.length} imágenes`);

    // Contraste y tamaño
    const combos = new Map();
    const chicos = new Map();
    for (const { texto, el } of textos) {
      if (texto.length < 2) continue;
      const s = getComputedStyle(el);
      const fg = parseColor(s.color);
      if (!fg) continue;
      const bg = fondoEfectivo(el);
      const fgOpaco = fg.a < 1 ? mezclar(fg, bg) : fg;
      const px = parseFloat(s.fontSize);
      const negrita = Number(s.fontWeight) >= 700;
      const grande = px >= 24 || (px >= 18.66 && negrita);
      const ratio = contraste(fgOpaco, bg);
      if (ratio < (grande ? 3 : 4.5)) {
        const clave = `${s.color}|${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)}|${px}`;
        const x = combos.get(clave) ?? { n: 0, ratio: ratio.toFixed(2), px, ejemplo: mascara(texto.slice(0, 40)) };
        x.n++;
        combos.set(clave, x);
      }
      if (px < 12) {
        const clave = `${px}`;
        const x = chicos.get(clave) ?? { n: 0, ejemplo: mascara(texto.slice(0, 40)) };
        x.n++;
        chicos.set(clave, x);
      }
    }
    for (const [clave, x] of [...combos.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 5)) agregar("contraste", `${x.ratio}:1 · ${x.px}px · ${x.n} textos · «${x.ejemplo}»`, { clave });
    for (const [px, x] of [...chicos.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 3)) agregar("texto-chico", `${px}px · ${x.n} textos · «${x.ejemplo}»`);

    // Estructura
    const h1 = document.querySelectorAll("h1").length;
    const encabezados = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
    let saltos = 0;
    for (let i = 1; i < encabezados.length; i++) {
      if (Number(encabezados[i].tagName[1]) - Number(encabezados[i - 1].tagName[1]) > 1) saltos++;
    }
    const ids = [...document.querySelectorAll("[id]")].map((e) => e.id);
    const repetidos = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (repetidos.length) agregar("id-repetido", [...new Set(repetidos)].slice(0, 5).join(", "));
    if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 2) agregar("desborde", `scroll horizontal: ${document.documentElement.scrollWidth} > ${document.documentElement.clientWidth}`);

    const celdas = [...raiz.querySelectorAll("td")].filter(visible);
    const vacias = celdas.filter((c) => /^(—|-|)$/.test(c.textContent.trim())).length;

    const cuenta = {};
    for (const h of hallazgos) cuenta[h.tipo] = (cuenta[h.tipo] ?? 0) + 1;
    const unicos = [];
    const vistos = new Set();
    for (const h of hallazgos) {
      const k = `${h.tipo}|${h.muestra}`;
      if (vistos.has(k)) continue;
      vistos.add(k);
      unicos.push(h);
    }
    return {
      ruta: mascara(location.pathname),
      titulo: mascara((document.querySelector("main h1, main h2, h1, h2")?.textContent ?? "").trim()),
      barraSuperior: mascara((document.querySelector(".crediscope-topbar-titulo")?.textContent ?? "").trim()),
      h1,
      encabezados: encabezados.length,
      saltosDeNivel: saltos,
      lang: document.documentElement.lang,
      textos: textos.length,
      tablas: raiz.querySelectorAll("table").length,
      celdasVacias: `${vacias}/${celdas.length}`,
      cuenta,
      hallazgos: unicos.slice(0, 40),
    };
  }

  async function esperarCarga(maxMs = 40000) {
    const t0 = Date.now();
    let ultimoCambio = Date.now();
    const obs = new MutationObserver(() => (ultimoCambio = Date.now()));
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
    try {
      // Un respiro antes de mirar: los efectos de la pantalla nueva todavía
      // no pidieron sus datos y el DOM viejo parece "terminado".
      await new Promise((r) => setTimeout(r, 900));
      while (Date.now() - t0 < maxMs) {
        await new Promise((r) => setTimeout(r, 250));
        const main = document.querySelector("main");
        const texto = (main?.innerText ?? "").slice(0, 4000);
        // Las pantallas que ya tenían datos de la ruta anterior no muestran
        // "Cargando": se mira también el componente de espera y la franja
        // "actualizando...".
        const cargando =
          Boolean(main?.querySelector(".crediscope-cargando")) ||
          /actualizando\.\.\./i.test(texto) ||
          /(^|\n)\s*(Cargando|Calculando|Consultando|Buscando|Leyendo)\b/i.test(texto);
        const vacio = !texto.trim();
        if (!cargando && !vacio && Date.now() - ultimoCambio > 1500) return Date.now() - t0;
        // Una pantalla en blanco mucho tiempo ya es un hallazgo.
        if (vacio && Date.now() - t0 > 12000) return Date.now() - t0;
      }
      return Date.now() - t0;
    } finally {
      obs.disconnect();
    }
  }

  async function irA(ruta) {
    history.pushState({}, "", ruta);
    window.dispatchEvent(new PopStateEvent("popstate"));
    return esperarCarga();
  }

  async function recorrer(rutas) {
    const resultado = [];
    for (const ruta of rutas) {
      const tiempo = await irA(ruta);
      const r = verificar();
      r.cargoEnMs = tiempo;
      resultado.push(r);
    }
    return resultado;
  }

  window.__revisionUx = { verificar, recorrer, irA, esperarCarga };
  return "verificador listo: __revisionUx.verificar() / __revisionUx.recorrer([rutas])";
})();
