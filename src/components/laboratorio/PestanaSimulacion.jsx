import { useState } from "react";
import { Plus, Trash2, Play } from "lucide-react";
import { simularPolitica } from "../../lib/laboratorio.js";
import { formatearFechaHora } from "../../lib/fechas.js";
import { Kpi, MensajeError, num, pct } from "./Comunes.jsx";

// Simular una regla de política sobre el corte, sin llamar al modelo
// (diseño, 7.3): cuántos aprobados pasarían a negados, cuántos malos se
// habrían evitado y cuántos buenos se habrían perdido. Una regla mejora
// algo sólo si los que pasan a negados son más malos que la base.

const OPERADORES = [">", ">=", "<", "<=", "=", "!="];

function valorDe(variable, texto) {
  if (variable?.tipo === "numero") return Number(String(texto).replace(",", "."));
  if (variable?.tipo === "booleano") return texto === "true";
  return texto;
}

export default function PestanaSimulacion({ corteId, catalogo, simulaciones, alSimular }) {
  const [nombre, setNombre] = useState("");
  const [condiciones, setCondiciones] = useState([{ variable: "", op: ">", valor: "" }]);
  const [error, setError] = useState(null);
  const [trabajando, setTrabajando] = useState(false);
  const porId = Object.fromEntries(catalogo.map((v) => [v.id, v]));
  const decision = catalogo.filter((v) => v.uso === "decision");

  const cambiar = (i, campo, valor) => setCondiciones((cs) => cs.map((c, j) => (j === i ? { ...c, [campo]: valor } : c)));
  const completa = condiciones.every((c) => c.variable && c.op && c.valor !== "" && !(porId[c.variable]?.tipo === "numero" && Number.isNaN(valorDe(porId[c.variable], c.valor))));

  async function simular() {
    setError(null);
    setTrabajando(true);
    try {
      await simularPolitica(corteId, {
        nombre: nombre.trim() || "Regla sin nombre",
        condiciones: condiciones.map((c) => ({ variable: c.variable, op: c.op, valor: valorDe(porId[c.variable], c.valor) })),
        entonces: "negar",
      });
      await alSimular();
    } catch (e) {
      setError(e.message);
    } finally {
      setTrabajando(false);
    }
  }

  return (
    <div>
      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Negar cuando se cumpla todo esto</h3>
        <input className="crediscope-input" style={{ marginBottom: 10, maxWidth: 420 }} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre de la regla" />
        {condiciones.map((c, i) => {
          const v = porId[c.variable];
          return (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
              <select className="crediscope-input" style={{ maxWidth: 320 }} value={c.variable} onChange={(e) => cambiar(i, "variable", e.target.value)}>
                <option value="">Elegí una variable</option>
                {decision.map((x) => (
                  <option key={x.id} value={x.id}>{x.grupo} · {x.nombre}</option>
                ))}
              </select>
              <select className="crediscope-input" style={{ maxWidth: 80 }} value={c.op} onChange={(e) => cambiar(i, "op", e.target.value)}>
                {(v?.tipo === "numero" ? OPERADORES : ["=", "!="]).map((o) => <option key={o}>{o}</option>)}
              </select>
              {v?.tipo === "booleano" ? (
                <select className="crediscope-input" style={{ maxWidth: 120 }} value={c.valor} onChange={(e) => cambiar(i, "valor", e.target.value)}>
                  <option value="">—</option>
                  <option value="true">Sí</option>
                  <option value="false">No</option>
                </select>
              ) : (
                <input className="crediscope-input" style={{ maxWidth: 160 }} value={c.valor} onChange={(e) => cambiar(i, "valor", e.target.value)} placeholder={v?.tipo === "numero" ? "2000" : "valor"} />
              )}
              {condiciones.length > 1 ? (
                <button className="crediscope-btn crediscope-btn-ghost" onClick={() => setCondiciones((cs) => cs.filter((_, j) => j !== i))} title="Quitar">
                  <Trash2 size={14} />
                </button>
              ) : null}
            </div>
          );
        })}
        <div style={{ display: "flex", gap: 8 }}>
          <button className="crediscope-btn crediscope-btn-ghost" onClick={() => setCondiciones((cs) => [...cs, { variable: "", op: ">", valor: "" }])}>
            <Plus size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            Otra condición
          </button>
          <button className="crediscope-btn" onClick={simular} disabled={!completa || trabajando}>
            <Play size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            {trabajando ? "Simulando..." : "Simular"}
          </button>
        </div>
      </div>

      <MensajeError mensaje={error} />

      {simulaciones.map((s) => {
        const r = s.resultado;
        const tasaPasan = r.pasan_a_negar ? r.malos_evitados / r.pasan_a_negar : null;
        const mejora = tasaPasan !== null && tasaPasan > Number(r.tasa_malos_aprobados_antes ?? 0);
        return (
          <div key={s.id} className="crediscope-card">
            <h3 style={{ marginTop: 0, marginBottom: 2 }}>{r.regla?.nombre}</h3>
            <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 12.5 }}>
              {(r.regla?.condiciones ?? []).map((c) => `${porId[c.variable]?.nombre ?? c.variable} ${c.op} ${String(c.valor)}`).join(" y ")} · {formatearFechaHora(s.created_at)}
            </p>
            <div className="crediscope-kpi-grid">
              <Kpi etiqueta="Pasan a negados" valor={num(r.pasan_a_negar)} detalle={`de ${num(r.aprobados_antes)} aprobados`} />
              <Kpi etiqueta="Malos evitados" valor={num(r.malos_evitados)} color="var(--good)" detalle={tasaPasan === null ? null : `${pct(tasaPasan)} de los que pasan eran malos`} />
              <Kpi etiqueta="Buenos perdidos" valor={num(r.buenos_perdidos)} color="var(--bad)" />
              <Kpi
                etiqueta="Tasa de malos de los aprobados"
                valor={`${pct(r.tasa_malos_aprobados_antes)} → ${pct(r.tasa_malos_aprobados_despues)}`}
                detalle={mejora ? "La regla separa mejor que el azar" : "No separa mejor que el azar"}
                color={mejora ? "var(--good)" : "var(--text-muted)"}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
