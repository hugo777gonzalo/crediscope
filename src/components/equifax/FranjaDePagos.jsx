import { useState } from "react";
import { CalendarClock } from "lucide-react";
import InfoTooltip from "../InfoTooltip.jsx";
import { TituloTarjeta } from "../reporte/Piezas.jsx";
import { entero, plural, mesAnio } from "../../lib/formatos.js";
import { NIVELES_DE_MORA } from "../../lib/equifaxPantalla.js";

// Cómo pagó mes a mes, en una franja: lo que Proveedor_Info_1 no trae y lo más
// informativo de Equifax (docs/propuesta-marco-equifax.md, sección 3). Los
// contadores salen de la estructura; la franja, de la historia mensual.
//
// Se cuenta por mes y no por operación: una operación no se puede seguir de
// un mes al otro (las listas de Equifax no traen su número; 2026-10-13).
function descripcionDelMes(m) {
  if (m.nivel === "sin_deuda") return `${m.texto}: sin deuda como titular`;
  if (m.enMora === 0) return `${m.texto}: al día (${plural(m.operaciones, "operación", "operaciones")})`;
  return `${m.texto}: ${plural(m.enMora, "operación", "operaciones")} con atraso, la más atrasada con ${plural(m.peorDias, "día", "días")}`;
}

export default function FranjaDePagos({ conducta, franja }) {
  // El mes que se describe debajo: el último, hasta que se señale otro.
  const [elegido, setElegido] = useState(null);
  const mesElegido = franja.find((m) => m.mes === elegido) ?? franja[franja.length - 1] ?? null;
  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={CalendarClock}>
        Cómo pagó en los últimos 24 meses
        <InfoTooltip etiqueta="Cómo leer la franja">
          Cada cuadro es un mes, del más viejo (izquierda) al último reportado (derecha). El color es el atraso de la
          operación más atrasada de ese mes, entre todo lo que debe como titular. Señalá o tocá un mes para ver su
          detalle debajo de la franja.
        </InfoTooltip>
      </TituloTarjeta>

      {conducta ? (
        <dl className="crediscope-equifax-resumen-pagos">
          <div>
            <dt>Meses con atraso</dt>
            <dd className={conducta.mesesConMoraEnLosUltimos24 > 0 ? "crediscope-aval-malo" : undefined}>
              {entero(conducta.mesesConMoraEnLosUltimos24)} de {entero(conducta.mesesObservados)}
            </dd>
          </div>
          <div>
            <dt>Con más de 90 días</dt>
            <dd className={conducta.mesesConMoraDeMasDe90Dias > 0 ? "crediscope-aval-malo" : undefined}>
              {plural(conducta.mesesConMoraDeMasDe90Dias, "mes", "meses")}
            </dd>
          </div>
          <div>
            <dt>Atraso más largo</dt>
            <dd>{conducta.maximoDiasDeMoraEnLosUltimos24 ? plural(conducta.maximoDiasDeMoraEnLosUltimos24, "día", "días") : "Ninguno"}</dd>
          </div>
          <div>
            <dt>Último atraso</dt>
            <dd>{conducta.fechaDeLaUltimaMora ? mesAnio(String(conducta.fechaDeLaUltimaMora).slice(0, 7)) : "Ninguno"}</dd>
          </div>
        </dl>
      ) : null}

      {franja.length > 0 ? (
        <>
          <ol className="crediscope-equifax-franja" aria-label="Atraso de cada mes, de los últimos 24">
            {franja.map((m) => (
              <li
                key={m.mes}
                className={`crediscope-equifax-mes crediscope-equifax-mes-${m.nivel}`}
                aria-label={descripcionDelMes(m)}
                aria-current={mesElegido?.mes === m.mes ? "true" : undefined}
                onMouseEnter={() => setElegido(m.mes)}
                onClick={() => setElegido(m.mes)}
              />
            ))}
          </ol>
          <div className="crediscope-equifax-franja-meses" aria-hidden="true">
            <span>{franja[0].texto}</span>
            <span>{franja[12]?.texto}</span>
            <span>{franja[franja.length - 1].texto}</span>
          </div>
          <p className="crediscope-equifax-mes-detalle" aria-live="polite">
            {mesElegido ? descripcionDelMes(mesElegido) : null}
          </p>
          <ul className="crediscope-equifax-leyenda">
            {NIVELES_DE_MORA.map((n) => (
              <li key={n.clave}>
                <span className={`crediscope-equifax-mes crediscope-equifax-mes-${n.clave}`} aria-hidden="true" />
                {n.texto}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="crediscope-muted">Equifax no trajo la historia mensual en esta consulta.</p>
      )}
    </div>
  );
}
