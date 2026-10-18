import { moneda } from "../../lib/formatos.js";
import { VEREDICTOS } from "./VeredictoDeCapacidad.jsx";

// La cuota (y, en la capacidad de pago, el veredicto) pegada al borde de abajo
// en pantallas chicas. En el teléfono el resultado queda debajo de todo el
// formulario: quien mueve el monto no veía qué pasaba con la cuota sin bajar
// dos pantallas. En pantallas grandes no se dibuja (el resultado ya está al
// lado). Repite lo que muestran las tarjetas grandes, por eso no se anuncia
// al lector de pantalla: el veredicto ya tiene su propia zona de aviso.
export default function ResumenFijo({ cuota, veredicto = null }) {
  const { titulo, Icono } = veredicto ? VEREDICTOS[veredicto] : {};
  return (
    <div className={`crediscope-credito-resumen-fijo${veredicto ? ` crediscope-capacidad-${veredicto}` : ""}`} aria-hidden="true">
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
