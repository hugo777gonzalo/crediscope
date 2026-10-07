import { useMemo, useState } from "react";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { filasConPuntaje } from "../../lib/datosDelCorte.js";
import { umbral, cuantil } from "../../lib/estadistica.js";
import { curvaDeUmbrales, politica, motorPorRecomendacion } from "../../lib/analisisRetrospectivo.js";
import { GraficoLineas } from "./Graficos.jsx";
import { Kpi, MensajeError, Cargando, GuardarEsteResultado, ETIQUETA_RECOMENDACION, num, pct } from "./Comunes.jsx";

// Umbrales: qué pasaría con una política "aprobar desde el puntaje A" (y,
// si se quiere, "revisar entre B y A"). Simula una regla, NO al motor: el
// motor no decide por un umbral de puntaje, recomienda con el marco. Sirve
// para ver cuánta aprobación cuesta cada punto de mora y para comparar con
// lo que hizo el motor en el mismo corte.

export default function PestanaUmbrales({ corteId, poblacion }) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const base = useMemo(() => (filas ? filasConPuntaje(filas) : null), [filas]);
  const u = useMemo(() => (base?.length ? curvaDeUmbrales(base) : null), [base]);
  const acumulados = u?.acumulados ?? null, puntajes = u?.puntajes ?? [], curva = u?.curva ?? [];
  const [aprobarDesde, setAprobarDesde] = useState(null);
  const [revisarDesde, setRevisarDesde] = useState(null);

  if (error) return <MensajeError mensaje={error} />;
  if (!base) return <Cargando />;
  if (!acumulados?.totalMalos || !acumulados.totalBuenos) return <p className="crediscope-muted">Hace falta tener buenos y malos con puntaje.</p>;

  const minimo = puntajes[0], maximo = puntajes[puntajes.length - 1];
  const a = aprobarDesde ?? Math.round(cuantil(puntajes, 0.3));
  const b = Math.min(revisarDesde ?? a, a);
  const r = umbral(acumulados, a);
  const zonas = politica(base, a, b).map(([rec, z]) => [ETIQUETA_RECOMENDACION[rec], z]);
  const motor = motorPorRecomendacion(base).map(([rec, z]) => [ETIQUETA_RECOMENDACION[rec], z]);

  return (
    <div>
      <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
        <p style={{ margin: 0, fontSize: 13.5 }}>
          Esto simula una política por puntaje, no al motor: el motor recomienda con el marco, y un mismo puntaje puede salir aprobar o revisar.
          Sirve para ver qué costaría cada umbral y compararlo con lo que hizo el motor.
        </p>
      </div>

      <div className="crediscope-card">
        <label style={{ display: "block", marginBottom: 10 }}>
          <strong>Aprobar desde el puntaje {num(a)}</strong>
          <input type="range" min={minimo} max={maximo} value={a} onChange={(e) => setAprobarDesde(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
        <label style={{ display: "block" }}>
          <strong>Revisar desde el puntaje {num(b)}</strong> <span className="crediscope-muted">(igual al de aprobar: sin zona de revisión)</span>
          <input type="range" min={minimo} max={a} value={b} onChange={(e) => setRevisarDesde(Number(e.target.value))} style={{ width: "100%" }} />
        </label>
      </div>

      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Tasa de aprobación" valor={pct(r.tasaAprobacion)} detalle={`${num(r.aprobados)} aprobados`} />
        <Kpi etiqueta="Malos entre los aprobados" valor={pct(r.tasaMalosAprobados)} detalle={`${num(r.malosAprobados)} malos aprobados`} />
        <Kpi etiqueta="Malos detectados" valor={pct(r.sensibilidad)} detalle="de todos los malos quedan afuera" />
        <Kpi etiqueta="Buenos rechazados" valor={num(r.buenosRechazados)} detalle={`${pct(1 - r.especificidad)} de los buenos`} />
      </div>
      <GuardarEsteResultado
        corteId={corteId} tipo="umbrales" poblacion={poblacion} parametros={{ aprobarDesde: a, revisarDesde: b }}
        resultado={{ aprobarDesde: a, revisarDesde: b, medidas: r, zonas, motor, n: base.length, n_malos: acumulados.totalMalos }}
        texto="Guardar estos umbrales"
      />

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))" }}>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Con esta política</h3>
          <TablaZonas zonas={zonas} />
        </div>
        <div className="crediscope-card" style={{ margin: 0 }}>
          <h3 style={{ marginTop: 0 }}>Lo que hizo el motor</h3>
          <TablaZonas zonas={motor} />
        </div>
      </div>

      <div className="crediscope-card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Cada umbral</h3>
        <GraficoLineas
          series={[
            { nombre: "Tasa de aprobación", color: "var(--brand)", puntos: curva.map((u) => ({ x: u.umbral, y: u.tasaAprobacion })) },
            { nombre: "Malos entre los aprobados", color: "var(--bad)", puntos: curva.filter((u) => u.tasaMalosAprobados !== null).map((u) => ({ x: u.umbral, y: u.tasaMalosAprobados })) },
            { nombre: "Malos detectados", color: "var(--warn)", punteada: true, puntos: curva.map((u) => ({ x: u.umbral, y: u.sensibilidad })) },
            { nombre: "Buenos aprobados (especificidad)", color: "var(--good)", punteada: true, puntos: curva.map((u) => ({ x: u.umbral, y: u.especificidad })) },
          ]}
          x={{ titulo: "Aprobar desde el puntaje" }}
          y={{ titulo: "Proporción", min: 0, max: 1, formato: (v) => pct(v, 0) }}
          referencias={[{ x: a, texto: "elegido" }]}
          etiqueta="Medidas por umbral"
        />
      </div>
    </div>
  );
}

function TablaZonas({ zonas }) {
  return (
    <table className="crediscope-table" style={{ margin: 0 }}>
      <thead>
        <tr>
          <th>Decisión</th>
          <th style={{ textAlign: "right" }}>Personas</th>
          <th style={{ textAlign: "right" }}>Malos</th>
          <th style={{ textAlign: "right" }}>Tasa</th>
          <th style={{ textAlign: "right" }}>Intervalo</th>
        </tr>
      </thead>
      <tbody>
        {zonas.map(([nombre, z]) => (
          <tr key={nombre}>
            <td>{nombre}</td>
            <td style={{ textAlign: "right" }}>{num(z.n)}</td>
            <td style={{ textAlign: "right" }}>{num(z.malos)}</td>
            <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(z.tasa)}</td>
            <td style={{ textAlign: "right" }} className="crediscope-muted">{z.ic ? `${pct(z.ic[0])} a ${pct(z.ic[1])}` : "—"}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
