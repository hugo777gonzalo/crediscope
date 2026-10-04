import { useEffect, useMemo, useState } from "react";
import { getFilasDelCorte, getCatalogoUnaVez } from "./datosDelCorte.js";
import { columnasDelCorte } from "./analisisEstadistico.js";

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

// Las variables del corte como columnas (una persona una vez), para las
// pestañas del Descubrimiento estadístico.
export function useColumnasDelCorte(corteId, poblacion) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const [catalogo, setCatalogo] = useState(null);
  const [errorCatalogo, setErrorCatalogo] = useState(null);
  useEffect(() => {
    getCatalogoUnaVez().then(setCatalogo).catch((e) => setErrorCatalogo(e.message ?? String(e)));
  }, []);
  const datos = useMemo(() => (filas && catalogo ? columnasDelCorte(filas, catalogo) : null), [filas, catalogo]);
  return { datos, error: error ?? errorCatalogo };
}
