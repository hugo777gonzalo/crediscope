import { Routes, Route, Navigate, Link, useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useSession } from "./lib/useSession.js";
import { useProfile, esAdmin } from "./lib/useProfile.js";
import { getUltimaCedula } from "./lib/ultimaCedula.js";
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
import NovadataExplorer from "./pages/NovadataExplorer.jsx";
import AdminConfig from "./pages/AdminConfig.jsx";
import LogoMark from "./components/LogoMark.jsx";

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

// Menú "Evaluación Crediticia": Buscar Cliente siempre lleva a la
// búsqueda; Perfil del Cliente/Análisis con IA abren directo el último
// cliente visto en este navegador (ver ultimaCedula.js) si hay uno —
// si no, cualquiera de los 3 lleva a Buscar Cliente primero.
function MenuEvaluacionCrediticia() {
  const ultimaCedula = getUltimaCedula();
  return (
    <div className="crediscope-navdrop">
      <span className="crediscope-navlink">Evaluación Crediticia ▾</span>
      <div className="crediscope-navdrop-menu">
        <Link to="/">Buscar Cliente</Link>
        <Link to={ultimaCedula ? `/perfil/${ultimaCedula}` : "/"}>Perfil del Cliente</Link>
        <Link to={ultimaCedula ? `/analisis/${ultimaCedula}` : "/"}>Análisis con IA</Link>
      </div>
    </div>
  );
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

  return (
    <div className="crediscope-shell">
      <header className="crediscope-topbar">
        <Link to="/" className="crediscope-brand">
          <LogoMark size={26} />
          CrediScope
        </Link>
        {session ? (
          <nav className="crediscope-nav">
            <MenuEvaluacionCrediticia />
            <Link className="crediscope-navlink" to="/historial">
              Historial
            </Link>
            <Link className="crediscope-navlink" to="/reportes">
              Reportes
            </Link>
            {esAdmin(profile) ? (
              <>
                <Link className="crediscope-navlink" to="/explorar">
                  Explorador de Fuentes
                </Link>
                <Link className="crediscope-navlink" to="/admin/configuracion">
                  Configuración
                </Link>
              </>
            ) : null}
            {profile ? (
              <span className="crediscope-userbadge">
                {profile.entidad ? <span className="crediscope-userbadge-entidad">{profile.entidad}</span> : null}
                <span>{profile.nombre_corto}</span>
              </span>
            ) : null}
            <BotonSalir />
          </nav>
        ) : null}
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
  );
}
