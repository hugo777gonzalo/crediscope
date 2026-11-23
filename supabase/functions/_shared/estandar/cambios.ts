// Aplicar los cambios de una institución sobre una plantilla: es lo que permite configurar una
// institución nueva con datos (un JSON) y no con código.
//
// Las reglas son las mínimas y se dicen: un objeto se mezcla clave por clave, una lista se
// reemplaza entera (no se mezcla por posición: «los tramos» son los tramos), un valor simple
// reemplaza al anterior y `null` QUITA la clave (para las claves opcionales de una celda).
// Esta función no valida nada: un cambio que deja el estándar inválido lo rechaza el validador.

export type Cambios = { [clave: string]: unknown };

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function aplicarCambios(base: unknown, cambios: unknown): unknown {
  if (!esObjeto(cambios)) return structuredClone(cambios);
  const salida: Record<string, unknown> = esObjeto(base) ? structuredClone(base) : {};
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === null) delete salida[clave];
    else if (esObjeto(valor) && esObjeto(salida[clave])) salida[clave] = aplicarCambios(salida[clave], valor);
    else salida[clave] = structuredClone(valor);
  }
  return salida;
}
