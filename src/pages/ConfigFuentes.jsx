import { useCallback, useEffect, useMemo, useState } from "react";
import { getResourceConfig, updateResourceConfig } from "../lib/api.js";
import GrupoConfigurable from "../components/GrupoConfigurable.jsx";
import FilaConfig from "../components/FilaConfig.jsx";

// Qué le preguntamos a la fuente de datos.
//
// Cada recurso es una consulta distinta al proveedor. Apagar uno no
// borra nada de lo ya guardado: simplemente deja de pedirse de acá en
// adelante. Sirve para dos cosas muy concretas -- una fuente que está
// caída y hace fallar la consulta entera, y una fuente que la
// institución decide no consultar por política propia.
//
// Agrupados por bloque de negocio, que es como se piensan: "el bloque
// judicial", no "doce recursos sueltos".

const ETIQUETA_BLOQUE = {
  general: "Identidad",
  sociodemografica: "Sociodemográfica",
  trabajo: "Laboral y tributario",
  iess: "Seguridad social",
  vehiculos: "Vehículos",
  funcion_judicial: "Función Judicial",
  fiscalia: "Fiscalía",
  bancos: "Bancos y buró de crédito",
  cooperativas: "Cooperativas",
};

export default function ConfigFuentes() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState("");

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setItems(await getResourceConfig());
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
    const visibles = t ? items.filter((i) => i.recurso.toLowerCase().includes(t)) : items;
    const mapa = new Map();
    for (const i of visibles) {
      if (!mapa.has(i.bloque)) mapa.set(i.bloque, []);
      mapa.get(i.bloque).push(i);
    }
    return [...mapa.entries()].map(([bloque, lista]) => ({
      bloque,
      lista: lista.sort((a, b) => a.recurso.localeCompare(b.recurso)),
      activos: lista.filter((x) => x.enabled).length,
    }));
  }, [items, filtro]);

  async function guardar(item, cambio) {
    await updateResourceConfig(item.recurso, cambio);
    await cargar();
  }

  async function todoElGrupo(lista, enabled) {
    // De a uno y en paralelo: reusa el mismo camino auditado que el
    // cambio individual en vez de una ruta especial que podría
    // divergir.
    await Promise.all(
      lista
        .filter((i) => i.enabled !== enabled)
        .map((i) => updateResourceConfig(i.recurso, { enabled, motivo: i.motivo || "" }))
    );
    await cargar();
  }

  const totalActivos = items?.filter((i) => i.enabled).length ?? 0;

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 4 }}>Fuentes que consultamos</h2>
        <p className="crediscope-muted" style={{ margin: 0, maxWidth: "66ch" }}>
          Cada recurso es una consulta distinta a la fuente de datos. Apagar uno no borra nada de lo ya guardado: deja de
          pedirse de acá en adelante. {items ? <strong>{totalActivos} de {items.length} activos.</strong> : null}
        </p>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="crediscope-card">
        <input
          className="crediscope-input"
          placeholder="Buscar un recurso por nombre..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>

      {!items ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : grupos.length === 0 ? (
        <div className="crediscope-card">
          <p className="crediscope-muted" style={{ margin: 0 }}>Ningún recurso con ese nombre.</p>
        </div>
      ) : (
        <div className="crediscope-secciones">
          {grupos.map((g) => (
            <GrupoConfigurable
              key={g.bloque}
              titulo={ETIQUETA_BLOQUE[g.bloque] ?? g.bloque}
              activos={g.activos}
              total={g.lista.length}
              abiertoPorDefecto={Boolean(filtro)}
              onTodo={(valor) => todoElGrupo(g.lista, valor)}
            >
              {g.lista.map((i) => (
                <FilaConfig key={i.recurso} item={i} etiqueta={i.recurso} onSave={guardar} />
              ))}
            </GrupoConfigurable>
          ))}
        </div>
      )}
    </div>
  );
}
