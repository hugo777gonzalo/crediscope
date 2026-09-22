import { useCallback, useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import { getResourceConfig, updateResourceConfig } from "../lib/api.js";
import GrupoConfigurable from "../components/GrupoConfigurable.jsx";
import FilaConfig from "../components/FilaConfig.jsx";
import PestanasProveedor from "../components/PestanasProveedor.jsx";
import { ETIQUETAS_GRUPO } from "../lib/etiquetasGrupos.js";

// Qué le preguntamos a la fuente de datos.
//
// Cada recurso es una consulta distinta al proveedor. Desactivar uno no
// borra nada de lo ya guardado: simplemente deja de pedirse de acá en
// adelante. Sirve para dos cosas muy concretas -- una fuente que está
// caída y hace fallar la consulta entera, y una fuente que la
// institución decide no consultar por política propia.
//
// Agrupado por los mismos grupos del Perfil del Cliente que usa
// ConfigCampos (ETIQUETAS_GRUPO) -- no por los 9 bloques heredados de la
// primera integración (ver migración 067). Una fuente puede alimentar
// más de un grupo (16 de 52 lo hacen), así que aparece en cada card que
// le corresponde: es la representación fiel de un mapa muchos a muchos,
// no un árbol.
//
// GRUPO_SIN_USO es un bucket aparte para las fuentes que no alimentan
// ningún grupo -- ninguna pantalla lee lo que devuelven (columna
// `la_lee_alguien` de novadata_resource_config). Se consultan igual en
// cada corrida; verlas juntas es lo que permite decidir con el dato a
// la vista si vale la pena seguir pidiéndolas.
const GRUPO_SIN_USO = "_sin_uso";
const ETIQUETA_SIN_USO = "Sin uso conocido";

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
      const gruposDeEsta = i.alimenta_grupos?.length ? i.alimenta_grupos : [GRUPO_SIN_USO];
      for (const g of gruposDeEsta) {
        if (!mapa.has(g)) mapa.set(g, []);
        mapa.get(g).push(i);
      }
    }
    return [...mapa.entries()]
      .map(([grupo, lista]) => ({
        grupo,
        lista: lista.sort((a, b) => a.recurso.localeCompare(b.recurso)),
        activos: lista.filter((x) => x.enabled).length,
      }))
      .sort((a, b) => (a.grupo === GRUPO_SIN_USO ? 1 : b.grupo === GRUPO_SIN_USO ? -1 : a.grupo.localeCompare(b.grupo)));
  }, [items, filtro]);

  async function guardar(item, cambio) {
    await updateResourceConfig(item.recurso, cambio);
    await cargar();
  }

  async function todoElGrupo(lista, enabled) {
    // De a uno y en paralelo: reusa el mismo camino auditado que el
    // cambio individual en vez de una ruta especial que podría
    // divergir. Ojo: una fuente que alimenta varios grupos puede
    // aparecer en más de una lista -- updateResourceConfig es
    // idempotente por recurso, así que pedirla dos veces no rompe nada.
    await Promise.all(
      lista
        .filter((i) => i.enabled !== enabled)
        .map((i) => updateResourceConfig(i.recurso, { enabled, motivo: i.motivo || "" }))
    );
    await cargar();
  }

  const totalActivos = items?.filter((i) => i.enabled).length ?? 0;
  const descripcion =
    "Cada recurso es una consulta distinta a la fuente de datos. Desactivar uno no borra nada de lo ya guardado: deja de pedirse de acá en adelante.";

  return (
    <div>
      <PestanasProveedor base="fuentes" activo="novadata" />

      <div style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>
          Fuentes que consultamos
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
              key={g.grupo}
              titulo={g.grupo === GRUPO_SIN_USO ? ETIQUETA_SIN_USO : ETIQUETAS_GRUPO[g.grupo] ?? g.grupo}
              descripcion={g.grupo === GRUPO_SIN_USO ? "Se consultan en cada corrida y ningún campo del perfil usa la respuesta." : undefined}
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
