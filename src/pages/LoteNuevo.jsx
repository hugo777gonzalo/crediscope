import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Upload, CheckCircle2, Copy, FileWarning, Info } from "lucide-react";
import { leerArchivoDeLote, extensionAceptada } from "../lib/leerLoteExcel.js";
import { crearLote, arrancarLote } from "../lib/api.js";

// Cargar un archivo y ver qué trae, ANTES de consultar nada.
//
// La revisión previa es el punto de esta pantalla. Sin ella, un archivo
// con 1.200 líneas donde 340 están mal se convierte en 340 consultas
// que tardan cuarenta segundos cada una para terminar en un error que
// no era de la consulta sino de la planilla. Revisar primero convierte
// eso en "1.150 para consultar y 50 que corregir" -- que es el mismo
// hecho, pero se puede hacer algo con él.
//
// Nada se guarda hasta que la persona ve los números y confirma.

const ETIQUETA_TIPO = {
  cedula: "Cédulas",
  ruc_persona_natural: "RUC de persona natural",
  ruc_sociedad: "RUC de empresa",
  ruc_publico: "RUC del sector público",
  pasaporte: "Pasaporte u otro documento",
  cedula_invalida: "Número inválido",
};

function Cifra({ Icono, color, valor, etiqueta, detalle }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flex: "1 1 200px", minWidth: 0 }}>
      <Icono size={22} color={color} style={{ flexShrink: 0, marginTop: 3 }} />
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.1, color }}>{valor}</p>
        <p style={{ margin: "2px 0 0", fontWeight: 600 }}>{etiqueta}</p>
        {detalle ? <p className="crediscope-muted" style={{ margin: "2px 0 0", fontSize: 13 }}>{detalle}</p> : null}
      </div>
    </div>
  );
}

export default function LoteNuevo() {
  const navigate = useNavigate();
  const [nombre, setNombre] = useState("");
  const [archivo, setArchivo] = useState(null);
  const [lectura, setLectura] = useState(null);
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  async function alElegirArchivo(e) {
    const f = e.target.files?.[0];
    setError(null);
    setLectura(null);
    setArchivo(f ?? null);
    if (!f) return;
    if (!extensionAceptada(f.name)) {
      setError("Formato no reconocido. Se aceptan .xlsx, .xls, .csv y .txt.");
      return;
    }
    setLeyendo(true);
    try {
      const r = await leerArchivoDeLote(f);
      setLectura(r);
      if (!nombre) setNombre(f.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setError(err.message);
    } finally {
      setLeyendo(false);
    }
  }

  async function crearYArrancar(arrancar) {
    if (!lectura) return;
    setGuardando(true);
    setError(null);
    try {
      const id = await crearLote({
        nombre: nombre.trim() || archivo?.name || "Lote sin nombre",
        archivo: archivo?.name ?? null,
        items: lectura.items,
        totales: lectura.totales,
      });
      if (arrancar) await arrancarLote(id);
      navigate(`/lotes/${id}`);
    } catch (err) {
      setError(err.message);
      setGuardando(false);
    }
  }

  const t = lectura?.totales;
  const descartadosPorTipo = t
    ? Object.entries(t.porTipo).filter(([k]) => k !== "cedula" && k !== "ruc_persona_natural")
    : [];

  return (
    <div>
      <p>
        <Link to="/lotes" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver a los lotes
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Cargar un lote</h2>
        <p className="crediscope-muted" style={{ margin: 0, maxWidth: "64ch" }}>
          Subí una planilla con una columna de cédulas. No hace falta una plantilla ni un nombre de columna en particular: se
          busca sola la columna que las tiene.
        </p>
      </div>

      <div className="crediscope-card">
        <div className="crediscope-descarga-row" style={{ marginTop: 0 }}>
          <div className="crediscope-descarga-campo" style={{ minWidth: 260 }}>
            <label htmlFor="archivo">Archivo</label>
            <input id="archivo" type="file" className="crediscope-input" accept=".xlsx,.xls,.csv,.txt" onChange={alElegirArchivo} />
          </div>
          <div className="crediscope-descarga-campo" style={{ minWidth: 240 }}>
            <label htmlFor="nombre">Nombre del lote</label>
            <input
              id="nombre"
              className="crediscope-input"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Cartera septiembre"
            />
          </div>
        </div>
        {leyendo ? <p className="crediscope-muted" style={{ marginBottom: 0 }}>Revisando el archivo...</p> : null}
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      {t ? (
        <>
          <div className="crediscope-card">
            <h3 style={{ marginTop: 0 }}>Qué trae el archivo</h3>
            <p className="crediscope-muted" style={{ marginTop: 0 }}>
              Se leyó la columna <strong>{lectura.columna}</strong>. Nada se consultó todavía.
            </p>
            <div style={{ display: "flex", gap: 24, flexWrap: "wrap", margin: "18px 0" }}>
              <Cifra
                Icono={CheckCircle2}
                color="var(--good)"
                valor={t.validas}
                etiqueta="Se van a consultar"
                detalle={t.rucPersonaNatural ? `${t.rucPersonaNatural} son RUC de persona natural` : "Cédulas válidas y sin repetir"}
              />
              <Cifra
                Icono={Copy}
                color="var(--warn)"
                valor={t.duplicadas}
                etiqueta="Repetidas"
                detalle="Se consultan una sola vez"
              />
              <Cifra
                Icono={FileWarning}
                color="var(--bad)"
                valor={t.descartadas}
                etiqueta="No consultables"
                detalle="RUC de empresa, pasaportes, números inválidos"
              />
              <Cifra Icono={Upload} color="var(--text-muted)" valor={t.lineas} etiqueta="Líneas con dato" detalle="Total leído del archivo" />
            </div>

            {descartadosPorTipo.length > 0 ? (
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Qué se descartó</th>
                    <th style={{ textAlign: "right" }}>Cuántas</th>
                  </tr>
                </thead>
                <tbody>
                  {descartadosPorTipo.map(([tipo, n]) => (
                    <tr key={tipo}>
                      <td>{ETIQUETA_TIPO[tipo] ?? tipo}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {t.rucPersonaNatural > 0 ? (
              <p style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 0, fontSize: 13.5 }}>
                <Info size={16} color="var(--brand)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Hay {t.rucPersonaNatural} RUC de persona natural. Se consulta a la persona detrás de cada uno, que es la
                  misma con tres dígitos menos — no la actividad del establecimiento.
                </span>
              </p>
            ) : null}
          </div>

          <div className="crediscope-card">
            <h3 style={{ marginTop: 0 }}>Cuánto va a tardar</h3>
            <p style={{ marginTop: 0 }}>
              Unos <strong>{Math.max(1, Math.round(t.validas / 10))} minutos</strong>, a razón de diez consultas por minuto.
              Es una medición, no una promesa: depende de cómo responda la fuente.
            </p>
            <p className="crediscope-muted" style={{ marginBottom: 0 }}>
              El proceso corre en el servidor. Podés cerrar esta pantalla —y el navegador— y el lote sigue avanzando.
            </p>
          </div>

          <div className="crediscope-card">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button className="crediscope-btn" onClick={() => crearYArrancar(true)} disabled={guardando || t.validas === 0}>
                {guardando ? "Guardando..." : `Cargar y arrancar (${t.validas})`}
              </button>
              <button className="crediscope-btn crediscope-btn-ghost" onClick={() => crearYArrancar(false)} disabled={guardando}>
                Solo cargar, arranco después
              </button>
            </div>
            {t.validas === 0 ? (
              <p style={{ color: "var(--bad)", marginBottom: 0, marginTop: 12 }}>
                No hay ninguna cédula consultable en este archivo.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
