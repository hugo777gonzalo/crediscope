import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

// Ícono informativo con la explicación al pasar el mouse, al llegar con el
// teclado o al tocarlo -- reemplaza texto explicativo permanente en pantalla
// (ej. "consultado hace X días") por algo que sólo aparece cuando el analista
// lo pide. Pedido del negocio para la pestaña Equifax (2026-10-16): las
// explicaciones largas, en ayudas emergentes.
//
// Hasta el 2026-10-16 sólo se abría con el mouse: en un teléfono no había
// forma de leerla, y un lector de pantalla no la anunciaba. Ahora es un botón
// con su texto asociado (aria-describedby), se abre y se cierra al tocarlo y
// se cierra con Escape.
//
// La burbuja se dibuja fuera de la tarjeta (en el body, con posición fija) y
// se ubica dentro de la pantalla. Hasta el 2026-10-17 vivía dentro del ícono:
// debajo de 860 px las tarjetas desplazan lo que les sobra (overflow) y la
// recortaban, así que en un teléfono o una tableta la ayuda se abría sin
// verse -- medido a 768 en la pestaña Equifax: ni una de las once se leía.
// `lado` sigue diciendo hacia dónde prefiere abrirse.
const MARGEN = 8; // distancia mínima al borde de la pantalla
const SEPARACION = 8; // entre el ícono y la burbuja

export default function InfoTooltip({ texto, children, lado = "centro", etiqueta = "Más información" }) {
  const id = useId();
  const [abierta, setAbierta] = useState(false); // por toque o clic: queda hasta cerrarla
  const [encima, setEncima] = useState(false); // el mouse sobre el ícono o la burbuja
  const [foco, setFoco] = useState(false); // llegó con el teclado
  const [posicion, setPosicion] = useState(null);
  const ref = useRef(null);
  const burbujaRef = useRef(null);
  const salida = useRef(null);
  const visible = abierta || encima || foco;

  // Entre el ícono y la burbuja hay unos píxeles vacíos: sin la espera, la
  // burbuja se cerraba al ir a leerla con el mouse.
  const entrar = () => {
    clearTimeout(salida.current);
    setEncima(true);
  };
  const salir = () => {
    salida.current = setTimeout(() => setEncima(false), 150);
  };
  useEffect(() => () => clearTimeout(salida.current), []);

  const ubicar = useCallback(() => {
    const icono = ref.current?.getBoundingClientRect();
    const burbuja = burbujaRef.current?.getBoundingClientRect();
    if (!icono || !burbuja) return;
    const ancho = document.documentElement.clientWidth;
    let left =
      lado === "derecha" ? icono.right + 6 - burbuja.width
      : lado === "izquierda" ? icono.left - 6
      : icono.left + icono.width / 2 - burbuja.width / 2;
    left = Math.max(MARGEN, Math.min(left, ancho - MARGEN - burbuja.width));
    let top = icono.top - SEPARACION - burbuja.height;
    if (top < MARGEN) top = icono.bottom + SEPARACION; // sin lugar arriba, abajo
    setPosicion({ top: Math.round(top), left: Math.round(left) });
  }, [lado]);

  useLayoutEffect(() => {
    if (!visible) return undefined;
    ubicar();
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [visible, ubicar]);

  useEffect(() => {
    if (!abierta) return undefined;
    const fuera = (e) => {
      if (ref.current?.contains(e.target) || burbujaRef.current?.contains(e.target)) return;
      setAbierta(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierta]);

  return (
    <span
      ref={ref}
      className={`crediscope-tooltip-wrap crediscope-tooltip-${lado} ${visible ? "crediscope-tooltip-abierta" : ""}`}
      onPointerEnter={entrar}
      onPointerLeave={salir}
    >
      <button
        type="button"
        className="crediscope-tooltip-boton"
        aria-label={etiqueta}
        aria-describedby={id}
        aria-expanded={abierta}
        onClick={() => setAbierta((v) => !v)}
        onFocus={() => setFoco(true)}
        onBlur={() => setFoco(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setAbierta(false);
            setFoco(false);
            setEncima(false);
          }
        }}
      >
        <Info size={15} aria-hidden="true" />
      </button>
      {createPortal(
        <span
          ref={burbujaRef}
          role="tooltip"
          id={id}
          className={`crediscope-tooltip-bubble ${visible && posicion ? "crediscope-tooltip-visible" : ""}`}
          style={posicion ?? undefined}
          onPointerEnter={entrar}
          onPointerLeave={salir}
        >
          {children ?? texto}
        </span>,
        document.body,
      )}
    </span>
  );
}
