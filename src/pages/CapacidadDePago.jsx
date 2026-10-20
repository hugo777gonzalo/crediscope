import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Landmark, Sparkles, Wallet } from "lucide-react";
import { getLatestProfile, getUltimaConsultaEquifax } from "../lib/api.js";
import { useBuro } from "../lib/useBuro.js";
import { setUltimaCedula } from "../lib/ultimaCedula.js";
import { aNumero, useCondicionesDelCredito } from "../lib/credito.js";
import { entero, mesAnio, moneda, porcentaje } from "../lib/formatos.js";
import { formatearFecha } from "../lib/fechas.js";
import PestanasCliente from "../components/PestanasCliente.jsx";
import ClienteHeader from "../components/ClienteHeader.jsx";
import CondicionesDelCredito from "../components/credito/CondicionesDelCredito.jsx";
import VeredictoDeCapacidad from "../components/credito/VeredictoDeCapacidad.jsx";
import ResumenFijo from "../components/credito/ResumenFijo.jsx";
import IngresoDeclarado from "../components/credito/IngresoDeclarado.jsx";
import Aviso from "../components/ui/Aviso.jsx";
import AvisoDeError from "../components/ui/AvisoDeError.jsx";
import Cargando from "../components/ui/Cargando.jsx";
import { montoMaximoParaCuota, PRODUCTO_CONSUMO, simularCredito } from "../../supabase/functions/_shared/simulador-credito.ts";
import { conIngresoDeclarado, datosDeCapacidad, evaluarCapacidad } from "../../supabase/functions/_shared/capacidad-de-pago.ts";

// Capacidad de pago de una persona (docs/plan-demo-ifi.md, paso 3): si la
// cuota del crédito que pide entra en lo que recibe, sumada a lo que ya paga.
//
// Los números salen de las mismas funciones que usa el servicio
// `capacidad-de-pago` (datosDeCapacidad, evaluarCapacidad, simularCredito):
// la pantalla lee el perfil y la consulta de Equifax con la sesión del
// analista y calcula acá, sin esperar a la red en cada tecla.
//
// No consulta a ninguna fuente: si la persona no se consultó, lo dice.

export default function CapacidadDePago() {
  const { cedula } = useParams();
  const { buro } = useBuro();
  const { valores, cambiar, pedido } = useCondicionesDelCredito();
  const [carga, setCarga] = useState({ cargando: true, error: null, fila: null, equifax: null });
  const [declarado, setDeclarado] = useState("");

  useEffect(() => {
    setUltimaCedula(cedula);
  }, [cedula]);

  useEffect(() => {
    if (buro === undefined) return undefined;
    let vigente = true;
    setCarga((c) => ({ ...c, cargando: true, error: null }));
    Promise.all([getLatestProfile(cedula), buro === "equifax" ? getUltimaConsultaEquifax(cedula) : Promise.resolve(null)])
      .then(([fila, equifax]) => {
        // Una consulta del ambiente de prueba contesta por otra persona.
        const equifaxValida = equifax?.ambiente === "produccion" && equifax?.estructura ? equifax : null;
        if (vigente) setCarga({ cargando: false, error: null, fila, equifax: equifaxValida });
      })
      .catch((error) => vigente && setCarga({ cargando: false, error, fila: null, equifax: null }));
    return () => {
      vigente = false;
    };
  }, [cedula, buro]);

  const perfil = carga.fila?.standard_profile ?? null;
  const datosIess = useMemo(() => (perfil ? datosDeCapacidad(perfil, carga.equifax?.estructura ?? null) : null), [perfil, carga.equifax]);
  const datos = useMemo(() => (datosIess ? conIngresoDeclarado(datosIess, aNumero(declarado)) : null), [datosIess, declarado]);
  const conDeclarado = Boolean(datos && datos !== datosIess);
  const simulacion = useMemo(() => simularCredito(pedido), [pedido]);
  const capacidad = useMemo(
    () => (datos && simulacion.ok ? evaluarCapacidad({ ...datos, cuotaNueva: simulacion.simulacion.cuotaPrimerMes }) : null),
    [datos, simulacion],
  );
  // Con un Ingreso declarado, lo que daría sólo el IESS, para comparar.
  const soloIess = useMemo(
    () => (conDeclarado && simulacion.ok ? evaluarCapacidad({ ...datosIess, cuotaNueva: simulacion.simulacion.cuotaPrimerMes }) : null),
    [conDeclarado, datosIess, simulacion],
  );
  const montoMaximo = useMemo(() => {
    if (!capacidad) return null;
    const { monto: _monto, ...condiciones } = pedido;
    return montoMaximoParaCuota(capacidad.cuotaMaximaAdmisible, condiciones);
  }, [capacidad, pedido]);

  return (
    <div>
      <p>
        <Link to="/" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Buscar otra persona
        </Link>
      </p>
      <PestanasCliente cedula={cedula} activa="capacidad" />

      {carga.cargando ? <Cargando /> : null}
      {carga.error ? <AvisoDeError error={carga.error} /> : null}

      {!carga.cargando && !carga.error && !carga.fila ? (
        <Aviso tipo="informacion" titulo="Esta persona todavía no se consultó">
          <p style={{ margin: 0 }}>
            La capacidad de pago se mide con el ingreso reportado al IESS y las deudas de la persona. <Link to={`/perfil/${cedula}`}>Consultala desde el Perfil de la Persona</Link> y volvé acá.
          </p>
        </Aviso>
      ) : null}

      {datos ? (
        <>
          <ClienteHeader nombreCompleto={perfil?.identidad?.nombreCompleto} cedula={cedula} />

          <div className="crediscope-credito-grid">
            <div className="crediscope-credito-columna">
              <CondicionesDelCredito valores={valores} cambiar={cambiar} />
              <IngresoDeclarado valor={declarado} alCambiar={setDeclarado} />
            </div>

            <div className="crediscope-credito-columna">
              {capacidad ? (
                <>
                  <VeredictoDeCapacidad capacidad={capacidad} soloIess={soloIess} />
                  {capacidad.veredicto !== "sin_ingreso" ? (
                    <div className="crediscope-card crediscope-capacidad-maximo">
                      <Sparkles size={20} aria-hidden="true" className="crediscope-capacidad-maximo-icono" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="crediscope-capacidad-maximo-etiqueta">Hasta cuánto le alcanza</p>
                        {capacidad.cuotaMaximaAdmisible > 0 && montoMaximo ? (
                          <>
                            <p className="crediscope-capacidad-maximo-cifra">{moneda(Math.floor(montoMaximo))}</p>
                            <p className="crediscope-credito-ayuda" style={{ margin: 0 }}>
                              A {entero(pedido.plazoMeses)} meses y la misma tasa, con una cuota de hasta {moneda(capacidad.cuotaMaximaAdmisible, 2)}.
                            </p>
                          </>
                        ) : capacidad.cuotaMaximaAdmisible > 0 && montoMaximo === 0 ? (
                          <p style={{ margin: "4px 0 0" }}>Lo que le queda por mes no alcanza para el monto mínimo de {moneda(PRODUCTO_CONSUMO.limites.montoMinimo)}.</p>
                        ) : (
                          <p style={{ margin: "4px 0 0" }}>Con lo que ya paga por mes, no le queda espacio para otra cuota.</p>
                        )}
                      </div>
                      {capacidad.cuotaMaximaAdmisible > 0 && montoMaximo ? (
                        <button type="button" className="crediscope-btn crediscope-btn-ghost" onClick={() => cambiar.setMonto(entero(Math.floor(montoMaximo)))}>
                          Usar este monto
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : (
                <Aviso tipo="advertencia" titulo="Revisá las condiciones del crédito">
                  <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                    {(simulacion.errores ?? []).map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </Aviso>
              )}
            </div>
            {capacidad ? <ResumenFijo cuota={capacidad.cuotaNueva} veredicto={capacidad.veredicto} /> : null}
          </div>

          {capacidad && (capacidad.obligacionesIncompletas || capacidad.ingresoSoloSbu) ? (
            <Aviso tipo="advertencia" titulo="Lo que este cálculo no ve">
              <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                {capacidad.avisos.filter((a) => !a.startsWith("No hay un ingreso")).map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </Aviso>
          ) : null}

          <div className="crediscope-capacidad-detalle">
            <section className="crediscope-card">
              <h3 className="crediscope-capacidad-subtitulo">
                <Wallet size={17} aria-hidden="true" />
                Lo que recibe por mes
              </h3>
              {datos.ingresos.length === 0 ? (
                <p className="crediscope-muted" style={{ margin: 0 }}>
                  No tiene un ingreso reportado al IESS en {datos.corteIess ? mesAnio(datos.corteIess) : "el último corte"}. Podés completar el Ingreso
                  declarado.
                </p>
              ) : (
                <div className="crediscope-capacidad-lista">
                  {datos.ingresos.map((x, i) => (
                    <div key={i} className="crediscope-capacidad-fila">
                      <span>
                        {x.concepto}
                        {x.tipo === "declarado" ? <span className="crediscope-tag crediscope-tag-warn" style={{ marginLeft: 8 }}>Sin verificar</span> : null}
                        {x.esIngresoMinimoSbu ? <span className="crediscope-tag crediscope-tag-warn" style={{ marginLeft: 8 }}>Ingreso Mínimo SBU</span> : null}
                      </span>
                      <span>{moneda(x.montoMensual, 2)}</span>
                    </div>
                  ))}
                  {capacidad && capacidad.aportePersonal > 0 ? (
                    <div className="crediscope-capacidad-fila crediscope-capacidad-fila-resta">
                      <span>Aporte personal al IESS ({porcentaje(capacidad.parametros.aportePersonalIess, 2)}), que no cobra</span>
                      <span>−{moneda(capacidad.aportePersonal, 2)}</span>
                    </div>
                  ) : null}
                  {capacidad ? (
                    <div className="crediscope-capacidad-fila crediscope-capacidad-fila-total">
                      <span>{conDeclarado ? "Ingreso con que se mide" : "Ingreso neto"}</span>
                      <span>{moneda(capacidad.ingresoNeto, 2)}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {conDeclarado ? (
                <>
                  <p className="crediscope-capacidad-sin-cuota-titulo">Reportado al IESS, como referencia</p>
                  {datosIess.ingresos.length === 0 ? (
                    <p className="crediscope-muted" style={{ margin: "6px 0 0" }}>
                      No tiene un ingreso reportado en {datosIess.corteIess ? mesAnio(datosIess.corteIess) : "el último corte"}.
                    </p>
                  ) : (
                    <div className="crediscope-capacidad-lista">
                      {datosIess.ingresos.map((x, i) => (
                        <div key={i} className="crediscope-capacidad-fila crediscope-capacidad-fila-tenue">
                          <span>{x.concepto}</span>
                          <span>{moneda(x.montoMensual, 2)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              ) : null}

              <p className="crediscope-capacidad-origen">
                {conDeclarado ? (
                  "El Ingreso declarado es lo que dice la persona y no está verificado. Lo reportado al IESS queda como referencia."
                ) : (
                  <>
                    Reportado al IESS{datos.corteIess ? ` · Información IESS ${mesAnio(datos.corteIess)}` : ""}. Es lo que declara el empleador o el afiliado,
                    no necesariamente todo lo que gana.
                  </>
                )}
              </p>
            </section>

            <section className="crediscope-card">
              <h3 className="crediscope-capacidad-subtitulo">
                <Landmark size={17} aria-hidden="true" />
                Lo que ya paga por mes
              </h3>
              {datos.obligaciones.length === 0 ? (
                <p className="crediscope-muted" style={{ margin: 0 }}>
                  No se conoce ninguna cuota.
                </p>
              ) : (
                <div className="crediscope-capacidad-lista">
                  {datos.obligaciones.map((x, i) => (
                    <div key={i} className="crediscope-capacidad-fila">
                      <span>
                        {x.concepto} <span className="crediscope-tag crediscope-tag-neutral">{x.origen}</span>
                      </span>
                      <span>{moneda(x.montoMensual, 2)}</span>
                    </div>
                  ))}
                  {/* Con una sola deuda, el total repetía su fila (2026-10-18). */}
                  {capacidad && datos.obligaciones.length > 1 ? (
                    <div className="crediscope-capacidad-fila crediscope-capacidad-fila-total">
                      <span>Total por mes</span>
                      <span>{moneda(capacidad.obligacionesActuales, 2)}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {datos.deudasSinCuota.length > 0 ? (
                <>
                  <p className="crediscope-capacidad-sin-cuota-titulo">Deudas sin cuota informada</p>
                  <div className="crediscope-capacidad-lista">
                    {datos.deudasSinCuota.map((x, i) => (
                      <div key={i} className="crediscope-capacidad-fila crediscope-capacidad-fila-tenue">
                        <span>
                          {x.concepto} <span className="crediscope-tag crediscope-tag-neutral">{x.origen}</span>
                        </span>
                        <span>{x.saldo === null ? "Sin monto" : `Debe ${moneda(x.saldo, 2)}`}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}

              <p className="crediscope-capacidad-origen">
                {datos.fuenteDeLasCuotas === "equifax" ? (
                  <>Cuotas del buró Equifax, consulta del {formatearFecha(carga.equifax.created_at)}. Lo que figura como codeudor o garante no se cuenta.</>
                ) : buro === "equifax" ? (
                  <>
                    Sin consulta de Equifax: de los bancos se conoce el saldo, no la cuota. <Link to={`/equifax/${cedula}`}>Ver la pestaña Equifax</Link>.
                  </>
                ) : (
                  <>Cuotas de cooperativas según Novadata; los bancos no informan la cuota.</>
                )}
              </p>
            </section>
          </div>
        </>
      ) : null}
    </div>
  );
}
