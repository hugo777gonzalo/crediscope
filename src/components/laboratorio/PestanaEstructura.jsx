import { useEffect, useMemo, useState } from "react";
import { getCoberturaDeLaEstructura } from "../../lib/laboratorio.js";
import { Kpi, MensajeError, Cargando, Etiqueta, num, pct } from "./Comunes.jsx";

// Explorador de la estructura (módulo 6 del negocio): cada campo del perfil
// estandarizado en los perfiles del día del análisis del corte. Cuánta gente
// lo trae, si está apagado en Campos del análisis, cómo cambió entre
// versiones de la estructura y qué campos trae el perfil que la
// configuración no tiene (no se pueden apagar). Lo calcula la base
// (lab_cobertura_de_la_estructura, 107).

export default function PestanaEstructura({ corteId }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);
  const [grupo, setGrupo] = useState("todos");
  const [soloVacios, setSoloVacios] = useState(false);

  useEffect(() => {
    let vigente = true;
    getCoberturaDeLaEstructura(corteId).then((d) => vigente && setDatos(d)).catch((e) => vigente && setError(e.message));
    return () => {
      vigente = false;
    };
  }, [corteId]);

  const c = useMemo(() => {
    if (!datos) return null;
    const campos = datos.campos ?? [];
    const versiones = Object.keys(datos.versiones ?? {}).sort();
    return {
      campos, versiones, grupos: [...new Set(campos.map((x) => x.grupo))],
      vacios: campos.filter((x) => x.con_valor === 0), apagados: campos.filter((x) => !x.habilitado),
      // Un campo que en una versión aparece y en otra no: lo que cambió entre versiones.
      cambiaron: versiones.length > 1 ? campos.filter((x) => versiones.some((v) => (x.por_version[v] ?? 0) === 0) && versiones.some((v) => (x.por_version[v] ?? 0) > 0)) : [],
    };
  }, [datos]);

  if (error) return <MensajeError mensaje={error} />;
  if (!c) return <Cargando que="la cobertura de la estructura" />;
  const visibles = c.campos.filter((x) => (grupo === "todos" || x.grupo === grupo) && (!soloVacios || x.con_valor === 0));

  return (
    <div>
      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Perfiles del día del análisis" valor={num(datos.perfiles)} detalle={c.versiones.map((v) => `${v}: ${num(datos.versiones[v])}`).join(" · ")} />
        <Kpi etiqueta="Campos configurados" valor={num(c.campos.length)} detalle={`${num(c.apagados.length)} apagados en Campos del análisis`} />
        <Kpi etiqueta="Siempre vacíos en el corte" valor={num(c.vacios.length)} detalle="Nadie del corte los tiene" />
        <Kpi etiqueta="Fuera de la configuración" valor={num(datos.sin_configurar?.length)} detalle="El perfil los trae y no se pueden apagar" />
      </div>
      {c.cambiaron.length ? (
        <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
          <strong>Cambiaron entre versiones:</strong> {c.cambiaron.map((x) => `${x.grupo}.${x.campo}`).join(", ")}.
        </div>
      ) : null}

      <div className="crediscope-card">
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
          <select value={grupo} onChange={(e) => setGrupo(e.target.value)} className="crediscope-input" style={{ width: "auto" }}>
            <option value="todos">Todos los grupos</option>
            {c.grupos.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
          <label style={{ fontSize: 13 }}><input type="checkbox" checked={soloVacios} onChange={(e) => setSoloVacios(e.target.checked)} /> Sólo los siempre vacíos</label>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Grupo</th>
                <th>Campo</th>
                <th style={{ textAlign: "right" }}>Lo traen</th>
                {c.versiones.length > 1 ? c.versiones.map((v) => <th key={v} style={{ textAlign: "right" }}>{v}</th>) : null}
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((x) => (
                <tr key={`${x.grupo}.${x.campo}`}>
                  <td className="crediscope-muted">{x.grupo}</td>
                  <td><code style={{ fontSize: 12.5 }}>{x.campo}</code></td>
                  <td style={{ textAlign: "right" }}>{pct(datos.perfiles ? x.con_valor / datos.perfiles : null, 0)}</td>
                  {c.versiones.length > 1 ? c.versiones.map((v) => <td key={v} style={{ textAlign: "right" }}>{x.por_version[v] === undefined ? "—" : pct(x.por_version[v], 0)}</td>) : null}
                  <td>
                    {!x.habilitado ? <Etiqueta texto="apagado" color="var(--warn)" /> : null}
                    {x.con_valor === 0 ? <Etiqueta texto="siempre vacío" color="var(--text-muted)" /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {datos.sin_configurar?.length ? (
          <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            Fuera de la configuración: {datos.sin_configurar.map((x) => `${x.grupo}.${x.campo} (${num(x.con_valor)})`).join(", ")}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
