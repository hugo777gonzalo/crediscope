import { Landmark } from "lucide-react";
import { TituloTarjeta, Cifra, Valor, FilaCampo } from "./Piezas.jsx";
import { formatearValorAval } from "../../lib/avalCampos.js";

// Deuda y carga financiera, en dos secciones internas: lo que la persona
// debe como titular y lo que respalda como codeudor/garante. Antes eran
// tres tarjetas (Deuda actual, Carga financiera, Deuda contingente) y cada
// rótulo tenía que aclarar de quién era la plata -- "PROPIA", "excluye
// codeudor/garante", "no es deuda propia". Con la sección diciéndolo una
// vez, el rótulo puede decir sólo qué es.
//
// Los montos por estado (por vencer, vencido, demanda, castigada) salen de
// las mismas operaciones que muestra la tabla de abajo, así que cuadran con
// ella. Ver aval-estructura v4, nota 3.

// Saldo de deudasPorEntidad; cuota de la carga financiera. Tarjetas y
// servicios no tienen cuota en Aval: se dice con una raya, no con un 0.
const TIPOS = [
  ["Bancos", "deudaBancos", "cuotaBancos"],
  ["Cooperativas y mutualistas", "deudaCooperativas", "cuotaCooperativas"],
  ["Comercial / retail", "deudaComercial", "cuotaEmpresas"],
  ["Tarjetas de crédito", "deudaTarjetas", null],
  ["Servicios", "deudaServicios", null],
  ["Cobranza", "deudaCobranza", "cuotaCobranza"],
];

function EstadoDeLaDeuda({ porVencer, vencido, demanda, castigada }) {
  return (
    <div className="crediscope-aval-cifras crediscope-aval-cifras-chicas">
      <Cifra etiqueta="Por vencer"><Valor valor={porVencer} tipo="dinero" /></Cifra>
      <Cifra etiqueta="Vencido"><Valor valor={vencido} tipo="dinero" alerta /></Cifra>
      <Cifra etiqueta="En demanda judicial"><Valor valor={demanda} tipo="dinero" alerta /></Cifra>
      <Cifra etiqueta="Cartera castigada"><Valor valor={castigada} tipo="dinero" alerta /></Cifra>
    </div>
  );
}

function diasDeMora(dias) {
  if (dias === null || dias === undefined) return "—";
  return <Valor valor={dias} tipo="entero" alerta />;
}

// Aval también entrega estos cuatro montos como agregado, sin separar por
// rol. Titular + codeudor/garante lo reproduce exacto en casi todos los
// casos (125 de 128 para castigada, todos para el resto); cuando no, se
// dice cuánto falta en vez de elegir en silencio uno de los dos números.
const AGREGADOS = [
  ["por vencer", "valorPorVencerTotal", "porVencerTitular", "porVencerComoCodeudorGarante"],
  ["vencido", "valorVencidoTotal", "vencidoTitular", "vencidoComoCodeudorGarante"],
  ["en demanda judicial", "valorDemandaJudicialTotal", "demandaJudicialTitular", "demandaJudicialComoCodeudorGarante"],
  ["de cartera castigada", "carteraCastigadaTotal", "castigadaTitular", "castigadaComoCodeudorGarante"],
];

function diferenciasConAval(e) {
  return AGREGADOS.flatMap(([nombre, agregado, titular, codeudor]) => {
    const deAval = e[agregado];
    const operaciones = Math.round(((e[titular] ?? 0) + (e[codeudor] ?? 0)) * 100) / 100;
    if (typeof deAval !== "number" || Math.abs(deAval - operaciones) < 0.01) return [];
    return [`Aval declara ${formatearValorAval(deAval, "dinero")} ${nombre} en total; las operaciones detalladas suman ${formatearValorAval(operaciones, "dinero")}.`];
  });
}

export default function DeudaActual({ estructura: e }) {
  const tipos = TIPOS.filter(([, saldo, cuota]) => (e[saldo] ?? 0) !== 0 || (cuota && (e[cuota] ?? 0) !== 0));
  const respaldaAlgo = (e.nOperacionesComoCodeudorGarante ?? 0) > 0 || (e.nOpComoGaranteCodeudor ?? 0) > 0;
  const diferencias = diferenciasConAval(e);

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={Landmark}>Deuda actual</TituloTarjeta>

      <section className="crediscope-aval-subseccion">
        <p className="crediscope-aval-subtitulo">Como titular</p>
        <div className="crediscope-aval-cifras">
          <Cifra etiqueta="Deuda total"><Valor valor={e.totalDeuda} tipo="dinero" /></Cifra>
          <Cifra
            etiqueta="Cuota mensual estimada"
            titulo="Bancos, cooperativas, comercial y cobranza. Aval no estima cuota para tarjetas ni servicios."
          >
            <Valor valor={e.cuotaMensualEstimada} tipo="dinero" />
          </Cifra>
          <Cifra etiqueta="Mora máxima (días)">{diasDeMora(e.maxDiasMoraVigente)}</Cifra>
        </div>

        <div className="crediscope-aval-dos">
          <div>
            <p className="crediscope-aval-subtitulo"><small>Por tipo de deuda</small></p>
            {tipos.length === 0 ? (
              <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>Sin deuda como titular.</p>
            ) : (
              <table className="crediscope-aval-tabla">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th className="crediscope-aval-num">Saldo</th>
                    <th className="crediscope-aval-num">Cuota</th>
                  </tr>
                </thead>
                <tbody>
                  {tipos.map(([etiqueta, saldo, cuota]) => (
                    <tr key={saldo}>
                      <td>{etiqueta}</td>
                      <td className="crediscope-aval-num"><Valor valor={e[saldo]} tipo="dinero" /></td>
                      <td className="crediscope-aval-num">
                        {cuota ? <Valor valor={e[cuota]} tipo="dinero" /> : <span className="crediscope-aval-cero" title="Aval no estima cuota para este tipo de deuda">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <p className="crediscope-aval-subtitulo"><small>Estado de la deuda</small></p>
            <EstadoDeLaDeuda porVencer={e.porVencerTitular} vencido={e.vencidoTitular} demanda={e.demandaJudicialTitular} castigada={e.castigadaTitular} />
          </div>
        </div>
      </section>

      <section className="crediscope-aval-subseccion">
        <p className="crediscope-aval-subtitulo">Como codeudor/garante</p>
        {!respaldaAlgo ? (
          <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>No respalda deudas de terceros.</p>
        ) : (
          <>
            <div className="crediscope-aval-cifras">
              <Cifra etiqueta="Saldo que respalda"><Valor valor={e.deudaComoCodeudorGaranteTotal} tipo="dinero" /></Cifra>
              <Cifra etiqueta="Cuota que respalda"><Valor valor={e.cuotaComoCodeudorGaranteTotal} tipo="dinero" /></Cifra>
              <Cifra etiqueta="Mora del deudor directo (días)">{diasDeMora(e.maxDiasMoraComoCodeudorGarante)}</Cifra>
            </div>
            <div className="crediscope-aval-dos">
              <ul className="crediscope-aval-filas">
                <FilaCampo etiqueta="Operaciones que respalda" valor={e.nOperacionesComoCodeudorGarante} tipo="entero" />
                <FilaCampo etiqueta="Identificaciones ajenas que respalda" valor={e.nOpComoGaranteCodeudor} tipo="entero" />
              </ul>
              <EstadoDeLaDeuda
                porVencer={e.porVencerComoCodeudorGarante}
                vencido={e.vencidoComoCodeudorGarante}
                demanda={e.demandaJudicialComoCodeudorGarante}
                castigada={e.castigadaComoCodeudorGarante}
              />
            </div>
            <p className="crediscope-aval-nota">
              Es deuda ajena: pesa sobre esta persona sólo si el deudor directo deja de pagar.
            </p>
          </>
        )}
      </section>

      {diferencias.length > 0 ? (
        <p className="crediscope-aval-nota">{diferencias.join(" ")}</p>
      ) : null}
    </div>
  );
}
