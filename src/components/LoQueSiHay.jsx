import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";
import {
  ETIQUETA_SEGMENTO,
  ETIQUETA_ESTADO,
  RIESGO_SEGMENTO,
  formatMoneda,
} from "../lib/fuentesIngresoConsolidado.js";

// Lo que sigue estando disponible cuando el modelo no responde.
//
// CrediScope tiene dos motores y solo uno depende de un proveedor
// externo. El Perfil del Cliente, la segmentación por fuente de ingreso
// y los controles de bloqueo son código nuestro corriendo sobre datos
// que ya se consultaron y ya se pagaron: no se caen porque se caiga un
// tercero.
//
// Hasta ahora se caían igual, porque todo colgaba del mismo análisis.
// El resultado era que una caída de seis minutos del proveedor dejaba
// al analista sin NADA, teniendo el 70% de la información en la base.
//
// Esto no reemplaza el dictamen: lo dice explícitamente. Da lo
// verificable para que alguien pueda decidir a mano mientras tanto.

function Dato({ etiqueta, valor, detalle }) {
  return (
    <div style={{ minWidth: 180 }}>
      <p className="crediscope-kpi-label" style={{ margin: "0 0 2px" }}>{etiqueta}</p>
      <p style={{ margin: 0, fontWeight: 600 }}>{valor}</p>
      {detalle ? <p className="crediscope-muted" style={{ margin: "2px 0 0", fontSize: 12.5 }}>{detalle}</p> : null}
    </div>
  );
}

export default function LoQueSiHay({ perfil, cedula, hallazgos = [] }) {
  const sp = perfil?.standard_profile ?? null;
  const f = sp?.fuentesIngreso ?? null;
  if (!sp) return null;

  const laboral = sp.laboral ?? {};
  const cumplimiento = sp.cumplimiento ?? {};

  return (
    <div className="crediscope-card" style={{ borderColor: "var(--good)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <CheckCircle2 size={22} color="var(--good)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: "0 0 6px" }}>Lo que sí está disponible</h3>
          <p className="crediscope-muted" style={{ marginTop: 0 }}>
            Esta parte del análisis no depende del proveedor de inteligencia artificial: se calcula acá, con datos que ya se
            consultaron. <strong>No es un dictamen</strong> — es lo verificable, para decidir a mano mientras tanto.
          </p>

          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "14px 0" }}>
            {f?.segmento ? (
              <Dato
                etiqueta="Fuente de ingreso"
                valor={ETIQUETA_SEGMENTO[f.segmento] ?? f.segmento}
                detalle={`${ETIQUETA_ESTADO[f.estadoSegmento] ?? ""}${RIESGO_SEGMENTO[f.segmento] ? ` · ${RIESGO_SEGMENTO[f.segmento]}` : ""}`}
              />
            ) : null}
            {f?.pisoIngresoMensualReportado ? (
              <Dato
                etiqueta="Piso de ingreso reportado"
                valor={formatMoneda(f.pisoIngresoMensualReportado)}
                detalle="Lo declarado al IESS; el ingreso real puede ser mayor"
              />
            ) : null}
            {laboral.antiguedadLaboralMeses ? (
              <Dato etiqueta="Antigüedad laboral" valor={`${laboral.antiguedadLaboralMeses} meses`} />
            ) : null}
            <Dato
              etiqueta="Listas de control"
              valor={hallazgos.length ? `${hallazgos.length} hallazgo(s)` : "Sin hallazgos"}
              detalle={cumplimiento.enListaControl === true ? "Requiere verificación de identidad" : null}
            />
          </div>

          {(f?.paraConfirmar ?? []).length > 0 ? (
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
              <p style={{ fontWeight: 600, fontSize: 13, margin: "0 0 6px" }}>Qué pedirle al cliente</p>
              <ul className="crediscope-list" style={{ fontSize: 13.5, margin: 0 }}>
                {f.paraConfirmar.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {cedula ? (
            <p style={{ margin: "14px 0 0" }}>
              <Link className="crediscope-btn crediscope-btn-ghost" to={`/perfil/${cedula}`}>
                Ver el Perfil del Cliente completo
                <ArrowRight size={15} style={{ marginLeft: 6, verticalAlign: "-2px" }} />
              </Link>
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
