import { UserRound } from "lucide-react";
import ScoreGauge from "../ScoreGauge.jsx";
import { nombreCorto } from "../../lib/perfilClienteCampos.js";
import { bandaDeRiesgoAval, formatearValorAval, tieneScoreAval } from "../../lib/avalCampos.js";

// Quién es, qué score le da Aval y qué quiere decir ese score -- lo que el
// analista necesita antes de bajar a cualquier número.
//
// El score va UNA vez, acá. La maqueta lo repetía en un segundo medidor
// grande más abajo; el mismo número dicho dos veces no agrega nada y le
// quita lugar a lo que sí.
export default function EncabezadoAval({ cedula, estructura, ambiente, consultadaEl, vigencia, acciones }) {
  const score = estructura?.score;
  const conScore = tieneScoreAval(score);
  const banda = bandaDeRiesgoAval(score);
  const nombre = nombreCorto(estructura?.nombre);

  return (
    <div className={`crediscope-card crediscope-aval-cabecera ${estructura ? "" : "crediscope-aval-cabecera-sin-datos"}`}>
      <div className="crediscope-aval-persona">
        <span className="crediscope-aval-avatar" aria-hidden="true">
          <UserRound size={28} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="crediscope-aval-nombre" title={estructura?.nombre ?? undefined}>
            {nombre ?? "Sin consulta a Aval"}
          </div>
          <div className="crediscope-aval-cedula">{cedula}</div>
          {ambiente === "prueba" || estructura?.inhabilitadoCtaCte ? (
            <div className="crediscope-aval-etiquetas">
              {/* Ver migración 079: una fila de prueba no sirve para
                  calificar -- el ambiente de prueba llega a contestar con
                  el archivo de otra persona. Se dice en la cara, no en una
                  nota al pie. */}
              {ambiente === "prueba" ? (
                <span
                  className="crediscope-tag crediscope-tag-warn"
                  title="Esta consulta salió del ambiente de prueba de Aval: los datos son ficticios y no sirven para calificar a la persona."
                >
                  Ambiente de prueba
                </span>
              ) : null}
              {/* Cuentas corrientes quedó dentro del reporte total; una
                  inhabilitación no puede quedar escondida detrás de un
                  botón, así que sube acá. */}
              {estructura?.inhabilitadoCtaCte ? (
                <span
                  className="crediscope-tag crediscope-tag-bad"
                  title={[estructura.ctaCte_motivo, estructura.ctaCte_tiempoInhabilitado].filter(Boolean).join(" · ") || undefined}
                >
                  Inhabilitado para cuentas corrientes
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {estructura ? (
        <>
          <div>
            <ScoreGauge score={conScore ? score : null} size={140} leyendaSinScore="sin historial" />
          </div>

          <div className="crediscope-aval-riesgo">
            <span className={`crediscope-tag ${banda.clase}`}>{banda.etiqueta}</span>
            <p>
              {conScore && estructura.tasaMalos != null ? (
                <>
                  Aval estima un <strong>{formatearValorAval(estructura.tasaMalos, "decimal")}</strong> de probabilidad de caer
                  en vencido de más de 60 días en los próximos 12 meses.
                </>
              ) : conScore ? (
                "Aval no informó la probabilidad de caer en vencido para este score."
              ) : (
                "Aval no calculó un score: no registra operaciones de crédito suficientes para estimar el riesgo."
              )}
            </p>
          </div>
        </>
      ) : null}

      <div>
        {estructura ? (
          <dl className="crediscope-aval-datos">
            <dt>Tipo de score</dt>
            <dd>{estructura.tipoScore ?? "—"}</dd>
            <dt>Prob. de caer en vencido (12m)</dt>
            <dd>{conScore ? formatearValorAval(estructura.tasaMalos, "decimal") : "—"}</dd>
            {consultadaEl ? (
              <>
                <dt>Consultada el</dt>
                <dd>{consultadaEl}</dd>
              </>
            ) : null}
            {vigencia ? (
              <>
                <dt>Vigencia</dt>
                <dd className={vigencia.vigente ? undefined : "crediscope-aval-malo"}>{vigencia.texto}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {acciones ? <div className="crediscope-aval-acciones">{acciones}</div> : null}
      </div>
    </div>
  );
}
