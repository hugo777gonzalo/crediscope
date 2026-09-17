import { GRUPOS_CONFIG } from "./perfilClienteCampos.js";

// Lo que queda de la agregación en el navegador.
//
// Hasta el 2026-09-16 este archivo calculaba TODO el Reporte Gerencial
// acá: se bajaban los client_profiles y analysis_results completos --con
// el standard_profile de cada persona adentro-- y se agregaba en
// memoria. Con decenas de clientes era correcto y simple; con 2.565 y
// 3.054 perfiles son unos 30 MB por carga de pantalla.
//
// El cálculo se movió a la base: metricas_gerenciales() y
// agregar_por_campo(), migración 070. Acá sobrevive lo que sigue siendo
// del navegador: la deduplicación por cliente, que usan las pantallas
// que ya tienen sus filas en la mano, y la lista de campos de cada eje,
// que sale de la misma curación que ve el analista en Perfil del
// Cliente.

// Compara fechas en vez de confiar en el orden en que llegaron las
// filas.
//
// Antes se quedaba con la PRIMERA fila de cada cliente, dando por hecho
// que quien llama ordenó por fecha descendente. Funcionaba porque todos
// los llamadores lo hacían; el día que uno se olvide, esto devuelve la
// consulta más vieja de cada persona y no hay forma de notarlo mirando
// la pantalla. Un supuesto que solo se verifica leyendo el código de
// otro archivo no es un supuesto, es una trampa.
export function ultimoPorCliente(rows) {
  const porCliente = new Map();
  for (const r of rows || []) {
    const previo = porCliente.get(r.client_id);
    if (!previo || new Date(r.created_at) > new Date(previo.created_at)) porCliente.set(r.client_id, r);
  }
  return [...porCliente.values()];
}

// Los campos de un eje, con su tipo. El tipo es lo que decide qué
// calcula agregar_por_campo() del lado de la base: porcentaje para los
// booleanos, promedio para los números, distribución para el resto.
export function camposDeEje(grupo) {
  return GRUPOS_CONFIG[grupo]?.campos ?? [];
}
