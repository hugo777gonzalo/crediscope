import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Info } from "lucide-react";
import { getProveedor, updateProveedor } from "../lib/api.js";
import FilaConfig from "../components/FilaConfig.jsx";
import PestanasProveedor from "../components/PestanasProveedor.jsx";

// Análogo a ConfigFuentes.jsx (Novadata) pero para Aval -- y con otra
// forma, a propósito. Novadata son 52 endpoints independientes, cada uno
// apagable sin tocar los demás. Aval es UNA sola llamada HTTP que trae
// sus 34 segmentos de un tirón: no hay "el recurso de tarjetas" que
// desactivar sin desactivar todo. El on/off acá es de todo o nada, y vive
// en `proveedores` (migración 067/076) -- se reusa FilaConfig con un solo
// ítem en vez de GrupoConfigurable con una lista, porque literalmente hay
// una sola cosa que prender o apagar.
//
// Qué campos de lo que Aval SÍ trae se usan de cara al análisis es otra
// pregunta, y tiene su propia pantalla: "Campos que pesan en el análisis"
// (/admin/campos/aval), el análogo real de ConfigCampos para Aval.

export default function ConfigFuentesAval() {
  const [item, setItem] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const p = await getProveedor("aval");
      setItem({ ...p, enabled: p.activo, motivo: p.notas });
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(_item, { enabled, motivo }) {
    await updateProveedor("aval", { activo: enabled, notas: motivo });
    await cargar();
  }

  const descripcion =
    "Aval es una sola consulta por persona, no 52 recursos independientes como Novadata: no hay nada que prender o apagar por segmento. Desactivarlo acá deja de consultar a Aval para cualquier persona nueva; no borra lo ya guardado.";

  return (
    <div>
      <PestanasProveedor base="fuentes" activo="aval" />

      <div style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          Fuente Aval
          <span title={descripcion} style={{ display: "inline-flex", cursor: "help", color: "var(--text-muted)" }}>
            <Info size={16} />
          </span>
        </h2>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="crediscope-card">
        {!item ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>Cargando...</p>
        ) : (
          <FilaConfig item={item} etiqueta="Aval Buró" descripcion="Buró de crédito de Ecuador" onSave={guardar} />
        )}
      </div>

      <p className="crediscope-muted" style={{ maxWidth: "66ch" }}>
        Qué campos de lo que Aval devuelve pesan en el análisis se maneja aparte, en{" "}
        <Link to="/admin/campos/aval">Campos que pesan en el análisis</Link>.
      </p>
    </div>
  );
}
