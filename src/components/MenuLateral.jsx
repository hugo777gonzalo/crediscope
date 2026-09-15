import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  ClipboardCheck,
  FileStack,
  BarChart3,
  MessageSquareReply,
  Settings,
  Wallet,
  Receipt,
  Layers,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
} from "lucide-react";
import LogoMark from "./LogoMark.jsx";
import { getUltimaCedula } from "../lib/ultimaCedula.js";
import { esAdmin } from "../lib/useProfile.js";

// Menú lateral. Reemplaza a la barra superior de enlaces: con 6
// secciones y submenús, en horizontal ya no entraba sin apretujar todo.
//
// Se puede colapsar a solo iconos con el botón de la cabecera, y la
// preferencia se recuerda en este navegador -- un analista que trabaja
// todo el día en Evaluación Crediticia gana ancho útil para las
// tarjetas del análisis.
//
// Perfil del Cliente y Análisis con IA necesitan una cédula: llevan a
// la del último cliente visto en este navegador (ver ultimaCedula.js) o
// a Buscar Cliente si todavía no hay ninguno.

const CLAVE_COLAPSADO = "crediscope.menu.colapsado";

function leerColapsado() {
  try {
    return localStorage.getItem(CLAVE_COLAPSADO) === "1";
  } catch {
    return false;
  }
}

function Item({ to, Icono, texto, activo, colapsado, onClick }) {
  return (
    <Link to={to} className={`crediscope-menu-item ${activo ? "crediscope-menu-item-activo" : ""}`} title={colapsado ? texto : undefined} onClick={onClick}>
      <Icono size={19} />
      {!colapsado ? <span>{texto}</span> : null}
    </Link>
  );
}

// Sección con subsecciones. Colapsado el menú, el grupo no despliega
// nada: primero lo expande, que es lo que el usuario quería al hacer
// clic en un rubro que no puede leer.
function Grupo({ Icono, texto, activo, colapsado, expandirMenu, hijos }) {
  const [abierto, setAbierto] = useState(activo);

  return (
    <div>
      <button
        type="button"
        className={`crediscope-menu-item crediscope-menu-grupo ${activo ? "crediscope-menu-item-activo" : ""}`}
        onClick={() => (colapsado ? expandirMenu() : setAbierto((v) => !v))}
        title={colapsado ? texto : undefined}
        aria-expanded={abierto}
      >
        <Icono size={19} />
        {!colapsado ? (
          <>
            <span>{texto}</span>
            <ChevronDown size={15} className={`crediscope-menu-chevron ${abierto ? "crediscope-menu-chevron-abierto" : ""}`} />
          </>
        ) : null}
      </button>
      {!colapsado && abierto ? (
        <div className="crediscope-menu-sub">
          {hijos.map(({ to, texto: textoHijo, activo: activoHijo }) => (
            <Link key={to} to={to} className={activoHijo ? "crediscope-menu-sub-activo" : ""}>
              {textoHijo}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function MenuLateral({ profile }) {
  const { pathname } = useLocation();
  const [colapsado, setColapsado] = useState(leerColapsado);
  const enEvaluacion = pathname === "/" || pathname.startsWith("/perfil") || pathname.startsWith("/analisis");
  const ultimaCedula = getUltimaCedula();
  const admin = esAdmin(profile);

  function alternarColapso() {
    setColapsado((v) => {
      const nuevo = !v;
      try {
        localStorage.setItem(CLAVE_COLAPSADO, nuevo ? "1" : "0");
      } catch {
        // sin localStorage (modo privado): el estado vive solo en la sesión
      }
      return nuevo;
    });
  }

  return (
    <aside className={`crediscope-menu ${colapsado ? "crediscope-menu-colapsado" : ""}`}>
      <div className="crediscope-menu-cabecera">
        <Link to="/" className="crediscope-brand" title="CrediScope">
          <LogoMark size={26} />
          {!colapsado ? <span>CrediScope</span> : null}
        </Link>
        <button
          type="button"
          className="crediscope-menu-toggle"
          onClick={alternarColapso}
          title={colapsado ? "Expandir menú" : "Colapsar menú"}
          aria-label={colapsado ? "Expandir menú" : "Colapsar menú"}
        >
          {colapsado ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <nav className="crediscope-menu-nav">
        <Item to="/" Icono={Home} texto="Inicio" activo={pathname === "/"} colapsado={colapsado} />

        <Grupo
          Icono={ClipboardCheck}
          texto="Evaluación Crediticia"
          activo={enEvaluacion}
          colapsado={colapsado}
          expandirMenu={() => setColapsado(false)}
          hijos={[
            { to: "/", texto: "Buscar Cliente", activo: pathname === "/" },
            { to: ultimaCedula ? `/perfil/${ultimaCedula}` : "/", texto: "Perfil del Cliente", activo: pathname.startsWith("/perfil") },
            { to: ultimaCedula ? `/analisis/${ultimaCedula}` : "/", texto: "Análisis con IA", activo: pathname.startsWith("/analisis") },
          ]}
        />

        <Item to="/historial" Icono={FileStack} texto="Solicitudes" activo={pathname.startsWith("/historial")} colapsado={colapsado} />

        <Grupo
          Icono={Wallet}
          texto="Fuentes de Ingreso"
          activo={pathname.startsWith("/fuentes")}
          colapsado={colapsado}
          expandirMenu={() => setColapsado(false)}
          hijos={[
            { to: "/fuentes", texto: "Panorama", activo: pathname === "/fuentes" },
            { to: "/fuentes/clientes", texto: "Clientes por segmento", activo: pathname.startsWith("/fuentes/clientes") },
            { to: "/fuentes/reglas", texto: "Reglas", activo: pathname.startsWith("/fuentes/reglas") },
            ...(admin ? [{ to: "/fuentes/parametros", texto: "Parámetros", activo: pathname.startsWith("/fuentes/parametros") }] : []),
          ]}
        />

        <Grupo
          Icono={BarChart3}
          texto="Reportes"
          activo={pathname.startsWith("/reportes")}
          colapsado={colapsado}
          expandirMenu={() => setColapsado(false)}
          hijos={[
            { to: "/reportes", texto: "Inteligencia de Negocios", activo: pathname === "/reportes" },
            { to: "/reportes/descargas", texto: "Descargas", activo: pathname.startsWith("/reportes/descargas") },
          ]}
        />

        {admin ? (
          <>
            <Grupo
              Icono={Layers}
              texto="Consultas por lote"
              activo={pathname.startsWith("/lotes")}
              colapsado={colapsado}
              expandirMenu={() => setColapsado(false)}
              hijos={[
                { to: "/lotes", texto: "Lotes corridos", activo: pathname === "/lotes" },
                { to: "/lotes/nuevo", texto: "Cargar archivo", activo: pathname.startsWith("/lotes/nuevo") },
              ]}
            />

            <Grupo
              Icono={Receipt}
              texto="Costos"
              activo={pathname.startsWith("/costos")}
              colapsado={colapsado}
              expandirMenu={() => setColapsado(false)}
              hijos={[
                { to: "/costos", texto: "Panorama", activo: pathname === "/costos" },
                { to: "/costos/consultas", texto: "Costo por consulta", activo: pathname.startsWith("/costos/consultas") },
                { to: "/costos/corridas", texto: "Corridas masivas", activo: pathname.startsWith("/costos/corridas") },
                { to: "/costos/llamadas", texto: "Detalle de llamadas", activo: pathname.startsWith("/costos/llamadas") },
                { to: "/costos/incidentes", texto: "Fallas e incidentes", activo: pathname.startsWith("/costos/incidentes") },
                { to: "/costos/avisos", texto: "Avisos", activo: pathname.startsWith("/costos/avisos") },
                { to: "/costos/tarifas", texto: "Tarifas", activo: pathname.startsWith("/costos/tarifas") },
              ]}
            />
            <Item
              to="/retroalimentacion"
              Icono={MessageSquareReply}
              texto="Retroalimentación"
              activo={pathname.startsWith("/retroalimentacion")}
              colapsado={colapsado}
            />
            <Item
              to="/admin/configuracion"
              Icono={Settings}
              texto="Configuración"
              activo={pathname.startsWith("/admin") || pathname.startsWith("/explorar")}
              colapsado={colapsado}
            />
            {!colapsado && (pathname.startsWith("/admin") || pathname.startsWith("/explorar")) ? (
              <div className="crediscope-menu-sub">
                <Link to="/admin/configuracion" className={pathname.startsWith("/admin") ? "crediscope-menu-sub-activo" : ""}>
                  Parámetros
                </Link>
                <Link to="/explorar" className={pathname.startsWith("/explorar") ? "crediscope-menu-sub-activo" : ""}>
                  Explorador de Fuentes
                </Link>
              </div>
            ) : null}
          </>
        ) : null}
      </nav>
    </aside>
  );
}
