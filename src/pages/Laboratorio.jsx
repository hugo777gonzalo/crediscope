import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Database, LineChart, Sigma, Microscope, FileText, History } from "lucide-react";
import { getCargas, getCortes, getPropuestas } from "../lib/laboratorio.js";
import { Kpi, MensajeError, num } from "../components/laboratorio/Comunes.jsx";

// Laboratorio de Inteligencia de Negocio › Riesgo de Crédito: el inicio.
// Lo opera nuestro equipo (sólo admin); la IFI recibe un informe exportado.
// Diseño: docs/laboratorio-de-riesgo.md; pantallas por módulo:
// docs/laboratorio-pantallas.md.

const MODULOS = [
  ["/laboratorio/datos", Database, "Datos y cartera", "Cargas de la institución, conciliación con lo analizado y cortes congelados."],
  ["/laboratorio/desempeno", LineChart, "Prueba retrospectiva", "¿El motor ordena bien a buenos y malos y se sostiene?"],
  ["/laboratorio/estadistica", Sigma, "Descubrimiento estadístico", "¿Qué anticipa el impago?"],
  ["/laboratorio/profundo", Microscope, "Descubrimiento profundo", "¿Qué no vio el modelo?"],
  ["/laboratorio/propuestas", FileText, "Propuestas", "Ajustes con evidencia, para revisar y presentar."],
  ["/laboratorio/criterio", History, "Criterio vigente", "Qué ajustes están en vigencia y su historia."],
];

export default function Laboratorio() {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([getCargas(), getCortes(), getPropuestas()])
      .then(([cargas, cortes, propuestas]) => setDatos({ cargas, cortes, propuestas }))
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <MensajeError mensaje={error} />;
  if (!datos) return <p className="crediscope-muted">Cargando...</p>;
  const { cargas, cortes, propuestas } = datos;
  const reales = cargas.filter((c) => !c.es_sintetica && c.estado === "lista");
  const enCurso = propuestas.filter((p) => !["rechazada", "retirada", "aplicada"].includes(p.estado)).length;

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ marginBottom: 4 }}>Laboratorio · Riesgo de Crédito</h2>
        <p className="crediscope-muted" style={{ margin: 0, maxWidth: "70ch" }}>
          Medir si el motor acertó contra lo que realmente pasó con los créditos, buscar qué datos anticipaban el impago y convertirlo en una
          propuesta de ajuste con evidencia. Nada de esto cambia el motor por su cuenta.
        </p>
      </div>

      <div className="crediscope-kpi-grid">
        <Kpi etiqueta="Cargas reales listas" valor={reales.length} detalle={reales.length ? null : "Todavía no hay datos de una institución"} />
        <Kpi etiqueta="Operaciones reales" valor={num(reales.reduce((s, c) => s + Number(c.conciliacion?.operaciones ?? 0), 0))} />
        <Kpi etiqueta="Cortes" valor={cortes.length} detalle={`${cortes.filter((c) => c.es_sintetico).length} sintéticos`} />
        <Kpi etiqueta="Propuestas en curso" valor={enCurso} />
      </div>

      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
        {MODULOS.map(([ruta, Icono, titulo, texto]) => (
          <Link key={ruta} to={ruta} className="crediscope-card" style={{ textDecoration: "none", color: "inherit", margin: 0 }}>
            <Icono size={20} style={{ color: "var(--brand)" }} />
            <h3 style={{ margin: "6px 0 4px" }}>{titulo}</h3>
            <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>{texto}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
