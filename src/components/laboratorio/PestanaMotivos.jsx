import { Advertencias, Barra, ETIQUETA_MOTIVO, ETIQUETA_SE_PODIA_VER, num, pct } from "./Comunes.jsx";

// Por qué cayó cada malo (docs/laboratorio-de-riesgo.md, 14.5): con lo que
// se veía el día del análisis y con los eventos detectados entre las dos
// consultas. Lo cuenta lab_contar_motivos(), que nunca lee la verdad
// plantada de una simulación.
//
// Primero lo que importa para mejorar el modelo: ¿se podía ver? Lo que se
// podía ver y el modelo aprobó igual es lo que tiene que corregir; el golpe
// imprevisible sobre un perfil frágil es materia de política, no de puntaje;
// lo que ningún evento explica se busca en Variables.

const COLOR_SE_PODIA_VER = {
  el_modelo_lo_vio: "var(--good)",
  anticipable_no_visto: "var(--bad)",
  vulnerabilidad_visible: "var(--warn)",
  no_anticipable: "var(--text-muted)",
  sin_causa_visible: "var(--bad)",
};
const ORDEN_SE_PODIA_VER = ["el_modelo_lo_vio", "anticipable_no_visto", "sin_causa_visible", "vulnerabilidad_visible", "no_anticipable"];

const par = (x, f = num) => (x ? `${f(x[0])} / ${f(x[1])}` : "—");

export default function PestanaMotivos({ resultado }) {
  if (!resultado) return <p className="crediscope-muted">Todavía no se calculó.</p>;
  const r = resultado.resultado;
  const malos = Number(r.n_malos ?? 0);
  const sePodia = Object.entries(r.se_podia_ver ?? {}).sort((a, b) => ORDEN_SE_PODIA_VER.indexOf(a[0]) - ORDEN_SE_PODIA_VER.indexOf(b[0]));
  const maxPresente = Math.max(1, ...(r.motivos_presentes ?? []).map((m) => Number(m.malos)));

  return (
    <div>
      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>¿Se podía ver el día del análisis?</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          {num(malos)} malos entre {num(r.n)} solicitudes observadas ({pct(r.tasa_general)}).
        </p>
        {sePodia.map(([clave, n]) => (
          <Barra key={clave} etiqueta={ETIQUETA_SE_PODIA_VER[clave] ?? clave} valor={n} maximo={malos} texto={`${num(n)} (${pct(malos ? n / malos : null)})`} color={COLOR_SE_PODIA_VER[clave]} />
        ))}
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          Se podía ver y no lo vio: el modelo aprobó, y la cuota no cabía en el ingreso o el ingreso no estaba confirmado. Perfil frágil: la causa fue un
          golpe posterior, y el día del análisis tenía el ingreso sin confirmar, menos de 12 meses de continuidad laboral o deuda en atraso. Lo que ningún
          evento explica, en un aprobado, es lo que el modelo no vio en los datos: se busca en Variables.
        </p>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>El motivo principal</h3>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Motivo</th>
              <th style={{ textAlign: "right" }}>Malos</th>
              <th style={{ textAlign: "right" }}>Con el crédito de la institución</th>
            </tr>
          </thead>
          <tbody>
            {(r.por_motivo_principal ?? []).map((m) => (
              <tr key={m.motivo}>
                <td>{ETIQUETA_MOTIVO[m.motivo] ?? m.motivo}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{num(m.malos)}</td>
                <td style={{ textAlign: "right" }}>{num(m.con_credito)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          El principal es la primera causa posterior con fecha; si no hay, lo que se veía el día del análisis. La mora de afuera empezó antes que la nuestra
          en {num(r.empezo_afuera)}: ahí el problema empezó en otra parte.
        </p>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Todos los motivos presentes</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>Un malo puede tener varios.</p>
        {(r.motivos_presentes ?? []).map((m) => (
          <Barra key={m.motivo} etiqueta={ETIQUETA_MOTIVO[m.motivo] ?? m.motivo} valor={Number(m.malos)} maximo={maxPresente} texto={num(m.malos)} />
        ))}
      </div>

      <details className="crediscope-card">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Quienes recibieron el mismo golpe: los que cayeron contra los que siguieron pagando</summary>
        <p className="crediscope-muted" style={{ fontSize: 13 }}>
          Si, entre quienes perdieron el trabajo, los que cayeron ya se veían distintos el día del análisis, esa diferencia es algo que el modelo puede
          aprender. Cada par es malos / buenos.
        </p>
        <div style={{ overflowX: "auto" }}>
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Evento</th>
                <th style={{ textAlign: "right" }}>Lo tuvieron</th>
                <th style={{ textAlign: "right" }}>Cayeron</th>
                <th style={{ textAlign: "right" }}>Tasa (general {pct(r.tasa_general)})</th>
                <th style={{ textAlign: "right" }}>Puntaje</th>
                <th style={{ textAlign: "right" }}>Continuidad laboral (meses)</th>
                <th style={{ textAlign: "right" }}>Meses con aporte en 24</th>
                <th style={{ textAlign: "right" }}>Con deuda en atraso</th>
              </tr>
            </thead>
            <tbody>
              {(r.por_evento ?? []).map((e) => (
                <tr key={e.evento}>
                  <td>{ETIQUETA_MOTIVO[e.evento] ?? e.evento}</td>
                  <td style={{ textAlign: "right" }}>{num(e.con_evento)}</td>
                  <td style={{ textAlign: "right" }}>{num(e.malos)}</td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>{pct(e.tasa)}</td>
                  <td style={{ textAlign: "right" }}>{par(e.malos_vs_buenos?.puntaje)}</td>
                  <td style={{ textAlign: "right" }}>{par(e.malos_vs_buenos?.continuidad_laboral_meses, (x) => num(x, 1))}</td>
                  <td style={{ textAlign: "right" }}>{par(e.malos_vs_buenos?.meses_con_aporte_24, (x) => num(x, 1))}</td>
                  <td style={{ textAlign: "right" }}>{par(e.malos_vs_buenos?.con_deuda_en_atraso, pct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <Advertencias lista={r.advertencias} />
    </div>
  );
}
