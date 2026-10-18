import { useState } from "react";
import { Gavel } from "lucide-react";
import { evaluarSolicitud } from "../../lib/api.js";
import { formatearFechaHora } from "../../lib/fechas.js";
import { plural } from "../../lib/formatos.js";
import AvisoDeError from "../ui/AvisoDeError.jsx";
import {
  decisionesPosibles,
  MOTIVO_MAXIMO,
  MOTIVO_MINIMO,
  NOMBRE_DE_LA_DECISION,
} from "../../../supabase/functions/_shared/estado-de-la-persona.ts";

// Lo que decide la institución sobre la solicitud (134). Lo marca el analista,
// con motivo (negocio, 2026-10-18); no lo calcula el modelo. Se puede cambiar:
// vale la última y todas quedan en el historial, igual que por la API.
const CLASE_DE_LA_DECISION = { aprobado: "crediscope-tag-ok", rechazado: "crediscope-tag-bad", desistido: "crediscope-tag-neutral" };

const AYUDA = {
  aprobado: "La institución aprueba el crédito.",
  rechazado: "La institución no aprueba el crédito.",
  desistido: "La persona ya no sigue con la solicitud. Si la evaluación no terminó, se detiene.",
};

export default function DecisionDeLaSolicitud({ solicitud, alDecidir }) {
  const posibles = decisionesPosibles(solicitud.estado);
  const [editando, setEditando] = useState(false);
  const [decision, setDecision] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const anteriores = (solicitud.decisiones ?? []).slice(0, -1).reverse();
  const listo = posibles.includes(decision) && motivo.trim().length >= MOTIVO_MINIMO && !enviando;

  async function anotar(e) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    try {
      const fila = await evaluarSolicitud({ accion: "decidir", id: solicitud.id, decision, motivo: motivo.trim() });
      setEditando(false);
      setDecision(null);
      setMotivo("");
      alDecidir(fila);
    } catch (err) {
      setError(err);
    } finally {
      setEnviando(false);
    }
  }

  const formulario = (
    <form onSubmit={anotar} className="crediscope-decision-formulario">
      <fieldset className="crediscope-decision-opciones">
        <legend className="crediscope-decision-etiqueta">Decisión</legend>
        {posibles.map((d) => (
          <label key={d} className={`crediscope-decision-opcion${decision === d ? " crediscope-decision-opcion-elegida" : ""}`}>
            <input type="radio" name="decision" value={d} checked={decision === d} onChange={() => setDecision(d)} />
            <span>
              <strong>{NOMBRE_DE_LA_DECISION[d]}</strong>
              <small>{AYUDA[d]}</small>
            </span>
          </label>
        ))}
      </fieldset>
      <label htmlFor="decision-motivo" className="crediscope-decision-etiqueta">
        Motivo
      </label>
      <textarea
        id="decision-motivo"
        className="crediscope-input"
        rows={3}
        maxLength={MOTIVO_MAXIMO}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        placeholder="Por qué se decide así: queda registrado con tu nombre."
      />
      {error ? <AvisoDeError error={error} /> : null}
      <div className="crediscope-equifax-confirmar-botones">
        <button type="submit" className="crediscope-btn" disabled={!listo}>
          {enviando ? "Anotando..." : "Anotar la decisión"}
        </button>
        {solicitud.decision ? (
          <button type="button" className="crediscope-btn crediscope-btn-ghost" onClick={() => setEditando(false)} disabled={enviando}>
            Cancelar
          </button>
        ) : null}
      </div>
    </form>
  );

  return (
    <section className="crediscope-card crediscope-decision">
      <h3 className="crediscope-capacidad-subtitulo">
        <Gavel size={17} aria-hidden="true" />
        Decisión de la institución
      </h3>
      {solicitud.decision && !editando ? (
        <>
          <p style={{ margin: "0 0 8px" }}>
            <span className={`crediscope-tag ${CLASE_DE_LA_DECISION[solicitud.decision]}`}>{NOMBRE_DE_LA_DECISION[solicitud.decision]}</span>
            <span className="crediscope-muted"> · el {formatearFechaHora(solicitud.decidida_el)}</span>
          </p>
          <p style={{ margin: "0 0 12px" }}>{solicitud.decision_motivo}</p>
          {anteriores.length ? (
            <details className="crediscope-plegable" style={{ marginBottom: 12 }}>
              <summary>Se cambió {plural(anteriores.length, "vez", "veces")}</summary>
              <ul className="crediscope-decision-historial">
                {anteriores.map((d) => (
                  <li key={d.decididaEl}>
                    <strong>{NOMBRE_DE_LA_DECISION[d.decision] ?? d.decision}</strong> · {formatearFechaHora(d.decididaEl)}: {d.motivo}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          <button type="button" className="crediscope-btn crediscope-btn-ghost" onClick={() => setEditando(true)}>
            Cambiar la decisión
          </button>
        </>
      ) : (
        <>
          <p className="crediscope-muted" style={{ margin: "0 0 12px" }}>
            {solicitud.estado === "evaluada"
              ? "La recomendación del modelo y la capacidad de pago informan; la decisión la toma la institución."
              : "Aprobar o rechazar se puede cuando termine la evaluación. Si la persona ya no sigue, marcá que desistió."}
          </p>
          {formulario}
        </>
      )}
    </section>
  );
}
