import { useState } from "react";
import { ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";
import { Advertencias, Etiqueta, num, pct, dec } from "./Comunes.jsx";

// Qué datos del cliente anticipaban el impago (diseño, 7.2). El cruce que
// justifica el Laboratorio: variables fuertes que el modelo NO recibe.
// Las protegidas (edad, género) van aparte: el negocio decidió que no
// pesen, y se miran sólo para vigilar que el modelo no trate distinto a
// un grupo.

const COLOR_FUERZA = { fuerte: "var(--bad)", media: "var(--warn)", "débil": "var(--brand)", nada: "var(--text-muted)" };

function Fila({ v }) {
  const [abierta, setAbierta] = useState(false);
  const destacar = v.uso === "decision" && !v.llega_al_modelo && (v.fuerza === "fuerte" || v.fuerza === "media");
  return (
    <>
      <tr onClick={() => setAbierta(!abierta)} style={{ cursor: "pointer", background: destacar ? "var(--panel-muted)" : undefined }}>
        <td>
          {abierta ? <ChevronDown size={14} /> : <ChevronRight size={14} />} <strong>{v.nombre}</strong>
          <div className="crediscope-muted" style={{ fontSize: 12 }}>{v.grupo}</div>
        </td>
        <td>{v.llega_al_modelo ? "Sí" : <span style={{ color: destacar ? "var(--bad)" : undefined, fontWeight: destacar ? 700 : 400 }}>No</span>}</td>
        <td style={{ textAlign: "right" }}>{pct(v.cobertura, 0)}</td>
        <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{dec(v.iv, 3)}</td>
        <td>
          <Etiqueta texto={v.fuerza} color={COLOR_FUERZA[v.fuerza]} />
          {v.sospecha_de_fuga ? (
            <span title="Un IV tan alto suele indicar que la variable contiene el resultado (fuga de información)." style={{ color: "var(--bad)", marginLeft: 6 }}>
              <AlertTriangle size={14} style={{ verticalAlign: "-2px" }} /> ¿fuga?
            </span>
          ) : null}
        </td>
      </tr>
      {abierta ? (
        <tr>
          <td colSpan={5} style={{ background: "var(--panel-muted)" }}>
            <table className="crediscope-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Tramo</th>
                  <th style={{ textAlign: "right" }}>Personas</th>
                  <th style={{ textAlign: "right" }}>Malos</th>
                  <th style={{ textAlign: "right" }}>Tasa</th>
                  <th style={{ textAlign: "right" }}>WoE</th>
                </tr>
              </thead>
              <tbody>
                {v.tramos.map((t) => (
                  <tr key={t.tramo}>
                    <td>{t.tramo}</td>
                    <td style={{ textAlign: "right" }}>{num(t.n)}</td>
                    <td style={{ textAlign: "right" }}>{num(t.malos)}</td>
                    <td style={{ textAlign: "right" }}>{pct(t.tasa)}</td>
                    <td style={{ textAlign: "right" }}>{dec(t.woe, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      ) : null}
    </>
  );
}

function Tabla({ variables }) {
  return (
    <table className="crediscope-table">
      <thead>
        <tr>
          <th>Variable</th>
          <th>¿Llega al modelo?</th>
          <th style={{ textAlign: "right" }}>Cobertura</th>
          <th style={{ textAlign: "right" }}>Valor de información</th>
          <th>Fuerza</th>
        </tr>
      </thead>
      <tbody>
        {variables.map((v) => <Fila key={v.variable} v={v} />)}
      </tbody>
    </table>
  );
}

export default function PestanaVariables({ resultado }) {
  if (!resultado) return <p className="crediscope-muted">Todavía no se calculó.</p>;
  const r = resultado.resultado;
  const decision = (r.variables ?? []).filter((v) => v.uso === "decision");
  const protegidas = (r.variables ?? []).filter((v) => v.uso === "protegida");
  const noLlegan = decision.filter((v) => !v.llega_al_modelo && (v.fuerza === "fuerte" || v.fuerza === "media"));

  return (
    <div>
      <Advertencias lista={r.advertencias} />
      <p className="crediscope-muted" style={{ fontSize: 13 }}>
        {num(r.personas)} personas (una operación por persona), {num(r.malos)} malas. Valor de información: menos de 0,02 nada · hasta
        0,1 débil · hasta 0,3 media · más, fuerte · más de 0,5, sospecha de fuga. Una asociación no prueba causa: toda variable fuerte
        se valida en un corte posterior antes de proponerla.
      </p>
      {noLlegan.length ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <strong>Fuertes y el modelo no las recibe:</strong> {noLlegan.map((v) => v.nombre).join(", ")}.
        </div>
      ) : null}
      <div className="crediscope-card">
        <Tabla variables={decision} />
      </div>
      {protegidas.length ? (
        <div className="crediscope-card">
          <h3 style={{ marginTop: 0 }}>Variables protegidas</h3>
          <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
            El negocio decidió que no pesen en la decisión. Se muestran para vigilar sesgos, nunca para proponer usarlas.
          </p>
          <Tabla variables={protegidas} />
        </div>
      ) : null}
    </div>
  );
}
