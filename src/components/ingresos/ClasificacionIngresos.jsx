import { ClipboardCheck } from "lucide-react";
import { TituloTarjeta } from "../reporte/Piezas.jsx";
import { mesLegible } from "../../lib/ingresosCampos.js";

// Por qué quedó en ese segmento y qué hay que pedirle para confirmarlo.
// Lo segundo es lo accionable de toda la pestaña: por eso va arriba y no
// dentro del detalle.
export default function ClasificacionIngresos({ f, corteVigente }) {
  const pedir = f.paraConfirmar ?? [];
  const otroCorte = f.corteIessUsado && corteVigente && f.corteIessUsado < corteVigente;

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={ClipboardCheck}>Clasificación</TituloTarjeta>

      <section className="crediscope-aval-subseccion">
        <p className="crediscope-aval-subtitulo">Por qué este segmento</p>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{f.motivoSegmento}</p>
        {/* Migración 081: 466 motivos afirmaban un aporte al IESS que no
            existía. Se corrigieron en la base; se dice acá para que nadie
            compare con una captura vieja y crea que el dato cambió. */}
        {f.correccion ? (
          <p className="crediscope-aval-nota" title={`Texto anterior: ${f.correccion.motivoAnterior}`}>
            Texto corregido el 24/09/2026: el anterior afirmaba un aporte vigente al IESS que no existe. El segmento no cambió.
          </p>
        ) : null}
        {otroCorte ? (
          <p className="crediscope-aval-nota">
            Se clasificó con el corte de {mesLegible(f.corteIessUsado)}; el vigente es {mesLegible(corteVigente)}. Reconsultar lo
            pone al día.
          </p>
        ) : null}
      </section>

      <section className="crediscope-aval-subseccion">
        <p className="crediscope-aval-subtitulo">Qué pedir para confirmar</p>
        {pedir.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>
            {f.estadoSegmento === "confirmada" ? "Nada: la fuente principal la reporta un tercero." : "Sin pedidos sugeridos."}
          </p>
        ) : (
          <ul className="crediscope-ing-pedidos">
            {pedir.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
