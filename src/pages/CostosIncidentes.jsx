import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, Clock, Wallet, Radio } from "lucide-react";
import { getConsumoLlm, getEstadoServicio, getIncidentes } from "../lib/api.js";
import { haceCuanto } from "../lib/fechas.js";
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

function Kpi({ Icono, etiqueta, valor, detalle, color }) {
  return (
    <div className="crediscope-card crediscope-kpi">
      <p className="crediscope-kpi-label">
        <Icono size={14} style={{ marginRight: 6, verticalAlign: "-2px" }} />
        {etiqueta}
      </p>
      <p className="crediscope-kpi-valor" style={color ? { color } : undefined}>{valor}</p>
      {detalle ? <p className="crediscope-kpi-detalle">{detalle}</p> : null}
    </div>
  );
}

const ETIQUETA_COMPONENTE = {
  llm: "Análisis con IA",
  fuente_datos: "Fuente de datos",
};

const DEPENDE_DE = {
  llm: "Proveedor del modelo de lenguaje",
  fuente_datos: "Proveedor de información crediticia",
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
            <th style={{ textAlign: "right" }}>Respuesta</th>
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
              <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                {e.duracion_ms ? `${e.duracion_ms} ms` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {caidos.length > 0 && caidos.length < estado.length ? (
        <p style={{ marginBottom: 0 }}>
          <strong>El servicio funciona en modo reducido.</strong> El Perfil del Cliente y las Fuentes de Ingreso siguen
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
      <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
        <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
      </div>
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
                  <th style={{ textAlign: "right" }}>Duración</th>
                  <th style={{ textAlign: "right" }}>Chequeos</th>
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
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: i.abierto ? 700 : 400 }}>
                      {i.minutos} min{i.abierto ? " · abierto" : ""}
                    </td>
                    <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i.chequeos_fallidos}</td>
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
            «Nadie fue avisado» es literal: el vigía detecta y registra, todavía no manda avisos. Esa columna es la lista de
            trabajo del canal de alertas cuando se construya.
          </p>
        </div>
      ) : null}

      {!d ? (
        <p className="crediscope-muted">Cargando...</p>
      ) : (
        <>
          <div className="crediscope-kpi-grid">
            <Kpi
              Icono={ShieldAlert}
              etiqueta="Incidentes"
              valor={num(d.lista.length)}
              detalle={`${d.fallidas} de ${d.total} llamadas fallaron`}
            />
            <Kpi
              Icono={Clock}
              etiqueta="El más largo"
              valor={d.masLargo ? `${d.masLargo.minutos} min` : "—"}
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
                    <th style={{ textAlign: "right" }}>Llamadas</th>
                    <th>Responde</th>
                    <th>Qué hacer</th>
                  </tr>
                </thead>
                <tbody>
                  {d.porCausa.map((c) => (
                    <tr key={c.clave}>
                      <td style={{ fontWeight: 600 }}>{ETIQUETA_FALLO[c.clave] ?? c.clave}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{c.llamadas}</td>
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
                    <th style={{ textAlign: "right" }}>Duración</th>
                    <th>Causa</th>
                    <th style={{ textAlign: "right" }}>Llamadas</th>
                    <th style={{ textAlign: "right" }}>Gastado</th>
                  </tr>
                </thead>
                <tbody>
                  {d.lista.map((i, k) => (
                    <tr key={`${i.causa}-${i.inicio}-${k}`}>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(i.inicio)}</td>
                      <td style={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{fechaHora(i.fin)}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {i.minutos === 0 ? "< 1 min" : `${i.minutos} min`}
                      </td>
                      <td>{ETIQUETA_FALLO[i.causa] ?? i.causa}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{i.llamadas}</td>
                      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{money(i.costo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="crediscope-card">
            <h3>Qué falta para enterarse a tiempo</h3>
            <p style={{ marginTop: 0 }}>
              Todo lo de arriba se reconstruyó <strong>después</strong>. La noche del 10 el proveedor estuvo caído seis
              minutos y nadie lo supo hasta hoy, porque el error se guardaba dentro del análisis y desde afuera esas consultas
              se veían normales. Con la causa ya clasificada y guardada, lo que falta es que alguien mire y avise:
            </p>
            <ul className="crediscope-list">
              <li>
                <s>Un vigía que corra solo.</s> <strong>Listo:</strong> cada quince minutos comprueba el modelo y la fuente de
                datos, y deja constancia aunque nadie esté consultando.
              </li>
              <li>
                <s>Un aviso por incidente, no por llamada.</s> <strong>Listo:</strong> se avisa al abrirse y al cerrarse, una
                sola vez cada uno. Ver <Link to="/costos/avisos">Avisos</Link>.
              </li>
              <li>
                <s>Avisar antes, no después.</s> <strong>Listo:</strong> con un presupuesto mensual definido, el vigía avisa al
                70%, 85% y 100% antes de que el servicio se pare.
              </li>
              <li>
                <strong>Falta el canal.</strong> Todo lo anterior detecta, registra y prepara el mensaje — pero mientras no
                haya canal configurado, nadie lo recibe. Es lo único que queda entre esto y enterarse a tiempo.
              </li>
            </ul>
            <p className="crediscope-muted" style={{ marginBottom: 0 }}>
              Nada de esto está construido todavía. La parte que sí quedó lista es la que no se puede improvisar después: la
              causa de cada falla, guardada en el momento.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
