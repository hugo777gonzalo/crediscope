import { useState } from "react";
import { ListOrdered } from "lucide-react";
import InfoTooltip from "../InfoTooltip.jsx";
import { TituloTarjeta } from "../reporte/Piezas.jsx";
import { moneda, plural } from "../../lib/formatos.js";
import { SISTEMAS, tipoDeCredito, rolLegible, operacionesOrdenadas, atrasoDeOperacion } from "../../lib/equifaxPantalla.js";

// Cada operación de hoy, lo propio primero. Son de 9 a 43 por persona en las
// primeras 62 consultas: se muestran las primeras y el resto con un clic (en
// el reporte en PDF van todas).
const VISIBLES = 8;
const NOMBRE_DEL_SISTEMA = Object.fromEntries(SISTEMAS);

export default function OperacionesEquifax({ operaciones, todas = false }) {
  const [abiertas, setAbiertas] = useState(false);
  const ordenadas = operacionesOrdenadas(operaciones);
  const mostradas = todas || abiertas ? ordenadas : ordenadas.slice(0, VISIBLES);
  const restantes = ordenadas.length - mostradas.length;

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={ListOrdered}>
        Operaciones
        <span className="crediscope-equifax-cuenta">{plural(ordenadas.length, "operación", "operaciones")}</span>
      </TituloTarjeta>
      {ordenadas.length === 0 ? (
        <p className="crediscope-muted">Equifax no reporta operaciones vigentes de esta persona.</p>
      ) : (
        <>
          <div className="crediscope-equifax-tabla-envoltura">
            <table className="crediscope-table crediscope-equifax-tabla">
              <thead>
                <tr>
                  <th scope="col">Institución</th>
                  <th scope="col">Tipo</th>
                  <th scope="col" className="crediscope-equifax-num">Deuda</th>
                  <th scope="col" className="crediscope-equifax-num">En atraso</th>
                  <th scope="col" className="crediscope-equifax-num">Cuota</th>
                  <th scope="col" className="crediscope-equifax-num">
                    Días de mora{" "}
                    <InfoTooltip lado="derecha" etiqueta="Qué son los días de mora">
                      Cuántos días de atraso tiene hoy la operación, según la institución que la reporta. Puede haber
                      días de mora sin monto vencido todavía.
                    </InfoTooltip>
                  </th>
                </tr>
              </thead>
              <tbody>
                {mostradas.map((o) => {
                  const atraso = atrasoDeOperacion(o);
                  const ajena = o.rol !== "titular";
                  return (
                    <tr key={o.orden} className={ajena ? "crediscope-equifax-fila-ajena" : undefined}>
                      <th scope="row">
                        <span className="crediscope-equifax-institucion">{o.institucion}</span>
                        <span className="crediscope-equifax-sistema-detalle">
                          {NOMBRE_DEL_SISTEMA[o.sistema] ?? o.sistema}
                          {ajena ? ` · como ${rolLegible(o.rol).toLowerCase()}` : ""}
                        </span>
                      </th>
                      <td>{tipoDeCredito(o.tipo_credito)}</td>
                      <td className="crediscope-equifax-num">{moneda(o.saldo_deuda_usd)}</td>
                      <td className="crediscope-equifax-num">
                        <span className={atraso > 0 ? "crediscope-aval-malo" : "crediscope-aval-cero"}>{moneda(atraso)}</span>
                      </td>
                      <td className="crediscope-equifax-num">{moneda(o.cuota_mensual_usd)}</td>
                      <td className="crediscope-equifax-num">
                        <span className={(o.dias_morosidad ?? 0) > 0 ? "crediscope-aval-malo" : "crediscope-aval-cero"}>
                          {o.dias_morosidad ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {restantes > 0 ? (
            <button type="button" className="crediscope-btn-ghost crediscope-no-imprimir crediscope-equifax-ver-mas" onClick={() => setAbiertas(true)}>
              Ver {plural(restantes, "operación más", "operaciones más")}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}
