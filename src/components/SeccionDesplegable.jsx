import { useState } from "react";
import { ChevronDown } from "lucide-react";

// Tarjeta contador que se despliega: el título con la cantidad siempre
// visible, el detalle bajo demanda.
//
// Por qué así y no todo abierto: un análisis puede traer 6 positivos, 4
// negativos y 3 observaciones; mostrados todos a la vez, el analista
// tiene que leer 13 líneas antes de saber si el caso le interesa. El
// contador le dice el volumen y decide qué abrir.
//
// `abiertaPorDefecto` existe para los casos donde no abrir sería
// esconder algo importante (ver el panel de listas de control).

export default function SeccionDesplegable({
  Icono,
  titulo,
  cantidad,
  color = "var(--brand)",
  fondo,
  abiertaPorDefecto = false,
  vacio = "Sin registros.",
  children,
}) {
  const [abierta, setAbierta] = useState(abiertaPorDefecto);
  const hayContenido = cantidad > 0;

  return (
    <div className={`crediscope-seccion ${abierta ? "crediscope-seccion-abierta" : ""}`} style={abierta && fondo ? { background: fondo, borderColor: color } : undefined}>
      <button
        type="button"
        className="crediscope-seccion-cabecera"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        disabled={!hayContenido}
      >
        <span className="crediscope-seccion-icono" style={{ color }}>
          <Icono size={18} />
        </span>
        <span className="crediscope-seccion-titulo">{titulo}</span>
        <span className="crediscope-seccion-cantidad" style={{ color }}>
          {cantidad}
        </span>
        {hayContenido ? (
          <ChevronDown size={17} className="crediscope-seccion-chevron" style={{ color: "var(--text-muted)" }} />
        ) : null}
      </button>
      {abierta ? <div className="crediscope-seccion-cuerpo">{hayContenido ? children : <p className="crediscope-muted">{vacio}</p>}</div> : null}
    </div>
  );
}
