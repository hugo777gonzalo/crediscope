import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, X, ChevronLeft, ChevronRight, IdCard, Wallet, Sparkles, ArrowRight, ShieldAlert } from "lucide-react";
import {
  getBandejaSolicitudes,
  getBandejaConteos,
  getSegmentosDeLaCartera,
  ORDENES_BANDEJA,
  BANDEJA_POR_PAGINA,
} from "../lib/api.js";
import { ETIQUETA_SEGMENTO, ETIQUETA_ESTADO, formatMoneda } from "../lib/fuentesIngresoConsolidado.js";
import { esIngresoMinimoSbu, INGRESO_MINIMO_SBU } from "../lib/ingresosCampos.js";
import { formatearFechaHora, hoyEcuador } from "../lib/fechas.js";
import { nombreCorto } from "../lib/perfilClienteCampos.js";
import {
  colorScore,
  colorFranja,
  colorRecomendacion,
  textoRecomendacion,
  ETIQUETA_ESTADO_BANDEJA,
  COLOR_ESTADO_BANDEJA,
  proporcionScore,
} from "../lib/bandeja.js";
import { recordarBusquedaBandeja } from "../lib/regresoBandeja.js";

// La bandeja: una fila por persona consultada, con lo último que se
// sabe de ella. Es la puerta de entrada al expediente.
//
// Mientras no exista la solicitud como entidad (ver
// docs/arquitectura-fabrica-de-credito.md), cada fila es una PERSONA y
// no un pedido de crédito: no hay monto, plazo, producto, agencia ni
// asesor porque no existen todavía, y dibujar columnas vacías sería
// peor que no tenerlas. El aviso del pie lo dice en la pantalla.
//
// Los filtros viven en la URL. Tres razones y ninguna es estética: la
// vista se puede pegar en un chat, sobrevive a recargar la página (el
// 404 del día siguiente), y volver desde el expediente encuentra la
// bandeja como se la dejó.

// Las tarjetas de la franja superior. Cada una filtra por lo que
// muestra: ver "3 para revisar" y no poder hacer clic es mostrarle al
// analista su propio trabajo detrás de un vidrio.
const TARJETAS = [
  { clave: "total", etiqueta: "En la búsqueda", color: "var(--text)", filtro: null },
  { clave: "aprobar", etiqueta: "Aprobar", color: "var(--good)", filtro: ["recomendacion", "aprobar"] },
  { clave: "revisar", etiqueta: "Revisar", color: "var(--warn)", filtro: ["recomendacion", "revisar"] },
  { clave: "observar", etiqueta: "Observar", color: "var(--brand)", filtro: ["recomendacion", "observar"] },
  { clave: "negar", etiqueta: "Negar", color: "var(--bad)", filtro: ["recomendacion", "negar"] },
  { clave: "sin_analisis", etiqueta: "Sin analizar", color: "var(--text-muted)", filtro: ["estado", "sin_analisis"] },
  // Las que hay que volver a consultar. Tienen su propia tarjeta
  // porque son trabajo pendiente nuestro, no de un analista.
  { clave: "consulta_fallida", etiqueta: "Consulta falló", color: "var(--warn)", filtro: ["estado", "consulta_fallida"] },
  { clave: "con_bloqueo", etiqueta: "Con bloqueo", color: "var(--bad)", filtro: null },
];

export default function Solicitudes() {
  const [params, setParams] = useSearchParams();
  const [datos, setDatos] = useState(null);
  const [conteos, setConteos] = useState(null);
  const [segmentos, setSegmentos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  // El texto de la caja de búsqueda vive aparte del filtro aplicado:
  // consultar en cada tecla dispararía una consulta por letra contra
  // 2.566 filas. Se aplica al enviar.
  const [textoBusqueda, setTextoBusqueda] = useState(params.get("q") ?? "");

  const filtros = useMemo(
    () => ({
      desde: params.get("desde") ?? "",
      hasta: params.get("hasta") ?? "",
      busqueda: params.get("q") ?? "",
      segmento: params.get("segmento") ?? "",
      recomendacion: params.get("recomendacion") ?? "",
      estado: params.get("estado") ?? "",
      origen: params.get("origen") ?? "",
      orden: params.get("orden") ?? "reciente",
      pagina: Number(params.get("pagina") ?? 0),
    }),
    [params],
  );

  useEffect(() => {
    let vigente = true;
    setCargando(true);
    setError(null);
    Promise.all([getBandejaSolicitudes(filtros), getBandejaConteos(filtros)])
      .then(([lista, totales]) => {
        // Una respuesta que llega tarde no puede pisar a la de un
        // filtro más nuevo: con búsquedas rápidas se veía el resultado
        // de la consulta anterior.
        if (!vigente) return;
        setDatos(lista);
        setConteos(totales);
      })
      .catch((err) => vigente && setError(err.message))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [filtros]);

  useEffect(() => {
    getSegmentosDeLaCartera().then(setSegmentos).catch(() => setSegmentos([]));
  }, []);

  // Para que el expediente sepa a qué bandeja volver.
  useEffect(() => {
    recordarBusquedaBandeja(params.toString());
  }, [params]);

  function cambiar(cambios) {
    const siguiente = new URLSearchParams(params);
    for (const [clave, valor] of Object.entries(cambios)) {
      if (valor === "" || valor === null || valor === undefined) siguiente.delete(clave);
      else siguiente.set(clave, String(valor));
    }
    // Cualquier cambio de filtro vuelve a la primera página: quedarse
    // en la página 7 de un resultado que ahora tiene 2 es una pantalla
    // vacía sin explicación.
    if (!("pagina" in cambios)) siguiente.delete("pagina");
    setParams(siguiente, { replace: true });
  }

  function limpiar() {
    setTextoBusqueda("");
    setParams(new URLSearchParams(), { replace: true });
  }

  const chips = [
    filtros.desde && { clave: "desde", texto: `Desde ${filtros.desde}` },
    filtros.hasta && { clave: "hasta", texto: `Hasta ${filtros.hasta}` },
    filtros.busqueda && { clave: "q", texto: `"${filtros.busqueda}"` },
    filtros.segmento && { clave: "segmento", texto: ETIQUETA_SEGMENTO[filtros.segmento] ?? filtros.segmento },
    filtros.recomendacion && { clave: "recomendacion", texto: textoRecomendacion(filtros.recomendacion) },
    filtros.estado && { clave: "estado", texto: ETIQUETA_ESTADO_BANDEJA[filtros.estado] },
    filtros.origen && { clave: "origen", texto: filtros.origen === "lote" ? "De lote" : "Consulta individual" },
  ].filter(Boolean);

  const filas = datos?.filas ?? [];
  const total = datos?.total ?? 0;
  const primeraFila = filtros.pagina * BANDEJA_POR_PAGINA;
  const hayMas = primeraFila + filas.length < total;

  return (
    <div>
      <div className="crediscope-card">
        <form
          className="crediscope-bandeja-filtros"
          onSubmit={(e) => {
            e.preventDefault();
            cambiar({ q: textoBusqueda.trim() });
          }}
        >
          <div className="crediscope-filtro" style={{ flex: "1 1 220px" }}>
            <label htmlFor="b-q">Cédula o nombre</label>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                id="b-q"
                value={textoBusqueda}
                onChange={(e) => setTextoBusqueda(e.target.value)}
                placeholder="0502937675 o CHAVEZ"
                style={{ flex: 1 }}
              />
              <button className="crediscope-btn" type="submit" style={{ padding: "7px 12px" }} title="Buscar">
                <Search size={15} />
              </button>
            </div>
          </div>

          <div className="crediscope-filtro">
            <label htmlFor="b-desde">Actividad desde</label>
            <input id="b-desde" type="date" max={hoyEcuador()} value={filtros.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
          </div>

          <div className="crediscope-filtro">
            <label htmlFor="b-hasta">Hasta</label>
            <input id="b-hasta" type="date" max={hoyEcuador()} value={filtros.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
          </div>

          <div className="crediscope-filtro">
            <label htmlFor="b-segmento">Fuente de ingreso</label>
            <select id="b-segmento" value={filtros.segmento} onChange={(e) => cambiar({ segmento: e.target.value })}>
              <option value="">Todas</option>
              {segmentos.map((s) => (
                <option key={s} value={s}>
                  {ETIQUETA_SEGMENTO[s] ?? s}
                </option>
              ))}
            </select>
          </div>

          <div className="crediscope-filtro">
            <label htmlFor="b-estado">Estado</label>
            <select id="b-estado" value={filtros.estado} onChange={(e) => cambiar({ estado: e.target.value })}>
              <option value="">Todos</option>
              {Object.entries(ETIQUETA_ESTADO_BANDEJA).map(([clave, texto]) => (
                <option key={clave} value={clave}>
                  {texto}
                </option>
              ))}
            </select>
          </div>

          <div className="crediscope-filtro">
            <label htmlFor="b-origen">Origen</label>
            <select id="b-origen" value={filtros.origen} onChange={(e) => cambiar({ origen: e.target.value })}>
              <option value="">Todos</option>
              <option value="consulta">Consulta individual</option>
              <option value="lote">Corrida por lote</option>
            </select>
          </div>

          <div className="crediscope-filtro">
            <label htmlFor="b-orden">Ordenar por</label>
            <select id="b-orden" value={filtros.orden} onChange={(e) => cambiar({ orden: e.target.value })}>
              {Object.entries(ORDENES_BANDEJA).map(([clave, { texto }]) => (
                <option key={clave} value={clave}>
                  {texto}
                </option>
              ))}
            </select>
          </div>
        </form>

        {chips.length > 0 ? (
          <div className="crediscope-chips">
            {chips.map((c) => (
              <span key={c.clave} className="crediscope-chip">
                {c.texto}
                <button
                  type="button"
                  onClick={() => {
                    if (c.clave === "q") setTextoBusqueda("");
                    cambiar({ [c.clave]: "" });
                  }}
                  aria-label={`Quitar filtro ${c.texto}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            <button type="button" className="crediscope-btn crediscope-btn-ghost" style={{ padding: "3px 11px", fontSize: 12.5 }} onClick={limpiar}>
              Limpiar todo
            </button>
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
          <p style={{ color: "var(--bad)", margin: 0 }}>{error}</p>
        </div>
      ) : null}

      <div className="crediscope-franja">
        {TARJETAS.map((t) => {
          const valor = conteos?.[t.clave];
          const activa = t.filtro ? filtros[t.filtro[0]] === t.filtro[1] : false;
          return (
            <button
              key={t.clave}
              type="button"
              className="crediscope-franja-celda"
              style={{ color: t.color }}
              aria-pressed={t.filtro ? activa : undefined}
              disabled={!t.filtro}
              onClick={() => t.filtro && cambiar({ [t.filtro[0]]: activa ? "" : t.filtro[1] })}
              title={t.filtro ? (activa ? "Quitar este filtro" : `Ver solo: ${t.etiqueta}`) : undefined}
            >
              <span className="crediscope-franja-etiqueta">{t.etiqueta}</span>
              <span className="crediscope-franja-valor" style={{ color: t.clave === "total" ? "var(--text)" : t.color }}>
                {valor === null || valor === undefined ? "—" : valor.toLocaleString("es-EC")}
              </span>
            </button>
          );
        })}
      </div>

      <div className="crediscope-card">
        {cargando && !datos ? <p className="crediscope-muted" style={{ margin: 0 }}>Cargando...</p> : null}

        {datos && filas.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0 }}>
            Ninguna persona coincide con estos filtros.
          </p>
        ) : null}

        {filas.length > 0 ? (
          <>
            <div className="crediscope-bandeja-scroll">
              <table className="crediscope-bandeja-tabla">
                <thead>
                  <tr>
                    <th>Última actividad</th>
                    <th>Persona</th>
                    <th>Fuente de ingreso</th>
                    <th style={{ textAlign: "right" }}>Ingreso IESS</th>
                    <th style={{ textAlign: "right" }}>Puntaje</th>
                    <th>Resultado</th>
                    <th>Consultas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <FilaBandeja key={f.client_id} f={f} />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="crediscope-paginacion">
              <span className="crediscope-muted">
                {primeraFila + 1}–{primeraFila + filas.length} de {total.toLocaleString("es-EC")}
                {cargando ? " · actualizando..." : ""}
              </span>
              <div className="crediscope-paginacion-botones">
                <button
                  className="crediscope-btn crediscope-btn-ghost"
                  disabled={filtros.pagina === 0}
                  onClick={() => cambiar({ pagina: filtros.pagina - 1 })}
                >
                  <ChevronLeft size={15} style={{ verticalAlign: "-2px" }} /> Anterior
                </button>
                <button className="crediscope-btn crediscope-btn-ghost" disabled={!hayMas} onClick={() => cambiar({ pagina: filtros.pagina + 1 })}>
                  Siguiente <ChevronRight size={15} style={{ verticalAlign: "-2px" }} />
                </button>
              </div>
            </div>
          </>
        ) : null}
      </div>

      {/* El hueco, dicho en la pantalla. Un analista que busca el filtro
          de agencia y no lo encuentra va a suponer que está roto. */}
      <div className="crediscope-pendiente">
        <p>
          <strong>Todavía no se puede filtrar por asesor, agencia ni tipo de crédito.</strong> Son datos de la solicitud, y la
          solicitud como entidad no existe todavía: hoy cada fila es una persona consultada, no un pedido de crédito. Tampoco hay
          monto, plazo ni capacidad de pago por la misma razón.
        </p>
      </div>
    </div>
  );
}

function FilaBandeja({ f }) {
  const nombre = nombreCorto(f.nombre);
  const recomendacion = textoRecomendacion(f.recomendacion);

  return (
    <tr>
      <td className="crediscope-franja-fila" style={{ borderLeftColor: colorFranja(f) }}>
        <span className="crediscope-num">{formatearFechaHora(f.ultima_actividad)}</span>
        {f.perfil_origen === "lote" ? <span className="crediscope-celda-sub"><span className="crediscope-sello-lote">Lote</span></span> : null}
      </td>

      <td>
        <span className="crediscope-celda-fuerte">{nombre ?? "Sin nombre en la fuente"}</span>
        <span className="crediscope-celda-sub crediscope-num">
          {f.cedula}
          {f.edad ? ` · ${f.edad} años` : ""}
          {f.provincia ? ` · ${f.provincia}` : ""}
        </span>
      </td>

      <td>
        {f.fuente_segmento ? (
          <>
            <span>{ETIQUETA_SEGMENTO[f.fuente_segmento] ?? f.fuente_segmento}</span>
            <span className="crediscope-celda-sub">
              {ETIQUETA_ESTADO[f.fuente_estado] ?? "—"}
              {f.empleos_vigentes > 0 ? ` · ${f.empleos_vigentes} empleo${f.empleos_vigentes > 1 ? "s" : ""}` : ""}
            </span>
          </>
        ) : (
          <span className="crediscope-muted">—</span>
        )}
      </td>

      <td style={{ textAlign: "right" }} className="crediscope-num">
        {f.fuente_piso_ingreso ? (
          <>
            {formatMoneda(Number(f.fuente_piso_ingreso))}
            {esIngresoMinimoSbu(Number(f.fuente_piso_ingreso), f.fuente_corte) ? (
              <div className="crediscope-muted" style={{ fontSize: 11.5 }}>
                {INGRESO_MINIMO_SBU}
              </div>
            ) : null}
          </>
        ) : (
          <span className="crediscope-muted">—</span>
        )}
      </td>

      <td style={{ textAlign: "right" }}>
        {f.score ? (
          <>
            <div className="crediscope-score-celda" style={{ color: colorScore(f.score) }}>
              {f.score}
            </div>
            {/* El riel: "690" obliga a recordar que el tope es 999. */}
            <div className="crediscope-score-riel">
              <span style={{ width: `${proporcionScore(f.score) * 100}%`, background: colorScore(f.score) }} />
            </div>
          </>
        ) : (
          <span className="crediscope-muted">—</span>
        )}
      </td>

      <td>
        {recomendacion ? (
          <span className="crediscope-recomendacion crediscope-recomendacion-small" style={{ color: colorRecomendacion(f.recomendacion), borderColor: colorRecomendacion(f.recomendacion) }}>
            {recomendacion}
          </span>
        ) : (
          <span style={{ color: COLOR_ESTADO_BANDEJA[f.estado], fontSize: 12.5 }}>{ETIQUETA_ESTADO_BANDEJA[f.estado]}</span>
        )}
        {f.tiene_bloqueante ? (
          <span className="crediscope-celda-sub" style={{ color: "var(--bad)", display: "flex", alignItems: "center", gap: 4 }}>
            <ShieldAlert size={12} /> Lista de control
          </span>
        ) : null}
      </td>

      <td className="crediscope-num crediscope-muted">{f.consultas}</td>

      <td>
        {/* Siempre en esta posición y en este orden. Es lo que los
            convierte en memoria muscular. */}
        <div className="crediscope-accesos">
          <Link className="crediscope-acceso" to={`/perfil/${f.cedula}`} title="Perfil del Cliente">
            <IdCard size={15} />
          </Link>
          {/* Las fuentes de ingreso DE ESTA PERSONA viven en el
              expediente. El panorama por segmento es otra pregunta
              ("quiénes son los independientes") y mandar ahí desde una
              fila sería cambiarle la pregunta al analista. */}
          <Link className="crediscope-acceso" to={`/solicitudes/${f.cedula}#ingresos`} title="Fuentes de Ingreso">
            <Wallet size={15} />
          </Link>
          <Link className="crediscope-acceso" to={`/analisis/${f.cedula}`} title="Análisis con IA">
            <Sparkles size={15} />
          </Link>
          <Link className="crediscope-abrir" to={`/solicitudes/${f.cedula}`}>
            Abrir <ArrowRight size={13} />
          </Link>
        </div>
      </td>
    </tr>
  );
}
