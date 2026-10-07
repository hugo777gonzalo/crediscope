// Lo que el Laboratorio guarda de cada cálculo (fase 2 de la revisión,
// docs/propuesta-revision-del-laboratorio.md 10.5 y 10.6), sin React ni el
// cliente de Supabase: lo usan las pantallas y los guiones de prueba.
//
// - La estadística vive sólo en estadistica.js. Acá se arma con ella lo que
//   hasta la 111 calculaba la base (desempeño, variables, estabilidad, los
//   intervalos de la matriz, los cuadrantes y los motivos, y el AUC de la
//   calificación), con la misma forma: el Inicio, el informe y la calificación
//   de la simulación lo siguen leyendo igual. El AUC llegó a estar escrito
//   cuatro veces; dos copias que coinciden prueban que coinciden, no que estén
//   bien.
// - Cada resultado se guarda con una huella (corte, tipo, población,
//   parámetros y versión del cálculo). La misma huella no se guarda dos veces.
// - Lo que se guarda no lleva filas de personas ni cédulas: conteos, tasas y
//   pruebas. RESUMEN saca lo que cada pestaña tiene fila por fila.

import { aucPuntaje, ks, wilson, psi } from "./estadistica.js";
import { filasObservadas, filasConPuntaje } from "./filasDelCorte.js";
import { columnasDelCorte, ivDeLaVariable, tramosIniciales } from "./analisisEstadistico.js";

// La versión de cada cálculo. Cambiar cómo se calcula algo es subir su número:
// el resultado viejo queda, con la suya, al lado del nuevo. Los que calculaba
// la base empiezan donde ella los dejó, más uno.
export const VERSION_DEL_CALCULO = {
  desempeno: 2, variables: 5, estabilidad: 2, matriz: 3, cuadrantes: 2, motivos: 2, calificacion_simulacion: 3, calibracion: 2,
  discriminacion: 1, segmentos: 1, cosechas: 1, descriptivas: 1, faltantes: 1, correlaciones: 1, significancia: 1,
  los_que_cayeron: 1, decisiones_institucion: 1, umbrales: 1, tramos: 1, taller: 1, inferencia: 1, distribucion: 1,
  estabilidad_variables: 1, comparacion: 1,
};

const r4 = (x) => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Math.round(Number(x) * 1e4) / 1e4);
const intervalo = (malos, n) => {
  const ic = wilson(malos, n);
  return ic ? [r4(ic[0]), r4(ic[1])] : null;
};

// --------------------------------------------------------------- huella
// Un JSON con las claves en orden: el mismo cálculo da siempre el mismo texto.
function ordenado(x) {
  if (Array.isArray(x)) return x.map(ordenado);
  if (x && typeof x === "object") return Object.fromEntries(Object.keys(x).sort().map((k) => [k, ordenado(x[k])]));
  return x;
}

export async function huellaDe({ corteId, tipo, poblacion = null, parametros = {} }) {
  const texto = JSON.stringify(ordenado({ corteId, tipo, poblacion, parametros, version: VERSION_DEL_CALCULO[tipo] ?? 1 }));
  const bytes = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ------------------------------------------------------------ desempeño
const ORDEN_RECOMENDACION = ["aprobar", "revisar", "negar", "bloqueado", "sin recomendación"];
const AVISO_SINTETICO = "Corte sintético: el resultado y el puntaje son inventados. No es desempeño del motor.";

// Lo que calculaba lab_calcular_desempeno (095), sobre las operaciones del
// corte: las observadas con puntaje. El AUC, el KS y los tramos van sin los
// bloqueados (su puntaje lo fuerza la política); la tabla por recomendación
// los muestra aparte.
export function desempenoDelCorte(filas, { esSintetico = false } = {}) {
  const base = filasObservadas(filas).filter((f) => Number.isFinite(f.puntaje));
  const sinBloqueo = filasConPuntaje(filas);
  const a = aucPuntaje(sinBloqueo);
  const k = a.auc === null ? null : ks(sinBloqueo);
  const malos = base.filter((f) => f.malo).length;

  const contar = (fs) => ({ n: fs.length, malos: fs.filter((f) => f.malo).length });
  const porRecomendacion = ORDEN_RECOMENDACION
    .map((rec) => ({ rec, ...contar(base.filter((f) => f.recomendacion === rec)) }))
    .filter((x) => x.n)
    .map(({ rec, n, malos: m }) => ({ recomendacion: rec, n, malos: m, tasa: r4(m / n), intervalo: intervalo(m, n) }));

  const tramos = new Map();
  for (const f of sinBloqueo) {
    const desde = Math.min(Math.floor(f.puntaje / 100) * 100, 900);
    const t = tramos.get(desde) ?? { desde, hasta: desde === 900 ? 999 : desde + 99, n: 0, malos: 0 };
    t.n++;
    if (f.malo) t.malos++;
    tramos.set(desde, t);
  }

  const versiones = new Map();
  for (const f of base) {
    const clave = f.marco ?? f.fuentePuntaje ?? "sin versión";
    const v = versiones.get(clave) ?? { version: clave, marco: f.marco ?? null, filas: [] };
    v.filas.push(f);
    versiones.set(clave, v);
  }

  return {
    es_sintetico: esSintetico,
    n: base.length,
    n_malos: malos,
    auc: r4(a.auc),
    auc_intervalo: a.ic ? [r4(a.ic[0]), r4(a.ic[1])] : null,
    gini: a.auc === null ? null : r4(2 * a.auc - 1),
    ks: k ? r4(k.ks) : null,
    por_recomendacion: porRecomendacion,
    por_tramo: [...tramos.values()].sort((x, y) => x.desde - y.desde).map((t) => ({ ...t, tasa: r4(t.malos / t.n) })),
    por_version: [...versiones.values()].sort((x, y) => String(x.version).localeCompare(String(y.version))).map((v) => {
      const c = contar(v.filas);
      return { version: v.version, n: c.n, malos: c.malos, tasa: r4(c.malos / c.n), auc: v.marco ? r4(aucPuntaje(v.filas.filter((f) => !f.bloqueado)).auc) : null };
    }),
    advertencias: [
      ...(malos < 30 ? ["Menos de 30 malos: el AUC y las tasas por recomendación son orientativos."] : []),
      ...(esSintetico ? [AVISO_SINTETICO] : []),
    ],
  };
}

// ------------------------------------------------------------ variables
const fuerzaDelIv = (iv) => (iv < 0.02 ? "nada" : iv < 0.1 ? "débil" : iv < 0.3 ? "media" : "fuerte");

// Lo que calculaba lab_calcular_variables (106 y 110): IV y WoE de cada
// variable del catálogo con la regla de tramos de cortesPorCuantiles, una
// persona una vez. "Llega al modelo": la marca del catálogo y que el campo no
// esté apagado en la configuración de la estructura (`apagados`, como
// "grupo.campo").
export function variablesDelCorte(filas, catalogo, apagados = new Set(), { poblacion = "operaciones", esSintetico = false } = {}) {
  const datos = columnasDelCorte(filas, catalogo);
  const malos = datos.malos.filter(Boolean).length, buenos = datos.malos.length - malos;
  if (!malos || !buenos) throw new Error("El corte no tiene buenos y malos con perfil en esa población");
  const llega = (v) => v.en_perfil_del_modelo !== false && !apagados.has(`${v.ruta?.[0]}.${v.ruta?.[1]}`);
  const conDatos = datos.columnas.map((c) => {
    const v = catalogo.find((x) => x.id === c.id);
    const r = ivDeLaVariable(c, datos.malos, datos.filas, tramosIniciales(c));
    return {
      variable: c.id, nombre: c.nombre, grupo: c.grupo, uso: c.uso, llega_al_modelo: llega(v),
      cobertura: r4(c.valores.filter((x) => x !== null).length / c.valores.length),
      iv: r4(r.iv), fuerza: fuerzaDelIv(r.iv), sospecha_de_fuga: r.iv > 0.5,
      tramos: r.tramos.map((t, i) => ({ tramo: r.etiquetas[i], n: t.n, malos: t.malos, tasa: r4(t.tasa), woe: r4(t.woe) })),
    };
  }).sort((a, b) => b.iv - a.iv);
  // Las que nadie del corte tiene van al final, con IV 0 (la base también las listaba).
  const sinDatos = catalogo.filter((v) => datos.sinDatos.includes(v.id)).map((v) => ({
    variable: v.id, nombre: v.nombre, grupo: v.grupo, uso: v.uso, llega_al_modelo: llega(v), cobertura: 0, iv: 0, fuerza: "nada", sospecha_de_fuga: false, tramos: [],
  }));
  return {
    es_sintetico: esSintetico, poblacion, personas: datos.malos.length, buenos, malos,
    advertencias: [
      ...(malos < 100 ? ["Menos de 100 malos: el IV por variable es ruido; sirve para orientar, no para proponer."] : []),
      ...(poblacion === "solicitudes" ? ["Todas las solicitudes, con el resultado del buró para todos (también para los que recibieron nuestro crédito): un crédito nuevo o uno que ya tenían que cayó en el año."] : []),
      ...(esSintetico ? ["Corte sintético: tiene que encontrar las variables de la regla plantada."] : []),
    ],
    variables: [...conDatos, ...sinDatos],
  };
}

// ----------------------------------------------------------- estabilidad
// PSI del puntaje entre dos cortes, en tramos de a 100 puntos, sobre las
// operaciones observadas con puntaje (con los bloqueados, como hacía
// lab_estabilidad). Menos de 0,1 estable; hasta 0,25 mirar; más, cambió.
export function estabilidadDelPuntaje(filasBase, filasNuevo) {
  const desdes = Array.from({ length: 10 }, (_, i) => i * 100);
  const contar = (fs) => {
    const c = desdes.map(() => 0);
    for (const f of filasObservadas(fs)) if (Number.isFinite(f.puntaje)) c[Math.min(Math.floor(f.puntaje / 100), 9)]++;
    return c;
  };
  const r = psi(contar(filasBase), contar(filasNuevo));
  return { psi: r4(r.psi), tramos: desdes.map((desde, i) => ({ desde, base: r4(r.tramos[i].base), nuevo: r4(r.tramos[i].nuevo) })) };
}

// --------------------------------- lo que cuenta la base, con su estadística
// Las funciones lab_contar_* (111) devuelven conteos; los intervalos y el AUC
// se agregan acá, con estadistica.js.
export const CON_ESTADISTICA = {
  matriz: (r) => ({ ...r, por_decision: (r.por_decision ?? []).map((d) => ({ ...d, intervalo: intervalo(d.malos, d.n) })) }),
  cuadrantes: (r) => ({ ...r, cuadrantes: (r.cuadrantes ?? []).map((c) => ({ ...c, intervalo: intervalo(c.malos, c.observadas) })) }),
  motivos: (r) => ({ ...r, por_evento: (r.por_evento ?? []).map((e) => ({ ...e, intervalo: intervalo(e.malos, e.con_evento) })) }),
  calificacion_simulacion: (r) => {
    const { puntajes_contra_lo_plantado: pares = {}, ...resto } = r;
    const auc = Object.fromEntries(Object.entries(pares).map(([grupo, ps]) => {
      const a = aucPuntaje(ps.map(([puntaje, malo]) => ({ puntaje, malo })));
      return [grupo, { auc: r4(a.auc), buenos: a.buenos, malos: a.malos }];
    }));
    return { ...resto, auc_contra_lo_plantado: auc };
  },
};

// ---------------------------------------------- lo que se guarda de cada pestaña
// Cada pestaña del navegador calcula sobre las filas del corte; lo que se
// guarda es su resultado sin las filas (ni las cédulas ni los puntajes de cada
// persona).
const sin = (objeto, ...claves) => Object.fromEntries(Object.entries(objeto).filter(([k]) => !claves.includes(k)));
export const RESUMEN = {
  discriminacion: (d) => ({ ...sin(d, "base"), n: d.base.length }),
  cosechas: (k) => ({ ...sin(k, "sujetos"), n: k.sujetos.length }),
  los_que_cayeron: (r) => sin(r, "base"),
  umbrales: (u) => sin(u, "puntajes", "acumulados"),
};
export const resumir = (tipo, resultado) => (RESUMEN[tipo] ? RESUMEN[tipo](resultado) : resultado);

// El tamaño de muestra de lo que se guarda (columnas n y n_malos).
export function tamanoDe(resultado) {
  const n = resultado?.n ?? resultado?.personas ?? null;
  const malos = resultado?.n_malos ?? resultado?.malos ?? null;
  return { n: Number.isFinite(n) ? n : null, nMalos: Number.isFinite(malos) ? malos : null };
}
