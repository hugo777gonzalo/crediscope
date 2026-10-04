import { Advertencias, Kpi, ETIQUETA_MOTIVO, num, pct, dec } from "./Comunes.jsx";

// ¿Encontró el Laboratorio lo que plantamos? (docs/laboratorio-de-riesgo.md,
// 14.7). Sólo en un corte sintético del ciclo de un año: lo calcula
// lab_calificar_simulacion(), la única función que lee la verdad plantada.
// Califica al Laboratorio, no al motor.

const VARIABLES_PLANTADAS = [
  ["peor_calificacion", "Peor calificación propia", "la ve el modelo"],
  ["deuda_en_atraso", "Deuda propia en atraso", "la ve el modelo"],
  ["demandas_de_cobro", "Demandas de cobro", "la ve el modelo"],
  ["continuidad_laboral_meses", "Continuidad laboral", "la ve el modelo"],
  ["meses_con_aporte_24", "Meses con aporte en los últimos 24", "el modelo NO la recibe"],
];

export default function PestanaCalificacion({ resultado }) {
  if (!resultado) return <p className="crediscope-muted">Todavía no se calculó. Conviene calcular antes Variables con "todas las solicitudes".</p>;
  const r = resultado.resultado;
  const sc = r.resultado_sin_credito ?? {};
  const auc = r.auc_contra_lo_plantado ?? {};
  const coh = r.coherencia_del_credito_de_la_institucion ?? {};
  const mot = r.motivo_principal_plantado_detectado ?? {};

  return (
    <div>
      <Advertencias lista={r.advertencias} />

      <div className="crediscope-kpi-grid">
        <Kpi
          etiqueta="AUC sólo con los desembolsados"
          valor={dec(auc.desembolsados?.auc, 3)}
          detalle={`${num(auc.desembolsados?.malos)} malos: lo que vería una prueba real`}
        />
        <Kpi etiqueta="AUC con todas las solicitudes" valor={dec(auc.todos?.auc, 3)} detalle={`${num(auc.todos?.malos)} malos: sólo se puede saber en una simulación`} />
        <Kpi
          etiqueta="Malos sin crédito que se vieron"
          valor={`${num(sc.malo_plantado_y_visto)} de ${num(sc.malos_plantados)}`}
          detalle={`${num(sc.malo_plantado_sin_observar)} sin observar · ${num(sc.se_puso_al_dia_y_escapo)} se pusieron al día y escaparon`}
        />
        <Kpi etiqueta="Crédito de la institución visto en el buró" valor={`${num(coh.visto_en_el_buro)} de ${num(coh.desembolsados)}`} detalle="Los cancelados no aparecen" />
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>El detector de eventos</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Por persona y tipo de evento. "De la semana real": cambios que traía la reconsulta real de octubre sobre la consulta de septiembre, que no
          plantamos nosotros (no son inventos del detector).
        </p>
        <table className="crediscope-table">
          <thead>
            <tr>
              <th>Evento</th>
              <th style={{ textAlign: "right" }}>Plantados</th>
              <th style={{ textAlign: "right" }}>Encontrados</th>
              <th style={{ textAlign: "right" }}>Proporción</th>
              <th style={{ textAlign: "right" }}>De la semana real</th>
              <th style={{ textAlign: "right" }}>Inventados</th>
            </tr>
          </thead>
          <tbody>
            {(r.eventos ?? []).map((e) => (
              <tr key={e.tipo}>
                <td>{ETIQUETA_MOTIVO[e.tipo] ?? e.tipo}</td>
                <td style={{ textAlign: "right" }}>{num(e.plantados)}</td>
                <td style={{ textAlign: "right" }}>{num(e.encontrados)}</td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{e.plantados ? pct(e.encontrados / e.plantados) : "—"}</td>
                <td style={{ textAlign: "right" }}>{num(e.reales_de_la_semana)}</td>
                <td style={{ textAlign: "right", color: e.inventados > 0 ? "var(--bad)" : undefined }}>{num(e.inventados)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>El motivo plantado, ¿apareció?</h3>
        <p className="crediscope-muted" style={{ marginTop: 0, fontSize: 13 }}>
          Malos cuyo motivo principal plantado es un evento (los de la primera capa se ven en Variables): {num(mot.detectado)} de{" "}
          {num(mot.malos_con_motivo_de_evento)} tienen ese evento detectado.
        </p>
        <table className="crediscope-table">
          <tbody>
            {Object.entries(mot.por_motivo ?? {}).map(([m, [d, n]]) => (
              <tr key={m}>
                <td>{ETIQUETA_MOTIVO[m] ?? m}</td>
                <td style={{ textAlign: "right" }}>{num(d)} de {num(n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="crediscope-card">
        <h3 style={{ marginTop: 0 }}>Las variables plantadas, ¿salieron arriba?</h3>
        {r.variables ? (
          <table className="crediscope-table">
            <thead>
              <tr>
                <th>Variable plantada</th>
                <th>El modelo</th>
                <th style={{ textAlign: "right" }}>Puesto por IV</th>
                <th style={{ textAlign: "right" }}>IV</th>
              </tr>
            </thead>
            <tbody>
              {VARIABLES_PLANTADAS.map(([clave, nombre, modelo]) => {
                const v = r.variables.puestos?.[clave];
                return (
                  <tr key={clave}>
                    <td>{nombre}</td>
                    <td className="crediscope-muted">{modelo}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{v ? num(v.puesto) : "—"}</td>
                    <td style={{ textAlign: "right" }}>{v ? dec(v.iv, 3) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <p className="crediscope-muted">Falta calcular Variables en este corte.</p>
        )}
        <p className="crediscope-muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
          El dato que sólo está en el crudo (licencia vencida al día del análisis) no está en el catálogo de variables: lo tiene que encontrar el explorador
          del crudo (fase E).
        </p>
      </div>
    </div>
  );
}
