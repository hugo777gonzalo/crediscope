import { useEffect, useMemo, useState, useCallback } from "react";
import {
  getResourceConfig,
  updateResourceConfig,
  getFieldConfig,
  updateFieldConfig,
  getSegmentConfig,
  updateSegmentConfig,
} from "../lib/api.js";

// Pantalla de administración de las 3 capas de parametrización operativa
// (ver supabase/migrations/006_runtime_config.sql y 016_segment_display_config.sql):
//   A. Fuentes de Ingesta — qué recursos de Novadata consultar.
//   B. Campos de Estructura Estandarizada — qué campos usar en
//      clasificación/LLM (para apagar uno que reporte datos
//      inconsistentes mientras se investiga).
//   C. Segmentos de Perfil del Cliente — qué segmentos se MUESTRAN en
//      la UI del analista (no afecta cálculo ni el LLM, ver nota en
//      016_segment_display_config.sql).
// Cualquier analista autenticado puede activar/desactivar — no hay rol admin
// separado todavía en este proyecto.

// Duplica el orden/etiquetas de grupo del backend a propósito (mismo
// patrón que ClassifiedProfile.jsx) — son solo strings de presentación.
const ORDEN_GRUPOS = [
  "cumplimiento",
  "riesgoSeguridadCiudadana",
  "comportamientoBancario",
  "comportamientoCooperativas",
  "riesgoJudicialCrediticio",
  "riesgoJudicialCivil",
  "riesgoPenal",
  "laboral",
  "tributario",
  "seguridadSocial",
  "patrimonio",
  "familia",
  "identidad",
  "contacto",
  "transitoVehicular",
  "comportamientoInterno",
  "metaConsulta",
];

const ETIQUETAS_GRUPO = {
  cumplimiento: "Cumplimiento y Listas de Control",
  riesgoSeguridadCiudadana: "Riesgo de Seguridad Ciudadana",
  comportamientoBancario: "Comportamiento Bancos / BIESS / Diners",
  comportamientoCooperativas: "Comportamiento Cooperativas",
  riesgoJudicialCrediticio: "Riesgo Judicial Crediticio",
  riesgoJudicialCivil: "Riesgo Judicial / Civil (otros)",
  riesgoPenal: "Riesgo Penal / Fiscalía",
  laboral: "Situación Laboral e Ingresos",
  tributario: "Situación Tributaria (SRI)",
  seguridadSocial: "Seguridad Social",
  patrimonio: "Patrimonio",
  familia: "Núcleo Familiar",
  identidad: "SocioDemográficas",
  contacto: "Contacto y Domicilio",
  transitoVehicular: "Tránsito Vehicular",
  comportamientoInterno: "Comportamiento Interno (Fuente Externa)",
  metaConsulta: "Metadata de la Consulta",
};

const MODOS_SEGMENTO = [
  { valor: "con_datos", etiqueta: "Con datos" },
  { valor: "siempre", etiqueta: "Siempre" },
  { valor: "nunca", etiqueta: "Nunca" },
];

function ConfigRow({ item, labelKey, onSave }) {
  const [enabled, setEnabled] = useState(item.enabled);
  const [motivo, setMotivo] = useState(item.motivo || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const dirty = enabled !== item.enabled || motivo !== (item.motivo || "");

  // Re-sincroniza el estado local cuando llega un `item` fresco del
  // recarga posterior a un guardado — sin esto, si un guardado falla en
  // el servidor, el checkbox seguiría mostrando el cambio como si
  // hubiera funcionado (React no remonta la fila porque la `key` no
  // cambia).
  useEffect(() => {
    setEnabled(item.enabled);
    setMotivo(item.motivo || "");
  }, [item.enabled, item.motivo]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await onSave(item, { enabled, motivo });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr style={{ opacity: enabled ? 1 : 0.6 }}>
      <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 13 }}>{item[labelKey]}</td>
      <td style={{ padding: "6px 8px", textAlign: "center" }}>
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
      </td>
      <td style={{ padding: "6px 8px" }}>
        <input
          className="crediscope-input"
          style={{ fontSize: 13, padding: "4px 8px" }}
          placeholder="Motivo (opcional)"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
        />
      </td>
      <td style={{ padding: "6px 8px" }}>
        <button className="crediscope-btn crediscope-btn-ghost" style={{ padding: "4px 10px", fontSize: 13 }} disabled={!dirty || saving} onClick={handleSave}>
          {saving ? "..." : "Guardar"}
        </button>
        {error ? <div style={{ color: "var(--bad)", fontSize: 12, marginTop: 4 }}>{error}</div> : null}
      </td>
    </tr>
  );
}

function ConfigSection({ title, description, items, groupField, labelKey, onSave, filter }) {
  const filtrados = useMemo(() => {
    if (!filter) return items;
    const f = filter.toLowerCase();
    return items.filter((i) => i[labelKey].toLowerCase().includes(f) || (i[groupField] || "").toLowerCase().includes(f));
  }, [items, filter, groupField, labelKey]);

  const grupos = useMemo(() => {
    const porGrupo = {};
    for (const item of filtrados) {
      (porGrupo[item[groupField]] ??= []).push(item);
    }
    return Object.entries(porGrupo);
  }, [filtrados, groupField]);

  return (
    <div className="crediscope-card">
      <h3 style={{ marginTop: 0 }}>{title}</h3>
      <p className="crediscope-muted">{description}</p>
      {grupos.map(([grupo, rows]) => (
        <div key={grupo} style={{ marginBottom: 18 }}>
          <p style={{ fontWeight: 600, marginBottom: 4 }}>{grupo}</p>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <tbody>
                {rows.map((item) => (
                  <ConfigRow key={item[labelKey]} item={item} labelKey={labelKey} onSave={onSave} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
      {grupos.length === 0 ? <p className="crediscope-muted">Sin resultados.</p> : null}
    </div>
  );
}

function SegmentRow({ item, onSave }) {
  const [modo, setModo] = useState(item.modo);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Mismo motivo que en ConfigRow: re-sincroniza si el guardado falló
  // en el servidor y llegó un `item` fresco sin cambios.
  useEffect(() => {
    setModo(item.modo);
  }, [item.modo]);

  async function handleChange(nuevoModo) {
    if (nuevoModo === modo) return;
    setModo(nuevoModo);
    setSaving(true);
    setError(null);
    try {
      await onSave(item, { modo: nuevoModo, motivo: item.motivo });
    } catch (err) {
      setError(err.message);
      setModo(item.modo);
    } finally {
      setSaving(false);
    }
  }

  return (
    <tr>
      <td style={{ padding: "6px 8px", fontSize: 13 }}>{ETIQUETAS_GRUPO[item.grupo] || item.grupo}</td>
      <td style={{ padding: "6px 8px" }}>
        <div style={{ display: "inline-flex", border: "1px solid var(--border, #ccc)", borderRadius: 8, overflow: "hidden" }}>
          {MODOS_SEGMENTO.map((m) => (
            <button
              key={m.valor}
              type="button"
              disabled={saving}
              onClick={() => handleChange(m.valor)}
              className={modo === m.valor ? "crediscope-btn" : "crediscope-btn crediscope-btn-ghost"}
              style={{ padding: "4px 12px", fontSize: 13, borderRadius: 0, border: "none" }}
            >
              {m.etiqueta}
            </button>
          ))}
        </div>
        {error ? <div style={{ color: "var(--bad)", fontSize: 12, marginTop: 4 }}>{error}</div> : null}
      </td>
    </tr>
  );
}

function SegmentSection({ items, onSave }) {
  const ordenados = useMemo(
    () => [...items].sort((a, b) => ORDEN_GRUPOS.indexOf(a.grupo) - ORDEN_GRUPOS.indexOf(b.grupo)),
    [items]
  );

  return (
    <div className="crediscope-card">
      <h3 style={{ marginTop: 0 }}>{`C. Segmentos de Perfil del Cliente (${items.length})`}</h3>
      <p className="crediscope-muted">
        Qué segmentos se muestran en la vista del analista — no afecta el cálculo ni el Análisis con IA, solo la
        visualización. "Con datos": se muestra solo si el segmento tiene información relevante. "Siempre": se muestra
        aunque esté vacío. "Nunca": nunca se muestra (el dato sigue guardándose para auditoría).
      </p>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {ordenados.map((item) => (
              <SegmentRow key={item.grupo} item={item} onSave={onSave} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminConfig() {
  const [resources, setResources] = useState(null);
  const [fields, setFields] = useState(null);
  const [segments, setSegments] = useState(null);
  const [error, setError] = useState(null);
  const [filterResources, setFilterResources] = useState("");
  const [filterFields, setFilterFields] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [r, f, s] = await Promise.all([getResourceConfig(), getFieldConfig(), getSegmentConfig()]);
      setResources(r);
      setFields(f);
      setSegments(s);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveResource(item, { enabled, motivo }) {
    await updateResourceConfig(item.recurso, { enabled, motivo });
    await load();
  }

  async function handleSaveField(item, { enabled, motivo }) {
    await updateFieldConfig(item.grupo, item.campo, { enabled, motivo });
    await load();
  }

  async function handleSaveSegment(item, { modo, motivo }) {
    await updateSegmentConfig(item.grupo, { modo, motivo });
    await load();
  }

  return (
    <div>
      <h2>Configuración operativa</h2>
      <p className="crediscope-muted">
        Activa o desactiva recursos de ingesta, campos de la Estructura Estandarizada y qué segmentos se ven en Perfil
        del Cliente — sin necesidad de un despliegue. Nada de esto borra datos ya guardados.
      </p>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)" }}>{error}</p>
        </div>
      ) : null}

      {resources === null || fields === null || segments === null ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : (
        <>
          <SegmentSection items={segments} onSave={handleSaveSegment} />

          <div className="crediscope-card">
            <input
              className="crediscope-input"
              placeholder="Buscar recurso de ingesta..."
              value={filterResources}
              onChange={(e) => setFilterResources(e.target.value)}
            />
          </div>
          <ConfigSection
            title={`A. Fuentes de Ingesta (${resources.length})`}
            description="Recursos individuales de las fuentes de información — públicas/externas que pueden fallar, deshabilitarse o tener controles de acceso."
            items={resources}
            groupField="bloque"
            labelKey="recurso"
            onSave={handleSaveResource}
            filter={filterResources}
          />

          <div className="crediscope-card">
            <input
              className="crediscope-input"
              placeholder="Buscar campo de la estructura..."
              value={filterFields}
              onChange={(e) => setFilterFields(e.target.value)}
            />
          </div>
          <ConfigSection
            title={`B. Campos de la Estructura Estandarizada (${fields.length})`}
            description="Campos calculados del StandardClientProfile — desactiva uno si reporta datos inconsistentes mientras se investiga la causa. Se excluye por completo de la clasificación y del Score por LLM."
            items={fields}
            groupField="grupo"
            labelKey="campo"
            onSave={handleSaveField}
            filter={filterFields}
          />
        </>
      )}
    </div>
  );
}
