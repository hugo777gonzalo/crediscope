// El perfil del modelo: la ÚNICA fuente que lee el análisis con IA.
//
// POR QUÉ UNA SOLA PUERTA
//
// Hasta marco-v22 cada camino armaba su propio mensaje. El análisis
// ocultaba los campos que el admin deshabilitó y recortaba el detalle de
// ingresos; el backtest recortaba el detalle pero no ocultaba nada, así
// que "corría en las mismas condiciones que producción" sin hacerlo; el
// informe de retroalimentación tenía su propio extracto. Y la parte de
// ingresos llegaba con los nombres internos (pisoIngresoMensualReportado,
// reportada_por_tercero, autodeclarada_en_minimo, senalesDeEscala) que el
// negocio sacó de la pantalla y que el marco no le explicaba: nada impedía
// que el análisis dijera "piso de ingreso" o "evidencia autodeclarada".
//
// Ahora todo camino al modelo pasa por armarPerfilDelModelo(): el perfil
// estandarizado guardado, con `fuentesIngreso` reemplazado por la lectura
// que ve el analista en la pestaña Fuentes de ingreso -- los mismos
// nombres (nombres-ingresos.ts) y las mismas funciones (perfil laboral,
// indicios de ingreso mayor, tamaño del negocio) -- y los campos
// deshabilitados en standard_profile_field_config en null.
//
// Lo que se deja afuera a propósito: los aportes mes a mes, los empleos de
// 24 meses, los textos de actividad económica del SRI y el impuesto a la
// renta (decisión del negocio del 2026-09-25: no se deduce nada de la
// renta). Tampoco van las marcas de auditoría (correccion, recalculo).
//
// Un cambio en lo que arma este archivo cambia lo que lee el modelo: es
// una versión nueva del marco (MARCO_VERSION), con su fila en
// scoring_rules_versions.

import { clasificarPerfilLaboral } from "./perfil-laboral.ts";
import { esIngresoMinimoSbu, indiciosDeIngresoMayor, tamanoDelNegocio } from "./fuentes-ingreso.ts";
import { ETIQUETA_ESTADO, ETIQUETA_SEGMENTO, quienDeclara } from "./nombres-ingresos.ts";

type AnyRecord = Record<string, unknown>;

// Las fuentes sin monto que ya se dicen en otro lado del perfil del modelo:
// el RUC activo en perfilLaboral y la nómina en tamanoDelNegocio.
const SIN_MONTO_YA_DICHAS = new Set(["actividad económica propia", "actividad empresarial propia"]);

// La lectura de ingresos que recibe el modelo. null si el perfil es
// anterior al módulo de fuentes de ingreso.
export function ingresosDelPerfilDelModelo(perfil: AnyRecord | null | undefined): AnyRecord | null {
  const f = perfil?.fuentesIngreso as AnyRecord | undefined;
  if (!f) return null;
  const fuentes = (Array.isArray(f.fuentes) ? f.fuentes : []) as AnyRecord[];
  const monto = typeof f.pisoIngresoMensualReportado === "number" ? f.pisoIngresoMensualReportado : null;
  const pl = clasificarPerfilLaboral(perfil);
  const d = (f.detalle ?? null) as AnyRecord | null;
  const co = d ? (d.continuidadLaboral as AnyRecord | null | undefined) : undefined;
  const haceUnAnio = typeof d?.totalHace12Meses === "number" ? d.totalHace12Meses : null;

  return {
    segmento: ETIQUETA_SEGMENTO[String(f.segmento)] ?? f.segmento ?? null,
    estado: ETIQUETA_ESTADO[String(f.estadoSegmento)] ?? f.estadoSegmento ?? null,
    condicionesDeLaSegmentacion: f.motivoSegmento ?? null,
    informacionIess: f.corteIessUsado ?? null,
    sinInformacionActualEnElIess: f.apareceEnUltimoCorte === false,
    mesesSinAportar: f.cortesDesdeLaDesvinculacion ?? null,
    ingresoReportadoIess: monto,
    esIngresoMinimoSbu: esIngresoMinimoSbu(monto, f.corteIessUsado as string | null),
    aportes: fuentes
      .filter((x) => x.evidencia !== "indirecta")
      .map((x) => ({
        tipo: x.tipo ?? null,
        declaradoPor: quienDeclara(x, perfil),
        empleador: x.empleador ?? null,
        montoMensual: x.montoMensualReportado ?? null,
      })),
    otrasFuentesSinMonto: fuentes
      .filter((x) => x.evidencia === "indirecta" && !SIN_MONTO_YA_DICHAS.has(String(x.tipo)))
      .map((x) => x.tipo),
    perfilLaboral: pl
      ? {
          tipo: pl.etiqueta,
          trabajaParaUnTercero: pl.dependencia,
          tieneActividadPropia: pl.actividadPropia,
          tieneEmpleados: pl.empleador,
          rucActivoDesde: pl.rucActivoDesde,
          aportaSinRucActivo: pl.aporteVoluntarioSinRuc,
          actividadPropiaEsLaPrincipal: pl.actividadPropiaPrincipal,
          registraJubilacion: pl.jubilacion,
        }
      : null,
    tamanoDelNegocio: tamanoDelNegocio(perfil),
    indiciosIngresoMayor: indiciosDeIngresoMayor(f).map((i) => i.detalle),
    // Sin `detalle` (perfiles anteriores a fuentes-v4) no se sabe: null, no
    // ceros.
    estabilidad: d
      ? {
          // undefined: el perfil es anterior a fuentes-v5 y no la calculó.
          // null: nunca trabajó con un empleador ni por cuenta propia con
          // RUC activo según el IESS.
          continuidadLaboral:
            co === undefined
              ? null
              : co === null
                ? { vigente: false, meses: 0 }
                : {
                    vigente: co.vigente,
                    meses: co.meses,
                    desde: co.desde,
                    hasta: co.hasta,
                    empleadores: co.empleadores,
                    mesesPorCuentaPropiaConRuc: co.mesesCuentaPropiaConRuc ?? null,
                  },
          mesesConAporteUltimos12: d.mesesConAporteUltimos12 ?? null,
          promedioReportado6Meses: d.promedioUltimos6 ?? null,
          variacionContraHaceUnAnioPct: monto && haceUnAnio ? Math.round(((monto - haceUnAnio) / haceUnAnio) * 100) : null,
        }
      : null,
    documentosDeConfirmacion: Array.isArray(f.paraConfirmar) ? f.paraConfirmar : [],
  };
}

// El perfil del modelo entero. `camposDeshabilitados` son "grupo.campo"
// de standard_profile_field_config: se ponen en null, no se borran, para
// que el modelo sepa que el campo existe y no se le dio.
export function armarPerfilDelModelo(perfil: AnyRecord, camposDeshabilitados: Set<string> = new Set()): AnyRecord {
  const copia = JSON.parse(JSON.stringify(perfil ?? {})) as Record<string, unknown>;
  copia.fuentesIngreso = ingresosDelPerfilDelModelo(perfil);
  for (const clave of camposDeshabilitados) {
    const [grupo, campo] = clave.split(".");
    const g = copia[grupo] as AnyRecord | null | undefined;
    if (g && typeof g === "object" && campo in g) g[campo] = null;
  }
  return copia;
}

// El mensaje completo que recibe el modelo. Lo usan el análisis
// (llm-scoring.ts) y el backtest: el mismo armado en los dos.
export function mensajeParaElModelo(
  perfil: AnyRecord,
  hallazgosControlBloqueo: unknown[] | null | undefined,
  camposDeshabilitados: Set<string> = new Set(),
): { perfilDelModelo: AnyRecord; hallazgosControlBloqueo: unknown[] } {
  return {
    perfilDelModelo: armarPerfilDelModelo(perfil, camposDeshabilitados),
    // Ya resueltos de forma determinística: el modelo no los recalcula.
    hallazgosControlBloqueo: hallazgosControlBloqueo ?? [],
  };
}
