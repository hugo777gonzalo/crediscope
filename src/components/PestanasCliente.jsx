import { Link } from "react-router-dom";
import { useBuro, NOMBRE_DEL_BURO } from "../lib/useBuro.js";

// Las pestañas de un cliente. Vivían copiadas en cada página, y con la
// cuarta (Fuentes de ingreso) eran cuatro copias que había que tocar a la
// vez para agregar o renombrar una.
//
// La última es la del buró de la institución, uno solo por IFI (cuestionario,
// A2 y F1, 2026-10-13): Equifax o Aval, nunca las dos. Mientras se sabe cuál
// es, no se dibuja: una pestaña que aparece y cambia de nombre confunde más
// que una que llega un instante después.
const PESTANAS = [
  ["perfil", "Perfil del Cliente"],
  ["analisis", "Análisis con IA"],
  ["ingresos", "Fuentes de Ingreso"],
  ["capacidad", "Capacidad de pago"],
];

export default function PestanasCliente({ cedula, activa }) {
  const { buro } = useBuro();
  const pestanas = buro ? [...PESTANAS, [buro, NOMBRE_DEL_BURO[buro]]] : PESTANAS;
  // Quien entró por un enlace a la pestaña del otro buró la sigue viendo.
  const conLaActiva =
    activa && !pestanas.some(([ruta]) => ruta === activa) && NOMBRE_DEL_BURO[activa]
      ? [...pestanas, [activa, NOMBRE_DEL_BURO[activa]]]
      : pestanas;
  return (
    <div className="crediscope-tabs">
      {conLaActiva.map(([ruta, texto]) =>
        ruta === activa ? (
          <span key={ruta} className="crediscope-tab crediscope-tab-active" aria-current="page">
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
