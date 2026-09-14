import { useState } from "react";
import { Check, X, MessageSquare, Power, FlaskConical } from "lucide-react";
import { revisarPropuesta, ponerEnVigencia } from "../lib/api.js";

// Revisión humana de las propuestas de ajuste. Todo el vocabulario acá
// es de negocio: quien decide es una jefatura de Crédito/Riesgos, no un
// perfil técnico. "Criterio del modelo" es lo que internamente se llama
// marco interpretativo; esa palabra no aparece en pantalla.

const ESTADOS = {
  pendiente: { texto: "Pendiente de revisión", color: "var(--text-muted)" },
  aprobada: { texto: "Aprobada", color: "var(--good)" },
  rechazada: { texto: "Rechazada", color: "var(--bad)" },
  cambios_solicitados: { texto: "Con cambios solicitados", color: "var(--warn)" },
};

const TIPOS = {
  criterio_modelo: { texto: "Criterio del modelo", ayuda: "Cambia cómo el modelo evalúa a una persona. Se puede probar antes de aplicar." },
  politica_credito: { texto: "Política de crédito", ayuda: "Es una recomendación para el proceso del área. El sistema no la aplica solo." },
};

function Propuesta({ propuesta, onCambio, seleccionada, onSeleccionar }) {
  const [comentario, setComentario] = useState(propuesta.comentario_revisor ?? "");
  const [guardando, setGuardando] = useState(false);
  const [mostrarComentario, setMostrarComentario] = useState(false);
  const estado = ESTADOS[propuesta.estado] ?? ESTADOS.pendiente;
  const tipo = TIPOS[propuesta.tipo] ?? TIPOS.criterio_modelo;
  const esCriterio = propuesta.tipo === "criterio_modelo";

  async function revisar(nuevoEstado) {
    setGuardando(true);
    try {
      await revisarPropuesta(propuesta.id, { estado: nuevoEstado, comentario });
      await onCambio();
    } finally {
      setGuardando(false);
    }
  }

  async function alternarVigencia() {
    setGuardando(true);
    try {
      await ponerEnVigencia(propuesta.id, !propuesta.vigente_desde);
      await onCambio();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="crediscope-card" style={{ borderLeft: `3px solid ${estado.color}` }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between", flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 6 }}>
            {esCriterio && propuesta.estado === "aprobada" ? (
              <input
                type="checkbox"
                checked={seleccionada}
                onChange={() => onSeleccionar(propuesta.id)}
                title="Incluir en la próxima prueba"
                style={{ width: 15, height: 15, accentColor: "var(--brand)" }}
              />
            ) : null}
            <strong style={{ fontSize: 15 }}>{propuesta.titulo}</strong>
          </div>
          <p className="crediscope-muted" style={{ margin: "0 0 8px", fontSize: 12.5 }}>
            <span title={tipo.ayuda}>{tipo.texto}</span> · <span style={{ color: estado.color, fontWeight: 600 }}>{estado.texto}</span>
            {propuesta.vigente_desde ? <span style={{ color: "var(--good)", fontWeight: 600 }}> · En vigencia</span> : null}
          </p>
          <p style={{ margin: "0 0 10px", lineHeight: 1.6, fontSize: 14 }}>{propuesta.justificacion}</p>

          {propuesta.cambio_sugerido ? (
            <div style={{ background: "var(--panel-muted)", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
              <p className="crediscope-muted" style={{ margin: "0 0 4px", fontSize: 11.5, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>
                Criterio que se agregaría
              </p>
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55 }}>{propuesta.cambio_sugerido}</p>
            </div>
          ) : null}

          {propuesta.impacto_esperado ? (
            <p className="crediscope-muted" style={{ margin: "0 0 8px", fontSize: 13 }}>
              <strong>Impacto esperado:</strong> {propuesta.impacto_esperado}
            </p>
          ) : null}

          {Array.isArray(propuesta.evidencia) && propuesta.evidencia.length > 0 ? (
            <p className="crediscope-muted" style={{ margin: 0, fontSize: 12.5 }}>
              Casos que la respaldan: {propuesta.evidencia.join(", ")}
            </p>
          ) : null}

          {propuesta.comentario_revisor && !mostrarComentario ? (
            <p className="crediscope-muted" style={{ margin: "8px 0 0", fontSize: 13, fontStyle: "italic" }}>
              Comentario: {propuesta.comentario_revisor}
            </p>
          ) : null}
        </div>
      </div>

      {mostrarComentario ? (
        <input
          className="crediscope-input"
          style={{ marginTop: 10 }}
          placeholder="Comentario para dejar registrado con la decisión"
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
        />
      ) : null}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button className="crediscope-btn" onClick={() => revisar("aprobada")} disabled={guardando || propuesta.estado === "aprobada"}>
          <Check size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          Aprobar
        </button>
        <button className="crediscope-btn crediscope-btn-ghost" onClick={() => revisar("cambios_solicitados")} disabled={guardando}>
          <MessageSquare size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          Pedir cambios
        </button>
        <button className="crediscope-btn crediscope-btn-ghost" onClick={() => revisar("rechazada")} disabled={guardando}>
          <X size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
          Rechazar
        </button>
        <button className="crediscope-btn crediscope-btn-ghost" onClick={() => setMostrarComentario((v) => !v)} disabled={guardando}>
          {mostrarComentario ? "Ocultar comentario" : "Agregar comentario"}
        </button>
        {esCriterio && propuesta.estado === "aprobada" ? (
          <button
            className="crediscope-btn crediscope-btn-ghost"
            onClick={alternarVigencia}
            disabled={guardando}
            title="Al ponerlo en vigencia, el criterio empieza a aplicarse en los análisis nuevos"
            style={propuesta.vigente_desde ? { borderColor: "var(--good)", color: "var(--good)" } : undefined}
          >
            <Power size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            {propuesta.vigente_desde ? "Quitar de vigencia" : "Poner en vigencia"}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function PropuestasAjuste({ propuestas, onCambio, onProbar, probando, seleccionadas, onSeleccionar }) {
  if (propuestas.length === 0) return null;
  const aprobadasCriterio = propuestas.filter((p) => p.tipo === "criterio_modelo" && p.estado === "aprobada");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 4 }}>
        <h3 style={{ margin: 0 }}>Ajustes propuestos</h3>
        {aprobadasCriterio.length > 0 ? (
          <button className="crediscope-btn" onClick={onProbar} disabled={probando || seleccionadas.length === 0}>
            <FlaskConical size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            {probando ? "Probando..." : `Probar ${seleccionadas.length} ajuste(s) con casos reales`}
          </button>
        ) : null}
      </div>
      <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
        Nada se aplica hasta que vos lo apruebes. Aprobar y poner en vigencia son dos pasos: podés aprobar un ajuste, probarlo
        contra los créditos reales, y recién entonces activarlo.
      </p>
      <div style={{ display: "grid", gap: 12 }}>
        {propuestas.map((p) => (
          <Propuesta
            key={p.id}
            propuesta={p}
            onCambio={onCambio}
            seleccionada={seleccionadas.includes(p.id)}
            onSeleccionar={onSeleccionar}
          />
        ))}
      </div>
    </div>
  );
}
