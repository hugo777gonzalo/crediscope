import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Upload, Scissors } from "lucide-react";
import { getCargas, getCortes } from "../lib/laboratorio.js";
import { formatearFechaHora, formatearDia } from "../lib/fechas.js";
import { MensajeError, Etiqueta, ETIQUETA_ESTADO_CARGA, num, pct } from "../components/laboratorio/Comunes.jsx";
import { CentroDeDatos, CalidadDeCarga, Conciliacion, ExploradorDeCartera, Diccionario } from "../components/laboratorio/PestanasDatos.jsx";

// Módulo 3 del negocio: Datos y cartera. Lo que entra al Laboratorio (las
// cargas de la institución), cómo se concilia con lo que analizamos y las
// poblaciones congeladas (cortes) sobre las que trabajan los otros módulos.

const COLOR_ESTADO = { cargando: "var(--warn)", lista: "var(--good)", con_errores: "var(--bad)", anulada: "var(--text-muted)" };

function Cargas({ cargas }) {
  if (!cargas.length) return <p className="crediscope-muted" style={{ margin: 0 }}>Todavía no se cargó ningún archivo.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="crediscope-table">
        <thead>
          <tr>
            <th>Carga</th>
            <th>Estado</th>
            <th style={{ textAlign: "right" }}>Operaciones</th>
            <th style={{ textAlign: "right" }}>Con análisis</th>
            <th style={{ textAlign: "right" }}>Fuga</th>
            <th>Corte</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cargas.map((c) => {
            const k = c.conciliacion ?? {};
            return (
              <tr key={c.id}>
                <td>
                  <strong>{c.etiqueta}</strong> {c.es_sintetica ? <Etiqueta texto="Sintética" color="var(--warn)" /> : null}
                  <div className="crediscope-muted" style={{ fontSize: 12 }}>{formatearFechaHora(c.created_at)}{c.institucion ? ` · ${c.institucion}` : ""}</div>
                </td>
                <td><Etiqueta texto={ETIQUETA_ESTADO_CARGA[c.estado] ?? c.estado} color={COLOR_ESTADO[c.estado]} /></td>
                <td style={{ textAlign: "right" }}>{num(k.operaciones)}</td>
                <td style={{ textAlign: "right" }}>{k.operaciones ? pct(((k.exacto ?? 0) + (k.perfil_inferido ?? 0)) / k.operaciones) : "—"}</td>
                <td style={{ textAlign: "right", color: k.consulta_posterior ? "var(--bad)" : undefined }}>{k.consulta_posterior ?? "—"}</td>
                <td>{formatearDia(c.fecha_corte)}</td>
                <td><Link className="crediscope-btn crediscope-btn-ghost" to={`/laboratorio/cargas/${c.id}`}>Ver</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cortes({ cortes }) {
  if (!cortes.length) return <p className="crediscope-muted" style={{ margin: 0 }}>Un corte congela una población (cargas, definición de default, ventana) para analizarla.</p>;
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="crediscope-table">
        <thead>
          <tr>
            <th>Corte</th>
            <th>Ventana</th>
            <th style={{ textAlign: "right" }}>Incluidas</th>
            <th style={{ textAlign: "right" }}>Malos</th>
            <th style={{ textAlign: "right" }}>Tasa</th>
            <th style={{ textAlign: "right" }}>Solicitudes</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {cortes.map((c) => {
            const r = c.resumen ?? {};
            return (
              <tr key={c.id}>
                <td>
                  <strong>{c.nombre}</strong> {c.es_sintetico ? <Etiqueta texto="Sintético" color="var(--warn)" /> : null}
                  <div className="crediscope-muted" style={{ fontSize: 12 }}>Congelado el {formatearFechaHora(c.congelado_en)}</div>
                </td>
                <td>{c.ventana_meses} meses</td>
                <td style={{ textAlign: "right" }}>{num(r.incluidas)}</td>
                <td style={{ textAlign: "right" }}>{num(r.malos)}</td>
                <td style={{ textAlign: "right" }}>{r.incluidas ? pct(r.malos / r.incluidas) : "—"}</td>
                <td style={{ textAlign: "right" }}>{r.solicitudes ? `${num(r.solicitudes.incluidas)} observadas` : "—"}</td>
                <td><Link className="crediscope-btn crediscope-btn-ghost" to={`/laboratorio/cortes/${c.id}`}>Abrir</Link></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export const PESTANAS_DATOS = [
  { clave: "cargas", texto: "Cargas de cartera", Componente: ({ cargas }) => <div className="crediscope-card"><Cargas cargas={cargas} /></div> },
  { clave: "cortes", texto: "Cortes (cohortes congeladas)", Componente: ({ cortes }) => <div className="crediscope-card"><Cortes cortes={cortes} /></div> },
  { clave: "centro", texto: "Centro de datos", Componente: CentroDeDatos },
  { clave: "calidad", texto: "Calidad de la carga", Componente: CalidadDeCarga },
  { clave: "conciliacion", texto: "Conciliación", Componente: Conciliacion },
  { clave: "cartera", texto: "Explorador de cartera", Componente: ExploradorDeCartera },
  { clave: "diccionario", texto: "Diccionario de datos", Componente: Diccionario },
];

export default function LaboratorioDatos() {
  const [params, setParams] = useSearchParams();
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getCargas(), getCortes()])
      .then(([cargas, cortes]) => setDatos({ cargas, cortes }))
      .catch((e) => setError(e.message));
  }, []);

  const pestana = PESTANAS_DATOS.find((t) => t.clave === params.get("pestana")) ?? PESTANAS_DATOS[0];
  const Componente = pestana.Componente;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h2 style={{ marginBottom: 4 }}>Datos y cartera</h2>
          <p className="crediscope-muted" style={{ margin: 0, maxWidth: "75ch" }}>
            Lo que entra al Laboratorio: las cargas de la institución, la calidad y la conciliación con lo que analizamos, y las poblaciones
            congeladas sobre las que trabajan los otros módulos.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="crediscope-btn" to="/laboratorio/cargas/nueva">
            <Upload size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            Cargar archivo
          </Link>
          <Link className="crediscope-btn crediscope-btn-ghost" to="/laboratorio/cortes/nuevo">
            <Scissors size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            Nuevo corte
          </Link>
        </div>
      </div>

      <div className="crediscope-tabs" style={{ flexWrap: "wrap" }}>
        {PESTANAS_DATOS.map((t) => (
          <button
            key={t.clave}
            className={`crediscope-tab ${pestana.clave === t.clave ? "crediscope-tab-active" : ""}`}
            onClick={() => setParams({ pestana: t.clave })}
            style={{ border: "none", background: "none", cursor: "pointer" }}
          >
            {t.texto}
          </button>
        ))}
      </div>

      <MensajeError mensaje={error} />
      {!datos && !error ? <p className="crediscope-muted">Cargando...</p> : null}
      {datos ? <Componente cargas={datos.cargas} cortes={datos.cortes} /> : null}
    </div>
  );
}
