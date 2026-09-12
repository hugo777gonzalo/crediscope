import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function ClientSearch() {
  const [cedula, setCedula] = useState("");
  const navigate = useNavigate();

  function handleSubmit(e) {
    e.preventDefault();
    const value = cedula.trim();
    if (!value) return;
    navigate(`/perfil/${encodeURIComponent(value)}`);
  }

  return (
    <div className="crediscope-card" style={{ maxWidth: 420 }}>
      <h2>Buscar cliente</h2>
      <p className="crediscope-muted">
        Ingresa la cédula del cliente para ver su análisis más reciente o generar uno nuevo.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          className="crediscope-input"
          placeholder="Cédula"
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          required
        />
        <button className="crediscope-btn" type="submit">
          Buscar
        </button>
      </form>
    </div>
  );
}
