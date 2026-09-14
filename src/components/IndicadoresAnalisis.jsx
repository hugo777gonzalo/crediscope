import { ShieldCheck, FileClock, Wallet } from "lucide-react";

// Los dos indicadores de lectura rápida que devuelve el análisis
// (marco-v15): nivel de riesgo e historial de pago. Son etiquetas, no
// texto -- el porqué está en el resumen.
//
// El tercero del diseño, capacidad de pago, se muestra como pendiente a
// propósito: todavía no hay una fuente de ingresos confiable con qué
// calcularlo. Se deja visible y explicado en vez de ocultarlo, para que
// quede claro que falta la fuente, no el análisis.

const COLOR_RIESGO = {
  "muy bajo": "var(--good)",
  bajo: "var(--good)",
  moderado: "var(--warn)",
  alto: "var(--bad)",
  "muy alto": "var(--bad)",
};

const COLOR_HISTORIAL = {
  excelente: "var(--good)",
  bueno: "var(--good)",
  regular: "var(--warn)",
  malo: "var(--bad)",
  "sin historial": "var(--text-muted)",
};

function mayuscula(texto) {
  return texto ? texto.charAt(0).toUpperCase() + texto.slice(1) : "";
}

function Indicador({ Icono, etiqueta, valor, color, titulo }) {
  return (
    <div className="crediscope-indicador" title={titulo}>
      <span className="crediscope-indicador-icono" style={{ color }}>
        <Icono size={17} />
      </span>
      <span>
        <span className="crediscope-indicador-etiqueta">{etiqueta}</span>
        <span className="crediscope-indicador-valor" style={{ color }}>
          {valor}
        </span>
      </span>
    </div>
  );
}

export default function IndicadoresAnalisis({ riesgo, historial }) {
  if (!riesgo && !historial) return null;

  return (
    <div className="crediscope-indicadores">
      {riesgo ? (
        <Indicador
          Icono={ShieldCheck}
          etiqueta="Riesgo"
          valor={mayuscula(riesgo)}
          color={COLOR_RIESGO[riesgo] ?? "var(--text)"}
          titulo="Nivel de riesgo crediticio general, según el mismo análisis que produjo el score."
        />
      ) : null}
      {historial ? (
        <Indicador
          Icono={FileClock}
          etiqueta="Historial"
          valor={mayuscula(historial)}
          color={COLOR_HISTORIAL[historial] ?? "var(--text)"}
          titulo="Calidad del comportamiento de pago demostrado (bancos, cooperativas, comportamiento interno y demandas de cobro)."
        />
      ) : null}
      <Indicador
        Icono={Wallet}
        etiqueta="Capacidad"
        valor="Sin fuente"
        color="var(--text-muted)"
        titulo="Pendiente: todavía no hay una fuente de ingresos confiable con qué estimar la capacidad de pago."
      />
    </div>
  );
}
