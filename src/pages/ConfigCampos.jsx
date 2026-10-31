import { useCallback, useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { getFieldConfig, updateFieldConfig } from "../lib/api.js";
import GrupoConfigurable from "../components/GrupoConfigurable.jsx";
import FilaConfig from "../components/FilaConfig.jsx";
import PestanasProveedor from "../components/PestanasProveedor.jsx";
import { ETIQUETAS_GRUPO } from "../lib/etiquetasGrupos.js";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";

// Qué campos del Perfil del Cliente entran al Análisis con IA.
//
// Apagar un campo NO lo borra: se sigue calculando y guardando en el
// perfil, pero viaja en blanco hacia el modelo. Sirve para dos cosas:
// sacar de la ecuación un campo que está reportando mal mientras se
// investiga, y excluir información que la institución decide no
// ponderar por política propia.
//
// La diferencia con apagar una fuente importa: una fuente apagada deja
// de consultarse y el dato no existe; un campo apagado existe, se
// guarda y se puede ver -- solo no pesa en el criterio.

export default function ConfigCampos() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("");

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setItems(await getFieldConfig());
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
    await updateFieldConfig(item.grupo, item.campo, cambio);
    await cargar();
  }

  async function todoElGrupo(lista, enabled) {
    await Promise.all(
      lista
        .filter((i) => i.enabled !== enabled)
        .map((i) => updateFieldConfig(i.grupo, i.campo, { enabled, motivo: i.motivo || "" }))
    );
    await cargar();
  }

  const totalActivos = items?.filter((i) => i.enabled).length ?? 0;
  const descripcion =
    "Un campo apagado se sigue calculando y guardando en el perfil, pero viaja en blanco hacia el modelo: existe y se puede ver, sólo no pesa en el criterio.";

  return (
    <div>
      <PestanasProveedor base="campos" activo="proveedor_info_1" />

      <div style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          Campos que pesan en el análisis
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
        <AvisoDeError error={error} />
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
        <Cargando />
      ) : grupos.length === 0 ? (
        <div className="crediscope-card">
          <p className="crediscope-muted" style={{ margin: 0 }}>Ningún campo con ese nombre.</p>
        </div>
      ) : (
        <div className="crediscope-secciones">
          {grupos.map((g) => (
            <GrupoConfigurable
              key={g.grupo}
              titulo={ETIQUETAS_GRUPO[g.grupo] ?? g.grupo}
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
