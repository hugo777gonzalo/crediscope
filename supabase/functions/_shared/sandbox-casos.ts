// Las identificaciones de prueba del sandbox de la API: la tabla de la especificación
// (api/openapi.yaml, «Sandbox»). Un archivo aparte de los simuladores porque también
// lo lee la validación del pedido, que es pura y no tiene por qué importar un cliente
// de Proveedor_Info_1.
//
// Un `00…` que no esté acá se rechaza igual que en producción: que sea imposible para
// una persona no lo vuelve un caso de prueba, y un número suelto no tendría respuesta
// definida.

export type CasoDelSandbox = "aprobada" | "parcial" | "bloqueada" | "sin_veredicto" | "no_encontrada" | "sin_fuentes" | "demorada";

const CASOS: ReadonlyMap<string, CasoDelSandbox> = new Map([
  ["0000000001", "aprobada"],
  ["0000000002", "parcial"],
  ["0000000003", "bloqueada"],
  ["0000000004", "sin_veredicto"],
  ["0000000005", "no_encontrada"],
  ["0000000006", "sin_fuentes"],
  ["0000000007", "demorada"],
]);

export const IDENTIFICACIONES_DEL_SANDBOX: readonly string[] = [...CASOS.keys()];
export const esCasoDelSandbox = (identificacion: unknown): boolean => typeof identificacion === "string" && CASOS.has(identificacion);

// Lanza con una identificación real: una persona con un «aprobar» inventado sería
// peor que una consulta de más.
export function casoDe(identificacion: string): CasoDelSandbox {
  const caso = CASOS.get(identificacion);
  if (!caso) throw new Error("Un simulador del sandbox no contesta por esa identificación.");
  return caso;
}
