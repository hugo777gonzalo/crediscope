// Informe de Desempeño del Modelo: lo que recibe la IFI (diseño, sección
// 9). Se arma con los últimos resultados de un corte REAL y las propuestas
// presentadas sobre él. Sobre un corte sintético no existe: lo impide la
// pantalla y lo impide esta función.

import * as XLSX from "xlsx";

export function exportarInforme({ corte, desempeno, variables, propuestas }) {
  if (corte.es_sintetico) throw new Error("Un corte sintético no genera informe para una institución.");
  if (!desempeno) throw new Error("Primero hay que calcular el desempeño del corte.");
  const d = desempeno.resultado;
  const libro = XLSX.utils.book_new();

  const resumen = [
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
  ];
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(resumen), "Resumen");

  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet((d.por_recomendacion ?? []).map((x) => ({
      "Recomendación": x.recomendacion, "Operaciones": x.n, "Malos": x.malos, "Tasa": x.tasa,
      "Intervalo 95% desde": x.intervalo?.[0], "Intervalo 95% hasta": x.intervalo?.[1],
    }))),
    "Por recomendación",
  );
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet((d.por_tramo ?? []).map((t) => ({ "Puntaje desde": t.desde, "Puntaje hasta": t.hasta, "Operaciones": t.n, "Malos": t.malos, "Tasa": t.tasa }))),
    "Por tramo de puntaje",
  );
  if (variables) {
    XLSX.utils.book_append_sheet(
      libro,
      XLSX.utils.json_to_sheet((variables.resultado.variables ?? []).filter((v) => v.uso === "decision").map((v) => ({
        "Variable": v.nombre, "Grupo": v.grupo, "Llega al modelo": v.llega_al_modelo ? "Sí" : "No",
        "Cobertura": v.cobertura, "Valor de información": v.iv, "Fuerza": v.fuerza,
      }))),
      "Variables",
    );
  }
  const presentadas = (propuestas ?? []).filter((p) => ["presentada", "aprobada", "aplicada"].includes(p.estado));
  XLSX.utils.book_append_sheet(
    libro,
    XLSX.utils.json_to_sheet(presentadas.map((p) => ({
      "Propuesta": p.titulo, "Tipo": p.tipo, "Estado": p.estado, "Hallazgo": p.hallazgo, "Cambio propuesto": p.cambio_propuesto,
      "Limitaciones": p.limitaciones, "Cómo se valida después": p.validacion_posterior,
    }))),
    "Propuesta de Ajustes",
  );
  XLSX.writeFile(libro, `informe-desempeno-${corte.nombre.replace(/[^\w-]+/g, "-")}.xlsx`);
}
