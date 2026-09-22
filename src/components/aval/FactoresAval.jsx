import { TrendingUp, TrendingDown } from "lucide-react";
import { formatearValorAval } from "../../lib/avalCampos.js";

// Los 10 factores que Aval calcula para su score (factoresScore),
// separados por efecto. Es la tabla que el usuario pidió para graficar
// qué suma y qué resta -- distinta de "Puntos positivos/negativos" de
// Análisis con IA porque acá cada fila es un NÚMERO con un signo
// conocido, no una frase generada por el modelo.
//
// Aval no manda un `tipo` por factor: los que empiezan con "Valor" son
// montos (los dos únicos hoy: demanda judicial y cartera castigada
// histórica), el resto son conteos. Heurística chica y estable porque
// son 10 factores fijos, no un catálogo abierto.
function tipoDeFactor(nombre) {
  return nombre.startsWith("Valor") ? "dinero" : "entero";
}

function Columna({ titulo, Icono, color, factores }) {
  return (
    <div>
      <p style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13.5, color, margin: "0 0 8px" }}>
        <Icono size={15} />
        {titulo}
      </p>
      {factores.length === 0 ? (
        <p className="crediscope-muted" style={{ fontSize: 13, margin: 0 }}>Ninguno.</p>
      ) : (
        <ul className="crediscope-items" style={{ margin: 0 }}>
          {factores.map((f, i) => (
            <li key={i} className="crediscope-item" style={{ justifyContent: "space-between", gap: 12 }}>
              <span className="crediscope-item-detalle">{f.factor}</span>
              <strong style={{ whiteSpace: "nowrap", color }}>{formatearValorAval(f.valor, tipoDeFactor(f.factor))}</strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FactoresAval({ factores }) {
  const lista = factores || [];
  const suman = lista.filter((f) => f.efecto === "+");
  const restan = lista.filter((f) => f.efecto === "-");

  if (lista.length === 0) return null;

  return (
    <div className="crediscope-card">
      <h3 style={{ margin: "0 0 12px" }}>Factores del score</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Columna titulo="Suman al score" Icono={TrendingUp} color="var(--good)" factores={suman} />
        <Columna titulo="Restan del score" Icono={TrendingDown} color="var(--bad)" factores={restan} />
      </div>
    </div>
  );
}
