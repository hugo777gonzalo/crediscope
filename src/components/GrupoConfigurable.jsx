import { useState } from "react";
import { ChevronDown, Power } from "lucide-react";

// Un grupo de opciones de configuración, plegable, con un interruptor
// para todo el grupo.
//
// Por qué plegable: las tres pantallas de configuración suman más de
// cien opciones. Mostradas todas abiertas, encontrar la que uno busca
// es recorrer una lista interminable — y peor, quien entra a cambiar
// una cosa se lleva por delante otras noventa y nueve que no pensaba
// tocar. El título con el contador dice el volumen; el detalle se abre
// bajo demanda, igual que en Análisis con IA.
//
// Por qué el interruptor de grupo: apagar una fuente de información
// entera es una operación real — "hoy el Registro Civil está caído, no
// lo consultemos" — y hacerla de a una casilla sobre doce recursos es
// invitar a que queden tres prendidos por descuido.
//
// El contador dice CUÁNTOS ESTÁN ACTIVOS sobre el total, no cuántos
// hay. Es lo que alguien necesita ver de un vistazo: un grupo que dice
// "8 de 12" tiene cuatro cosas apagadas y eso merece una mirada.

export default function GrupoConfigurable({
  titulo,
  descripcion,
  activos,
  total,
  onTodo,
  abiertoPorDefecto = false,
  children,
}) {
  const [abierto, setAbierto] = useState(abiertoPorDefecto);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState(null);

  const todoActivo = activos === total;
  const todoInactivo = activos === 0;
  const color = todoInactivo ? "var(--text-muted)" : todoActivo ? "var(--good)" : "var(--warn)";

  async function aplicarATodo(valor) {
    setAplicando(true);
    setError(null);
    try {
      await onTodo(valor);
    } catch (err) {
      setError(err.message);
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className={`crediscope-seccion ${abierto ? "crediscope-seccion-abierta" : ""}`}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <button
          type="button"
          className="crediscope-seccion-cabecera"
          style={{ flex: 1 }}
          onClick={() => setAbierto((v) => !v)}
          aria-expanded={abierto}
        >
          <span className="crediscope-seccion-icono" style={{ color }}>
            <Power size={18} />
          </span>
          <span className="crediscope-seccion-titulo">
            {titulo}
            {descripcion ? (
              <span className="crediscope-muted" style={{ display: "block", fontSize: 12.5, fontWeight: 400, marginTop: 2 }}>
                {descripcion}
              </span>
            ) : null}
          </span>
          <span className="crediscope-seccion-cantidad" style={{ color, whiteSpace: "nowrap" }}>
            {activos} de {total}
          </span>
          <ChevronDown size={17} className="crediscope-seccion-chevron" style={{ color: "var(--text-muted)" }} />
        </button>

        {onTodo ? (
          <button
            type="button"
            className="crediscope-btn crediscope-btn-ghost"
            style={{ padding: "5px 11px", fontSize: 12.5, whiteSpace: "nowrap", marginRight: 12 }}
            disabled={aplicando}
            onClick={() => aplicarATodo(!todoActivo)}
            title={todoActivo ? "Apagar todo el grupo" : "Encender todo el grupo"}
          >
            {aplicando ? "..." : todoActivo ? "Apagar todo" : "Encender todo"}
          </button>
        ) : null}
      </div>

      {error ? (
        <p style={{ color: "var(--bad)", fontSize: 13, margin: "0 16px 10px" }}>{error}</p>
      ) : null}

      {abierto ? <div className="crediscope-seccion-cuerpo">{children}</div> : null}
    </div>
  );
}
