import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Info } from "lucide-react";
import { clasificarIdentificacion } from "../../supabase/functions/_shared/identificacion.ts";

// Punto de entrada de todo el sistema. Lo que se escriba acá define a
// qué persona se va a evaluar, así que se revisa antes de avanzar.
//
// La revisión completa vive en identificacion.ts, y este archivo la
// IMPORTA del mismo lugar del que la importan las funciones del
// servidor. No es una copia: es el mismo archivo. Tener dos
// implementaciones de "qué es una cédula válida" es cómo aparecen las
// diferencias silenciosas entre lo que la pantalla acepta y lo que el
// servidor rechaza.
//
// Acá la revisión es una cortesía -- avisar antes de perder el viaje.
// La que manda es la del servidor, porque a esos endpoints también los
// llaman sistemas de afuera.

export default function ClientSearch() {
  const [cedula, setCedula] = useState("");
  const [intentado, setIntentado] = useState(false);
  const navigate = useNavigate();

  const ident = useMemo(() => clasificarIdentificacion(cedula), [cedula]);

  // Mientras se escribe no se corrige a nadie: un número a medio tipear
  // siempre está mal y avisarlo en cada tecla es ruido. El aviso
  // aparece cuando ya tiene largo de algo, o cuando se intenta buscar.
  const mostrarProblema =
    !ident.consultable && ident.tipo !== "vacio" && (intentado || ident.ingresado.length >= 10);

  function handleSubmit(e) {
    e.preventDefault();
    setIntentado(true);
    if (!ident.consultable) return;
    // Se navega a la CÉDULA, no a lo que se escribió: si entró un RUC
    // de persona natural, de acá en adelante el sistema trabaja con la
    // persona. El aviso de que eso pasó viaja en la dirección.
    const destino = `/perfil/${encodeURIComponent(ident.cedula)}`;
    navigate(ident.tipo === "ruc_persona_natural" ? `${destino}?desdeRuc=${ident.ingresado}` : destino);
  }

  return (
    <div className="crediscope-card" style={{ maxWidth: 480 }}>
      <h2>Buscar cliente</h2>
      <p className="crediscope-muted">
        Ingresá la cédula del cliente para ver su análisis más reciente o generar uno nuevo.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          className="crediscope-input"
          placeholder="Cédula"
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={mostrarProblema}
          aria-describedby={mostrarProblema ? "aviso-cedula" : undefined}
          required
        />
        <button className="crediscope-btn" type="submit">
          Buscar
        </button>
      </form>

      {mostrarProblema ? (
        <p
          id="aviso-cedula"
          style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, marginBottom: 0, color: "var(--bad)", fontSize: 13.5 }}
        >
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{ident.mensaje}</span>
        </p>
      ) : null}

      {ident.tipo === "ruc_persona_natural" ? (
        <p style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 12, marginBottom: 0, fontSize: 13.5 }}>
          <Info size={16} color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} />
          <span>{ident.mensaje}</span>
        </p>
      ) : null}
    </div>
  );
}
