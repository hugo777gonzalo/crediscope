import { useEffect, useRef, useState } from "react";
import {
  marcarActividad,
  motivoDeCaducidad,
  cerrarPorCaducidad,
  iniciarSesionVigilada,
} from "./caducidadSesion.js";

// Vigila la sesión mientras hay alguien adentro.
//
// Se revisa por reloj y no al navegar: la pantalla puede quedar abierta
// horas en la misma vista, que es justamente el caso que preocupa.
//
// Los escuchas van en `passive` para no interferir con el
// desplazamiento, y la actividad se anota como mucho una vez cada medio
// minuto: escribir en un formulario dispara decenas de eventos por
// segundo y no hace falta anotarlos todos.
//
// Devuelve el motivo por el que se cerró, para que la pantalla de
// ingreso lo explique. Sacar a alguien sin decirle por qué se siente
// como una falla del sistema.

const REVISAR_CADA_MS = 30_000;
const ANOTAR_CADA_MS = 30_000;
const EVENTOS = ["pointerdown", "keydown", "scroll", "focus"];

export function useCaducidadSesion(haySesion) {
  const [motivo, setMotivo] = useState(null);
  const ultimaAnotacion = useRef(0);

  useEffect(() => {
    if (!haySesion) return undefined;

    // Adopta la sesión que ya estaba abierta y arranca los relojes si
    // todavía no existen.
    if (motivoDeCaducidad() === null) marcarActividad();

    function anotar() {
      const ahora = Date.now();
      if (ahora - ultimaAnotacion.current < ANOTAR_CADA_MS) return;
      ultimaAnotacion.current = ahora;
      marcarActividad();
    }

    for (const ev of EVENTOS) window.addEventListener(ev, anotar, { passive: true });

    async function revisar() {
      const m = motivoDeCaducidad();
      if (!m) return;
      setMotivo(m);
      await cerrarPorCaducidad();
    }

    // Al volver a una pestaña dormida el intervalo pudo no haber
    // corrido: se revisa también al recuperar visibilidad.
    document.addEventListener("visibilitychange", revisar);
    const reloj = setInterval(revisar, REVISAR_CADA_MS);
    revisar();

    return () => {
      for (const ev of EVENTOS) window.removeEventListener(ev, anotar);
      document.removeEventListener("visibilitychange", revisar);
      clearInterval(reloj);
    };
  }, [haySesion]);

  return { motivo, olvidarMotivo: () => setMotivo(null), iniciarSesionVigilada };
}
