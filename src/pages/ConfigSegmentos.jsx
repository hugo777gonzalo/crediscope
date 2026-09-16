import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Filter } from "lucide-react";
import { getSegmentConfig, updateSegmentConfig } from "../lib/api.js";
import { ETIQUETAS_GRUPO } from "../lib/etiquetasGrupos.js";

// Qué ve el analista en el Perfil del Cliente.
//
// Es la única de las tres configuraciones que NO cambia el análisis:
// acá se decide qué se muestra en pantalla, no qué se consulta ni qué
// pondera el modelo. Un segmento oculto se sigue consultando, se sigue
// guardando y el modelo lo sigue usando.
//
// Esa distinción es el motivo de que sean tres pantallas y no una: las
// tres tienen interruptores parecidos y consecuencias completamente
// distintas.
//
// Tres modos y no dos, porque la cartera real lo pide: hay segmentos
// que solo tienen sentido cuando la persona tiene algo ahí -- mostrar
// "Patrimonio: sin vehículos, sin inmuebles, sin inversiones" en las
// dos mil personas que no tienen nada es ruido que esconde lo que sí
// importa.

const MODOS = [
  {
    valor: "siempre",
    etiqueta: "Siempre visible",
    Icono: Eye,
    color: "var(--good)",
    detalle: "Aparece aunque no haya ningún dato. Para lo que el analista tiene que mirar sí o sí.",
  },
  {
    valor: "con_datos",
    etiqueta: "Solo si hay datos",
    Icono: Filter,
    color: "var(--brand)",
    detalle: "Aparece cuando la persona tiene algo en ese segmento. Evita llenar la pantalla de vacíos.",
  },
  {
    valor: "oculto",
    etiqueta: "Oculto",
    Icono: EyeOff,
    color: "var(--text-muted)",
    detalle: "No se muestra nunca. Se sigue consultando, guardando y ponderando: solo no se ve.",
  },
];

function FilaSegmento({ item, onSave }) {
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function cambiar(modo) {
    if (modo === item.modo) return;
    setGuardando(true);
    setError(null);
    try {
      await onSave(item, { modo, motivo: item.motivo || "" });
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="crediscope-config-fila">
      <div style={{ minWidth: 0 }}>
        <strong>{ETIQUETAS_GRUPO[item.grupo] ?? item.grupo}</strong>
        <div className="crediscope-muted" style={{ fontSize: 12.5 }}>
          <code>{item.grupo}</code>
        </div>
        {error ? <p style={{ color: "var(--bad)", fontSize: 12, margin: "4px 0 0" }}>{error}</p> : null}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", gridColumn: "2 / -1" }}>
        {MODOS.map((m) => {
          const activo = item.modo === m.valor;
          return (
            <button
              key={m.valor}
              type="button"
              className="crediscope-btn crediscope-btn-ghost"
              style={{
                padding: "5px 11px",
                fontSize: 12.5,
                borderColor: activo ? m.color : undefined,
                color: activo ? m.color : undefined,
                fontWeight: activo ? 700 : 500,
              }}
              disabled={guardando}
              onClick={() => cambiar(m.valor)}
              title={m.detalle}
            >
              <m.Icono size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
              {m.etiqueta}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ConfigSegmentos() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      setItems(await getSegmentConfig());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function guardar(item, cambio) {
    await updateSegmentConfig(item.grupo, cambio);
    await cargar();
  }

  async function todosA(modo) {
    await Promise.all(
      (items ?? []).filter((i) => i.modo !== modo).map((i) => updateSegmentConfig(i.grupo, { modo, motivo: i.motivo || "" }))
    );
    await cargar();
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 4 }}>Qué ve el analista</h2>
        <p className="crediscope-muted" style={{ margin: 0, maxWidth: "66ch" }}>
          Esta es la única configuración que <strong>no cambia el análisis</strong>. Un segmento oculto se sigue consultando,
          se sigue guardando y el modelo lo sigue usando: solo no se muestra en el Perfil del Cliente.
        </p>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Los tres modos</h3>
        {MODOS.map((m) => (
          <p key={m.valor} style={{ display: "flex", gap: 9, alignItems: "flex-start", margin: "0 0 8px", fontSize: 13.5 }}>
            <m.Icono size={16} color={m.color} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              <strong>{m.etiqueta}.</strong> {m.detalle}
            </span>
          </p>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14, borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <span className="crediscope-muted" style={{ fontSize: 13, alignSelf: "center" }}>Aplicar a todos:</span>
          {MODOS.map((m) => (
            <button
              key={m.valor}
              type="button"
              className="crediscope-btn crediscope-btn-ghost"
              style={{ padding: "5px 11px", fontSize: 12.5 }}
              disabled={!items}
              onClick={() => todosA(m.valor)}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
      </div>

      {!items ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : (
        <div className="crediscope-card">
          {items.map((i) => (
            <FilaSegmento key={i.grupo} item={i} onSave={guardar} />
          ))}
        </div>
      )}
    </div>
  );
}
