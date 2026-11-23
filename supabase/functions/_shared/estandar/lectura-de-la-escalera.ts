// Lo que la escalera del ingreso y la capacidad de pago leen del estándar de la institución: la carga
// máxima, el margen, la carga extendida, el aporte personal, lo que se acepta de cada peldaño y los
// dos parámetros de la escalera. Antes eran constantes del código (`PARAMETROS_CAPACIDAD`,
// `FRACCIONES_ACEPTADAS`, `PARAMETROS_DE_LA_ESCALERA`); con la plantilla Base dan exactamente
// los mismos números, y `estandar.test.ts` lo prueba contra las constantes y contra `evaluarEscalera()`.
//
// Sólo tipos de `capacidad-de-pago.ts` y de `escalera-del-ingreso.ts` (`import type`): esos módulos
// importan este, y un ciclo de valores no se puede.

import type { FraccionesAceptadas, ParametrosCapacidad } from "../capacidad-de-pago.ts";
import type { ParametrosDeLaEscalera } from "../escalera-del-ingreso.ts";
import type { EstandarDeLaInstitucion, NivelDeRiesgo } from "./estandar.ts";
import { exigirEstandarValido } from "./validar-estandar.ts";

export interface LecturaDeLaEscalera {
  parametros: ParametrosCapacidad;
  fracciones: FraccionesAceptadas;
  cargaExtendida: { habilitada: boolean; hasta: number };
  /** Para `armarIngresoDelPerfil(..., { parametros })`. */
  parametrosDeLaEscalera: Pick<ParametrosDeLaEscalera, "cargaParaLaCotaPorCuotas" | "declaradoCoherenteHastaVeces">;
}

/** Se niega a leer un estándar que no pasó por `validarEstandar()` (1.1). */
export function lecturaDeLaEscalera(estandar: EstandarDeLaInstitucion): LecturaDeLaEscalera {
  const e = exigirEstandarValido(estandar);
  return {
    parametros: { cargaMaxima: e.capacidad.cargaMaxima, margenJusto: e.capacidad.margenJusto, aportePersonalIess: e.capacidad.aportePersonalIess },
    fracciones: { ...e.ingreso.aceptadoPorPeldano },
    cargaExtendida: { habilitada: e.capacidad.cargaExtendida.habilitada, hasta: e.capacidad.cargaExtendida.hasta },
    parametrosDeLaEscalera: { cargaParaLaCotaPorCuotas: e.ingreso.cargaParaLaCotaPorCuotas, declaradoCoherenteHastaVeces: e.ingreso.declaradoCoherenteHastaVeces },
  };
}

/**
 * C2: la carga máxima según el riesgo de la persona. `mal_comportamiento` no tiene carga (la base es Negar): null.
 * NADA LA USA TODAVÍA: la escalera mide con `cargaMaxima` y `cargaExtendida`, y la base de la carga de C2 es el neto
 * disponible, que no se arma hasta que el negocio valide los porcentajes (4.1, «Abierto»).
 */
export function cargaMaximaSegunElRiesgo(estandar: EstandarDeLaInstitucion, nivel: NivelDeRiesgo): number | null {
  const e = exigirEstandarValido(estandar);
  return nivel === "mal_comportamiento" ? null : e.capacidad.cargaMaximaPorRiesgo.porNivel[nivel];
}
