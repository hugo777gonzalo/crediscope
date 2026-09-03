const LABELS = {
  general: "Información general",
  sociodemografica: "Sociodemográfica",
  trabajo: "Trabajo",
  iess: "Aportes IESS",
  vehiculos: "Vehículos",
  funcion_judicial: "Función Judicial",
  fiscalia: "Fiscalía",
  bancos: "Bancos",
  cooperativas: "Cooperativas",
};

function tagClass(status) {
  if (status === "ok") return "crediscope-tag-ok";
  if (status === "faltante") return "crediscope-tag-warn";
  return "crediscope-tag-bad";
}

function tagText(status) {
  if (status === "ok") return "OK";
  if (status === "faltante") return "Sin datos";
  return "Error";
}

export default function BlockStatus({ blockStatus }) {
  const entries = Object.entries(blockStatus || {});
  return (
    <div className="crediscope-block-grid">
      {entries.map(([key, status]) => (
        <div key={key} className={`crediscope-tag ${tagClass(status)}`}>
          {LABELS[key] || key}: {tagText(status)}
        </div>
      ))}
    </div>
  );
}
