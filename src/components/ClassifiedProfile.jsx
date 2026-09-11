// Muestra la Estructura Estandarizada clasificada en 4 segmentos
// (positivo/negativo/complementario/sin información), agrupada por los
// grupos definidos en supabase/functions/_shared/classify.ts y
// ordenada por importancia para el análisis crediticio. Duplica el
// orden/etiquetas de grupo del backend a propósito (mismo patrón que
// BlockStatus.jsx) — son solo strings de presentación.

const ORDEN_GRUPOS = [
  "cumplimiento",
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
];

const ETIQUETAS_GRUPO = {
  comportamientoInterno: "Comportamiento Interno (Novadata)",
  comportamientoBancario: "Comportamiento Bancos / BIESS / Diners",
  comportamientoCooperativas: "Comportamiento Cooperativas",
  riesgoJudicialCrediticio: "Riesgo Judicial Crediticio",
  riesgoJudicialCivil: "Riesgo Judicial / Civil (otros)",
  riesgoPenal: "Riesgo Penal / Fiscalía",
  cumplimiento: "Cumplimiento y Listas de Control",
  laboral: "Situación Laboral e Ingresos",
  tributario: "Situación Tributaria (SRI)",
  seguridadSocial: "Seguridad Social",
  patrimonio: "Patrimonio",
  transitoVehicular: "Tránsito Vehicular",
  familia: "Núcleo Familiar",
  contacto: "Contacto y Domicilio",
  identidad: "SocioDemográficas",
};

function formatValor(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Sí" : "No";
  if (Array.isArray(v)) return v.length ? v.join(", ") : "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function agruparPorGrupo(items) {
  const porGrupo = {};
  for (const item of items) {
    (porGrupo[item.grupo] ??= []).push(item);
  }
  return ORDEN_GRUPOS.filter((g) => porGrupo[g]?.length).map((g) => ({ grupo: g, etiqueta: ETIQUETAS_GRUPO[g] || g, items: porGrupo[g] }));
}

function Segmento({ titulo, items, tagClass }) {
  const grupos = agruparPorGrupo(items);
  if (grupos.length === 0) {
    return (
      <div className="crediscope-card">
        <h3>{titulo}</h3>
        <p className="crediscope-muted">Sin campos en este segmento.</p>
      </div>
    );
  }
  return (
    <div className="crediscope-card">
      <h3>
        {titulo} <span className={`crediscope-tag ${tagClass}`}>{items.length}</span>
      </h3>
      {grupos.map(({ grupo, etiqueta, items: campos }) => (
        <div key={grupo} style={{ marginBottom: 14 }}>
          <p style={{ fontWeight: 600, marginBottom: 6 }}>{etiqueta}</p>
          <ul className="crediscope-list">
            {campos.map((c, i) => (
              <li key={i}>
                {c.etiqueta}: <strong>{formatValor(c.valor)}</strong>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export default function ClassifiedProfile({ classification }) {
  if (!classification) return null;
  return (
    <div>
      <Segmento titulo="✅ Aspectos positivos" items={classification.positivos} tagClass="crediscope-tag-ok" />
      <Segmento titulo="⚠️ Aspectos negativos" items={classification.negativos} tagClass="crediscope-tag-bad" />
      <Segmento titulo="ℹ️ Información complementaria" items={classification.complementarios} tagClass="crediscope-tag-warn" />
      <Segmento titulo="❔ Sin información" items={classification.sinInformacion} tagClass="crediscope-tag-warn" />
    </div>
  );
}
