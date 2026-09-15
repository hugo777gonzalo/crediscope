import { useState } from "react";
import { ServerCrash, ChevronDown } from "lucide-react";

// Qué se muestra cuando el análisis no se pudo completar.
//
// Antes esto no existía: el error crudo de la API se guardaba como
// resumen y la pantalla lo mostraba igual que un criterio sobre el
// cliente, con el marcador en 500 y "Revisar" al lado. Dos cosas mal a
// la vez -- el analista no entendía qué pasó, y podía tomar el 500 por
// una opinión del sistema cuando el sistema no había opinado.
//
// El detalle técnico sigue disponible, plegado: cuando el analista
// llama a soporte, el request-id es lo primero que le van a pedir.

const MENSAJES = {
  tope_de_gasto: {
    titulo: "El servicio de análisis llegó a su límite de consumo",
    que: "No es un problema de este cliente ni de sus datos: está alcanzado el tope contratado con el proveedor.",
    ahora: "Avisá al administrador. Hasta que se amplíe el tope, ningún análisis va a completarse.",
  },
  credencial: {
    titulo: "El servicio de análisis rechazó nuestras credenciales",
    que: "La clave con la que CrediScope se conecta al proveedor dejó de ser válida.",
    ahora: "Avisá al administrador. No se resuelve reintentando.",
  },
  limite_velocidad: {
    titulo: "Demasiadas consultas seguidas",
    que: "El proveedor está limitando el ritmo de pedidos.",
    ahora: "Esperá un momento y volvé a analizar.",
  },
  proveedor_caido: {
    titulo: "El servicio de análisis no está respondiendo",
    que: "Es una falla del proveedor. CrediScope está funcionando; la parte que usa inteligencia artificial, no.",
    ahora: "El Perfil del Cliente y las Fuentes de Ingreso siguen disponibles: no dependen del proveedor.",
  },
  respuesta_cortada: {
    titulo: "El análisis quedó a medias",
    que: "La respuesta superó el largo permitido. Suele pasar con clientes de historial muy extenso.",
    ahora: "Volvé a analizar. Si se repite con el mismo cliente, avisá al administrador.",
  },
  respuesta_ilegible: {
    titulo: "La respuesta del análisis no se pudo interpretar",
    que: "El modelo respondió en un formato que CrediScope no pudo leer.",
    ahora: "Volvé a analizar. Si se repite en varios clientes, es del criterio y hay que avisar.",
  },
  sin_conexion: {
    titulo: "No se pudo contactar al servicio de análisis",
    que: "La conexión con el proveedor falló.",
    ahora: "Volvé a intentar en unos minutos.",
  },
  desconocido: {
    titulo: "El análisis no se pudo completar",
    que: "Ocurrió un error que todavía no está clasificado.",
    ahora: "Volvé a intentar. Si se repite, pasale el detalle técnico al administrador.",
  },
};

export default function AnalisisFallido({ fallo, tipo }) {
  const [abierto, setAbierto] = useState(false);
  const m = MENSAJES[tipo] ?? MENSAJES.desconocido;

  return (
    <div className="crediscope-card" style={{ borderColor: "var(--bad)" }}>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <ServerCrash size={22} color="var(--bad)" style={{ flexShrink: 0, marginTop: 2 }} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 style={{ margin: "0 0 6px" }}>{m.titulo}</h3>
          <p style={{ margin: "0 0 8px" }}>{m.que}</p>
          <p className="crediscope-muted" style={{ margin: 0 }}>{m.ahora}</p>

          <p style={{ margin: "12px 0 0", fontSize: 13 }}>
            <strong>El puntaje que aparece no es un resultado.</strong> Cuando el análisis falla, CrediScope deja el marcador
            en su valor neutro y la recomendación en "revisar" para que nadie lo tome por una opinión del sistema.
          </p>

          {fallo ? (
            <>
              <button
                type="button"
                className="crediscope-btn crediscope-btn-ghost"
                style={{ marginTop: 12 }}
                onClick={() => setAbierto((v) => !v)}
                aria-expanded={abierto}
              >
                Detalle técnico
                <ChevronDown size={15} style={{ marginLeft: 6, transform: abierto ? "rotate(180deg)" : undefined }} />
              </button>
              {abierto ? (
                <pre
                  style={{
                    marginTop: 10,
                    marginBottom: 0,
                    padding: 12,
                    background: "var(--panel-muted)",
                    borderRadius: 8,
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {fallo}
                </pre>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
