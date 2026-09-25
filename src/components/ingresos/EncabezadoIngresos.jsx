import { Wallet } from "lucide-react";
import { nombreCorto } from "../../lib/perfilClienteCampos.js";
import { formatearValorAval } from "../../lib/avalCampos.js";
import { ETIQUETA_SEGMENTO, RIESGO_SEGMENTO, ETIQUETA_ESTADO } from "../../lib/fuentesIngresoConsolidado.js";
import { mesLegible, esIngresoMinimoSbu, sbuDelAnio, INGRESO_MINIMO_SBU } from "../../lib/ingresosCampos.js";
import { clasificarPerfilLaboral } from "../../../supabase/functions/_shared/perfil-laboral.ts";

const CLASE_ESTADO = { confirmada: "crediscope-tag-ok", provisional: "crediscope-tag-warn", indeterminada: "crediscope-tag-neutral" };

// De qué vive, qué tan firme es eso, y cuánto se reporta al IESS. Lo que un
// analista tiene que saber antes de mirar cualquier otro número de la
// pestaña.
export default function EncabezadoIngresos({ cedula, perfil, corteVigente, consultadoEl, acciones }) {
  const f = perfil?.fuentesIngreso ?? null;
  const laboral = perfil?.laboral ?? {};
  const nombre = nombreCorto(perfil?.identidad?.nombreCompleto);
  const clasificadoConOtroCorte = f?.corteIessUsado && corteVigente && f.corteIessUsado < corteVigente;
  const monto = f?.pisoIngresoMensualReportado ?? null;
  const enElSbu = esIngresoMinimoSbu(monto, f?.corteIessUsado);
  const anioCorte = Number(String(f?.corteIessUsado ?? "").slice(0, 4));
  // Se calcula acá desde el perfil guardado (no se guarda dentro del
  // perfil: el modelo no lo lee). Ver _shared/perfil-laboral.ts.
  const perfilLaboral = clasificarPerfilLaboral(perfil);

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
                title="Confirmada: un tercero declara y paga sobre esa base. Provisional: el monto lo eligió la persona o no existe. Indeterminada: no se puede afirmar."
              >
                {ETIQUETA_ESTADO[f.estadoSegmento] ?? f.estadoSegmento}
              </span>
              {f.apareceEnUltimoCorte === false ? (
                <span className="crediscope-tag crediscope-tag-bad" title="Aportaba y no aparece en el corte más reciente del IESS.">
                  Fuera del último corte
                </span>
              ) : null}
              {/* Las dos señales de vínculo con el empleador que busca el
                  control: un empleo con un familiar, o consigo mismo. */}
              {laboral.clienteEsSuPropioEmpleador === true ? (
                <span className="crediscope-tag crediscope-tag-warn" title="El empleador que reporta el aporte es la propia persona.">
                  Es su propio empleador
                </span>
              ) : laboral.empleadorConApellidoDelCliente === true ? (
                <span className="crediscope-tag crediscope-tag-warn" title="El empleador vigente comparte apellido con la persona.">
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
            <strong className="crediscope-ing-principal">{ETIQUETA_SEGMENTO[f.segmento] ?? f.segmento}</strong>
            {RIESGO_SEGMENTO[f.segmento] ? <p>Cómo puede fallar: {RIESGO_SEGMENTO[f.segmento]}.</p> : null}
            {/* El segmento dice de qué fuente medible depende el ingreso;
                el perfil laboral, qué tipo de trabajador es. Van juntos
                porque un dependiente con negocio propio es un caso común
                (26% de la cartera) y el segmento solo no lo muestra. */}
            {perfilLaboral ? (
              <span className="crediscope-tag crediscope-tag-neutral" style={{ marginTop: 8, fontSize: 12 }} title="Perfil laboral">
                {perfilLaboral.etiqueta}
                {perfilLaboral.jubilacion && perfilLaboral.clave !== "jubilado" ? " · jubilado" : ""}
              </span>
            ) : null}
          </div>

          <div className="crediscope-ing-bloque">
            {/* En el SBU el rótulo lo dice con el nombre que se usa en
                Ecuador: es lo que aportan la mayoría de los asalariados de
                sueldo básico y los afiliados voluntarios. */}
            <span className="crediscope-ing-rotulo">{enElSbu ? INGRESO_MINIMO_SBU : "Ingreso reportado al IESS"}</span>
            <strong className="crediscope-ing-principal">
              {monto ? formatearValorAval(monto, "dinero") : "Sin monto reportado"}
            </strong>
            {/* El principio del módulo, dicho donde se lee el número: es lo
                declarado, no lo que gana. */}
            <p>
              {!monto
                ? "Ninguna fuente pública trae un monto para esta persona."
                : enElSbu
                  ? `Aporta sobre el Salario Básico Unificado de ${anioCorte} (${formatearValorAval(sbuDelAnio(anioCorte), "dinero")}). No dice cuánto gana en realidad.`
                  : `Lo declarado al IESS en ${mesLegible(f.corteIessUsado)}. El ingreso real puede ser mayor.`}
            </p>
          </div>
        </>
      ) : null}

      <div>
        {f ? (
          <dl className="crediscope-aval-datos">
            <dt>Corte del IESS usado</dt>
            <dd className={clasificadoConOtroCorte ? "crediscope-aval-malo" : undefined}>{mesLegible(f.corteIessUsado)}</dd>
            {clasificadoConOtroCorte ? (
              <>
                <dt>Corte vigente</dt>
                <dd>{mesLegible(corteVigente)}</dd>
              </>
            ) : null}
            <dt>Versión de las reglas</dt>
            <dd>{f.version ?? "—"}</dd>
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
