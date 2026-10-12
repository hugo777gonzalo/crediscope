// A dónde va la persona después de ingresar: a lo que estaba mirando.
//
// App.jsx manda a /login guardando la dirección original en el estado de la
// navegación (`desde`). El estado se puede editar desde la consola del
// navegador, así que sólo se aceptan rutas internas: nada que empiece con
// "//" (otro sitio) ni que vuelva a /login (un ciclo).
let salidaAPropositoReciente = false;
export const marcarSalidaAProposito = () => {
  salidaAPropositoReciente = true;
};
export const olvidarSalidaAProposito = () => {
  salidaAPropositoReciente = false;
};
export const sePuedeRecordarElDestino = () => !salidaAPropositoReciente;

export function destinoDeIngreso(estado) {
  const desde = estado?.desde;
  if (typeof desde !== "string") return "/";
  if (!desde.startsWith("/") || desde.startsWith("//") || desde.startsWith("/login")) return "/";
  return desde;
}
