import { Receipt } from "lucide-react";
import { TituloTarjeta, Valor } from "./Piezas.jsx";
import { formatearValorAval } from "../../lib/avalCampos.js";

// Una fila por operación vigente, a lo ancho de la página. En una columna
// de un tercio la tabla necesitaba barra de desplazamiento para ver los
// montos, que son justamente lo que se viene a buscar acá.
//
// Titular y codeudor/garante van en tablas separadas por la misma razón
// que en Deuda actual: sumarlas en un solo total mezclaría lo que la
// persona debe con lo que respalda.

const MONTOS = [
  ["cuota", "Cuota", false],
  ["valorVigente", "Por vencer", false],
  ["valorVencido", "Vencido", true],
  ["valorDemandado", "En demanda", true],
  ["valorCastigado", "Castigada", true],
  ["saldo", "Saldo", false],
];

const redondear = (n) => Math.round(n * 100) / 100;

function Tabla({ filas, conRol }) {
  const totales = Object.fromEntries(MONTOS.map(([campo]) => [campo, redondear(filas.reduce((a, f) => a + (f[campo] ?? 0), 0))]));
  const moras = filas.map((f) => f.diasMora).filter((d) => typeof d === "number");
  const moraMaxima = moras.length ? Math.max(...moras) : null;

  return (
    <div className="crediscope-aval-desplazable">
      <table className="crediscope-aval-tabla">
        <thead>
          <tr>
            <th>Sector</th>
            <th>Entidad</th>
            <th>Tipo</th>
            {conRol ? <th>Rol</th> : null}
            <th className="crediscope-aval-num">Días de mora</th>
            {MONTOS.map(([campo, etiqueta]) => (
              <th key={campo} className="crediscope-aval-num">{etiqueta}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.map((f, i) => (
            <tr key={i}>
              <td><span className="crediscope-aval-sector">{f.sector}</span></td>
              <td>{f.entidad ?? "—"}</td>
              <td>{f.tipoCredito ?? "—"}</td>
              {conRol ? <td>{f.rol ?? "—"}</td> : null}
              <td className="crediscope-aval-num">{f.diasMora == null ? "—" : <Valor valor={f.diasMora} tipo="entero" alerta />}</td>
              {MONTOS.map(([campo, , alerta]) => (
                <td key={campo} className="crediscope-aval-num" style={campo === "saldo" ? { fontWeight: 600 } : undefined}>
                  <Valor valor={f[campo]} tipo="dinero" alerta={alerta} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {filas.length > 1 ? (
          <tfoot>
            <tr>
              <td colSpan={conRol ? 4 : 3}>Total</td>
              <td className="crediscope-aval-num" title="La mayor, no la suma">
                {moraMaxima == null ? "—" : <Valor valor={moraMaxima} tipo="entero" alerta />}
              </td>
              {MONTOS.map(([campo, , alerta]) => (
                <td key={campo} className="crediscope-aval-num">
                  <Valor valor={totales[campo]} tipo="dinero" alerta={alerta} />
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

export default function DetalleOperaciones({ estructura: e }) {
  const propias = e.deudasPorEntidad || [];
  const ajenas = e.deudasComoCodeudorGarante || [];
  const sumaPropias = redondear(propias.reduce((a, f) => a + (f.saldo ?? 0), 0));
  // totalDeuda toma tarjetas, servicios y cobranza del resumen por tipo de
  // Aval, no de las operaciones. En el ambiente de prueba hay tarjetas cuya
  // operación trae un saldo simbólico de $1 mientras el resumen dice miles
  // (7 de las 240): si la tabla no cuadra con el total de arriba, se dice.
  const noCuadra = propias.length > 0 && typeof e.totalDeuda === "number" && Math.abs(sumaPropias - e.totalDeuda) >= 0.01;

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={Receipt}>Detalle de operaciones</TituloTarjeta>

      <section className="crediscope-aval-subseccion">
        <p className="crediscope-aval-subtitulo">
          Como titular <small>· {propias.length} {propias.length === 1 ? "operación" : "operaciones"}</small>
        </p>
        {propias.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>Sin operaciones vigentes como titular.</p>
        ) : (
          <Tabla filas={propias} />
        )}
        {noCuadra ? (
          <p className="crediscope-aval-nota">
            La suma de las operaciones ({formatearValorAval(sumaPropias, "dinero")}) no coincide con la deuda total que Aval
            declara por tipo de deuda ({formatearValorAval(e.totalDeuda, "dinero")}).
          </p>
        ) : null}
      </section>

      {ajenas.length > 0 ? (
        <section className="crediscope-aval-subseccion">
          <p className="crediscope-aval-subtitulo">
            Como codeudor/garante <small>· {ajenas.length} {ajenas.length === 1 ? "operación" : "operaciones"}</small>
          </p>
          <Tabla filas={ajenas} conRol />
        </section>
      ) : null}
    </div>
  );
}
