import { useMemo, useState } from "react";
import { Calculator, CalendarClock, ShieldCheck, Wallet } from "lucide-react";
import Kpi from "../components/ui/Kpi.jsx";
import Aviso from "../components/ui/Aviso.jsx";
import { decimal, moneda, plural, porcentaje } from "../lib/formatos.js";
import { PRODUCTO_CONSUMO, simularCredito } from "../../supabase/functions/_shared/simulador-credito.ts";

// El simulador de crédito de consumo (docs/plan-demo-ifi.md, paso 2). La
// pantalla sólo junta lo que escribe la persona y muestra lo que calcula
// simularCredito(): la fórmula vive en _shared para que la capacidad de pago y
// la API den la misma cuota que se ve acá.

// En Ecuador se escribe "5.000" y "14,5"; el campo numérico del navegador
// no acepta la coma en todos los equipos. Se lee el texto: con coma, los
// puntos son de miles; sin coma, "5.000" es cinco mil y "14.5" es catorce y
// medio.
function aNumero(texto) {
  const t = String(texto ?? "").trim().replace(/\s/g, "");
  if (t === "") return Number.NaN;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
}

const SISTEMAS = { frances: "Cuota fija (francés)", aleman: "Capital fijo (alemán)" };

function textoDelSeguro({ tasaPorcentaje, periodicidad, base }) {
  return `${decimal(tasaPorcentaje, 2)}% ${periodicidad} sobre el ${base === "saldo" ? "saldo" : "monto"}`;
}

function comoCambiaLaCuota(s) {
  if (s.cuotaUltimoMes === s.cuotaPrimerMes) return "Igual todos los meses";
  const porque =
    s.sistema === "aleman" ? "el capital es fijo y el interés baja con el saldo" : "el seguro se cobra sobre el saldo, que baja";
  return `Baja hasta ${moneda(s.cuotaUltimoMes, 2)} en la última: ${porque}`;
}

function Campo({ id, etiqueta, ayuda = null, children }) {
  return (
    <div className="crediscope-descarga-campo" style={{ minWidth: 160, flex: "1 1 160px" }}>
      <label htmlFor={id}>{etiqueta}</label>
      {children}
      {ayuda ? (
        <span className="crediscope-muted" style={{ fontSize: 13 }}>
          {ayuda}
        </span>
      ) : null}
    </div>
  );
}

export default function SimuladorCredito() {
  const [monto, setMonto] = useState("5.000");
  const [plazo, setPlazo] = useState("36");
  const [tasa, setTasa] = useState(String(PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje));
  const [sistema, setSistema] = useState(PRODUCTO_CONSUMO.sistema);
  const [tasaSeguro, setTasaSeguro] = useState(decimal(PRODUCTO_CONSUMO.desgravamen.tasaPorcentaje, 1));
  const [periodicidad, setPeriodicidad] = useState(PRODUCTO_CONSUMO.desgravamen.periodicidad);
  const [base, setBase] = useState(PRODUCTO_CONSUMO.desgravamen.base);

  const resultado = useMemo(
    () =>
      simularCredito({
        monto: aNumero(monto),
        plazoMeses: aNumero(plazo),
        tasaNominalAnualPorcentaje: aNumero(tasa),
        sistema,
        desgravamen: { tasaPorcentaje: aNumero(tasaSeguro), periodicidad, base },
      }),
    [monto, plazo, tasa, sistema, tasaSeguro, periodicidad, base],
  );
  const s = resultado.ok ? resultado.simulacion : null;
  const maxima = PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje;

  return (
    <div>
      <div className="crediscope-pagina-cabecera" style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Simulador de crédito</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Cuota mensual de un crédito de consumo, con el seguro de desgravamen incluido.
        </p>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>
          <Calculator size={17} style={{ marginRight: 7, verticalAlign: "-3px" }} aria-hidden="true" />
          Condiciones del crédito
        </h3>
        <div className="crediscope-descarga-row" style={{ marginTop: 0, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Campo id="sim-monto" etiqueta="Monto, en dólares">
            <input id="sim-monto" className="crediscope-input" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
          </Campo>
          <Campo id="sim-plazo" etiqueta="Plazo, en meses">
            <input id="sim-plazo" className="crediscope-input" inputMode="numeric" value={plazo} onChange={(e) => setPlazo(e.target.value)} />
          </Campo>
          <Campo id="sim-tasa" etiqueta="Tasa nominal anual, en %" ayuda={`Máximo ${decimal(maxima, 1)}%`}>
            <input id="sim-tasa" className="crediscope-input" inputMode="decimal" value={tasa} onChange={(e) => setTasa(e.target.value)} />
          </Campo>
          <Campo id="sim-sistema" etiqueta="Sistema de amortización">
            <select id="sim-sistema" className="crediscope-input" value={sistema} onChange={(e) => setSistema(e.target.value)}>
              {Object.entries(SISTEMAS).map(([valor, texto]) => (
                <option key={valor} value={valor}>
                  {texto}
                </option>
              ))}
            </select>
          </Campo>
        </div>

        <h4 style={{ margin: "18px 0 8px" }}>
          <ShieldCheck size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} aria-hidden="true" />
          Seguro de desgravamen
        </h4>
        <div className="crediscope-descarga-row" style={{ marginTop: 0, flexWrap: "wrap", alignItems: "flex-start" }}>
          <Campo id="sim-seguro" etiqueta="Tasa del seguro, en %">
            <input id="sim-seguro" className="crediscope-input" inputMode="decimal" value={tasaSeguro} onChange={(e) => setTasaSeguro(e.target.value)} />
          </Campo>
          <Campo id="sim-periodicidad" etiqueta="La tasa es">
            <select id="sim-periodicidad" className="crediscope-input" value={periodicidad} onChange={(e) => setPeriodicidad(e.target.value)}>
              <option value="anual">Anual</option>
              <option value="mensual">Mensual</option>
            </select>
          </Campo>
          <Campo id="sim-base" etiqueta="Se cobra sobre">
            <select id="sim-base" className="crediscope-input" value={base} onChange={(e) => setBase(e.target.value)}>
              <option value="saldo">El saldo de cada mes</option>
              <option value="monto">El monto original</option>
            </select>
          </Campo>
        </div>
      </div>

      {!resultado.ok ? (
        <Aviso tipo="advertencia" titulo="Revisá las condiciones">
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
            {resultado.errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Aviso>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi Icono={Wallet} etiqueta="Cuota del primer mes" valor={moneda(s.cuotaPrimerMes, 2)} detalle={comoCambiaLaCuota(s)} />
            <Kpi etiqueta="Capital e interés" valor={moneda(s.capitalEInteresPrimerMes, 2)} detalle="Primer mes, sin el seguro" />
            <Kpi Icono={ShieldCheck} etiqueta="Seguro de desgravamen" valor={moneda(s.seguroPrimerMes, 2)} detalle={`Primer mes · ${textoDelSeguro(s.desgravamen)}`} />
            <Kpi
              Icono={CalendarClock}
              etiqueta="Total a pagar"
              valor={moneda(s.totalPagado, 2)}
              detalle={`${moneda(s.totalInteres, 2)} de interés y ${moneda(s.totalSeguro, 2)} de seguro`}
            />
          </div>

          <div className="crediscope-card">
            <div className="crediscope-pares">
              <div className="crediscope-par">
                <span className="crediscope-par-etiqueta">Monto</span>
                <span className="crediscope-par-valor">{moneda(s.monto, 2)}</span>
              </div>
              <div className="crediscope-par">
                <span className="crediscope-par-etiqueta">Plazo</span>
                <span className="crediscope-par-valor">{plural(s.plazoMeses, "mes", "meses")}</span>
              </div>
              <div className="crediscope-par">
                <span className="crediscope-par-etiqueta">Tasa nominal anual</span>
                <span className="crediscope-par-valor">{porcentaje(s.tasaNominalAnualPorcentaje / 100, 2)}</span>
              </div>
              <div className="crediscope-par">
                <span className="crediscope-par-etiqueta">Tasa mensual</span>
                <span className="crediscope-par-valor">{porcentaje(s.tasaMensual, 3)}</span>
              </div>
              <div className="crediscope-par">
                <span className="crediscope-par-etiqueta">Tasa efectiva anual, sin el seguro</span>
                <span className="crediscope-par-valor">{porcentaje(s.tasaEfectivaAnual, 2)}</span>
              </div>
              <div className="crediscope-par">
                <span className="crediscope-par-etiqueta">Sistema</span>
                <span className="crediscope-par-valor">{SISTEMAS[s.sistema]}</span>
              </div>
            </div>
          </div>

          <details className="crediscope-card">
            <summary style={{ cursor: "pointer", fontWeight: 600 }}>Tabla de amortización · {plural(s.plazoMeses, "cuota")}</summary>
            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Mes</th>
                    <th style={{ textAlign: "right" }}>Saldo al empezar</th>
                    <th style={{ textAlign: "right" }}>Capital</th>
                    <th style={{ textAlign: "right" }}>Interés</th>
                    <th style={{ textAlign: "right" }}>Seguro</th>
                    <th style={{ textAlign: "right" }}>Cuota</th>
                    <th style={{ textAlign: "right" }}>Saldo al terminar</th>
                  </tr>
                </thead>
                <tbody>
                  {s.tabla.map((f) => (
                    <tr key={f.mes}>
                      <td className="crediscope-num">{f.mes}</td>
                      <td className="crediscope-num" style={{ textAlign: "right" }}>{moneda(f.saldoInicial, 2)}</td>
                      <td className="crediscope-num" style={{ textAlign: "right" }}>{moneda(f.capital, 2)}</td>
                      <td className="crediscope-num" style={{ textAlign: "right" }}>{moneda(f.interes, 2)}</td>
                      <td className="crediscope-num" style={{ textAlign: "right" }}>{moneda(f.seguro, 2)}</td>
                      <td className="crediscope-num" style={{ textAlign: "right", fontWeight: 600 }}>{moneda(f.cuota, 2)}</td>
                      <td className="crediscope-num" style={{ textAlign: "right" }}>{moneda(f.saldoFinal, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}

      <Aviso tipo="informacion" titulo="Cómo se calcula">
        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
          <li>La tasa mensual es la nominal anual dividida para 12.</li>
          <li>Cada valor se redondea al centavo en su mes; la última cuota ajusta la diferencia para que el capital sume el monto.</li>
          <li>El seguro se cobra cada mes, sobre el saldo al empezar el mes o sobre el monto original, según se elija.</li>
          <li>No incluye comisiones ni otros cargos.</li>
        </ul>
      </Aviso>
    </div>
  );
}
