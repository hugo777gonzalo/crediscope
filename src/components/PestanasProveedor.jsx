import { Link } from "react-router-dom";

// Subsección por proveedor en las pantallas de configuración (Fuentes,
// Campos). Mismo patrón visual que Perfil del Cliente / Análisis con IA
// (crediscope-tabs), pero sin un link de "volver": acá no se navega desde
// ni hacia un registro puntual, son las dos formas de ver la misma
// pantalla de administración.
//
// Cada proveedor tiene su propia URL (/admin/fuentes/proveedor-info-1,
// /admin/fuentes/aval) -- se puede compartir el link y el botón atrás del
// navegador funciona, igual que con Perfil del Cliente / Análisis con IA.
// Equifax sólo tiene la pestaña de fuentes: qué campos suyos lee el modelo se
// decide con la versión del marco (docs/propuesta-marco-equifax.md), no con
// interruptores por campo.
const PROVEEDORES = [
  { clave: "proveedor_info_1", nombre: "Proveedor_Info_1" },
  { clave: "aval", nombre: "Aval" },
  { clave: "equifax", nombre: "Equifax", soloEn: "fuentes" },
];

export default function PestanasProveedor({ base, activo }) {
  return (
    <div className="crediscope-tabs">
      {PROVEEDORES.filter((p) => !p.soloEn || p.soloEn === base).map((p) =>
        p.clave === activo ? (
          <span key={p.clave} className="crediscope-tab crediscope-tab-active" aria-current="page">
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
