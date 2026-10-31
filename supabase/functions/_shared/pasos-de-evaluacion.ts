// Los pasos de una evaluación (perfil, buró, análisis y capacidad), llamados
// directamente y no por HTTP: es lo que corre el trabajador de la API
// (`procesar-evaluaciones`).
//
// Por qué no llaman a `structure-client`, `consultar-equifax` y `analyze-client`
// como hace `evaluar-solicitud` para la pantalla: esas funciones se autentican
// con la sesión de un analista, y para que el trabajador entrara habría que
// abrirles una puerta más (una clave de servicio) a la consulta que cobra al
// buró y a la que gasta modelo. Acá el trabajador es la única pieza con ese
// poder, y se autentica con su propia clave (VIGIA_CLAVE); las funciones de
// siempre siguen con una sola puerta cada una. Comparten el cuerpo
// (`consulta-de-perfil.ts`, `analisis-de-la-persona.ts`,
// `equifax-persistencia.ts`): una sola implementación.
//
// Cada paso devuelve su resultado o un fallo con el código de la especificación
// (`falloDeUnPaso`); nunca copia lo que contestó un tercero, que podría traer su
// mensaje (Novadata, Equifax, el modelo) o el de la base.

import { consultaVigenteDeEquifax } from "./buro-de-la-institucion.ts";
import { analizarPersona } from "./analisis-de-la-persona.ts";
import { consultarYGuardarPerfil } from "./consulta-de-perfil.ts";
import { elPerfilSirve } from "./calidad-de-la-consulta.ts";
import { guardarTablasDeLaConsulta, procesarConsultaEquifax } from "./equifax-persistencia.ts";
import { conIngresoDeclarado, datosDeCapacidad, elBuroTraeDetalle, evaluarCapacidad } from "./capacidad-de-pago.ts";
import { montoMaximoParaCuota, simularCredito } from "./simulador-credito.ts";
import { type FalloDeUnPaso, falloDeUnPaso, type Paso, pasoEnCurso, type RegistroDePaso, resumenDelAnalisis } from "./modalidades.ts";
import type { ResultadoDelPaso } from "./cola-de-evaluaciones.ts";

// deno-lint-ignore no-explicit-any
type Fila = Record<string, any>;

export interface ContextoDeLosPasos {
  // deno-lint-ignore no-explicit-any
  db: any;
  /** Quién se hace cargo de las consultas: el usuario que creó la evaluación. */
  actorId: string;
  /**
   * Si el paso del buró puede consultar Equifax cuando no hay una consulta
   * vigente, que se cobra. La API sí (negocio, 2026-10-21); la pantalla sólo si
   * quien evalúa es administrador.
   */
  puedeCobrarEquifax: boolean;
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" });

const fallido = (paso: Paso, status: number, motivo?: string | null): ResultadoDelPaso => ({ ok: false, fallo: falloDeUnPaso(paso, status, motivo) });
const fallo = (detalle: string, codigo: FalloDeUnPaso["codigo"], esperarMs = 0): ResultadoDelPaso => ({ ok: false, fallo: { detalle, codigo, esperarMs } });

// Cuántos días vale un perfil antes de volver a preguntarle a las fuentes: un
// parámetro del negocio que vive en la base (61), el mismo del lote.
async function diasDeValidezDelPerfil(db: Fila): Promise<number> {
  const { data } = await db.from("config_operativa").select("valor").eq("clave", "dias_validez_perfil").maybeSingle();
  const n = Number(data?.valor ?? 7);
  return Number.isFinite(n) && n > 0 ? n : 7;
}

export async function correrPaso(paso: Paso, s: Fila, ctx: ContextoDeLosPasos): Promise<ResultadoDelPaso> {
  try {
    if (paso === "perfil") return await pasoPerfil(s, ctx);
    if (paso === "buro") return await pasoBuro(s, ctx);
    if (paso === "analisis") return await pasoAnalisis(s, ctx);
    return await pasoCapacidad(s, ctx.db);
  } catch (err) {
    // Sin el mensaje: un error de la base o de una fuente puede traer datos.
    console.error("pasos-de-evaluacion:", paso, (err as Error)?.name);
    return fallido(paso, 500);
  }
}

async function pasoPerfil(s: Fila, ctx: ContextoDeLosPasos): Promise<ResultadoDelPaso> {
  const { db } = ctx;
  let clientId = (s.client_id as string | null) ?? null;
  if (!clientId) {
    const { data } = await db.from("clients").select("id").eq("cedula", s.identificacion).maybeSingle();
    clientId = data?.id ?? null;
  }
  if (clientId) {
    // El ÚLTIMO perfil, sirva o no (la lección del lote: uno bueno de hace cinco
    // días y uno vacío de ayer no se dan por vigente con el viejo). Y que sirva.
    const { data: ultimo } = await db
      .from("client_profiles")
      .select("id, created_at, fuentes_ok, ejes_ok, standard_profile->fuentesIngreso->segmento, standard_profile->fuentesIngreso->pisoIngresoMensualReportado")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const dias = await diasDeValidezDelPerfil(db);
    if (ultimo && elPerfilSirve(ultimo) && Date.now() - Date.parse(ultimo.created_at) < dias * 86_400_000) {
      // También se audita reutilizar: no se consultó a la fuente, pero los datos
      // de esa persona entran igual al resultado que se le entrega a la institución.
      await db.from("audit_log").insert({
        actor: ctx.actorId,
        action: "evaluacion.reutiliza_perfil",
        client_id: clientId,
        meta: { solicitud_id: s.id, client_profile_id: ultimo.id, dias_validez: dias },
      });
      return {
        ok: true,
        cambios: { client_id: clientId, client_profile_id: ultimo.id },
        detalle: `Se reutilizó el perfil del ${fecha(ultimo.created_at)}.`,
        resultado: { perfil: { perfilId: ultimo.id, perfilDel: ultimo.created_at, reutilizado: true, segmento: ultimo.segmento ?? null, ingresoReportadoIess: ultimo.pisoIngresoMensualReportado ?? null } },
      };
    }
  }
  const r = await consultarYGuardarPerfil({
    db,
    cedula: s.identificacion,
    ingresado: s.identificacion,
    tipoIdentificacion: "cedula",
    actorId: ctx.actorId,
    metaDeAuditoria: { origen: "api", solicitud_id: s.id },
  });
  if (!r.ok) return fallido("perfil", r.status);
  const g = r.guardado;
  const f = g.standard_profile?.fuentesIngreso ?? {};
  return {
    ok: true,
    cambios: { client_id: g.client_id, client_profile_id: g.id },
    detalle: "Se consultó a la persona en Novadata.",
    resultado: { perfil: { perfilId: g.id, perfilDel: g.created_at, reutilizado: false, segmento: f.segmento ?? null, ingresoReportadoIess: f.pisoIngresoMensualReportado ?? null } },
  };
}

async function pasoBuro(s: Fila, ctx: ContextoDeLosPasos): Promise<ResultadoDelPaso> {
  const { db } = ctx;
  if (!s.client_id) return fallo("Falta la persona: el buró se consulta después del perfil.", "error_interno");
  const vigente = await consultaVigenteDeEquifax(db, s.client_id);
  if (vigente) {
    return {
      ok: true,
      cambios: { consulta_equifax_id: vigente.consultaId },
      detalle: `Se reutilizó la consulta de Equifax del ${fecha(vigente.consultadoEl)}, vigente hasta el 17.`,
      resultado: { buro: { consultaId: vigente.consultaId, consultadoEl: vigente.consultadoEl, reutilizada: true } },
    };
  }
  if (!ctx.puedeCobrarEquifax) return fallido("buro", 403);

  // Otra evaluación de la misma persona consultando Equifax ahora mismo: la
  // reutilización mira lo guardado, y lo que está en vuelo todavía no lo está.
  // Dos evaluaciones Plus a la vez pagaban dos veces.
  const { data: otras, error: errorOtras } = await db
    .from("solicitudes")
    .select("id, pasos")
    .eq("identificacion", s.identificacion)
    .eq("estado", "en_evaluacion")
    .neq("id", s.id);
  if (errorOtras) return fallo("No se pudieron leer las otras evaluaciones de la persona.", "error_interno");
  // Sólo cede la que empezó después (o, a igual hora, la de id mayor): si las dos
  // cedieran, cada una vería a la otra en curso, volverían juntas y fallarían sin
  // haber consultado a nadie.
  const empezoAntes = (otra: Fila) => {
    const suyo = (otra.pasos as RegistroDePaso[]).find((p) => p.paso === "buro")?.el ?? "";
    const mio = (s.pasos as RegistroDePaso[]).find((p) => p.paso === "buro")?.el ?? "";
    return suyo < mio || (suyo === mio && String(otra.id) < String(s.id));
  };
  if ((otras ?? []).some((o: Fila) => pasoEnCurso(o.pasos, "buro") && empezoAntes(o))) {
    return fallo("Otra evaluación de esta persona está consultando Equifax en este momento. Se reintenta enseguida: si esa consulta quedó guardada, se reutiliza.", "buro_no_disponible", 45_000);
  }

  // Sin el id de la autorización ni la referencia: texto libre de la institución, y
  // esta base legal queda en la constancia de la consulta, que no se corrige. La
  // constancia ya enlaza a la persona; la evaluación, por su id, a su autorización.
  const baseLegal = "Contrato con la institución: autorización del titular garantizada por la IFI; consulta de buró Equifax para calificación crediticia, pedida por la API (modalidad Plus)";
  const r = await procesarConsultaEquifax({
    db,
    cedula: s.identificacion,
    actorId: ctx.actorId,
    baseLegal,
    origen: "api",
    transporte: { tipo: "funcion" },
  });
  if (r.resultado === "rechazada") {
    const f = falloDeUnPaso("buro", r.http, r.motivo);
    // Se cobró y no quedó nada guardado: reintentar pagaría otra vez sin traer nada.
    // Con una respuesta en mano que no sirvió, tampoco se sabe si se cobró.
    const cobrada = r.motivo === "otra_persona" ||
      (Boolean(r.respuesta) && (r.motivo === "no_se_pudo_guardar" || (r.motivo === "fallo" && r.respuesta?.puedeHaberCobrado === true)));
    return { ok: false, fallo: cobrada ? { ...f, noReintentar: true } : f };
  }
  if (r.resultado === "simulada") return fallido("buro", 500);

  // La misma regla que el camino de arriba y que el modelo. La consulta se
  // reutiliza aunque no tenga su estructura (las tablas pueden fallar después de
  // pagar), y sin estructura la capacidad de Plus caería sin avisar a las cuotas
  // de Novadata. Una consulta vigente sin estructura se rehace acá desde su crudo,
  // sin volver a pagar: antes nada la rehacía y esa persona no podía hacer un Plus
  // hasta el corte del mes.
  let usable = await consultaVigenteDeEquifax(db, s.client_id);
  if (!usable || usable.consultaId !== r.fila.id) {
    await guardarTablasDeLaConsulta(db, r.fila);
    usable = await consultaVigenteDeEquifax(db, s.client_id);
  }
  if (!usable || usable.consultaId !== r.fila.id) {
    // Rehacerla no alcanzó (el crudo no se pudo interpretar, o la respuesta no era de
    // la persona): reintentar no cambia nada, y la consulta ya está pagada.
    return { ok: false, fallo: { ...falloDeUnPaso("buro", 500), detalle: "La consulta de Equifax de esta persona está guardada pero no se pudo leer. Reintentar no cambia nada: hay que revisarla con administración.", codigo: "buro_no_disponible", esperarMs: 0, noReintentar: true } };
  }
  return {
    ok: true,
    cambios: { consulta_equifax_id: usable.consultaId },
    detalle: r.resultado === "reutilizada" ? "Se reutilizó la consulta de Equifax vigente." : "Se consultó Equifax (la consulta se cobró).",
    resultado: { buro: { consultaId: usable.consultaId, consultadoEl: usable.consultadoEl, reutilizada: r.resultado === "reutilizada" } },
  };
}

async function pasoAnalisis(s: Fila, ctx: ContextoDeLosPasos): Promise<ResultadoDelPaso> {
  if (!s.client_profile_id) return fallo("Falta el perfil: el modelo analiza lo que dejó el paso anterior.", "error_interno");
  const analisis = await analizarPersona({
    db: ctx.db,
    cedula: s.identificacion,
    profileId: s.client_profile_id,
    actorId: ctx.actorId,
    contextoExtra: { origen: "api", solicitudId: s.id },
  });
  const resumen = resumenDelAnalisis(analisis);
  return {
    ok: true,
    cambios: { analysis_result_id: analisis.id },
    detalle: resumen.recomendacion ? "El modelo dio su recomendación." : "El modelo no dio una recomendación.",
    resultado: { analisis: resumen },
  };
}

// La cuota y la capacidad son cálculos: los usan la API y la pantalla.
export async function pasoCapacidad(s: Fila, db: Fila): Promise<ResultadoDelPaso> {
  const { data: perfil } = await db.from("client_profiles").select("standard_profile").eq("id", s.client_profile_id).maybeSingle();
  if (!perfil) return fallo("No se encontró el perfil de la persona.", "error_interno");
  let estructura: Record<string, unknown> | null = null;
  if (s.modalidad === "plus" && s.consulta_equifax_id) {
    const { data } = await db.from("consultas_equifax").select("estructura").eq("id", s.consulta_equifax_id).maybeSingle();
    estructura = data?.estructura ?? null;
  }
  // La consulta del buró ya se hizo (o se reutilizó) en el paso anterior: que no
  // se pueda leer es un problema del buró, no un cálculo mal pedido.
  if (s.modalidad === "plus" && !estructura) {
    return fallo("Falta la consulta de Equifax de la persona: Plus calcula la capacidad con las cuotas del buró.", "buro_no_disponible");
  }
  if (s.modalidad === "plus" && !elBuroTraeDetalle(estructura)) {
    return fallo("Equifax contestó sin reporte de crédito: Plus no puede calcular la capacidad sin las cuotas del buró.", "buro_no_disponible");
  }
  const condiciones ={ plazoMeses: s.plazo_meses, tasaNominalAnualPorcentaje: Number(s.tasa_nominal_anual), sistema: s.sistema, desgravamen: s.desgravamen };
  const simulacion = simularCredito({ ...condiciones, monto: Number(s.monto) });
  if (!simulacion.ok) return fallo(simulacion.errores.join(" "), "error_interno");
  const datosIess = datosDeCapacidad(perfil.standard_profile, estructura);
  const datos = conIngresoDeclarado(datosIess, s.ingreso_declarado === null || s.ingreso_declarado === undefined ? null : Number(s.ingreso_declarado));
  const cuotaNueva = simulacion.simulacion.cuotaPrimerMes;
  const capacidad = evaluarCapacidad({ ...datos, cuotaNueva });
  const { tabla: _tabla, ...resumenSimulacion } = simulacion.simulacion;
  return {
    ok: true,
    cambios: {},
    detalle: "Se calcularon la cuota y la capacidad de pago.",
    resultado: {
      capacidad: {
        simulacion: resumenSimulacion,
        capacidad,
        montoMaximo: montoMaximoParaCuota(capacidad.cuotaMaximaAdmisible, condiciones),
        capacidadSoloIess: datos !== datosIess ? evaluarCapacidad({ ...datosIess, cuotaNueva }) : null,
        datos,
      },
    },
  };
}
