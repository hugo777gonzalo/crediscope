import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { getFilasDelCorte, getCatalogoUnaVez } from "../lib/datosDelCorte.js";
import { getCorte, getPerfil, getAnalisis, getCrudo, getEventosDeSolicitud, getMotivosDeCadaMalo, getCamposDeshabilitados } from "../lib/laboratorio.js";
import { armarPerfilDelModelo } from "../../supabase/functions/_shared/perfil-del-modelo.ts";
import { parecidos, diferenciasJson } from "../lib/analisisProfundo.js";
import { formatearFechaHora, formatearDia } from "../lib/fechas.js";
import ArbolJson from "../components/laboratorio/ArbolJson.jsx";
import { Volver, MensajeError, Cargando, FranjaSintetica, Etiqueta, ETIQUETA_RECOMENDACION, ETIQUETA_MOTIVO, ETIQUETA_SE_PODIA_VER, num, dec } from "../components/laboratorio/Comunes.jsx";

// Trazabilidad de un caso (módulo 6 del negocio): del resultado hacia
// atrás. Qué le pasó (y por qué, según los eventos de la reconsulta), qué
// decidió el motor, qué escribió el modelo, qué leyó el modelo (rearmado
// desde el perfil con el código de hoy, y lo que guardó el análisis si es
// posterior a la 090), la estructura del día del análisis y el crudo de
// Novadata (sólo admin, a pedido: son los datos de una persona).

function Seccion({ titulo, children, abierta = true }) {
  return (
    <details className="crediscope-card" open={abierta}>
      <summary style={{ cursor: "pointer" }}><h3 style={{ display: "inline", margin: 0 }}>{titulo}</h3></summary>
      <div style={{ marginTop: 10 }}>{children}</div>
    </details>
  );
}

const valorLegible = (v) => (v === null || v === undefined ? "—" : typeof v === "boolean" ? (v ? "sí" : "no") : typeof v === "number" ? (Math.abs(v) >= 1000 ? num(v) : dec(v, 2)) : String(v));

export default function LaboratorioCaso() {
  const [params] = useSearchParams();
  const corteId = params.get("corte"), poblacion = params.get("poblacion") ?? "operaciones", id = params.get("id");
  const [estado, setEstado] = useState({ cargando: true });
  const [crudo, setCrudo] = useState(null);
  const [cargandoCrudo, setCargandoCrudo] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      const [corte, filas, catalogo, deshabilitados] = await Promise.all([getCorte(corteId), getFilasDelCorte(corteId, poblacion), getCatalogoUnaVez(), getCamposDeshabilitados()]);
      const caso = filas.find((f) => f.id === id);
      if (!caso) throw new Error("El caso no está en este corte.");
      const [perfil, analisis, reconsulta, motivos] = await Promise.all([
        caso.perfilId ? getPerfil(caso.perfilId) : null,
        caso.analisisId ? getAnalisis(caso.analisisId) : null,
        poblacion === "solicitudes" ? getEventosDeSolicitud(id) : null,
        poblacion === "solicitudes" && caso.malo ? getMotivosDeCadaMalo(corteId) : [],
      ]);
      if (vigente) setEstado({ corte, filas, catalogo, deshabilitados, caso, perfil, analisis, reconsulta, motivo: motivos.find((m) => m.solicitud_id === id) ?? null });
    })().catch((e) => vigente && setEstado({ error: e.message }));
    return () => {
      vigente = false;
    };
  }, [corteId, poblacion, id]);

  const derivado = useMemo(() => {
    if (!estado.caso) return null;
    const entrada = estado.perfil ? armarPerfilDelModelo(estado.perfil.standard_profile, estado.deshabilitados) : null;
    const guardado = estado.analisis?.mensaje_al_modelo?.perfilDelModelo ?? null;
    return {
      entrada,
      cambiosContraLoGuardado: entrada && guardado ? diferenciasJson(guardado, entrada) : null,
      vecinos: parecidos(estado.caso, estado.filas, estado.catalogo, 5),
    };
  }, [estado]);

  async function verCrudo() {
    setCargandoCrudo(true);
    try {
      setCrudo(await getCrudo(estado.perfil.crudo_ruta));
    } catch (e) {
      setCrudo({ error: e.message });
    } finally {
      setCargandoCrudo(false);
    }
  }

  if (estado.error) return <MensajeError mensaje={estado.error} />;
  if (estado.cargando || !derivado) return <Cargando que="el caso" />;
  const { corte, caso, perfil, analisis, reconsulta, motivo, catalogo } = estado;
  const volver = `/laboratorio/profundo?corte=${corteId}&poblacion=${poblacion}&pestana=investigacion`;
  const cedula = perfil?.clients?.cedula ?? caso.cedula;

  return (
    <div>
      <Volver a={volver} texto="Volver a la investigación" />
      <h2 style={{ marginBottom: 4 }}>
        {caso.malo ? "Cayó" : "Pagó"} · {ETIQUETA_RECOMENDACION[caso.recomendacion] ?? caso.recomendacion}
        {caso.puntaje !== null && caso.puntaje !== undefined ? ` · puntaje ${num(caso.puntaje)}` : ""}
      </h2>
      <p className="crediscope-muted" style={{ marginTop: 0 }}>
        {corte.nombre} · {poblacion === "solicitudes" ? "solicitud" : "operación"} del {formatearDia(caso.fecha?.toISOString().slice(0, 10))}
        {cedula ? <> · <Link to={`/perfil/${cedula}`}>ver el perfil de la persona</Link></> : null}
      </p>
      {corte.es_sintetico ? <FranjaSintetica que="El resultado, el puntaje y los eventos de este caso" /> : null}

      <Seccion titulo="1. Qué le pasó">
        <table className="crediscope-table">
          <tbody>
            <tr><td>Resultado</td><td><strong style={{ color: caso.malo ? "var(--bad)" : "var(--good)" }}>{caso.malo ? "Cayó" : "Pagó"}</strong>{caso.fechaDefault ? ` el ${formatearDia(caso.fechaDefault.toISOString().slice(0, 10))}` : ""}</td></tr>
            {poblacion === "solicitudes" ? (
              <>
                <tr><td>¿Recibió nuestro crédito?</td><td>{caso.desembolsada ? "Sí" : `No (la institución: ${caso.decisionInstitucion ?? "sin dato"})`}</td></tr>
                <tr><td>Dónde se vio la caída</td><td>{caso.donde?.length ? caso.donde.join(", ") : "—"}</td></tr>
                <tr><td>¿Tuvo crédito de otra institución?</td><td>{caso.recibioCreditoDeOtro ? "Sí" : "No"}</td></tr>
              </>
            ) : (
              <tr><td>Estado de la operación</td><td>{caso.estadoOperacion ?? "—"}</td></tr>
            )}
          </tbody>
        </table>
        {motivo ? (
          <p style={{ marginBottom: 0 }}>
            Motivo principal: <strong>{ETIQUETA_MOTIVO[motivo.principal] ?? motivo.principal}</strong> · ¿Se podía ver?{" "}
            <Etiqueta texto={ETIQUETA_SE_PODIA_VER[motivo.se_podia_ver] ?? motivo.se_podia_ver} color="var(--brand)" />
            {motivo.motivos?.length > 1 ? <span className="crediscope-muted"> · también: {motivo.motivos.filter((m) => m !== motivo.principal).map((m) => ETIQUETA_MOTIVO[m] ?? m).join(", ")}</span> : null}
          </p>
        ) : null}
        {reconsulta?.lab_eventos?.length ? (
          <>
            <h4 style={{ margin: "12px 0 4px" }}>Lo que cambió entre la consulta y la reconsulta ({formatearDia(reconsulta.fecha)})</h4>
            <table className="crediscope-table">
              <tbody>
                {reconsulta.lab_eventos.map((e, i) => (
                  <tr key={i}>
                    <td>{ETIQUETA_MOTIVO[e.tipo] ?? e.tipo}</td>
                    <td className="crediscope-muted">{e.clase.replaceAll("_", " ")}</td>
                    <td>{e.fecha ? formatearDia(e.fecha) : "sin fecha"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </Seccion>

      <Seccion titulo="2. Qué decidió el motor y qué escribió el modelo">
        {analisis ? (
          <>
            <p style={{ marginTop: 0 }}>
              Score <strong>{num(analisis.crediscope_score)}</strong> · {ETIQUETA_RECOMENDACION[analisis.recomendacion] ?? analisis.recomendacion} · {analisis.rules_version} ·{" "}
              {analisis.llm_model ?? "—"} · {formatearFechaHora(analisis.created_at)}
            </p>
            {analisis.narrative_summary ? <p style={{ fontSize: 14 }}>{analisis.narrative_summary}</p> : null}
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {[["A favor", analisis.positives], ["En contra", analisis.negatives], ["Lo que faltaba", analisis.missing_info]].map(([t, lista]) => (
                <div key={t}>
                  <strong>{t}</strong>
                  <ul style={{ margin: "4px 0", fontSize: 13 }}>{(Array.isArray(lista) ? lista : []).slice(0, 8).map((x, i) => <li key={i}>{typeof x === "string" ? x : x?.texto ?? x?.descripcion ?? JSON.stringify(x)}</li>)}</ul>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="crediscope-muted" style={{ margin: 0 }}>
            Sin análisis del modelo: el puntaje de este caso es {caso.fuentePuntaje === "sintetico" ? "sintético (la simulación)" : "de otra fuente"}.
          </p>
        )}
      </Seccion>

      <Seccion titulo="3. Qué leyó el modelo">
        {derivado.entrada ? (
          <>
            <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
              Rearmado desde el perfil del día del análisis con el código de hoy (armarPerfilDelModelo).
              {analisis?.mensaje_al_modelo
                ? derivado.cambiosContraLoGuardado.length
                  ? ` Contra lo que guardó el análisis cambian ${derivado.cambiosContraLoGuardado.length} campos: el modelo leyó algo distinto de lo que hoy armaríamos.`
                  : " Coincide con lo que guardó el análisis."
                : analisis
                  ? " El análisis es anterior a la 090 y no guardó lo que leyó: no se puede comparar."
                  : ""}
            </p>
            {derivado.cambiosContraLoGuardado?.length ? (
              <ul style={{ fontSize: 13 }}>{derivado.cambiosContraLoGuardado.slice(0, 20).map((d) => <li key={d.ruta}>{d.ruta}: {valorLegible(d.a)} → {valorLegible(d.b)}</li>)}</ul>
            ) : null}
            <ArbolJson nombre="perfil del modelo" valor={derivado.entrada} />
          </>
        ) : (
          <p className="crediscope-muted" style={{ margin: 0 }}>Este caso no tiene perfil del día del análisis.</p>
        )}
      </Seccion>

      <Seccion titulo="4. La estructura del día del análisis" abierta={false}>
        {perfil ? (
          <>
            <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>{perfil.structure_version} · consultado el {formatearFechaHora(perfil.created_at)}</p>
            <ArbolJson nombre="perfil estandarizado" valor={perfil.standard_profile} />
          </>
        ) : <p className="crediscope-muted" style={{ margin: 0 }}>Sin perfil.</p>}
      </Seccion>

      <Seccion titulo="5. El crudo de Novadata" abierta={false}>
        {!perfil?.crudo_ruta ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>Este perfil no tiene el crudo guardado.</p>
        ) : !crudo ? (
          <button className="crediscope-btn crediscope-btn-ghost" onClick={verCrudo} disabled={cargandoCrudo}>{cargandoCrudo ? "Bajando..." : "Ver el crudo (datos de la persona)"}</button>
        ) : crudo.error ? (
          <MensajeError mensaje={crudo.error} />
        ) : (
          <ArbolJson nombre="crudo" valor={crudo.raw ?? crudo} abrirHasta={1} />
        )}
      </Seccion>

      <Seccion titulo="6. Contra los parecidos que tuvieron el otro resultado">
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Los {derivado.vecinos.vecinos.length} más parecidos con la misma recomendación que {caso.malo ? "pagaron" : "cayeron"}, por las variables numéricas y sí/no del
          perfil. Lo que más lo distingue de ellos es la primera hipótesis de qué no vio el modelo.
        </p>
        {derivado.vecinos.hipotesis.length ? (
          <table className="crediscope-table">
            <thead>
              <tr><th>Variable</th><th style={{ textAlign: "right" }}>Este caso</th><th style={{ textAlign: "right" }}>Sus parecidos</th><th>El modelo</th></tr>
            </thead>
            <tbody>
              {derivado.vecinos.hipotesis.map((h) => (
                <tr key={h.id}>
                  <td>{h.nombre}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{valorLegible(h.tipo === "booleano" ? h.propio === 1 : h.propio)}</td>
                  <td style={{ textAlign: "right" }}>{h.tipo === "booleano" ? `${Math.round(h.promedio * 100)}% sí` : valorLegible(h.promedio)}</td>
                  <td>{h.enModelo ? "La recibe" : <Etiqueta texto="No la recibe" color="var(--bad)" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="crediscope-muted" style={{ margin: 0 }}>No se distingue de sus parecidos en ninguna variable (más de medio desvío).</p>}
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Variables del caso: {catalogo.filter((v) => caso.variables[v.id] !== null && caso.variables[v.id] !== undefined).length} de {catalogo.length} con dato.
        </p>
      </Seccion>
    </div>
  );
}
