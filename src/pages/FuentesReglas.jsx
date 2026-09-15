import { Link } from "react-router-dom";
import { ETIQUETA_SEGMENTO, RIESGO_SEGMENTO, ETIQUETA_EVIDENCIA } from "../lib/fuentesIngresoConsolidado.js";

// Las reglas de clasificación, escritas para que las lea el área de
// Riesgos y no un programador.
//
// Está duplicado a mano respecto de fuentes-ingreso.ts, y es a
// propósito: si esta pantalla leyera las reglas del código, mostraría lo
// que el código hace pero no POR QUÉ. El área necesita el porqué para
// poder discutirlas. La contraparte es que al cambiar una regla hay que
// actualizar las dos — por eso la versión se muestra arriba y tiene que
// coincidir con FUENTES_INGRESO_VERSION.

const VERSION_DOCUMENTADA = "fuentes-v1";

const CODIGOS = [
  ["Sector público", "9, 10, 12, 14, 16", "Función ejecutiva, legislativa y judicial; régimen seccional; entidades autónomas; educación superior; notarías y registradores"],
  ["Misión diplomática", "29", "Embajadas, misiones diplomáticas y consulares"],
  ["Dependiente privado", "1, 2, 6, 13, 26, 27, 28", "Empresas privadas, instituciones financieras, construcción, cooperativas"],
  ["Empleo doméstico", "25", "Empleador doméstico"],
  ["Cuenta propia", "3, 8, 31, 32, 34", "Empresa unipersonal, artesanal, microempresa, afiliación voluntaria, RISE"],
  ["Agrícola", "4, 7", "Seguro general agrícola y labores de campo"],
  ["Trabajo del hogar", "35", "Trabajo no remunerado del hogar"],
];

const SBU = [
  [2019, 394], [2020, 400], [2021, 400], [2022, 425],
  [2023, 450], [2024, 460], [2025, 470], [2026, 482],
];

export default function FuentesReglas() {
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

      <div className="crediscope-card">
        <h3>El principio: todo lo que producimos son pisos, no cifras</h3>
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
      </div>

      <div className="crediscope-card">
        <h3>Paso 1 — Qué está vigente se mide contra el corte, no contra hoy</h3>
        <p>
          El registro del IESS se actualiza cada dos o tres meses. Medido sobre 389 clientes reales, 243 terminan en el mismo
          mes: esa es la fecha de corte, no la fecha en que dejaron de trabajar. Si midiéramos la vigencia contra hoy, un retraso
          de la fuente marcaría a 243 personas como desempleadas de golpe.
        </p>
        <p style={{ marginBottom: 0 }}>
          El reverso también informa: quien <strong>no</strong> aparece en el último corte pero sí en el anterior se desvinculó
          hace poco, y eso es una señal de riesgo distinta a llevar dos años sin aportar.
        </p>
      </div>

      <div className="crediscope-card">
        <h3>Paso 2 — De qué naturaleza es cada aporte</h3>
        <p className="crediscope-muted" style={{ marginTop: 0 }}>
          Se lee el <strong>código</strong> del tipo de empleador, nunca la etiqueta: vienen truncadas a distinto largo y con la
          codificación rota.
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
      </div>

      <div className="crediscope-card">
        <h3>Paso 3 — Cuál fuente manda</h3>
        <p>
          Se suman los montos por naturaleza. Si una supera <strong>dos tercios del total</strong>, esa define el segmento. Si
          ninguna llega, el cliente queda como <strong>ingresos mixtos</strong>.
        </p>
        <p style={{ marginBottom: 0 }}>
          Esa regla existe por un caso real: alguien con $2.641 del sector público y $2.750 del privado. Decidir por el mayor lo
          volvería &ldquo;dependiente privado&rdquo; por 109 dólares, y el mes siguiente, con un bono, sería público. Además sería
          engañoso: quien tiene dos ingresos de origen distinto está <em>más</em> diversificado, que es mejor riesgo.
        </p>
      </div>

      <div className="crediscope-card">
        <h3>Paso 4 — Quién paga nómina no es un empleado más</h3>
        <p style={{ marginBottom: 0 }}>
          Si la nómina que paga supera su propio aporte reportado, el ingreso principal viene de su actividad y no de ese
          vínculo. Caso real: 154 empleados y $77.670 de nómina mensual, afiliado con $523,70. Clasificarlo por el aporte lo
          dejaba como dependiente privado, que describe mal de dónde vive.
        </p>
      </div>

      <div className="crediscope-card">
        <h3>Paso 5 — Qué tan firme es la evidencia</h3>
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
              <td>Hay actividad comprobable (RUC, establecimientos, empleados) pero ninguna cifra asociada.</td>
            </tr>
          </tbody>
        </table>
        <p className="crediscope-muted" style={{ marginBottom: 0 }}>
          Salario básico usado para distinguir el mínimo legal:{" "}
          {SBU.map(([a, v]) => `${a}: $${v}`).join(" · ")}
        </p>
      </div>

      <div className="crediscope-card">
        <h3>Los segmentos y cómo falla cada uno</h3>
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
        <p className="crediscope-muted" style={{ marginBottom: 0, fontSize: 13 }}>
          Con datos públicos no se distingue el trabajo informal de la ausencia de ingresos: los dos se ven igual. Por eso van
          juntos y marcados como indeterminados.
        </p>
      </div>
    </div>
  );
}
