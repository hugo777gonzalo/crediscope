import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  ClipboardCheck,
  FileStack,
  BarChart3,
  MessageSquareReply,
  Settings,
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

export default function MenuLateral({ profile }) {
  const { pathname } = useLocation();
  const [colapsado, setColapsado] = useState(leerColapsado);
  const enEvaluacion = pathname === "/" || pathname.startsWith("/perfil") || pathname.startsWith("/analisis");
  const [evaluacionAbierta, setEvaluacionAbierta] = useState(enEvaluacion);
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

        <div>
          <button
            type="button"
            className={`crediscope-menu-item crediscope-menu-grupo ${enEvaluacion ? "crediscope-menu-item-activo" : ""}`}
            onClick={() => (colapsado ? setColapsado(false) : setEvaluacionAbierta((v) => !v))}
            title={colapsado ? "Evaluación Crediticia" : undefined}
            aria-expanded={evaluacionAbierta}
          >
            <ClipboardCheck size={19} />
            {!colapsado ? (
              <>
                <span>Evaluación Crediticia</span>
                <ChevronDown size={15} className={`crediscope-menu-chevron ${evaluacionAbierta ? "crediscope-menu-chevron-abierto" : ""}`} />
              </>
            ) : null}
          </button>
          {!colapsado && evaluacionAbierta ? (
            <div className="crediscope-menu-sub">
              <Link to="/" className={pathname === "/" ? "crediscope-menu-sub-activo" : ""}>
                Buscar Cliente
              </Link>
              <Link to={ultimaCedula ? `/perfil/${ultimaCedula}` : "/"} className={pathname.startsWith("/perfil") ? "crediscope-menu-sub-activo" : ""}>
                Perfil del Cliente
              </Link>
              <Link to={ultimaCedula ? `/analisis/${ultimaCedula}` : "/"} className={pathname.startsWith("/analisis") ? "crediscope-menu-sub-activo" : ""}>
                Análisis con IA
              </Link>
            </div>
          ) : null}
        </div>

        <Item to="/historial" Icono={FileStack} texto="Solicitudes" activo={pathname.startsWith("/historial")} colapsado={colapsado} />
        <Item to="/reportes" Icono={BarChart3} texto="Reportes" activo={pathname.startsWith("/reportes")} colapsado={colapsado} />

        {admin ? (
          <>
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
