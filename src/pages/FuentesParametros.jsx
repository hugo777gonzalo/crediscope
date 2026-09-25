import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Info } from "lucide-react";
import { getResumenCarteraIngresos } from "../lib/api.js";
import { mesLegible } from "../lib/ingresosCampos.js";

// Parámetros operativos del módulo.
//
// El corte del IESS ya no se edita: lo deducen los propios datos
// (corte_iess_vigente en la base, migración 083). Novadata no avisa
// cuando actualiza el IESS (más o menos cada dos meses); el mes nuevo se
// vuelve vigente cuando lo respaldan 20 clientes consultados. Esta
// pantalla decía que había que cambiar una constante y desplegar, y
// ofrecía como pendiente "poder actualizarlo desde acá": las dos cosas
// quedaron viejas cuando el corte pasó a deducirse solo.
//
// Lo que sí sigue importando: cuántos clientes quedaron clasificados con
// un corte anterior al vigente. Esa clasificación es una foto del momento;
// reconsultar la pone al día.
export default function FuentesParametros() {
  const [d, setD] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getResumenCarteraIngresos()
      .then(setD)
      .catch((err) => setError(err.message));
  }, []);

  const vigente = d?.corteVigente ?? null;
  const conCorteAnterior = d && vigente ? d.cortes.filter(([corte]) => corte < vigente).reduce((a, [, n]) => a + n, 0) : 0;

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
          Novadata actualiza el registro del IESS más o menos cada dos meses y no avisa cuando lo hace. Todas las reglas de
          vigencia se miden contra ese corte, no contra la fecha de hoy. El corte se deduce solo: es el mes más reciente en el
          que aparecen al menos 20 clientes consultados en los últimos 90 días. Algunos aportes llegan antes que el resto: esos
          clientes se clasifican con su propio mes, sin mover el corte de todos.
        </p>

        {!d ? (
          <p className="crediscope-muted">Cargando...</p>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, alignItems: "center", margin: "4px 0 16px" }}>
              <CheckCircle2 size={20} color="var(--good)" style={{ flexShrink: 0 }} />
              <p style={{ margin: 0 }}>
                Corte vigente: <strong>{vigente ? mesLegible(vigente) : "sin consultas recientes"}</strong>. Las consultas nuevas se
                clasifican con ese mes.
              </p>
            </div>

            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Corte con que se clasificó</th>
                  <th>Clientes (último perfil de cada uno)</th>
                </tr>
              </thead>
              <tbody>
                {d.cortes.map(([corte, n]) => (
                  <tr key={corte}>
                    <td style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {mesLegible(corte)}
                      {vigente && corte < vigente ? <span className="crediscope-muted" style={{ fontWeight: 400 }}> · anterior al vigente</span> : null}
                      {vigente && corte > vigente ? (
                        <span className="crediscope-muted" style={{ fontWeight: 400 }}> · aportes adelantados, todavía no es el corte</span>
                      ) : null}
                    </td>
                    <td>{n.toLocaleString("es-EC")}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {conCorteAnterior > 0 ? (
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14 }}>
                <Info size={20} color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} />
                <p style={{ margin: 0 }}>
                  {conCorteAnterior.toLocaleString("es-EC")} cliente(s) tienen su clasificación hecha con un corte anterior. No
                  está mal: es la foto de cuando se los consultó. Quien trabaje con uno de ellos lo ve en su pestaña Fuentes de
                  ingreso, y reconsultarlo lo pone al día.
                </p>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
