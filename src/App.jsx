import { lazy, Suspense, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import { ChevronRight, LogOut } from "lucide-react";
import { useSession } from "./lib/useSession.js";
import { useProfile, esAdmin } from "./lib/useProfile.js";
import { supabase } from "./lib/supabaseClient.js";
import Login from "./pages/Login.jsx";
import { useCaducidadSesion } from "./lib/useCaducidadSesion.js";
import { MENSAJE_CADUCIDAD, limpiarVigilancia } from "./lib/caducidadSesion.js";
import { destinoDeIngreso, marcarSalidaAProposito, sePuedeRecordarElDestino } from "./lib/destinoDeIngreso.js";
import { ubicacion } from "./lib/navegacion.js";
import ClientSearch from "./pages/ClientSearch.jsx";
import MenuLateral from "./components/MenuLateral.jsx";
import Cargando from "./components/ui/Cargando.jsx";
import LimiteDeError from "./components/ui/LimiteDeError.jsx";

// Cada pantalla se pide cuando se abre, no todas juntas al entrar. Hasta el
// 2026-10-10 todo viajaba en un solo archivo de 1,7 MB (496 KB comprimido)
// que incluía el Laboratorio, la estadística y la lectura de Excel, y la
// pantalla de ingreso esperaba por ese código aunque nadie fuera a usarlo.
// El inicio queda en el archivo principal porque es a donde se llega siempre.
const PerfilCliente = lazy(() => import("./pages/PerfilCliente.jsx"));
const AnalisisIA = lazy(() => import("./pages/AnalisisIA.jsx"));
const IngresosCliente = lazy(() => import("./pages/IngresosCliente.jsx"));
const PerfilAval = lazy(() => import("./pages/PerfilAval.jsx"));
const Solicitudes = lazy(() => import("./pages/Solicitudes.jsx"));
const Expediente = lazy(() => import("./pages/Expediente.jsx"));
const Historial = lazy(() => import("./pages/Historial.jsx"));
const HistorialPerfilDetalle = lazy(() => import("./pages/HistorialPerfilDetalle.jsx"));
const HistorialAnalisisDetalle = lazy(() => import("./pages/HistorialAnalisisDetalle.jsx"));
const Reportes = lazy(() => import("./pages/Reportes.jsx"));
const FuentesIngreso = lazy(() => import("./pages/FuentesIngreso.jsx"));
const FuentesClientes = lazy(() => import("./pages/FuentesClientes.jsx"));
const FuentesReglas = lazy(() => import("./pages/FuentesReglas.jsx"));
const FuentesParametros = lazy(() => import("./pages/FuentesParametros.jsx"));
const Descargas = lazy(() => import("./pages/Descargas.jsx"));
const Laboratorio = lazy(() => import("./pages/Laboratorio.jsx"));
const LaboratorioCargaNueva = lazy(() => import("./pages/LaboratorioCargaNueva.jsx"));
const LaboratorioCarga = lazy(() => import("./pages/LaboratorioCarga.jsx"));
const LaboratorioCorteNuevo = lazy(() => import("./pages/LaboratorioCorteNuevo.jsx"));
const LaboratorioCorte = lazy(() => import("./pages/LaboratorioCorte.jsx"));
const LaboratorioPropuestas = lazy(() => import("./pages/LaboratorioPropuestas.jsx"));
const LaboratorioDatos = lazy(() => import("./pages/LaboratorioDatos.jsx"));
const LaboratorioDesempeno = lazy(() => import("./pages/LaboratorioDesempeno.jsx"));
const LaboratorioEstadistica = lazy(() => import("./pages/LaboratorioEstadistica.jsx"));
const LaboratorioProfundo = lazy(() => import("./pages/LaboratorioProfundo.jsx"));
const LaboratorioCaso = lazy(() => import("./pages/LaboratorioCaso.jsx"));
const LaboratorioInstituciones = lazy(() => import("./pages/LaboratorioInstituciones.jsx"));
const NovadataExplorer = lazy(() => import("./pages/NovadataExplorer.jsx"));
const ConfigFuentes = lazy(() => import("./pages/ConfigFuentes.jsx"));
const ConfigFuentesAval = lazy(() => import("./pages/ConfigFuentesAval.jsx"));
const ConfigCampos = lazy(() => import("./pages/ConfigCampos.jsx"));
const ConfigCamposAval = lazy(() => import("./pages/ConfigCamposAval.jsx"));
const ConfigSegmentos = lazy(() => import("./pages/ConfigSegmentos.jsx"));
const Lotes = lazy(() => import("./pages/Lotes.jsx"));
const LoteNuevo = lazy(() => import("./pages/LoteNuevo.jsx"));
const LoteDetalle = lazy(() => import("./pages/LoteDetalle.jsx"));
const Costos = lazy(() => import("./pages/Costos.jsx"));
const CostosConsultas = lazy(() => import("./pages/CostosConsultas.jsx"));
const CostosCorridas = lazy(() => import("./pages/CostosCorridas.jsx"));
const CostosLlamadas = lazy(() => import("./pages/CostosLlamadas.jsx"));
const CostosIncidentes = lazy(() => import("./pages/CostosIncidentes.jsx"));
const CostosAvisos = lazy(() => import("./pages/CostosAvisos.jsx"));
const CostosTarifas = lazy(() => import("./pages/CostosTarifas.jsx"));
const NoEncontrada = lazy(() => import("./pages/NoEncontrada.jsx"));

// Explorador de Fuentes y Configuración son solo para admin -- ocultar
// el link del menú no alcanza, hay que bloquear la ruta directa
// también. El perfil se carga una sola vez para toda la aplicación (ver
// useProfile.js) y App.jsx espera a tenerlo antes de dibujar el menú, así
// que acá casi nunca se llega con `loading`.
function RequireAdmin({ children }) {
  const { session, loading: sessionLoading } = useSession();
  const { profile, loading: profileLoading } = useProfile();
  if (sessionLoading || profileLoading) return <Cargando pantalla />;
  if (!session) return <Navigate to="/login" replace />;
  if (!esAdmin(profile)) return <Navigate to="/" replace />;
  return children;
}

// Dónde está parado el analista: "Sección › Página". La identidad de la
// app la lleva el menú lateral, así que arriba conviene decir dónde se está
// y no repetir la marca. La lista de nombres es la del menú (lib/navegacion.js).
function Ubicacion() {
  const { pathname } = useLocation();
  const { seccion, pagina } = ubicacion(pathname);

  // La pestaña del navegador dice dónde está cada una: el expediente se abre
  // en varias pestañas a propósito y todas decían lo mismo.
  useEffect(() => {
    document.title = pagina ? `${pagina} · ${seccion} · CrediScope` : `${seccion} · CrediScope`;
  }, [seccion, pagina]);

  return (
    <>
    {/* Cada pantalla dibuja su propio título como <h2>: sin un <h1> la
        página no tenía el encabezado principal que los lectores de pantalla
        usan para orientarse. Lo dice sólo para ellos; lo visible es la
        ubicación de al lado. */}
    <h1 className="crediscope-solo-lectores">{pagina ? `${seccion}: ${pagina}` : seccion}</h1>
    <nav className="crediscope-topbar-titulo crediscope-ubicacion" aria-label="Dónde estás">
      <span className={pagina ? "crediscope-ubicacion-seccion" : "crediscope-ubicacion-pagina"}>{seccion}</span>
      {pagina ? (
        <>
          <ChevronRight size={14} aria-hidden="true" />
          <span className="crediscope-ubicacion-pagina" aria-current="page">
            {pagina}
          </span>
        </>
      ) : null}
    </nav>
    </>
  );
}

function BotonSalir() {
  const navigate = useNavigate();
  async function handleClick() {
    // Salir a mano también apaga los relojes de caducidad: si no, el
    // próximo ingreso hereda la inactividad acumulada del anterior y
    // puede cerrarse solo a los pocos segundos.
    limpiarVigilancia();
    marcarSalidaAProposito();
    await supabase.auth.signOut();
    navigate("/login");
  }
  return (
    <button className="crediscope-logout-btn" onClick={handleClick} title="Cerrar sesión" aria-label="Cerrar sesión">
      <LogOut size={16} aria-hidden="true" />
    </button>
  );
}

export default function App() {
  const { session, loading: cargandoSesion } = useSession();
  const { profile, loading: cargandoPerfil } = useProfile();
  const { pathname, search, hash, state } = useLocation();
  // La sesión caduca por inactividad y por tiempo total -- ver
  // caducidadSesion.js. El motivo se conserva para explicárselo en la
  // pantalla de ingreso.
  const { motivo } = useCaducidadSesion(Boolean(session));

  // Mientras Supabase lee la sesión guardada, `session` es null aunque la
  // persona sí haya ingresado. Sin esta espera, cualquier enlace directo o
  // recarga caía en "*" → /login → "/" y se perdía el destino: el
  // expediente, que tiene ruta propia justamente para compartirse por
  // enlace y sobrevivir a una recarga, siempre volvía al inicio (se vio el
  // 2026-10-10 al revisar las pantallas con la sesión de QA).
  if (cargandoSesion) return null;

  // Login y Crear cuenta se ven a pantalla completa: sin sesión no hay
  // menú que mostrar, y meterlas en el armazón dejaría una barra vacía.
  if (!session) {
    return (
      <main className="crediscope-main crediscope-main-suelto">
          <Routes>
            <Route path="/login" element={<Login avisoCaducidad={motivo ? MENSAJE_CADUCIDAD[motivo] : null} />} />
            {/* Sin "Crear cuenta" desde el 2026-10-09: con el registro
                abierto, cualquiera con un correo entraba como analista y
                leía la cartera entera (auditoría de seguridad). Las cuentas
                las da de alta el admin por invitación. */}
            {/* El destino viaja en el estado de la navegación: al ingresar
                (o al volver tras caducar la sesión) la persona retoma lo
                que estaba mirando. */}
            <Route path="*" element={<Navigate to="/login" replace state={{ desde: sePuedeRecordarElDestino() ? `${pathname}${search}${hash}` : null }} />} />
          </Routes>
      </main>
    );
  }

  // El menú depende del rol: dibujarlo antes de tener el perfil lo mostraba
  // sin las secciones de administración y a los segundos las sumaba de golpe.
  if (cargandoPerfil) return <Cargando pantalla />;

  return (
    <div className="crediscope-shell">
      <MenuLateral profile={profile} />
      <div className="crediscope-contenido">
        <header className="crediscope-topbar">
          <Ubicacion />
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
        {/* La pantalla que falla no se lleva el resto: el límite se
            reinicia al cambiar de ruta. */}
        <LimiteDeError key={pathname}>
        <Suspense fallback={<Cargando pantalla />}>
        <Routes>
          {/* Con sesión activa, Login y Crear cuenta no tienen nada que
              hacer: mostrarlas acá dibujaba el formulario de ingreso
              dentro de la aplicación, con el menú y el nombre del
              usuario ya visibles alrededor. Parecía que la sesión no
              valía, o peor, que se puede ver el sistema sin entrar.
              Quien ya entró y llega a /login va a donde iba. */}
          <Route path="/login" element={<Navigate to={destinoDeIngreso(state)} replace />} />
          <Route path="/explorar" element={<RequireAdmin><NovadataExplorer /></RequireAdmin>} />
          <Route path="/" element={<ClientSearch />} />
          <Route path="/perfil/:cedula" element={<PerfilCliente />} />
          <Route path="/analisis/:cedula" element={<AnalisisIA />} />
          <Route path="/ingresos/:cedula" element={<IngresosCliente />} />
          <Route path="/aval/:cedula" element={<PerfilAval />} />
          {/* La bandeja y el expediente. El expediente tiene ruta
              propia a propósito: se comparte por enlace, se abren
              varios en pestañas y sobrevive a recargar la página. */}
          <Route path="/solicitudes" element={<Solicitudes />} />
          <Route path="/solicitudes/:cedula" element={<Expediente />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/historial/perfil/:id" element={<HistorialPerfilDetalle />} />
          <Route path="/historial/analisis/:id" element={<HistorialAnalisisDetalle />} />
          <Route path="/reportes" element={<Reportes />} />
          {/* Bajar la cartera entera en un archivo no es leer un
              cliente: son miles de personas con Fiscalía, Función Judicial
              y comportamiento bancario adentro, en un archivo que sale
              del sistema y ya no vuelve. Administración. */}
          <Route path="/reportes/descargas" element={<RequireAdmin><Descargas /></RequireAdmin>} />
          {/* Consultas por lote: cargar un archivo con miles de cédulas
              y consultarlas es otro nivel de exposición que buscar un
              cliente a la vez. Administración, en la ruta y en la
              política de la base (058). */}
          <Route path="/lotes" element={<RequireAdmin><Lotes /></RequireAdmin>} />
          <Route path="/lotes/nuevo" element={<RequireAdmin><LoteNuevo /></RequireAdmin>} />
          <Route path="/lotes/:id" element={<RequireAdmin><LoteDetalle /></RequireAdmin>} />
          {/* Costos es solo para administración: no es un dato
              operativo, es el margen del negocio. La política de la
              base también lo restringe (046), así que ocultar el link
              no es la única defensa. */}
          <Route path="/costos" element={<RequireAdmin><Costos /></RequireAdmin>} />
          <Route path="/costos/consultas" element={<RequireAdmin><CostosConsultas /></RequireAdmin>} />
          <Route path="/costos/corridas" element={<RequireAdmin><CostosCorridas /></RequireAdmin>} />
          <Route path="/costos/llamadas" element={<RequireAdmin><CostosLlamadas /></RequireAdmin>} />
          <Route path="/costos/incidentes" element={<RequireAdmin><CostosIncidentes /></RequireAdmin>} />
          <Route path="/costos/avisos" element={<RequireAdmin><CostosAvisos /></RequireAdmin>} />
          <Route path="/costos/tarifas" element={<RequireAdmin><CostosTarifas /></RequireAdmin>} />
          <Route path="/fuentes" element={<FuentesIngreso />} />
          <Route path="/fuentes/clientes" element={<FuentesClientes />} />
          <Route path="/fuentes/reglas" element={<FuentesReglas />} />
          <Route path="/fuentes/parametros" element={<RequireAdmin><FuentesParametros /></RequireAdmin>} />
          {/* El Laboratorio reemplaza a Retroalimentación (2026-10-03); las
              direcciones viejas llevan a las nuevas. */}
          <Route path="/retroalimentacion" element={<Navigate to="/laboratorio" replace />} />
          <Route path="/retroalimentacion/versiones" element={<Navigate to="/laboratorio/propuestas" replace />} />
          <Route path="/retroalimentacion/*" element={<Navigate to="/laboratorio" replace />} />
          <Route path="/laboratorio" element={<RequireAdmin><Laboratorio /></RequireAdmin>} />
          <Route path="/laboratorio/cargas/nueva" element={<RequireAdmin><LaboratorioCargaNueva /></RequireAdmin>} />
          <Route path="/laboratorio/cargas/:id" element={<RequireAdmin><LaboratorioCarga /></RequireAdmin>} />
          <Route path="/laboratorio/cortes/nuevo" element={<RequireAdmin><LaboratorioCorteNuevo /></RequireAdmin>} />
          <Route path="/laboratorio/cortes/:id" element={<RequireAdmin><LaboratorioCorte /></RequireAdmin>} />
          <Route path="/laboratorio/propuestas" element={<RequireAdmin><LaboratorioPropuestas /></RequireAdmin>} />
          {/* El criterio vigente (ajustes sumados al marco) se retiró el 2026-10-06. */}
          <Route path="/laboratorio/criterio" element={<Navigate to="/laboratorio/propuestas" replace />} />
          <Route path="/laboratorio/datos" element={<RequireAdmin><LaboratorioDatos /></RequireAdmin>} />
          <Route path="/laboratorio/desempeno" element={<RequireAdmin><LaboratorioDesempeno /></RequireAdmin>} />
          <Route path="/laboratorio/estadistica" element={<RequireAdmin><LaboratorioEstadistica /></RequireAdmin>} />
          <Route path="/laboratorio/profundo" element={<RequireAdmin><LaboratorioProfundo /></RequireAdmin>} />
          <Route path="/laboratorio/caso" element={<RequireAdmin><LaboratorioCaso /></RequireAdmin>} />
          <Route path="/laboratorio/instituciones" element={<RequireAdmin><LaboratorioInstituciones /></RequireAdmin>} />
          <Route path="/admin/fuentes" element={<Navigate to="/admin/fuentes/novadata" replace />} />
          <Route path="/admin/fuentes/novadata" element={<RequireAdmin><ConfigFuentes /></RequireAdmin>} />
          <Route path="/admin/fuentes/aval" element={<RequireAdmin><ConfigFuentesAval /></RequireAdmin>} />
          <Route path="/admin/campos" element={<Navigate to="/admin/campos/novadata" replace />} />
          <Route path="/admin/campos/novadata" element={<RequireAdmin><ConfigCampos /></RequireAdmin>} />
          <Route path="/admin/campos/aval" element={<RequireAdmin><ConfigCamposAval /></RequireAdmin>} />
          {/* Tres pantallas y no una (ver MenuLateral.jsx): ocultar un
              segmento sólo cambia lo que se ve. */}
          <Route path="/admin/segmentos" element={<RequireAdmin><ConfigSegmentos /></RequireAdmin>} />
          {/* La ruta vieja sigue viva: había enlaces y marcadores
              apuntando acá antes de que fueran tres pantallas. */}
          <Route path="/admin/configuracion" element={<Navigate to="/admin/fuentes" replace />} />
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
        </Suspense>
        </LimiteDeError>
        </main>
      </div>
    </div>
  );
}
