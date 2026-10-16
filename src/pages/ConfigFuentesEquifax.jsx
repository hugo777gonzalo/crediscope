import { useCallback, useEffect, useState } from "react";
import { getProveedor, updateProveedor } from "../lib/api.js";
import FilaConfig from "../components/FilaConfig.jsx";
import PestanasProveedor from "../components/PestanasProveedor.jsx";
import SelectorDeBuro from "../components/SelectorDeBuro.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";

// Equifax en Configuración: el mismo patrón que Aval (una sola consulta por
// persona, así que el interruptor es de todo o nada y vive en `proveedores`),
// con el selector del buró arriba.
//
// Lo distinto de Equifax es que cada consulta se cobra y su proveedor no pone
// tope (negocio, 2026-10-12): se dice acá, al lado del interruptor, y no se
// descubre en la factura.
export default function ConfigFuentesEquifax() {
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const p = await getProveedor("equifax");
      setItem({ ...p, enabled: p.activo, motivo: p.notas });
    } catch (e) {
      setError(e);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(_item, { enabled, motivo }) {
    await updateProveedor("equifax", { activo: enabled, notas: motivo });
    await cargar();
  }

  return (
    <div>
      <PestanasProveedor base="fuentes" activo="equifax" />

      <div style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          Fuente Equifax
          <InfoTooltip etiqueta="Cómo se consulta a Equifax">
            Equifax es una sola consulta por persona: el interruptor es de todo o nada. Apagarlo deja de consultar a
            Equifax para cualquier persona nueva; no borra lo ya guardado. Cada consulta se cobra y Equifax no pone tope:
            el tope diario lo pone CrediScope. Una consulta vale hasta el 17 de cada mes.
          </InfoTooltip>
        </h2>
      </div>

      <SelectorDeBuro />

      {error ? <AvisoDeError error={error} alReintentar={cargar} /> : null}

      <div className="crediscope-card">
        {!item ? (
          error ? null : <Cargando />
        ) : (
          <FilaConfig item={item} etiqueta="Equifax" descripcion="Buró de crédito · cada consulta se cobra" onSave={guardar} />
        )}
      </div>
    </div>
  );
}
