import { useEffect, useMemo, useState } from "react";
import { getAnalisisRecientes, getAnalisis, getPerfil, getCamposDeshabilitados } from "../../lib/laboratorio.js";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { armarPerfilDelModelo } from "../../../supabase/functions/_shared/perfil-del-modelo.ts";
import { delPerfilAlModelo, diferenciasJson } from "../../lib/analisisProfundo.js";
import { formatearFechaHora } from "../../lib/fechas.js";
import ArbolJson from "./ArbolJson.jsx";
import { MensajeError, Cargando, Etiqueta, ETIQUETA_RECOMENDACION, num } from "./Comunes.jsx";

// Auditoría de la entrada al modelo (módulo 6 del negocio), sin llamar al
// modelo: qué leyó en un análisis. Se rearma desde el perfil con el código de
// hoy (armarPerfilDelModelo) y, si el análisis es posterior a la 090, se
// compara con lo que guardó (mensaje_al_modelo): si difieren, el modelo leyó
// algo distinto de lo que hoy le daríamos. Del perfil a la entrada: qué se
// sacó, qué se apagó (va en null), qué se transformó y qué se agregó. Y la
// entrada de dos análisis lado a lado.

const valorLegible = (v) => (v === null || v === undefined ? "null" : typeof v === "object" ? JSON.stringify(v).slice(0, 90) : String(v));

function Lista({ titulo, items, vacio }) {
  return (
    <div>
      <strong>{titulo} ({num(items.length)})</strong>
      {items.length ? (
        <ul style={{ margin: "4px 0 10px", fontSize: 12.5 }}>
          {items.slice(0, 30).map((d) => <li key={d.ruta}><code>{d.ruta}</code>{d.tipo === "distinto" ? `: ${valorLegible(d.a)} → ${valorLegible(d.b)}` : ""}</li>)}
          {items.length > 30 ? <li className="crediscope-muted">y {items.length - 30} más</li> : null}
        </ul>
      ) : <p className="crediscope-muted" style={{ margin: "4px 0 10px", fontSize: 12.5 }}>{vacio}</p>}
    </div>
  );
}

async function armarEntrada(analisisId, deshabilitados) {
  const analisis = await getAnalisis(analisisId);
  const perfil = analisis.client_profile_id ? await getPerfil(analisis.client_profile_id) : null;
  const entrada = perfil ? armarPerfilDelModelo(perfil.standard_profile, deshabilitados) : null;
  return { analisis, perfil, entrada, guardada: analisis.mensaje_al_modelo?.perfilDelModelo ?? null };
}

export default function PestanaEntradaAlModelo({ corteId, poblacion }) {
  const { filas } = useFilasDelCorte(corteId, poblacion);
  const [recientes, setRecientes] = useState(null);
  const [deshabilitados, setDeshabilitados] = useState(null);
  const [elegido, setElegido] = useState(null);
  const [otro, setOtro] = useState("");
  const [a, setA] = useState(null);
  const [b, setB] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getAnalisisRecientes(80), getCamposDeshabilitados()])
      .then(([r, d]) => { setRecientes(r); setDeshabilitados(d); })
      .catch((e) => setError(e.message));
  }, []);

  // Los análisis del corte, si los tiene (un corte sintético no: su puntaje es inventado).
  const delCorte = useMemo(() => new Set((filas ?? []).map((f) => f.analisisId).filter(Boolean)), [filas]);
  const lista = useMemo(() => {
    if (!recientes) return [];
    const propios = recientes.filter((x) => delCorte.has(x.id));
    return propios.length ? propios : recientes;
  }, [recientes, delCorte]);
  const actual = elegido ?? lista[0]?.id ?? null;

  useEffect(() => {
    if (!actual || !deshabilitados) return undefined;
    let vigente = true;
    setA(null);
    armarEntrada(actual, deshabilitados).then((x) => vigente && setA(x)).catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [actual, deshabilitados]);

  useEffect(() => {
    if (!otro || !deshabilitados) { setB(null); return undefined; }
    let vigente = true;
    armarEntrada(otro, deshabilitados).then((x) => vigente && setB(x)).catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [otro, deshabilitados]);

  const analisisA = useMemo(() => {
    if (!a?.entrada) return null;
    return { pasos: delPerfilAlModelo(a.perfil.standard_profile, a.entrada), contraGuardada: a.guardada ? diferenciasJson(a.guardada, a.entrada) : null };
  }, [a]);
  const entreDos = useMemo(() => (a?.entrada && b?.entrada ? diferenciasJson(a.entrada, b.entrada) : null), [a, b]);

  if (error) return <MensajeError mensaje={error} />;
  if (!recientes) return <Cargando que="los análisis" />;
  const etiqueta = (x) => `${formatearFechaHora(x.created_at)} · ${x.rules_version} · ${x.crediscope_score ?? "sin score"} · ${ETIQUETA_RECOMENDACION[x.recomendacion] ?? x.recomendacion ?? "—"}${x.mensaje_al_modelo ? " · con entrada guardada" : ""}`;

  return (
    <div>
      {!lista.some((x) => delCorte.has(x.id)) ? (
        <p className="crediscope-muted" style={{ fontSize: 13 }}>
          Este corte no tiene análisis del modelo (su puntaje es {filas?.[0]?.fuentePuntaje === "sintetico" ? "sintético" : "de otra fuente"}): se muestran los últimos análisis reales.
        </p>
      ) : null}
      <div className="crediscope-card" style={{ display: "grid", gap: 8 }}>
        <label className="crediscope-muted" style={{ fontSize: 13 }}>
          Análisis{" "}
          <select value={actual ?? ""} onChange={(e) => setElegido(e.target.value)} className="crediscope-input" style={{ width: "auto", maxWidth: "100%" }}>
            {lista.map((x) => <option key={x.id} value={x.id}>{etiqueta(x)}</option>)}
          </select>
        </label>
        <label className="crediscope-muted" style={{ fontSize: 13 }}>
          Comparar con{" "}
          <select value={otro} onChange={(e) => setOtro(e.target.value)} className="crediscope-input" style={{ width: "auto", maxWidth: "100%" }}>
            <option value="">(ninguno)</option>
            {lista.filter((x) => x.id !== actual).map((x) => <option key={x.id} value={x.id}>{etiqueta(x)}</option>)}
          </select>
        </label>
      </div>

      {!a ? <Cargando que="la entrada del análisis" /> : !a.entrada ? (
        <p className="crediscope-muted">Este análisis no tiene perfil enlazado.</p>
      ) : (
        <>
          <div className="crediscope-card">
            <p style={{ marginTop: 0 }}>
              {a.analisis.rules_version} · {a.analisis.llm_model ?? "—"} · score {num(a.analisis.crediscope_score)} · {ETIQUETA_RECOMENDACION[a.analisis.recomendacion] ?? a.analisis.recomendacion}
              {a.analisis.fallo ? <Etiqueta texto={`falló: ${a.analisis.fallo}`} color="var(--bad)" /> : null}
            </p>
            {analisisA.contraGuardada ? (
              analisisA.contraGuardada.length ? (
                <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
                  <strong>El modelo leyó algo distinto de lo que hoy le daríamos</strong> ({num(analisisA.contraGuardada.length)} campos):
                  <ul style={{ margin: "4px 0 0", fontSize: 12.5 }}>
                    {analisisA.contraGuardada.slice(0, 20).map((d) => <li key={d.ruta}><code>{d.ruta}</code>: {valorLegible(d.a)} → {valorLegible(d.b)}</li>)}
                  </ul>
                </div>
              ) : <p style={{ color: "var(--good)" }}>Lo que leyó el modelo coincide con lo que hoy le daríamos.</p>
            ) : (
              <p className="crediscope-muted" style={{ fontSize: 13 }}>El análisis es anterior a la 090 y no guardó lo que leyó: se muestra lo que hoy le daríamos con su perfil.</p>
            )}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
              <Lista titulo="Apagados (van en null)" items={analisisA.pasos.enNull} vacio="Ninguno." />
              <Lista titulo="Sacados del perfil" items={analisisA.pasos.quitado} vacio="Nada." />
              <Lista titulo="Transformados" items={analisisA.pasos.transformado} vacio="Nada." />
              <Lista titulo="Agregados" items={analisisA.pasos.agregado} vacio="Nada." />
            </div>
          </div>
          <details className="crediscope-card">
            <summary style={{ cursor: "pointer" }}><strong>La entrada completa</strong></summary>
            <ArbolJson nombre="perfil del modelo" valor={a.entrada} />
          </details>
        </>
      )}

      {entreDos ? (
        <div className="crediscope-card">
          <h3 style={{ marginTop: 0 }}>Entre los dos análisis cambian {num(entreDos.length)} campos de la entrada</h3>
          <ul style={{ fontSize: 12.5 }}>
            {entreDos.slice(0, 60).map((d) => <li key={d.ruta}><code>{d.ruta}</code>: {valorLegible(d.a)} → {valorLegible(d.b)}</li>)}
          </ul>
          {entreDos.length > 60 ? <p className="crediscope-muted">y {entreDos.length - 60} más</p> : null}
          <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Si son dos análisis de la misma persona, esto es lo que cambió en sus datos; si son de dos personas, por qué el modelo pudo leerlas distinto.
          </p>
        </div>
      ) : null}
    </div>
  );
}
