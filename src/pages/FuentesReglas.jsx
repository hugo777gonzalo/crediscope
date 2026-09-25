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

const VERSION_DOCUMENTADA = "fuentes-v7";

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

      <Paso titulo="El principio: lo que se ve es lo reportado al IESS, no lo que la persona gana">
        <p>
          Ninguna fuente pública dice cuánto gana una persona en Ecuador. El empleador que reporta $500 sobre un sueldo de $900
          para pagar menos aportes no deja rastro. Y con 3,8 millones de empleos formales sobre 9 millones de población
          económicamente activa, la mayor parte de la actividad no queda declarada.
        </p>
        <p>
          Mucha gente gana el <strong>Salario Básico Unificado (SBU)</strong>, que sube cada año entre 8 y 25 dólares. Y hay
          personas que aportan al IESS aunque no tengan un trabajo fijo: los afiliados voluntarios y los unipersonales, que
          por lo general también aportan sobre el SBU. Cuando lo reportado es el SBU del año, o un valor muy cercano (±5%), la
          pantalla lo dice así: <strong>Ingreso Mínimo SBU</strong>.
        </p>
        <p style={{ marginBottom: 0 }}>
          Por eso el módulo nunca afirma <em>&ldquo;ingreso: $500&rdquo;</em> sino{" "}
          <strong>&ldquo;reportado al IESS: $500&rdquo;</strong>. Estimar el ingreso real es un modelo aparte, que necesita
          decenas de miles de casos y validación propia.
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
        <p>
          El reverso también informa: quien <strong>no</strong> aparece en el último corte pero sí en el anterior se desvinculó
          hace poco, y eso es una señal de riesgo distinta a llevar dos años sin aportar.
        </p>
        <p style={{ marginBottom: 0 }}>
          Novadata actualiza el IESS más o menos cada dos meses. El corte vigente es el mes más reciente en el que aparecen al
          menos <strong>20 clientes</strong> consultados en los últimos 90 días. Dos o tres aportes adelantados no lo mueven:
          el 23 de septiembre dos aportes de agosto lo habían pasado a 2026-08 cuando el corte de Novadata era 2026-07, y todo
          asalariado con su último aporte en julio habría quedado &ldquo;fuera del corte&rdquo;. Quien trae un mes más
          reciente que el vigente se clasifica con el suyo.
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
              <td>Un empleador ajeno declara y paga sobre esa base. El sueldo real puede ser mayor: puede estar subdeclarando.</td>
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
              <td>Aporta sobre el SBU del año, lo mínimo para estar cubierto. No dice nada del ingreso.</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600 }}>{ETIQUETA_EVIDENCIA.indirecta}</td>
              <td>Hay actividad comprobable (RUC, establecimientos, empleados, jubilación) pero ninguna cifra asociada.</td>
            </tr>
          </tbody>
        </table>
        <p className="crediscope-muted" style={{ marginBottom: 0 }}>
          Salario Básico Unificado (SBU) de cada año:{" "}
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

      <Paso titulo="Continuidad laboral (desde la v5)">
        <p>
          Mide la estabilidad laboral total: desde cuándo la persona trabaja con un empleador sin haber dejado de trabajar,
          aunque se haya cambiado de empleo. La antigüedad en el empleo actual no lo ve: quien cambió de trabajo sin parar
          aparece con una antigüedad corta aunque lleve años trabajando. En la muestra, en 72 de 190 asalariados la continuidad
          supera a esa antigüedad en más de un año.
        </p>
        <ul style={{ marginBottom: 0 }}>
          <li>
            Entre un empleo y el siguiente se toleran <strong>hasta 2 meses</strong> sin aporte. Con 3 o más, la continuidad se
            corta.
          </li>
          <li>
            Cuenta siempre el trabajo con un empleador: público, privado, diplomático, doméstico y agrícola.
          </li>
          <li>
            El aporte <strong>por cuenta propia</strong> (unipersonal, voluntario, artesanal, RISE) cuenta{" "}
            <strong>sólo en los meses en que la persona tenía un RUC activo</strong>: ahí hay una actividad como independiente
            detrás. Sin RUC activo puede ser sólo no perder los beneficios de la seguridad social, y no prueba trabajo (desde la
            v6). Los períodos del RUC salen del SRI: inicio de actividades, cese más reciente y reinicio más reciente. El RISE
            cuenta siempre, porque es un régimen del propio SRI. En la muestra, el 81% de los meses de aporte propio caen en un
            período con RUC activo; 28 de 137 personas aportan por su cuenta sin RUC activo en ninguno.
          </li>
          <li>No cuentan el trabajo no remunerado del hogar ni un código de empleador que no conocemos.</li>
          <li>
            Cada empleo va desde la fecha de ingreso que declara el IESS hasta su último aporte. El historial mensual del
            proveedor empieza en 2018-2019: sin la fecha de ingreso, alguien que entró en 2004 aparecería con menos continuidad
            de la que tiene.
          </li>
          <li>
            Los meses que el proveedor no publicó para nadie (2018-02, 2019-09 a 2019-11, 2020-01 a 2020-03, 2020-05,
            2020-06, 2020-08 y 2020-11) no cuentan como meses sin trabajo.
          </li>
          <li>
            Si hoy no trabaja con un empleador ni por cuenta propia con RUC activo, la continuidad es 0 y se dice cuándo terminó
            la última.
          </li>
        </ul>
      </Paso>

      <Paso titulo="Perfil laboral: dependiente, independiente o las dos cosas">
        <p>
          El segmento dice de qué fuente depende el ingreso que se puede <em>medir</em>, y sólo el trabajo para un tercero trae
          monto. Pero una persona puede tener un empleo y además un negocio propio (por ejemplo, servicios profesionales). En la
          cartera, el 26% es así: más de la mitad de los dependientes tiene además un RUC activo. El perfil laboral lo mira por
          separado, con dos preguntas:
        </p>
        <ul>
          <li>
            <strong>¿Trabaja para un tercero?</strong> Un aporte al IESS de un empleador público, privado, doméstico,
            diplomático o agrícola. Es <strong>dependiente</strong>.
          </li>
          <li>
            <strong>¿Tiene actividad propia?</strong> RUC activo en el SRI, o paga una nómina (es empleador). No trae monto: se
            sabe que existe, desde cuándo y de qué es, no cuánto deja.
          </li>
        </ul>
        <p style={{ marginBottom: 0 }}>
          De las dos respuestas sale el perfil: <strong>Dependiente</strong>, <strong>Dependiente con actividad propia</strong>,{" "}
          <strong>Independiente</strong>, <strong>Independiente con empleados</strong>, <strong>Afiliado voluntario sin actividad
          registrada</strong> (aporta por su cuenta sin RUC activo), <strong>Jubilado</strong> o{" "}
          <strong>Sin actividad registrada</strong>. En el perfil mixto la actividad propia se lee como complementaria del empleo,
          salvo que pague una nómina mayor que su sueldo: ahí es la principal. El perfil laboral acompaña al segmento, no lo
          cambia, y todavía no entra al análisis con IA.
        </p>
      </Paso>

      <Paso titulo="RUC activo: una sola regla">
        <p style={{ marginBottom: 0 }}>
          Un RUC está activo si no tiene cese, o si se reactivó después del último cese. Como cese cuentan la cancelación, la
          suspensión definitiva y la solicitud de suspensión (el cese temporal). Además, si el SRI informa establecimientos, al
          menos uno tiene que estar abierto. Hasta la v7 la clasificación de ingresos no miraba la reactivación: 77 personas con
          el RUC reactivado figuraban como &ldquo;informal o sin actividad&rdquo;. Ahora el perfil y la clasificación usan la
          misma regla.
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
