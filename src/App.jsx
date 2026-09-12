import { Routes, Route, Navigate, Link } from "react-router-dom";
import { useSession } from "./lib/useSession.js";
import Login from "./pages/Login.jsx";
import ClientSearch from "./pages/ClientSearch.jsx";
import AnalisisIA from "./pages/AnalisisIA.jsx";
import PerfilCliente from "./pages/PerfilCliente.jsx";
import NovadataExplorer from "./pages/NovadataExplorer.jsx";
import AdminConfig from "./pages/AdminConfig.jsx";

function RequireSession({ children }) {
  const { session, loading } = useSession();
  if (loading) return null;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const { session } = useSession();

  return (
    <div className="crediscope-shell">
      <header className="crediscope-topbar">
        <Link to="/" style={{ color: "#fff", textDecoration: "none" }}>
          <strong>CrediScope</strong> — Score de Información Interna
        </Link>
        <nav style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <Link to="/explorar" style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}>
            Explorador Novadata
          </Link>
          {session ? (
            <Link to="/admin/configuracion" style={{ color: "#cbd5e1", textDecoration: "none", fontSize: 14 }}>
              Configuración
            </Link>
          ) : null}
          {session ? <span className="crediscope-muted" style={{ color: "#cbd5e1" }}>{session.user.email}</span> : null}
        </nav>
      </header>
      <main className="crediscope-main">
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Sin RequireSession: sirve para probar la ingesta de Novadata
              antes de tener un proyecto Supabase real configurado. */}
          <Route path="/explorar" element={<NovadataExplorer />} />
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
            path="/admin/configuracion"
            element={
              <RequireSession>
                <AdminConfig />
              </RequireSession>
            }
          />
        </Routes>
      </main>
    </div>
  );
}
