import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { entero, moneda, porcentaje } from "../../lib/formatos.js";

// El resultado de la capacidad de pago dicho en simple: un título que se
// entiende sin saber de crédito, una frase con «de cada $100» y un medidor que
// muestra lo que ya paga, lo que sumaría este crédito y el tope.

const VEREDICTOS = {
  alcanza: { titulo: "Le alcanza", Icono: CheckCircle2 },
  justo: { titulo: "Le alcanza, pero justo", Icono: AlertTriangle },
  no_alcanza: { titulo: "No le alcanza", Icono: XCircle },
  sin_ingreso: { titulo: "No se puede medir", Icono: HelpCircle },
};

const ancho = (fraccion) => `${Math.max(0, Math.min(100, fraccion * 100))}%`;

export default function VeredictoDeCapacidad({ capacidad: c }) {
  const { titulo, Icono } = VEREDICTOS[c.veredicto];
  const deCien = (fraccion) => moneda(Math.round(fraccion * 100));
  const nueva = c.ingresoNeto > 0 ? c.cuotaNueva / c.ingresoNeto : 0;

  return (
    <section className={`crediscope-capacidad-veredicto crediscope-capacidad-${c.veredicto}`} aria-live="polite">
      <p className="crediscope-capacidad-titulo">
        <Icono size={26} aria-hidden="true" />
        {titulo}
      </p>

      {c.veredicto === "sin_ingreso" ? (
        <p className="crediscope-capacidad-frase">
          No hay un ingreso reportado al IESS con el que comparar la cuota de {moneda(c.cuotaNueva, 2)}. Hace falta un documento que confirme lo que
          recibe.
        </p>
      ) : (
        <>
          <p className="crediscope-capacidad-frase">
            Con este crédito, de cada {moneda(100)} que recibe se irían <strong>{deCien(c.cargaConElCredito)}</strong> en cuotas. La institución acepta
            hasta {deCien(c.cargaMaxima)}.
          </p>

          <div className="crediscope-capacidad-medidor" role="img" aria-label={`Cuotas: ${porcentaje(c.cargaConElCredito)} del ingreso neto; tope ${porcentaje(c.cargaMaxima)}`}>
            <span className="crediscope-capacidad-tramo-actual" style={{ width: ancho(c.cargaActual) }} />
            <span className="crediscope-capacidad-tramo-nuevo" style={{ left: ancho(c.cargaActual), width: ancho(Math.min(nueva, 1 - c.cargaActual)) }} />
            <span className="crediscope-capacidad-tope" style={{ left: ancho(c.cargaMaxima) }} />
          </div>
          <div className="crediscope-capacidad-leyenda">
            <span>
              <i className="crediscope-credito-punto crediscope-capacidad-punto-actual" aria-hidden="true" />
              Ya paga {moneda(c.obligacionesActuales, 2)}
            </span>
            <span>
              <i className="crediscope-credito-punto crediscope-capacidad-punto-nuevo" aria-hidden="true" />
              Este crédito {moneda(c.cuotaNueva, 2)}
            </span>
            <span>
              <i className="crediscope-capacidad-marca" aria-hidden="true" />
              Tope {entero(Math.round(c.cargaMaxima * 100))}%
            </span>
          </div>
          <p className="crediscope-capacidad-pie">
            Le quedarían {moneda(Math.max(0, c.disponibleDespues), 2)} por mes de un ingreso neto de {moneda(c.ingresoNeto, 2)}.
          </p>
        </>
      )}
    </section>
  );
}
