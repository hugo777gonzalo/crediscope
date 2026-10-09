// Qué cambio de git está desplegado (auditoría externa del 2026-10-09, E2).
//
// Hasta ese día las funciones se desplegaban desde una máquina y nada decía
// qué código corría en cada una: un arreglo podía estar commiteado y no
// desplegado, o al revés, sin que nadie lo notara.
//
// El corredor (scripts/migrar-clientes.mjs --funciones) reemplaza este valor
// por el commit al desplegar, lo anota en la tabla despliegues (117) y lo
// vuelve a dejar así: en el repositorio siempre dice "sin-sello". Toda
// respuesta lo lleva en el encabezado x-crediscope-version (cors.ts). Una
// función que contesta "sin-sello" se desplegó a mano, por fuera del
// corredor.
export const VERSION_DESPLIEGUE = "sin-sello";
