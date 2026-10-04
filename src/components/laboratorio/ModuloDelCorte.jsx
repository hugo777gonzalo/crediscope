import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { RefreshCw } from "lucide-react";
import { getCortes, getCorte, getResultados, calcular } from "../../lib/laboratorio.js";
import { formatearFechaHora } from "../../lib/fechas.js";
import { MensajeError, FranjaSintetica } from "./Comunes.jsx";

// El armazón de los módulos que trabajan sobre un corte congelado (Prueba
// retrospectiva, Descubrimiento estadístico, Descubrimiento profundo): el
// corte elegido, la población, las pestañas y, en las que calcula la base,
// el botón de calcular. El corte y la pestaña viven en la dirección
// (?corte=…&pestana=…), así un enlace lleva a la misma vista; el último
// corte usado se recuerda en este navegador.
//
// Cada pestaña es { clave, texto, Componente, calculo?, usaPoblacion?,
// requiere?(corte) }. `calculo` es el tipo de lab_resultados que calcula
// una función lab_* de la base (src/lib/laboratorio.js, FUNCION).

const CLAVE_CORTE = "crediscope.laboratorio.corte";
const ETIQUETA_POBLACION = {
  operaciones: "Con el crédito de la institución",
  solicitudes: "Todas las solicitudes observadas",
};

function leerCorteRecordado() {
  try {
    return localStorage.getItem(CLAVE_CORTE);
  } catch {
    return null;
  }
}

function recordarCorte(id) {
  try {
    localStorage.setItem(CLAVE_CORTE, id);
  } catch {
    // sin localStorage (modo privado): se elige de nuevo la próxima vez
  }
}

export default function ModuloDelCorte({ titulo, descripcion, pestanas, poblacionPorDefecto = "operaciones" }) {
  const [params, setParams] = useSearchParams();
  const [cortes, setCortes] = useState(null);
  const [corte, setCorte] = useState(null);
  const [resultados, setResultados] = useState([]);
  const [error, setError] = useState(null);
  const [calculando, setCalculando] = useState(null);
  const corteId = params.get("corte");

  useEffect(() => {
    getCortes().then(setCortes).catch((e) => setError(e.message));
  }, []);

  // Sin corte en la dirección: el último usado o el más reciente.
  useEffect(() => {
    if (corteId || !cortes?.length) return;
    const recordado = leerCorteRecordado();
    const elegido = cortes.find((c) => c.id === recordado) ?? cortes[0];
    setParams((p) => { const n = new URLSearchParams(p); n.set("corte", elegido.id); return n; }, { replace: true });
  }, [corteId, cortes, setParams]);

  useEffect(() => {
    if (!corteId) return;
    recordarCorte(corteId);
    let vigente = true;
    Promise.all([getCorte(corteId), getResultados(corteId)])
      .then(([c, r]) => {
        if (!vigente) return;
        setCorte(c);
        setResultados(r);
      })
      .catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [corteId]);

  const recargar = useCallback(async () => setResultados(await getResultados(corteId)), [corteId]);

  if (error && !corte) return <MensajeError mensaje={error} />;
  if (cortes && !cortes.length) {
    return (
      <div className="crediscope-card">
        <h2 style={{ marginTop: 0 }}>{titulo}</h2>
        <p className="crediscope-muted">Todavía no hay cortes: un corte congela una población para analizarla.</p>
        <Link className="crediscope-btn" to="/laboratorio/cortes/nuevo">Nuevo corte</Link>
      </div>
    );
  }
  if (!corte || corte.id !== corteId) return <p className="crediscope-muted">Cargando...</p>;

  const conSolicitudes = Boolean(corte.resumen?.solicitudes);
  const visibles = pestanas.filter((t) => !t.requiere || t.requiere(corte));
  const pestana = visibles.find((t) => t.clave === params.get("pestana")) ?? visibles[0];
  const poblacion = conSolicitudes ? (params.get("poblacion") ?? poblacionPorDefecto) : "operaciones";
  const cambiar = (clave, valor) => setParams((p) => { const n = new URLSearchParams(p); n.set(clave, valor); return n; });

  // El último resultado guardado de un tipo. Variables se guarda por
  // población; antes de la 099 no la anotaba y era la de las operaciones.
  const ultimo = (tipo) =>
    resultados.find((r) => r.tipo === tipo && (tipo !== "variables" || (r.metodologia?.poblacion ?? "operaciones") === poblacion)) ?? null;

  async function correr(tipo) {
    setError(null);
    setCalculando(tipo);
    try {
      await calcular(corteId, tipo, tipo === "variables" ? { p_poblacion: poblacion } : {});
      await recargar();
    } catch (e) {
      setError(e.message);
    } finally {
      setCalculando(null);
    }
  }

  const actual = pestana.calculo ? ultimo(pestana.calculo) : null;
  const Componente = pestana.Componente;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 12 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>{titulo}</h2>
          {descripcion ? <p className="crediscope-muted" style={{ margin: 0, maxWidth: "75ch" }}>{descripcion}</p> : null}
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <label className="crediscope-muted" style={{ fontSize: 13 }}>
            Corte{" "}
            <select value={corteId} onChange={(e) => cambiar("corte", e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
              {(cortes ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.nombre}{c.es_sintetico ? " (sintético)" : ""}</option>
              ))}
            </select>
          </label>
          {conSolicitudes && pestana.usaPoblacion ? (
            <select value={poblacion} onChange={(e) => cambiar("poblacion", e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
              {Object.entries(ETIQUETA_POBLACION).map(([clave, texto]) => (
                <option key={clave} value={clave}>{texto}</option>
              ))}
            </select>
          ) : null}
          <Link className="crediscope-btn crediscope-btn-ghost" to={`/laboratorio/cortes/${corteId}`}>Ficha del corte</Link>
        </div>
      </div>

      {corte.es_sintetico ? <FranjaSintetica que="El resultado de los créditos y el puntaje de este corte" /> : null}

      <div className="crediscope-tabs" style={{ flexWrap: "wrap" }}>
        {visibles.map((t) => (
          <button
            key={t.clave}
            className={`crediscope-tab ${pestana.clave === t.clave ? "crediscope-tab-active" : ""}`}
            onClick={() => cambiar("pestana", t.clave)}
            style={{ border: "none", background: "none", cursor: "pointer" }}
          >
            {t.texto}
          </button>
        ))}
      </div>

      <MensajeError mensaje={error} />

      {pestana.calculo ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "12px 0", flexWrap: "wrap" }}>
          <button className="crediscope-btn" onClick={() => correr(pestana.calculo)} disabled={calculando !== null}>
            <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
            {calculando === pestana.calculo ? "Calculando..." : actual ? "Recalcular" : "Calcular"}
          </button>
          {actual ? <span className="crediscope-muted" style={{ fontSize: 13 }}>Calculado el {formatearFechaHora(actual.created_at)}</span> : null}
        </div>
      ) : null}

      <Componente
        key={`${corteId}|${pestana.clave}|${poblacion}`}
        corte={corte}
        corteId={corteId}
        cortes={cortes ?? []}
        poblacion={poblacion}
        resultados={resultados}
        ultimo={ultimo}
        recargar={recargar}
      />
    </div>
  );
}
