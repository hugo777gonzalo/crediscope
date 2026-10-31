// La estimación de ingreso de una persona: del perfil guardado a la respuesta y a la
// fila de `estimaciones_de_ingreso`. La función `estimar-ingreso` sólo lee, guarda y
// contesta; lo que se decide está acá, para probarlo sin base (especificación del
// predictor, secciones 2 y 3.2).
//
// Reglas que salieron de una medida o de una decisión del negocio (2026-10-30):
//   - El reloj es la fecha de la consulta, no la de hoy. Sólo así se habla de la misma
//     fecha en la edad del perfil (los recálculos fijan el reloj en la captura), en
//     `anio_mes`, en la antigüedad del RUC y en el salario básico de los tramos. Servidas
//     con el reloj de hoy contra un ingreso de uno a tres años antes, 532 personas
//     cubrieron dos puntos menos (investigación, 12.30). Además, el mismo perfil y el
//     mismo modelo dan siempre lo mismo.
//   - Una consulta antigua se estima igual, con un aviso: reconsultar lo decide quien mira.
//   - El nivel 2 todavía no existe: quien tiene Equifax usa el nivel 1.
//   - Sin la tabla de pensiones (especificación, 3.3), un jubilado no recibe estimación.
//
// Lo verificado y lo estimado nunca se suman (especificación, 2.2): cada uno va en su bloque.

import { datosDeCapacidad, PARAMETROS_CAPACIDAD } from "./capacidad-de-pago.ts";
import { fechaEnEcuador } from "./equifax-estructura.ts";
import { type Calibracion, estimarIngreso, leerModeloComprimido, type MinimoDeIngreso, type ModeloDeIngreso, type Tramo } from "./predictor-ingresos.ts";
import { type PerfilParaIngreso, type ValorDeVariable, VARIABLES_DE_INGRESO_VERSION, vectorDeNivel1 } from "./variables-de-ingreso.ts";

// Pasado esto la respuesta avisa: es la ventana con que se mide el corte vigente del IESS.
export const DIAS_DE_UNA_CONSULTA_RECIENTE = 90;

// Mientras el mínimo no pase de esto, el nivel 1 no distingue a la persona de la población
// de solicitantes y no se rotula como estimación suya (especificación, 3.1; corte exacto
// decidido el 2026-10-30). La mediana del mínimo del 90% es 995: rige para cerca de la mitad.
export const MINIMO_PARA_ROTULAR_COMO_ESTIMADO = 1000;
const ROTULO_ESTIMADO = "Ingreso estimado, sin verificar";
const ROTULO_REFERENCIA = "Referencia de solicitantes";

const SEGMENTOS_VERIFICADOS = new Set(["publico", "diplomatico", "dependiente_privado", "empleo_domestico"]);
const SEGMENTOS_DE_PENSION = new Set(["jubilado", "jubilado_con_ingreso_adicional"]);
const SEGMENTOS_QUE_SE_ESTIMAN = new Set(["independiente", "ingresos_mixtos", "agricola", "trabajo_hogar", "informal_o_sin_actividad"]);

const AVISO_DEL_VERIFICADO = "Puede tener ingresos que no constan.";
const AVISO_DE_PENSION = "La referencia de pensión por tipo de afiliación todavía no está disponible.";
const AVISO_DE_CONSULTA_ANTIGUA = `La consulta tiene más de ${DIAS_DE_UNA_CONSULTA_RECIENTE} días: el resultado es a esa fecha.`;

// ---------------------------------------------------------------- lo que entra y lo que sale

export type MotivoSinEstimacion = "ingreso_verificado" | "jubilado" | "dependiente_sin_monto" | "sin_datos";

export interface IngresoVerificado {
  origen: "IESS";
  salarioReportado: number;
  aportePersonal: number;
  ingresoNeto: number;
  mes: string | null;
}

export interface DecisionDeLaEstimacion {
  nivel: 0 | 1 | null;
  motivo: MotivoSinEstimacion | null;
  verificado: IngresoVerificado | null;
}

export type BloqueEstimado =
  | {
    aplica: true;
    rotulo: string;
    minimoCertificado: MinimoDeIngreso;
    minimoAlternativo: MinimoDeIngreso;
    valorCentral: number;
    tramos: Tramo[];
    certificaAlMenos: number[];
  }
  | { aplica: false; motivo: MotivoSinEstimacion };

export interface RespuestaDeEstimacion {
  id: string | null; // null si no se evaluó el modelo: no quedó ninguna fila
  version: string | null;
  nivel: 0 | 1 | null;
  consultadoEl: string;
  verificado: IngresoVerificado | null;
  estimado: BloqueEstimado;
  referencia: null;
  calidad: { variablesUsadas: number; variablesSinDato: number; avisos: string[] };
  modelo: { poblacion: string; calibradoPara: string | null; entrenadoEl: string } | null;
}

// Una fila de `estimaciones_de_ingreso`, sin lo que pone quien la guarda: la persona, el
// perfil, la solicitud y quién pidió. Sin identificadores: la prueba lo comprueba.
export interface FilaDeEstimacion {
  id: string;
  modelo_id: string;
  nivel: number;
  version_variables: string;
  consultada_el: string;
  variables: Record<string, ValorDeVariable>;
  sin_dato: string[];
  cuantiles_log: number[];
  minimo_90: number;
  minimo_85: number;
  valor_central: number;
  calibracion: Calibracion | null;
  respuesta: RespuestaDeEstimacion;
}

export interface ModeloVigente {
  id: string;
  poblacion: string;
  calibracion: Calibracion | null;
  modelo: ModeloDeIngreso;
}

// ---------------------------------------------------------------- lo verificado y el selector

const aCentavos = (n: number) => Math.round(n * 100);

/** El salario que reporta un tercero al IESS, con su neto: el mismo descuento que la capacidad de pago. */
export function ingresoVerificado(perfil: Record<string, unknown>): IngresoVerificado | null {
  const datos = datosDeCapacidad(perfil, null);
  const sueldos = datos.ingresos.filter((x) => x.tipo === "sueldo");
  if (sueldos.length === 0) return null;
  // En centavos y sumando partes ya redondeadas, como evaluarCapacidad(): lo que se muestra suma.
  const salario = sueldos.reduce((a, x) => a + aCentavos(x.montoMensual), 0);
  const aporte = sueldos.reduce((a, x) => a + aCentavos(x.montoMensual * PARAMETROS_CAPACIDAD.aportePersonalIess), 0);
  return { origen: "IESS", salarioReportado: salario / 100, aportePersonal: aporte / 100, ingresoNeto: (salario - aporte) / 100, mes: datos.corteIess };
}

/** El selector de la especificación (3.2): toma el primer caso que aplica. */
export function decidirEstimacion(perfil: Record<string, unknown>): DecisionDeLaEstimacion {
  const fuentes = perfil.fuentesIngreso as { segmento?: unknown } | null | undefined;
  const segmento = typeof fuentes?.segmento === "string" ? fuentes.segmento : null;
  const verificado = ingresoVerificado(perfil);
  if (segmento !== null && SEGMENTOS_VERIFICADOS.has(segmento)) {
    return verificado ? { nivel: 0, motivo: "ingreso_verificado", verificado } : { nivel: null, motivo: "dependiente_sin_monto", verificado };
  }
  // Sin estimación, el nivel dice si al menos hay algo verificado: un jubilado puede tener además un sueldo.
  const nivelSinEstimar = verificado ? 0 : null;
  if (segmento !== null && SEGMENTOS_DE_PENSION.has(segmento)) return { nivel: nivelSinEstimar, motivo: "jubilado", verificado };
  if (segmento !== null && SEGMENTOS_QUE_SE_ESTIMAN.has(segmento)) return { nivel: 1, motivo: null, verificado };
  // `sin_datos` y `no_clasificado`, o un perfil sin clasificar: es la ausencia de la consulta, no un juicio sobre la persona.
  return { nivel: nivelSinEstimar, motivo: "sin_datos", verificado };
}

// ---------------------------------------------------------------- la respuesta y la fila

export interface PedidoDeEstimacion {
  id: string; // el de la fila: va también dentro de la respuesta que se guarda
  perfil: Record<string, unknown>;
  decision: DecisionDeLaEstimacion;
  consultadoEl: string; // client_profiles.created_at
  ahora: Date;
  vigente: ModeloVigente | null; // hace falta sólo en el nivel 1
}

function esConsultaAntigua(consultadoEl: string, ahora: Date): boolean {
  const dias = (ahora.getTime() - new Date(consultadoEl).getTime()) / 86_400_000;
  return dias > DIAS_DE_UNA_CONSULTA_RECIENTE;
}

export function armarEstimacion(pedido: PedidoDeEstimacion): { respuesta: RespuestaDeEstimacion; fila: FilaDeEstimacion | null } {
  const { id, perfil, decision, consultadoEl, ahora, vigente } = pedido;
  const avisos = esConsultaAntigua(consultadoEl, ahora) ? [AVISO_DE_CONSULTA_ANTIGUA] : [];

  if (decision.nivel !== 1) {
    if (decision.nivel === 0) avisos.unshift(AVISO_DEL_VERIFICADO);
    if (decision.motivo === "jubilado") avisos.unshift(AVISO_DE_PENSION);
    return {
      respuesta: {
        id: null, version: null, nivel: decision.nivel, consultadoEl, verificado: decision.verificado,
        estimado: { aplica: false, motivo: decision.motivo ?? "sin_datos" },
        referencia: null, calidad: { variablesUsadas: 0, variablesSinDato: 0, avisos }, modelo: null,
      },
      fila: null,
    };
  }

  if (!vigente) throw new Error("El nivel 1 necesita el modelo vigente.");
  const vector = vectorDeNivel1(perfil as PerfilParaIngreso, { ahora: consultadoEl });
  const e = estimarIngreso(vigente.modelo, vector.variables, { anio: Number(fechaEnEcuador(consultadoEl).slice(0, 4)), calibracion: vigente.calibracion });
  const calidad = {
    variablesUsadas: Object.values(vector.variables).filter((v) => v !== null).length,
    variablesSinDato: vector.sinDato.length,
    avisos: [...vector.avisos, ...avisos],
  };
  const respuesta: RespuestaDeEstimacion = {
    id, version: e.modelo.version, nivel: 1, consultadoEl, verificado: decision.verificado,
    estimado: {
      aplica: true,
      rotulo: e.minimoCertificado.monto > MINIMO_PARA_ROTULAR_COMO_ESTIMADO ? ROTULO_ESTIMADO : ROTULO_REFERENCIA,
      minimoCertificado: e.minimoCertificado,
      minimoAlternativo: e.minimoAlternativo,
      valorCentral: e.valorCentral,
      tramos: e.tramos,
      certificaAlMenos: e.certificaAlMenos,
    },
    referencia: null,
    calidad,
    modelo: { poblacion: vigente.poblacion, calibradoPara: e.calibradoPara, entrenadoEl: e.modelo.entrenadoEl },
  };
  return {
    respuesta,
    fila: {
      id, modelo_id: vigente.id, nivel: 1, version_variables: VARIABLES_DE_INGRESO_VERSION, consultada_el: consultadoEl,
      variables: vector.variables, sin_dato: vector.sinDato, cuantiles_log: e.cuantilesLog,
      minimo_90: e.minimoCertificado.monto, minimo_85: e.minimoAlternativo.monto, valor_central: e.valorCentral,
      calibracion: vigente.calibracion, respuesta,
    },
  };
}

// ---------------------------------------------------------------- el modelo vigente

export interface FilaDeModelo {
  id: string;
  version: string;
  nivel: number;
  huella_sha256: string;
  ruta_archivo: string;
  poblacion: string;
  calibracion: Calibracion | null;
}

export async function huellaSha256(bytes: Uint8Array): Promise<string> {
  const resumen = await crypto.subtle.digest("SHA-256", bytes.slice());
  return Array.from(new Uint8Array(resumen)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Baja el archivo sólo la primera vez o si cambió la huella de la fila vigente: la fila se lee en
 * cada pedido, así que cambiar de modelo o encender una calibración no pide desplegar, y ninguna
 * instancia sigue sirviendo el modelo anterior.
 */
export function crearCargadorDeModelo(bajar: (ruta: string) => Promise<Uint8Array>): (fila: FilaDeModelo) => Promise<ModeloVigente> {
  let enMemoria: { huella: string; modelo: ModeloDeIngreso } | null = null;
  return async (fila) => {
    if (enMemoria?.huella !== fila.huella_sha256) {
      const bytes = await bajar(fila.ruta_archivo);
      const huella = await huellaSha256(bytes);
      // Un archivo que no es el de la fila daría montos sin que nada lo avise.
      if (huella !== fila.huella_sha256) throw new Error(`El archivo ${fila.ruta_archivo} no tiene la huella de su fila.`);
      const modelo = await leerModeloComprimido(new Blob([bytes.slice()]));
      if (modelo.version !== fila.version || modelo.nivel !== fila.nivel) throw new Error(`El archivo ${fila.ruta_archivo} no es el modelo ${fila.version} del nivel ${fila.nivel}.`);
      enMemoria = { huella, modelo };
    }
    return { id: fila.id, poblacion: fila.poblacion, calibracion: fila.calibracion, modelo: enMemoria.modelo };
  };
}
