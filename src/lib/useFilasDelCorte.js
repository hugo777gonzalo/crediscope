import { useEffect, useState } from "react";
import { getFilasDelCorte } from "./datosDelCorte.js";

// Las filas de un corte para una pestaña que calcula en el navegador. La
// primera pestaña que las pide las baja; las demás las toman de la memoria.
export function useFilasDelCorte(corteId, poblacion) {
  const clave = `${corteId}|${poblacion}`;
  const [estado, setEstado] = useState({ filas: null, error: null, clave: null });
  useEffect(() => {
    if (!corteId) return undefined;
    let vigente = true;
    getFilasDelCorte(corteId, poblacion)
      .then((filas) => vigente && setEstado({ filas, error: null, clave }))
      .catch((e) => vigente && setEstado({ filas: null, error: e.message ?? String(e), clave }));
    return () => {
      vigente = false;
    };
  }, [corteId, poblacion, clave]);
  return estado.clave === clave ? estado : { filas: null, error: null };
}
