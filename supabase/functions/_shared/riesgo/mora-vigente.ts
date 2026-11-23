// La mora vigente por sector (R2 y R3; docs/estandar-de-la-institucion.md, 2.2 y 2.3; decisiones del negocio
// del 2026-11-22). Función pura sobre `EntradaDeRiesgo` y el estándar de la institución.
//
// Cada sector (SBS, SEPS, comercial) da un tramo: no cuenta, Aceptar, Revisar o Negar. Lo decidido:
//   1. se compara lo VENCIDO de las operaciones con más de 30 días, no el saldo en atraso (con el saldo, la
//      mediana de bancos es USD 9.253 y el umbral no separa a nadie);
//   2. bancos sin buró: manda la letra (A2 y A3 Aceptar, B1 a C2 Revisar, D y E Negar); con buró, los dólares;
//   3. el tramo Revisar es «Aprobado con Requisitos» con el certificado de estar al día si la capacidad alcanza;
//   4. manda el peor sector, sin sumar; la mora en varios sectores es un agravante;
//   5. más de 90 días, o D o E con los dólares, con un monto chico: tramo mínimo Revisar;
//   7. IESS y BIESS son del sector SBS, por días mientras el perfil no traiga lo vencido.
// La decisión 6 (el retail del proveedor es historial) la toma `historial.ts`: acá el comercial sólo cuenta si el
// estándar lo manda como mora de hoy.
//
// Un garante baja un tramo: el atraso es de otro, pero la obligación es suya si el otro no paga.

import type { EstandarDeLaInstitucion, NivelDeRiesgo, Salida } from "../estandar/estandar.ts";
import { exigirEstandarValido } from "../estandar/validar-estandar.ts";
import { ESCALA_CALIFICACION as ESCALA } from "../hechos/calificacion.ts";
import type { EntradaDeRiesgo, OperacionDeRiesgo, Sector } from "./entrada.ts";
import { SECTORES } from "./entrada.ts";

export type Tramo = "no_cuenta" | "aceptar" | "revisar" | "negar";
const RANGO: Record<Tramo, number> = { no_cuenta: 0, aceptar: 1, revisar: 2, negar: 3 };
export const peorTramo = (a: Tramo, b: Tramo): Tramo => (RANGO[a] >= RANGO[b] ? a : b);
const bajaUnTramo = (t: Tramo): Tramo => (t === "negar" ? "revisar" : t === "revisar" ? "aceptar" : "no_cuenta");

export interface MoraDelSector {
  sector: Sector;
  tramo: Tramo;
  /** Lo que se comparó con los umbrales (USD): la suma de lo vencido de las operaciones con más de 30 días. null si el sector se mide por letra o por días. */
  montoUsd: number | null;
  diasMaximos: number | null;
  /** La peor calificación en atraso (bancos). */
  peorLetra: string | null;
  /** 1 a 30 días: atraso corto, que no es tramo de R2. */
  atrasoCorto: boolean;
  /** Más de 90 días (o D o E con los dólares) con un monto dentro de lo tolerable: el tramo sube al mínimo del estándar (decisión 5). */
  subioPorElAtrasoLargo: boolean;
  /** Una operación en atraso sin monto informado: no se puede comparar con los dólares. */
  conOperacionSinMonto: boolean;
  /** El sector quedó en lo que dice un garante (bajó un tramo). */
  esDeUnGarante: boolean;
  /** Las operaciones que lo causan (claves de la capa de hechos). */
  operaciones: string[];
  fechaDelDato: string | null;
  /** Lo que no se pudo medir y por qué (la fuente no contestó, banco sin días ni letra). */
  sinMedir: string[];
}

export interface MoraVigenteDeLaPersona {
  /** El tramo de la persona: manda el peor sector (decisión 4). */
  tramo: Tramo;
  sectores: Record<Sector, MoraDelSector>;
  mandaElSector: Sector | null;
  /** Los sectores con mora que cuenta (Aceptar o peor): más de uno es un agravante. */
  sectoresConMora: Sector[];
  /** Una operación castigada o en cobro judicial, en bancos o cooperativas (2.3, punto 3). */
  castigoOCobroJudicial: boolean;
  /** Un garante de una operación en atraso, de cualquier tramo. */
  garanteDeUnaOperacionEnAtraso: boolean;
  /** Hoy al día en todo: A1 en bancos; 0 días en cooperativas, IESS y BIESS; sin castigo ni cobro judicial. */
  hoyAlDia: boolean | null;
}

const enAtraso = (o: OperacionDeRiesgo) => (o.diasDeMora ?? 0) > 0 || (o.calificacion !== null && !["A1", "AL"].includes(o.calificacion));
const esBanco = (o: OperacionDeRiesgo) => o.sistema === "bancos" || o.sistema === "tarjeta_diners";

function tramoPorUmbrales(monto: number, u: { aceptarHastaUsd: number; revisarHastaUsd: number }): Tramo {
  return monto <= u.aceptarHastaUsd ? "aceptar" : monto <= u.revisarHastaUsd ? "revisar" : "negar";
}

const tramoDelNivel = (n: NivelDeRiesgo): Tramo => (n === "mal_comportamiento" ? "negar" : n === "deteriorado" ? "revisar" : n === "con_observaciones" ? "aceptar" : "no_cuenta");

/** El monto que se compara de una operación: lo vencido (decisión 1) o, como alternativa del estándar, todo el saldo en atraso. */
function montoDeLaOperacion(o: OperacionDeRiesgo, e: EstandarDeLaInstitucion): number | null {
  if (e.riesgo.moraVigente.montoQueSeCompara === "vencido_de_las_operaciones_con_mas_de_dias") return o.saldoVencido;
  const partes = [o.saldoVencido, o.saldoNoDevenga, o.saldoEnDemanda, o.saldoCastigado];
  return partes.every((p) => p === null) ? null : partes.reduce<number>((a, p) => a + (p ?? 0), 0);
}

export function moraVigente(entrada: EntradaDeRiesgo, estandar: EstandarDeLaInstitucion): MoraVigenteDeLaPersona {
  const e = exigirEstandarValido(estandar);
  const mv = e.riesgo.moraVigente;
  const letras = e.riesgo.senales.calificacionEnBancos;
  const nivelDeLaLetra = (l: string | null): NivelDeRiesgo | null =>
    l === null ? null : letras.mal_comportamiento.includes(l) ? "mal_comportamiento" : letras.deteriorado.includes(l) ? "deteriorado" : letras.con_observaciones.includes(l) ? "con_observaciones" : null;
  const dias = e.riesgo.senales.diasDeMoraIessBiess;

  const sectores = {} as Record<Sector, MoraDelSector>;
  const montosSumados: Partial<Record<Sector, number>> = {};
  for (const sector of SECTORES) {
    const m: MoraDelSector = {
      sector, tramo: "no_cuenta", montoUsd: null, diasMaximos: null, peorLetra: null, atrasoCorto: false, subioPorElAtrasoLargo: false,
      conOperacionSinMonto: false, esDeUnGarante: false, operaciones: [], fechaDelDato: null, sinMedir: [],
    };
    sectores[sector] = m;
    const fuente = sector === "sbs" ? ["bancos", "biess"] : sector === "seps" ? ["cooperativas"] : ["comercial"];
    for (const f of fuente) if ((entrada.fuentesSinRespuesta as string[]).includes(f)) m.sinMedir.push(`fuente_sin_respuesta:${f}`);

    // El comercial del proveedor es historial salvo que el estándar lo mande como mora de hoy (decisión 6).
    if (sector === "comercial" && mv.retailDelProveedor === "historial") continue;

    // Los montos de las operaciones con más de `masDeDias` días, por sector, sin garantes (los garantes bajan un tramo aparte).
    let sumaDeVencido = 0;
    let hayMonto = false;
    let tramoDeLosTitulares: Tramo = "no_cuenta";
    let tramoPorLetraODias: Tramo = "no_cuenta";
    let tramoDeGarante: Tramo = "no_cuenta";
    let sinMonto = false;
    let largoTolerable = false;

    for (const o of entrada.operaciones.filter((x) => x.sector === sector)) {
      if (!enAtraso(o)) continue;
      const d = o.diasDeMora;
      if (d !== null) m.diasMaximos = Math.max(m.diasMaximos ?? 0, d);
      m.fechaDelDato = m.fechaDelDato ?? o.fechaDelDato;
      const esGarante = o.rol === "garante";
      let tramoDeLaOperacion: Tramo = "no_cuenta";

      if (esBanco(o) && d === null) {
        // Sin días: manda la letra (decisión 2). Con buró y «por los dólares», una operación sin días ni vencido no se puede medir.
        const nivel = nivelDeLaLetra(o.calificacion);
        if (nivel === null) continue;
        if (mv.bancosSinBuro === "por_los_dolares" && entrada.conBuro) {
          m.sinMedir.push("banco_sin_dias_ni_vencido");
          continue;
        }
        tramoDeLaOperacion = tramoDelNivel(nivel);
        if (m.peorLetra === null || ESCALA.indexOf(o.calificacion as string) > ESCALA.indexOf(m.peorLetra)) m.peorLetra = o.calificacion;
        if (esGarante) tramoDeGarante = peorTramo(tramoDeGarante, mv.comoGaranteBajaUnTramo ? bajaUnTramo(tramoDeLaOperacion) : tramoDeLaOperacion);
        else tramoPorLetraODias = peorTramo(tramoPorLetraODias, tramoDeLaOperacion);
        m.operaciones.push(o.clave);
        continue;
      }

      if (o.sistema === "iess_biess") {
        // IESS y BIESS en el sector SBS, por días (decisión 7): lo vencido no está en el perfil.
        if (d === null || d <= 0) continue;
        if (d <= dias.con_observaciones[1]) m.atrasoCorto = true;
        else tramoDeLaOperacion = d >= dias.malComportamientoDesde ? "negar" : "revisar";
        if (tramoDeLaOperacion === "no_cuenta") continue;
        tramoPorLetraODias = peorTramo(tramoPorLetraODias, tramoDeLaOperacion);
        m.operaciones.push(o.clave);
        continue;
      }

      // Con días: más de `masDeDias` cuenta en dólares; de 1 a `masDeDias` es atraso corto y no es tramo de R2.
      if (d === null) continue;
      if (d <= mv.masDeDias) {
        m.atrasoCorto = true;
        continue;
      }
      const monto = montoDeLaOperacion(o, e);
      m.operaciones.push(o.clave);
      if (monto === null) {
        // Una operación en atraso sin monto no se puede comparar con los dólares: Revisar como mínimo, nunca Aceptar (propuesta).
        sinMonto = true;
        tramoDeLaOperacion = "revisar";
      } else {
        if (esGarante) tramoDeLaOperacion = tramoPorUmbrales(monto, mv.sectores[sector]);
        else {
          sumaDeVencido += monto;
          hayMonto = true;
        }
      }
      const largo = d > e.riesgo.historial.atrasoLargoDesdeDias || (esBanco(o) && ["D", "E"].includes(o.calificacion ?? ""));
      if (largo && monto !== null && monto <= mv.sectores[sector].aceptarHastaUsd && !esGarante) largoTolerable = true;
      if (esGarante) {
        const t = tramoDeLaOperacion;
        tramoDeGarante = peorTramo(tramoDeGarante, mv.comoGaranteBajaUnTramo ? bajaUnTramo(t) : t);
      } else if (monto === null) tramoDeLosTitulares = peorTramo(tramoDeLosTitulares, "revisar");
    }

    if (hayMonto) {
      m.montoUsd = sumaDeVencido;
      montosSumados[sector] = sumaDeVencido;
      tramoDeLosTitulares = peorTramo(tramoDeLosTitulares, tramoPorUmbrales(sumaDeVencido, mv.sectores[sector]));
    }
    if (largoTolerable && tramoDeLosTitulares === "aceptar") {
      // Decisión 5: más de 90 días, o D o E, con un monto chico nunca queda en Aceptar.
      tramoDeLosTitulares = mv.masDeNoventaDiasConMontoTolerable === "negar" ? "negar" : "revisar";
      m.subioPorElAtrasoLargo = true;
    }
    m.conOperacionSinMonto = sinMonto;
    m.esDeUnGarante = tramoDeGarante !== "no_cuenta" && RANGO[tramoDeGarante] >= RANGO[peorTramo(tramoDeLosTitulares, tramoPorLetraODias)];
    m.tramo = peorTramo(peorTramo(tramoDeLosTitulares, tramoPorLetraODias), tramoDeGarante);
    // El atraso corto de un sector sin tramo de R2 es «con observaciones» y no tramo: se informa aparte.
  }

  let tramo: Tramo = "no_cuenta";
  let manda: Sector | null = null;
  for (const s of SECTORES) {
    if (RANGO[sectores[s].tramo] > RANGO[tramo]) {
      tramo = sectores[s].tramo;
      manda = s;
    }
  }
  // La alternativa del estándar (decisión 4, opción b): sumar los montos de los sectores contra el umbral más bajo.
  if (mv.variosSectores === "suma_los_montos") {
    const total = Object.values(montosSumados).reduce((a, x) => a + (x ?? 0), 0);
    if (Object.keys(montosSumados).length > 1) {
      const umbral = { aceptarHastaUsd: Math.min(...SECTORES.map((s) => mv.sectores[s].aceptarHastaUsd)), revisarHastaUsd: Math.min(...SECTORES.map((s) => mv.sectores[s].revisarHastaUsd)) };
      tramo = peorTramo(tramo, tramoPorUmbrales(total, umbral));
    }
  }

  const sectoresConMora = SECTORES.filter((s) => sectores[s].tramo !== "no_cuenta");
  const castigoOCobroJudicial = entrada.operaciones.some((o) => (o.sector === "sbs" || o.sector === "seps") && o.sistema !== "iess_biess" && ((o.saldoCastigado ?? 0) > 0 || (o.saldoEnDemanda ?? 0) > 0));
  const garanteDeUnaOperacionEnAtraso = entrada.operaciones.some((o) => o.rol === "garante" && enAtraso(o));
  const fuentesDeCredito = ["bancos", "cooperativas", "biess"] as const;
  const faltaUna = fuentesDeCredito.some((f) => entrada.fuentesSinRespuesta.includes(f));
  const hayAtraso = entrada.operaciones.some((o) => o.sector !== "comercial" && enAtraso(o));
  // «Hoy al día» no se afirma con una fuente que no contestó, salvo que ya se vea un atraso.
  const hoyAlDia = hayAtraso || castigoOCobroJudicial ? false : faltaUna ? null : true;

  return { tramo, sectores, mandaElSector: manda, sectoresConMora, castigoOCobroJudicial, garanteDeUnaOperacionEnAtraso, hoyAlDia };
}

// ---------------------------------------------------------------- R3: de los tramos a la salida

export interface SalidaPorLaMora {
  /** El nivel de riesgo que aporta; null si el tramo no cuenta. */
  nivel: NivelDeRiesgo | null;
  /** Lo más que la mora deja llegar; null si no limita. */
  salidaMaxima: Salida | null;
  /** El requisito que se pide, del catálogo. */
  requisito: string | null;
  /** Mal comportamiento de hoy: la base es Negar y la IA sube como mucho hasta el tope del estándar (decisión 9). */
  esMoraDeHoy: boolean;
}

/**
 * R3: Aceptar aporta «con observaciones» y llega a Aprobar sin Aprobación Directa; Revisar aporta «deteriorado» y es
 * Aprobado con Requisitos (con el certificado de estar al día) si la capacidad alcanza, y Revisar si no; Negar aporta
 * «mal comportamiento» vigente. `capacidadAlcanza` es el veredicto «alcanza» de la capacidad (null si no se midió).
 */
export function salidaPorLaMora(tramo: Tramo, capacidadAlcanza: boolean | null, estandar: EstandarDeLaInstitucion): SalidaPorLaMora {
  const e = exigirEstandarValido(estandar);
  switch (tramo) {
    case "no_cuenta":
      return { nivel: null, salidaMaxima: null, requisito: null, esMoraDeHoy: false };
    case "aceptar":
      return { nivel: "con_observaciones", salidaMaxima: "aprobar", requisito: null, esMoraDeHoy: false };
    case "revisar":
      return capacidadAlcanza === true
        ? { nivel: "deteriorado", salidaMaxima: e.riesgo.moraVigente.tramoRevisarConCapacidadQueAlcanza, requisito: "certificado_de_estar_al_dia", esMoraDeHoy: false }
        : { nivel: "deteriorado", salidaMaxima: "revisar", requisito: null, esMoraDeHoy: false };
    case "negar":
      return { nivel: "mal_comportamiento", salidaMaxima: "negar", requisito: null, esMoraDeHoy: true };
  }
}
