import { useEffect, useRef, useState } from "react";
import { moneda } from "../../lib/formatos.js";
import { VEREDICTOS } from "./VeredictoDeCapacidad.jsx";

// La cuota (y, en la capacidad de pago, el veredicto) pegada al borde de abajo
// en pantallas chicas. En el teléfono el resultado queda debajo de todo el
// formulario: quien mueve el monto no veía qué pasaba con la cuota sin bajar
// dos pantallas. En pantallas grandes no se dibuja (el resultado ya está al
// lado). Repite lo que muestran las tarjetas grandes, por eso no se anuncia
// al lector de pantalla: el veredicto ya tiene su propia zona de aviso.
//
// Mientras se ve alguna parte del resultado (la columna anterior a este
// resumen), se oculta: pegado al borde de abajo quedaba encima de la tarjeta
// grande, con la misma cuota dos veces y el reparto tapado (visto a 768 y 414
// px el 2026-10-20).
export default function ResumenFijo({ cuota, veredicto = null }) {
  const { titulo, Icono } = veredicto ? VEREDICTOS[veredicto] : {};
  const ref = useRef(null);
  const [resultadoALaVista, setResultadoALaVista] = useState(false);
  useEffect(() => {
    const resultado = ref.current?.previousElementSibling;
    if (!resultado || typeof IntersectionObserver === "undefined") return undefined;
    const observador = new IntersectionObserver(([entrada]) => setResultadoALaVista(entrada.isIntersecting));
    observador.observe(resultado);
    return () => observador.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      className={`crediscope-credito-resumen-fijo${veredicto ? ` crediscope-capacidad-${veredicto}` : ""}${resultadoALaVista ? " crediscope-credito-resumen-fijo-oculto" : ""}`}
      aria-hidden="true"
    >
      <span>
        <small>Cuota mensual</small>
        <strong>{moneda(cuota, 2)}</strong>
      </span>
      {veredicto ? (
        <span className="crediscope-credito-resumen-fijo-veredicto">
          <Icono size={18} />
          {titulo}
        </span>
      ) : null}
    </div>
  );
}
