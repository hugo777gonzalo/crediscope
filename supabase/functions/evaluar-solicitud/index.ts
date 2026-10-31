// Evaluar una solicitud de crédito, por pasos (133; decisiones del negocio
// del 2026-10-17: el orquestador vive en el servidor y sirve igual a la
// pantalla y a la API).
//
// Por qué por pasos: consultar Proveedor_Info_1 (hasta ~2 min) y el modelo (hasta
// ~2 min) juntos pasan los 150 s que una función puede correr seguidos. Cada
// llamada a `avanzar` corre UN paso y lo anota en la solicitud; quien llama
// (la pantalla, o la IFI por la API) vuelve a llamar hasta que no quede
// ninguno.
//
// Los pasos usan los módulos que ya existen, cada uno por su propia puerta:
//   - perfil:    reutiliza el último perfil si tiene menos de 7 días; si no,
//                llama a `structure-client` (consulta Proveedor_Info_1).
//   - buro:      reutiliza la consulta de Equifax vigente; si no hay, llama a
//                `consultar-equifax`, que SE COBRA y es sólo de admin (negocio,
//                2026-10-17). Quien no es admin recibe el paso fallido con el
//                motivo, nunca una consulta pagada a su nombre.
//   - analisis:  llama a `analyze-client` con el perfil del paso anterior.
//   - capacidad: la cuota (simularCredito) y la capacidad (evaluarCapacidad),
//                acá mismo: son cálculos.
// Las funciones se llaman con la sesión de quien pidió, así cada una exige su
// rol y la auditoría queda a su nombre. Lo que contestan al fallar no se copia
// en la solicitud (falloDeUnPaso, en modalidades.ts), y un paso que pudo dejar
// algo en vuelo -- sobre todo una consulta a Equifax, que se cobra -- no se
// deja reintentar hasta que esa función terminó seguro.
//
// Acciones (body):
//   { "accion": "crear", "cedula": "...", "modalidad": "pro",
//     "solicitudDeCredito": { "monto": 5000, "plazoMeses": 36, "tasaNominalAnualPorcentaje": 15,
//                             "ingresoDeclarado": 1800 },
//     "autorizacion": {...}, "referencia": "...", "operador": {...},
//     "prioridad": "interactiva", "reemplazaA": "<uuid>" }
// Los nombres son los de PedidoDeEvaluacion en api/openapi.yaml. Autorización,
// referencia, operador, prioridad y reemplazaA son opcionales acá (la pantalla
// del analista no los manda) y los guarda la solicitud (135); los exige la
// puerta de la API de la Fase 1. De la autorización se guarda la huella del
// documento, nunca el documento (datos-de-la-solicitud.ts).
//   { "accion": "avanzar", "id": "<uuid>" }
//   { "accion": "reintentar", "id": "<uuid>" }
//   { "accion": "decidir", "id": "<uuid>", "decision": "aprobado", "motivo": "..." }
// Todas devuelven la solicitud entera.
//
// `decidir` anota lo que decidió la institución (134; negocio, 2026-10-18: lo
// marca el analista, con motivo). Aprobar o rechazar, con la evaluación
// terminada; desistir, en cualquier momento, y entonces la evaluación no sigue.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { elPerfilSePuedeAnalizar, porQueNoSePuedeAnalizar } from "../_shared/calidad-de-la-consulta.ts";
import { validarDecision } from "../_shared/estado-de-la-persona.ts";
import { buroDeLaBase, consultaVigenteDeEquifax } from "../_shared/buro-de-la-institucion.ts";
import { pasoCapacidad } from "../_shared/pasos-de-evaluacion.ts";
import {
  type CodigoDeFallo,
  falloDeUnPaso,
  marcarFallido,
  marcarPaso,
  MODALIDADES,
  MODALIDADES_VERSION,
  type Paso,
  pasoEnCurso,
  PASO_CAIDO_MS,
  pasosIniciales,
  type RegistroDePaso,
  reintentarPasos,
  resumenDelAnalisis,
  siguientePaso,
  todosHechos,
  validarPedidoDeSolicitud,
} from "../_shared/modalidades.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// La misma ventana con la que «Análisis con IA» reutiliza un perfil.
const VIGENCIA_DEL_PERFIL_DIAS = 7;
// Un paso que llama a otra función le deja margen a la propia para anotar.
const PLAZO_DE_UNA_FUNCION_MS = 130_000;

const BASE_LEGAL_EQUIFAX =
  "Contrato con la institución: autorización del titular garantizada por la IFI; consulta de buró Equifax para calificación crediticia, pedida desde una solicitud de crédito (flujo Plus)";

type Fila = Record<string, any>;

// `esperarMs`: cuánto esperar antes de dejar reintentar el paso (modalidades.ts).
// `codigo`: el Fallo.codigo de la especificación de la API; el que no se
// aclara es un error nuestro.
class PasoFallido extends Error {
  constructor(
    mensaje: string,
    readonly esperarMs = 0,
    readonly http: number | null = null,
    readonly codigo: CodigoDeFallo = "error_interno",
  ) {
    super(mensaje);
  }
}

// La respuesta de la otra función no se copia en la solicitud, que lee todo
// analista: su `error` puede traer el mensaje de Proveedor_Info_1, de Equifax, del
// modelo o de la base. Se leen el estado y, de consultar-equifax, el motivo.
function fallo(paso: Paso, r: { status: number; datos: Fila | null }): PasoFallido {
  const { detalle, esperarMs, codigo } = falloDeUnPaso(paso, r.status, r.datos?.motivo ?? null);
  return new PasoFallido(detalle, esperarMs, r.status, codigo);
}

async function llamarFuncion(nombre: string, cuerpo: unknown, autorizacion: string): Promise<{ status: number; datos: Fila | null }> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${nombre}`, {
      method: "POST",
      headers: { Authorization: autorizacion, apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(PLAZO_DE_UNA_FUNCION_MS),
    });
    const datos = await r.json().catch(() => null);
    return { status: r.status, datos };
  } catch {
    return { status: 0, datos: null };
  }
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-EC", { timeZone: "America/Guayaquil" });

async function correrPaso(paso: Paso, s: Fila, autorizacion: string): Promise<{ cambios: Fila; detalle: string; resultado: Fila }> {
  if (paso === "perfil") {
    let clientId = s.client_id as string | null;
    if (!clientId) {
      const { data } = await serviceClient.from("clients").select("id").eq("cedula", s.identificacion).maybeSingle();
      clientId = data?.id ?? null;
    }
    if (clientId) {
      const { data: ultimo } = await serviceClient
        .from("client_profiles")
        .select("id, created_at, estado_por_fuente, standard_profile->fuentesIngreso->segmento, standard_profile->fuentesIngreso->pisoIngresoMensualReportado")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      // Uno que quedó incompleto no se reutiliza: reintentar leería siempre ese
      // mismo perfil y nunca volvería a preguntarle a la fuente.
      if (ultimo && elPerfilSePuedeAnalizar(ultimo.estado_por_fuente) && Date.now() - Date.parse(ultimo.created_at) < VIGENCIA_DEL_PERFIL_DIAS * 86_400_000) {
        return {
          cambios: { client_id: clientId, client_profile_id: ultimo.id },
          detalle: `Se reutilizó el perfil del ${fecha(ultimo.created_at)}.`,
          resultado: { perfil: { perfilId: ultimo.id, perfilDel: ultimo.created_at, reutilizado: true, segmento: ultimo.segmento ?? null, ingresoReportadoIess: ultimo.pisoIngresoMensualReportado ?? null } },
        };
      }
    }
    const r = await llamarFuncion("structure-client", { cedula: s.identificacion }, autorizacion);
    if (r.status !== 200 || !r.datos?.id) throw fallo("perfil", r);
    // Acá y no en el paso del análisis: en Plus el buró va en el medio y se cobra.
    if (!elPerfilSePuedeAnalizar(r.datos.estado_por_fuente)) {
      throw new PasoFallido(porQueNoSePuedeAnalizar(r.datos.estado_por_fuente), 0, null, "fuentes_no_disponibles");
    }
    const f = r.datos.standard_profile?.fuentesIngreso ?? {};
    return {
      cambios: { client_id: r.datos.client_id, client_profile_id: r.datos.id },
      detalle: "Se consultó a la persona en Proveedor_Info_1.",
      resultado: { perfil: { perfilId: r.datos.id, perfilDel: r.datos.created_at, reutilizado: false, segmento: f.segmento ?? null, ingresoReportadoIess: f.pisoIngresoMensualReportado ?? null } },
    };
  }

  if (paso === "buro") {
    const vigente = await consultaVigenteDeEquifax(serviceClient, s.client_id);
    if (vigente) {
      return {
        cambios: { consulta_equifax_id: vigente.consultaId },
        detalle: `Se reutilizó la consulta de Equifax del ${fecha(vigente.consultadoEl)}, vigente hasta el 17.`,
        resultado: { buro: { consultaId: vigente.consultaId, consultadoEl: vigente.consultadoEl, reutilizada: true } },
      };
    }
    // Otra solicitud de la misma persona consultando Equifax ahora mismo: la
    // reutilización de consultar-equifax mira lo guardado, y lo que está en
    // vuelo todavía no lo está. Dos solicitudes Plus a la vez pagaban dos veces.
    const { data: otras, error: errorOtras } = await serviceClient
      .from("solicitudes")
      .select("id, pasos")
      .eq("identificacion", s.identificacion)
      .eq("estado", "en_evaluacion")
      .neq("id", s.id);
    if (errorOtras) throw new Error("no se pudieron leer las otras solicitudes");
    if ((otras ?? []).some((o: Fila) => pasoEnCurso(o.pasos, "buro"))) {
      throw new PasoFallido("Otra solicitud de esta persona está consultando Equifax en este momento. Se puede reintentar en unos minutos: si esa consulta quedó guardada, se reutiliza.", PASO_CAIDO_MS, null, "buro_no_disponible");
    }
    const r = await llamarFuncion("consultar-equifax", { identificacion: s.identificacion, baseLegal: BASE_LEGAL_EQUIFAX }, autorizacion);
    if (r.status !== 200 || !r.datos?.id) throw fallo("buro", r);
    // La misma regla que el camino de arriba y que el modelo. consultar-equifax
    // reutiliza la última consulta del mes aunque no tenga su estructura (las
    // tablas pueden fallar después de pagar), y sin estructura la capacidad de
    // Plus caía sin avisar a las cuotas de Proveedor_Info_1.
    const usable = await consultaVigenteDeEquifax(serviceClient, s.client_id);
    if (!usable || usable.consultaId !== r.datos.id) {
      throw new PasoFallido("La consulta de Equifax quedó guardada pero todavía no se puede leer (falta calcular su estructura). Se rehace desde lo guardado, sin volver a pagar; reintentar tampoco la cobra otra vez.", 0, null, "buro_no_disponible");
    }
    return {
      cambios: { consulta_equifax_id: usable.consultaId },
      detalle: r.datos.reutilizada ? "Se reutilizó la consulta de Equifax vigente." : "Se consultó Equifax (la consulta se cobró).",
      resultado: { buro: { consultaId: usable.consultaId, consultadoEl: usable.consultadoEl, reutilizada: Boolean(r.datos.reutilizada) } },
    };
  }

  if (paso === "analisis") {
    const r = await llamarFuncion("analyze-client", { cedula: s.identificacion, profileId: s.client_profile_id }, autorizacion);
    if (r.status !== 200 || !r.datos?.id) throw fallo("analisis", r);
    const resumen = resumenDelAnalisis(r.datos);
    return {
      cambios: { analysis_result_id: r.datos.id },
      detalle: resumen.recomendacion ? "El modelo dio su recomendación." : "El modelo no dio una recomendación.",
      resultado: { analisis: resumen },
    };
  }

  // capacidad: el mismo cálculo que corre el trabajador de la API
  // (pasos-de-evaluacion.ts), una sola implementación.
  const r = await pasoCapacidad(s, serviceClient);
  if (!r.ok) throw new PasoFallido(r.fallo.detalle, r.fallo.esperarMs, null, r.fallo.codigo);
  return { cambios: r.cambios, detalle: r.detalle, resultado: r.resultado };
}

Deno.serve(async (req) => {
  const corsHeaders = cabecerasCors(req);
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, "content-type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responder({ error: "Sólo POST." }, 405);

  const autorizacion = req.headers.get("Authorization") ?? "";
  const actor = await identificarActor(autorizacion, SUPABASE_URL, SUPABASE_ANON_KEY, serviceClient, createClient);
  const rechazo = exigirRol(actor, ["analista", "admin"], corsHeaders);
  if (rechazo) return rechazo;

  const sinEsquema = await exigirEsquema(serviceClient, corsHeaders);
  if (sinEsquema) return sinEsquema;

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "El cuerpo tiene que ser JSON." }, 400);
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return responder({ error: "El cuerpo tiene que ser un objeto." }, 400);

  if (cuerpo.accion === "crear") {
    const ident = clasificarIdentificacion(String(cuerpo.cedula ?? cuerpo.identificacion ?? ""));
    if (!ident.consultable) return responder({ error: ident.mensaje }, 400);
    const validado = validarPedidoDeSolicitud(cuerpo);
    if (!validado.ok) return responder({ error: "La solicitud no es válida.", errores: validado.errores }, 400);
    const { modalidad, condiciones, ingresoDeclarado, datos } = validado.pedido;
    if (modalidad === "plus" && (await buroDeLaBase(serviceClient)) !== "equifax") {
      return responder({ error: "La modalidad Plus usa Equifax, y el buró de esta institución no es Equifax (Configuración › Buró)." }, 400);
    }
    const cedula = ident.cedula as string;
    // Reemplazar es pedir de nuevo la evaluación de la misma persona. Una id que
    // no existe o es de otra persona se rechaza igual, sin decir cuál de las dos:
    // no se confirma que la solicitud de otra persona existe.
    if (datos.reemplazaA) {
      const { data: anterior, error: errorAnterior } = await serviceClient.from("solicitudes").select("identificacion").eq("id", datos.reemplazaA).maybeSingle();
      if (errorAnterior) return responder({ error: "No se pudo leer la solicitud que se reemplaza." }, 500);
      if (!anterior || anterior.identificacion !== cedula) {
        return responder({ error: "La solicitud no es válida.", errores: ["reemplazaA tiene que ser una solicitud de la misma persona."] }, 400);
      }
    }
    const { data: cliente } = await serviceClient.from("clients").select("id").eq("cedula", cedula).maybeSingle();
    const { data: creada, error } = await serviceClient
      .from("solicitudes")
      .insert({
        identificacion: cedula,
        client_id: cliente?.id ?? null,
        creada_por: actor!.id,
        modalidad,
        monto: condiciones?.monto ?? null,
        plazo_meses: condiciones?.plazoMeses ?? null,
        tasa_nominal_anual: condiciones?.tasaNominalAnualPorcentaje ?? null,
        sistema: condiciones?.sistema ?? null,
        desgravamen: condiciones?.desgravamen ?? null,
        ingreso_declarado: ingresoDeclarado,
        autorizacion_id: datos.autorizacion?.id ?? null,
        autorizacion_otorgada_el: datos.autorizacion?.otorgadaEl ?? null,
        autorizacion_vigente_hasta: datos.autorizacion?.vigenteHasta ?? null,
        autorizacion_canal: datos.autorizacion?.canal ?? null,
        autorizacion_finalidad: datos.autorizacion?.finalidad ?? null,
        autorizacion_huella: datos.autorizacion?.huellaDelDocumento ?? null,
        referencia: datos.referencia,
        operador_id: datos.operador?.id ?? null,
        operador_agencia: datos.operador?.agencia ?? null,
        prioridad: datos.prioridad,
        reemplaza_a: datos.reemplazaA,
        pasos: pasosIniciales(modalidad),
        resultado: { version: MODALIDADES_VERSION },
      })
      .select("*")
      .single();
    // La referencia es única en la base (una base por institución): repetirla es
    // un conflicto, no un error nuestro. La IFI que reintenta con la misma
    // referencia lo sabe por acá; devolverle la solicitud ya creada (idempotencia)
    // es de la puerta de la API.
    if (error?.code === "23505" && datos.referencia) return responder({ error: "Ya existe una solicitud con esa referencia." }, 409);
    if (error || !creada) return responder({ error: "No se pudo guardar la solicitud." }, 500);
    await serviceClient.from("audit_log").insert({
      actor: actor!.id,
      action: "solicitud.crear",
      client_id: cliente?.id ?? null,
      // El operador y la autorización responden «¿quién vio mis datos y con qué
      // permiso?»; la huella del documento no se copia acá.
      meta: {
        solicitud_id: creada.id,
        modalidad,
        ...(datos.operador ? { operador_id: datos.operador.id } : {}),
        ...(datos.autorizacion ? { autorizacion_id: datos.autorizacion.id } : {}),
        ...(datos.referencia ? { referencia: datos.referencia } : {}),
      },
    });
    return responder(creada);
  }

  if (!["avanzar", "reintentar", "decidir"].includes(cuerpo.accion as string)) return responder({ error: "La acción es «crear», «avanzar», «reintentar» o «decidir»." }, 400);
  if (typeof cuerpo.id !== "string") return responder({ error: "Falta el id de la solicitud." }, 400);

  const { data: s } = await serviceClient.from("solicitudes").select("*").eq("id", cuerpo.id).maybeSingle();
  if (!s) return responder({ error: "No existe esa solicitud." }, 404);

  if (cuerpo.accion === "decidir") {
    const errores = validarDecision(cuerpo.decision, cuerpo.motivo, s.estado);
    if (errores.length) return responder({ error: "La decisión no es válida.", errores }, 400);
    // La base vuelve a mirar el estado: entre la lectura y acá la evaluación pudo fallar.
    const { data, error } = await serviceClient.rpc("decidir_solicitud", {
      p_id: s.id,
      p_decision: cuerpo.decision,
      p_motivo: cuerpo.motivo,
      p_actor: actor!.id,
    });
    const decidida = Array.isArray(data) ? data[0] : null;
    if (error || !decidida) return responder({ error: "No se pudo anotar la decisión. Volvé a abrir la solicitud y probá de nuevo." }, 409);
    // El motivo no va a la auditoría: es texto libre y puede traer datos de la persona.
    await serviceClient.from("audit_log").insert({
      actor: actor!.id,
      action: "solicitud.decidir",
      client_id: decidida.client_id ?? null,
      meta: { solicitud_id: s.id, decision: cuerpo.decision, anterior: s.decision ?? null },
    });
    return responder(decidida);
  }

  // Una evaluación de la API la hace avanzar el trabajador, con sus reintentos y su
  // plazo (139). La pantalla sólo la lee y anota la decisión (arriba): si tomara
  // pasos, un analista que no es admin fallaría el del buró, y reabrir una
  // `fallida` cambiaría un estado que para la API es final.
  if (s.origen === "api") return responder({ error: "Esta evaluación la hace avanzar el trabajador de la API: acá sólo se lee y se anota la decisión." }, 409);

  // Quien desistió no sigue: los pasos que faltan pueden consultar fuentes o cobrarse.
  if (s.decision === "desistido") return responder(s);

  if (cuerpo.accion === "reintentar") {
    if (s.estado !== "fallida") return responder(s);
    const pasos = reintentarPasos(s.pasos);
    // Un paso que pudo dejar algo en vuelo todavía espera: su detalle lo dice.
    if (pasos.some((p) => p.estado === "fallido")) return responder(s);
    const { data } = await serviceClient
      .from("solicitudes")
      .update({ pasos, estado: "en_evaluacion", actualizada_el: new Date().toISOString() })
      .eq("id", s.id)
      .eq("actualizada_el", s.actualizada_el)
      .select("*");
    return responder(data?.[0] ?? s);
  }

  const pasos = s.pasos as RegistroDePaso[];
  const paso = siguientePaso(pasos);
  if (!paso) {
    if (s.estado === "en_evaluacion" && todosHechos(pasos)) {
      const { data } = await serviceClient.from("solicitudes").update({ estado: "evaluada", evaluada_el: new Date().toISOString() }).eq("id", s.id).select("*").single();
      return responder(data ?? s);
    }
    return responder(s);
  }

  // Tomar el paso: sólo si nadie cambió la solicitud desde que se leyó. Se
  // usan las filas que devolvió la actualización (CLAUDE.md): con dos
  // pestañas abiertas, un paso que se cobra (Equifax) se pagaba dos veces.
  const { data: tomadas } = await serviceClient
    .from("solicitudes")
    .update({ pasos: marcarPaso(pasos, paso, "en_curso"), actualizada_el: new Date().toISOString() })
    .eq("id", s.id)
    .eq("actualizada_el", s.actualizada_el)
    .select("*");
  const tomada = tomadas?.[0];
  if (!tomada) {
    const { data: actual } = await serviceClient.from("solicitudes").select("*").eq("id", s.id).maybeSingle();
    return responder(actual ?? s);
  }

  try {
    const { cambios, detalle, resultado } = await correrPaso(paso, tomada, autorizacion);
    const nuevosPasos = marcarPaso(tomada.pasos, paso, "hecho", detalle);
    const { data } = await serviceClient
      .from("solicitudes")
      .update({
        ...cambios,
        pasos: nuevosPasos,
        resultado: { ...(tomada.resultado ?? {}), ...resultado },
        estado: todosHechos(nuevosPasos) ? "evaluada" : "en_evaluacion",
        evaluada_el: todosHechos(nuevosPasos) ? new Date().toISOString() : (tomada.evaluada_el ?? null),
        actualizada_el: new Date().toISOString(),
      })
      .eq("id", s.id)
      .select("*")
      .single();
    // Lo que hizo el paso quedó guardado por su función: sin la anotación, el
    // paso sigue en curso, se da por caído a los 3 minutos y se retoma
    // reutilizando lo guardado.
    if (!data) return responder({ error: "El paso terminó pero no se pudo anotar en la solicitud. Se retoma solo en unos minutos." }, 500);
    if (todosHechos(nuevosPasos)) {
      await serviceClient.from("audit_log").insert({
        actor: actor!.id,
        action: "solicitud.evaluada",
        client_id: data?.client_id ?? null,
        meta: { solicitud_id: s.id, modalidad: s.modalidad, pasos: MODALIDADES[s.modalidad as keyof typeof MODALIDADES].pasos },
      });
    }
    return responder(data);
  } catch (err) {
    // Sin el mensaje crudo de un tercero: un PasoFallido trae uno nuestro.
    const propio = err instanceof PasoFallido;
    const detalle = propio ? err.message : "Algo falló en este paso.";
    // Un error nuestro a mitad del paso del buró puede llegar después de pagar.
    const esperarMs = propio ? err.esperarMs : paso === "buro" ? PASO_CAIDO_MS : 0;
    const codigo: CodigoDeFallo = propio ? err.codigo : "error_interno";
    if (!propio) console.error("evaluar-solicitud:", paso, (err as Error)?.name);
    const { data } = await serviceClient
      .from("solicitudes")
      .update({ pasos: marcarFallido(tomada.pasos, paso, detalle, codigo, esperarMs), estado: "fallida", actualizada_el: new Date().toISOString() })
      .eq("id", s.id)
      .select("*")
      .single();
    // Quién corrió el paso que falló: el del buró pudo cobrarse.
    await serviceClient.from("audit_log").insert({
      actor: actor!.id,
      action: "solicitud.paso_fallido",
      client_id: tomada.client_id ?? null,
      meta: { solicitud_id: s.id, paso, codigo, http: propio ? err.http : null },
    });
    return data ? responder(data) : responder({ error: "El paso falló y no se pudo anotar en la solicitud. Se retoma solo en unos minutos." }, 500);
  }
});
