import { useEffect, useState } from "react";
import { guardarCalculo } from "./calculosDelCorte.js";

// Guarda el resultado de una pestaña la primera vez que se calcula con estos
// parámetros (fase 2 de la revisión: lo que se calcula en el navegador se
// guarda, con su huella). `resultado` tiene que venir de un useMemo: si fuera
// un objeto nuevo en cada dibujo se pediría el guardado cada vez (la huella
// lo frena igual, pero es tráfico de más). Devuelve null mientras tanto, o el
// mensaje si no se pudo guardar.
export function useGuardarResultado({ corteId, tipo, poblacion = null, parametros = {}, resultado }) {
  const [error, setError] = useState(null);
  const clave = JSON.stringify(parametros);
  useEffect(() => {
    if (!corteId || !resultado) return undefined;
    let vigente = true;
    guardarCalculo({ corteId, tipo, poblacion, parametros: JSON.parse(clave), resultado })
      .then(() => vigente && setError(null))
      .catch((e) => vigente && setError(e.message ?? String(e)));
    return () => {
      vigente = false;
    };
  }, [corteId, tipo, poblacion, clave, resultado]);
  return error;
}
