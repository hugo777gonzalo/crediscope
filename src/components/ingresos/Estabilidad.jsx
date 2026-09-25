import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import { TituloTarjeta, Cifra } from "../reporte/Piezas.jsx";
import { formatearValorAval } from "../../lib/avalCampos.js";
import { duracionLegible, mesLegible, mesesHasta } from "../../lib/ingresosCampos.js";

// Qué tan sostenido es el ingreso: cuánto lleva en el empleo, si aporta
// todos los meses o con huecos, y si el sueldo reportado sube o baja. Un
// ingreso reportado de $1.000 que viene de 24 meses seguidos no es el
// mismo dato que uno que apareció el mes pasado.

// Las 24 barras del historial. Una sola serie -- el total aportado por mes
// -- así que un solo tono y sin leyenda. Los meses sin aporte se dibujan
// como hueco y no se omiten: el hueco es justamente lo que hay que ver.
function GraficoAportes({ detalle, corte }) {
  const meses = mesesHasta(corte, 24);
  const porMes = new Map(detalle.aportesPorMes.map((m) => [m.mes, m]));
  const maximo = Math.max(...detalle.aportesPorMes.map((m) => m.total), 1);
  const conAporte = meses.filter((m) => porMes.has(m)).length;

  return (
    <div>
      <div
        className="crediscope-ing-grafico"
        role="img"
        aria-label={`Aportes al IESS de ${mesLegible(meses[0])} a ${mesLegible(meses[meses.length - 1])}: ${conAporte} de 24 meses con aporte.`}
      >
        {meses.map((mes) => {
          const dato = porMes.get(mes);
          return (
            <div key={mes} className="crediscope-ing-columna">
              {dato ? (
                <div className="crediscope-ing-barra" style={{ height: `${Math.max(3, (dato.total / maximo) * 100)}%` }} />
              ) : (
                <div className="crediscope-ing-hueco" />
              )}
              <span className="crediscope-ing-globo">
                <strong>{mesLegible(mes)}</strong>
                <br />
                {dato
                  ? `${formatearValorAval(dato.total, "dinero")}${dato.empleadores > 1 ? ` · ${dato.empleadores} empleadores` : ""}`
                  : "sin aporte"}
              </span>
            </div>
          );
        })}
      </div>
      <div className="crediscope-ing-eje">
        <span>{mesLegible(meses[0])}</span>
        <span>{mesLegible(meses[12])}</span>
        <span>{mesLegible(meses[meses.length - 1])}</span>
      </div>
    </div>
  );
}

function Variacion({ hoy, antes }) {
  if (!hoy || !antes) return "—";
  const pct = Math.round(((hoy - antes) / antes) * 100);
  if (Math.abs(pct) < 5) return "Igual";
  const Icono = pct > 0 ? TrendingUp : TrendingDown;
  return (
    <span className={pct < 0 ? "crediscope-aval-malo" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Icono size={17} />
      {pct > 0 ? "+" : ""}
      {pct}%
    </span>
  );
}

// La continuidad laboral (fuentes-v5) es la cifra que abre la tarjeta: mide
// la estabilidad total, que la antigüedad en el empleo actual no ve --
// quien cambió de empleo sin dejar de trabajar aparece con una antigüedad
// corta aunque lleve años trabajando. `undefined` = el perfil es anterior
// a la v5; `null` = nunca trabajó con un empleador según el IESS.
function textoContinuidad(co) {
  if (co === undefined) return "—";
  if (co === null) return "Sin trabajo registrado";
  if (!co.vigente) return "0";
  return duracionLegible(co.meses);
}

// Desde fuentes-v6 el aporte propio cuenta en los meses con RUC activo;
// en un perfil v5 (sin mesesCuentaPropiaConRuc) no contaba nunca, y el
// texto tiene que decir la regla con que se calculó ESE número.
function explicacionContinuidad(co) {
  if (co === undefined) return "Existe desde la versión fuentes-v5 de las reglas: reconsultá para verla.";
  const regla =
    co?.mesesCuentaPropiaConRuc === undefined
      ? "No cuentan los aportes voluntarios ni unipersonales."
      : "El aporte por cuenta propia cuenta sólo en los meses con RUC activo.";
  if (co === null) return `El IESS no registra trabajo con un empleador ni actividad propia con RUC activo. ${regla}`;
  const empleadores = `${co.empleadores} ${co.empleadores === 1 ? "empleador" : "empleadores"}`;
  const huecos = co.mesesSinAporte ? `, ${co.mesesSinAporte} ${co.mesesSinAporte === 1 ? "mes" : "meses"} sin aporte entre empleos` : ", sin meses vacíos";
  const propios = co.mesesCuentaPropiaConRuc
    ? ` (${duracionLegible(co.mesesCuentaPropiaConRuc)} por cuenta propia con RUC activo)`
    : "";
  const tramo = `de ${mesLegible(co.desde)} a ${mesLegible(co.hasta)}: ${duracionLegible(co.meses)}${propios} con ${empleadores}${huecos}`;
  return co.vigente
    ? `Trabaja sin interrupciones de más de ${co.toleranciaMeses} meses ${tramo}. ${regla}`
    : `Hoy no trabaja con un empleador ni por cuenta propia con RUC activo. Su última continuidad fue ${tramo}.`;
}

export default function Estabilidad({ f, laboral }) {
  const d = f.detalle ?? null;
  const promedio6 = d?.promedioUltimos6 ?? laboral?.ingresoPromedioUltimos6Meses ?? null;
  const continuidad = d ? d.continuidadLaboral : undefined;

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={Activity}>Estabilidad y trayectoria</TituloTarjeta>

      <div className="crediscope-aval-cifras">
        {d ? (
          <Cifra etiqueta="Continuidad laboral" titulo={explicacionContinuidad(continuidad)}>
            <span className={continuidad && !continuidad.vigente ? "crediscope-aval-malo" : undefined}>{textoContinuidad(continuidad)}</span>
          </Cifra>
        ) : null}
        <Cifra
          etiqueta="Antigüedad en el empleo actual"
          titulo="Según el IESS. Se informa sólo con 3 meses o más de evidencia en ese empleo."
        >
          {duracionLegible(laboral?.antiguedadEmpleoActualMeses)}
        </Cifra>
        <Cifra etiqueta="Empleo más largo registrado">{duracionLegible(laboral?.duracionEmpleoMasLargoMeses)}</Cifra>
        <Cifra etiqueta="Empleadores en 24 meses">
          {laboral?.numeroEmpleadoresUltimos24Meses ?? "—"}
        </Cifra>
        {d ? (
          <Cifra etiqueta="Meses con aporte (últimos 12)">
            <span className={d.mesesConAporteUltimos12 < 12 && d.mesesConAporteUltimos12 > 0 ? "crediscope-aval-malo" : undefined}>
              {d.mesesConAporteUltimos12} de 12
            </span>
          </Cifra>
        ) : null}
        <Cifra etiqueta="Promedio mensual, 6 meses" titulo="Promedio de los meses con aporte. Es lo reportado al IESS, igual que el del corte.">
          {promedio6 ? formatearValorAval(promedio6, "dinero") : "—"}
        </Cifra>
        {d ? (
          <Cifra etiqueta="Contra hace un año" titulo={d.totalHace12Meses ? `Hace 12 meses: ${formatearValorAval(d.totalHace12Meses, "dinero")}` : "Sin aporte hace 12 meses"}>
            <Variacion hoy={f.pisoIngresoMensualReportado} antes={d.totalHace12Meses} />
          </Cifra>
        ) : null}
      </div>

      {d ? <p className="crediscope-aval-nota" style={{ marginTop: -4, marginBottom: 12 }}>{explicacionContinuidad(continuidad)}</p> : null}

      {d && d.aportesPorMes.length > 0 ? (
        <section className="crediscope-aval-subseccion">
          <p className="crediscope-aval-subtitulo">
            Aportes al IESS mes a mes <small>· total declarado, últimos 24 meses</small>
          </p>
          <GraficoAportes detalle={d} corte={f.corteIessUsado} />
        </section>
      ) : d ? (
        <p className="crediscope-aval-nota">Sin aportes al IESS en los últimos 24 meses.</p>
      ) : (
        <p className="crediscope-aval-nota">
          El historial mes a mes, la actividad económica y la renta por año existen desde la versión fuentes-v4 de las reglas.
          Esta clasificación es {f.version ?? "anterior"}: reconsultá para verlos.
        </p>
      )}
    </div>
  );
}
