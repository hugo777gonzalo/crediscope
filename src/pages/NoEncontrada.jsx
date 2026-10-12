import { Link } from "react-router-dom";

// Una dirección que no existe (un enlace viejo, un error al escribirla). Antes
// la aplicación dibujaba el menú y un cuadro vacío: no decía que algo andaba
// mal ni cómo salir.
export default function NoEncontrada() {
  return (
    <div className="crediscope-card">
      <h2>No encontramos esa página</h2>
      <p className="crediscope-muted">
        La dirección no existe o ya no está disponible. Volvé al inicio para buscar un cliente, o elegí una opción del menú.
      </p>
      <Link className="crediscope-btn" to="/">
        Ir al inicio
      </Link>
    </div>
  );
}
