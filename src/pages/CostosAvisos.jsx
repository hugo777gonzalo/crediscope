import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BellRing, BellOff, Wallet, CheckCircle2, AlertTriangle } from "lucide-react";
import { getAvisos, getConfigOperativa, guardarConfigOperativa, getGastoDelMes, getEstadoServicio } from "../lib/api.js";
import { money2, fechaHora } from "../lib/consumoLlm.js";

// Avisos: el canal por donde sale la noticia de que algo pasa, y el
// único incidente que se puede anticipar.
//
// Todos los demás se avisan cuando ya ocurrieron. El tope de consumo
// no: se ve venir con días de anticipación mirando lo que va del mes.
// Avisar al 70% lo convierte de caída en tarea -- que es exactamente lo
// que no pasó el 15 de septiembre, cuando el servicio quedó parado sin
// que nadie hubiera visto el saldo bajar.
//
// El presupuesto se edita acá y no en el código a propósito: es un
// número que decide el negocio y cambia sin que cambie nada más. Es el
// primer parámetro de los treinta y cinco del temario de puesta en
// marcha que deja de necesitar un despliegue.

const ETIQUETA_TIPO = {
  incidente_abierto: "Se cayó un componente",
  incidente_cerrado: "Volvió un componente",
  presupuesto: "Presupuesto",
};

const ETIQUETA_ESTADO_AVISO = {
  enviada: "Enviada",
  sin_canal: "Sin canal",
  fallida: "Falló el envío",
};

const COLOR_ESTADO_AVISO = {
  enviada: "var(--good)",
  sin_canal: "var(--warn)",
  fallida: "var(--bad)",
};

export default function CostosAvisos() {
  const [avisos, setAvisos] = useState(null);
  const [config, setConfig] = useState(null);
  const [gasto, setGasto] = useState(null);
  const [canal, setCanal] = useState(null);
  const [error, setError] = useState(null);
  const [borrador, setBorrador] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    getAvisos().then(setAvisos).catch((e) => setError(e.message));
    getGastoDelMes().then(setGasto).catch(() => setGasto(null));
    getEstadoServicio()
      .then((e) => setCanal(e.find((x) => x.componente === "canal_aviso") ?? null))
      .catch(() => setCanal(null));
    getConfigOperativa()
      .then((c) => {
        setConfig(c);
        const p = c.find((x) => x.clave === "presupuesto_llm_mensual_usd");
        setBorrador(String(Number(p?.valor ?? 0) || ""));
      })
      .catch((e) => setError(e.message));
  }, []);

  const presupuesto = Number(config?.find((c) => c.clave === "presupuesto_llm_mensual_usd")?.valor ?? 0);
  const umbrales = config?.find((c) => c.clave === "avisos_presupuesto_pct")?.valor ?? [70, 85, 100];
  const gastado = Number(gasto?.gastado_usd ?? 0);
  const pct = presupuesto > 0 ? Math.min(999, Math.round((gastado / presupuesto) * 100)) : null;

  async function guardarPresupuesto(e) {
    e.preventDefault();
    setGuardando(true);
    setGuardado(false);
    try {
      const n = Math.max(0, Number(borrador) || 0);
      await guardarConfigOperativa("presupuesto_llm_mensual_usd", n);
      setConfig((c) => c.map((x) => (x.clave === "presupuesto_llm_mensual_usd" ? { ...x, valor: n } : x)));
      setGuardado(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  }

  if (error)
    return (
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
    );

  const hayCanal = canal?.estado === "operativo";

  return (
    <div>
      <p>
        <Link to="/costos" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Avisos</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Por dónde sale la noticia de que algo pasa, y el único problema que se puede anticipar en vez de sufrir.
        </p>
      </div>

      <div className="crediscope-card" style={{ borderColor: hayCanal ? "var(--good)" : "var(--warn)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          {hayCanal ? (
            <BellRing size={22} color="var(--good)" style={{ flexShrink: 0, marginTop: 2 }} />
          ) : (
            <BellOff size={22} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
          )}
          <div>
            <h3 style={{ margin: "0 0 6px" }}>{hayCanal ? "Canal de aviso configurado" : "No hay canal de aviso"}</h3>
            {hayCanal ? (
              <p className="crediscope-muted" style={{ margin: 0 }}>
                Los avisos salen por mensajería instantánea. Último chequeo del vigía: {fechaHora(canal?.ultimo_chequeo)}.
              </p>
            ) : (
              <>
                <p style={{ margin: "0 0 8px" }}>
                  El sistema detecta y registra, pero <strong>nadie recibe nada</strong>. Los avisos de abajo quedaron anotados
                  con el motivo, que es lo único que se puede hacer sin un canal.
                </p>
                <p className="crediscope-muted" style={{ margin: 0, fontSize: 13.5 }}>
                  Para activarlo hacen falta dos valores en las variables de la función: <code>TELEGRAM_BOT_TOKEN</code> y{" "}
                  <code>TELEGRAM_CHAT_ID</code>. Se obtienen creando un bot y agregándolo al grupo que deba recibirlos.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>
          <Wallet size={17} style={{ marginRight: 7, verticalAlign: "-3px" }} />
          Presupuesto del mes
        </h3>
        <p className="crediscope-muted" style={{ marginTop: 0 }}>
          El tope de consumo es el único incidente que se ve venir. Con un presupuesto definido, el vigía avisa al{" "}
          {umbrales.join("%, ")}% antes de que el servicio se pare.
        </p>

        <form onSubmit={guardarPresupuesto} className="crediscope-descarga-row" style={{ marginTop: 0, alignItems: "flex-end" }}>
          <div className="crediscope-descarga-campo" style={{ maxWidth: 220 }}>
            <label htmlFor="presupuesto">Cuánto por mes, en dólares</label>
            <input
              id="presupuesto"
              type="number"
              min="0"
              step="1"
              className="crediscope-input"
              value={borrador}
              placeholder="Sin definir"
              onChange={(e) => {
                setBorrador(e.target.value);
                setGuardado(false);
              }}
            />
          </div>
          <div className="crediscope-descarga-campo" style={{ justifyContent: "flex-end" }}>
            <button className="crediscope-btn" type="submit" disabled={guardando}>
              {guardando ? "Guardando..." : "Guardar"}
            </button>
          </div>
          {guardado ? (
            <div className="crediscope-descarga-campo" style={{ justifyContent: "flex-end" }}>
              <span style={{ color: "var(--good)", display: "inline-flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={16} /> Guardado
              </span>
            </div>
          ) : null}
        </form>

        {presupuesto > 0 ? (
          <div style={{ marginTop: 16 }}>
            <div className="crediscope-barrapct-track" style={{ height: 10 }}>
              <div
                className="crediscope-barrapct-fill"
                style={{
                  width: `${Math.min(100, pct)}%`,
                  background: pct >= 85 ? "var(--bad)" : pct >= 70 ? "var(--warn)" : "var(--good)",
                }}
              />
            </div>
            <p style={{ marginTop: 8, marginBottom: 0 }}>
              <strong>{money2(gastado)}</strong> de {money2(presupuesto)} en {gasto?.mes} — {pct}%
            </p>
            {gasto?.llamadas_sin_medir > 0 ? (
              <p className="crediscope-muted" style={{ margin: "6px 0 0", fontSize: 13.5 }}>
                No incluye {gasto.llamadas_sin_medir} llamadas que no se pudieron valuar: el gasto real es mayor. Y es consumo
                registrado por nosotros, no la factura del proveedor.
              </p>
            ) : null}
          </div>
        ) : (
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", marginTop: 14 }}>
            <AlertTriangle size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
            <p style={{ margin: 0 }}>
              <strong>Sin presupuesto definido no se avisa nada.</strong> Van {money2(gastado)} este mes. Es el punto 4.6 del
              temario de puesta en marcha y sigue pendiente de decisión.
            </p>
          </div>
        )}
      </div>

      <div className="crediscope-card">
        <h3>Avisos emitidos</h3>
        <p className="crediscope-muted" style={{ marginTop: 0 }}>
          Uno por hecho, nunca dos. Con reintentos, una caída de diez minutos genera decenas de errores; decenas de mensajes
          garantizan que se dejen de leer.
        </p>
        {!avisos ? (
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>Cargando...</p>
        ) : avisos.length === 0 ? (
          <p className="crediscope-muted" style={{ marginBottom: 0 }}>Todavía no hubo nada que avisar.</p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Cuándo</th>
                  <th>Qué</th>
                  <th>Mensaje</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {avisos.map((a) => (
                  <tr key={a.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(a.created_at)}</td>
                    <td style={{ fontSize: 13.5 }}>{ETIQUETA_TIPO[a.tipo] ?? a.tipo}</td>
                    <td style={{ fontSize: 13.5, maxWidth: 420 }}>
                      <strong>{a.titulo}</strong>
                      {a.cuerpo ? (
                        <div className="crediscope-muted" style={{ whiteSpace: "pre-wrap", marginTop: 2 }}>{a.cuerpo}</div>
                      ) : null}
                    </td>
                    <td style={{ fontSize: 13, whiteSpace: "nowrap" }}>
                      <span style={{ color: COLOR_ESTADO_AVISO[a.estado] }}>{ETIQUETA_ESTADO_AVISO[a.estado] ?? a.estado}</span>
                      {a.detalle ? (
                        <div className="crediscope-muted" style={{ fontSize: 12, maxWidth: 240, whiteSpace: "normal" }}>
                          {a.detalle}
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
