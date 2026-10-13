import { Component } from "react";
import AvisoDeError from "./AvisoDeError.jsx";

// Si una pantalla falla al dibujarse, que sea sólo esa pantalla.
//
// Hasta el 2026-10-10 la aplicación no tenía ningún límite de error: una
// excepción al dibujar cualquier pestaña del Laboratorio dejaba TODA la
// página en blanco, menú incluido, y la persona no tenía ni cómo volver.
//
// El caso que más se va a ver es otro: las pantallas se cargan por partes
// (React.lazy), y si se publica una versión nueva mientras alguien tiene la
// aplicación abierta, el archivo de la pantalla que pide ya no existe. Eso no
// es un error de la pantalla: es una versión vieja abierta, y se arregla
// recargando.

const CARGA_FALLIDA = /dynamically imported module|importing a module script failed|failed to fetch dynamically|error loading dynamically/i;

export default class LimiteDeError extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Una pantalla falló al dibujarse:", error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const versionNueva = CARGA_FALLIDA.test(String(error?.message ?? error));
    return (
      <AvisoDeError
        titulo={versionNueva ? "Hay una versión nueva de CrediScope" : "Esta pantalla tuvo un problema"}
        mensaje={
          versionNueva
            ? "Se publicó una actualización mientras tenías esta página abierta. Recargá para seguir trabajando."
            : "Lo demás sigue funcionando: podés volver al inicio o recargar. Si se repite, avisá a quien administra el sistema."
        }
        detalle={String(error?.stack ?? error?.message ?? error).slice(0, 1200)}
      >
        <p style={{ margin: "10px 0 0", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="crediscope-btn" onClick={() => window.location.reload()}>
            Recargar
          </button>
          <a className="crediscope-btn crediscope-btn-ghost" href={import.meta.env.BASE_URL}>
            Ir al inicio
          </a>
        </p>
      </AvisoDeError>
    );
  }
}
