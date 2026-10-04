import { useMemo, useState } from "react";
import { useColumnasDelCorte } from "../../lib/useFilasDelCorte.js";
import { explorarSignificancia } from "../../lib/analisisEstadistico.js";
import { MensajeError, Cargando, Etiqueta, pct, dec } from "./Comunes.jsx";

// Explorador de significancia: por variable, todo junto. Asociación (IV),
// valor p corregido (q), tamaño del efecto, cobertura, estabilidad entre las
// dos mitades del corte y relevancia (si el modelo la recibe). Una variable
// es candidata a dato nuevo si anticipa (IV de 0,1 o más), sobrevive a la
// corrección, es estable y el modelo no la recibe.

const FILTROS = {
  todas: ["Todas", () => true],
  candidatas: ["Candidatas a dato nuevo", (s) => s.candidata],
  no_llegan: ["El modelo no las recibe", (s) => !s.enModelo && s.uso !== "protegida"],
  significativas: ["Significativas (q < 0,05)", (s) => (s.q ?? 1) < 0.05],
  inestables: ["Inestables entre mitades", (s) => !s.estable && s.iv >= 0.02],
  protegidas: ["Protegidas", (s) => s.uso === "protegida"],
};
const ORDENES = { iv: ["IV", (a, b) => b.iv - a.iv], q: ["q", (a, b) => (a.q ?? 1) - (b.q ?? 1)], efecto: ["Efecto", (a, b) => Math.abs(b.efecto ?? 0) - Math.abs(a.efecto ?? 0)] };
const COLOR_FUERZA = { fuerte: "var(--bad)", media: "var(--warn)", "débil": "var(--brand)", nada: "var(--text-muted)" };

export default function PestanaSignificancia({ corteId, poblacion }) {
  const { datos, error } = useColumnasDelCorte(corteId, poblacion);
  const [filtro, setFiltro] = useState("todas");
  const [orden, setOrden] = useState("iv");
  const todas = useMemo(() => (datos ? explorarSignificancia(datos) : null), [datos]);
  if (error) return <MensajeError mensaje={error} />;
  if (!todas) return <Cargando que="las variables del corte" />;
  const lista = todas.filter(FILTROS[filtro][1]).sort(ORDENES[orden][1]);

  return (
    <div>
      <div className="crediscope-card" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
          {Object.entries(FILTROS).map(([clave, [texto]]) => <option key={clave} value={clave}>{texto} ({todas.filter(FILTROS[clave][1]).length})</option>)}
        </select>
        <span className="crediscope-muted" style={{ fontSize: 13 }}>Ordenar por</span>
        <select value={orden} onChange={(e) => setOrden(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
          {Object.entries(ORDENES).map(([clave, [texto]]) => <option key={clave} value={clave}>{texto}</option>)}
        </select>
      </div>
      <div className="crediscope-card" style={{ overflowX: "auto" }}>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Variable</th>
              <th style={{ textAlign: "right" }}>IV</th>
              <th style={{ textAlign: "right" }}>q</th>
              <th style={{ textAlign: "right" }}>Efecto</th>
              <th style={{ textAlign: "right" }}>Cobertura</th>
              <th>Estabilidad (IV por mitad)</th>
              <th>El modelo</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((s) => (
              <tr key={s.id} style={{ background: s.candidata ? "var(--panel-muted)" : undefined }}>
                <td>
                  <strong>{s.nombre}</strong> {s.candidata ? <Etiqueta texto="candidata" color="var(--bad)" /> : null}
                  <div className="crediscope-muted" style={{ fontSize: 12 }}>{s.grupo}</div>
                </td>
                <td style={{ textAlign: "right" }}>{dec(s.iv, 3)} <Etiqueta texto={s.fuerza} color={COLOR_FUERZA[s.fuerza]} /></td>
                <td style={{ textAlign: "right" }}>{s.q === null ? "—" : s.q < 0.0001 ? "< 0,0001" : dec(s.q, 4)}</td>
                <td style={{ textAlign: "right" }} title={s.medidaEfecto}>{s.efecto === null ? "—" : dec(s.efecto, 3)}</td>
                <td style={{ textAlign: "right" }}>{pct(s.cobertura, 0)}</td>
                <td>{dec(s.ivPrimera, 3)} y {dec(s.ivSegunda, 3)} {s.estable ? null : <Etiqueta texto="inestable" color="var(--warn)" />}</td>
                <td>{s.uso === "protegida" ? <Etiqueta texto="protegida" color="var(--warn)" /> : s.enModelo ? "La recibe" : <Etiqueta texto="No la recibe" color="var(--bad)" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Efecto: delta de Cliff para las numéricas (de −1 a 1: cuánto más alto tienen los malos), V de Cramér para el resto (de 0 a 1). Estable: las dos
          mitades del corte por fecha dicen lo mismo (las dos con IV de 0,02 o más, o las dos por debajo).
        </p>
      </div>
    </div>
  );
}
