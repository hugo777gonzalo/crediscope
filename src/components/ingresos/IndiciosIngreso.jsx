import { Sparkles, TrendingUp } from "lucide-react";
import { TituloTarjeta, Cifra } from "../reporte/Piezas.jsx";
import { indiciosDeIngresoMayor } from "../../../supabase/functions/_shared/fuentes-ingreso.ts";

// Los indicios de ingreso mayor, en su propia tarjeta (aprobado por el
// negocio el 2026-09-28). Hasta entonces eran un desplegable chico debajo
// del ingreso, con la conclusión pero sin los datos que la sostienen: para
// ver el impuesto a la renta había que abrir el detalle completo.
//
// Cada indicio muestra en qué se apoya y, plegada, la frase exacta que
// recibe el análisis con IA: el analista ve lo mismo que el modelo. Las dos
// cosas salen de la misma función (indiciosDeIngresoMayor), así que no se
// pueden desalinear.
//
// Sin indicios no se muestra: lo reportado al IESS ya está en el
// encabezado, y una tarjeta que dice "no hay" es ruido.
export default function IndiciosIngreso({ f }) {
  const indicios = indiciosDeIngresoMayor(f);
  if (indicios.length === 0) return null;

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={TrendingUp}>
        {indicios.length === 1 ? "Indicio de ingreso mayor" : `Indicios de ingreso mayor (${indicios.length})`}
      </TituloTarjeta>
      {indicios.map((i) => (
        <div key={i.clave} className="crediscope-ing-indicio">
          <p className="crediscope-ing-indicio-titulo">{i.titulo}</p>
          <div className="crediscope-aval-cifras crediscope-aval-cifras-chicas">
            {i.datos.map((d) => (
              <Cifra key={d.etiqueta} etiqueta={d.etiqueta}>
                {d.valor}
              </Cifra>
            ))}
          </div>
          <p className="crediscope-ing-indicio-conclusion">{i.conclusion}</p>
          <details className="crediscope-ing-desplegable">
            <summary>
              <Sparkles size={15} aria-hidden="true" />
              Así lo lee el análisis con IA
            </summary>
            <div className="crediscope-ing-desplegado">
              <p>&ldquo;{i.detalle}&rdquo;</p>
              <p className="crediscope-muted" style={{ marginBottom: 0 }}>
                Regla del marco: el análisis puede decir que la capacidad supera lo reportado sólo citando un indicio como
                este.
              </p>
            </div>
          </details>
        </div>
      ))}
    </div>
  );
}
