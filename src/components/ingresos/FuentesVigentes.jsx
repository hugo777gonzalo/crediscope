import { Landmark } from "lucide-react";
import { TituloTarjeta, Cifra } from "../reporte/Piezas.jsx";
import { formatearValorAval } from "../../lib/avalCampos.js";
import { ETIQUETA_EVIDENCIA } from "../../lib/fuentesIngresoConsolidado.js";
import { origenDeFuente, ETIQUETA_ORIGEN, mesLegible } from "../../lib/ingresosCampos.js";

// Las fuentes separadas por de dónde salen: lo que declara un tercero o la
// persona ante el IESS (con monto) y lo que se deduce de otras fuentes
// (jubilación, RUC, nómina, pensión: sin monto). Mezcladas en una lista,
// un "RUC activo" sin cifra se leía como una fuente más al lado de un
// sueldo de $1.200.
const CLASE_EVIDENCIA = {
  reportada_por_tercero: "crediscope-tag-ok",
  autodeclarada_sobre_minimo: "crediscope-tag-warn",
  autodeclarada_en_minimo: "crediscope-tag-warn",
  indirecta: "crediscope-tag-neutral",
};

function capitalizar(t) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function Fuente({ fuente, conMonto }) {
  const origen = origenDeFuente(fuente);
  return (
    <li className="crediscope-ing-fuente">
      <div style={{ minWidth: 0 }}>
        <strong>{capitalizar(origen === "iess" ? fuente.tipo : ETIQUETA_ORIGEN[origen])}</strong>
        {fuente.empleador ? <span className="crediscope-ing-fuente-sub">{fuente.empleador}</span> : null}
        {!conMonto ? <span className="crediscope-ing-fuente-sub">{fuente.detalle}</span> : null}
        <span
          className={`crediscope-tag ${CLASE_EVIDENCIA[fuente.evidencia] ?? "crediscope-tag-neutral"}`}
          style={{ marginTop: 6, fontSize: 11.5, padding: "2px 8px" }}
          title={conMonto ? fuente.detalle : undefined}
        >
          {ETIQUETA_EVIDENCIA[fuente.evidencia] ?? fuente.evidencia}
        </span>
      </div>
      {conMonto ? (
        <strong className="crediscope-ing-monto">
          {fuente.montoMensualReportado ? formatearValorAval(fuente.montoMensualReportado, "dinero") : "sin monto"}
        </strong>
      ) : null}
    </li>
  );
}

export default function FuentesVigentes({ f }) {
  const fuentes = f.fuentes ?? [];
  const delIess = fuentes.filter((x) => origenDeFuente(x) === "iess");
  const otras = fuentes.filter((x) => origenDeFuente(x) !== "iess");
  const senales = f.senalesDeEscala ?? [];

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={Landmark}>Fuentes de ingreso</TituloTarjeta>

      <section className="crediscope-aval-subseccion">
        <p className="crediscope-aval-subtitulo">
          Aportes al IESS <small>· vigentes en {mesLegible(f.corteIessUsado)}</small>
        </p>
        {delIess.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>
            {f.cortesDesdeLaDesvinculacion
              ? `Sin aportes en el último corte. Dejó de aportar hace ${f.cortesDesdeLaDesvinculacion} ${f.cortesDesdeLaDesvinculacion === 1 ? "mes" : "meses"}.`
              : f.segmento === "sin_datos"
                ? "La fuente de los aportes no respondió: no se sabe si aporta."
                : "No registra aportes al IESS."}
          </p>
        ) : (
          <ul className="crediscope-aval-filas">
            {delIess.map((x, i) => (
              <Fuente key={i} fuente={x} conMonto />
            ))}
          </ul>
        )}
      </section>

      {otras.length > 0 ? (
        <section className="crediscope-aval-subseccion">
          <p className="crediscope-aval-subtitulo">
            Otras fuentes <small>· sin monto en ninguna fuente pública</small>
          </p>
          <ul className="crediscope-aval-filas">
            {otras.map((x, i) => (
              <Fuente key={i} fuente={x} />
            ))}
          </ul>
        </section>
      ) : null}

      {senales.length > 0 ? (
        <section className="crediscope-aval-subseccion">
          <p className="crediscope-aval-subtitulo">
            Señales de escala <small>· tamaño de la actividad, no ingreso</small>
          </p>
          <div className="crediscope-aval-cifras" style={{ marginBottom: 0 }}>
            {senales.map((s) => (
              <Cifra key={s.senal} etiqueta={capitalizar(s.senal)} titulo={s.detalle}>
                {s.valor === null || s.valor === undefined
                  ? "Sí"
                  : s.senal === "nómina que paga"
                    ? formatearValorAval(s.valor, "dinero")
                    : formatearValorAval(s.valor, "entero")}
              </Cifra>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
