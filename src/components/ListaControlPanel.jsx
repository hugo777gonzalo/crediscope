import { ShieldAlert, ShieldCheck } from "lucide-react";
import SeccionDesplegable from "./SeccionDesplegable.jsx";

// Listas de control: solo aparece cuando el cliente tiene coincidencias.
// Si no hay ninguna, la sección no se muestra -- que es la ausencia de
// hallazgo, no un dato que el analista tenga que ir a leer.
//
// Se distingue el hallazgo BLOQUEANTE (OFAC, listas de sanciones,
// delitos graves de seguridad: fuerzan el score a 1 y la recomendación
// a negar) del informativo (PEP, homónimos). Esa diferencia es la que
// más se presta a malentendidos: ser PEP exige debida diligencia
// reforzada, no descalifica a nadie, y mostrarlos con el mismo color
// llevaría a tratarlos igual.

const ETIQUETA_FUENTE = {
  lista_control: "Lista de control externa",
  lista_negra: "Lista negra",
  listas_control_interno: "Lista de control interna",
  pep: "Persona expuesta políticamente",
  homonimo_en_lista_control: "Homónimo en lista de control",
  delito_seguridad_ciudadana: "Delito grave de seguridad ciudadana",
  fallecido: "Registro de fallecimiento",
  cedula_inconsistente: "Identificación inconsistente",
};

export default function ListaControlPanel({ controlBloqueo }) {
  const hallazgos = controlBloqueo?.hallazgos ?? [];
  if (hallazgos.length === 0) return null;

  const hayBloqueante = hallazgos.some((h) => h.bloqueante);

  return (
    <SeccionDesplegable
      Icono={hayBloqueante ? ShieldAlert : ShieldCheck}
      titulo="Lista de control"
      cantidad={hallazgos.length}
      color={hayBloqueante ? "var(--bad)" : "var(--brand)"}
      abiertaPorDefecto={hayBloqueante}
    >
      <ul className="crediscope-items">
        {hallazgos.map((h, i) => (
          <li key={i} className="crediscope-item">
            <span className="crediscope-item-icono" style={{ color: h.bloqueante ? "var(--bad)" : "var(--brand)" }}>
              {h.bloqueante ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
            </span>
            <span>
              <span className="crediscope-item-titulo">
                {ETIQUETA_FUENTE[h.code] ?? h.code}
                <span className={`crediscope-tag ${h.bloqueante ? "crediscope-tag-bad" : "crediscope-tag-neutral"}`} style={{ marginLeft: 8 }}>
                  {h.bloqueante ? "Bloqueante" : "Informativo"}
                </span>
              </span>
              <span className="crediscope-item-detalle">{h.message}</span>
            </span>
          </li>
        ))}
      </ul>
      {hayBloqueante ? (
        <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
          Un hallazgo bloqueante fuerza el score al mínimo y la recomendación a negar, sin importar el resto del perfil.
        </p>
      ) : (
        <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
          Ninguno de estos hallazgos descalifica al cliente por sí solo: son señales de cumplimiento a considerar en la debida
          diligencia.
        </p>
      )}
    </SeccionDesplegable>
  );
}
