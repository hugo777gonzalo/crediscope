// Cómo vuelve el analista a la bandeja tal como la dejó.
//
// Si volver reinicia los filtros, la densidad de la tabla se
// desperdicia: lo que se gana en leer veinte filas de un vistazo se
// pierde en rearmar seis filtros cada vez que se abre un caso. Y el
// gesto es constante -- abrir, mirar, volver, abrir el siguiente.
//
// Se guarda en sessionStorage y no en la URL del expediente porque el
// expediente tiene que poder compartirse: pegar su enlace en un chat no
// debería arrastrar los filtros de quien lo mandó.
//
// sessionStorage y no localStorage: la bandeja de ayer no es la de hoy,
// y al abrir una pestaña nueva se espera empezar limpio.

const CLAVE = "crediscope.bandeja.busqueda";

export function recordarBusquedaBandeja(busqueda) {
  try {
    sessionStorage.setItem(CLAVE, busqueda ?? "");
  } catch {
    // modo privado o almacenamiento bloqueado: se vuelve a la bandeja
    // sin filtros, que es molesto pero no rompe nada
  }
}

/** La bandeja a la que volver, lista para usar como `to` de un Link. */
export function rutaDeRegreso() {
  try {
    const guardada = sessionStorage.getItem(CLAVE);
    return guardada ? `/solicitudes?${guardada}` : "/solicitudes";
  } catch {
    return "/solicitudes";
  }
}
