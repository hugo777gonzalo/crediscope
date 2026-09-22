import { useCallback, useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { getAvalFieldConfig, updateAvalFieldConfig } from "../lib/api.js";
import GrupoConfigurable from "../components/GrupoConfigurable.jsx";
import FilaConfig from "../components/FilaConfig.jsx";
import PestanasProveedor from "../components/PestanasProveedor.jsx";

// Análogo a ConfigCampos.jsx pero para la estructura estandarizada de
// Aval (aval-estructura.ts). Los grupos ya vienen en castellano legible
// desde ESPEC (Score, Deuda actual, Deuda contingente...) -- a diferencia
// de Novadata, que necesita ETIQUETAS_GRUPO para traducir claves internas
// como "comportamientoBancario".
//
// Identidad, clientesPeorScore, responseCode y transactionNumber no
// aparecen en esta lista: son CAMPOS_NO_PARA_LLM en aval-estructura.ts,
// una exclusión de diseño (no debe influir el análisis, o es metadato de
// control), no una decisión operativa que competa togglear acá.

export default function ConfigCamposAval() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("");

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setItems(await getAvalFieldConfig());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const grupos = useMemo(() => {
    if (!items) return [];
    const t = filtro.trim().toLowerCase();
    const visibles = t ? items.filter((i) => i.campo.toLowerCase().includes(t) || i.grupo.toLowerCase().includes(t)) : items;
    const mapa = new Map();
    for (const i of visibles) {
      if (!mapa.has(i.grupo)) mapa.set(i.grupo, []);
      mapa.get(i.grupo).push(i);
    }
    return [...mapa.entries()].map(([grupo, lista]) => ({
      grupo,
      lista: lista.sort((a, b) => a.campo.localeCompare(b.campo)),
      activos: lista.filter((x) => x.enabled).length,
    }));
  }, [items, filtro]);

  async function guardar(item, cambio) {
    await updateAvalFieldConfig(item.grupo, item.campo, cambio);
    await cargar();
  }

  async function todoElGrupo(lista, enabled) {
    await Promise.all(
      lista
        .filter((i) => i.enabled !== enabled)
        .map((i) => updateAvalFieldConfig(i.grupo, i.campo, { enabled, motivo: i.motivo || "" }))
    );
    await cargar();
  }

  const totalActivos = items?.filter((i) => i.enabled).length ?? 0;
  const descripcion =
    "Un campo apagado se sigue calculando y guardando en la estructura de Aval, pero viaja en blanco hacia el modelo: existe y se puede ver, solo no pesa en el criterio.";

  return (
    <div>
      <PestanasProveedor base="campos" activo="aval" />

      <div style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          Campos de Aval que pesan en el análisis
          <span title={descripcion} style={{ display: "inline-flex", cursor: "help", color: "var(--text-muted)" }}>
            <Info size={16} />
          </span>
        </h2>
        {items ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>
            <strong>{totalActivos} de {items.length} activos.</strong>
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="crediscope-card">
        <input
          className="crediscope-input"
          placeholder="Buscar un campo o un grupo..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      {!items ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : grupos.length === 0 ? (
        <div className="crediscope-card">
          <p className="crediscope-muted" style={{ margin: 0 }}>Ningún campo con ese nombre.</p>
        </div>
      ) : (
        <div className="crediscope-secciones">
          {grupos.map((g) => (
            <GrupoConfigurable
              key={g.grupo}
              titulo={g.grupo}
              activos={g.activos}
              total={g.lista.length}
              abiertoPorDefecto={Boolean(filtro)}
              onTodo={(valor) => todoElGrupo(g.lista, valor)}
            >
              {g.lista.map((i) => (
                <FilaConfig key={`${i.grupo}.${i.campo}`} item={i} etiqueta={i.campo} onSave={guardar} />
              ))}
            </GrupoConfigurable>
          ))}
        </div>
      )}
    </div>
  );
}
