import { Briefcase, Store, Receipt, ShieldCheck, ListTree, History } from "lucide-react";
import { TituloTarjeta, FilaCampo, Valor } from "../reporte/Piezas.jsx";
import { formatearValorAval } from "../../lib/avalCampos.js";
import { duracionLegible, empleosActuales, fechaLegible, mesLegible } from "../../lib/ingresosCampos.js";

// Lo que se consulta cuando hace falta: cada empleo de los últimos dos
// años, qué actividad tiene registrada, cuánto impuesto a la renta causó y
// cómo se llegó a la clasificación. Nada de esto cambia la lectura de
// arriba; la respalda.

const NATURALEZA = {
  publico: "Público",
  diplomatico: "Diplomático",
  privado: "Privado",
  domestico: "Doméstico",
  cuenta_propia: "Cuenta propia",
  agricola: "Agrícola",
  hogar: "Hogar",
  otro: "No reconocido",
};

// Un empleo por fila, a lo ancho: con siete columnas, en una tarjeta de un
// tercio no entraba sin barra de desplazamiento (lo mismo que se corrigió
// en el reporte de Aval).
function Vinculos({ vinculos }) {
  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={History}>Empleos y afiliaciones de los últimos 24 meses</TituloTarjeta>
      {vinculos.length === 0 ? (
        <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>Sin aportes al IESS en los últimos 24 meses.</p>
      ) : (
        <div className="crediscope-aval-desplazable">
          <table className="crediscope-aval-tabla">
            <thead>
              <tr>
                <th>Empleador</th>
                <th>Tipo</th>
                <th>Ocupación</th>
                <th>Desde</th>
                <th>Último aporte</th>
                <th className="crediscope-aval-num">Meses con aporte</th>
                <th className="crediscope-aval-num">Último sueldo declarado</th>
              </tr>
            </thead>
            <tbody>
              {vinculos.map((v, i) => (
                <tr key={i}>
                  <td>
                    {v.empleador ?? "—"}
                    {v.vigenteAlCorte ? (
                      <span className="crediscope-aval-sector" style={{ marginLeft: 8 }}>
                        vigente
                      </span>
                    ) : null}
                  </td>
                  <td>{NATURALEZA[v.naturaleza] ?? v.naturaleza}</td>
                  <td>{v.ocupacion ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>{fechaLegible(v.desde)}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {mesLegible(v.ultimoMes)}
                    {v.hasta ? <span className="crediscope-muted"> · salió {fechaLegible(v.hasta)}</span> : null}
                  </td>
                  <td className="crediscope-aval-num">{v.mesesConAporte} de 24</td>
                  <td className="crediscope-aval-num" style={{ fontWeight: 600 }}>
                    <Valor valor={v.ultimoSalario} tipo="dinero" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function DetalleIngresos({ perfil }) {
  const f = perfil.fuentesIngreso;
  const d = f.detalle ?? null;
  const laboral = perfil.laboral ?? {};
  const tributario = perfil.tributario ?? {};
  const social = perfil.seguridadSocial ?? {};
  const empleos = empleosActuales(laboral);

  return (
    <>
      {d ? <Vinculos vinculos={d.vinculos} /> : null}

      <div className="crediscope-aval-reporte">
        <div className="crediscope-card">
          <TituloTarjeta Icono={Briefcase}>Empleo actual según el mecanizado</TituloTarjeta>
          {empleos.length === 0 ? (
            <p className="crediscope-muted" style={{ margin: "0 0 10px", fontSize: 13 }}>
              El mecanizado del IESS no trae un empleo de los últimos 3 meses.
            </p>
          ) : (
            <ul className="crediscope-aval-filas" style={{ marginBottom: 10 }}>
              {empleos.map((e, i) => (
                <li key={i} className="crediscope-aval-fila-campo">
                  <span>
                    {e.empleador ?? "Empleador sin nombre"}
                    {e.cargo ? ` · ${e.cargo}` : ""}
                  </span>
                  <strong style={{ whiteSpace: "nowrap" }}>{e.salarioAprox ? formatearValorAval(e.salarioAprox, "dinero") : "—"}</strong>
                </li>
              ))}
            </ul>
          )}
          <ul className="crediscope-aval-filas">
            <FilaCampo etiqueta="Cargo vigente" valor={laboral.cargoVigente} tipo="texto" />
            <FilaCampo etiqueta="Situación legal del empleador" valor={laboral.empleadorVigenteSituacionLegal} tipo="texto" />
            <FilaCampo etiqueta="Tipo de compañía" valor={laboral.empleadorVigenteTipoCompania} tipo="texto" />
            <FilaCampo etiqueta="Años de constituido el empleador" valor={laboral.empleadorVigenteAntiguedadAnios} tipo="entero" />
            <FilaCampo etiqueta="Empleos registrados en total" valor={laboral.historialEmpleosRegistrados} tipo="entero" />
            <FilaCampo etiqueta="Sueldo más alto registrado" valor={laboral.salarioMasAltoRegistrado} tipo="dinero" />
          </ul>
          {/* Medido el 2026-09-24: en 359 perfiles la clasificación ve un
              aporte vigente y esta fuente no ve empleo. Son dos registros
              del IESS con reglas de vigencia distintas; se dice para que
              la diferencia no se lea como un error de la pantalla. */}
          <p className="crediscope-aval-nota">
            Es otro registro del IESS que el de los aportes, con otra regla de vigencia: puede no coincidir con las fuentes de
            arriba.
          </p>
        </div>

        <div className="crediscope-card">
          <TituloTarjeta Icono={Store}>Actividad económica (SRI)</TituloTarjeta>
          {d && d.actividadesEconomicas.length > 0 ? (
            <ul className="crediscope-aval-filas" style={{ marginBottom: 10 }}>
              {d.actividadesEconomicas.map((a, i) => (
                <li key={i} className="crediscope-ing-fuente">
                  <div style={{ minWidth: 0 }}>
                    <strong>{a.nombreComercial ?? "Sin nombre comercial"}</strong>
                    <span className="crediscope-ing-fuente-sub">{a.actividad ?? "Actividad no informada"}</span>
                    {a.inicio ? <span className="crediscope-ing-fuente-sub">Desde {fechaLegible(a.inicio)}</span> : null}
                  </div>
                  <span className={`crediscope-tag ${a.abierto ? "crediscope-tag-ok" : "crediscope-tag-neutral"}`} style={{ fontSize: 11.5, padding: "2px 8px" }}>
                    {a.abierto ? "Abierto" : "Cerrado"}
                  </span>
                </li>
              ))}
            </ul>
          ) : d ? (
            <p className="crediscope-muted" style={{ margin: "0 0 10px", fontSize: 13 }}>Sin establecimientos registrados.</p>
          ) : null}
          <ul className="crediscope-aval-filas">
            <FilaCampo etiqueta="RUC activo" valor={laboral.tieneRucActivo} tipo="booleano" />
            <FilaCampo etiqueta="Inicio de actividades" valor={laboral.fechaInicioActividadesRuc} tipo="fecha" />
            {/* El perfil guarda un código ("activa_sin_interrupciones"). */}
            <FilaCampo
              etiqueta="Estado de la actividad"
              valor={laboral.estadoActividadEconomica ? String(laboral.estadoActividadEconomica).replaceAll("_", " ") : null}
              tipo="texto"
            />
            <FilaCampo
              etiqueta="Lleva activa"
              valor={laboral.antiguedadUltimaEtapaActivaMeses == null ? null : duracionLegible(laboral.antiguedadUltimaEtapaActivaMeses)}
              tipo="texto"
            />
            <FilaCampo
              etiqueta="Inactiva hace"
              valor={laboral.mesesInactivoActividadEconomica ? duracionLegible(laboral.mesesInactivoActividadEconomica) : null}
              tipo="texto"
            />
            <FilaCampo etiqueta="Establecimientos abiertos" valor={laboral.numeroEstablecimientosActivos} tipo="entero" />
            <FilaCampo etiqueta="Establecimientos cerrados" valor={laboral.numeroEstablecimientosInactivos} tipo="entero" />
            <FilaCampo etiqueta="Empleados registrados" valor={laboral.numeroEmpleadosRegistrados} tipo="entero" />
            <FilaCampo etiqueta="Obligaciones patronales en mora" valor={laboral.obligacionesPatronalesEnMora} tipo="booleano" />
          </ul>
        </div>

        <div className="crediscope-card">
          <TituloTarjeta Icono={Receipt}>Impuesto a la renta</TituloTarjeta>
          {d && d.impuestoRentaPorAnio.length > 0 ? (
            <table className="crediscope-aval-tabla" style={{ marginBottom: 10 }}>
              <thead>
                <tr>
                  <th>Año</th>
                  <th title="102 y 102A: la declara la propia persona. 107: la informa el empleador por un sueldo en relación de dependencia.">
                    Formulario
                  </th>
                  <th className="crediscope-aval-num">Causado</th>
                  <th className="crediscope-aval-num">En dependencia</th>
                </tr>
              </thead>
              <tbody>
                {d.impuestoRentaPorAnio.map((r, i) => (
                  <tr key={i}>
                    <td>{r.anio}</td>
                    <td>{r.formulario ?? "—"}</td>
                    <td className="crediscope-aval-num">
                      <Valor valor={r.causado} tipo="dinero" />
                    </td>
                    <td className="crediscope-aval-num">
                      <Valor valor={r.enRelacionDeDependencia} tipo="dinero" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : d ? (
            <p className="crediscope-muted" style={{ margin: "0 0 10px", fontSize: 13 }}>No registra impuesto a la renta.</p>
          ) : null}
          <ul className="crediscope-aval-filas">
            <FilaCampo etiqueta="Genera impuesto a la renta" valor={tributario.generaImpuestoRenta} tipo="booleano" />
            <FilaCampo etiqueta="Mayor impuesto causado" valor={tributario.montoMaximoImpuestoRenta} tipo="dinero" />
            <FilaCampo etiqueta="Año más reciente" valor={tributario.fechaMasRecienteImpuestoRenta} tipo="texto" />
            <FilaCampo etiqueta="Paga ISD (salida de divisas)" valor={tributario.pagaISD} tipo="booleano" />
            <FilaCampo etiqueta="Mayor ISD pagado" valor={tributario.montoMaximoISD} tipo="dinero" />
          </ul>
          <p className="crediscope-aval-nota">
            El impuesto causado sube con la base gravable: un año con impuesto implica ingresos por encima de la fracción exenta
            de ese año.
          </p>
        </div>

        <div className="crediscope-card">
          <TituloTarjeta Icono={ShieldCheck}>Seguridad social</TituloTarjeta>
          <ul className="crediscope-aval-filas">
            <FilaCampo etiqueta="Afiliado activo al IESS" valor={social.afiliadoIessActivo} tipo="booleano" />
            <FilaCampo etiqueta="Estado de la afiliación" valor={social.estadoAfiliacionIess} tipo="texto" />
            <FilaCampo etiqueta="Jubilado" valor={social.esJubilado} tipo="booleano" />
            <FilaCampo etiqueta="Pensionista" valor={social.esPensionista} tipo="booleano" />
            <FilaCampo etiqueta="Cobertura de salud" valor={social.tieneCoberturaSalud} tipo="booleano" />
            <FilaCampo etiqueta="Tipo de seguro de salud" valor={social.tipoSeguroSalud} tipo="texto" />
            <FilaCampo etiqueta="Seguridad social policial (ISSPOL)" valor={social.afiliadoSeguridadPolicial || null} tipo="booleano" />
            <FilaCampo etiqueta="Seguridad social militar (ISSFA)" valor={social.afiliadoSeguridadMilitar || null} tipo="booleano" />
          </ul>
          {/* Policías y militares no aportan al IESS: su ingreso no aparece
              en los aportes de arriba aunque sea estable. Se avisa si
              aparece uno (0 en la cartera al 2026-09-24). */}
          {social.afiliadoSeguridadPolicial || social.afiliadoSeguridadMilitar ? (
            <p className="crediscope-aval-nota">
              Aporta a un régimen especial, no al IESS: la clasificación no ve ese ingreso.
            </p>
          ) : null}
        </div>

        <div className="crediscope-card">
          <TituloTarjeta Icono={ListTree}>Cómo se clasificó</TituloTarjeta>
          <ul className="crediscope-ing-pedidos">
            {(f.fuentes ?? []).map((x, i) => (
              <li key={i}>{x.detalle}</li>
            ))}
            {(f.senalesDeEscala ?? []).map((s) => (
              <li key={s.senal}>{s.detalle}</li>
            ))}
          </ul>
          <ul className="crediscope-aval-filas" style={{ marginTop: 10 }}>
            <FilaCampo etiqueta="Versión de las reglas" valor={f.version} tipo="texto" />
            <FilaCampo etiqueta="Corte del IESS usado" valor={mesLegible(f.corteIessUsado)} tipo="texto" />
            <FilaCampo etiqueta="Aparece en ese corte" valor={f.apareceEnUltimoCorte} tipo="booleano" />
            <FilaCampo etiqueta="Motivo antes de la corrección" valor={f.correccion?.motivoAnterior} tipo="texto" />
          </ul>
        </div>
      </div>
    </>
  );
}
