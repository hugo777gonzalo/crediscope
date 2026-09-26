import { Landmark, Check, X } from "lucide-react";
import { TituloTarjeta } from "../reporte/Piezas.jsx";
import { formatearValorAval } from "../../lib/avalCampos.js";
import { quienDeclara } from "../../lib/fuentesIngresoConsolidado.js";
import { origenDeFuente, ETIQUETA_ORIGEN, mesLegible, esIngresoMinimoSbu, INGRESO_MINIMO_SBU } from "../../lib/ingresosCampos.js";
import { tamanoDelNegocio } from "../../../supabase/functions/_shared/fuentes-ingreso.ts";

// Cuatro bloques, por de dónde sale cada cosa: los aportes al IESS (con
// monto), el negocio propio registrado en el SRI, el tamaño de ese negocio
// (empleados, nómina, establecimientos, contabilidad) y lo demás sin monto
// (jubilación, pensión). Hasta el 2026-09-26 el RUC, la nómina y los
// establecimientos iban en listas y párrafos sueltos ("Otras fuentes",
// "Señales de escala"); ahora son indicadores, con los nombres que eligió
// el negocio.
const CLASE_QUIEN = {
  reportada_por_tercero: "crediscope-tag-ok",
  autodeclarada_sobre_minimo: "crediscope-tag-warn",
  autodeclarada_en_minimo: "crediscope-tag-warn",
  indirecta: "crediscope-tag-neutral",
};

function capitalizar(t) {
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

function Aporte({ fuente, perfil, corte }) {
  const enElSbu = esIngresoMinimoSbu(fuente.montoMensualReportado, corte);
  return (
    <li className="crediscope-ing-fuente">
      <div style={{ minWidth: 0 }}>
        <strong>{capitalizar(fuente.tipo)}</strong>
        {fuente.empleador ? <span className="crediscope-ing-fuente-sub">{fuente.empleador}</span> : null}
        <span style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
          <span
            className={`crediscope-tag ${CLASE_QUIEN[fuente.evidencia] ?? "crediscope-tag-neutral"}`}
            style={{ fontSize: 11.5, padding: "2px 8px" }}
            title={fuente.detalle}
          >
            {quienDeclara(fuente, perfil)}
          </span>
          {enElSbu ? (
            <span className="crediscope-tag crediscope-tag-neutral" style={{ fontSize: 11.5, padding: "2px 8px" }}>
              {INGRESO_MINIMO_SBU}
            </span>
          ) : null}
        </span>
      </div>
      <strong className="crediscope-ing-monto">
        {fuente.montoMensualReportado ? formatearValorAval(fuente.montoMensualReportado, "dinero") : "sin monto"}
      </strong>
    </li>
  );
}

function Indicador({ etiqueta, children, pie, titulo }) {
  return (
    <div className="crediscope-ing-indicador" title={titulo}>
      <span>{etiqueta}</span>
      <strong>{children}</strong>
      {pie ? <small>{pie}</small> : null}
    </div>
  );
}

// Activo o no lo dice tieneRucActivo, que sale de ruc.ts -- la única regla
// de RUC activo (exige además un establecimiento abierto). Las fechas sólo
// arman el pie. null: no tiene RUC.
function estadoDelRuc(laboral) {
  const anio = (fecha) => (fecha ? String(fecha).slice(0, 4) : null);
  const tieneRuc = laboral.estadoActividadEconomica && laboral.estadoActividadEconomica !== "sin_ruc";
  if (laboral.tieneRucActivo === true) {
    const reabierto = laboral.estadoActividadEconomica === "activa_reactivada";
    const desde = anio(reabierto ? laboral.fechaReinicioActividadesRuc : laboral.fechaInicioActividadesRuc);
    return { activo: true, texto: "Activo", pie: desde ? `${reabierto ? "reabierto en" : "desde"} ${desde}` : null };
  }
  if (!tieneRuc) return null;
  const cese = anio(laboral.fechaCeseActividadesRuc);
  return { activo: false, texto: "Inactivo", pie: cese ? `cesó en ${cese}` : null };
}

export default function FuentesVigentes({ f, perfil }) {
  const laboral = perfil?.laboral ?? {};
  const fuentes = f.fuentes ?? [];
  const delIess = fuentes.filter((x) => origenDeFuente(x) === "iess");
  // El RUC y la nómina ya están en "Negocio propio" y "Tamaño del negocio":
  // repetirlos como fuentes sin monto era leer lo mismo dos veces.
  const otras = fuentes.filter((x) => !["iess", "ruc", "nomina"].includes(origenDeFuente(x)));
  const ruc = estadoDelRuc(laboral);
  // La misma lectura que recibe el análisis con IA (perfil del modelo).
  const tamano = tamanoDelNegocio(perfil);

  // "La fuente dice que no hay" y "la fuente no contestó" no son lo mismo
  // (CLAUDE.md). Un perfil viejo no trae la lista de fuentes no medidas; si
  // además la consulta vino incompleta, tampoco se puede afirmar.
  const noMedidas = perfil?.metaConsulta?.fuentesNoMedidas;
  const noRespondio = (fuente) => (Array.isArray(noMedidas) ? noMedidas.includes(fuente) : f.segmento === "sin_datos");

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={Landmark}>Fuentes de ingreso</TituloTarjeta>

      <section className="crediscope-aval-subseccion">
        <p className="crediscope-aval-subtitulo">
          Aportes al IESS <small>· {mesLegible(f.corteIessUsado)}</small>
        </p>
        {delIess.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>
            {f.cortesDesdeLaDesvinculacion
              ? `Sin aportes en el último corte. Dejó de aportar hace ${f.cortesDesdeLaDesvinculacion} ${f.cortesDesdeLaDesvinculacion === 1 ? "mes" : "meses"}.`
              : f.segmento === "sin_datos"
                ? "La fuente de los aportes no respondió: no se sabe si aporta."
                : "No registra aportes al IESS."}
          </p>
        ) : (
          <ul className="crediscope-aval-filas">
            {delIess.map((x, i) => (
              <Aporte key={i} fuente={x} perfil={perfil} corte={f.corteIessUsado} />
            ))}
          </ul>
        )}
      </section>

      <section className="crediscope-aval-subseccion">
        <p className="crediscope-aval-subtitulo">
          Negocio propio (SRI) <small>· sin monto público</small>
        </p>
        {ruc ? (
          <p style={{ margin: 0, fontSize: 13.5, display: "flex", alignItems: "center", gap: 6 }}>
            {ruc.activo ? <Check size={16} color="var(--good)" aria-hidden="true" /> : <X size={16} color="var(--bad)" aria-hidden="true" />}
            <strong className={ruc.activo ? "crediscope-aval-bueno" : "crediscope-aval-malo"}>RUC {ruc.texto.toLowerCase()}</strong>
            {ruc.pie ? <span className="crediscope-muted">{ruc.pie}</span> : null}
          </p>
        ) : (
          <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>
            {noRespondio("contribuyente") ? "No se sabe si tiene RUC: la consulta vino incompleta." : "No tiene RUC registrado en el SRI."}
          </p>
        )}
      </section>

      {tamano ? (
        <section className="crediscope-aval-subseccion">
          <p className="crediscope-aval-subtitulo">Tamaño del negocio</p>
          <div className="crediscope-ing-indicadores crediscope-ing-indicadores-4">
            <Indicador
              etiqueta="Empleados"
              pie={tamano.empleadosSinContarALaPersona ? "sin contar a la persona" : "puede incluir a la persona"}
              titulo="Afiliados al IESS en la nómina que paga, en el mes más reciente."
            >
              {tamano.empleados ?? "—"}
            </Indicador>
            <Indicador etiqueta="Nómina" pie={tamano.nomina ? "al mes" : null}>
              {tamano.nomina ? formatearValorAval(tamano.nomina, "dinero") : "—"}
            </Indicador>
            <Indicador etiqueta="Establecimientos Activos (SRI)" titulo="Sólo los abiertos, y 0 si el RUC no está activo.">
              {tamano.establecimientosActivos}
            </Indicador>
            <Indicador
              etiqueta="Contabilidad"
              titulo="El SRI obliga a llevar contabilidad a quien supera ciertos montos de ventas, costos o capital."
            >
              {tamano.obligadoContabilidad ? "Obligado" : "No obligado"}
            </Indicador>
          </div>
        </section>
      ) : null}

      {otras.length > 0 ? (
        <section className="crediscope-aval-subseccion">
          <p className="crediscope-aval-subtitulo">
            Otras fuentes <small>· sin monto público</small>
          </p>
          <ul className="crediscope-aval-filas">
            {otras.map((x, i) => (
              <li key={i} className="crediscope-ing-fuente">
                <div style={{ minWidth: 0 }}>
                  <strong>{ETIQUETA_ORIGEN[origenDeFuente(x)]}</strong>
                  <span className="crediscope-ing-fuente-sub">{x.detalle}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
