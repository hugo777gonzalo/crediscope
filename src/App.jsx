import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useSession } from "./lib/useSession.js";
import { useProfile, esAdmin } from "./lib/useProfile.js";
import { supabase } from "./lib/supabaseClient.js";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import ClientSearch from "./pages/ClientSearch.jsx";
import AnalisisIA from "./pages/AnalisisIA.jsx";
import PerfilCliente from "./pages/PerfilCliente.jsx";
import Historial from "./pages/Historial.jsx";
import HistorialPerfilDetalle from "./pages/HistorialPerfilDetalle.jsx";
import HistorialAnalisisDetalle from "./pages/HistorialAnalisisDetalle.jsx";
import Reportes from "./pages/Reportes.jsx";
import Descargas from "./pages/Descargas.jsx";
import Retroalimentacion from "./pages/Retroalimentacion.jsx";
import InformeFeedback from "./pages/InformeFeedback.jsx";
import VersionesCriterio from "./pages/VersionesCriterio.jsx";
import NovadataExplorer from "./pages/NovadataExplorer.jsx";
import AdminConfig from "./pages/AdminConfig.jsx";
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
  [/^\/historial/, "Solicitudes"],
  [/^\/reportes\/descargas/, "Descargas"],
  [/^\/reportes/, "Inteligencia de Negocios"],
  [/^\/retroalimentacion/, "Retroalimentación"],
  [/^\/explorar/, "Explorador de Fuentes"],
  [/^\/admin/, "Configuración"],
];

function tituloDeSeccion(pathname) {
  return TITULOS.find(([patron]) => patron.test(pathname))?.[1] ?? "CrediScope";
}

function BotonSalir() {
  const navigate = useNavigate();
  async function handleClick() {
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

  // Login y Crear cuenta se ven a pantalla completa: sin sesión no hay
  // menú que mostrar, y meterlas en el armazón dejaría una barra vacía.
  if (!session) {
    return (
      <main className="crediscope-main crediscope-main-suelto">
          <Routes>
            <Route path="/login" element={<Login />} />
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
          <Route path="/login" element={<Login />} />
          <Route path="/crear-cuenta" element={<Signup />} />
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
          <Route
            path="/reportes/descargas"
            element={
              <RequireSession>
                <Descargas />
              </RequireSession>
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
          <Route
            path="/admin/configuracion"
            element={
              <RequireAdmin>
                <AdminConfig />
              </RequireAdmin>
            }
          />
        </Routes>
        </main>
      </div>
    </div>
  );
}
