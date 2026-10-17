import { useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import { consultarEquifax, contarConsultasEquifaxDeHoy } from "../../lib/api.js";
import { finDeLaVigencia } from "../../../supabase/functions/_shared/vigencia-mensual.ts";
import { diaEcuador, formatearFecha, hoyEcuador } from "../../lib/fechas.js";
import { plural } from "../../lib/formatos.js";
import InfoTooltip from "../InfoTooltip.jsx";
import AvisoDeError from "../ui/AvisoDeError.jsx";

// El botón para consultar a Equifax desde la pestaña (pedido del negocio,
// 2026-10-17). Cada consulta se cobra y Equifax no pone tope, así que nunca
// sale de un solo clic: primero dice que se cobra, hasta cuándo valdrá y
// cuántas van hoy, y pide confirmar. Sólo se ofrece cuando no hay una consulta
// vigente (la pantalla decide); si igual la hubiera, la función la devuelve
// sin volver a pagar. El tope diario, la base legal y la auditoría los pone la
// función (consultar-equifax), no la pantalla.
//
// Devuelve el botón y, al pedirlo, el cuadro de confirmación como hermanos:
// dentro de la cabecera, el cuadro ocupa una fila entera debajo.
export default function ConsultarEquifax({ cedula, hayConsulta, alTerminar }) {
  const idTitulo = useId();
  const [paso, setPaso] = useState("inicio"); // inicio | confirmando | consultando
  const [consultasHoy, setConsultasHoy] = useState(null);
  const [error, setError] = useState(null);

  async function abrir() {
    setError(null);
    setPaso("confirmando");
    try {
      setConsultasHoy(await contarConsultasEquifaxDeHoy());
    } catch {
      // Sin el conteo se puede confirmar igual: el tope lo controla la función.
      setConsultasHoy(null);
    }
  }

  async function confirmar() {
    setPaso("consultando");
    setError(null);
    try {
      const resumen = await consultarEquifax(cedula);
      setPaso("inicio");
      alTerminar?.(resumen);
    } catch (err) {
      setError(err);
      setPaso("confirmando");
    }
  }

  const fin = finDeLaVigencia();
  const ultimoDia = diaEcuador(fin) === hoyEcuador();
  const abierto = paso !== "inicio";

  return (
    <>
      {!abierto ? (
        <button type="button" className="crediscope-btn crediscope-btn-ghost crediscope-no-imprimir" onClick={abrir}>
          <RefreshCw size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} aria-hidden="true" />
          {hayConsulta ? "Volver a consultar a Equifax" : "Consultar a Equifax"}
        </button>
      ) : (
        <div className="crediscope-equifax-confirmar crediscope-no-imprimir" role="group" aria-labelledby={idTitulo}>
          <p id={idTitulo} className="crediscope-equifax-confirmar-titulo">
            Esta consulta a Equifax se cobra
            <InfoTooltip etiqueta="Por qué se confirma">
              Equifax cobra cada consulta y no pone un límite propio. Por eso se confirma una por una y CrediScope
              tiene un tope diario: si se llega a él, la consulta no se hace. Queda registrado quién la pidió.
            </InfoTooltip>
          </p>
          <p className="crediscope-muted">
            La respuesta queda guardada y vale hasta el {formatearFecha(fin)}: hasta entonces se usa sin volver a pagar.
            {ultimoDia ? " Hoy es el último día del ciclo: mañana Equifax actualiza su información y esta consulta vence." : ""}
            {consultasHoy !== null ? ` Hoy van ${plural(consultasHoy, "consulta")} a Equifax.` : ""}
          </p>
          {error ? <AvisoDeError error={error} /> : null}
          <div className="crediscope-equifax-confirmar-botones">
            <button type="button" className="crediscope-btn" onClick={confirmar} disabled={paso === "consultando"}>
              {paso === "consultando" ? "Consultando a Equifax..." : error ? "Intentar de nuevo" : "Sí, consultar"}
            </button>
            <button
              type="button"
              className="crediscope-btn crediscope-btn-ghost"
              onClick={() => setPaso("inicio")}
              disabled={paso === "consultando"}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </>
  );
}
