import { Link } from "react-router-dom";

// Subsección por proveedor en las pantallas de configuración (Fuentes,
// Campos). Mismo patrón visual que Perfil del Cliente / Análisis con IA
// (crediscope-tabs), pero sin un link de "volver": acá no se navega desde
// ni hacia un registro puntual, son las dos formas de ver la misma
// pantalla de administración.
//
// Cada proveedor tiene su propia URL (/admin/fuentes/novadata,
// /admin/fuentes/aval) -- se puede compartir el link y el botón atrás del
// navegador funciona, igual que con Perfil del Cliente / Análisis con IA.
const PROVEEDORES = [
  { clave: "novadata", nombre: "Novadata" },
  { clave: "aval", nombre: "Aval" },
];

export default function PestanasProveedor({ base, activo }) {
  return (
    <div className="crediscope-tabs">
      {PROVEEDORES.map((p) =>
        p.clave === activo ? (
          <span key={p.clave} className="crediscope-tab crediscope-tab-active">
            {p.nombre}
          </span>
        ) : (
          <Link key={p.clave} className="crediscope-tab" to={`/admin/${base}/${p.clave}`}>
            {p.nombre}
          </Link>
        )
      )}
    </div>
  );
}
