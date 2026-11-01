import { CreditCard, TrendingUp, Gauge, FileStack, Search, ShieldAlert, Store, Calculator } from "lucide-react";
import InfoTooltip from "../InfoTooltip.jsx";
import { TituloTarjeta } from "../reporte/Piezas.jsx";
import { entero, moneda, decimal, plural } from "../../lib/formatos.js";
import { formatearDia } from "../../lib/fechas.js";
import { estadoDeCarteraLegible, textoDeEquifaxLegible } from "../../lib/equifaxPantalla.js";

// El resto de lo que trae Equifax, plegado: sirve para entender el caso, pero
// no decide de un vistazo. Cada tarjeta dice si Equifax no trajo esa parte en
// esta consulta: un hueco se dice, no se rellena con ceros.
//
// Lo que ya está arriba no se repite acá (revisión del 2026-10-18): el Score
// de Equifax de hoy y el de hace 12 meses, y el nivel de sobreendeudamiento,
// están en los indicadores; la «cuota financiera estimada» de Equifax es la
// misma cifra que la cuota estimada de hoy (88 de 88 consultas), así que va
// una sola vez, en «Cómo cambió en un año».

const porcentajeDe100 = (n) => (typeof n === "number" ? `${decimal(n, 0)}%` : "—");
const siNo = (v) => (v === true ? "Sí" : v === false ? "No" : "—");

function Fila({ etiqueta, ayuda = null, children, alerta = false }) {
  return (
    <div className="crediscope-equifax-dato">
      <dt>
        {etiqueta}
        {ayuda ? <InfoTooltip etiqueta={`Qué es «${etiqueta}»`}>{ayuda}</InfoTooltip> : null}
      </dt>
      <dd className={alerta ? "crediscope-aval-malo" : undefined}>{children}</dd>
    </div>
  );
}

function Seccion({ Icono, titulo, ayuda = null, datos, lista = true, children }) {
  return (
    <div className="crediscope-card crediscope-equifax-seccion">
      <TituloTarjeta Icono={Icono}>
        {titulo}
        {ayuda ? <InfoTooltip etiqueta={`Sobre «${titulo}»`}>{ayuda}</InfoTooltip> : null}
      </TituloTarjeta>
      {!datos ? (
        <p className="crediscope-muted">Equifax no trajo esta parte en esta consulta.</p>
      ) : lista ? (
        <dl className="crediscope-equifax-datos">{children}</dl>
      ) : (
        children
      )}
    </div>
  );
}

const antiguedad = (meses) => {
  if (typeof meses !== "number") return "—";
  const anios = Math.floor(meses / 12);
  const resto = meses % 12;
  if (anios === 0) return plural(resto, "mes", "meses");
  return resto === 0 ? plural(anios, "año", "años") : `${plural(anios, "año", "años")} y ${plural(resto, "mes", "meses")}`;
};

export default function ReporteCompletoEquifax({ estructura }) {
  const t = estructura?.tarjetas;
  const ev = estructura?.evolucion;
  const scores = estructura?.scores;
  const c = estructura?.creditosOtorgados;
  const q = estructura?.consultasRecibidas;
  const g = estructura?.estadoGeneral;
  const a = estructura?.actividadEconomica;
  const e = estructura?.estimacionesDeEquifax;

  return (
    <div className="crediscope-equifax-reporte">
      <Seccion Icono={CreditCard} titulo="Tarjetas de crédito" datos={t}>
        <Fila etiqueta="Tarjetas vigentes">{entero(t?.numeroDeTarjetasVigentes)}</Fila>
        <Fila etiqueta="Cupo total">{moneda(t?.cupoTotalUsd)}</Fila>
        <Fila etiqueta="Saldo de hoy">{moneda(t?.saldoTotalUsd)}</Fila>
        <Fila etiqueta="Uso de hoy" ayuda="El saldo de hoy sobre el cupo de todas sus tarjetas vigentes." alerta={(t?.usoActualPorcentaje ?? 0) > 90}>
          {porcentajeDe100(t?.usoActualPorcentaje)}
        </Fila>
        <Fila
          etiqueta="Uso promedio de 6 meses"
          ayuda="Así mide Equifax el uso: el saldo promedio de los últimos 6 meses sobre el cupo. Puede pasar de 100%."
        >
          {porcentajeDe100(t?.usoPromedioPorcentaje)}
        </Fila>
        <Fila etiqueta="Con saldo mayor que el cupo" alerta={(t?.numeroDeTarjetasConSaldoMayorAlCupo ?? 0) > 0}>
          {entero(t?.numeroDeTarjetasConSaldoMayorAlCupo)}
        </Fila>
        <Fila etiqueta="La más antigua">{antiguedad(t?.antiguedadDeLaMasAntiguaMeses)}</Fila>
        <Fila etiqueta="Canceladas">{entero(t?.numeroDeTarjetasCanceladas)}</Fila>
      </Seccion>

      <Seccion
        Icono={TrendingUp}
        titulo="Cómo cambió en un año"
        lista={false}
        ayuda="Equifax arma estas series con todo lo que la persona debe y respalda (como titular, codeudora o garante): por eso no coinciden con la deuda como titular."
        datos={ev}
      >
        {/* Tres momentos en columnas, del más viejo a hoy como la franja de
            pagos: en filas, «Acreedores hoy / hace 12 meses: 8 / 7» obligaba a
            emparejar las cifras con las palabras (2026-10-18). Equifax no
            trae los acreedores ni la cuota de hace 6 meses en la estructura. */}
        <div className="crediscope-equifax-tabla-envoltura">
          <table className="crediscope-table crediscope-equifax-tabla crediscope-equifax-evolucion">
            <thead>
              <tr>
                <th scope="col">
                  <span className="crediscope-solo-lectores">Qué se mide</span>
                </th>
                <th scope="col" className="crediscope-equifax-num">Hace 12 meses</th>
                <th scope="col" className="crediscope-equifax-num">Hace 6 meses</th>
                <th scope="col" className="crediscope-equifax-num">Hoy</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Deuda total</th>
                <td className="crediscope-equifax-num">{moneda(ev?.deudaHace12MesesUsd)}</td>
                <td className="crediscope-equifax-num">{moneda(ev?.deudaHace6MesesUsd)}</td>
                <td className="crediscope-equifax-num">{moneda(ev?.deudaActualUsd)}</td>
              </tr>
              <tr>
                <th scope="row">Acreedores</th>
                <td className="crediscope-equifax-num">{entero(ev?.acreedoresHace12Meses)}</td>
                <td className="crediscope-equifax-num">{entero(ev?.acreedoresHace6Meses)}</td>
                <td className="crediscope-equifax-num">{entero(ev?.acreedoresActuales)}</td>
              </tr>
              <tr>
                <th scope="row">Cuota estimada</th>
                <td className="crediscope-equifax-num">{moneda(ev?.cuotaEstimadaHace12MesesUsd)}</td>
                <td className="crediscope-equifax-num">—</td>
                <td className="crediscope-equifax-num">{moneda(ev?.cuotaEstimadaActualUsd)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {typeof ev?.variacionDeLaDeuda12MesesPorcentaje === "number" && ev.variacionDeLaDeuda12MesesPorcentaje !== 0 ? (
          <p className="crediscope-equifax-evolucion-nota">
            La deuda total {ev.variacionDeLaDeuda12MesesPorcentaje > 0 ? "subió" : "bajó"}{" "}
            {decimal(Math.abs(ev.variacionDeLaDeuda12MesesPorcentaje), 0)}% en 12 meses.
          </p>
        ) : null}
      </Seccion>

      <Seccion
        Icono={Gauge}
        titulo="Scores de Equifax"
        ayuda="El Score de Equifax de hoy y el de hace 12 meses están arriba, en los indicadores."
        datos={scores}
      >
        <Fila etiqueta="Score de Equifax hace 6 meses">{entero(scores?.scoreEquifaxHace6Meses)}</Fila>
        <Fila etiqueta="Score de inclusión" ayuda="Otro score de Equifax. Su definición exacta está pedida a Equifax.">
          {entero(scores?.scoreInclusionEquifax)}
        </Fila>
        <Fila
          etiqueta="Score de sobreendeudamiento"
          ayuda="La lectura de Equifax sobre la carga de deuda de la persona: una alerta de capacidad de pago, no un hecho de pago. El nivel que le corresponde está arriba, en «Cuota mensual»."
        >
          {entero(scores?.scoreSobreendeudamientoEquifax)}
        </Fila>
      </Seccion>

      <Seccion Icono={FileStack} titulo="Créditos que le dieron" datos={c}>
        <Fila etiqueta="Créditos otorgados">{entero(c?.numeroDeCreditosOtorgados)}</Fila>
        <Fila etiqueta="Originales">{entero(c?.numeroDeCreditosOriginales)}</Fila>
        <Fila
          etiqueta="Refinanciados"
          ayuda="Un crédito que se volvió a pactar con otras condiciones. Suele mostrar una dificultad de pago anterior."
          alerta={(c?.numeroDeCreditosRefinanciados ?? 0) > 0}
        >
          {entero(c?.numeroDeCreditosRefinanciados)}
        </Fila>
        <Fila
          etiqueta="Reestructurados"
          ayuda="Un crédito al que se le cambió el plazo o la cuota porque la persona no podía pagarlo. Suele mostrar una dificultad de pago anterior."
          alerta={(c?.numeroDeCreditosReestructurados ?? 0) > 0}
        >
          {entero(c?.numeroDeCreditosReestructurados)}
        </Fila>
        <Fila etiqueta="Novados" ayuda="Renovaciones: por sí solas no dicen nada.">
          {entero(c?.numeroDeCreditosNovados)}
        </Fila>
        <Fila etiqueta="Cancelados">{entero(c?.numeroDeCreditosCancelados)}</Fila>
        <Fila etiqueta="Último otorgado">{formatearDia(c?.fechaDeLaUltimaConcesion)}</Fila>
      </Seccion>

      <Seccion
        Icono={Search}
        titulo="Quién pidió su reporte"
        ayuda="Entidades que consultaron a Equifax por esta persona, sin contar a NovaCredit (las consultas de CrediScope). Muchas en pocos meses es búsqueda de crédito. Una misma entidad puede venir escrita de varias formas: el número de entidades puede estar algo inflado."
        datos={q}
      >
        <Fila etiqueta="Entidades, últimos 3 meses">{entero(q?.entidadesEnLosUltimos3Meses)}</Fila>
        <Fila etiqueta="Entidades, últimos 12 meses">{entero(q?.entidadesQueLaConsultaronEnLosUltimos12Meses)}</Fila>
        <Fila etiqueta="Consultas, últimos 3 meses">{entero(q?.consultasEnLosUltimos3Meses)}</Fila>
        <Fila etiqueta="Consultas, últimos 12 meses">{entero(q?.consultasEnLosUltimos12Meses)}</Fila>
      </Seccion>

      <Seccion Icono={ShieldAlert} titulo="Estado general según Equifax" datos={g}>
        <Fila
          etiqueta="Estado de su cartera"
          ayuda={`Un cálculo de Equifax con su propio criterio, no un dato que reporte una institución.${
            g?.estadoDeCartera?.interpretacion ? ` Así lo explica Equifax: «${g.estadoDeCartera.interpretacion}»` : ""
          }`}
        >
          {estadoDeCarteraLegible(g?.estadoDeCartera?.descripcion) ?? "—"}
        </Fila>
        <Fila etiqueta="Primer crédito">
          {g?.fechaDelPrimerCredito ? `${formatearDia(g.fechaDelPrimerCredito)} (hace ${antiguedad(g.antiguedadCrediticiaMeses)})` : "—"}
        </Fila>
        <Fila etiqueta="Inhabilitación bancaria" alerta={g?.tieneInhabilitacionBancaria === true}>
          {g?.tieneInhabilitacionBancaria && g?.ultimaInhabilitacion
            ? `Sí · ${formatearDia(g.ultimaInhabilitacion.fecha)}${g.ultimaInhabilitacion.accion ? ` · ${g.ultimaInhabilitacion.accion}` : ""}`
            : siNo(g?.tieneInhabilitacionBancaria)}
        </Fila>
        <Fila
          etiqueta="Morosidades"
          ayuda="Cifra de Equifax: cuenta también lo que la persona respalda como codeudora o garante."
        >
          {entero(g?.numeroDeMorosidades)}
        </Fila>
        <Fila etiqueta="Protestos" ayuda="Equifax manda este dato siempre vacío: no se sabe si tiene o no.">
          No medido
        </Fila>
      </Seccion>

      <Seccion Icono={Store} titulo="Actividad económica (SRI, según Equifax)" datos={a}>
        <Fila etiqueta="Tiene RUC">{siNo(a?.tieneRuc)}</Fila>
        <Fila etiqueta="Estado del RUC">{textoDeEquifaxLegible(a?.estadoDelRuc) ?? "—"}</Fila>
        <Fila etiqueta="Clase de contribuyente">{textoDeEquifaxLegible(a?.claseDeContribuyente) ?? "—"}</Fila>
        <Fila etiqueta="Lleva contabilidad">{siNo(a?.obligadoALlevarContabilidad)}</Fila>
        <Fila etiqueta="Inicio de actividades">{formatearDia(a?.fechaDeInicioDeActividades)}</Fila>
        <Fila etiqueta="Suspensión definitiva">{formatearDia(a?.fechaDeSuspensionDefinitiva)}</Fila>
      </Seccion>

      <Seccion
        Icono={Calculator}
        titulo="Estimaciones de Equifax"
        ayuda="Cifras que Equifax estima con su propio modelo, no datos reportados. No se usan en el análisis de CrediScope."
        datos={e}
      >
        <Fila etiqueta="Ingreso estimado">{moneda(e?.ingresoEstimadoUsd)}</Fila>
        <Fila
          etiqueta="Indicador de impacto económico"
          ayuda="Un indicador de Equifax que en las consultas guardadas va del 1 al 6. Qué significa cada valor está pedido a Equifax: no leerlo como bueno o malo todavía."
        >
          {e?.indicadorDeImpactoEconomico ?? "—"}
        </Fila>
      </Seccion>
    </div>
  );
}
