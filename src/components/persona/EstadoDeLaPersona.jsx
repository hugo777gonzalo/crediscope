import { NOMBRE_DEL_ESTADO } from "../../../supabase/functions/_shared/estado-de-la-persona.ts";

// El estado de la persona (docs/modelo-de-la-persona.md) como etiqueta. Lleva
// su nombre delante («Estado de la persona») porque en las mismas pantallas
// conviven el estado del análisis y el de la solicitud: el negocio pidió no
// llamar «Estado» a dos cosas distintas (modelo-de-la-persona.md, 4).
const CLASE = {
  prospecto: "crediscope-tag-neutral",
  con_solicitud: "crediscope-tag-neutral",
  preaprobado: "crediscope-tag-ok",
  aprobado: "crediscope-tag-ok",
  no_aprobado: "crediscope-tag-bad",
  cliente_activo: "crediscope-tag-ok",
  cliente_cerrado: "crediscope-tag-neutral",
};

export default function EstadoDeLaPersona({ estado }) {
  if (!estado) return null;
  return (
    <span className={`crediscope-tag ${CLASE[estado] ?? "crediscope-tag-neutral"}`}>
      Estado de la persona: {NOMBRE_DEL_ESTADO[estado] ?? estado}
    </span>
  );
}
