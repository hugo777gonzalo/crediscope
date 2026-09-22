import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useSession } from "./lib/useSession.js";
import { useProfile, esAdmin } from "./lib/useProfile.js";
import { supabase } from "./lib/supabaseClient.js";
import Login from "./pages/Login.jsx";
import { useCaducidadSesion } from "./lib/useCaducidadSesion.js";
import { MENSAJE_CADUCIDAD, limpiarVigilancia } from "./lib/caducidadSesion.js";
import Signup from "./pages/Signup.jsx";
import ClientSearch from "./pages/ClientSearch.jsx";
import AnalisisIA from "./pages/AnalisisIA.jsx";
import PerfilCliente from "./pages/PerfilCliente.jsx";
import PerfilAval from "./pages/PerfilAval.jsx";
import Solicitudes from "./pages/Solicitudes.jsx";
import Expediente from "./pages/Expediente.jsx";
import Historial from "./pages/Historial.jsx";
import HistorialPerfilDetalle from "./pages/HistorialPerfilDetalle.jsx";
import HistorialAnalisisDetalle from "./pages/HistorialAnalisisDetalle.jsx";
import Reportes from "./pages/Reportes.jsx";
import FuentesIngreso from "./pages/FuentesIngreso.jsx";
import FuentesClientes from "./pages/FuentesClientes.jsx";
import FuentesReglas from "./pages/FuentesReglas.jsx";
import FuentesParametros from "./pages/FuentesParametros.jsx";
import Descargas from "./pages/Descargas.jsx";
import Retroalimentacion from "./pages/Retroalimentacion.jsx";
import InformeFeedback from "./pages/InformeFeedback.jsx";
import VersionesCriterio from "./pages/VersionesCriterio.jsx";
import NovadataExplorer from "./pages/NovadataExplorer.jsx";
import ConfigFuentes from "./pages/ConfigFuentes.jsx";
import ConfigFuentesAval from "./pages/ConfigFuentesAval.jsx";
import ConfigCampos from "./pages/ConfigCampos.jsx";
import ConfigCamposAval from "./pages/ConfigCamposAval.jsx";
import ConfigSegmentos from "./pages/ConfigSegmentos.jsx";
import Lotes from "./pages/Lotes.jsx";
import LoteNuevo from "./pages/LoteNuevo.jsx";
import LoteDetalle from "./pages/LoteDetalle.jsx";
import Costos from "./pages/Costos.jsx";
import CostosConsultas from "./pages/CostosConsultas.jsx";
import CostosCorridas from "./pages/CostosCorridas.jsx";
import CostosLlamadas from "./pages/CostosLlamadas.jsx";
import CostosIncidentes from "./pages/CostosIncidentes.jsx";
import CostosAvisos from "./pages/CostosAvisos.jsx";
import CostosTarifas from "./pages/CostosTarifas.jsx";
import MenuLateral from "./components/MenuLateral.jsx";

function RequireSession({ children }) {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

// Explorador de Fuentes y Configuración son solo para admin -- ocultar
// el link del menú no alcanza, hay que bloquear la ruta directa
// también. loading cubre tanto la sesión como el perfil (useProfile ya
// combina ambos), para no redirigir de más mientras carga.
function RequireAdmin({ children }) {
  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading } = useProfile();
  if (sessionLoading || profileLoading) return null;
  if (!session) return <Navigate to="/login" replace />;
  if (!esAdmin(profile)) return <Navigate to="/" replace />;
  return children;
}

// Título de la sección en la barra superior, a partir de la ruta — la
// identidad de la app la lleva el menú lateral, así que arriba conviene
// decir dónde está parado el analista y no repetir la marca.
const TITULOS = [
  [/^\/$/, "Evaluación Crediticia"],
  [/^\/perfil/, "Evaluación Crediticia"],
  [/^\/analisis/, "Evaluación Crediticia"],
  // El expediente pone el nombre de la persona en su propia cabecera:
  // repetirlo arriba gastaba la única línea que dice en qué módulo está
  // parado el analista.
  [/^\/solicitudes\/./, "Expediente"],
  [/^\/solicitudes/, "Solicitudes"],
  [/^\/historial/, "Historial de un cliente"],
  [/^\/reportes\/descargas/, "Descargas"],
  [/^\/reportes/, "Inteligencia de Negocios"],
  [/^\/fuentes\/clientes/, "Clientes por segmento"],
  [/^\/fuentes\/reglas/, "Reglas de clasificación"],
  [/^\/fuentes\/parametros/, "Parámetros"],
  [/^\/fuentes/, "Fuentes de Ingreso"],
  [/^\/lotes\/nuevo/, "Cargar un lote"],
  [/^\/lotes\/./, "Detalle del lote"],
  [/^\/lotes/, "Consultas por lote"],
  [/^\/costos\/consultas/, "Costo por consulta"],
  [/^\/costos\/corridas/, "Corridas masivas"],
  [/^\/costos\/llamadas/, "Detalle de llamadas"],
  [/^\/costos\/incidentes/, "Fallas e incidentes"],
  [/^\/costos\/avisos/, "Avisos"],
  [/^\/costos\/tarifas/, "Tarifas"],
  [/^\/costos/, "Costos"],
  [/^\/retroalimentacion/, "Retroalimentación"],
  [/^\/explorar/, "Explorador de Fuentes"],
  [/^\/admin\/fuentes/, "Fuentes que consultamos"],
  [/^\/admin\/campos/, "Campos del análisis"],
  [/^\/admin\/segmentos/, "Qué ve el analista"],
  [/^\/admin/, "Configuración"],
];

function tituloDeSeccion(pathname) {
  return TITULOS.find(([patron]) => patron.test(pathname))?.[1] ?? "CrediScope";
}

function BotonSalir() {
  const navigate = useNavigate();
  async function handleClick() {
    // Salir a mano también apaga los relojes de caducidad: si no, el
    // próximo ingreso hereda la inactividad acumulada del anterior y
    // puede cerrarse solo a los pocos segundos.
    limpiarVigilancia();
    await supabase.auth.signOut();
    navigate("/login");
  }
  return (
    <button className="crediscope-logout-btn" onClick={handleClick} title="Cerrar sesión" aria-label="Cerrar sesión">
      <LogOut size={16} />
    </button>
  );
}

export default function App() {
  const { session } = useSession();
  const { profile } = useProfile();
  const { pathname } = useLocation();
  // La sesión caduca por inactividad y por tiempo total -- ver
  // caducidadSesion.js. El motivo se conserva para explicárselo en la
  // pantalla de ingreso.
  const { motivo } = useCaducidadSesion(Boolean(session));

  // Login y Crear cuenta se ven a pantalla completa: sin sesión no hay
  // menú que mostrar, y meterlas en el armazón dejaría una barra vacía.
  if (!session) {
    return (
      <main className="crediscope-main crediscope-main-suelto">
          <Routes>
            <Route path="/login" element={<Login avisoCaducidad={motivo ? MENSAJE_CADUCIDAD[motivo] : null} />} />
            <Route path="/crear-cuenta" element={<Signup />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
      </main>
    );
  }

  return (
    <div className="crediscope-shell">
      <MenuLateral profile={profile} />
      <div className="crediscope-contenido">
        <header className="crediscope-topbar">
          <span className="crediscope-topbar-titulo">{tituloDeSeccion(pathname)}</span>
          <div className="crediscope-topbar-derecha">
            {profile ? (
              <span className="crediscope-userbadge">
                {profile.entidad ? <span className="crediscope-userbadge-entidad">{profile.entidad}</span> : null}
                <span>{profile.nombre_corto}</span>
              </span>
            ) : null}
            <BotonSalir />
          </div>
        </header>
        <main className="crediscope-main">
        <Routes>
          {/* Con sesión activa, Login y Crear cuenta no tienen nada que
              hacer: mostrarlas acá dibujaba el formulario de ingreso
              dentro de la aplicación, con el menú y el nombre del
              usuario ya visibles alrededor. Parecía que la sesión no
              valía, o peor, que se puede ver el sistema sin entrar.
              Quien ya entró y llega a /login va a donde iba. */}
          <Route path="/login" element={<Navigate to="/" replace />} />
          <Route path="/crear-cuenta" element={<Navigate to="/" replace />} />
          <Route
            path="/explorar"
            element={
              <RequireAdmin>
                <NovadataExplorer />
              </RequireAdmin>
            }
          />
          <Route
            path="/"
            element={
              <RequireSession>
                <ClientSearch />
              </RequireSession>
            }
          />
          <Route
            path="/perfil/:cedula"
            element={
              <RequireSession>
                <PerfilCliente />
              </RequireSession>
            }
          />
          <Route
            path="/analisis/:cedula"
            element={
              <RequireSession>
                <AnalisisIA />
              </RequireSession>
            }
          />
          <Route
            path="/aval/:cedula"
            element={
              <RequireSession>
                <PerfilAval />
              </RequireSession>
            }
          />
          {/* La bandeja y el expediente. El expediente tiene ruta
              propia a propósito: se comparte por enlace, se abren
              varios en pestañas y sobrevive a recargar la página. */}
          <Route
            path="/solicitudes"
            element={
              <RequireSession>
                <Solicitudes />
              </RequireSession>
            }
          />
          <Route
            path="/solicitudes/:cedula"
            element={
              <RequireSession>
                <Expediente />
              </RequireSession>
            }
          />
          <Route
            path="/historial"
            element={
              <RequireSession>
                <Historial />
              </RequireSession>
            }
          />
          <Route
            path="/historial/perfil/:id"
            element={
              <RequireSession>
                <HistorialPerfilDetalle />
              </RequireSession>
            }
          />
          <Route
            path="/historial/analisis/:id"
            element={
              <RequireSession>
                <HistorialAnalisisDetalle />
              </RequireSession>
            }
          />
          <Route
            path="/reportes"
            element={
              <RequireSession>
                <Reportes />
              </RequireSession>
            }
          />
          {/* Bajar la cartera entera en un archivo no es leer un
              cliente: son 2.565 personas con Fiscalía, Función Judicial
              y comportamiento bancario adentro, en un archivo que sale
              del sistema y ya no vuelve. Administración. */}
          <Route
            path="/reportes/descargas"
            element={
              <RequireAdmin>
                <Descargas />
              </RequireAdmin>
            }
          />
          {/* Consultas por lote: cargar un archivo con miles de cédulas
              y consultarlas es otro nivel de exposición que buscar un
              cliente a la vez. Administración, en la ruta y en la
              política de la base (058). */}
          <Route
            path="/lotes"
            element={
              <RequireAdmin>
                <Lotes />
              </RequireAdmin>
            }
          />
          <Route
            path="/lotes/nuevo"
            element={
              <RequireAdmin>
                <LoteNuevo />
              </RequireAdmin>
            }
          />
          <Route
            path="/lotes/:id"
            element={
              <RequireAdmin>
                <LoteDetalle />
              </RequireAdmin>
            }
          />
          {/* Costos es solo para administración: no es un dato
              operativo, es el margen del negocio. La política de la
              base también lo restringe (046), así que ocultar el link
              no es la única defensa. */}
          <Route
            path="/costos"
            element={
              <RequireAdmin>
                <Costos />
              </RequireAdmin>
            }
          />
          <Route
            path="/costos/consultas"
            element={
              <RequireAdmin>
                <CostosConsultas />
              </RequireAdmin>
            }
          />
          <Route
            path="/costos/corridas"
            element={
              <RequireAdmin>
                <CostosCorridas />
              </RequireAdmin>
            }
          />
          <Route
            path="/costos/llamadas"
            element={
              <RequireAdmin>
                <CostosLlamadas />
              </RequireAdmin>
            }
          />
          <Route
            path="/costos/incidentes"
            element={
              <RequireAdmin>
                <CostosIncidentes />
              </RequireAdmin>
            }
          />
          <Route
            path="/costos/avisos"
            element={
              <RequireAdmin>
                <CostosAvisos />
              </RequireAdmin>
            }
          />
          <Route
            path="/costos/tarifas"
            element={
              <RequireAdmin>
                <CostosTarifas />
              </RequireAdmin>
            }
          />
          <Route
            path="/fuentes"
            element={
              <RequireSession>
                <FuentesIngreso />
              </RequireSession>
            }
          />
          <Route
            path="/fuentes/clientes"
            element={
              <RequireSession>
                <FuentesClientes />
              </RequireSession>
            }
          />
          <Route
            path="/fuentes/reglas"
            element={
              <RequireSession>
                <FuentesReglas />
              </RequireSession>
            }
          />
          <Route
            path="/fuentes/parametros"
            element={
              <RequireAdmin>
                <FuentesParametros />
              </RequireAdmin>
            }
          />
          <Route
            path="/retroalimentacion"
            element={
              <RequireAdmin>
                <Retroalimentacion />
              </RequireAdmin>
            }
          />
          <Route
            path="/retroalimentacion/versiones"
            element={
              <RequireAdmin>
                <VersionesCriterio />
              </RequireAdmin>
            }
          />
          <Route
            path="/retroalimentacion/informe/:id"
            element={
              <RequireAdmin>
                <InformeFeedback />
              </RequireAdmin>
            }
          />
          <Route path="/admin/fuentes" element={<Navigate to="/admin/fuentes/novadata" replace />} />
          <Route
            path="/admin/fuentes/novadata"
            element={
              <RequireAdmin>
                <ConfigFuentes />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/fuentes/aval"
            element={
              <RequireAdmin>
                <ConfigFuentesAval />
              </RequireAdmin>
            }
          />
          <Route path="/admin/campos" element={<Navigate to="/admin/campos/novadata" replace />} />
          <Route
            path="/admin/campos/novadata"
            element={
              <RequireAdmin>
                <ConfigCampos />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/campos/aval"
            element={
              <RequireAdmin>
                <ConfigCamposAval />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/segmentos"
            element={
              <RequireAdmin>
                <ConfigSegmentos />
              </RequireAdmin>
            }
          />
          {/* La ruta vieja sigue viva: había enlaces y marcadores
              apuntando acá antes de que fueran tres pantallas. */}
          <Route path="/admin/configuracion" element={<Navigate to="/admin/fuentes" replace />} />
        </Routes>
        </main>
      </div>
    </div>
  );
}
