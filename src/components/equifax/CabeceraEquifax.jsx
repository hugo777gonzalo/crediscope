import { FileDown } from "lucide-react";
import InfoTooltip from "../InfoTooltip.jsx";
import { alertasDeLaCabecera } from "../../lib/equifaxPantalla.js";

// De quién es el reporte, de cuándo, hasta cuándo vale y lo grave, arriba y
// a la vista. El botón del reporte en PDF también va acá: es lo que el
// analista adjunta al expediente de la solicitud. `consultar` es el botón de
// volver a consultar, que la página pasa sólo cuando la consulta venció.
export default function CabeceraEquifax({ cedula, estructura, ambiente, consultadoEl, vigencia, onReporte, imprimiendo, consultar = null }) {
  const alertas = alertasDeLaCabecera(estructura);
  return (
    <div className="crediscope-card crediscope-equifax-cabecera">
      <div className="crediscope-equifax-cabecera-texto">
        <h2 className="crediscope-equifax-titulo">
          Equifax
          <InfoTooltip etiqueta="Qué es esta pestaña">
            El buró de crédito de Equifax: lo que bancos, cooperativas y el sector comercial reportan de esta
            persona, con 24 meses de historia. Es lo que Equifax contestó el día de la consulta; no se vuelve a
            consultar solo, porque cada consulta se cobra.
          </InfoTooltip>
        </h2>
        <p className="crediscope-equifax-subtitulo">
          <span>Cédula {cedula}</span>
          <span aria-hidden="true">·</span>
          <span>Consultado el {consultadoEl}</span>
          {vigencia ? (
            <>
              <span aria-hidden="true">·</span>
              <span className={vigencia.vigente ? undefined : "crediscope-equifax-vencida"}>{vigencia.texto}</span>
              <InfoTooltip lado="derecha" etiqueta="Hasta cuándo vale">
                Una consulta a Equifax vale hasta el 17 de cada mes: el 18 Equifax actualiza su información y volver
                a consultar se cobra otra vez.
              </InfoTooltip>
            </>
          ) : null}
        </p>
        {ambiente !== "produccion" || alertas.length > 0 ? (
          <div className="crediscope-equifax-alertas">
            {ambiente !== "produccion" ? (
              <span className="crediscope-tag crediscope-tag-warn">Ambiente de prueba: no sirve para calificar</span>
            ) : null}
            {alertas.map((a) => (
              <span key={a.texto} className={`crediscope-tag ${a.clase}`}>
                {a.texto}
              </span>
            ))}
          </div>
        ) : null}
      </div>
      <div className="crediscope-equifax-acciones crediscope-no-imprimir">
        {consultar}
        <button type="button" className="crediscope-btn" onClick={onReporte} disabled={imprimiendo}>
          <FileDown size={16} style={{ marginRight: 8, verticalAlign: "-3px" }} aria-hidden="true" />
          {imprimiendo ? "Preparando el reporte..." : "Descargar reporte (PDF)"}
        </button>
      </div>
    </div>
  );
}
