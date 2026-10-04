import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useFilasDelCorte } from "../../lib/useFilasDelCorte.js";
import { casosDeError } from "../../lib/analisisProfundo.js";
import { getMotivosDeCadaMalo } from "../../lib/laboratorio.js";
import { MensajeError, Cargando, ETIQUETA_RECOMENDACION, ETIQUETA_MOTIVO, ETIQUETA_SE_PODIA_VER, num } from "./Comunes.jsx";

// Investigación de los dos errores (módulo 6 del negocio): los aprobados
// que cayeron y los negados que habrían pagado. A un negado sólo se lo
// juzga con evidencia: la institución le prestó igual o tuvo crédito con
// otra y pagó. Cada caso abre su trazabilidad completa, con los parecidos
// que tuvieron el otro resultado.

export default function PestanaInvestigacion({ corteId, poblacion }) {
  const { filas, error } = useFilasDelCorte(corteId, poblacion);
  const [motivos, setMotivos] = useState(new Map());
  const [lista, setLista] = useState("aprobados");

  useEffect(() => {
    if (poblacion !== "solicitudes") return undefined;
    let vigente = true;
    getMotivosDeCadaMalo(corteId)
      .then((ms) => vigente && setMotivos(new Map(ms.map((m) => [m.solicitud_id, m]))))
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [corteId, poblacion]);

  const casos = useMemo(() => (filas ? casosDeError(filas) : null), [filas]);
  if (error) return <MensajeError mensaje={error} />;
  if (!casos) return <Cargando />;
  const elegidos = (lista === "aprobados" ? casos.aprobadosQueCayeron : casos.negadosQuePagaron).slice().sort((a, b) => (lista === "aprobados" ? b.puntaje - a.puntaje : a.puntaje - b.puntaje));

  return (
    <div>
      <div className="crediscope-tabs" style={{ flexWrap: "wrap" }}>
        <button className={`crediscope-tab ${lista === "aprobados" ? "crediscope-tab-active" : ""}`} onClick={() => setLista("aprobados")} style={{ border: "none", background: "none", cursor: "pointer" }}>
          Aprobados que cayeron ({num(casos.aprobadosQueCayeron.length)})
        </button>
        <button className={`crediscope-tab ${lista === "negados" ? "crediscope-tab-active" : ""}`} onClick={() => setLista("negados")} style={{ border: "none", background: "none", cursor: "pointer" }}>
          Negados que habrían pagado ({num(casos.negadosQuePagaron.length)})
        </button>
      </div>
      <p className="crediscope-muted" style={{ fontSize: 13, marginTop: 0 }}>
        {lista === "aprobados"
          ? "Ordenados del puntaje más alto al más bajo: arriba, los que el motor creía más seguros."
          : poblacion === "solicitudes"
            ? "Negados con evidencia de que pagaron: tuvieron crédito con otra institución (o la institución les prestó igual) y no cayeron."
            : "Negados a los que la institución les prestó igual y pagaron."}
      </p>
      {elegidos.length ? (
        <div className="crediscope-card" style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th style={{ textAlign: "right" }}>Puntaje</th>
                <th>Recomendación</th>
                {poblacion === "solicitudes" ? <th>Recibió nuestro crédito</th> : <th>Producto</th>}
                {lista === "aprobados" && poblacion === "solicitudes" ? <th>Motivo principal</th> : null}
                {lista === "aprobados" && poblacion === "solicitudes" ? <th>¿Se podía ver?</th> : null}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {elegidos.slice(0, 200).map((f) => {
                const m = motivos.get(f.id);
                return (
                  <tr key={f.id}>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{num(f.puntaje)}</td>
                    <td>{ETIQUETA_RECOMENDACION[f.recomendacion] ?? f.recomendacion}</td>
                    {poblacion === "solicitudes" ? <td>{f.desembolsada ? "Sí" : "No"}</td> : <td>{f.producto ?? "—"}</td>}
                    {lista === "aprobados" && poblacion === "solicitudes" ? <td>{m ? ETIQUETA_MOTIVO[m.principal] ?? m.principal : "—"}</td> : null}
                    {lista === "aprobados" && poblacion === "solicitudes" ? <td className="crediscope-muted">{m ? ETIQUETA_SE_PODIA_VER[m.se_podia_ver] ?? m.se_podia_ver : "—"}</td> : null}
                    <td><Link className="crediscope-btn crediscope-btn-ghost" to={`/laboratorio/caso?corte=${corteId}&poblacion=${poblacion}&id=${f.id}`}>Ver el caso</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {elegidos.length > 200 ? <p className="crediscope-muted" style={{ fontSize: 12.5 }}>Se muestran los primeros 200 de {num(elegidos.length)}.</p> : null}
        </div>
      ) : (
        <p className="crediscope-muted">Ningún caso en este corte.</p>
      )}
    </div>
  );
}
