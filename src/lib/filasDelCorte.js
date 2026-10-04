// La forma de las filas de un corte, sin la descarga: lo usan
// datosDelCorte.js en el navegador y los guiones de prueba en Node (que no
// pueden importar el cliente de Supabase del navegador).
//
// Dos poblaciones con la misma forma de fila:
//  - operaciones: lo desembolsado, con el resultado del archivo de la
//    institución (lo que vería una prueba retrospectiva real);
//  - solicitudes (ciclo de un año, sección 14 del diseño): todas las
//    personas analizadas, con el resultado de la reconsulta del buró. Tiene
//    ~10 veces más malos: es la que da poder a la estadística.

export const SELECT_OPERACIONES =
  "operacion_id, cedula, producto, monto, fecha_desembolso, incluida, motivo_exclusion, malo, fuente_puntaje, puntaje, recomendacion, marco_version, structure_version, veredicto_origen, primera_de_la_persona, client_profile_id, analysis_result_id, variables, lab_operaciones(fecha_primer_default, canal, plazo_meses, estado_operacion, cuota_mensual, lab_cargas(fecha_corte, institucion))";

export const SELECT_SOLICITUDES =
  "solicitud_id, cedula, desembolsada, recomendacion, puntaje, fuente_puntaje, incluida, motivo_exclusion, malo, origen_resultado, donde, recibio_credito_de_otro, fecha_default, cuota_mensual, variables, lab_solicitudes(fecha_solicitud, decision_institucion, client_profile_id, analysis_result_id, operacion_id, lab_reconsultas(fecha))";

const fecha = (d) => (d ? new Date(`${d}T12:00:00Z`) : null);

export function normalizarSolicitud(f) {
  const s = f.lab_solicitudes ?? {};
  const reconsulta = Array.isArray(s.lab_reconsultas) ? s.lab_reconsultas[0] : s.lab_reconsultas;
  return {
    id: f.solicitud_id, cedula: f.cedula, malo: f.malo, puntaje: f.puntaje, recomendacion: f.recomendacion ?? "sin recomendación",
    bloqueado: f.recomendacion === "bloqueado", incluida: f.incluida, motivoExclusion: f.motivo_exclusion,
    fecha: fecha(s.fecha_solicitud), fechaDefault: fecha(f.fecha_default), finObservacion: fecha(reconsulta?.fecha),
    desembolsada: f.desembolsada, decisionInstitucion: s.decision_institucion ?? null, origenResultado: f.origen_resultado,
    donde: f.donde ?? [], recibioCreditoDeOtro: f.recibio_credito_de_otro, cuota: f.cuota_mensual, fuentePuntaje: f.fuente_puntaje,
    perfilId: s.client_profile_id ?? null, analisisId: s.analysis_result_id ?? null, operacionId: s.operacion_id ?? null,
    producto: null, canal: null, monto: null, marco: null, variables: f.variables ?? {},
  };
}

export function normalizarOperacion(f) {
  const op = f.lab_operaciones ?? {};
  const bloqueado = f.veredicto_origen === "control_bloqueo";
  return {
    id: f.operacion_id, cedula: f.cedula, malo: f.malo, puntaje: f.puntaje, recomendacion: bloqueado ? "bloqueado" : f.recomendacion ?? "sin recomendación",
    bloqueado, incluida: f.incluida, motivoExclusion: f.motivo_exclusion, primera: f.primera_de_la_persona,
    fecha: fecha(f.fecha_desembolso), fechaDefault: fecha(op.fecha_primer_default), finObservacion: fecha(op.lab_cargas?.fecha_corte),
    desembolsada: true, decisionInstitucion: "desembolsada", producto: f.producto, canal: op.canal ?? null, monto: f.monto, plazo: op.plazo_meses,
    estadoOperacion: op.estado_operacion, cuota: op.cuota_mensual, institucion: op.lab_cargas?.institucion ?? null,
    marco: f.marco_version, estructura: f.structure_version, fuentePuntaje: f.fuente_puntaje,
    perfilId: f.client_profile_id, analisisId: f.analysis_result_id, variables: f.variables ?? {},
  };
}

// Las filas que sirven para medir: incluidas y con resultado conocido. Una
// persona con varias operaciones cuenta una vez para las variables (la
// primera), igual que lab_calcular_variables.
export function filasObservadas(filas, { unaPorPersona = false } = {}) {
  return filas.filter((f) => f.incluida && typeof f.malo === "boolean" && (!unaPorPersona || f.primera !== false));
}

// Para todo lo que mide el puntaje: sin los bloqueados, que no tienen
// puntaje del motor (lab_auc los saca igual).
export const filasConPuntaje = (filas) => filasObservadas(filas).filter((f) => !f.bloqueado && Number.isFinite(f.puntaje));

// Meses entre dos fechas (con decimales: 30,44 días por mes).
export const mesesEntre = (desde, hasta) => (desde && hasta ? (hasta - desde) / (1000 * 60 * 60 * 24 * 30.44) : null);

export const mesDe = (d) => (d ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}` : "sin fecha");
