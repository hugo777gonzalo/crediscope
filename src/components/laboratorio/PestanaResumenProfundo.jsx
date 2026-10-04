import { useEffect, useMemo, useState } from "react";
import { getCoberturaDeLaEstructura } from "../../lib/laboratorio.js";
import { useColumnasDelCorte } from "../../lib/useFilasDelCorte.js";
import { explorarSignificancia } from "../../lib/analisisEstadistico.js";
import { MensajeError, Cargando, num } from "./Comunes.jsx";

// El resumen del Descubrimiento profundo: el camino de un dato desde el
// crudo de Novadata hasta el modelo, y en cada paso cuánto se pierde y
// cuánto de lo que se pierde anticipaba el impago.
//   crudo (todo lo que contestan las 52 fuentes)
//   → estructura (lo que lee process.ts: el perfil estandarizado)
//   → modelo (el perfil del modelo: el perfil menos lo apagado, con la
//     disponibilidad por tema en vez de metaConsulta y un resumen de las
//     fuentes de ingreso)

function Paso({ titulo, cifra, detalle, perdida, colorPerdida = "var(--bad)" }) {
  return (
    <div className="crediscope-card" style={{ margin: 0 }}>
      <p className="crediscope-kpi-label">{titulo}</p>
      <p className="crediscope-kpi-valor">{cifra}</p>
      <p className="crediscope-kpi-detalle">{detalle}</p>
      {perdida ? <p style={{ fontSize: 12.5, color: colorPerdida, margin: "6px 0 0" }}>{perdida}</p> : null}
    </div>
  );
}

export default function PestanaResumenProfundo({ corteId, poblacion, ultimo }) {
  const crudo = ultimo("crudo")?.resultado ?? null;
  const [cobertura, setCobertura] = useState(null);
  const [error, setError] = useState(null);
  const { datos, error: errorDatos } = useColumnasDelCorte(corteId, poblacion);
  useEffect(() => {
    let vigente = true;
    getCoberturaDeLaEstructura(corteId).then((d) => vigente && setCobertura(d)).catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [corteId]);
  const sig = useMemo(() => (datos ? explorarSignificancia(datos) : null), [datos]);

  if (error || errorDatos) return <MensajeError mensaje={error ?? errorDatos} />;
  if (!cobertura || !sig) return <Cargando que="el resumen" />;
  const camposCrudo = (crudo?.diccionario ?? []).filter((d) => ["número", "fecha", "texto", "sí/no"].includes(d.tipo));
  const noLeidos = camposCrudo.filter((d) => !d.nombrado);
  const noVistosCrudo = (crudo?.hallazgos ?? []).filter((h) => h.significativa && h.el_modelo === "no_lo_tenia" && !h.nombrado);
  const conValor = cobertura.campos.filter((c) => c.con_valor > 0);
  const apagados = cobertura.campos.filter((c) => !c.habilitado);
  const noLlegan = sig.filter((s) => !s.enModelo && s.uso !== "protegida");
  const noLleganAsociadas = noLlegan.filter((s) => (s.q ?? 1) < 0.05);

  return (
    <div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", marginBottom: 12 }}>
        <Paso
          titulo="1. El crudo de Novadata"
          cifra={crudo ? num(camposCrudo.length) : "sin calcular"}
          detalle={crudo ? `campos en ${num(crudo.fuentes?.length)} fuentes, del día del análisis` : "Correr el explorador del crudo en este corte"}
          perdida={crudo ? `${num(noLeidos.length)} la estructura no los lee · ${num(noVistosCrudo.length)} de ellos anticipan el impago y el modelo no los tenía` : null}
        />
        <Paso
          titulo="2. La estructura"
          cifra={num(cobertura.campos.length)}
          detalle={`campos configurados · ${num(conValor.length)} con algún dato en las ${num(cobertura.perfiles)} personas del corte`}
          perdida={`${num(cobertura.campos.length - conValor.length)} siempre vacíos en el corte · ${num(cobertura.sin_configurar?.length ?? 0)} fuera de la configuración`}
          colorPerdida="var(--warn)"
        />
        <Paso
          titulo="3. Lo que lee el modelo"
          cifra={`${num(cobertura.campos.length - apagados.length)} de ${num(cobertura.campos.length)}`}
          detalle="campos: el perfil entero menos los apagados, con la disponibilidad por tema y un resumen de las fuentes de ingreso"
          perdida={`${num(apagados.length)} apagados en Campos del análisis`}
          colorPerdida="var(--warn)"
        />
        <Paso
          titulo="4. Lo que anticipa el impago"
          cifra={num(sig.filter((s) => (s.q ?? 1) < 0.05).length)}
          detalle={`de ${num(sig.length)} variables del catálogo, significativas después de la corrección`}
          perdida={`${num(noLleganAsociadas.length)} de ellas el modelo no las recibe${noLleganAsociadas.length ? `: ${noLleganAsociadas.map((s) => s.nombre).join(", ")}` : ""}`}
        />
      </div>
      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Dónde mirar</h3>
        <ul style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7 }}>
          <li><strong>Explorador del crudo</strong>: los {num(noVistosCrudo.length)} campos del crudo que anticipan, el modelo no tenía y la estructura no lee.</li>
          <li><strong>Estructura</strong>: los campos siempre vacíos, apagados o que cambiaron entre versiones.</li>
          <li><strong>Entrada al modelo</strong>: qué leyó el modelo en cada análisis y si coincide con lo que hoy le daríamos.</li>
          <li><strong>Los que cayeron</strong> e <strong>Investigación</strong>: en qué se distinguían los aprobados que no pagaron, caso por caso.</li>
          <li><strong>Taller</strong> y <strong>Registro de candidatas</strong>: probar una variable nueva y llevarla hasta una propuesta.</li>
        </ul>
      </div>
    </div>
  );
}
