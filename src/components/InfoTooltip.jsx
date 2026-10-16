import { useEffect, useId, useRef, useState } from "react";
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
// `lado` corre la burbuja hacia adentro cuando el ícono está cerca de un
// borde (la burbuja centrada se salía de la tarjeta en la columna derecha).
export default function InfoTooltip({ texto, children, lado = "centro", etiqueta = "Más información" }) {
  const id = useId();
  const [abierta, setAbierta] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierta) return undefined;
    const fuera = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setAbierta(false);
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierta]);

  return (
    <span
      ref={ref}
      className={`crediscope-tooltip-wrap crediscope-tooltip-${lado} ${abierta ? "crediscope-tooltip-abierta" : ""}`}
    >
      <button
        type="button"
        className="crediscope-tooltip-boton"
        aria-label={etiqueta}
        aria-describedby={id}
        aria-expanded={abierta}
        onClick={() => setAbierta((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setAbierta(false);
        }}
      >
        <Info size={15} aria-hidden="true" />
      </button>
      <span role="tooltip" id={id} className="crediscope-tooltip-bubble">
        {children ?? texto}
      </span>
    </span>
  );
}
