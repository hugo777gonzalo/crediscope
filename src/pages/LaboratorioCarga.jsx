import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { Download, Ban } from "lucide-react";
import { getCarga, getOperacionesDeCarga, anularCarga } from "../lib/laboratorio.js";
import { registrarEvento } from "../lib/api.js";
import { formatearFechaHora, formatearDia } from "../lib/fechas.js";
import {
  Volver, MensajeError, FranjaSintetica, Kpi, Etiqueta, ETIQUETA_ESTADO_CARGA, ETIQUETA_VINCULO, num, pct,
} from "../components/laboratorio/Comunes.jsx";

// La conciliación de una carga, sin nada en silencio: cuántas operaciones
// se vincularon con un análisis anterior al desembolso, cuántas nunca se
// consultaron y cuántas se consultaron DESPUÉS (fuga: quedan fuera de todo
// lo predictivo). Diseño, sección 6.4.

const ORDEN_VINCULO = ["exacto", "perfil_inferido", "solo_perfil", "consulta_posterior", "fuera_de_ventana", "sin_consulta"];
const COLOR_VINCULO = {
  exacto: "var(--good)", perfil_inferido: "var(--good)", solo_perfil: "var(--brand)",
  consulta_posterior: "var(--bad)", fuera_de_ventana: "var(--warn)", sin_consulta: "var(--text-muted)",
};

export default function LaboratorioCarga() {
  const { id } = useParams();
  const [carga, setCarga] = useState(null);
  const [error, setError] = useState(null);
  const [bajando, setBajando] = useState(false);

  useEffect(() => {
    getCarga(id).then(setCarga).catch((e) => setError(e.message));
  }, [id]);

  async function descargar() {
    setBajando(true);
    try {
      const ops = await getOperacionesDeCarga(id);
      const filas = ops.map((o) => ({
        "Operación": o.numero_operacion,
        "Cédula": o.cedula,
        "Producto": o.producto,
        "Desembolso": o.fecha_desembolso,
        "Vínculo": ETIQUETA_VINCULO[o.vinculo] ?? o.vinculo,
        "Análisis fallido": o.analisis_fallido ? "Sí" : "No",
        "Días entre consulta y desembolso": o.dias_consulta_desembolso,
      }));
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(filas), "Operaciones");
      XLSX.writeFile(libro, `conciliacion-${carga.etiqueta.replace(/[^\w-]+/g, "-")}.xlsx`);
      registrarEvento("exportacion.conciliacion", null, { carga_id: id, filas: filas.length });
    } catch (e) {
      setError(e.message);
    } finally {
      setBajando(false);
    }
  }

  async function anular() {
    if (!window.confirm("¿Anular esta carga? No se borra, pero ningún corte nuevo la va a poder usar.")) return;
    try {
      await anularCarga(id);
      setCarga(await getCarga(id));
    } catch (e) {
      setError(e.message);
    }
  }

  if (error) return <MensajeError mensaje={error} />;
  if (!carga) return <p className="crediscope-muted">Cargando...</p>;
  const k = carga.conciliacion ?? {};
  const total = Number(k.operaciones ?? 0);
  const conAnalisis = (k.exacto ?? 0) + (k.perfil_inferido ?? 0);

  return (
    <div>
      <Volver a="/laboratorio" texto="Volver al Laboratorio" />
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>
            {carga.etiqueta} <Etiqueta texto={ETIQUETA_ESTADO_CARGA[carga.estado] ?? carga.estado} />
          </h2>
          <p className="crediscope-muted" style={{ marginTop: 0 }}>
            {carga.institucion ?? "Sin institución"} · corte {formatearDia(carga.fecha_corte)} · cargada el {formatearFechaHora(carga.created_at)}
            {carga.archivo_nombre ? ` · ${carga.archivo_nombre}` : ""}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="crediscope-btn crediscope-btn-ghost" onClick={descargar} disabled={bajando || !total}>
            <Download size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
            {bajando ? "Preparando..." : "Descargar operaciones y vínculo"}
          </button>
          {carga.estado !== "anulada" ? (
            <button className="crediscope-btn crediscope-btn-ghost" onClick={anular} style={{ color: "var(--bad)", borderColor: "var(--bad)" }}>
              <Ban size={15} style={{ marginRight: 7, verticalAlign: "-2px" }} />
              Anular
            </button>
          ) : null}
        </div>
      </div>

      {carga.es_sintetica ? <FranjaSintetica que="Las operaciones y su resultado" /> : null}
      {carga.estado === "cargando" ? (
        <MensajeError mensaje="Esta carga quedó a medias (la subida se cortó antes de cerrarla). No se usa; conviene anularla y volver a cargar el archivo." />
      ) : null}

      {total ? (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi etiqueta="Operaciones" valor={num(total)} detalle={`${num(k.personas)} personas`} />
            <Kpi etiqueta="Con análisis anterior" valor={pct(conAnalisis / total)} detalle={`${num(conAnalisis)} sirven para medir el motor`} />
            <Kpi etiqueta="Fuga (consultadas después)" valor={num(k.consulta_posterior)} color={k.consulta_posterior ? "var(--bad)" : undefined} detalle="Quedan fuera de lo predictivo" />
            <Kpi etiqueta="Inmaduras" valor={`${num(k.inmaduras_12m)} / ${num(k.inmaduras_24m)}`} detalle="a 12 / a 24 meses" />
          </div>

          <div className="crediscope-card">
            <h3 style={{ marginTop: 0 }}>Vínculo de cada operación con su consulta</h3>
            <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
              Se busca el análisis y el perfil anteriores al desembolso, hasta {k.ventana_dias ?? 90} días antes.
            </p>
            <table className="crediscope-table">
              <tbody>
                {ORDEN_VINCULO.map((v) => (
                  <tr key={v}>
                    <td><span style={{ color: COLOR_VINCULO[v], fontWeight: 700 }}>●</span> {ETIQUETA_VINCULO[v]}</td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{num(k[v] ?? 0)}</td>
                    <td style={{ textAlign: "right" }} className="crediscope-muted">{pct((k[v] ?? 0) / total)}</td>
                  </tr>
                ))}
                <tr>
                  <td>Con un análisis fallido en la ventana (sin análisis válido)</td>
                  <td style={{ textAlign: "right" }}>{num(k.analisis_fallido ?? 0)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td>Negadas por un control de bloqueo (se cuentan aparte)</td>
                  <td style={{ textAlign: "right" }}>{num(k.bloqueados ?? 0)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      {carga.errores?.length ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <h3 style={{ marginTop: 0, color: "var(--bad)" }}>Errores ({carga.errores.length})</h3>
          <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>Mientras tenga errores, la carga no entra a ningún corte.</p>
          <table className="crediscope-table">
            <tbody>
              {carga.errores.map((e, i) => (
                <tr key={i}>
                  <td>{e.operacion}</td>
                  <td>{e.motivo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
