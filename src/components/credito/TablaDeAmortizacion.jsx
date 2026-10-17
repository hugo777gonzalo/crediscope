import { moneda, plural } from "../../lib/formatos.js";

// Mes a mes, plegada: casi nadie la necesita para decidir, pero quien la pide
// la quiere completa.
export default function TablaDeAmortizacion({ simulacion: s }) {
  return (
    <details className="crediscope-card crediscope-credito-tabla">
      <summary>Ver el detalle mes a mes · {plural(s.plazoMeses, "cuota")}</summary>
      <div className="crediscope-credito-tabla-envoltura">
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Mes</th>
              <th>Debe al empezar</th>
              <th>Capital</th>
              <th>Interés</th>
              <th>Seguro</th>
              <th>Cuota</th>
              <th>Debe al terminar</th>
            </tr>
          </thead>
          <tbody>
            {s.tabla.map((f) => (
              <tr key={f.mes}>
                <td>{f.mes}</td>
                <td>{moneda(f.saldoInicial, 2)}</td>
                <td>{moneda(f.capital, 2)}</td>
                <td>{moneda(f.interes, 2)}</td>
                <td>{moneda(f.seguro, 2)}</td>
                <td className="crediscope-celda-fuerte">{moneda(f.cuota, 2)}</td>
                <td>{moneda(f.saldoFinal, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
