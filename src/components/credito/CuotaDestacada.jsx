import { moneda, plural } from "../../lib/formatos.js";
import { comoCambiaLaCuota } from "../../lib/credito.js";

// La cuota como protagonista: la cifra grande, en qué se va cada dólar del
// primer mes (capital, interés, seguro) y lo que cuesta el crédito entero.
// La comparten el simulador y la capacidad de pago.

const PARTES = [
  ["capital", "Capital", "crediscope-credito-punto-capital"],
  ["interes", "Interés", "crediscope-credito-punto-interes"],
  ["seguro", "Seguro", "crediscope-credito-punto-seguro"],
];

export default function CuotaDestacada({ simulacion: s, titulo = "Cuota mensual" }) {
  const primera = s.tabla[0];
  const total = primera.cuota || 1;
  return (
    <section className="crediscope-credito-hero" aria-label={titulo}>
      <p className="crediscope-credito-hero-etiqueta">{titulo}</p>
      <p className="crediscope-credito-hero-cifra">{moneda(s.cuotaPrimerMes, 2)}</p>
      <p className="crediscope-credito-hero-sub">
        {plural(s.plazoMeses, "cuota", "cuotas")} · {comoCambiaLaCuota(s)}
      </p>

      <div className="crediscope-credito-barra" role="img" aria-label={`Primera cuota: ${PARTES.map(([k, t]) => `${t} ${moneda(primera[k], 2)}`).join(", ")}`}>
        {PARTES.map(([clave, , clase]) =>
          primera[clave] > 0 ? <span key={clave} className={clase} style={{ width: `${(primera[clave] / total) * 100}%` }} /> : null,
        )}
      </div>
      <div className="crediscope-credito-leyenda">
        {PARTES.map(([clave, texto, clase]) => (
          <span key={clave}>
            <i className={`crediscope-credito-punto ${clase}`} aria-hidden="true" />
            {texto} <strong>{moneda(primera[clave], 2)}</strong>
          </span>
        ))}
      </div>

      <div className="crediscope-credito-datos">
        <div>
          <p>Total a pagar</p>
          <strong>{moneda(s.totalPagado, 2)}</strong>
        </div>
        <div>
          <p>Intereses</p>
          <strong>{moneda(s.totalInteres, 2)}</strong>
        </div>
        <div>
          <p>Seguro</p>
          <strong>{moneda(s.totalSeguro, 2)}</strong>
        </div>
      </div>
    </section>
  );
}
