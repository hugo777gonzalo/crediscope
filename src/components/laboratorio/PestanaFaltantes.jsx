import { useMemo, useState } from "react";
import { useColumnasDelCorte } from "../../lib/useFilasDelCorte.js";
import { faltantes } from "../../lib/analisisEstadistico.js";
import { GraficoLineas, MapaDeCalor } from "./Graficos.jsx";
import { MensajeError, Cargando, num, pct, dec } from "./Comunes.jsx";

// Datos faltantes: ¿la ausencia anticipa el impago, o es un problema de
// captura? Por variable, la tasa de malos con y sin el dato (y si la
// diferencia es más que azar, corregido por comparaciones múltiples), qué
// variables faltan juntas (la misma fuente que no contestó) y cuántas
// faltan por mes (una fuente que dejó de contestar se ve como un salto).
//
// Límite: el corte guarda el valor de la variable, no si la fuente
// "no tiene" o "no contestó"; eso está en la disponibilidad por tema del
// perfil (metaConsulta), que el corte no congela.

export default function PestanaFaltantes({ corteId, poblacion }) {
  const { datos, error } = useColumnasDelCorte(corteId, poblacion);
  const c = useMemo(() => (datos ? faltantes(datos) : null), [datos]);
  const [elegida, setElegida] = useState(null);
  if (error) return <MensajeError mensaje={error} />;
  if (!c) return <Cargando que="las variables del corte" />;
  const conFaltas = c.porVariable.filter((v) => v.faltan > 0);
  const detalle = c.porVariable.find((v) => v.id === elegida) ?? conFaltas[0] ?? null;

  return (
    <div>
      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Variables con faltantes ({conFaltas.length} de {c.porVariable.length})</h3>
        {conFaltas.length ? (
          <div style={{ overflowX: "auto" }}>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Variable</th>
                  <th style={{ textAlign: "right" }}>Faltan</th>
                  <th style={{ textAlign: "right" }}>Tasa sin el dato</th>
                  <th style={{ textAlign: "right" }}>Tasa con el dato</th>
                  <th style={{ textAlign: "right" }}>q</th>
                  <th>¿La ausencia anticipa?</th>
                </tr>
              </thead>
              <tbody>
                {conFaltas.map((v) => (
                  <tr key={v.id} onClick={() => setElegida(v.id)} style={{ cursor: "pointer", background: detalle?.id === v.id ? "var(--panel-muted)" : undefined }}>
                    <td><strong>{v.nombre}</strong><div className="crediscope-muted" style={{ fontSize: 12 }}>{v.grupo}</div></td>
                    <td style={{ textAlign: "right" }}>{num(v.faltan)} <span className="crediscope-muted">({pct(v.parte, 0)})</span></td>
                    <td style={{ textAlign: "right" }}>{pct(v.tasaSinDato)}</td>
                    <td style={{ textAlign: "right" }}>{pct(v.tasaConDato)}</td>
                    <td style={{ textAlign: "right" }}>{v.q === null ? "—" : v.q < 0.0001 ? "< 0,0001" : dec(v.q, 4)}</td>
                    <td>{v.q !== null && v.q < 0.05 ? <strong style={{ color: "var(--bad)" }}>Sí</strong> : "No se distingue del azar"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>Ninguna variable tiene faltantes en este corte.</p>
        )}
      </div>

      {detalle ? (
        <div className="crediscope-card">
          <h3 style={{ marginTop: 0 }}>Faltantes de «{detalle.nombre}» por mes</h3>
          <GraficoLineas
            series={[{ nombre: "Faltan", puntos: detalle.porMes.map((m, i) => ({ x: i, y: m.n ? m.faltan / m.n : 0, titulo: `${m.mes}: ${num(m.faltan)} de ${num(m.n)}` })) }]}
            x={{ titulo: "Mes", formato: (v) => detalle.porMes[Math.round(v)]?.mes ?? "" }}
            y={{ titulo: "Parte sin el dato", min: 0, max: 1, formato: (v) => pct(v, 0) }}
            alto={220}
            etiqueta="Faltantes por mes"
          />
        </div>
      ) : null}

      {c.matriz.variables.length > 1 ? (
        <div className="crediscope-card">
          <h3 style={{ marginTop: 0 }}>¿Faltan juntas?</h3>
          <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
            Correlación entre "falta esta" y "falta aquella": rojo, faltan a la vez (casi siempre, la misma fuente que no contestó o no tenía nada).
          </p>
          <MapaDeCalor filas={c.matriz.variables} columnas={c.matriz.variables} valor={(i, j) => c.matriz.valores[i][j]} etiqueta="Faltantes conjuntos" />
        </div>
      ) : null}
      <p className="crediscope-muted" style={{ fontSize: 12.5 }}>
        El corte guarda el valor de cada variable, no si la fuente "no tenía nada" o "no contestó": eso está en la disponibilidad por tema de cada perfil,
        que todavía no se congela con el corte.
      </p>
    </div>
  );
}
