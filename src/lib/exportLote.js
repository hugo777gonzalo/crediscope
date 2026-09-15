import * as XLSX from "xlsx";
import { diaEcuador, fechaHoraOrdenable, formatearFechaHora } from "./fechas.js";
import { ETIQUETA_SEGMENTO, ETIQUETA_ESTADO, ETIQUETA_EVIDENCIA, RIESGO_SEGMENTO } from "./fuentesIngresoConsolidado.js";

// El resultado de un lote, en un solo archivo con varias hojas.
//
// POR QUÉ RESUMEN Y DETALLE POR SEPARADO
//
// Una persona puede tener varias fuentes de ingreso: dos empleos, una
// pensión más una actividad propia. Meter todo en una fila obliga a
// inventar columnas "fuente1, fuente2, fuente3" que se quedan cortas
// justo con los casos interesantes, o a amontonar texto en una celda,
// que no se puede sumar ni filtrar.
//
// Por eso van las dos formas, y cada una sirve para algo distinto:
//
//   Resumen   una línea por persona. Es la que se cruza contra la
//             cartera, se lleva a una tabla dinámica y se compara
//             contra el incumplimiento.
//
//   Detalle   una línea por fuente. Es la que responde "¿de dónde sale
//             exactamente ese piso de ingreso?" cuando alguien discute
//             una clasificación.
//
// Se unen por la cédula, que está en las dos.

function aplanar(obj, prefijo, salida) {
  for (const [clave, valor] of Object.entries(obj ?? {})) {
    const nombre = prefijo ? `${prefijo}.${clave}` : clave;
    if (valor && typeof valor === "object" && !Array.isArray(valor)) {
      aplanar(valor, nombre, salida);
    } else if (Array.isArray(valor)) {
      salida[nombre] = valor
        .map((v) => (v && typeof v === "object" ? JSON.stringify(v) : v))
        .join(" | ");
    } else if (typeof valor === "boolean") {
      salida[nombre] = valor ? 1 : 0;
    } else {
      salida[nombre] = valor ?? "";
    }
  }
  return salida;
}

function hojaResumenProceso(lote, items) {
  const cuenta = (e) => items.filter((i) => i.estado === e).length;
  return [
    ["Consulta por lote — CrediScope"],
    [],
    ["Nombre", lote.nombre],
    ["Archivo cargado", lote.archivo ?? ""],
    ["Estado", lote.estado],
    ["Cargado el", formatearFechaHora(lote.created_at)],
    ["Arrancó el", lote.iniciado_at ? formatearFechaHora(lote.iniciado_at) : "—"],
    ["Terminó el", lote.terminado_at ? formatearFechaHora(lote.terminado_at) : "—"],
    ["Duración (minutos)", lote.minutos ?? ""],
    [],
    ["LO QUE TRAÍA EL ARCHIVO"],
    ["Líneas leídas", lote.total_lineas],
    ["Cédulas válidas y únicas", lote.total_validas],
    ["Repetidas dentro del archivo", lote.total_duplicadas],
    ["Descartadas (no consultables)", lote.total_descartadas],
    [],
    ["RESULTADO DE LAS CONSULTADAS"],
    ["Con perfil generado", cuenta("ok")],
    ["Con error", cuenta("error")],
    ["Todavía pendientes", cuenta("pendiente") + cuenta("en_curso")],
    [],
    ["Las repetidas y las descartadas NO se consultaron: no cuentan como error del proceso."],
    ["Las horas están en hora de Ecuador continental (UTC-5)."],
  ];
}

function filaResumenIngresos(perfil) {
  const sp = perfil.standard_profile ?? {};
  const f = sp.fuentesIngreso ?? {};
  const fuentes = f.fuentes ?? [];
  const vigentes = fuentes.filter((x) => x.vigenteAlCorte);
  return {
    cedula: perfil.clients?.cedula ?? sp.cedula ?? "",
    nombre: sp.identidad?.nombreCompleto ?? "",
    segmento: ETIQUETA_SEGMENTO[f.segmento] ?? f.segmento ?? "",
    segmento_clave: f.segmento ?? "",
    estado_clasificacion: ETIQUETA_ESTADO[f.estadoSegmento] ?? f.estadoSegmento ?? "",
    como_puede_fallar: RIESGO_SEGMENTO[f.segmento] ?? "",
    piso_ingreso_reportado: f.pisoIngresoMensualReportado ?? "",
    fuentes_totales: fuentes.length,
    fuentes_vigentes: vigentes.length,
    aparece_en_ultimo_corte: f.apareceEnUltimoCorte === null || f.apareceEnUltimoCorte === undefined ? "" : f.apareceEnUltimoCorte ? 1 : 0,
    cortes_desde_la_desvinculacion: f.cortesDesdeLaDesvinculacion ?? "",
    corte_iess_usado: f.corteIessUsado ?? "",
    motivo: f.motivoSegmento ?? "",
    que_pedirle_al_cliente: (f.paraConfirmar ?? []).join(" | "),
    senales_de_escala: (f.senalesDeEscala ?? []).map((s) => s.detalle).join(" | "),
    version_reglas: f.version ?? "",
    fecha_consulta: diaEcuador(perfil.created_at),
    hora_consulta: fechaHoraOrdenable(perfil.created_at).slice(11),
  };
}

function filasDetalleIngresos(perfil) {
  const sp = perfil.standard_profile ?? {};
  const f = sp.fuentesIngreso ?? {};
  const cedula = perfil.clients?.cedula ?? sp.cedula ?? "";
  const fuentes = f.fuentes ?? [];
  if (fuentes.length === 0) {
    // Una fila igual: si no apareciera, cruzar resumen contra detalle
    // daría personas que "se perdieron", y en realidad son personas sin
    // ninguna fuente detectada -- que es justamente un resultado.
    return [
      {
        cedula,
        n_fuente: 0,
        tipo: "(sin fuentes detectadas)",
        naturaleza: "",
        monto_mensual_reportado: "",
        evidencia: "",
        empleador: "",
        vigente_al_corte: "",
        detalle: f.motivoSegmento ?? "",
      },
    ];
  }
  return fuentes.map((x, i) => ({
    cedula,
    n_fuente: i + 1,
    tipo: x.tipo ?? "",
    naturaleza: x.naturaleza ?? "",
    monto_mensual_reportado: x.montoMensualReportado ?? "",
    evidencia: ETIQUETA_EVIDENCIA[x.evidencia] ?? x.evidencia ?? "",
    empleador: x.empleador ?? "",
    vigente_al_corte: x.vigenteAlCorte ? 1 : 0,
    detalle: x.detalle ?? "",
  }));
}

const COMO_LEER = [
  ["Cómo leer este archivo"],
  [],
  ["Resumen del proceso — qué traía el archivo y cómo terminó cada cédula."],
  ["Perfil del Cliente — una fila por persona con TODOS los campos de la Estructura"],
  ["  Estandarizada, en columnas \"grupo.campo\". Es la base para análisis estadístico."],
  ["Ingresos (resumen) — una fila por persona. Es la que se cruza contra la cartera."],
  ["Ingresos (detalle) — una fila por fuente de ingreso. Responde de dónde sale el piso."],
  ["  Se une con el resumen por la columna cedula."],
  ["Cédulas con error — las que no se pudieron consultar, con el motivo."],
  [],
  ["Sobre el piso de ingreso:"],
  ["· Es la SUMA DE LO REPORTADO al IESS por las fuentes vigentes, no el ingreso real."],
  ["· Los empleadores subdeclaran y quien se afilia por su cuenta elige su base."],
  ["· Siempre es un piso: el ingreso real puede ser mayor, nunca menor."],
  [],
  ["Sobre el estado de la clasificación:"],
  ["· Confirmada — un tercero declara y paga sobre esa base."],
  ["· Provisional — el monto lo puso la propia persona, o no existe."],
  ["· Indeterminada — no hay evidencia de ingreso en ninguna fuente."],
  [],
  ["Los Sí/No vienen como 1 y 0. Una celda vacía es dato que no existe, no un cero."],
  ["Las fechas están en hora de Ecuador continental (UTC-5)."],
];

export function descargarExcelLote({ lote, items, perfiles }) {
  const libro = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(hojaResumenProceso(lote, items)), "Resumen del proceso");

  // Perfil del Cliente: una fila por persona, con todo aplanado.
  const filasPerfil = perfiles.map((p) => {
    const fila = { cedula: p.clients?.cedula ?? "", fecha_consulta: diaEcuador(p.created_at), version_estructura: p.structure_version ?? "" };
    aplanar(p.standard_profile, "", fila);
    return fila;
  });
  if (filasPerfil.length) {
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filasPerfil), "Perfil del Cliente");
  }

  const resumenIngresos = perfiles.map(filaResumenIngresos);
  if (resumenIngresos.length) {
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(resumenIngresos), "Ingresos (resumen)");
  }

  const detalleIngresos = perfiles.flatMap(filasDetalleIngresos);
  if (detalleIngresos.length) {
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(detalleIngresos), "Ingresos (detalle)");
  }

  // Los errores y los descartes van juntos pero se distinguen por
  // columna: son problemas distintos. Un descarte es del archivo (un
  // RUC de empresa, un pasaforte); un error es de la consulta.
  const problemas = items
    .filter((i) => i.estado === "error" || i.estado === "descartado" || i.estado === "duplicado")
    .map((i) => ({
      fila_del_archivo: i.fila_archivo ?? "",
      lo_que_venia: i.ingresado,
      cedula_resuelta: i.cedula ?? "",
      tipo: i.tipo_identificacion,
      que_paso: i.estado === "error" ? "Falló la consulta" : i.estado === "duplicado" ? "Repetida en el archivo" : "No es consultable",
      motivo: i.motivo ?? "",
    }));
  if (problemas.length) {
    XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(problemas), "Cédulas con error");
  }

  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(COMO_LEER), "Cómo leer");

  const nombre = `CrediScope_Lote_${lote.nombre.replace(/[^\w-]+/g, "_").slice(0, 40)}_${diaEcuador(lote.created_at)}.xlsx`;
  XLSX.writeFile(libro, nombre);
  return { perfiles: filasPerfil.length, fuentes: detalleIngresos.length, problemas: problemas.length };
}
