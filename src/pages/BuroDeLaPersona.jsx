import { Navigate, useParams, Link } from "react-router-dom";
import { useBuro } from "../lib/useBuro.js";
import { useProfile, esAdmin } from "../lib/useProfile.js";
import PestanasCliente from "../components/PestanasCliente.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import Aviso from "../components/ui/Aviso.jsx";

// «Buró» en el menú lleva al buró de la institución, el que se eligió en
// Configuración (129): una IFI trabaja con Equifax o con Aval, nunca con los
// dos (cuestionario, A2). El menú no sabe cuál es; esta ruta sí.
export default function BuroDeLaPersona() {
  const { cedula } = useParams();
  const { buro, cargando } = useBuro();
  const { profile } = useProfile();

  if (cargando) return <Cargando />;
  if (buro) return <Navigate to={`/${buro}/${cedula}`} replace />;

  return (
    <div>
      <PestanasCliente cedula={cedula} activa={null} />
      <Aviso tipo="informacion" titulo="La institución todavía no eligió su buró.">
        <p className="crediscope-muted">
          {esAdmin(profile) ? (
            <>
              Se elige en <Link to="/admin/fuentes/equifax">Configuración › Fuentes que consultamos</Link>: Equifax o
              Aval.
            </>
          ) : (
            "Lo elige administración: Equifax o Aval."
          )}
        </p>
      </Aviso>
    </div>
  );
}
