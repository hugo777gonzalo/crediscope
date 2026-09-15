import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getResumenFuentesIngreso } from "../lib/api.js";
import { consolidar } from "../lib/fuentesIngresoConsolidado.js";

// Parámetros operativos del módulo. Hoy son de solo lectura: el valor
// vive en el código (CORTE_IESS_CONOCIDO en fuentes-ingreso.ts) y
// cambiarlo requiere desplegar.
//
// Esta pantalla existe igual, y no es adorno: muestra si el parámetro
// quedó viejo. El módulo se autodetecta desactualizado cuando un cliente
// trae un mes posterior al configurado, y sin esta vista ese aviso
// quedaría enterrado dentro de cada perfil.

export default function FuentesParametros() {
  const [perfiles, setPerfiles] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getResumenFuentesIngreso()
      .then(setPerfiles)
      .catch((err) => setError(err.message));
  }, []);

  const d = useMemo(() => (perfiles ? consolidar(perfiles) : null), [perfiles]);

  return (
    <div>
      <p>
        <Link to="/fuentes" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Parámetros</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Valores operativos de los que dependen las reglas. Cambian con el tiempo y no con el criterio.
        </p>
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="crediscope-card">
        <h3>Corte del registro del IESS</h3>
        <p className="crediscope-muted" style={{ marginTop: 0 }}>
          El IESS publica su registro cada dos o tres meses. Todas las reglas de vigencia se miden contra ese corte, no contra la
          fecha de hoy.
        </p>

        {!d ? (
          <p className="crediscope-muted">Cargando...</p>
        ) : d.cortes.length === 0 ? (
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>
            Todavía no hay clientes clasificados con los que verificar el corte.
          </p>
        ) : (
          <>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Corte usado</th>
                  <th>Clientes clasificados con ese corte</th>
                </tr>
              </thead>
              <tbody>
                {d.cortes.map(([corte, n]) => (
                  <tr key={corte}>
                    <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{corte}</td>
                    <td>{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {d.corteDesactualizado > 0 ? (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14 }}>
                <AlertTriangle size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0 }}>
                  <strong>El parámetro quedó viejo.</strong> {d.corteDesactualizado} cliente(s) trajeron un corte más reciente que
                  el configurado, así que el IESS ya publicó uno nuevo. Hay que actualizar{" "}
                  <code>CORTE_IESS_CONOCIDO</code> en <code>fuentes-ingreso.ts</code> y desplegar; mientras tanto el módulo usa
                  el corte del propio cliente cuando es más nuevo.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
                <CheckCircle2 size={20} color="var(--good)" style={{ flexShrink: 0 }} />
                <p className="crediscope-muted" style={{ margin: 0 }}>
                  Ningún cliente trajo un corte más reciente que el configurado.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      <div className="crediscope-card">
        <h3>Pendiente de esta sección</h3>
        <p style={{ marginBottom: 0 }}>
          El corte debería poder actualizarse desde acá, sin desplegar — es un dato operativo que cambia cada dos o tres meses y
          no tendría que depender del equipo técnico. Hoy es de solo lectura.
        </p>
      </div>
    </div>
  );
}
