import { Landmark } from "lucide-react";
import InfoTooltip from "../InfoTooltip.jsx";
import { TituloTarjeta } from "../reporte/Piezas.jsx";
import { moneda, plural } from "../../lib/formatos.js";
import { filasDeDeuda, enAtraso } from "../../lib/equifaxPantalla.js";

// Cuánto debe como titular, por sistema, y aparte lo que respalda de otra
// persona. Lo de codeudor o garante NO se suma: en Aval esa mezcla inflaba la
// deuda, y en Ecuador «garantía» es el colateral, así que tampoco se llama así
// (negocio, 2026-10-13).
const Monto = ({ valor, alerta = false }) => (
  <span className={valor === 0 ? "crediscope-aval-cero" : alerta && valor > 0 ? "crediscope-aval-malo" : undefined}>
    {moneda(valor)}
  </span>
);

export default function DeudaPorSistema({ estructura }) {
  const filas = filasDeDeuda(estructura);
  const total = estructura?.deudaActualTitular?.total ?? null;
  const otros = estructura?.deudaCodeudorGarante?.total ?? null;

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={Landmark}>Cuánto debe como titular</TituloTarjeta>
      <div className="crediscope-equifax-tabla-envoltura">
        <table className="crediscope-table crediscope-equifax-tabla">
          <thead>
            <tr>
              <th scope="col">Sistema</th>
              <th scope="col" className="crediscope-equifax-num">Deuda</th>
              <th scope="col" className="crediscope-equifax-num">Al día</th>
              <th scope="col" className="crediscope-equifax-num">
                En atraso{" "}
                <InfoTooltip etiqueta="Qué cuenta como atraso">
                  Vencido, lo que ya no devenga intereses, lo que está en demanda judicial y la cartera castigada.
                </InfoTooltip>
              </th>
              <th scope="col" className="crediscope-equifax-num">Cuota mensual</th>
              <th scope="col" className="crediscope-equifax-num">
                Mora más larga{" "}
                <InfoTooltip lado="derecha" etiqueta="Qué es la mora más larga">
                  Los días de atraso de la operación más atrasada hoy, en ese sistema.
                </InfoTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.clave} className={f.operaciones === 0 ? "crediscope-equifax-fila-vacia" : undefined}>
                <th scope="row">
                  <span className="crediscope-equifax-sistema">{f.texto}</span>
                  <span className="crediscope-equifax-sistema-detalle">
                    {f.operaciones > 0 ? plural(f.operaciones, "operación", "operaciones") : "Sin deuda"}
                  </span>
                  {f.demanda ? <span className="crediscope-equifax-marca crediscope-equifax-marca-mala">En demanda judicial</span> : null}
                  {f.castigada ? <span className="crediscope-equifax-marca crediscope-equifax-marca-mala">Cartera castigada</span> : null}
                  {f.noCuadra ? (
                    <span className="crediscope-equifax-marca crediscope-equifax-marca-aviso">
                      No cuadra con el total de Equifax
                      <InfoTooltip lado="izquierda" etiqueta="Por qué no cuadra">
                        La suma de las operaciones de este sistema no da el total que la propia Equifax publica. Pasa más
                        en el sector comercial, que trae operaciones con cortes de distintos meses. Las cifras de esta
                        fila son la suma de las operaciones.
                      </InfoTooltip>
                    </span>
                  ) : null}
                </th>
                <td className="crediscope-equifax-num"><Monto valor={f.saldo} /></td>
                <td className="crediscope-equifax-num"><Monto valor={f.alDia} /></td>
                <td className="crediscope-equifax-num"><Monto valor={f.atraso} alerta /></td>
                <td className="crediscope-equifax-num"><Monto valor={f.cuota} /></td>
                <td className="crediscope-equifax-num">
                  {f.maximoDias === null ? (
                    <span className="crediscope-aval-cero">—</span>
                  ) : (
                    <span className={f.maximoDias > 0 ? "crediscope-aval-malo" : "crediscope-aval-cero"}>
                      {plural(f.maximoDias, "día", "días")}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          {total ? (
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td className="crediscope-equifax-num"><Monto valor={total.saldoDeudaUsd} /></td>
                <td className="crediscope-equifax-num"><Monto valor={total.saldoPorVencerUsd} /></td>
                <td className="crediscope-equifax-num"><Monto valor={enAtraso(total)} alerta /></td>
                <td className="crediscope-equifax-num"><Monto valor={total.cuotaMensualUsd} /></td>
                <td className="crediscope-equifax-num">
                  {total.maximoDiasDeMora === null ? "—" : plural(total.maximoDiasDeMora, "día", "días")}
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>

      <p className="crediscope-equifax-codeudor">
        <strong>Deuda como codeudor o garante:</strong>{" "}
        {otros && otros.numeroDeOperaciones > 0 ? (
          <>
            {moneda(otros.saldoDeudaUsd)} en {plural(otros.numeroDeOperaciones, "operación", "operaciones")}
            {enAtraso(otros) > 0 ? <span className="crediscope-aval-malo"> · {moneda(enAtraso(otros))} en atraso</span> : null}
          </>
        ) : (
          "no respalda deuda de otra persona"
        )}
        <InfoTooltip etiqueta="Qué es la deuda como codeudor o garante">
          Deuda de otra persona que ésta respalda como codeudora o garante. Si la otra persona no paga, la institución
          puede cobrársela. No se suma a lo que debe como titular.
        </InfoTooltip>
      </p>
    </div>
  );
}
