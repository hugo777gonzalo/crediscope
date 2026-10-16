import { useState } from "react";
import { Check } from "lucide-react";
import InfoTooltip from "./InfoTooltip.jsx";
import AvisoDeError from "./ui/AvisoDeError.jsx";
import { elegirBuro } from "../lib/api.js";
import { useBuro, olvidarBuro } from "../lib/useBuro.js";

// El buró de la institución (migración 129): uno solo por IFI, Equifax o Aval
// (cuestionario, A2, 2026-10-13). El negocio lo llamó «Buró» (2026-10-16).
// Va arriba en las pestañas de Aval y de Equifax de Configuración: es lo
// primero que hay que decidir de un buró.
//
// Elegirlo no prende ni apaga ninguna consulta (eso es el interruptor de cada
// fuente, más abajo) ni cambia lo que lee el modelo todavía: decide qué
// pestaña ve el analista en cada persona.
const OPCIONES = [
  { clave: "equifax", texto: "Equifax" },
  { clave: "aval", texto: "Aval" },
  { clave: null, texto: "Ninguno" },
];

export default function SelectorDeBuro() {
  const { buro, cargando } = useBuro();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function elegir(clave) {
    if (clave === buro) return;
    setGuardando(true);
    setError(null);
    try {
      await elegirBuro(clave);
      olvidarBuro();
    } catch (e) {
      setError(e);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="crediscope-card crediscope-selector-buro">
      <div className="crediscope-selector-buro-texto">
        <h3>
          Buró
          <InfoTooltip etiqueta="Qué es el buró de la institución">
            El buró de crédito con el que trabaja esta institución: uno solo. Decide qué pestaña ve el analista en cada
            persona (Equifax o Aval). No prende ni apaga ninguna consulta: eso se maneja en el interruptor de cada fuente.
          </InfoTooltip>
        </h3>
        <p className="crediscope-muted">El que usa esta institución para ver la deuda de cada persona.</p>
      </div>
      <div className="crediscope-selector-buro-opciones" role="radiogroup" aria-label="Buró de la institución">
        {OPCIONES.map((o) => {
          const elegida = !cargando && buro === o.clave;
          return (
            <button
              key={o.texto}
              type="button"
              role="radio"
              aria-checked={elegida}
              className={`crediscope-selector-buro-opcion ${elegida ? "crediscope-selector-buro-elegida" : ""}`}
              disabled={guardando || cargando}
              onClick={() => elegir(o.clave)}
            >
              {elegida ? <Check size={15} aria-hidden="true" /> : null}
              {o.texto}
            </button>
          );
        })}
      </div>
      {error ? <AvisoDeError error={error} /> : null}
    </div>
  );
}
