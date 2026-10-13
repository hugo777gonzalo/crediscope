import { entero, decimal } from "../../lib/formatos.js";

// Tarjeta de indicador: etiqueta (con ícono si se quiere), cifra grande y una
// línea de detalle.
//
// Estaba escrita ocho veces (Costos ×4, Lotes, Fuentes de Ingreso, Reportes
// y Laboratorio), igual salvo el ícono. Y como cada copia recibía el número
// tal cual, la misma cifra salía "2.812" en una pantalla y "2812" en otra.
// Un número que llega acá siempre se escribe con los separadores de la casa;
// un texto se muestra como viene.

export default function Kpi({ Icono = null, etiqueta, valor, detalle = null, color = null }) {
  const visible = typeof valor === "number" ? (Number.isInteger(valor) ? entero(valor) : decimal(valor, 2)) : valor;
  return (
    <div className="crediscope-card crediscope-kpi">
      <p className="crediscope-kpi-label">
        {Icono ? <Icono size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} aria-hidden="true" /> : null}
        {etiqueta}
      </p>
      <p className="crediscope-kpi-valor" style={color ? { color } : undefined}>{visible}</p>
      {detalle ? <p className="crediscope-kpi-detalle">{detalle}</p> : null}
    </div>
  );
}
