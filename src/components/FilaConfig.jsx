import { useEffect, useState } from "react";
import { describirError } from "../lib/mensajesDeError.js";

// Una opción de configuración: el interruptor, el motivo y el guardado.
//
// El motivo no es opcional por capricho de formulario: apagar una
// fuente o un campo cambia lo que ve el analista y lo que pondera el
// modelo, y dentro de un mes nadie va a recordar por qué. La columna
// existe para que la respuesta esté al lado de la decisión.
//
// Se re-sincroniza cuando llega un item fresco del servidor: sin eso,
// un guardado que falla dejaría el interruptor mostrando el cambio como
// si hubiera funcionado -- React no vuelve a montar la fila porque la
// clave no cambió.
//
// `codigo`: la etiqueta es el nombre técnico de una fuente o un campo
// (`iess_mecanizado`) y va en letra de código. Un proveedor (Equifax, Aval)
// tiene nombre comercial y va en letra normal (revisión del 2026-10-18).

export default function FilaConfig({ item, etiqueta, descripcion, onSave, codigo = true }) {
  const [enabled, setEnabled] = useState(item.enabled);
  const [motivo, setMotivo] = useState(item.motivo || "");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);
  const sucio = enabled !== item.enabled || motivo !== (item.motivo || "");

  useEffect(() => {
    setEnabled(item.enabled);
    setMotivo(item.motivo || "");
  }, [item.enabled, item.motivo]);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await onSave(item, { enabled, motivo });
    } catch (err) {
      setError(describirError(err).mensaje);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="crediscope-config-fila" style={{ opacity: enabled ? 1 : 0.55 }}>
      <label className="crediscope-config-fila-nombre">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          aria-label={enabled ? `Desactivar ${etiqueta}` : `Activar ${etiqueta}`}
        />
        <span>
          {codigo ? <code>{etiqueta}</code> : <strong>{etiqueta}</strong>}
          {descripcion ? (
            <span className="crediscope-muted" style={{ display: "block", fontSize: 13 }}>{descripcion}</span>
          ) : null}
        </span>
      </label>
      <input
        className="crediscope-input"
        style={{ fontSize: 13, padding: "5px 9px" }}
        placeholder="Por qué se cambió"
        aria-label={`Por qué se cambió ${etiqueta}`}
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
      />
      <button
        className="crediscope-btn crediscope-btn-ghost"
        style={{ padding: "5px 12px", fontSize: 13 }}
        disabled={!sucio || guardando}
        onClick={guardar}
      >
        {guardando ? "..." : "Guardar"}
      </button>
      {error ? <p style={{ color: "var(--bad)", fontSize: 12, margin: 0, gridColumn: "1 / -1" }}>{error}</p> : null}
    </div>
  );
}
