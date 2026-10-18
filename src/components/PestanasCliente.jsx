import { useEffect, useRef } from "react";
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
  ["perfil", "Perfil de la Persona"],
  ["analisis", "Análisis con IA"],
  ["ingresos", "Fuentes de Ingreso"],
  ["capacidad", "Capacidad de pago"],
];

export default function PestanasCliente({ cedula, activa }) {
  const { buro } = useBuro();
  const tira = useRef(null);
  // En un teléfono la tira se desliza y la del buró, la última, quedaba fuera
  // de la vista: el analista no veía en qué pestaña estaba (2026-10-18). Se
  // corre la tira, no la página.
  useEffect(() => {
    const t = tira.current;
    const a = t?.querySelector('[aria-current="page"]');
    if (!t || !a || t.scrollWidth <= t.clientWidth) return;
    t.scrollLeft = a.offsetLeft - t.offsetLeft - (t.clientWidth - a.offsetWidth) / 2;
  }, [activa, buro]);
  const pestanas = buro ? [...PESTANAS, [buro, NOMBRE_DEL_BURO[buro]]] : PESTANAS;
  // Quien entró por un enlace a la pestaña del otro buró la sigue viendo.
  const conLaActiva =
    activa && !pestanas.some(([ruta]) => ruta === activa) && NOMBRE_DEL_BURO[activa]
      ? [...pestanas, [activa, NOMBRE_DEL_BURO[activa]]]
      : pestanas;
  return (
    <div className="crediscope-tabs" ref={tira}>
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
