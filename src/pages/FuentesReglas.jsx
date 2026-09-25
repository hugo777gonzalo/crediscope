import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { ETIQUETA_SEGMENTO, RIESGO_SEGMENTO, ETIQUETA_EVIDENCIA } from "../lib/fuentesIngresoConsolidado.js";
import { FUENTES_INGRESO_VERSION } from "../../supabase/functions/_shared/fuentes-ingreso.ts";

// Las reglas de clasificación, escritas para que las lea el área de
// Riesgos y no un programador.
//
// Está duplicado a mano respecto de fuentes-ingreso.ts, y es a
// propósito: si esta pantalla leyera las reglas del código, mostraría lo
// que el código hace pero no POR QUÉ. El área necesita el porqué para
// poder discutirlas. La contraparte es que al cambiar una regla hay que
// actualizar las dos.
//
// Esa contraparte falló: el 2026-09-24 esta página documentaba fuentes-v1
// mientras el código iba por la v3, y faltaban tres reglas enteras. Por
// eso ahora compara su versión con la del código y lo dice en pantalla si
// no coinciden, en vez de depender de que alguien se acuerde.

const VERSION_DOCUMENTADA = "fuentes-v4";

const CODIGOS = [
  ["Sector público", "9, 10, 12, 14, 16", "Función ejecutiva, legislativa y judicial; régimen seccional; entidades autónomas; educación superior; notarías y registradores"],
  ["Misión diplomática", "29", "Embajadas, misiones diplomáticas y consulares"],
  ["Dependiente privado", "1, 2, 6, 13, 26, 27, 28", "Empresas privadas, instituciones financieras, construcción, cooperativas"],
  ["Empleo doméstico", "25", "Empleador doméstico"],
  ["Cuenta propia", "3, 8, 24, 30, 31, 32, 34", "Empresa unipersonal, artesanal, sindicatos y cooperativas de transporte, autónomos, microempresa, afiliación voluntaria, RISE"],
  ["Agrícola", "4, 7, 17", "Seguro general agrícola, labores de campo y organizaciones campesinas"],
  ["Trabajo del hogar", "35", "Trabajo no remunerado del hogar"],
];

const SBU = [
  [2019, 394], [2020, 400], [2021, 400], [2022, 425],
  [2023, 450], [2024, 460], [2025, 470], [2026, 482],
];

function Paso({ titulo, children }) {
  return (
    <div className="crediscope-card">
      <h3>{titulo}</h3>
      {children}
    </div>
  );
}

export default function FuentesReglas() {
  const desactualizada = VERSION_DOCUMENTADA !== FUENTES_INGRESO_VERSION;

  return (
    <div>
      <p>
        <Link to="/fuentes" className="crediscope-muted" style={{ textDecoration: "none" }}>
          Volver al panorama
        </Link>
      </p>

      <div style={{ marginBottom: 20 }}>
        <h2 style={{ marginBottom: 4 }}>Reglas de clasificación</h2>
        <p className="crediscope-muted" style={{ margin: 0 }}>
          Versión <strong>{VERSION_DOCUMENTADA}</strong>. Cada Perfil del Cliente guarda con qué versión se clasificó, así un
          cambio de reglas no reescribe el pasado.
        </p>
      </div>

      {desactualizada ? (
        <div className="crediscope-card" style={{ borderColor: "var(--warn)" }}>
          <p style={{ margin: 0, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <AlertTriangle size={20} color="var(--warn)" style={{ flexShrink: 0, marginTop: 2 }} />
            <span>
              Esta página documenta <strong>{VERSION_DOCUMENTADA}</strong>, pero el código clasifica con{" "}
              <strong>{FUENTES_INGRESO_VERSION}</strong>. Alguna regla cambió y todavía no está escrita acá.
            </span>
          </p>
        </div>
      ) : null}

      <Paso titulo="El principio: todo lo que producimos son pisos, no cifras">
        <p>
          Ninguna fuente pública dice cuánto gana una persona en Ecuador. El empleador que reporta $500 sobre un sueldo de $900
          para pagar menos aportes no deja rastro. Quien se autoafilia elige su propia base. Y con 3,8 millones de empleos
          formales sobre 9 millones de población económicamente activa, la mayor parte de la actividad no queda declarada.
        </p>
        <p style={{ marginBottom: 0 }}>
          Por eso el módulo nunca afirma <em>&ldquo;ingreso: $500&rdquo;</em> sino{" "}
          <strong>&ldquo;reportado al IESS: al menos $500&rdquo;</strong>. Estimar el ingreso real es un modelo aparte, que
          necesita decenas de miles de casos y validación propia.
        </p>
      </Paso>

      <Paso titulo="Paso 0: si la fuente no respondió, no se juzga">
        <p style={{ marginBottom: 0 }}>
          Si la fuente que trae los aportes al IESS no contestó, la persona queda como <strong>sin datos</strong>, no como
          informal. &ldquo;No aporta&rdquo; y &ldquo;no sé si aporta&rdquo; son cosas distintas: el 15 de septiembre una caída de
          una hora mandó a 373 personas a &ldquo;informal&rdquo; por no distinguirlas.
        </p>
      </Paso>

      <Paso titulo="Paso 1: la vigencia se mide contra el corte, no contra hoy">
        <p>
          El registro del IESS se actualiza cada dos o tres meses. Medido sobre 389 clientes reales, 243 terminan en el mismo
          mes: esa es la fecha de corte, no la fecha en que dejaron de trabajar. Si midiéramos la vigencia contra hoy, un retraso
          de la fuente marcaría a 243 personas como desempleadas de golpe.
        </p>
        <p style={{ marginBottom: 0 }}>
          El reverso también informa: quien <strong>no</strong> aparece en el último corte pero sí en el anterior se desvinculó
          hace poco, y eso es una señal de riesgo distinta a llevar dos años sin aportar.
        </p>
      </Paso>

      <Paso titulo="Paso 2: de qué naturaleza es cada aporte">
        <p className="crediscope-muted" style={{ marginTop: 0 }}>
          Se lee el <strong>código</strong> del tipo de empleador, nunca la etiqueta: vienen truncadas a distinto largo y con la
          codificación rota. Un código que no está en esta tabla deja a la persona como{" "}
          <strong>{ETIQUETA_SEGMENTO.no_clasificado.toLowerCase()}</strong>, provisional, para que la revise alguien: meterla en
          otro segmento la escondería.
        </p>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Naturaleza</th>
              <th>Códigos</th>
              <th>Qué incluye</th>
            </tr>
          </thead>
          <tbody>
            {CODIGOS.map(([nat, cods, desc]) => (
              <tr key={nat}>
                <td style={{ fontWeight: 600 }}>{nat}</td>
                <td style={{ fontFamily: "monospace" }}>{cods}</td>
                <td style={{ fontSize: 13 }}>{desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Paso>

      <Paso titulo="Paso 3: cuál fuente manda">
        <p>
          Se suman los montos por naturaleza. Si una supera <strong>dos tercios del total</strong>, esa define el segmento. Si
          ninguna llega, el cliente queda como <strong>ingresos mixtos</strong>.
        </p>
        <p>
          Esa regla existe por un caso real: alguien con $2.641 del sector público y $2.750 del privado. Decidir por el mayor lo
          volvería &ldquo;dependiente privado&rdquo; por 109 dólares, y el mes siguiente, con un bono, sería público. Además sería
          engañoso: quien tiene dos ingresos de origen distinto está <em>más</em> diversificado, que es mejor riesgo.
        </p>
        <p style={{ marginBottom: 0 }}>
          Desde la v4, una mezcla queda <strong>provisional</strong> si una de sus partes es cuenta propia, agrícola o de código
          desconocido: la misma regla que si fuera la única fuente. Antes toda mezcla salía confirmada.
        </p>
      </Paso>

      <Paso titulo="Paso 4: jubilación">
        <p style={{ marginBottom: 0 }}>
          Quien registra jubilación y no tiene ninguna otra fuente es <strong>jubilado</strong>, confirmado: la pensión la paga
          el Estado. Si además aporta al IESS, tiene RUC activo o paga una nómina, es{" "}
          <strong>jubilado con ingreso adicional</strong>, provisional: la jubilación es cierta y la actividad no tiene monto.
          Hasta la v3 el RUC y la nómina no contaban, y 97 jubilados con actividad propia figuraban como jubilados a secas.
        </p>
      </Paso>

      <Paso titulo="Paso 5: quien paga nómina no es un empleado más">
        <p style={{ marginBottom: 0 }}>
          Si la nómina que paga supera su propio aporte reportado, el ingreso principal viene de su actividad y no de ese
          vínculo. Caso real: 154 empleados y $77.670 de nómina mensual, afiliado con $523,70. Clasificarlo por el aporte lo
          dejaba como dependiente privado, que describe mal de dónde vive.
        </p>
      </Paso>

      <Paso titulo="Paso 6: sin aportes vigentes">
        <p>
          Si hay aporte vigente pero sin monto, se clasifica por la naturaleza del aporte, provisional. Si no hay ningún aporte,
          pero tiene RUC activo, paga una nómina o declara impuesto a la renta, es <strong>independiente</strong>, provisional. Si
          no hay nada de eso, es <strong>informal o sin actividad</strong>, indeterminado: con datos públicos no se distingue el
          trabajo informal de la ausencia de ingresos.
        </p>
        <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
          Hasta la v3, el RUC y la nómina entraban por la regla del aporte sin monto, y el motivo de 466 perfiles afirmaba un
          aporte al IESS que no existía. El segmento estaba bien; el texto se corrigió en la base el 24/09/2026.
        </p>
      </Paso>

      <Paso titulo="Paso 7: qué tan firme es la evidencia">
        <table className="crediscope-table">
          <tbody>
            <tr>
              <td style={{ fontWeight: 600 }}>{ETIQUETA_EVIDENCIA.reportada_por_tercero}</td>
              <td>Un empleador ajeno declara y paga sobre esa base. Sigue siendo un piso: puede estar subdeclarando.</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>{ETIQUETA_EVIDENCIA.autodeclarada_sobre_minimo}</td>
              <td>
                Eligió aportar por encima del mínimo legal. No prueba el ingreso, pero sí evidencia capacidad: desembolsa esos
                aportes todos los meses.
              </td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>{ETIQUETA_EVIDENCIA.autodeclarada_en_minimo}</td>
              <td>Aporta sobre el salario básico del año. Es el piso de cobertura; no dice nada del ingreso.</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>{ETIQUETA_EVIDENCIA.indirecta}</td>
              <td>Hay actividad comprobable (RUC, establecimientos, empleados, jubilación) pero ninguna cifra asociada.</td>
            </tr>
          </tbody>
        </table>
        <p className="crediscope-muted" style={{ marginBottom: 0 }}>
          Salario básico usado para distinguir el mínimo legal:{" "}
          {SBU.map(([a, v]) => `${a}: $${v}`).join(" · ")}
        </p>
      </Paso>

      <Paso titulo="Lo que se muestra y no clasifica (desde la v4)">
        <p style={{ marginBottom: 0 }}>
          El historial de aportes de los últimos 24 meses (continuidad y tendencia del sueldo declarado), la actividad económica
          registrada en el SRI y el impuesto a la renta de cada año. Se ven en la pestaña Fuentes de ingreso de cada cliente, no
          cambian el segmento y <strong>no entran al análisis con IA</strong> hasta que haya una versión del marco que los
          contemple. Salen del dato crudo de Novadata, que no se guarda: existen sólo en consultas hechas desde la v4.
        </p>
      </Paso>

      <Paso titulo="Los segmentos y cómo falla cada uno">
        <table className="crediscope-table">
          <tbody>
            {Object.entries(ETIQUETA_SEGMENTO).map(([clave, etiqueta]) => (
              <tr key={clave}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{etiqueta}</td>
                <td style={{ fontSize: 13 }}>{RIESGO_SEGMENTO[clave]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Paso>
    </div>
  );
}
