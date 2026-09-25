import { Link } from "react-router-dom";

// Las pestañas de un cliente. Vivían copiadas en cada página, y con la
// cuarta (Fuentes de ingreso) eran cuatro copias que había que tocar a la
// vez para agregar o renombrar una.
const PESTANAS = [
  ["perfil", "Perfil del Cliente"],
  ["analisis", "Análisis con IA"],
  ["ingresos", "Fuentes de ingreso"],
  ["aval", "Aval"],
];

export default function PestanasCliente({ cedula, activa }) {
  return (
    <div className="crediscope-tabs">
      {PESTANAS.map(([ruta, texto]) =>
        ruta === activa ? (
          <span key={ruta} className="crediscope-tab crediscope-tab-active">
            {texto}
          </span>
        ) : (
          <Link key={ruta} className="crediscope-tab" to={`/${ruta}/${cedula}`}>
            {texto}
          </Link>
        ),
      )}
    </div>
  );
}
