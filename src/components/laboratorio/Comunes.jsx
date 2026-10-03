import { Link } from "react-router-dom";
import { FlaskConical, AlertTriangle, ArrowLeft } from "lucide-react";

// Piezas que comparten las pantallas del Laboratorio.

export const ETIQUETA_VINCULO = {
  exacto: "Con análisis anterior al desembolso",
  perfil_inferido: "Con análisis; perfil reconstruido",
  solo_perfil: "Sólo perfil (sin análisis)",
  consulta_posterior: "Consultada después del desembolso (fuga)",
  fuera_de_ventana: "Consulta más vieja que la ventana",
  sin_consulta: "Nunca se consultó",
};

export const ETIQUETA_ESTADO_CARGA = {
  cargando: "Cargando (incompleta)",
  lista: "Lista",
  con_errores: "Con errores",
  anulada: "Anulada",
};

export const ETIQUETA_TIPO_PROPUESTA = {
  ajuste_criterio: "Ajuste del criterio",
  cambio_marco: "Cambio del marco",
  regla_politica: "Regla de política",
  dato_nuevo: "Dato nuevo",
};

export const ETIQUETA_ESTADO_PROPUESTA = {
  borrador: "Borrador",
  revisada: "Revisada",
  presentada: "Presentada a la IFI",
  aprobada: "Aprobada",
  aplicada: "Aplicada",
  rechazada: "Rechazada",
  retirada: "Retirada",
};

export const pct = (x, decimales = 1) => (x === null || x === undefined ? "—" : `${(Number(x) * 100).toFixed(decimales).replace(".", ",")}%`);
export const num = (x, decimales = 0) =>
  x === null || x === undefined ? "—" : Number(x).toLocaleString("es-EC", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
export const dec = (x, decimales = 3) => (x === null || x === undefined ? "—" : Number(x).toFixed(decimales).replace(".", ","));

export function Volver({ a, texto }) {
  return (
    <p style={{ marginTop: 0 }}>
      <Link to={a} className="crediscope-muted" style={{ textDecoration: "none" }}>
        <ArrowLeft size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
        {texto}
      </Link>
    </p>
  );
}

// Todo lo sintético se ve sintético (principio 5 del diseño): una franja
// que no se puede cerrar.
export function FranjaSintetica({ que = "Estos datos" }) {
  return (
    <div className="crediscope-card" style={{ borderColor: "var(--warn)", background: "var(--panel-muted)", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <FlaskConical size={18} style={{ color: "var(--warn)", flexShrink: 0, marginTop: 2 }} />
      <p style={{ margin: 0, fontSize: 13.5 }}>
        <strong>Sintético.</strong> {que} son inventados con una regla plantada, para probar los cálculos. No dicen nada del
        motor real y no se presentan a una institución financiera.
      </p>
    </div>
  );
}

export function Advertencias({ lista }) {
  if (!lista?.length) return null;
  return (
    <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
      {lista.map((a) => (
        <p key={a} style={{ margin: "2px 0", fontSize: 13.5 }}>
          <AlertTriangle size={14} style={{ color: "var(--warn)", marginRight: 6, verticalAlign: "-2px" }} />
          {a}
        </p>
      ))}
    </div>
  );
}

export function MensajeError({ mensaje }) {
  if (!mensaje) return null;
  return (
    <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
      <p style={{ color: "var(--bad)", margin: 0 }}>{mensaje}</p>
    </div>
  );
}

export function Kpi({ etiqueta, valor, detalle, color }) {
  return (
    <div className="crediscope-card crediscope-kpi">
      <p className="crediscope-kpi-label">{etiqueta}</p>
      <p className="crediscope-kpi-valor" style={color ? { color } : undefined}>{valor}</p>
      {detalle ? <p className="crediscope-kpi-detalle">{detalle}</p> : null}
    </div>
  );
}

// Una barra horizontal proporcional (tasa de malos de un tramo, por ejemplo).
export function Barra({ etiqueta, valor, maximo, texto, color = "var(--brand)" }) {
  const ancho = maximo > 0 ? Math.max(0, Math.min(100, (100 * valor) / maximo)) : 0;
  return (
    <div className="crediscope-barrapct-row">
      <span className="crediscope-barrapct-label">{etiqueta}</span>
      <div className="crediscope-barrapct-track">
        <div className="crediscope-barrapct-fill" style={{ width: `${ancho}%`, background: color }} />
      </div>
      <span className="crediscope-barrapct-valor">{texto}</span>
    </div>
  );
}

export function Etiqueta({ texto, color = "var(--text-muted)" }) {
  return (
    <span className="crediscope-tag" style={{ background: "var(--panel-muted)", color, fontWeight: 700 }}>
      {texto}
    </span>
  );
}
