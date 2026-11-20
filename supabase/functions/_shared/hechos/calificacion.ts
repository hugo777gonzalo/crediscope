// La escala de calificaciones del buró de bancos de Proveedor_Info_1 (Superintendencia).
//
// La usan el grupo de bancos (`grupos/comportamiento-bancario.ts`, para la peor y la
// mejor y para las operaciones en atraso sin monto) y las lecturas (`senales/lecturas.ts`,
// para el tramo). Vive aparte porque una lectura no importa un grupo (3.2 del diseño), y
// dos copias de la escala es como aparecen las diferencias silenciosas.

// De mejor a peor. «AL» está fuera de la escala: no tiene atraso y nunca es la peor.
export const ESCALA_CALIFICACION = ["A1", "A2", "A3", "B1", "B2", "C1", "C2", "D", "E"];

// A1 es la única de la escala sin atraso (marco-v36, grupo 3): A2 ya es atraso.
export const CALIFICACIONES_EN_ATRASO = new Set(["A2", "A3", "B1", "B2", "C1", "C2", "D", "E"]);

// El primer escalón de atraso: corto (hasta 15 días, según el tipo de crédito). El buró
// casi nunca trae su monto: 2 de 425 operaciones en A2 y 0 de 222 en A3 (marco-v36).
export const CALIFICACIONES_DE_ATRASO_CORTO = new Set(["A2", "A3"]);

export const CALIFICACIONES_SIN_ATRASO = new Set(["A1", "AL"]);
