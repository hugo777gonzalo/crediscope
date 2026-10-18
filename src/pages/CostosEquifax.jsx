import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, CalendarDays, Sigma, AlertTriangle } from "lucide-react";
import { getConsumoEquifax } from "../lib/api.js";
import { gastoEquifaxPorMes, TARIFA_EQUIFAX_USD, TARIFA_EQUIFAX_DESDE } from "../lib/costoEquifax.js";
import { diaEcuador, formatearFecha } from "../lib/fechas.js";
import { entero, moneda, mesAnio, plural } from "../lib/formatos.js";
import Kpi from "../components/ui/Kpi.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import InfoTooltip from "../components/InfoTooltip.jsx";

// Lo que se le paga a Equifax. El resto de Costos mide el modelo; ésta es la
// otra cuenta que crece con cada persona, desde que hay un botón para
// consultar desde la pantalla (2026-10-17). Equifax no pone tope: esta página
// es la forma de ver el gasto antes de que llegue la factura.
//
// Lo que pudo cobrarse (un fallo con el pedido ya enviado) se muestra aparte
// y nunca se suma al gasto seguro: sumarlo exageraría, dejarlo afuera
// escondería plata que pudo salir.

export default function CostosEquifax() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getConsumoEquifax()
      .then(setDatos)
      .catch((err) => setError(err));
  }, []);

  const d = useMemo(() => {
    if (!datos) return null;
    const meses = gastoEquifaxPorMes(datos.consultas, datos.dudosas);
    const hoy = diaEcuador(new Date()).slice(0, 7);
    const [anio, mes] = hoy.split("-").map(Number);
    const anterior = mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
    const vacio = { pagadas: 0, dudosas: 0, gastoUsd: 0 };
    const suma = (campo) => meses.reduce((a, m) => a + m[campo], 0);
    return {
      meses,
      esteMes: meses.find((m) => m.mes === hoy) ?? vacio,
      mesAnterior: meses.find((m) => m.mes === anterior) ?? vacio,
      total: { pagadas: suma("pagadas"), dudosas: suma("dudosas"), gastoUsd: suma("gastoUsd"), dePrueba: suma("dePrueba") },
      primerMes: meses.at(-1)?.mes ?? null,
    };
  }, [datos]);

  return (
    <div>
      <p>
        <Link to="/costos" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Equifax</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Lo que se le paga a Equifax: {moneda(TARIFA_EQUIFAX_USD, 2)} por consulta. Una consulta que todavía vale (hasta
          el 17 de cada mes) se vuelve a usar sin pagar.
        </p>
      </div>

      {error ? (
        <AvisoDeError error={error} />
      ) : !d ? (
        <Cargando />
      ) : (
        <>
          {/* La grilla de 4, 2 o 1 por fila de la pestaña Equifax: con la común
              quedaban 3 + 1 a 768. */}
          <div className="crediscope-kpi-grid crediscope-equifax-indicadores">
            <Kpi
              Icono={Receipt}
              etiqueta="Este mes"
              valor={moneda(d.esteMes.gastoUsd, 2)}
              detalle={`${plural(d.esteMes.pagadas, "consulta pagada", "consultas pagadas")}`}
            />
            <Kpi
              Icono={CalendarDays}
              etiqueta="Mes anterior"
              valor={moneda(d.mesAnterior.gastoUsd, 2)}
              detalle={`${plural(d.mesAnterior.pagadas, "consulta pagada", "consultas pagadas")}`}
            />
            <Kpi
              Icono={Sigma}
              etiqueta="Desde el inicio"
              valor={moneda(d.total.gastoUsd, 2)}
              detalle={
                d.primerMes
                  ? `${plural(d.total.pagadas, "consulta pagada", "consultas pagadas")} desde ${mesAnio(d.primerMes)}`
                  : "Todavía no se consultó a nadie"
              }
            />
            <Kpi
              Icono={AlertTriangle}
              etiqueta="Pudieron cobrarse"
              valor={entero(d.total.dudosas)}
              detalle="Fallos con el pedido ya enviado"
              color={d.total.dudosas > 0 ? "var(--warn)" : undefined}
            />
          </div>

          <div className="crediscope-card">
            <h3>Mes a mes</h3>
            {d.meses.length === 0 ? (
              <p className="crediscope-muted" style={{ margin: 0 }}>
                Todavía no hay consultas a Equifax.
              </p>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table className="crediscope-table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th style={{ textAlign: "right" }}>Consultas pagadas</th>
                      <th style={{ textAlign: "right" }}>Gasto</th>
                      <th style={{ textAlign: "right" }}>
                        Pudieron cobrarse{" "}
                        <InfoTooltip lado="derecha" etiqueta="Qué es «pudieron cobrarse»">
                          Consultas que fallaron después de que el pedido salió hacia Equifax: un tiempo de espera agotado
                          o una respuesta por otra persona. No se guardaron, pero Equifax pudo cobrarlas. Por eso cuentan
                          para el tope diario y van aparte del gasto seguro.
                        </InfoTooltip>
                      </th>
                      <th style={{ textAlign: "right" }}>Gasto máximo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.meses.map((m) => (
                      <tr key={m.mes}>
                        <td style={{ fontWeight: 600 }}>{mesAnio(m.mes)}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{entero(m.pagadas)}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                          {moneda(m.gastoUsd, 2)}
                        </td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{entero(m.dudosas)}</td>
                        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{moneda(m.gastoMaximoUsd, 2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
              Tarifa informada por el negocio el {formatearFecha(`${TARIFA_EQUIFAX_DESDE}T12:00:00-05:00`)}: es lo que se le
              paga a Equifax, no lo que se le cobra a la institución.
              {d.total.dePrueba > 0
                ? ` Además hay ${plural(d.total.dePrueba, "consulta", "consultas")} del ambiente de prueba, que no se cuentan.`
                : ""}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
