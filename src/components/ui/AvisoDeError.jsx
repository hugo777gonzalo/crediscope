import Aviso from "./Aviso.jsx";
import { describirError } from "../../lib/mensajesDeError.js";

// El aviso de error de toda la aplicación: dice qué pasó en castellano y
// guarda el texto técnico plegado (ver mensajesDeError.js). Reemplaza a las
// treinta y nueve copias de <div className="crediscope-card" style={{
// borderColor: "var(--bad)" }}> que mostraban error.message sin traducir.
//
//   <AvisoDeError error={err} />                       el mensaje sale de describirError()
//   <AvisoDeError titulo="..." mensaje="..." detalle="...">  todo dicho a mano
//
// Con `children` se puede sumar texto o botones debajo del mensaje. Si el error
// se arregla esperando y volviendo a intentar (conexión, tiempo agotado), sale
// un botón "Reintentar": `alReintentar` es lo que hace, y si no se pasa
// recarga la pantalla.

export default function AvisoDeError({ error = null, titulo = null, mensaje = null, detalle = null, alReintentar = null, children = null }) {
  if (!error && !mensaje && !children) return null;
  const descrito = error ? describirError(error) : { mensaje: null, detalle: null, reintentable: false };
  const textoMensaje = mensaje ?? descrito.mensaje;
  const textoDetalle = detalle ?? descrito.detalle;
  return (
    <Aviso tipo="peligro" titulo={titulo}>
      {textoMensaje ? <p className="crediscope-aviso-texto">{textoMensaje}</p> : null}
      {children}
      {descrito.reintentable ? (
        <p style={{ margin: "10px 0 0" }}>
          <button type="button" className="crediscope-btn crediscope-btn-ghost" onClick={alReintentar ?? (() => window.location.reload())}>
            Reintentar
          </button>
        </p>
      ) : null}
      {textoDetalle ? (
        <details className="crediscope-aviso-detalle">
          <summary>Detalle técnico</summary>
          <code>{textoDetalle}</code>
        </details>
      ) : null}
    </Aviso>
  );
}
