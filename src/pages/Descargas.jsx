import { useCallback, useEffect, useState } from "react";
import { Download } from "lucide-react";
import { getRangoFechasSolicitudes, getConteoSolicitudes, getDatosAnaliticos, TOPE_DESCARGA_SOLICITUDES } from "../lib/api.js";
import { descargarTablaAnalitica } from "../lib/exportAnalitico.js";

const NUM = new Intl.NumberFormat("es-EC");

// Descargas: los reportes planos, separados de Inteligencia de Negocios
// (el tablero en vivo). Son dos usos distintos -- el tablero se mira en
// pantalla con una jefatura, esto se baja para trabajarlo afuera -- y
// mezclarlos hacía que el tablero terminara con un formulario de fechas
// pegado abajo.

// Información de Solicitudes: descarga de la información completa con la
// que se evaluó a cada persona, en el rango de fechas que se elija —
// para trabajarla en Power BI/Excel (correlación contra el
// incumplimiento, tasas por variable, cortes por producto).
//
// El total se cuenta en el servidor antes de descargar nada: son ~10 KB
// de perfil por solicitud, así que traerlas solo para contarlas sería
// caro y lento a medida que la cartera crece.
export default function Descargas() {
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [total, setTotal] = useState(null);
  const [contando, setContando] = useState(true);
  const [descargando, setDescargando] = useState(false);
  const [descargado, setDescargado] = useState(null);
  const [error, setError] = useState(null);

  // Arranca cubriendo todo lo registrado: es lo que se quiere la
  // primera vez, y deja claro desde cuándo hay información.
  useEffect(() => {
    getRangoFechasSolicitudes()
      .then((r) => {
        if (r.desde) setDesde(r.desde);
        if (r.hasta) setHasta(r.hasta);
      })
      .catch((err) => setError(err.message));
  }, []);

  const contar = useCallback(async () => {
    setContando(true);
    try {
      setTotal(await getConteoSolicitudes({ desde, hasta }));
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setContando(false);
    }
  }, [desde, hasta]);

  useEffect(() => {
    contar();
  }, [contar]);

  async function handleDescargar() {
    setDescargando(true);
    setDescargado(null);
    setError(null);
    try {
      const { filas, total: enElRango } = await getDatosAnaliticos({ desde, hasta });
      setDescargado({ n: descargarTablaAnalitica(filas, { desde, hasta }), de: enElRango });
    } catch (err) {
      setError(err.message);
    } finally {
      setDescargando(false);
    }
  }

  const rangoInvalido = desde && hasta && desde > hasta;
  const sinNada = total === 0;
  const pasaElTope = total > TOPE_DESCARGA_SOLICITUDES;

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Descargas</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Reportes planos para trabajar la información fuera de la aplicación — Power BI, Excel o el sistema que usen.
        </p>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Información de Solicitudes</h3>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Descarga una fila por solicitud con toda la información con la que se evaluó a la persona, el score, la acción recomendada
          y — cuando ya se cargó la cosecha — si el crédito incumplió.
        </p>

        <div className="crediscope-descarga-row">
          <div className="crediscope-descarga-campo">
            <label htmlFor="solicitudes-desde">Fecha inicio</label>
            <input id="solicitudes-desde" type="date" value={desde} max={hasta || undefined} onChange={(e) => setDesde(e.target.value)} />
          </div>
          <div className="crediscope-descarga-campo">
            <label htmlFor="solicitudes-hasta">Fecha fin</label>
            <input id="solicitudes-hasta" type="date" value={hasta} min={desde || undefined} onChange={(e) => setHasta(e.target.value)} />
          </div>

          <div className="crediscope-descarga-total">
            {rangoInvalido ? (
              <span style={{ color: "var(--bad)" }}>La fecha de inicio es posterior a la de fin</span>
            ) : contando ? (
              "Contando..."
            ) : (
              <>
                TOTAL: <strong>{NUM.format(total ?? 0)}</strong> {total === 1 ? "solicitud" : "solicitudes"}
                {/* Se avisa antes de descargar, no después: quien baja el
                    archivo para correlacionar tiene que saber que le falta
                    la parte vieja del rango. */}
                {pasaElTope
                  ? ` — el archivo lleva las ${NUM.format(TOPE_DESCARGA_SOLICITUDES)} más recientes`
                  : " a descargar"}
              </>
            )}
          </div>

          <button className="crediscope-btn" onClick={handleDescargar} disabled={descargando || contando || sinNada || rangoInvalido}>
            <Download size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} />
            {descargando ? "Preparando..." : "Descargar reporte"}
          </button>
        </div>

        {error ? (
          <p style={{ color: "var(--bad)", marginBottom: 0, fontSize: 14 }}>{error}</p>
        ) : descargado ? (
          <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 14 }}>
            {descargado.n < descargado.de ? (
              <>
                Se descargaron <strong>{NUM.format(descargado.n)} de {NUM.format(descargado.de)}</strong> solicitudes: las más
                recientes del rango. Para el resto, acotá las fechas y descargá de nuevo.
              </>
            ) : (
              <>Se descargaron {NUM.format(descargado.n)} solicitudes.</>
            )}{" "}
            El archivo trae una segunda hoja con lo que conviene tener en cuenta antes de sacar conclusiones.
          </p>
        ) : sinNada && !contando ? (
          <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 14 }}>
            No hay solicitudes en ese rango de fechas.
          </p>
        ) : null}
        </div>
    </div>
  );
}
