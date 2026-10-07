import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, AlertTriangle, ArrowLeft } from "lucide-react";
import { guardarCalculo } from "../../lib/calculosDelCorte.js";

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

export const ETIQUETA_RECOMENDACION = {
  aprobar: "Aprobar",
  revisar: "Revisar",
  negar: "Negar",
  bloqueado: "Negado por bloqueo",
  "sin recomendación": "Sin recomendación",
};

// Los motivos del impago (lab_calcular_motivos) y los eventos entre dos
// consultas (eventos-entre-consultas.ts), en palabras del negocio. Los tres
// últimos sólo existen en la verdad plantada de una simulación.
export const ETIQUETA_MOTIVO = {
  cuota_no_cabia: "La cuota no cabía en su ingreso",
  capacidad_no_medible: "Ingreso por confirmar o sin determinar",
  el_modelo_lo_vio: "El modelo dijo negar",
  el_modelo_advirtio: "El modelo dijo revisar",
  credito_otra_institucion: "Otra institución le prestó",
  credito_institucion: "El crédito de la institución",
  perdida_trabajo: "Perdió el trabajo",
  cierre_negocio: "Cerró su negocio",
  pension_alimenticia: "Pensión alimenticia nueva",
  demanda_civil: "Demanda civil",
  proceso_fiscalia: "Proceso en Fiscalía",
  mora_credito_previo: "Mora en un crédito que ya tenía",
  demanda_cobro: "Demanda de cobro",
  trabajo_nuevo: "Trabajo nuevo",
  sin_causa_visible: "Ningún evento lo explica: buscar en Variables",
  riesgo_visible: "Riesgo que el modelo ve",
  dato_no_recibido: "Dato que el modelo no recibe",
  dato_solo_crudo: "Dato que sólo está en el crudo",
};

// lab_calcular_motivos desde la 103. "anticipable" queda para la verdad
// plantada de una simulación, que se clasificó con la regla anterior. Desde
// la 110 "lo vio" es sólo negar: revisar es "no impago" (decisión del
// negocio del 2026-10-06); un resultado guardado antes lo contaba.
export const ETIQUETA_SE_PODIA_VER = {
  el_modelo_lo_vio: "El modelo lo vio (dijo negar)",
  anticipable_no_visto: "Se podía ver y el modelo no lo vio",
  vulnerabilidad_visible: "Golpe imprevisible sobre un perfil frágil",
  no_anticipable: "Golpe imprevisible sobre un perfil sólido",
  sin_causa_visible: "Ningún evento lo explica: buscar en Variables",
  anticipable: "Anticipable: estaba en el perfil",
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

export function Cargando({ que = "las filas del corte" }) {
  return <p className="crediscope-muted">Cargando {que}...</p>;
}

export function MensajeError({ mensaje }) {
  if (!mensaje) return null;
  return (
    <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
      <p style={{ color: "var(--bad)", margin: 0 }}>{mensaje}</p>
    </div>
  );
}

// Lo que se calcula en una pestaña se guarda solo (useGuardarResultado): si
// no se pudo, se dice.
export function SinGuardar({ error }) {
  if (!error) return null;
  return <p style={{ color: "var(--bad)", fontSize: 12.5 }}>No se guardó este resultado: {error}</p>;
}

// Para lo que se mueve a mano (umbrales, tramos, una fórmula, una variable):
// se guarda cuando la persona decide que es evidencia.
export function GuardarEsteResultado({ corteId, tipo, poblacion = null, parametros = {}, resultado, texto = "Guardar este resultado" }) {
  const [estado, setEstado] = useState(null);
  const clave = JSON.stringify(parametros);
  useEffect(() => setEstado(null), [clave]);
  async function guardar() {
    setEstado("guardando");
    try {
      await guardarCalculo({ corteId, tipo, poblacion, parametros, resultado });
      setEstado("guardado");
    } catch (e) {
      setEstado(e.message ?? String(e));
    }
  }
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", margin: "8px 0" }}>
      <button className="crediscope-btn crediscope-btn-ghost" onClick={guardar} disabled={!resultado || estado === "guardando" || estado === "guardado"}>
        {estado === "guardado" ? "Guardado" : estado === "guardando" ? "Guardando..." : texto}
      </button>
      {estado && !["guardando", "guardado"].includes(estado) ? <span style={{ color: "var(--bad)", fontSize: 12.5 }}>{estado}</span> : null}
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
