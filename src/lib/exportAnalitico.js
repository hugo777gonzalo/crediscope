import * as XLSX from "xlsx";

// Tabla analítica: una fila por análisis, con TODOS los campos de la
// Estructura Estandarizada que lo produjo, más el score, la
// recomendación y — si ya se cargó la retroalimentación — el resultado
// real del crédito.
//
// Para qué: que el análisis estadístico (correlación contra el
// incumplimiento, tasas por variable, cortes por producto) se pueda
// hacer con las herramientas del área -- Power BI, Excel, lo que sea --
// sin depender de que alguien programe cada consulta.
//
// Los booleanos salen como 1/0 a propósito: es una tabla para calcular,
// y "Sí"/"No" obliga a recodificar cada columna antes de correlacionar.

// Aplana la Estructura Estandarizada a columnas "grupo.campo". Los
// objetos anidados (ej. laboral.empleoActual) bajan un nivel más
// ("laboral.empleoActual.salarioAprox"); las listas se unen con " | "
// porque una celda no puede tener varios valores.
function aplanar(obj, prefijo, salida) {
  for (const [clave, valor] of Object.entries(obj ?? {})) {
    const nombre = prefijo ? `${prefijo}.${clave}` : clave;
    if (valor !== null && typeof valor === "object" && !Array.isArray(valor)) {
      aplanar(valor, nombre, salida);
    } else if (Array.isArray(valor)) {
      salida[nombre] = valor.length ? valor.map((v) => (typeof v === "object" ? JSON.stringify(v) : v)).join(" | ") : "";
    } else if (typeof valor === "boolean") {
      salida[nombre] = valor ? 1 : 0;
    } else {
      salida[nombre] = valor ?? "";
    }
  }
}

function siNoANumero(v) {
  if (v === true) return 1;
  if (v === false) return 0;
  return "";
}

export function construirTablaAnalitica(registros) {
  return (registros ?? []).map((a) => {
    const perfil = a.client_profiles?.standard_profile ?? null;
    // Un análisis puede aparecer en más de un paquete de
    // retroalimentación si se cargó dos veces; se toma el primero.
    const credito = (a.feedback_creditos ?? [])[0] ?? null;

    const fila = {
      cedula: a.clients?.cedula ?? "",
      fecha_analisis: a.created_at ? a.created_at.slice(0, 10) : "",
      score: a.crediscope_score ?? "",
      recomendacion: a.recomendacion ?? "",
      // Resultado real del crédito (vacío mientras no se cargue el
      // paquete de retroalimentación de esa cosecha).
      desembolsado: siNoANumero(credito?.desembolsado),
      hubo_incumplimiento: siNoANumero(credito?.hubo_default),
      dias_mora_max: credito?.dias_mora_max ?? "",
      tipo_incumplimiento: credito?.tipo_default ?? "",
      monto: credito?.monto ?? "",
      producto: credito?.producto ?? "",
      plazo_meses: credito?.plazo_meses ?? "",
      fecha_desembolso: credito?.fecha_desembolso ?? "",
      // Trazabilidad: con qué criterio y sobre qué perfil se evaluó.
      marco_version: a.rules_version ?? "",
      criterio_version: a.criterio_versiones?.numero ?? "",
      estructura_version: a.client_profiles?.structure_version ?? "",
      // De dónde salió el perfil de esta fila: registrado al correr la
      // solicitud, o deducido después por fecha (ver 034/035).
      perfil_vinculo: a.client_profile_vinculo ?? (perfil ? "exacto" : "sin_perfil"),
      analisis_id: a.id,
    };

    if (perfil) aplanar(perfil, "", fila);
    return fila;
  });
}

const COMO_LEER = [
  ["Tabla analítica — CrediScope"],
  [],
  ["Una fila por análisis. Las primeras columnas son el resultado (score, recomendación) y lo que"],
  ["realmente pasó con el crédito; después vienen todos los campos de la Estructura Estandarizada"],
  ["con los que se evaluó a esa persona, en columnas \"grupo.campo\"."],
  [],
  ["Cómo leer los valores:"],
  ["· Los Sí/No vienen como 1 y 0, para poder calcular directamente."],
  ["· Una celda vacía es dato que no existe, no un cero."],
  ["· Las listas (ej. profesiones) vienen separadas por \" | \"."],
  ["· hubo_incumplimiento vacío = ese crédito todavía no tiene resultado cargado."],
  [],
  ["La columna perfil_vinculo dice de dónde salió la información de esa fila:"],
  ["· exacto — quedó registrada al correr la solicitud. Es la información con la que se evaluó."],
  ["· inferido_anterior — se dedujo por fecha (solicitudes viejas). El perfil es anterior a la"],
  ["  solicitud, así que es una aproximación razonable."],
  ["· inferido_posterior — se dedujo por fecha pero el perfil es POSTERIOR a la solicitud: puede"],
  ["  incluir información que todavía no existía al evaluar. Excluir estas filas de cualquier"],
  ["  análisis sobre qué se podía saber de antemano."],
  ["· sin_perfil — esa solicitud no tiene información guardada; solo score y recomendación."],
  [],
  ["Advertencias antes de sacar conclusiones:"],
  ["1. Solo hay resultado real de los créditos que se desembolsaron. De los que se negaron no se"],
  ["   sabe qué habría pasado, así que toda tasa que calcules está condicionada a haber aprobado."],
  ["2. Con pocos incumplimientos, revisar muchas variables a la vez produce correlaciones fuertes"],
  ["   por puro azar. Conviene elegir de antemano las variables a mirar."],
  [],
  ["Contiene información personal, judicial y financiera de personas identificadas."],
  ["Tratar el archivo con el mismo cuidado que cualquier reporte del core (LOPDP)."],
];

export function descargarTablaAnalitica(registros, { desde, hasta } = {}) {
  const filas = construirTablaAnalitica(registros);
  if (filas.length === 0) throw new Error("Todavía no hay análisis para exportar.");

  // Unión de todas las claves: dos perfiles pueden no tener exactamente
  // las mismas columnas si se agregó un campo entre una consulta y otra.
  const columnas = [];
  const vistas = new Set();
  for (const fila of filas) {
    for (const clave of Object.keys(fila)) {
      if (!vistas.has(clave)) {
        vistas.add(clave);
        columnas.push(clave);
      }
    }
  }

  const hoja = XLSX.utils.json_to_sheet(filas, { header: columnas });
  hoja["!cols"] = columnas.map((c) => ({ wch: Math.min(Math.max(c.length + 2, 10), 34) }));
  // Deja fija la fila de títulos: con 130+ columnas, sin esto se pierde
  // la referencia apenas se baja un poco.
  hoja["!freeze"] = { xSplit: 1, ySplit: 1 };

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "Datos");
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(COMO_LEER), "Cómo leer");

  // El nombre lleva el rango exportado: si no, dos descargas distintas
  // terminan siendo dos archivos indistinguibles en la misma carpeta.
  const rango = desde && hasta ? `${desde}_a_${hasta}` : new Date().toISOString().slice(0, 10);
  XLSX.writeFile(libro, `CrediScope_Solicitudes_${rango}.xlsx`);
  return filas.length;
}
