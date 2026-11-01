// La cuota y la capacidad de pago de una solicitud, con el perfil y el buró ya en
// mano. Función pura: la usan el paso de la API y la pantalla (que primero leen
// la base, `pasoCapacidad` en pasos-de-evaluacion.ts) y el sandbox, que no tiene
// nada guardado y los arma con sus simuladores (sandbox-pasos.ts).

import { conIngresoDeclarado, datosDeCapacidad, evaluarCapacidad } from "./capacidad-de-pago.ts";
import { montoMaximoParaCuota, simularCredito } from "./simulador-credito.ts";
import type { ResultadoDelPaso } from "./cola-de-evaluaciones.ts";

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

export function capacidadDeLaSolicitud(s: Fila, perfil: Fila, estructura: Record<string, unknown> | null): ResultadoDelPaso {
  const condiciones = { plazoMeses: s.plazo_meses, tasaNominalAnualPorcentaje: Number(s.tasa_nominal_anual), sistema: s.sistema, desgravamen: s.desgravamen };
  const simulacion = simularCredito({ ...condiciones, monto: Number(s.monto) });
  if (!simulacion.ok) return { ok: false, fallo: { detalle: simulacion.errores.join(" "), codigo: "error_interno", esperarMs: 0 } };
  const datosIess = datosDeCapacidad(perfil, estructura);
  const datos = conIngresoDeclarado(datosIess, s.ingreso_declarado === null || s.ingreso_declarado === undefined ? null : Number(s.ingreso_declarado));
  const cuotaNueva = simulacion.simulacion.cuotaPrimerMes;
  const capacidad = evaluarCapacidad({ ...datos, cuotaNueva });
  const { tabla: _tabla, ...resumenSimulacion } = simulacion.simulacion;
  return {
    ok: true,
    cambios: {},
    detalle: "Se calcularon la cuota y la capacidad de pago.",
    resultado: {
      capacidad: {
        simulacion: resumenSimulacion,
        capacidad,
        montoMaximo: montoMaximoParaCuota(capacidad.cuotaMaximaAdmisible, condiciones),
        capacidadSoloIess: datos !== datosIess ? evaluarCapacidad({ ...datosIess, cuotaNueva }) : null,
        datos,
      },
    },
  };
}
