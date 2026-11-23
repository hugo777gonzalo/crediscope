// El validador del estándar (1.1: «el código valida el estándar al cargarlo y se niega a calcular con
// uno inválido»). Una fracción escrita como 40 en vez de 0,40 aprobaba todo en `capacidad-de-pago.ts`
// (2026-10-17); la misma lección vale acá: un valor fuera de rango, una clave que falta o una que no se
// conoce no se cargan, y cada error dice QUÉ campo, QUÉ se escribió y QUÉ se esperaba.
//
// Función pura. Devuelve TODOS los errores juntos (no sólo el primero): quien configura una institución
// arregla de una vez. Un estándar que pasa queda congelado y registrado, y es el único que aceptan
// quienes lo calculan (`exigirEstandarValido()`): un objeto armado a mano no pasa de contrabando.

import {
  CALIFICACIONES_DE_BANCOS, CLAVES_DE_CELDA, CONTROLES_CONFIGURABLES, CONTROLES_FIJOS, EFECTOS_DE_UN_CONTROL, EVIDENCIAS_DE_LA_CELDA,
  FORMA_DEL_ESTANDAR, HISTORIALES_DE_LA_CELDA, MOMENTOS_DE_UN_REQUISITO, NIVELES_DE_RIESGO, PELDANOS_ACEPTADOS, PLANTILLAS, REQUISITOS_FIJOS,
  SALIDAS, VEREDICTOS_DE_CAPACIDAD, type EstandarDeLaInstitucion, type NivelDeRiesgo, type Salida,
} from "./estandar.ts";

export class EstandarInvalido extends Error {
  readonly errores: string[];
  constructor(errores: string[]) {
    super(`El estándar no se puede cargar (${errores.length} ${errores.length === 1 ? "error" : "errores"}):\n- ${errores.join("\n- ")}`);
    this.name = "EstandarInvalido";
    this.errores = errores;
  }
}

export type ResultadoDeValidar = { ok: true; estandar: EstandarDeLaInstitucion } | { ok: false; errores: string[] };

const APORTE_PERSONAL_IESS = 0.0945;
const CARGA_MAXIMA_DEL_NEGOCIO = 0.6; // C2: del 40 al 60%
const CARGA_MINIMA_ADMITIDA = 0.2;

const validados = new WeakSet<object>();
export const esEstandarValidado = (v: unknown): v is EstandarDeLaInstitucion => typeof v === "object" && v !== null && validados.has(v);
export function exigirEstandarValido(v: unknown): EstandarDeLaInstitucion {
  if (!esEstandarValidado(v)) throw new EstandarInvalido(["El estándar no pasó por validarEstandar() o cargarEstandar(): no se calcula con un estándar sin validar."]);
  return v;
}

type Obj = Record<string, unknown>;
const esObjeto = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const coma = (n: number) => String(n).replace(".", ",");
const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const mostrar = (v: unknown): string => (typeof v === "number" ? coma(v) : typeof v === "string" ? `«${v}»` : v === undefined ? "nada" : JSON.stringify(v));
const dentro = <T extends readonly string[]>(lista: T, v: unknown): v is T[number] => typeof v === "string" && (lista as readonly string[]).includes(v);

function validar(raiz: unknown): string[] {
  const errores: string[] = [];
  const error = (ruta: string, mensaje: string) => errores.push(`${ruta}: ${mensaje}`);

  // ---- primitivas ----
  function objeto(ruta: string, x: unknown, requeridas: readonly string[], opcionales: readonly string[] = []): Obj | null {
    if (!esObjeto(x)) {
      error(ruta, `tiene que ser un objeto con ${requeridas.length ? requeridas.join(", ") : "ninguna clave"}${x === undefined ? " (falta)" : `; se escribió ${mostrar(x)}`}.`);
      return null;
    }
    const faltan = requeridas.filter((k) => !(k in x));
    if (faltan.length) error(ruta, `faltan ${faltan.length === 1 ? "la clave" : "las claves"} ${faltan.join(", ")}.`);
    const sobran = Object.keys(x).filter((k) => !requeridas.includes(k) && !opcionales.includes(k));
    if (sobran.length) error(ruta, `no se conoce ${sobran.length === 1 ? "la clave" : "las claves"} ${sobran.join(", ")}.`);
    return x;
  }
  function numero(ruta: string, x: unknown, min: number, max: number, opciones: { entero?: boolean; unidad?: string } = {}): number | null {
    const u = opciones.unidad ?? "";
    if (typeof x !== "number" || !Number.isFinite(x)) {
      error(ruta, `tiene que ser un número entre ${coma(min)} y ${coma(max)}${u}; se escribió ${mostrar(x)}.`);
      return null;
    }
    if (opciones.entero && !Number.isInteger(x)) {
      error(ruta, `tiene que ser un número entero entre ${coma(min)} y ${coma(max)}${u}; se escribió ${coma(x)}.`);
      return null;
    }
    if (x < min || x > max) {
      error(ruta, `fuera de rango: tiene que estar entre ${coma(min)} y ${coma(max)}${u}; se escribió ${coma(x)}.`);
      return null;
    }
    return x;
  }
  // Una fracción: 0,40 es 40%. Un 40 escrito de más se dice como el error que es.
  function fraccion(ruta: string, x: unknown, min: number, max: number): number | null {
    if (typeof x === "number" && Number.isFinite(x) && x > 1 && x <= 100) {
      error(ruta, `es una fracción (0,40 quiere decir 40%) y se escribió ${coma(x)}: ¿quiso decir ${coma(x / 100)}?`);
      return null;
    }
    return numero(ruta, x, min, max);
  }
  const usd = (ruta: string, x: unknown, min = 0, max = 1_000_000_000) => numero(ruta, x, min, max, { entero: true, unidad: " dólares" });
  function de<T extends readonly string[]>(ruta: string, x: unknown, lista: T): T[number] | null {
    if (dentro(lista, x)) return x;
    error(ruta, `tiene que ser uno de ${lista.join(", ")}; se escribió ${mostrar(x)}.`);
    return null;
  }
  const booleano = (ruta: string, x: unknown): boolean | null => {
    if (typeof x === "boolean") return x;
    error(ruta, `tiene que ser verdadero o falso; se escribió ${mostrar(x)}.`);
    return null;
  };
  function listaDe<T extends readonly string[]>(ruta: string, x: unknown, lista: T, { vacia = false } = {}): T[number][] | null {
    if (!Array.isArray(x) || (!vacia && x.length === 0)) {
      error(ruta, `tiene que ser una lista${vacia ? "" : " con al menos un valor"} de ${lista.join(", ")}.`);
      return null;
    }
    let bien = true;
    for (const [i, e] of x.entries()) bien = (dentro(lista, e) ? true : (error(`${ruta}[${i}]`, `no se conoce ${mostrar(e)}; los valores son ${lista.join(", ")}.`), false)) && bien;
    if (new Set(x).size !== x.length) {
      error(ruta, "tiene un valor repetido.");
      bien = false;
    }
    return bien ? (x as T[number][]) : null;
  }
  function par(ruta: string, x: unknown, min: number, max: number): [number, number] | null {
    if (!Array.isArray(x) || x.length !== 2) {
      error(ruta, `tiene que ser un par [desde, hasta]; se escribió ${mostrar(x)}.`);
      return null;
    }
    const a = numero(`${ruta}[0]`, x[0], min, max, { entero: true });
    const b = numero(`${ruta}[1]`, x[1], min, max, { entero: true });
    if (a === null || b === null) return null;
    if (a > b) {
      error(ruta, `el desde (${a}) no puede superar al hasta (${b}).`);
      return null;
    }
    return [a, b];
  }
  const cadena = (ruta: string, x: unknown, patron: RegExp, esperado: string) => {
    if (typeof x === "string" && patron.test(x)) return x;
    error(ruta, `tiene que ser ${esperado}; se escribió ${mostrar(x)}.`);
    return null;
  };

  const e = objeto("estándar", raiz, [
    "forma", "plantilla", "conBuroDeLaInstitucion", "controles", "riesgo", "malComportamiento", "ingreso", "capacidad", "celdas",
    "siSeSuperaElMontoSinColateral", "matriz", "aprobacionDirecta", "margenDeLaIA", "requisitos", "productos",
  ]);
  if (!e) return errores;
  if (e.forma !== FORMA_DEL_ESTANDAR) error("forma", `tiene que ser ${FORMA_DEL_ESTANDAR}; se escribió ${mostrar(e.forma)}.`);
  de("plantilla", e.plantilla, PLANTILLAS);
  const conBuro = booleano("conBuroDeLaInstitucion", e.conBuroDeLaInstitucion);

  // ---- requisitos (los demás los citan) ----
  const codigosDeRequisitos = new Set<string>();
  if (esObjeto(e.requisitos)) {
    for (const [codigo, r] of Object.entries(e.requisitos)) {
      codigosDeRequisitos.add(codigo);
      cadena(`requisitos.${codigo}`, codigo, /^[a-z][a-z0-9_]{2,60}$/, "un código en minúsculas, sin tildes ni espacios");
      const o = objeto(`requisitos.${codigo}`, r, ["momento"], ["llevaIngresoNecesario"]);
      if (o) {
        de(`requisitos.${codigo}.momento`, o.momento, MOMENTOS_DE_UN_REQUISITO);
        if ("llevaIngresoNecesario" in o) booleano(`requisitos.${codigo}.llevaIngresoNecesario`, o.llevaIngresoNecesario);
      }
    }
    const faltan = REQUISITOS_FIJOS.filter((c) => !codigosDeRequisitos.has(c));
    if (faltan.length) error("requisitos", `faltan los requisitos que usa la matriz por defecto: ${faltan.join(", ")}.`);
  } else error("requisitos", "tiene que ser un objeto con el catálogo de requisitos.");

  // ---- controles ----
  const c = objeto("controles", e.controles, ["fijos", "configurables", "efectos", "consultaParcial"]);
  if (c) {
    if (!Array.isArray(c.fijos) || c.fijos.length !== CONTROLES_FIJOS.length || !CONTROLES_FIJOS.every((f) => (c.fijos as unknown[]).includes(f))) {
      error("controles.fijos", `bloquean siempre y no se quitan ni se agregan: ${CONTROLES_FIJOS.join(", ")}.`);
    }
    const cfg = objeto("controles.configurables", c.configurables, CONTROLES_CONFIGURABLES);
    if (cfg) {
      for (const k of CONTROLES_CONFIGURABLES) de(`controles.configurables.${k}`, cfg[k], EFECTOS_DE_UN_CONTROL);
      if (dentro(EFECTOS_DE_UN_CONTROL, cfg.lista_de_mal_pagador) && cfg.lista_de_mal_pagador !== "dato_de_comportamiento") {
        error("controles.configurables.lista_de_mal_pagador", "la lista de mal pagador es una señal de riesgo y no un control (2.3, O-2): tiene que ser dato_de_comportamiento.");
      }
    }
    const ef = objeto("controles.efectos", c.efectos, EFECTOS_DE_UN_CONTROL);
    if (ef) {
      const salidaMaxima = (ruta: string, x: unknown) => {
        const s = de(ruta, x, SALIDAS);
        if (s === "aprobacion_directa") error(ruta, "un control nunca otorga la Aprobación Directa: la otorga sólo el código.");
      };
      const requisito = (ruta: string, x: unknown) => {
        if (typeof x !== "string" || !codigosDeRequisitos.has(x)) error(ruta, `tiene que ser un requisito del catálogo; se escribió ${mostrar(x)}.`);
      };
      const bloquea = objeto("controles.efectos.bloquea", ef.bloquea, ["salida", "score"]);
      if (bloquea) {
        if (bloquea.salida !== "negar") error("controles.efectos.bloquea.salida", `un bloqueo es siempre Negar; se escribió ${mostrar(bloquea.salida)}.`);
        if (bloquea.score !== 1) error("controles.efectos.bloquea.score", `un bloqueo lleva score 1; se escribió ${mostrar(bloquea.score)}.`);
      }
      for (const k of ["verificar_identidad", "advertencia"] as const) {
        const o = objeto(`controles.efectos.${k}`, ef[k], ["salidaMaxima", "requisito"]);
        if (o) {
          salidaMaxima(`controles.efectos.${k}.salidaMaxima`, o.salidaMaxima);
          requisito(`controles.efectos.${k}.requisito`, o.requisito);
        }
      }
      const lr = objeto("controles.efectos.limita_a_revisar", ef.limita_a_revisar, ["salidaMaxima"]);
      if (lr) salidaMaxima("controles.efectos.limita_a_revisar.salidaMaxima", lr.salidaMaxima);
      for (const k of ["informa", "dato_de_comportamiento"] as const) objeto(`controles.efectos.${k}`, ef[k], []);
    }
    const cp = objeto("controles.consultaParcial", c.consultaParcial, ["salidaMaxima"]);
    if (cp && de("controles.consultaParcial.salidaMaxima", cp.salidaMaxima, SALIDAS) === "aprobacion_directa") {
      error("controles.consultaParcial.salidaMaxima", "una consulta parcial nunca llega a la Aprobación Directa.");
    }
  }

  // ---- riesgo ----
  const r = objeto("riesgo", e.riesgo, ["bandasDelScore", "scoreMaximoSinHistorial", "senales", "moraVigente"]);
  let bandaBajoDesde = 750;
  let bandaDeterioradoHasta = 599;
  if (r) {
    const b = objeto("riesgo.bandasDelScore", r.bandasDelScore, NIVELES_DE_RIESGO);
    if (b) {
      const bandas = Object.fromEntries(NIVELES_DE_RIESGO.map((n) => [n, par(`riesgo.bandasDelScore.${n}`, b[n], 1, 999)])) as Record<NivelDeRiesgo, [number, number] | null>;
      let anterior = 0;
      for (const n of ["mal_comportamiento", "deteriorado", "con_observaciones", "bajo"] as const) {
        const x = bandas[n];
        if (!x) continue;
        // El ancho mínimo de una banda es 150: el mismo perfil analizado dos veces mueve el score unos 40 (2.2).
        if (x[1] - x[0] + 1 < 150) error(`riesgo.bandasDelScore.${n}`, `una banda de menos de 150 puntos mide ruido (el mismo perfil mueve el score unos 40); se escribió ${x[0]} a ${x[1]}.`);
        if (x[0] !== anterior + 1) error(`riesgo.bandasDelScore.${n}`, `las bandas no pueden dejar huecos ni pisarse: tendría que empezar en ${anterior + 1} y empieza en ${x[0]}.`);
        anterior = x[1];
      }
      if (anterior !== 999) error("riesgo.bandasDelScore.bajo", `la banda de riesgo bajo tiene que llegar a 999; llega a ${anterior}.`);
      if (bandas.bajo) bandaBajoDesde = bandas.bajo[0];
      if (bandas.deteriorado) bandaDeterioradoHasta = bandas.deteriorado[1];
    }
    numero("riesgo.scoreMaximoSinHistorial", r.scoreMaximoSinHistorial, bandaBajoDesde, 999, { entero: true });

    const s = objeto("riesgo.senales", r.senales, [
      "calificacionEnBancos", "diasDeMoraIessBiess", "retailAlCorte", "operacionCastigadaOEnCobroJudicial", "listaDeMalPagador",
      "comoGaranteBajaUnNivel", "pensionAlimenticiaEnMora", "multasDeTransito", "impedimentoParaCargosPublicos", "rucSuspendidoNoDepurado",
    ]);
    if (s) {
      const letras = objeto("riesgo.senales.calificacionEnBancos", s.calificacionEnBancos, ["con_observaciones", "deteriorado", "mal_comportamiento"]);
      if (letras) {
        const escala = CALIFICACIONES_DE_BANCOS.slice(1); // A1 es la única sin atraso: nunca va en una lista
        const porNivel = (["con_observaciones", "deteriorado", "mal_comportamiento"] as const).map((n) => ({ n, v: listaDe(`riesgo.senales.calificacionEnBancos.${n}`, letras[n], escala) }));
        if (porNivel.every((x) => x.v)) {
          const todas = porNivel.flatMap((x) => x.v!);
          if (new Set(todas).size !== todas.length) error("riesgo.senales.calificacionEnBancos", "una letra no puede estar en dos niveles.");
          const faltan = escala.filter((l) => !todas.includes(l));
          if (faltan.length) error("riesgo.senales.calificacionEnBancos", `toda calificación con atraso tiene que tener su nivel; faltan ${faltan.join(", ")} (A1 es la única sin atraso y no se lista).`);
          const posicion = (l: string) => escala.indexOf(l as typeof escala[number]);
          const [co, de_, mc] = porNivel.map((x) => x.v!.map(posicion));
          if (Math.max(...co) > Math.min(...de_) || Math.max(...de_) > Math.min(...mc)) error("riesgo.senales.calificacionEnBancos", "un nivel más grave no puede tener una letra mejor que uno más leve.");
          if (!porNivel[2].v!.includes("E")) error("riesgo.senales.calificacionEnBancos.mal_comportamiento", "la E es la peor calificación: tiene que estar en mal comportamiento.");
        }
      }
      const d = objeto("riesgo.senales.diasDeMoraIessBiess", s.diasDeMoraIessBiess, ["con_observaciones", "deteriorado", "malComportamientoDesde"]);
      if (d) {
        const co = par("riesgo.senales.diasDeMoraIessBiess.con_observaciones", d.con_observaciones, 1, 1000);
        const de_ = par("riesgo.senales.diasDeMoraIessBiess.deteriorado", d.deteriorado, 1, 1000);
        const mc = numero("riesgo.senales.diasDeMoraIessBiess.malComportamientoDesde", d.malComportamientoDesde, 2, 1001, { entero: true });
        if (co && co[0] !== 1) error("riesgo.senales.diasDeMoraIessBiess.con_observaciones", `tiene que empezar en el día 1; empieza en ${co[0]}.`);
        if (co && de_ && de_[0] !== co[1] + 1) error("riesgo.senales.diasDeMoraIessBiess.deteriorado", `tiene que empezar donde termina el tramo anterior (${co[1] + 1}); empieza en ${de_[0]}.`);
        if (de_ && mc !== null && mc !== de_[1] + 1) error("riesgo.senales.diasDeMoraIessBiess.malComportamientoDesde", `tiene que ser el día siguiente al fin del deteriorado (${de_[1] + 1}); se escribió ${mc}.`);
      }
      const rt = objeto("riesgo.senales.retailAlCorte", s.retailAlCorte, ["deterioradoDesdeDias", "malComportamientoDesdeDias", "valorVencidoMinimoUsd"]);
      if (rt) {
        const a = numero("riesgo.senales.retailAlCorte.deterioradoDesdeDias", rt.deterioradoDesdeDias, 1, 365, { entero: true });
        const m = numero("riesgo.senales.retailAlCorte.malComportamientoDesdeDias", rt.malComportamientoDesdeDias, 2, 366, { entero: true });
        if (a !== null && m !== null && m <= a) error("riesgo.senales.retailAlCorte.malComportamientoDesdeDias", `tiene que ser mayor que el del deteriorado (${a}); se escribió ${m}.`);
        usd("riesgo.senales.retailAlCorte.valorVencidoMinimoUsd", rt.valorVencidoMinimoUsd, 0, 10_000);
      }
      de("riesgo.senales.operacionCastigadaOEnCobroJudicial", s.operacionCastigadaOEnCobroJudicial, NIVELES_DE_RIESGO);
      de("riesgo.senales.listaDeMalPagador", s.listaDeMalPagador, NIVELES_DE_RIESGO);
      booleano("riesgo.senales.comoGaranteBajaUnNivel", s.comoGaranteBajaUnNivel);
      const pe = objeto("riesgo.senales.pensionAlimenticiaEnMora", s.pensionAlimenticiaEnMora, ["toleranciaUsd", "porEncima"]);
      if (pe) {
        usd("riesgo.senales.pensionAlimenticiaEnMora.toleranciaUsd", pe.toleranciaUsd, 0, 10_000);
        de("riesgo.senales.pensionAlimenticiaEnMora.porEncima", pe.porEncima, ["revisar", "negar"] as const);
      }
      const mt = objeto("riesgo.senales.multasDeTransito", s.multasDeTransito, ["conObservacionesDesdeSalariosBasicos"]);
      if (mt) numero("riesgo.senales.multasDeTransito.conObservacionesDesdeSalariosBasicos", mt.conObservacionesDesdeSalariosBasicos, 0.5, 20);
      // Regla vigente del marco: ni el impedimento para cargos públicos ni un RUC suspendido alcanzan para negar.
      for (const k of ["impedimentoParaCargosPublicos", "rucSuspendidoNoDepurado"] as const) de(`riesgo.senales.${k}`, s[k], ["bajo", "con_observaciones", "deteriorado"] as const);
    }

    const m = objeto("riesgo.moraVigente", r.moraVigente, [
      "masDeDias", "atrasoCortoNivel", "sectores", "masDeNoventaDiasConMontoTolerable", "tramoRevisarConCapacidadQueAlcanza", "comoGaranteBajaUnTramo", "revisionDeLosUmbrales",
    ]);
    if (m) {
      numero("riesgo.moraVigente.masDeDias", m.masDeDias, 1, 90, { entero: true });
      de("riesgo.moraVigente.atrasoCortoNivel", m.atrasoCortoNivel, ["bajo", "con_observaciones", "deteriorado"] as const);
      const sec = objeto("riesgo.moraVigente.sectores", m.sectores, ["sbs", "seps", "comercial"]);
      if (sec) {
        for (const k of ["sbs", "seps", "comercial"] as const) {
          const o = objeto(`riesgo.moraVigente.sectores.${k}`, sec[k], ["aceptarHastaUsd", "revisarHastaUsd"]);
          if (!o) continue;
          // Dólares enteros, no negativos: un decimal o un monto negativo es un error de tipeo, no una política.
          const a = usd(`riesgo.moraVigente.sectores.${k}.aceptarHastaUsd`, o.aceptarHastaUsd, 0, 100_000);
          const rv = usd(`riesgo.moraVigente.sectores.${k}.revisarHastaUsd`, o.revisarHastaUsd, 0, 100_000);
          if (a !== null && rv !== null && a > rv) {
            error(`riesgo.moraVigente.sectores.${k}`, `aceptar hasta USD ${miles(a)} supera a revisar hasta USD ${miles(rv)}: el tramo de Aceptar tiene que ser el menor.`);
          }
        }
      }
      de("riesgo.moraVigente.masDeNoventaDiasConMontoTolerable", m.masDeNoventaDiasConMontoTolerable, ["revisar", "negar"] as const);
      de("riesgo.moraVigente.tramoRevisarConCapacidadQueAlcanza", m.tramoRevisarConCapacidadQueAlcanza, ["condicionado", "revisar"] as const);
      booleano("riesgo.moraVigente.comoGaranteBajaUnTramo", m.comoGaranteBajaUnTramo);
      const rev = objeto("riesgo.moraVigente.revisionDeLosUmbrales", m.revisionDeLosUmbrales, ["cadaAnioEn", "proximaRevision"]);
      if (rev) {
        if (rev.cadaAnioEn !== "enero") error("riesgo.moraVigente.revisionDeLosUmbrales.cadaAnioEn", `los umbrales en dólares se revisan cada enero (decisión del negocio, 2026-11-22); se escribió ${mostrar(rev.cadaAnioEn)}.`);
        const f = cadena("riesgo.moraVigente.revisionDeLosUmbrales.proximaRevision", rev.proximaRevision, /^\d{4}-\d{2}-\d{2}$/, "una fecha aaaa-mm-dd");
        if (f) {
          const fecha = new Date(`${f}T00:00:00Z`);
          if (Number.isNaN(fecha.getTime()) || fecha.toISOString().slice(0, 10) !== f) error("riesgo.moraVigente.revisionDeLosUmbrales.proximaRevision", `${f} no es una fecha que exista.`);
          else if (f.slice(5, 7) !== "01") error("riesgo.moraVigente.revisionDeLosUmbrales.proximaRevision", `la revisión de los umbrales en dólares es en enero; se escribió ${f}.`);
        }
      }
    }
  }

  // ---- malComportamiento ----
  const mc = objeto("malComportamiento", e.malComportamiento, ["demandaDeCobro", "atenuantes", "minimoDeAtenuantes", "salidasQueLaIAPuedeRecomendar", "bandaDelScoreSiLaIASube"]);
  let salidasDeLaIA: string[] | null = null;
  if (mc) {
    const dc = objeto("malComportamiento.demandaDeCobro", mc.demandaDeCobro, ["ventanaAnios", "pesaMenosHastaAnios", "nivelMientrasPesaMenos", "cuentaSiDemanda", "deUnaPersonaNatural", "reiteradas"]);
    if (dc) {
      const v = numero("malComportamiento.demandaDeCobro.ventanaAnios", dc.ventanaAnios, 1, 10, { entero: true });
      const p = numero("malComportamiento.demandaDeCobro.pesaMenosHastaAnios", dc.pesaMenosHastaAnios, 1, 10, { entero: true });
      if (v !== null && p !== null && p <= v) error("malComportamiento.demandaDeCobro.pesaMenosHastaAnios", `tiene que ser mayor que la ventana de mal comportamiento (${v} años); se escribió ${p}.`);
      de("malComportamiento.demandaDeCobro.nivelMientrasPesaMenos", dc.nivelMientrasPesaMenos, ["con_observaciones", "deteriorado"] as const);
      listaDe("malComportamiento.demandaDeCobro.cuentaSiDemanda", dc.cuentaSiDemanda, ["institucion_financiera", "empresa"] as const);
      de("malComportamiento.demandaDeCobro.deUnaPersonaNatural", dc.deUnaPersonaNatural, NIVELES_DE_RIESGO);
      const re = objeto("malComportamiento.demandaDeCobro.reiteradas", dc.reiteradas, ["cantidad", "enAnios"]);
      if (re) {
        numero("malComportamiento.demandaDeCobro.reiteradas.cantidad", re.cantidad, 2, 20, { entero: true });
        numero("malComportamiento.demandaDeCobro.reiteradas.enAnios", re.enAnios, 1, 10, { entero: true });
      }
    }
    const at = objeto("malComportamiento.atenuantes", mc.atenuantes, ["hoyAlDia", "endeudamientoALaBaja", "estabilidad", "ingresoAlAlza"]);
    if (at) {
      const h = objeto("malComportamiento.atenuantes.hoyAlDia", at.hoyAlDia, ["calificacionAdmitida", "diasDeMoraAdmitidos"]);
      if (h) {
        if (!Array.isArray(h.calificacionAdmitida) || h.calificacionAdmitida.length !== 1 || h.calificacionAdmitida[0] !== "A1") error("malComportamiento.atenuantes.hoyAlDia.calificacionAdmitida", "A1 es la única calificación sin atraso: tiene que ser [«A1»].");
        if (h.diasDeMoraAdmitidos !== 0) error("malComportamiento.atenuantes.hoyAlDia.diasDeMoraAdmitidos", `estar al día es 0 días de mora; se escribió ${mostrar(h.diasDeMoraAdmitidos)}.`);
      }
      const eb = objeto("malComportamiento.atenuantes.endeudamientoALaBaja", at.endeudamientoALaBaja, ["bajaMinima", "enMeses", "sinBuro"]);
      if (eb) {
        fraccion("malComportamiento.atenuantes.endeudamientoALaBaja.bajaMinima", eb.bajaMinima, 0.01, 1);
        numero("malComportamiento.atenuantes.endeudamientoALaBaja.enMeses", eb.enMeses, 1, 36, { entero: true });
        if (eb.sinBuro !== "no_medido") error("malComportamiento.atenuantes.endeudamientoALaBaja.sinBuro", "sin buró el endeudamiento a la baja no se mide: tiene que ser «no_medido» (un atenuante no medido no cuenta ni a favor ni en contra).");
      }
      const es = objeto("malComportamiento.atenuantes.estabilidad", at.estabilidad, ["mesesMinimos"]);
      if (es) numero("malComportamiento.atenuantes.estabilidad.mesesMinimos", es.mesesMinimos, 1, 60, { entero: true });
      const ia = objeto("malComportamiento.atenuantes.ingresoAlAlza", at.ingresoAlAlza, ["alzaMinima", "compara"]);
      if (ia) {
        fraccion("malComportamiento.atenuantes.ingresoAlAlza.alzaMinima", ia.alzaMinima, 0.01, 1);
        if (ia.compara !== "ultimos_6_meses_contra_los_6_anteriores") error("malComportamiento.atenuantes.ingresoAlAlza.compara", "tiene que ser «ultimos_6_meses_contra_los_6_anteriores».");
      }
    }
    if (mc.minimoDeAtenuantes !== 0) error("malComportamiento.minimoDeAtenuantes", `no hay número mínimo de atenuantes (decidido): tiene que ser 0; se escribió ${mostrar(mc.minimoDeAtenuantes)}.`);
    const sr = listaDe("malComportamiento.salidasQueLaIAPuedeRecomendar", mc.salidasQueLaIAPuedeRecomendar, ["negar", "revisar", "aprobar"] as const);
    if (sr) {
      salidasDeLaIA = sr;
      if (!sr.includes("negar")) error("malComportamiento.salidasQueLaIAPuedeRecomendar", "la IA siempre puede mantener Negar: la lista tiene que incluirlo.");
    }
    const bs = par("malComportamiento.bandaDelScoreSiLaIASube", mc.bandaDelScoreSiLaIASube, 1, 999);
    if (bs && bs[1] > bandaDeterioradoHasta) error("malComportamiento.bandaDelScoreSiLaIASube", `si la IA sube, el score no pasa de la banda de deteriorado (${bandaDeterioradoHasta}); se escribió ${bs[0]} a ${bs[1]}.`);
  }

  // ---- ingreso ----
  const ing = objeto("ingreso", e.ingreso, ["aceptadoPorPeldano", "declaradoCoherenteHastaVeces", "cargaParaLaCotaPorCuotas"]);
  if (ing) {
    const ap = objeto("ingreso.aceptadoPorPeldano", ing.aceptadoPorPeldano, PELDANOS_ACEPTADOS);
    if (ap) {
      const f: Record<string, number | null> = {};
      for (const k of PELDANOS_ACEPTADOS) f[k] = fraccion(`ingreso.aceptadoPorPeldano.${k}`, ap[k], 0, 1);
      if (f.verificado_por_un_tercero !== null && f.verificado_por_un_tercero !== 1) error("ingreso.aceptadoPorPeldano.verificado_por_un_tercero", `el sueldo que informa un tercero se acepta entero (1); se escribió ${coma(f.verificado_por_un_tercero!)}.`);
      const debil = f.declarado_coherente;
      for (const k of ["verificado_por_un_tercero", "verificado_con_documento", "cota_por_credito_otorgado"]) {
        if (debil !== null && f[k] !== null && debil > f[k]!) error("ingreso.aceptadoPorPeldano.declarado_coherente", `un ingreso declarado no se acepta más que uno de ${k} (${coma(f[k]!)}); se escribió ${coma(debil)}.`);
      }
      if (f.declarado_sin_respaldo !== null && debil !== null && f.declarado_sin_respaldo > debil) error("ingreso.aceptadoPorPeldano.declarado_sin_respaldo", "lo declarado sin respaldo no se acepta más que lo declarado coherente.");
      // El predictor sin buró no entra en la capacidad (medido: es débil): sólo con el buró de la institución se decide su fracción.
      if (conBuro === false && f.minimo_certificado !== null && f.minimo_certificado !== 0) error("ingreso.aceptadoPorPeldano.minimo_certificado", `sin buró de la institución el mínimo del predictor no sostiene la capacidad: tiene que ser 0; se escribió ${coma(f.minimo_certificado!)}.`);
    }
    numero("ingreso.declaradoCoherenteHastaVeces", ing.declaradoCoherenteHastaVeces, 1, 3);
    fraccion("ingreso.cargaParaLaCotaPorCuotas", ing.cargaParaLaCotaPorCuotas, 0.1, 1);
  }

  // ---- capacidad ----
  const cap = objeto("capacidad", e.capacidad, ["cargaMaxima", "margenJusto", "aportePersonalIess", "cargaExtendida", "cargaMaximaPorRiesgo", "cuotaEstimadaDeDeudaSinCuota", "creditoDeReferencia", "historialProbado"]);
  let creditoDeReferencia: { monto: number; plazoMeses: number } | null = null;
  if (cap) {
    const cm = fraccion("capacidad.cargaMaxima", cap.cargaMaxima, CARGA_MINIMA_ADMITIDA, CARGA_MAXIMA_DEL_NEGOCIO);
    const mj = fraccion("capacidad.margenJusto", cap.margenJusto, 0, 0.15);
    if (cm !== null && mj !== null && mj >= cm) error("capacidad.margenJusto", `el margen (${coma(mj)}) tiene que ser menor que la carga máxima (${coma(cm)}).`);
    if (cap.aportePersonalIess !== APORTE_PERSONAL_IESS) error("capacidad.aportePersonalIess", `es el aporte personal del régimen general del IESS, fijo en CrediScope: ${coma(APORTE_PERSONAL_IESS)}; se escribió ${mostrar(cap.aportePersonalIess)}.`);
    const ex = objeto("capacidad.cargaExtendida", cap.cargaExtendida, ["habilitada", "hasta", "exigeRiesgo", "exigeHistorial", "exigeEvidencia"]);
    if (ex) {
      const hab = booleano("capacidad.cargaExtendida.habilitada", ex.habilitada);
      const hasta = fraccion("capacidad.cargaExtendida.hasta", ex.hasta, cm ?? CARGA_MINIMA_ADMITIDA, CARGA_MAXIMA_DEL_NEGOCIO);
      if (hab === true && hasta !== null && cm !== null && hasta <= cm) error("capacidad.cargaExtendida.hasta", `una carga extendida habilitada tiene que superar a la máxima (${coma(cm)}); se escribió ${coma(hasta)}.`);
      de("capacidad.cargaExtendida.exigeRiesgo", ex.exigeRiesgo, ["bajo", "con_observaciones", "deteriorado"] as const);
      de("capacidad.cargaExtendida.exigeHistorial", ex.exigeHistorial, HISTORIALES_DE_LA_CELDA);
      de("capacidad.cargaExtendida.exigeEvidencia", ex.exigeEvidencia, EVIDENCIAS_DE_LA_CELDA);
    }
    const cr = objeto("capacidad.cargaMaximaPorRiesgo", cap.cargaMaximaPorRiesgo, ["baseDeLaCarga", "porNivel"]);
    if (cr) {
      if (cr.baseDeLaCarga !== "neto_disponible") error("capacidad.cargaMaximaPorRiesgo.baseDeLaCarga", "la carga (C2) se calcula sobre el neto disponible: tiene que ser «neto_disponible».");
      const pn = objeto("capacidad.cargaMaximaPorRiesgo.porNivel", cr.porNivel, ["bajo", "con_observaciones", "deteriorado"]);
      if (pn) {
        const v = (["bajo", "con_observaciones", "deteriorado"] as const).map((n) => fraccion(`capacidad.cargaMaximaPorRiesgo.porNivel.${n}`, pn[n], cm ?? CARGA_MINIMA_ADMITIDA, CARGA_MAXIMA_DEL_NEGOCIO));
        if (v[0] !== null && v[1] !== null && v[2] !== null && !(v[0] >= v[1] && v[1] >= v[2])) error("capacidad.cargaMaximaPorRiesgo.porNivel", "más riesgo, menos carga (C2): la de riesgo bajo no puede ser menor que la de con observaciones, ni ésta menor que la de deteriorado.");
      }
    }
    const ce = objeto("capacidad.cuotaEstimadaDeDeudaSinCuota", cap.cuotaEstimadaDeDeudaSinCuota, ["tramosDeSaldo", "hipotecarioSinPlazo", "fraccionParaLaAprobacionDirecta"]);
    if (ce) {
      if (!Array.isArray(ce.tramosDeSaldo) || ce.tramosDeSaldo.length === 0) error("capacidad.cuotaEstimadaDeDeudaSinCuota.tramosDeSaldo", "tiene que ser una lista de tramos de saldo, del menor al mayor, y el último sin tope (null).");
      else {
        let anterior = 0;
        for (const [i, t] of ce.tramosDeSaldo.entries()) {
          const ruta = `capacidad.cuotaEstimadaDeDeudaSinCuota.tramosDeSaldo[${i}]`;
          const o = objeto(ruta, t, ["hastaSaldoPorOperacion", "factor"]);
          if (!o) continue;
          fraccion(`${ruta}.factor`, o.factor, 0.001, 0.25);
          const ultimo = i === (ce.tramosDeSaldo as unknown[]).length - 1;
          if (ultimo) {
            if (o.hastaSaldoPorOperacion !== null) error(`${ruta}.hastaSaldoPorOperacion`, "el último tramo no tiene tope: tiene que ser null.");
          } else {
            const h = usd(`${ruta}.hastaSaldoPorOperacion`, o.hastaSaldoPorOperacion, 1);
            if (h !== null) {
              if (h <= anterior) error(`${ruta}.hastaSaldoPorOperacion`, `los tramos van de menor a mayor: USD ${miles(h)} no supera a USD ${miles(anterior)}.`);
              anterior = h;
            }
          }
        }
      }
      fraccion("capacidad.cuotaEstimadaDeDeudaSinCuota.hipotecarioSinPlazo", ce.hipotecarioSinPlazo, 0.001, 0.25);
      fraccion("capacidad.cuotaEstimadaDeDeudaSinCuota.fraccionParaLaAprobacionDirecta", ce.fraccionParaLaAprobacionDirecta, 0.001, 0.25);
    }
    const ref = objeto("capacidad.creditoDeReferencia", cap.creditoDeReferencia, ["monto", "plazoMeses"]);
    if (ref) {
      const monto = usd("capacidad.creditoDeReferencia.monto", ref.monto, 1);
      const plazo = numero("capacidad.creditoDeReferencia.plazoMeses", ref.plazoMeses, 1, 480, { entero: true });
      if (monto !== null && plazo !== null) creditoDeReferencia = { monto, plazoMeses: plazo };
    }
    const hp = objeto("capacidad.historialProbado", cap.historialProbado, ["deudaAlDiaDesdeUsd", "operacionesAlDiaDesde"]);
    if (hp) {
      usd("capacidad.historialProbado.deudaAlDiaDesdeUsd", hp.deudaAlDiaDesdeUsd, 1);
      numero("capacidad.historialProbado.operacionesAlDiaDesde", hp.operacionesAlDiaDesde, 1, 10, { entero: true });
    }
  }

  // ---- productos ----
  let montoMaximoDeProductos = 0;
  let plazoMaximoDeProductos = 0;
  let productoDeReferencia = false;
  if (esObjeto(e.productos) && Object.keys(e.productos).length > 0 && Object.keys(e.productos).length <= 20) {
    for (const [clave, p] of Object.entries(e.productos)) {
      const ruta = `productos.${clave}`;
      cadena(ruta, clave, /^[a-z][a-z0-9_]{1,40}$/, "un código en minúsculas, sin tildes ni espacios");
      const o = objeto(ruta, p, [
        "nombre", "montoMinimo", "montoMaximo", "plazoMinimoMeses", "plazoMaximoMeses", "tasaNominalMinimaPorcentaje", "tasaNominalMaximaPorcentaje",
        "desgravamenAnualPorcentaje", "pideGarante", "colateral",
      ]);
      if (!o) continue;
      cadena(`${ruta}.nombre`, o.nombre, /^.{1,80}$/, "un nombre de hasta 80 caracteres");
      const mn = usd(`${ruta}.montoMinimo`, o.montoMinimo, 1, 10_000_000);
      const mx = usd(`${ruta}.montoMaximo`, o.montoMaximo, 1, 10_000_000);
      if (mn !== null && mx !== null && mx < mn) error(`${ruta}.montoMaximo`, `el monto máximo (USD ${miles(mx)}) no puede ser menor que el mínimo (USD ${miles(mn)}).`);
      const pn = numero(`${ruta}.plazoMinimoMeses`, o.plazoMinimoMeses, 1, 480, { entero: true });
      const px = numero(`${ruta}.plazoMaximoMeses`, o.plazoMaximoMeses, 1, 480, { entero: true });
      if (pn !== null && px !== null && px < pn) error(`${ruta}.plazoMaximoMeses`, `el plazo máximo (${px} meses) no puede ser menor que el mínimo (${pn}).`);
      const tn = numero(`${ruta}.tasaNominalMinimaPorcentaje`, o.tasaNominalMinimaPorcentaje, 0, 100, { unidad: " %" });
      const tx = numero(`${ruta}.tasaNominalMaximaPorcentaje`, o.tasaNominalMaximaPorcentaje, 0, 100, { unidad: " %" });
      if (tn !== null && tx !== null && tx < tn) error(`${ruta}.tasaNominalMaximaPorcentaje`, `la Tasa máxima (${coma(tx)} %) no puede ser menor que la Tasa mínima (${coma(tn)} %).`);
      numero(`${ruta}.desgravamenAnualPorcentaje`, o.desgravamenAnualPorcentaje, 0, 5, { unidad: " %" });
      booleano(`${ruta}.pideGarante`, o.pideGarante);
      de(`${ruta}.colateral`, o.colateral, ["no_lo_pide", "lo_pide_siempre", "lo_pide_segun_la_celda"] as const);
      if (mx !== null) montoMaximoDeProductos = Math.max(montoMaximoDeProductos, mx);
      if (px !== null) plazoMaximoDeProductos = Math.max(plazoMaximoDeProductos, px);
      if (creditoDeReferencia && mn !== null && mx !== null && pn !== null && px !== null && creditoDeReferencia.monto >= mn && creditoDeReferencia.monto <= mx && creditoDeReferencia.plazoMeses >= pn && creditoDeReferencia.plazoMeses <= px) productoDeReferencia = true;
    }
    if (creditoDeReferencia && !productoDeReferencia) error("capacidad.creditoDeReferencia", `el crédito de referencia (USD ${miles(creditoDeReferencia.monto)} a ${creditoDeReferencia.plazoMeses} meses) no entra en ningún producto del catálogo.`);
  } else error("productos", "el catálogo tiene que tener entre 1 y 20 productos, cada uno con su monto, plazo, tasa y lo que pide (garante y colateral son de cada institución, C4).");

  // ---- aprobación directa (C3) ----
  const ad = objeto("aprobacionDirecta", e.aprobacionDirecta, [
    "habilitada", "exigeControles", "exigeConsulta", "diasMaximosDeLaConsulta", "exigeRiesgo", "aniosSinDemandaDeCobro", "exigeCapacidad", "exigePeldano",
    "historialesAdmitidos", "mesesMinimosDeEstabilidad", "montoMaximo", "montoMaximoEnIngresos", "plazoMaximoMeses", "scoreMinimo",
  ]);
  let adHabilitada: boolean | null = null;
  let adHistoriales: string[] | null = null;
  if (ad) {
    adHabilitada = booleano("aprobacionDirecta.habilitada", ad.habilitada);
    if (ad.exigeControles !== "limpio") error("aprobacionDirecta.exigeControles", "la Aprobación Directa exige controles limpios (sin bloqueo, verificación de identidad ni PEP).");
    if (ad.exigeConsulta !== "completa") error("aprobacionDirecta.exigeConsulta", "la Aprobación Directa exige la consulta completa.");
    numero("aprobacionDirecta.diasMaximosDeLaConsulta", ad.diasMaximosDeLaConsulta, 1, 90, { entero: true });
    if (ad.exigeRiesgo !== "bajo") error("aprobacionDirecta.exigeRiesgo", "la Aprobación Directa exige riesgo bajo.");
    numero("aprobacionDirecta.aniosSinDemandaDeCobro", ad.aniosSinDemandaDeCobro, 1, 10, { entero: true });
    if (ad.exigeCapacidad !== "alcanza") error("aprobacionDirecta.exigeCapacidad", "la Aprobación Directa exige que la capacidad alcance (con margen).");
    de("aprobacionDirecta.exigePeldano", ad.exigePeldano, ["verificado_por_un_tercero", "verificado_con_documento"] as const);
    adHistoriales = listaDe("aprobacionDirecta.historialesAdmitidos", ad.historialesAdmitidos, ["probado", "corto"] as const);
    if (adHistoriales && !adHistoriales.includes("probado")) error("aprobacionDirecta.historialesAdmitidos", "el historial probado siempre tiene que estar admitido.");
    numero("aprobacionDirecta.mesesMinimosDeEstabilidad", ad.mesesMinimosDeEstabilidad, 0, 60, { entero: true });
    const monto = usd("aprobacionDirecta.montoMaximo", ad.montoMaximo, 1);
    if (monto !== null && montoMaximoDeProductos > 0 && monto > montoMaximoDeProductos) error("aprobacionDirecta.montoMaximo", `no puede superar el monto máximo del catálogo (USD ${miles(montoMaximoDeProductos)}); se escribió USD ${miles(monto)}.`);
    numero("aprobacionDirecta.montoMaximoEnIngresos", ad.montoMaximoEnIngresos, 0.5, 12);
    const plazo = numero("aprobacionDirecta.plazoMaximoMeses", ad.plazoMaximoMeses, 1, 480, { entero: true });
    if (plazo !== null && plazoMaximoDeProductos > 0 && plazo > plazoMaximoDeProductos) error("aprobacionDirecta.plazoMaximoMeses", `no puede superar el plazo máximo del catálogo (${plazoMaximoDeProductos} meses); se escribió ${plazo}.`);
    numero("aprobacionDirecta.scoreMinimo", ad.scoreMinimo, bandaBajoDesde, 999, { entero: true });
  }

  // ---- celdas ----
  const celdas = objeto("celdas", e.celdas, CLAVES_DE_CELDA);
  if (celdas) {
    for (const clave of CLAVES_DE_CELDA) {
      const ruta = `celdas.${clave}`;
      const o = objeto(ruta, celdas[clave], ["salidaMaxima"], ["montoMaximoEnIngresos", "plazoMaximoMeses", "montoMaximo", "montoMaximoSinColateral", "cuotaMaxima"]);
      if (!o) continue;
      const salida = de(`${ruta}.salidaMaxima`, o.salidaMaxima, SALIDAS);
      const [evidencia, historial] = clave.split("/");
      if (salida === "aprobacion_directa") {
        if (adHabilitada === false) error(`${ruta}.salidaMaxima`, "la Aprobación Directa está apagada para esta institución: ninguna celda puede llegar a ella.");
        if (evidencia !== "verificado") error(`${ruta}.salidaMaxima`, "sólo una celda con ingreso verificado llega a la Aprobación Directa.");
        if (adHistoriales && !adHistoriales.includes(historial)) error(`${ruta}.salidaMaxima`, `el historial ${historial} no está entre los admitidos por la Aprobación Directa.`);
      } else if (salida && evidencia === "verificado" && adHabilitada === true && adHistoriales?.includes(historial)) {
        error(`${ruta}.salidaMaxima`, `la Aprobación Directa admite el historial ${historial} con ingreso verificado: la celda tiene que poder llegar a ella.`);
      }
      if (salida && evidencia === "sin_evidencia" && !["condicionado", "revisar", "negar"].includes(salida)) error(`${ruta}.salidaMaxima`, "sin evidencia del ingreso no se aprueba: la salida máxima es Aprobado con Requisitos (condicionado), Revisar o Negar.");
      if ("montoMaximoEnIngresos" in o) numero(`${ruta}.montoMaximoEnIngresos`, o.montoMaximoEnIngresos, 0.5, 24);
      if ("plazoMaximoMeses" in o) numero(`${ruta}.plazoMaximoMeses`, o.plazoMaximoMeses, 1, 480, { entero: true });
      if ("montoMaximo" in o) usd(`${ruta}.montoMaximo`, o.montoMaximo, 1);
      if ("montoMaximoSinColateral" in o) usd(`${ruta}.montoMaximoSinColateral`, o.montoMaximoSinColateral, 1);
      if ("cuotaMaxima" in o && o.cuotaMaxima !== "la_mayor_cuota_pagada_al_dia") error(`${ruta}.cuotaMaxima`, "tiene que ser «la_mayor_cuota_pagada_al_dia» (reemplazo de cuota).");
    }
  }
  de("siSeSuperaElMontoSinColateral", e.siSeSuperaElMontoSinColateral, ["cambio_de_condiciones", "condicionado"] as const);

  // ---- matriz ----
  const matriz = objeto("matriz", e.matriz, NIVELES_DE_RIESGO);
  if (matriz) {
    const rango_: Record<string, number> = { aprobar: 3, cambio_de_condiciones: 2, condicionado: 2, revisar: 1, negar: 0 };
    const admite: Record<NivelDeRiesgo, readonly Salida[]> = {
      bajo: ["aprobar", "cambio_de_condiciones", "condicionado", "revisar", "negar"],
      con_observaciones: ["aprobar", "cambio_de_condiciones", "condicionado", "revisar", "negar"],
      deteriorado: ["condicionado", "revisar", "negar"],
      mal_comportamiento: ["negar"],
    };
    const valores: Record<string, Record<string, string | null>> = {};
    for (const nivel of NIVELES_DE_RIESGO) {
      const fila = objeto(`matriz.${nivel}`, matriz[nivel], VEREDICTOS_DE_CAPACIDAD);
      valores[nivel] = {};
      if (!fila) continue;
      for (const v of VEREDICTOS_DE_CAPACIDAD) {
        const x = fila[v];
        // La Aprobación Directa no es una casilla: la otorga el código cuando se cumplen todos sus criterios (4.4).
        if (!dentro(admite[nivel], x)) {
          error(`matriz.${nivel}.${v}`, nivel === "mal_comportamiento" ? `la fila de mal comportamiento es Negar y no se mueve (decidido); se escribió ${mostrar(x)}.` : `una fila de riesgo ${nivel} admite ${admite[nivel].join(", ")}; se escribió ${mostrar(x)}.`);
          valores[nivel][v] = null;
        } else valores[nivel][v] = x;
      }
    }
    // Más riesgo no puede dar una salida mejor para la misma capacidad.
    for (const v of VEREDICTOS_DE_CAPACIDAD) {
      for (let i = 1; i < NIVELES_DE_RIESGO.length; i++) {
        const arriba = valores[NIVELES_DE_RIESGO[i - 1]]?.[v];
        const abajo = valores[NIVELES_DE_RIESGO[i]]?.[v];
        if (arriba && abajo && rango_[abajo] > rango_[arriba]) error(`matriz.${NIVELES_DE_RIESGO[i]}.${v}`, `con más riesgo (${NIVELES_DE_RIESGO[i]}) no puede salir ${abajo}, mejor que lo que sale con menos riesgo (${NIVELES_DE_RIESGO[i - 1]}: ${arriba}).`);
      }
    }
  }

  // ---- margen de la IA ----
  const mi = objeto("margenDeLaIA", e.margenDeLaIA, ["escalonesHaciaArriba", "escalonesHaciaAbajo", "puedeOtorgarLaAprobacionDirecta", "puedeQuitarLaAprobacionDirecta", "puedeSubirDesdeCambioDeCondiciones", "exigeMotivoConUnHecho"]);
  if (mi) {
    // S1 (2026-11-18): un escalón como máximo; la Aprobación Directa queda fuera del alcance de la IA.
    const arriba = numero("margenDeLaIA.escalonesHaciaArriba", mi.escalonesHaciaArriba, 0, 1, { entero: true });
    numero("margenDeLaIA.escalonesHaciaAbajo", mi.escalonesHaciaAbajo, 0, 1, { entero: true });
    if (mi.puedeOtorgarLaAprobacionDirecta !== false) error("margenDeLaIA.puedeOtorgarLaAprobacionDirecta", "la IA nunca otorga la Aprobación Directa (decidido, S1): tiene que ser falso.");
    booleano("margenDeLaIA.puedeQuitarLaAprobacionDirecta", mi.puedeQuitarLaAprobacionDirecta);
    const sube = booleano("margenDeLaIA.puedeSubirDesdeCambioDeCondiciones", mi.puedeSubirDesdeCambioDeCondiciones);
    if (mi.exigeMotivoConUnHecho !== true) error("margenDeLaIA.exigeMotivoConUnHecho", "cada movimiento de la IA lleva un motivo atado a un hecho: tiene que ser verdadero.");
    if (arriba === 0 && sube === true) error("margenDeLaIA.puedeSubirDesdeCambioDeCondiciones", "con cero escalones hacia arriba la IA no puede subir desde ninguna salida.");
    if (arriba === 0 && salidasDeLaIA?.includes("aprobar")) error("malComportamiento.salidasQueLaIAPuedeRecomendar", "con cero escalones hacia arriba la IA no puede recomendar Aprobar a quien tiene mal comportamiento.");
  }

  return errores;
}

function congelar<T>(v: T): T {
  if (typeof v === "object" && v !== null) {
    for (const x of Object.values(v)) congelar(x);
    Object.freeze(v);
  }
  return v;
}

/** Valida un estándar y devuelve todos los errores juntos. El estándar que pasa es una copia congelada y registrada. */
export function validarEstandar(contenido: unknown): ResultadoDeValidar {
  let copia: unknown;
  try {
    copia = structuredClone(contenido);
  } catch {
    return { ok: false, errores: ["estándar: tiene que ser un objeto JSON (con datos simples, sin funciones)."] };
  }
  const errores = validar(copia);
  if (errores.length) return { ok: false, errores };
  const estandar = congelar(copia as EstandarDeLaInstitucion);
  validados.add(estandar);
  return { ok: true, estandar };
}

/** Como `validarEstandar()`, pero lanza `EstandarInvalido` con todos los errores. */
export function cargarEstandar(contenido: unknown): EstandarDeLaInstitucion {
  const r = validarEstandar(contenido);
  if (!r.ok) throw new EstandarInvalido(r.errores);
  return r.estandar;
}

/** Los umbrales en dólares se revisan cada enero (decisión del negocio): true si ya pasó la fecha de la próxima revisión. */
export function umbralesPorRevisar(estandar: EstandarDeLaInstitucion, hoy: string): boolean {
  return hoy > estandar.riesgo.moraVigente.revisionDeLosUmbrales.proximaRevision;
}
