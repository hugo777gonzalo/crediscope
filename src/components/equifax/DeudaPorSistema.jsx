import { Landmark } from "lucide-react";
import InfoTooltip from "../InfoTooltip.jsx";
import { TituloTarjeta } from "../reporte/Piezas.jsx";
import { moneda, plural } from "../../lib/formatos.js";
import { filasDeDeuda, enAtraso } from "../../lib/equifaxPantalla.js";

// Cuánto debe como titular, por sistema, y aparte lo que respalda de otra
// persona. Lo de codeudor o garante NO se suma: en Aval esa mezcla inflaba la
// deuda, y en Ecuador «garantía» es el colateral, así que tampoco se llama así
// (negocio, 2026-10-13).
//
// Sin fila de total: la deuda, lo que está en atraso y la cuota totales son
// los indicadores de justo arriba, y la fila repetía esas tres cifras debajo
// (revisión del 2026-10-18). Un sistema sin deuda sigue a la vista (es
// Equifax diciendo que no hay), pero en una sola celda: cuatro «$0» y una
// raya decían lo mismo cinco veces.
const Monto = ({ valor, alerta = false }) => (
  <span className={valor === 0 ? "crediscope-aval-cero" : alerta && valor > 0 ? "crediscope-aval-malo" : undefined}>
    {moneda(valor)}
  </span>
);

export default function DeudaPorSistema({ estructura }) {
  const filas = filasDeDeuda(estructura);
  const otros = estructura?.deudaCodeudorGarante?.total ?? null;

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={Landmark}>Cuánto debe como titular, por sistema</TituloTarjeta>
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
                Mora más larga hoy{" "}
                <InfoTooltip lado="derecha" etiqueta="Qué es la mora más larga hoy">
                  Los días de atraso de la operación más atrasada hoy, en ese sistema. La de los últimos 24 meses está en
                  «Cómo pagó».
                </InfoTooltip>
              </th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) =>
              f.operaciones === 0 ? (
                <tr key={f.clave} className="crediscope-equifax-fila-vacia">
                  <th scope="row">
                    <span className="crediscope-equifax-sistema">{f.texto}</span>
                  </th>
                  <td colSpan={5} className="crediscope-equifax-sin-deuda">
                    Sin deuda
                  </td>
                </tr>
              ) : (
                <tr key={f.clave}>
                  <th scope="row">
                    <span className="crediscope-equifax-sistema">{f.texto}</span>
                    <span className="crediscope-equifax-sistema-detalle">
                      {plural(f.operaciones, "operación", "operaciones")}
                    </span>
                    {f.demanda ? <span className="crediscope-equifax-marca crediscope-equifax-marca-mala">En demanda judicial</span> : null}
                    {f.castigada ? <span className="crediscope-equifax-marca crediscope-equifax-marca-mala">Cartera castigada</span> : null}
                    {f.noCuadra ? (
                      <span className="crediscope-equifax-marca crediscope-equifax-marca-aviso">
                        No cuadra con el total de Equifax
                        <InfoTooltip lado="izquierda" etiqueta="Por qué no cuadra">
                          La suma de las operaciones de este sistema no da el total que la propia Equifax publica. Pasa
                          más en el sector comercial, que trae operaciones con cortes de distintos meses. Las cifras de
                          esta fila son la suma de las operaciones.
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
              ),
            )}
          </tbody>
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
