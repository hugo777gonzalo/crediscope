import { useMemo, useState } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { cosechas, acumuladaA, HORIZONTES } from "../../lib/analisisRetrospectivo.js";
import { GraficoLineas, PALETA } from "./Graficos.jsx";
import { Kpi, MensajeError, Cargando, SinGuardar, num, pct, dec } from "./Comunes.jsx";
import { useGuardarResultado } from "../../lib/useGuardarResultado.js";

// Cosechas: cada generación (mes o trimestre de desembolso) y cómo se le
// acumula la mora con los meses. Kaplan-Meier en vez de "tasa de malos":
// un crédito que todavía no cumplió el plazo no se tira, aporta los meses
// que sí se vieron (censura). Necesita la fecha del primer impago, que el
// archivo exige desde la 101 a quien cayó.
//
// En solicitudes, el reloj arranca en la fecha de la solicitud y termina en
// la reconsulta; el impago es el que vio el buró.

export default function PestanaCosechas({ corteId, poblacion }) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const [agrupar, setAgrupar] = useState("mes");

  const c = useMemo(() => (filas ? cosechas(filas, agrupar) : null), [filas, agrupar]);
  const sinGuardar = useGuardarResultado({ corteId, tipo: "cosechas", poblacion, parametros: { agrupar }, resultado: c?.sujetos.length ? c : null });

  if (error) return <MensajeError mensaje={error} />;
  if (!c) return <Cargando />;
  if (!c.sujetos.length) return <p className="crediscope-muted">El corte no tiene fechas para armar cosechas.</p>;
  // Sacar a los malos sin fecha y dejar a todos los buenos inventa una caída
  // más baja: con las solicitudes del ciclo simulado, 191 de 211 malos no
  // tienen fecha (el buró no la da) y la curva decía 0,9% en vez de ~8%.
  const malosConFecha = c.sujetos.filter((s) => s.evento).length;
  if (c.sinFecha > 0.1 * (c.sinFecha + malosConFecha)) {
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
        <p style={{ marginTop: 0 }}>
          <strong>Sin cosechas para esta población:</strong> {num(c.sinFecha)} de {num(c.sinFecha + malosConFecha)} malos no tienen la fecha del primer impago.
        </p>
        <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
          {poblacion === "solicitudes"
            ? "Para quien no recibió el crédito de la institución, el impago lo ve la reconsulta del buró, que no trae la fecha en que empezó. Las cosechas se miran con los créditos de la institución (la otra población), que sí la tienen."
            : "El archivo exige la fecha a quien cayó desde la 101; las cargas anteriores no la traen. Sacar a esos malos y dejar a todos los buenos dibujaría una caída más baja que la real."}
        </p>
      </div>
    );
  }
  const curva = (pasos) => pasos.map((p) => ({ x: p.tiempo, y: 1 - p.supervivencia, titulo: `${dec(p.tiempo, 1)} meses: ${pct(1 - p.supervivencia)} cayó (${num(p.enRiesgo)} en seguimiento)` }));

  return (
    <div>
      <SinGuardar error={sinGuardar} />
      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <span className="crediscope-muted" style={{ fontSize: 13 }}>Cosechas por</span>
        <select value={agrupar} onChange={(e) => setAgrupar(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
          <option value="mes">mes</option>
          <option value="trimestre">trimestre</option>
        </select>
      </div>

      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Créditos con fecha" valor={num(c.sujetos.length)} detalle={`${num(c.sujetos.filter((s) => s.evento).length)} cayeron`} />
        {HORIZONTES.map((h) => (
          <Kpi key={h} etiqueta={`Caída acumulada a ${h} meses`} valor={pct(acumuladaA(c.todas, h, c.seguimientoTotal))} detalle={c.seguimientoTotal < h ? "Nadie se siguió tanto" : "Todas las cosechas"} />
        ))}
      </div>
      {c.sinFecha ? (
        <p className="crediscope-muted" style={{ fontSize: 13, color: "var(--warn)" }}>
          {num(c.sinFecha)} malos sin fecha del primer impago quedan afuera.
        </p>
      ) : null}

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Caída acumulada por cosecha</h3>
        <GraficoLineas
          series={[
            ...c.cosechas.map((k, i) => ({ nombre: k.nombre, color: PALETA[(i + 1) % PALETA.length], puntos: curva(k.pasos), escalon: true })),
            ...(c.cosechas.length > 1 ? [{ nombre: "Todas", color: "var(--text)", punteada: true, puntos: curva(c.todas), escalon: true }] : []),
          ]}
          x={{ titulo: "Meses desde el desembolso", min: 0 }}
          y={{ titulo: "Cayó (acumulado)", min: 0, formato: (v) => pct(v, 0) }}
          etiqueta="Caída acumulada por cosecha"
        />
        {c.prueba ? (
          <p className="crediscope-muted" style={{ fontSize: 13, marginBottom: 0 }}>
            ¿Las cosechas caen distinto? Log-rank: chi² {dec(c.prueba.chi2, 2)} con {c.prueba.gl} grados de libertad, p = {dec(c.prueba.p, 4)}
            {c.prueba.p < 0.05 ? ": sí, más de lo que da el azar." : ": no se distinguen del azar."}
          </p>
        ) : null}
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Cada cosecha</h3>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Cosecha</th>
                <th style={{ textAlign: "right" }}>Créditos</th>
                <th style={{ textAlign: "right" }}>Cayeron</th>
                {HORIZONTES.map((h) => <th key={h} style={{ textAlign: "right" }}>A {h} meses</th>)}
                <th style={{ textAlign: "right" }}>Seguimiento máximo</th>
              </tr>
            </thead>
            <tbody>
              {c.cosechas.map((k) => (
                <tr key={k.nombre}>
                  <td>{k.nombre}</td>
                  <td style={{ textAlign: "right" }}>{num(k.n)}</td>
                  <td style={{ textAlign: "right" }}>{num(k.malos)}</td>
                  {k.acumulada.map((v, i) => <td key={HORIZONTES[i]} style={{ textAlign: "right" }}>{v === null ? <span className="crediscope-muted">sin madurar</span> : pct(v)}</td>)}
                  <td style={{ textAlign: "right" }}>{dec(k.seguimiento, 1)} meses</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
