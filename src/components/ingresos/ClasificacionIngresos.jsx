import { ClipboardCheck, Check, X, Users, FileText, HelpCircle } from "lucide-react";
import { TituloTarjeta } from "../reporte/Piezas.jsx";
import { formatearValorAval } from "../../lib/avalCampos.js";
import { ETIQUETA_SEGMENTO, DOCUMENTOS_DE_CONFIRMACION } from "../../lib/fuentesIngresoConsolidado.js";
import { mesLegible, fechaLegible } from "../../lib/ingresosCampos.js";
import { clasificarPerfilLaboral } from "../../../supabase/functions/_shared/perfil-laboral.ts";

const SECTOR = {
  publico: "sector público",
  privado: "sector privado",
  domestico: "empleo doméstico",
  diplomatico: "misión diplomática",
  agricola: "agrícola",
  otro: "tipo de empleador no reconocido",
};

function Respuesta({ si, children }) {
  const Icono = si === true ? Check : si === false ? X : HelpCircle;
  return (
    <span className={`crediscope-ing-respuesta ${si === true ? "crediscope-ing-respuesta-si" : ""}`}>
      <Icono size={13} aria-hidden="true" />
      {children}
    </span>
  );
}

// Una pregunta con su respuesta y, si hace falta, el detalle plegado debajo.
function Pregunta({ texto, respuesta, children }) {
  return (
    <div className="crediscope-ing-pregunta">
      <div className="crediscope-ing-pregunta-fila">
        <span>{texto}</span>
        {respuesta}
      </div>
      {children}
    </div>
  );
}

function Desplegable({ rotulo, children }) {
  return (
    <details className="crediscope-ing-desplegable" style={{ marginTop: 6 }}>
      <summary>{rotulo}</summary>
      <div className="crediscope-ing-desplegado">{children}</div>
    </details>
  );
}

// Qué tipo de trabajador es, dicho como tres preguntas de sí o no, y qué
// hay que pedirle para confirmarlo. Los textos largos -- la actividad
// económica del SRI, el porqué de la clasificación -- van plegados: hay
// actividades que ocupan tres renglones y llenaban la tarjeta (pedido del
// negocio, 2026-09-26).
export default function ClasificacionIngresos({ f, perfil, corteVigente }) {
  const pedir = f.paraConfirmar ?? [];
  const otroCorte = f.corteIessUsado && corteVigente && f.corteIessUsado < corteVigente;
  const p = clasificarPerfilLaboral(perfil);
  const sinDatos = f.segmento === "sin_datos";
  // Hasta fuentes-v7 el segmento no veía un RUC reactivado: 77 personas
  // quedaron "informal o sin actividad" con actividad propia vigente.
  const segmentoSinVerElRuc = p?.actividadPropia && f.segmento === "informal_o_sin_actividad";
  const recalculo = f.detalle?.recalculo ?? null;
  // Una actividad por texto, con sus locales debajo: el SRI repite la misma
  // actividad en cada local, y contada por registro "2 abiertas" se leía al
  // lado de "6 locales abiertos" como si fueran cosas distintas.
  const actividades = new Map();
  for (const a of f.detalle?.actividadesEconomicas ?? []) {
    const clave = a.actividad ?? "Actividad no informada";
    if (!actividades.has(clave)) actividades.set(clave, []);
    actividades.get(clave).push(a);
  }
  // "No" sólo si la fuente contestó: "no tiene" y "no se sabe" no son lo
  // mismo (CLAUDE.md). Un perfil sin la lista de fuentes no medidas no
  // permite afirmarlo cuando la consulta ya vino incompleta.
  const noMedidas = perfil?.metaConsulta?.fuentesNoMedidas;
  const sinRespuesta = (...fuentes) =>
    Array.isArray(noMedidas) ? fuentes.some((x) => noMedidas.includes(x)) : sinDatos;

  return (
    <div className="crediscope-card">
      <TituloTarjeta Icono={ClipboardCheck}>Clasificación</TituloTarjeta>

      {p ? (
        <section className="crediscope-aval-subseccion">
          <Pregunta
            texto="¿Trabaja para un tercero?"
            respuesta={
              sinDatos ? (
                <Respuesta si={null}>No se sabe</Respuesta>
              ) : (
                <Respuesta si={p.dependencia}>
                  {p.dependencia ? (p.empleos.length === 1 ? "Sí" : `Sí, ${p.empleos.length} empleos`) : "No"}
                </Respuesta>
              )
            }
          >
            {p.dependencia ? (
              <Desplegable rotulo={p.empleos.length === 1 ? "Ver empleador" : "Ver empleadores"}>
                <ul>
                  {p.empleos.map((e, i) => (
                    <li key={i}>
                      {e.empleador ?? "Empleador sin nombre"} · {SECTOR[e.naturaleza] ?? e.naturaleza}
                      {e.monto ? ` · ${formatearValorAval(e.monto, "dinero")}` : ""}
                    </li>
                  ))}
                </ul>
              </Desplegable>
            ) : null}
          </Pregunta>

          <Pregunta
            texto="¿Tiene actividad propia?"
            respuesta={
              !p.actividadPropia && sinRespuesta("contribuyente", "establecimientoActEconomica", "empleados") ? (
                <Respuesta si={null}>No se sabe</Respuesta>
              ) : (
                <Respuesta si={p.actividadPropia}>
                  {p.actividadPropia ? (p.rucActivoDesde ? `Sí, desde ${String(p.rucActivoDesde).slice(0, 4)}` : "Sí") : "No"}
                </Respuesta>
              )
            }
          />

          <Pregunta
            texto="¿Tiene empleados?"
            respuesta={
              !p.empleador && sinRespuesta("empleados") ? (
                <Respuesta si={null}>No se sabe</Respuesta>
              ) : (
                <Respuesta si={p.empleador}>
                  {p.empleador ? <Users size={13} aria-hidden="true" /> : null}
                  {p.empleador ? (p.numeroEmpleados ? `${p.numeroEmpleados}` : "Sí") : "No"}
                </Respuesta>
              )
            }
          />

          {actividades.size > 0 ? (
            <Pregunta
              texto="Actividad registrada en el SRI"
              respuesta={
                <span className="crediscope-muted" style={{ fontSize: 12.5 }}>
                  {actividades.size} {actividades.size === 1 ? "actividad" : "actividades"}
                </span>
              }
            >
              <Desplegable rotulo={actividades.size === 1 ? "Ver la actividad" : `Ver las ${actividades.size} actividades`}>
                <ol>
                  {[...actividades].map(([actividad, locales]) => (
                    <li key={actividad}>
                      {actividad.charAt(0) + actividad.slice(1).toLowerCase()}
                      {locales.map((l, i) => (
                        <span key={i} className="crediscope-muted" style={{ display: "block", fontSize: 12.5 }}>
                          {l.nombreComercial ?? "Local sin nombre comercial"} ·{" "}
                          {l.abierto ? `abierto${l.inicio ? ` desde ${fechaLegible(l.inicio)}` : ""}` : "cerrado"}
                        </span>
                      ))}
                    </li>
                  ))}
                </ol>
              </Desplegable>
            </Pregunta>
          ) : null}

          {/* Las notas que cambian cómo se lee el caso; sólo aparecen si
              aplican. */}
          {p.actividadPropiaPrincipal ? (
            <p className="crediscope-aval-nota">
              Paga en sueldos más de lo que le reportan como dependiente: su actividad propia es, probablemente, la principal.
            </p>
          ) : null}
          {p.aporteVoluntarioSinRuc ? (
            <p className="crediscope-aval-nota">
              Aporta al IESS por su cuenta sin RUC activo: puede ser sólo para no perder la seguridad social, y no prueba trabajo.
            </p>
          ) : null}
          {p.vinculoConEmpleador === "empleador_con_su_apellido" ? (
            <p className="crediscope-aval-nota">Su empleador comparte su apellido: puede ser un negocio familiar.</p>
          ) : null}
          {p.jubilacion ? <p className="crediscope-aval-nota">Registra jubilación.</p> : null}
        </section>
      ) : null}

      <section className="crediscope-aval-subseccion">
        <p className="crediscope-aval-subtitulo">{DOCUMENTOS_DE_CONFIRMACION}</p>
        {pedir.length === 0 ? (
          <p className="crediscope-muted" style={{ margin: 0, fontSize: 13 }}>
            {f.estadoSegmento === "confirmada" ? "Nada: el ingreso principal lo declara un empleador." : "Sin pedidos sugeridos."}
          </p>
        ) : (
          <ul className="crediscope-aval-filas">
            {pedir.map((x, i) => (
              <li key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, lineHeight: 1.45, padding: "4px 0" }}>
                <FileText size={15} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: "var(--brand)" }} />
                {x}
              </li>
            ))}
          </ul>
        )}

        <Desplegable rotulo="Condiciones de la Segmentación">
          <p style={{ margin: 0 }}>{f.motivoSegmento}</p>
          {/* Migración 081: 466 motivos afirmaban un aporte al IESS que no
              existía. Se corrigieron en la base; se dice para que nadie
              compare con una captura vieja y crea que el dato cambió. */}
          {f.correccion ? (
            <p className="crediscope-aval-nota" title={`Texto anterior: ${f.correccion.motivoAnterior}`}>
              Texto corregido el 24/09/2026: el anterior afirmaba un aporte vigente al IESS que no existe. La clasificación no
              cambió.
            </p>
          ) : null}
          {/* scripts/recalcular-fuentes-ingreso.mjs: se reclasificó desde
              el crudo guardado, sin volver a consultar. */}
          {recalculo && recalculo.segmentoAnterior !== f.segmento ? (
            <p className="crediscope-aval-nota">
              Reclasificado el {fechaLegible(recalculo.el)} con las reglas {f.version}: antes figuraba como{" "}
              {ETIQUETA_SEGMENTO[recalculo.segmentoAnterior] ?? recalculo.segmentoAnterior}.
            </p>
          ) : null}
        </Desplegable>

        {/* Estos avisos no se pliegan: dicen que la clasificación puede
            estar desactualizada. */}
        {segmentoSinVerElRuc ? (
          <p className="crediscope-aval-nota" style={{ color: "var(--warn)" }}>
            Esta clasificación se calculó sin ver que el RUC está activo (se reactivó después de un cese): el error se corrigió
            en la versión fuentes-v7. Reconsultar lo pone al día.
          </p>
        ) : null}
        {otroCorte ? (
          <p className="crediscope-aval-nota" style={{ color: "var(--warn)" }}>
            Se clasificó con la información del IESS de {mesLegible(f.corteIessUsado)}; la vigente es de {mesLegible(corteVigente)}.
            Reconsultar lo pone al día.
          </p>
        ) : null}
      </section>
    </div>
  );
}
