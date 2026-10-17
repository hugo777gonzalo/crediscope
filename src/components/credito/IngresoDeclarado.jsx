import { UserRound } from "lucide-react";
import EntradaDeMonto from "./EntradaDeMonto.jsx";

// «Ingreso declarado» (nombre del negocio, 2026-10-17): lo que la persona que
// pide el crédito dice que recibe por mes. Es opcional; si se completa, la
// capacidad se mide con él en lugar del reportado al IESS, que queda como
// referencia. No es una estimación: es una declaración, y no está verificada.
export default function IngresoDeclarado({ valor, alCambiar }) {
  return (
    <div className="crediscope-card crediscope-credito-formulario">
      <div className="crediscope-credito-campo" style={{ marginBottom: 0 }}>
        <div className="crediscope-credito-campo-cabecera">
          <label htmlFor="ingreso-declarado">
            <UserRound size={15} aria-hidden="true" style={{ marginRight: 6, verticalAlign: "-2px" }} />
            Ingreso declarado
          </label>
          <span className="crediscope-muted">opcional</span>
        </div>
        <EntradaDeMonto
          id="ingreso-declarado"
          prefijo="$"
          sufijo="por mes"
          valor={valor}
          alCambiar={alCambiar}
          marcador="Lo que dice recibir"
          etiquetaAccesible="Ingreso declarado por la persona, en dólares por mes"
        />
        <p className="crediscope-credito-ayuda">
          Lo que la persona dice que recibe por mes. Si se completa, la capacidad se mide con este monto en lugar del reportado al IESS. No está
          verificado.
        </p>
      </div>
    </div>
  );
}
