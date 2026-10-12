// Estado de espera, igual en toda la aplicación.
//
// Antes cada pantalla escribía su propio <p className="crediscope-muted">
// Cargando...</p> (treinta y cinco, cada una con su estilo) y las guardias de
// ruta dejaban la pantalla en blanco. role="status" hace que el lector de
// pantalla lo anuncie. Los puntos suspensivos son tres puntos, como en el
// resto de la aplicación (67 textos): no mezclar con el carácter "…".

export default function Cargando({ texto = "Cargando...", pantalla = false }) {
  return (
    <p className={`crediscope-cargando${pantalla ? " crediscope-cargando-pantalla" : ""}`} role="status" aria-live="polite">
      <span className="crediscope-cargando-giro" aria-hidden="true" />
      {texto}
    </p>
  );
}
