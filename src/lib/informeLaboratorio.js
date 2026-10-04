// Informe de Desempeño del Modelo: lo que recibe la IFI (diseño, sección
// 9). Se arma con los últimos resultados de un corte y las propuestas
// presentadas sobre él.
//
// Desde un corte sintético también se exporta, para probar la salida del
// ciclo simulado de un año (decisión del negocio del 2026-10-03), con la
// franja "SIMULACIÓN — no presentar" en la primera fila de cada hoja y en
// el nombre del archivo: un informe sintético que circule sin marca se lee
// como el desempeño del motor.

import * as XLSX from "xlsx";

const FRANJA = "SIMULACIÓN — no presentar. El resultado de los créditos y el puntaje son inventados: no es desempeño del motor.";

export function exportarInforme({ corte, desempeno, variables, propuestas }) {
  if (!desempeno) throw new Error("Primero hay que calcular el desempeño del corte.");
  const d = desempeno.resultado;
  const libro = XLSX.utils.book_new();
  const conFranja = (filas) => (corte.es_sintetico ? [[FRANJA], [], ...filas] : filas);
  const hojaDeFilas = (objetos) => {
    if (!corte.es_sintetico) return XLSX.utils.json_to_sheet(objetos);
    const hoja = XLSX.utils.aoa_to_sheet([[FRANJA], []]);
    XLSX.utils.sheet_add_json(hoja, objetos, { origin: "A3" });
    return hoja;
  };

  const resumen = conFranja([
    ["Informe de Desempeño del Modelo"],
    [],
    ["Corte", corte.nombre],
    ["Ventana", `${corte.ventana_meses} meses`],
    ["Definición de impago", corte.lab_definiciones_default?.nombre ?? ""],
    ["Congelado el", corte.congelado_en],
    ["Operaciones con puntaje", d.n],
    ["Malos", d.n_malos],
    ["AUC", d.auc, "intervalo 95%", ...(d.auc_intervalo ?? [])],
    ["Gini", d.gini],
    ["KS", d.ks],
    [],
    ["Advertencias"],
    ...(d.advertencias ?? []).map((a) => [a]),
    [],
    ["Nota: el mismo perfil analizado dos veces mueve el puntaje ~40 puntos (medido el 2026-10-03); una diferencia menor no se atribuye a nada."],
  ]);
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  XLSX.utils.book_append_sheet(
    libro,
    hojaDeFilas((d.por_recomendacion ?? []).map((x) => ({
      "Recomendación": x.recomendacion, "Operaciones": x.n, "Malos": x.malos, "Tasa": x.tasa,
      "Intervalo 95% desde": x.intervalo?.[0], "Intervalo 95% hasta": x.intervalo?.[1],
    }))),
    "Por recomendación",
  );
  XLSX.utils.book_append_sheet(
    libro,
    hojaDeFilas((d.por_tramo ?? []).map((t) => ({ "Puntaje desde": t.desde, "Puntaje hasta": t.hasta, "Operaciones": t.n, "Malos": t.malos, "Tasa": t.tasa }))),
    "Por tramo de puntaje",
  );
  if (variables) {
    XLSX.utils.book_append_sheet(
      libro,
      hojaDeFilas((variables.resultado.variables ?? []).filter((v) => v.uso === "decision").map((v) => ({
        "Variable": v.nombre, "Grupo": v.grupo, "Llega al modelo": v.llega_al_modelo ? "Sí" : "No",
        "Cobertura": v.cobertura, "Valor de información": v.iv, "Fuerza": v.fuerza,
      }))),
      "Variables",
    );
  }
  const presentadas = (propuestas ?? []).filter((p) => ["presentada", "aprobada", "aplicada"].includes(p.estado));
  XLSX.utils.book_append_sheet(
    libro,
    hojaDeFilas(presentadas.map((p) => ({
      "Propuesta": p.titulo, "Tipo": p.tipo, "Estado": p.estado, "Hallazgo": p.hallazgo, "Cambio propuesto": p.cambio_propuesto,
      "Limitaciones": p.limitaciones, "Cómo se valida después": p.validacion_posterior,
    }))),
    "Propuesta de Ajustes",
  );
  XLSX.writeFile(libro, `${corte.es_sintetico ? "SIMULACION-" : ""}informe-desempeno-${corte.nombre.replace(/[^\w-]+/g, "-")}.xlsx`);
}
