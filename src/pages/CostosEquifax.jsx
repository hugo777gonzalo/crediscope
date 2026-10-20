import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, CalendarDays, CalendarCheck, AlertTriangle } from "lucide-react";
import { getConsumoEquifax } from "../lib/api.js";
import { gastoEquifaxPorMes, TARIFA_EQUIFAX_USD, TARIFA_EQUIFAX_DESDE } from "../lib/costoEquifax.js";
import { diaEcuador, formatearFecha, hoyEcuador } from "../lib/fechas.js";
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
//
// Cada cifra, una vez (revisión del 2026-10-18): con un solo mes de consultas,
// «Este mes», «Desde el inicio», el gasto y el gasto máximo de la tabla eran el
// mismo número cuatro veces. «Desde el inicio» pasó a ser el total de la tabla,
// la tabla aparece cuando hay más de un mes, las columnas de lo que pudo
// cobrarse sólo si hubo alguna, y el lugar que quedó lo ocupa «Hoy», que es
// lo que mira quien vigila el tope diario.

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
    const deHoy = gastoEquifaxPorMes(
      datos.consultas.filter((c) => diaEcuador(c.created_at) === hoyEcuador()),
      datos.dudosas.filter((c) => diaEcuador(c.created_at) === hoyEcuador()),
    )[0];
    const hoy = diaEcuador(new Date()).slice(0, 7);
    const [anio, mes] = hoy.split("-").map(Number);
    const anterior = mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
    const vacio = { pagadas: 0, dudosas: 0, gastoUsd: 0 };
    const suma = (campo) => meses.reduce((a, m) => a + m[campo], 0);
    return {
      meses,
      esteMes: meses.find((m) => m.mes === hoy) ?? vacio,
      mesAnterior: meses.find((m) => m.mes === anterior) ?? vacio,
      hoy: deHoy ?? vacio,
      total: {
        pagadas: suma("pagadas"),
        dudosas: suma("dudosas"),
        gastoUsd: suma("gastoUsd"),
        gastoMaximoUsd: suma("gastoMaximoUsd"),
        dePrueba: suma("dePrueba"),
      },
    };
  }, [datos]);

  const conDudosas = (d?.total.dudosas ?? 0) > 0;

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
          Lo que se le paga a Equifax: {moneda(TARIFA_EQUIFAX_USD, 2)} por consulta (tarifa informada por el negocio el{" "}
          {formatearFecha(`${TARIFA_EQUIFAX_DESDE}T12:00:00-05:00`)}; no es lo que se le cobra a la institución). Una
          consulta que todavía vale (hasta el 17 de cada mes) se vuelve a usar sin pagar.
          {d && d.total.dePrueba > 0
            ? ` Las ${plural(d.total.dePrueba, "consulta", "consultas")} del ambiente de prueba no se cuentan.`
            : ""}
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
              Icono={CalendarCheck}
              etiqueta="Hoy"
              valor={moneda(d.hoy.gastoUsd, 2)}
              detalle={plural(d.hoy.pagadas, "consulta pagada", "consultas pagadas")}
            />
            <Kpi
              Icono={Receipt}
              etiqueta="Este mes"
              valor={moneda(d.esteMes.gastoUsd, 2)}
              detalle={plural(d.esteMes.pagadas, "consulta pagada", "consultas pagadas")}
            />
            <Kpi
              Icono={CalendarDays}
              etiqueta="Mes anterior"
              valor={moneda(d.mesAnterior.gastoUsd, 2)}
              detalle={plural(d.mesAnterior.pagadas, "consulta pagada", "consultas pagadas")}
            />
            <Kpi
              Icono={AlertTriangle}
              etiqueta={
                <>
                  Pudieron cobrarse{" "}
                  <InfoTooltip lado="derecha" etiqueta="Qué es «pudieron cobrarse»">
                    Consultas que fallaron después de que el pedido salió hacia Equifax: un tiempo de espera agotado o una
                    respuesta por otra persona. No se guardaron, pero Equifax pudo cobrarlas. Por eso cuentan para el tope
                    diario y van aparte del gasto seguro.
                  </InfoTooltip>
                </>
              }
              valor={entero(d.total.dudosas)}
              detalle={
                conDudosas
                  ? `Hasta ${moneda(d.total.gastoMaximoUsd - d.total.gastoUsd, 2)} más, desde el inicio`
                  : "Ningún fallo con el pedido ya enviado"
              }
              color={conDudosas ? "var(--warn)" : undefined}
            />
          </div>

          {/* Con un solo mes, la tabla repetía «Este mes»: no se dibuja. */}
          {d.meses.length === 1 ? null : (
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
                        <th className="crediscope-cifra">Consultas pagadas</th>
                        <th className="crediscope-cifra">Gasto</th>
                        {conDudosas ? <th className="crediscope-cifra">Pudieron cobrarse</th> : null}
                        {conDudosas ? <th className="crediscope-cifra">Gasto máximo</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {d.meses.map((m) => (
                        <tr key={m.mes}>
                          <td style={{ fontWeight: 600 }}>{mesAnio(m.mes)}</td>
                          <td className="crediscope-cifra">{entero(m.pagadas)}</td>
                          <td className="crediscope-cifra" style={{ fontWeight: 600 }}>
                            {moneda(m.gastoUsd, 2)}
                          </td>
                          {conDudosas ? <td className="crediscope-cifra">{entero(m.dudosas)}</td> : null}
                          {conDudosas ? <td className="crediscope-cifra">{moneda(m.gastoMaximoUsd, 2)}</td> : null}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        {/* Una celda y no un encabezado: los encabezados de la tabla van en
                            mayúsculas y «DESDE SEP 2026» gritaba. */}
                        <td style={{ fontWeight: 600 }}>Desde {mesAnio(d.meses.at(-1).mes)}</td>
                        <td className="crediscope-cifra">{entero(d.total.pagadas)}</td>
                        <td className="crediscope-cifra" style={{ fontWeight: 600 }}>
                          {moneda(d.total.gastoUsd, 2)}
                        </td>
                        {conDudosas ? <td className="crediscope-cifra">{entero(d.total.dudosas)}</td> : null}
                        {conDudosas ? <td className="crediscope-cifra">{moneda(d.total.gastoMaximoUsd, 2)}</td> : null}
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
