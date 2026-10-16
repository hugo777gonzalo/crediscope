import Kpi from "../ui/Kpi.jsx";
import InfoTooltip from "../InfoTooltip.jsx";
import { entero, moneda, decimal, plural } from "../../lib/formatos.js";
import { enAtraso, nivelLegible } from "../../lib/equifaxPantalla.js";

// Los cuatro números que deciden si vale la pena bajar al detalle. El score
// de Equifax va con su nombre completo y sin el medidor del Score de
// CrediScope: el negocio pidió que nunca se mezclen (cuestionario, A6).
export default function IndicadoresEquifax({ estructura }) {
  const s = estructura?.scores ?? {};
  const total = estructura?.deudaActualTitular?.total ?? null;
  const mora = estructura?.moraActual ?? null;
  const atraso = enAtraso(total);
  const variacion = s.variacionDelScore12Meses;

  return (
    <div className="crediscope-kpi-grid">
      <Kpi
        etiqueta={
          <>
            Score de Equifax{" "}
            <InfoTooltip etiqueta="Qué es el Score de Equifax">
              La calificación que calcula Equifax con su propio modelo. No es el Score de CrediScope: no se suman ni
              se comparan uno con otro.
              {s.bandaDelScoreEquifaxDesde != null && s.bandaDelScoreEquifaxHasta != null
                ? ` Equifax ubica a esta persona en la banda de ${entero(s.bandaDelScoreEquifaxDesde)} a ${entero(s.bandaDelScoreEquifaxHasta)}.`
                : ""}
            </InfoTooltip>
          </>
        }
        valor={s.scoreEquifax ?? "Sin score"}
        detalle={
          s.scoreEquifaxHace12Meses != null ? (
            <>
              Hace 12 meses: {entero(s.scoreEquifaxHace12Meses)}
              {variacion ? (
                <span className={variacion < 0 ? "crediscope-equifax-baja" : "crediscope-equifax-sube"}>
                  {" "}
                  · {variacion < 0 ? "bajó" : "subió"} {entero(Math.abs(variacion))}
                </span>
              ) : (
                " · igual"
              )}
            </>
          ) : (
            "Sin el de hace 12 meses"
          )
        }
      />
      <Kpi
        etiqueta="Deuda como titular"
        valor={moneda(total?.saldoDeudaUsd)}
        detalle={
          total && total.numeroDeOperaciones > 0
            ? `${plural(total.numeroDeOperaciones, "operación", "operaciones")} en ${plural(total.institucionesDistintas, "institución", "instituciones")}`
            : "No tiene deuda como titular"
        }
      />
      <Kpi
        etiqueta={
          <>
            En atraso hoy{" "}
            <InfoTooltip etiqueta="Qué cuenta como atraso">
              Lo vencido, lo que ya no devenga intereses, lo que está en demanda judicial y la cartera castigada, de lo
              que debe como titular. El detalle por sistema está en «Cuánto debe como titular».
            </InfoTooltip>
          </>
        }
        valor={moneda(atraso)}
        color={atraso > 0 ? "var(--bad)" : undefined}
        detalle={
          atraso > 0
            ? `${decimal(mora?.porcentajeDeLaDeudaVencida, 1)}% de su deuda está vencida · máximo ${plural(mora?.maximoDiasDeMora ?? 0, "día", "días")} de mora`
            : "Nada vencido como titular"
        }
      />
      <Kpi
        etiqueta={
          <>
            Cuota mensual{" "}
            <InfoTooltip lado="derecha" etiqueta="De dónde sale la cuota">
              La suma de las cuotas que informan las instituciones por lo que debe como titular, en los tres sistemas.
              {s.nivelDeSobreendeudamiento
                ? ` Equifax califica su nivel de sobreendeudamiento como «${nivelLegible(s.nivelDeSobreendeudamiento)}».`
                : ""}
            </InfoTooltip>
          </>
        }
        valor={moneda(total?.cuotaMensualUsd)}
        detalle={s.nivelDeSobreendeudamiento ? `Sobreendeudamiento según Equifax: ${nivelLegible(s.nivelDeSobreendeudamiento)}` : null}
      />
    </div>
  );
}
