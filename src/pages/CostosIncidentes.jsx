import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Clock, Wallet, Radio } from "lucide-react";
import { getConsumoLlm, getEstadoServicio, getIncidentes } from "../lib/api.js";
import { haceCuanto } from "../lib/fechas.js";
import { entero, plural, segundos, duracionLarga } from "../lib/formatos.js";
import {
  incidentes,
  agrupar,
  ETIQUETA_FALLO,
  RESPONSABLE_FALLO,
  QUE_HACER_FALLO,
  money,
  num,
  fechaHora,
} from "../lib/consumoLlm.js";
import Kpi from "../components/ui/Kpi.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";

// Fallas e incidentes: de qué se cayó el servicio, cuánto duró y de
// quién dependía resolverlo.
//
// Una llamada fallida no es un incidente. Cuatro errores del proveedor
// en seis minutos son UN corte de seis minutos, y esa es la cifra que
// sostiene un compromiso de tiempo de resolución. Contar llamadas daría
// cuatro incidentes de duración cero, que no dice nada.
//
// La columna que más importa es quién responde: una caída del proveedor
// no se corrige, se comunica; un tope de consumo alcanzado se corrige
// en dos minutos y no debería haber llegado a pasar.

const ETIQUETA_COMPONENTE = {
  llm: "Análisis con IA",
  fuente_datos: "Fuente de datos",
  canal_aviso: "Canal de avisos",
};

const DEPENDE_DE = {
  llm: "Proveedor del modelo de lenguaje",
  fuente_datos: "Proveedor de información crediticia",
  canal_aviso: "Mensajería por la que salen los avisos",
};

// Estado en vivo según el último chequeo del vigía. Va arriba de todo
// porque responde la pregunta que trae a alguien a esta pantalla:
// ¿está funcionando ahora?
function Semaforo({ estado }) {
  if (!estado?.length) return null;
  const caidos = estado.filter((e) => e.estado === "caido");
  const todoBien = caidos.length === 0 && estado.every((e) => e.estado === "operativo");

  return (
    <div className="crediscope-card" style={{ borderColor: todoBien ? "var(--good)" : "var(--bad)" }}>
      <h3 style={{ marginTop: 0 }}>Estado ahora</h3>
      <p className="crediscope-muted" style={{ marginTop: 0 }}>
        Según el último chequeo automático. Corre cada quince minutos, haya o no consultas.
      </p>
      <table className="crediscope-table">
        <thead>
          <tr>
            <th>Componente</th>
            <th>Estado</th>
            <th>Desde</th>
            <th>Último chequeo</th>
            <th className="crediscope-cifra">Respuesta</th>
          </tr>
        </thead>
        <tbody>
          {estado.map((e) => (
            <tr key={e.componente}>
              <td>
                <strong>{ETIQUETA_COMPONENTE[e.componente] ?? e.componente}</strong>
                <div className="crediscope-muted" style={{ fontSize: 12 }}>{DEPENDE_DE[e.componente]}</div>
              </td>
              <td>
                <span
                  className="crediscope-tag"
                  style={{
                    background: "var(--panel-muted)",
                    color: e.estado === "operativo" ? "var(--good)" : e.estado === "caido" ? "var(--bad)" : "var(--text-muted)",
                    fontWeight: 700,
                  }}
                >
                  {e.estado === "operativo" ? "Operativo" : e.estado === "caido" ? "Caído" : "Sin datos"}
                </span>
                {e.ultimo_fallo_tipo ? (
                  <div className="crediscope-muted" style={{ fontSize: 12 }}>{ETIQUETA_FALLO[e.ultimo_fallo_tipo]}</div>
                ) : null}
              </td>
              <td style={{ fontSize: 13 }}>{haceCuanto(e.desde)}</td>
              <td style={{ fontSize: 13 }}>{haceCuanto(e.ultimo_chequeo)}</td>
              <td className="crediscope-cifra">{e.duracion_ms ? segundos(e.duracion_ms) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {caidos.length > 0 && caidos.length < estado.length ? (
        <p style={{ marginBottom: 0 }}>
          <strong>El servicio funciona en modo reducido.</strong> El Perfil de la Persona y las Fuentes de Ingreso siguen
          disponibles: no dependen de lo que está caído.
        </p>
      ) : null}
    </div>
  );
}

export default function CostosIncidentes() {
  const [filas, setFilas] = useState(null);
  const [estado, setEstado] = useState(null);
  const [vigilados, setVigilados] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    getConsumoLlm()
      .then(setFilas)
      .catch((err) => setError(err.message));
    getEstadoServicio().then(setEstado).catch(() => setEstado([]));
    getIncidentes().then(setVigilados).catch(() => setVigilados([]));
  }, []);

  const d = useMemo(() => {
    if (!filas) return null;
    const lista = incidentes(filas);
    const fallidas = filas.filter((r) => !r.exito);
    const quemado = fallidas.reduce((s, r) => s + Number(r.costo_usd ?? 0), 0);
    const ultimo = lista[0] ?? null;
    return {
      lista,
      fallidas: fallidas.length,
      total: filas.length,
      quemado,
      masLargo: lista.reduce((max, i) => (i.minutos > (max?.minutos ?? -1) ? i : max), null),
      porCausa: agrupar(fallidas, (r) => r.fallo_tipo ?? "desconocido").sort((a, b) => b.llamadas - a.llamadas),
      ultimo,
    };
  }, [filas]);

  if (error)
    return (
      <AvisoDeError error={error} />
    );

  return (
    <div>
      <p>
        <Link to="/costos" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Fallas e incidentes</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Cuándo el análisis dejó de funcionar, por qué, cuánto duró y de quién dependía resolverlo.
        </p>
      </div>

      <Semaforo estado={estado} />

      {vigilados.length > 0 ? (
        <div className="crediscope-card">
          <h3>Detectados por el vigía</h3>
          <p className="crediscope-muted" style={{ marginTop: 0 }}>
            Cortes que encontró el chequeo automático, hubiera o no alguien consultando. Es la diferencia entre enterarse y
            deducirlo después.
          </p>
          <div style={{ overflowX: "auto" }}>
            <table className="crediscope-table">
              <thead>
                <tr>
                  <th>Inicio</th>
                  <th>Componente</th>
                  <th>Causa</th>
                  <th className="crediscope-cifra">Duración</th>
                  <th className="crediscope-cifra">Chequeos</th>
                  <th>Responde</th>
                  <th>Avisado</th>
                </tr>
              </thead>
              <tbody>
                {vigilados.map((i) => (
                  <tr key={i.id}>
                    <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(i.inicio)}</td>
                    <td>{ETIQUETA_COMPONENTE[i.componente] ?? i.componente}</td>
                    <td>{ETIQUETA_FALLO[i.causa] ?? i.causa}</td>
                    <td className="crediscope-cifra" style={{ fontWeight: i.abierto ? 700 : 400 }}>
                      {duracionLarga(i.minutos)}{i.abierto ? " · abierto" : ""}
                    </td>
                    <td className="crediscope-cifra">{entero(i.chequeos_fallidos)}</td>
                    <td style={{ fontSize: 13 }}>{i.responsable === "proveedor" ? "Proveedor" : "Nosotros"}</td>
                    <td style={{ fontSize: 13, color: i.notificado_at ? undefined : "var(--warn)" }}>
                      {i.notificado_at ? fechaHora(i.notificado_at) : "Nadie fue avisado"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
            «Nadie fue avisado» quiere decir que el aviso no salió: todavía no hay un canal de mensajería configurado, o el envío
            falló. El detalle de cada aviso está en <Link to="/costos/avisos">Avisos</Link>.
          </p>
        </div>
      ) : null}

      {!d ? (
        <Cargando />
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi
              Icono={ShieldAlert}
              etiqueta="Incidentes"
              valor={num(d.lista.length)}
              detalle={`${entero(d.fallidas)} de ${plural(d.total, "llamada")} fallaron`}
            />
            <Kpi
              Icono={Clock}
              etiqueta="El más largo"
              valor={d.masLargo ? duracionLarga(d.masLargo.minutos) : "—"}
              detalle={d.masLargo ? ETIQUETA_FALLO[d.masLargo.causa] : null}
            />
            <Kpi
              Icono={Wallet}
              etiqueta="Gastado en fallas"
              valor={money(d.quemado)}
              detalle="Tokens que se pagaron sin producir un análisis"
            />
            <Kpi
              Icono={Radio}
              etiqueta="Última falla"
              valor={d.ultimo ? fechaHora(d.ultimo.fin) : "—"}
              detalle={d.ultimo ? ETIQUETA_FALLO[d.ultimo.causa] : "Sin fallas registradas"}
              color={d.ultimo ? "var(--warn)" : undefined}
            />
          </div>

          <div className="crediscope-card">
            <h3>Por causa</h3>
            <p className="crediscope-muted" style={{ marginTop: 0 }}>
              Agrupar por causa es lo que vuelve accionable el dato: "doce llamadas fallaron" no se corrige, "doce fallaron
              por tope de consumo" se corrige en dos minutos.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Causa</th>
                    <th className="crediscope-cifra">Llamadas</th>
                    <th>Responde</th>
                    <th>Qué hacer</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porCausa.map((c) => (
                    <tr key={c.clave}>
                      <td style={{ fontWeight: 600 }}>{ETIQUETA_FALLO[c.clave] ?? c.clave}</td>
                      <td className="crediscope-cifra">{entero(c.llamadas)}</td>
                      <td>
                        <span
                          className="crediscope-tag"
                          style={{
                            background: "var(--panel-muted)",
                            color: RESPONSABLE_FALLO[c.clave] === "proveedor" ? "var(--text-muted)" : "var(--warn)",
                          }}
                        >
                          {RESPONSABLE_FALLO[c.clave] === "proveedor" ? "Proveedor" : "Nosotros"}
                        </span>
                      </td>
                      <td style={{ fontSize: 13 }}>{QUE_HACER_FALLO[c.clave]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {d.porCausa.length === 0 ? (
              <p className="crediscope-muted" style={{ marginBottom: 0 }}>Ninguna llamada falló.</p>
            ) : null}
          </div>

          <div className="crediscope-card">
            <h3>Cronología</h3>
            <p className="crediscope-muted" style={{ marginTop: 0 }}>
              Fallas seguidas de la misma causa se cuentan como un solo incidente, con hasta una hora de silencio entre medio.
            </p>
            <div style={{ overflowX: "auto" }}>
              <table className="crediscope-table">
                <thead>
                  <tr>
                    <th>Inicio</th>
                    <th>Fin</th>
                    <th className="crediscope-cifra">Duración</th>
                    <th>Causa</th>
                    <th className="crediscope-cifra">Llamadas</th>
                    <th className="crediscope-cifra">Gastado</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lista.map((i, k) => (
                    <tr key={`${i.causa}-${i.inicio}-${k}`}>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(i.inicio)}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(i.fin)}</td>
                      <td className="crediscope-cifra">{i.minutos === 0 ? "< 1 min" : duracionLarga(i.minutos)}</td>
                      <td>{ETIQUETA_FALLO[i.causa] ?? i.causa}</td>
                      <td className="crediscope-cifra">{entero(i.llamadas)}</td>
                      <td className="crediscope-cifra">{money(i.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="crediscope-card">
            <h3>Cómo se vigila el servicio</h3>
            <ul className="crediscope-list">
              <li>
                El vigía comprueba el modelo y la fuente de datos <strong>cada quince minutos</strong>, haya o no consultas, y deja
                constancia de cada chequeo.
              </li>
              <li>
                Se avisa <strong>una sola vez al abrirse</strong> un incidente y <strong>una al cerrarse</strong>, no por cada
                llamada fallida. Ver <Link to="/costos/avisos">Avisos</Link>.
              </li>
              <li>
                Con un presupuesto mensual definido, avisa al <strong>70%, 85% y 100%</strong> antes de que el servicio se pare.
              </li>
              <li>
                Los avisos salen por mensajería instantánea. Mientras no haya un canal configurado, el aviso queda registrado y nadie
                lo recibe: <Link to="/costos/avisos">Avisos</Link> dice cómo está el canal.
              </li>
            </ul>
            <p className="crediscope-muted" style={{ marginBottom: 0 }}>
              De cada falla queda guardada la causa en el momento en que ocurre; por eso esta pantalla puede agrupar y contar sin
              reconstruir nada después.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
