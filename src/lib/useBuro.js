import { useEffect, useSyncExternalStore } from "react";
import { getBuroDeLaInstitucion } from "./api.js";

// El buró de la institución: "equifax", "aval" o null (migración 129). Lo
// leen las pestañas de cada persona y el menú en cada pantalla, así que se
// pide una vez y se comparte, como el perfil (useProfile.js). Si falla la
// lectura se sigue mostrando Aval, como antes de que existiera la elección:
// una pestaña de más es mejor que perder el acceso al buró.

const estado = { buro: undefined, listo: false };
const suscriptores = new Set();
let pedido = null;

const emitir = () => suscriptores.forEach((f) => f());
const suscribirse = (f) => {
  suscriptores.add(f);
  return () => suscriptores.delete(f);
};

function cargar() {
  if (pedido) return pedido;
  pedido = getBuroDeLaInstitucion()
    .catch(() => "aval")
    .then((buro) => {
      estado.buro = buro;
      estado.listo = true;
      emitir();
    });
  return pedido;
}

// Después de cambiarlo en Configuración: la próxima lectura vuelve a la base.
export function olvidarBuro() {
  pedido = null;
  estado.listo = false;
  cargar();
}

let instantanea = { buro: undefined, listo: false };
function leer() {
  if (instantanea.buro !== estado.buro || instantanea.listo !== estado.listo) {
    instantanea = { buro: estado.buro, listo: estado.listo };
  }
  return instantanea;
}

export const NOMBRE_DEL_BURO = { equifax: "Equifax", aval: "Aval" };

export function useBuro() {
  const guardado = useSyncExternalStore(suscribirse, leer, leer);
  useEffect(() => {
    cargar();
  }, []);
  return { buro: guardado.listo ? guardado.buro : undefined, cargando: !guardado.listo };
}
