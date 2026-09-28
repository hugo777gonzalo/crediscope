import { Wallet, TrendingUp } from "lucide-react";
import { nombreCorto } from "../../lib/perfilClienteCampos.js";
import { formatearValorAval } from "../../lib/avalCampos.js";
import { ETIQUETA_SEGMENTO, ETIQUETA_ESTADO, quienDeclara } from "../../lib/fuentesIngresoConsolidado.js";
import { mesLegible, esIngresoMinimoSbu, INGRESO_MINIMO_SBU } from "../../lib/ingresosCampos.js";
import { clasificarPerfilLaboral } from "../../../supabase/functions/_shared/perfil-laboral.ts";
import { dejoDeAparecerEnElIess, indiciosDeIngresoMayor } from "../../../supabase/functions/_shared/fuentes-ingreso.ts";

const CLASE_ESTADO = { confirmada: "crediscope-tag-ok", provisional: "crediscope-tag-warn", indeterminada: "crediscope-tag-neutral" };

// Quién declara el monto, dicho una vez debajo del número. Es un hecho de
// la fuente, no una suposición: hasta el 2026-09-26 acá se leía "no dice
// cuánto gana en realidad" o "el ingreso real puede ser mayor" para todos,
// y eso es especular (ver indiciosDeIngresoMayor).
function declaradoPor(perfil) {
  const conMonto = (perfil?.fuentesIngreso?.fuentes ?? []).filter((x) => x.evidencia !== "indirecta" && x.montoMensualReportado);
  if (conMonto.length === 0) return null;
  return `Declarado por: ${[...new Set(conMonto.map((x) => quienDeclara(x, perfil)))].join(" y ")}.`;
}

// De qué vive, qué tan firme es eso y cuánto se reporta al IESS: lo que un
// analista tiene que saber antes de mirar cualquier otro número de la
// pestaña. La versión de las reglas no va acá: está en "Cómo se clasificó".
export default function EncabezadoIngresos({ cedula, perfil, corteVigente, consultadoEl, acciones }) {
  const f = perfil?.fuentesIngreso ?? null;
  const laboral = perfil?.laboral ?? {};
  const nombre = nombreCorto(perfil?.identidad?.nombreCompleto);
  const clasificadoConOtroCorte = f?.corteIessUsado && corteVigente && f.corteIessUsado < corteVigente;
  const monto = f?.pisoIngresoMensualReportado ?? null;
  const enElSbu = esIngresoMinimoSbu(monto, f?.corteIessUsado);
  // Se calcula desde el perfil guardado con la misma función que usa el
  // perfil del modelo (perfil-del-modelo.ts). Ver _shared/perfil-laboral.ts.
  const perfilLaboral = clasificarPerfilLaboral(perfil);
  const indicios = indiciosDeIngresoMayor(f);
  // El segmento dice de qué fuente medible depende el ingreso; el perfil
  // laboral, qué tipo de trabajador es. Se nombra el perfil debajo salvo
  // que diga lo mismo.
  const segmento = f ? (ETIQUETA_SEGMENTO[f.segmento] ?? f.segmento) : null;
  const mostrarPerfil = perfilLaboral && f.segmento !== "sin_datos" && perfilLaboral.etiqueta !== segmento;

  return (
    <div className={`crediscope-card crediscope-aval-cabecera ${f ? "" : "crediscope-aval-cabecera-sin-datos"}`}>
      <div className="crediscope-aval-persona">
        <span className="crediscope-aval-avatar" aria-hidden="true">
          <Wallet size={26} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="crediscope-aval-nombre" title={perfil?.identidad?.nombreCompleto ?? undefined}>
            {nombre ?? (perfil ? "Sin nombre en la fuente" : "Sin consulta previa")}
          </div>
          <div className="crediscope-aval-cedula">{cedula}</div>
          {f ? (
            <div className="crediscope-aval-etiquetas">
              <span
                className={`crediscope-tag ${CLASE_ESTADO[f.estadoSegmento] ?? "crediscope-tag-neutral"}`}
                title="Confirmado por un tercero: un empleador declara y paga sobre esa base. Por confirmar: el monto lo eligió la propia persona o no existe. Sin determinar: no hay evidencia de ingreso."
              >
                {ETIQUETA_ESTADO[f.estadoSegmento] ?? f.estadoSegmento}
              </span>
              {/* Un jubilado que dejó de aportar no se marca: se jubiló
                  (fuentes-v9, la misma regla que lee el modelo). */}
              {dejoDeAparecerEnElIess(f) ? (
                <span className="crediscope-tag crediscope-tag-bad" title={`Aportaba y no aparece en la información del IESS de ${mesLegible(f.corteIessUsado)}.`}>
                  Sin información actual en el IESS
                </span>
              ) : null}
              {/* Las dos señales de vínculo con el patrono: la persona es su
                  propio patrono (RUC = su cédula + 001, patrono.ts), o el
                  empleador comparte su apellido. */}
              {laboral.clienteEsSuPropioEmpleador === true ? (
                <span className="crediscope-tag crediscope-tag-neutral" title="Se afilia al IESS como patrono de su propio negocio, bajo su propio RUC.">
                  Es su propio patrono
                </span>
              ) : laboral.empleadorConApellidoDelCliente === true ? (
                <span className="crediscope-tag crediscope-tag-warn" title="El empleador vigente comparte apellido con la persona: puede ser un negocio familiar.">
                  Empleador comparte apellido
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      {f ? (
        <>
          <div className="crediscope-ing-bloque">
            <span className="crediscope-ing-rotulo">Segmento</span>
            <strong className="crediscope-ing-principal">{segmento}</strong>
            {mostrarPerfil ? (
              <p>
                Perfil laboral: {perfilLaboral.etiqueta}
                {perfilLaboral.jubilacion && perfilLaboral.clave !== "jubilado" ? " · jubilado" : ""}
              </p>
            ) : null}
          </div>

          <div className="crediscope-ing-bloque">
            {/* En el SBU el rótulo lo dice con el nombre que se usa en
                Ecuador. */}
            <span className="crediscope-ing-rotulo">{enElSbu ? INGRESO_MINIMO_SBU : "Ingreso reportado al IESS"}</span>
            <strong className="crediscope-ing-principal">
              {monto ? formatearValorAval(monto, "dinero") : "Sin monto reportado"}
            </strong>
            <p>{monto ? declaradoPor(perfil) : "Ninguna fuente pública trae un monto para esta persona."}</p>
            {/* El detalle de cada indicio vive en su propia tarjeta, debajo
                (IndiciosIngreso.jsx). Acá sólo se avisa, al lado del monto,
                que lo reportado no es todo. */}
            {indicios.length > 0 ? (
              <p className="crediscope-ing-aviso-indicios">
                <TrendingUp size={15} aria-hidden="true" />
                {indicios.length === 1 ? "Hay un indicio de ingreso mayor" : `Hay ${indicios.length} indicios de ingreso mayor`}: ver
                abajo.
              </p>
            ) : null}
          </div>
        </>
      ) : null}

      <div>
        {f ? (
          <dl className="crediscope-aval-datos">
            <dt>Información IESS</dt>
            <dd className={clasificadoConOtroCorte ? "crediscope-aval-malo" : undefined}>{mesLegible(f.corteIessUsado)}</dd>
            {clasificadoConOtroCorte ? (
              <>
                <dt>Corte vigente</dt>
                <dd>{mesLegible(corteVigente)}</dd>
              </>
            ) : null}
            {consultadoEl ? (
              <>
                <dt>Consultado el</dt>
                <dd>{consultadoEl}</dd>
              </>
            ) : null}
          </dl>
        ) : null}
        {acciones ? <div className="crediscope-aval-acciones">{acciones}</div> : null}
      </div>
    </div>
  );
}
