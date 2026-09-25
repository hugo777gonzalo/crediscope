import { Gauge, TrendingUp, TrendingDown } from "lucide-react";
import { TituloTarjeta, Valor } from "../reporte/Piezas.jsx";

// Los 10 factores con que Aval arma su score (factoresScore), separados por
// el efecto que Aval les asigna. El efecto es fijo por factor -- medido
// sobre las 240 del pool: 3 siempre "+", 7 siempre "-" --, así que la
// columna dice qué empuja el score para cada lado, no si a esta persona le
// fue bien o mal. Por eso un "-" en cero va apagado y no en rojo: el
// factor resta, pero a esta persona no le restó nada.
//
// Aval no manda un tipo por factor: los que empiezan con "Valor" son montos
// (demanda judicial y cartera castigada históricas), el resto son conteos.
// Heurística chica y estable porque son 10 factores fijos, no un catálogo
// abierto.
function tipoDeFactor(nombre) {
  return nombre.startsWith("Valor") ? "dinero" : "entero";
}

function Grupo({ titulo, Icono, claseTitulo, factores, restan }) {
  return (
    <div className="crediscope-aval-subseccion">
      <p className={`crediscope-aval-subtitulo ${claseTitulo}`}>
        <Icono size={14} />
        {titulo}
      </p>
      {factores.length === 0 ? (
        <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>Ninguno.</p>
      ) : (
        <ul className="crediscope-aval-filas">
          {factores.map((f, i) => (
            <li key={i} className="crediscope-aval-fila-campo">
              <span>{f.factor}</span>
              <strong className={!restan && typeof f.valor === "number" && f.valor > 0 ? "crediscope-aval-bueno" : undefined}>
                <Valor valor={f.valor} tipo={tipoDeFactor(f.factor)} alerta={restan} />
              </strong>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function ResumenScore({ factores }) {
  const lista = factores || [];
  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={Gauge}>Resumen del score</TituloTarjeta>
      {lista.length === 0 ? (
        <p className="crediscope-muted" style={{ margin: 0 }}>Aval no entregó los factores del score.</p>
      ) : (
        <>
          <Grupo
            titulo="Suman al score"
            Icono={TrendingUp}
            claseTitulo="crediscope-aval-bueno"
            factores={lista.filter((f) => f.efecto === "+")}
          />
          <Grupo
            titulo="Restan al score"
            Icono={TrendingDown}
            claseTitulo="crediscope-aval-malo"
            factores={lista.filter((f) => f.efecto === "-")}
            restan
          />
        </>
      )}
    </div>
  );
}
