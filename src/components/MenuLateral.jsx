import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Home,
  ClipboardCheck,
  FileStack,
  BarChart3,
  FlaskConical,
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
import { seccionesVisibles, hijosVisibles, seccionActiva, hijoActivo } from "../lib/navegacion.js";

// Menú lateral. Reemplaza a la barra superior de enlaces: con 6
// secciones y submenús, en horizontal ya no entraba sin apretujar todo.
//
// Las secciones, sus nombres y qué queda resaltado salen de
// lib/navegacion.js: la barra superior lee la misma lista, así que el menú
// y el título de la página no pueden decir cosas distintas.
//
// Se puede colapsar a solo iconos con el botón de la cabecera, y la
// preferencia se recuerda en este navegador -- un analista que trabaja
// todo el día en Evaluación Crediticia gana ancho útil para las
// tarjetas del análisis.
//
// Perfil del Cliente, Análisis con IA y Aval necesitan una cédula: llevan
// a la del último cliente visto en este navegador (ver ultimaCedula.js) o
// a la búsqueda del inicio si todavía no hay ninguno.
//
// Los tres interruptores de Configuración son pantallas distintas a
// propósito: se parecen y tienen consecuencias distintas. Apagar una
// fuente deja de consultar el dato; apagar un campo lo guarda pero lo saca
// del criterio; ocultar un segmento solo cambia lo que se ve. Mezclarlas
// invitaba a apagar una creyendo que se apagaba otra.

const CLAVE_COLAPSADO = "crediscope.menu.colapsado";

const ICONOS = {
  inicio: Home,
  evaluacion: ClipboardCheck,
  solicitudes: FileStack,
  fuentes: Wallet,
  reportes: BarChart3,
  lotes: Layers,
  costos: Receipt,
  laboratorio: FlaskConical,
  configuracion: Settings,
};

function leerColapsado() {
  try {
    return localStorage.getItem(CLAVE_COLAPSADO) === "1";
  } catch {
    return false;
  }
}

function Item({ to, Icono, texto, activo, colapsado }) {
  return (
    <Link
      to={to}
      className={`crediscope-menu-item ${activo ? "crediscope-menu-item-activo" : ""}`}
      title={colapsado ? texto : undefined}
      aria-label={texto}
      aria-current={activo ? "page" : undefined}
    >
      <Icono size={19} aria-hidden="true" />
      {!colapsado ? <span>{texto}</span> : null}
    </Link>
  );
}

// Sección con subsecciones. Colapsado el menú, el grupo no despliega
// nada: primero lo expande, que es lo que el usuario quería al hacer
// clic en un rubro que no puede leer.
function Grupo({ Icono, texto, activo, abierto, alternar, colapsado, expandirMenu, hijos }) {
  return (
    <div>
      <button
        type="button"
        className={`crediscope-menu-item crediscope-menu-grupo ${activo ? "crediscope-menu-item-activo" : ""}`}
        onClick={() => (colapsado ? expandirMenu() : alternar())}
        title={colapsado ? texto : undefined}
        aria-label={texto}
        aria-expanded={abierto}
      >
        <Icono size={19} aria-hidden="true" />
        {!colapsado ? (
          <>
            <span>{texto}</span>
            <ChevronDown size={15} aria-hidden="true" className={`crediscope-menu-chevron ${abierto ? "crediscope-menu-chevron-abierto" : ""}`} />
          </>
        ) : null}
      </button>
      {!colapsado && abierto ? (
        <div className="crediscope-menu-sub">
          {hijos.map(({ to, texto: textoHijo, activo: activoHijo, ayuda }) => (
            <Link key={to + textoHijo} to={to} title={ayuda} className={activoHijo ? "crediscope-menu-sub-activo" : ""} aria-current={activoHijo ? "page" : undefined}>
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
  const ultimaCedula = getUltimaCedula();
  const admin = esAdmin(profile);

  // Una sección abierta a la vez. Entrar a otra desde cualquier lado (el
  // menú, un enlace directo, un botón de una pantalla) abre la suya: antes
  // quedaba cerrada con su nombre resaltado y las opciones escondidas.
  const idActiva = seccionesVisibles(admin).find((s) => s.hijos && seccionActiva(s, pathname))?.id ?? null;
  const [abiertaId, setAbiertaId] = useState(idActiva);
  useEffect(() => {
    setAbiertaId(idActiva);
  }, [idActiva]);

  // Los enlaces de una sección. Los que necesitan un cliente llevan al último
  // visto, o a la búsqueda del inicio si todavía no hay ninguno (y lo dicen).
  const enlacesDe = (seccion) =>
    hijosVisibles(seccion, admin).map((h) => ({
      to: h.conCedula ? (ultimaCedula ? `${h.ruta}/${ultimaCedula}` : "/") : h.ruta,
      texto: h.texto,
      activo: hijoActivo(h, pathname),
      ayuda: h.conCedula && !ultimaCedula ? "Primero buscá una persona en Inicio" : undefined,
    }));
  const seccionAbierta = seccionesVisibles(admin).find((s) => s.hijos && s.id === abiertaId) ?? null;

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
          {colapsado ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
        </button>
      </div>

      <nav className="crediscope-menu-nav" aria-label="Menú principal">
        {seccionesVisibles(admin).map((seccion) => {
          const Icono = ICONOS[seccion.id];
          const activa = seccionActiva(seccion, pathname);
          if (!seccion.hijos) {
            return <Item key={seccion.id} to={seccion.ruta} Icono={Icono} texto={seccion.texto} activo={activa} colapsado={colapsado} />;
          }
          return (
            <Grupo
              key={seccion.id}
              Icono={Icono}
              texto={seccion.texto}
              activo={activa}
              abierto={abiertaId === seccion.id}
              alternar={() => setAbiertaId((actual) => (actual === seccion.id ? null : seccion.id))}
              colapsado={colapsado}
              expandirMenu={() => {
                setColapsado(false);
                setAbiertaId(seccion.id);
              }}
              hijos={enlacesDe(seccion)}
            />
          );
        })}
      </nav>

      {/* Sólo se ve en pantallas angostas (ver index.css): ahí el menú es una
          franja de íconos y las opciones de la sección abierta van acá, en
          una segunda fila. En escritorio las muestra el propio grupo. */}
      {seccionAbierta ? (
        <div className="crediscope-menu-subbarra" role="navigation" aria-label={`Opciones de ${seccionAbierta.texto}`}>
          <span className="crediscope-menu-subbarra-titulo">{seccionAbierta.texto}</span>
          {enlacesDe(seccionAbierta).map(({ to, texto, activo, ayuda }) => (
            <Link key={to + texto} to={to} title={ayuda} aria-current={activo ? "page" : undefined}>
              {texto}
            </Link>
          ))}
        </div>
      ) : null}
    </aside>
  );
}
