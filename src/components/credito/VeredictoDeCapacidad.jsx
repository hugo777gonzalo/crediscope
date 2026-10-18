import { AlertTriangle, CheckCircle2, HelpCircle, XCircle } from "lucide-react";
import { entero, moneda, porcentaje } from "../../lib/formatos.js";

// El resultado de la capacidad de pago dicho en simple: un título que se
// entiende sin saber de crédito, una frase con «de cada $100» y un medidor que
// muestra lo que ya paga, lo que sumaría este crédito y el tope. Con un
// Ingreso declarado lo dice arriba y, abajo, qué daría sólo con el IESS.

export const VEREDICTOS = {
  alcanza: { titulo: "Le alcanza", Icono: CheckCircle2 },
  justo: { titulo: "Le alcanza, pero justo", Icono: AlertTriangle },
  no_alcanza: { titulo: "No le alcanza", Icono: XCircle },
  sin_ingreso: { titulo: "No se puede medir", Icono: HelpCircle },
};

export default function VeredictoDeCapacidad({ capacidad: c, soloIess = null }) {
  const { titulo, Icono } = VEREDICTOS[c.veredicto];
  const deCien = (fraccion) => moneda(Math.round(fraccion * 100));
  const nueva = c.ingresoNeto > 0 ? c.cuotaNueva / c.ingresoNeto : 0;
  // Hay personas que ya pagan por mes más de lo que reciben (medido el
  // 2026-10-17 con una consulta real de Equifax): con la escala fija en el
  // ingreso, la barra quedaba llena de gris y la cuota nueva no se veía. La
  // escala crece hasta que entre todo.
  const escala = Math.max(1, c.cargaConElCredito ?? 0);
  const ancho = (fraccion) => `${Math.max(0, Math.min(100, (fraccion / escala) * 100))}%`;
  const yaSupera = (c.cargaActual ?? 0) >= 1;
  const suIngreso = c.ingresoDeclarado ? "su ingreso declarado" : "su ingreso neto";

  return (
    <section className={`crediscope-capacidad-veredicto crediscope-capacidad-${c.veredicto}`} aria-live="polite">
      <p className="crediscope-capacidad-titulo">
        <Icono size={26} aria-hidden="true" />
        {titulo}
      </p>
      {c.ingresoDeclarado ? (
        <p style={{ margin: "8px 0 0" }}>
          <span className="crediscope-tag crediscope-tag-warn">Con el Ingreso declarado, sin verificar</span>
        </p>
      ) : null}

      {c.veredicto === "sin_ingreso" ? (
        <p className="crediscope-capacidad-frase">
          No hay un ingreso reportado al IESS con el que comparar la cuota de {moneda(c.cuotaNueva, 2)}. Completá el Ingreso declarado con lo que la
          persona dice recibir, o pedí un documento que lo confirme.
        </p>
      ) : (
        <>
          {yaSupera ? (
            <p className="crediscope-capacidad-frase">
              Lo que ya paga por mes (<strong>{moneda(c.obligacionesActuales, 2)}</strong>) es más que {suIngreso} ({moneda(c.ingresoNeto, 2)}): no hay
              espacio para otra cuota.
            </p>
          ) : (
            <p className="crediscope-capacidad-frase">
              Con este crédito, de cada {moneda(100)} que recibe se irían <strong>{deCien(c.cargaConElCredito)}</strong> en cuotas. La institución acepta
              hasta {deCien(c.cargaMaxima)}.
            </p>
          )}

          <div className="crediscope-capacidad-medidor" role="img" aria-label={`Cuotas: ${porcentaje(c.cargaConElCredito)} del ingreso neto; tope ${porcentaje(c.cargaMaxima)}`}>
            <span className="crediscope-capacidad-tramo-actual" style={{ width: ancho(c.cargaActual) }} />
            <span className="crediscope-capacidad-tramo-nuevo" style={{ left: ancho(c.cargaActual), width: ancho(nueva) }} />
            {escala > 1 ? <span className="crediscope-capacidad-ingreso" style={{ left: ancho(1) }} /> : null}
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
            {c.disponibleDespues >= 0
              ? `Le quedarían ${moneda(c.disponibleDespues, 2)} por mes de ${suIngreso} de ${moneda(c.ingresoNeto, 2)}.`
              : `Con este crédito le faltarían ${moneda(-c.disponibleDespues, 2)} por mes para cubrir todas sus cuotas.`}
            {escala > 1 ? ` La línea punteada marca todo ${suIngreso}.` : ""}
          </p>
        </>
      )}

      {soloIess ? (
        <p className="crediscope-capacidad-comparacion">
          {soloIess.veredicto === "sin_ingreso" ? (
            <>Con sólo lo reportado al IESS no se podría medir: no tiene un ingreso reportado.</>
          ) : (
            <>
              Con sólo lo reportado al IESS ({moneda(soloIess.ingresoNeto, 2)} netos): <strong>{VEREDICTOS[soloIess.veredicto].titulo}</strong>.
            </>
          )}
        </p>
      ) : null}
    </section>
  );
}
