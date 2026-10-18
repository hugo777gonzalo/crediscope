// Evaluar una solicitud de crédito, por pasos (133; decisiones del negocio
// del 2026-10-17: el orquestador vive en el servidor y sirve igual a la
// pantalla y a la API).
//
// Por qué por pasos: consultar Novadata (hasta ~2 min) y el modelo (hasta
// ~2 min) juntos pasan los 150 s que una función puede correr seguidos. Cada
// llamada a `avanzar` corre UN paso y lo anota en la solicitud; quien llama
// (la pantalla, o la IFI por la API) vuelve a llamar hasta que no quede
// ninguno.
//
// Los pasos usan los módulos que ya existen, cada uno por su propia puerta:
//   - perfil:    reutiliza el último perfil si tiene menos de 7 días; si no,
//                llama a `structure-client` (consulta Novadata).
//   - buro:      reutiliza la consulta de Equifax vigente; si no hay, llama a
//                `consultar-equifax`, que SE COBRA y es sólo de admin (negocio,
//                2026-10-17). Quien no es admin recibe el paso fallido con el
//                motivo, nunca una consulta pagada a su nombre.
//   - analisis:  llama a `analyze-client` con el perfil del paso anterior.
//   - capacidad: la cuota (simularCredito) y la capacidad (evaluarCapacidad),
//                acá mismo: son cálculos.
// Las funciones se llaman con la sesión de quien pidió, así cada una exige su
// rol y la auditoría queda a su nombre.
//
// Acciones (body):
//   { "accion": "crear", "cedula": "...", "modalidad": "pro",
//     "solicitud": { "monto": 5000, "plazoMeses": 36, "tasaNominalAnualPorcentaje": 15 },
//     "ingresoDeclarado": 1800 }
//   { "accion": "avanzar", "id": "<uuid>" }
//   { "accion": "reintentar", "id": "<uuid>" }
// Todas devuelven la solicitud entera.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { buroDeLaBase, consultaVigenteDeEquifax } from "../_shared/buro-de-la-institucion.ts";
import { montoMaximoParaCuota, simularCredito } from "../_shared/simulador-credito.ts";
import { conIngresoDeclarado, datosDeCapacidad, evaluarCapacidad } from "../_shared/capacidad-de-pago.ts";
import {
  marcarPaso,
  MODALIDADES,
  MODALIDADES_VERSION,
  type Paso,
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

class PasoFallido extends Error {}

async function llamarFuncion(nombre: string, cuerpo: unknown, autorizacion: string) {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/${nombre}`, {
      method: "POST",
      headers: { Authorization: autorizacion, apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: AbortSignal.timeout(PLAZO_DE_UNA_FUNCION_MS),
    });
    const datos = await r.json().catch(() => null);
    return { status: r.status, datos };
  } catch (e) {
    const tiempo = (e as Error)?.name === "TimeoutError";
    return { status: 0, datos: { error: tiempo ? "La consulta tardó más de lo que una función puede esperar." : "No se pudo llamar al servicio." } };
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
        .select("id, created_at, standard_profile->fuentesIngreso->segmento, standard_profile->fuentesIngreso->pisoIngresoMensualReportado")
        .eq("client_id", clientId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultimo && Date.now() - Date.parse(ultimo.created_at) < VIGENCIA_DEL_PERFIL_DIAS * 86_400_000) {
        return {
          cambios: { client_id: clientId, client_profile_id: ultimo.id },
          detalle: `Se reutilizó el perfil del ${fecha(ultimo.created_at)}.`,
          resultado: { perfil: { perfilId: ultimo.id, perfilDel: ultimo.created_at, reutilizado: true, segmento: ultimo.segmento ?? null, ingresoReportadoIess: ultimo.pisoIngresoMensualReportado ?? null } },
        };
      }
    }
    const r = await llamarFuncion("structure-client", { cedula: s.identificacion }, autorizacion);
    if (r.status !== 200 || !r.datos?.id) throw new PasoFallido(r.datos?.error ?? "No se pudo consultar a la persona.");
    const f = r.datos.standard_profile?.fuentesIngreso ?? {};
    return {
      cambios: { client_id: r.datos.client_id, client_profile_id: r.datos.id },
      detalle: "Se consultó a la persona en Novadata.",
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
    const r = await llamarFuncion("consultar-equifax", { identificacion: s.identificacion, baseLegal: BASE_LEGAL_EQUIFAX }, autorizacion);
    if (r.status === 403) throw new PasoFallido("La persona no tiene una consulta de Equifax vigente, y consultar Equifax se cobra: lo hace un administrador. Pedile que la consulte o usá la modalidad Pro.");
    if (r.status !== 200 || !r.datos?.id) throw new PasoFallido(r.datos?.error ?? "No se pudo consultar Equifax.");
    return {
      cambios: { consulta_equifax_id: r.datos.id },
      detalle: r.datos.reutilizada ? "Se reutilizó la consulta de Equifax vigente." : "Se consultó Equifax (la consulta se cobró).",
      resultado: { buro: { consultaId: r.datos.id, consultadoEl: r.datos.consultada_el, reutilizada: Boolean(r.datos.reutilizada) } },
    };
  }

  if (paso === "analisis") {
    const r = await llamarFuncion("analyze-client", { cedula: s.identificacion, profileId: s.client_profile_id }, autorizacion);
    if (r.status !== 200 || !r.datos?.id) throw new PasoFallido(r.datos?.error ?? "El modelo no pudo analizar a la persona.");
    const resumen = resumenDelAnalisis(r.datos);
    return {
      cambios: { analysis_result_id: r.datos.id },
      detalle: resumen.recomendacion ? "El modelo dio su recomendación." : "El modelo no dio una recomendación.",
      resultado: { analisis: resumen },
    };
  }

  // capacidad
  const { data: perfil } = await serviceClient.from("client_profiles").select("standard_profile").eq("id", s.client_profile_id).maybeSingle();
  if (!perfil) throw new PasoFallido("No se encontró el perfil de la persona.");
  let estructura: Record<string, unknown> | null = null;
  if (s.modalidad === "plus" && s.consulta_equifax_id) {
    const { data } = await serviceClient.from("consultas_equifax").select("estructura").eq("id", s.consulta_equifax_id).maybeSingle();
    estructura = data?.estructura ?? null;
  }
  const condiciones = { plazoMeses: s.plazo_meses, tasaNominalAnualPorcentaje: Number(s.tasa_nominal_anual), sistema: s.sistema, desgravamen: s.desgravamen };
  const simulacion = simularCredito({ ...condiciones, monto: Number(s.monto) });
  if (!simulacion.ok) throw new PasoFallido(simulacion.errores.join(" "));
  const datosIess = datosDeCapacidad(perfil.standard_profile, estructura);
  const datos = conIngresoDeclarado(datosIess, s.ingreso_declarado === null ? null : Number(s.ingreso_declarado));
  const cuotaNueva = simulacion.simulacion.cuotaPrimerMes;
  const capacidad = evaluarCapacidad({ ...datos, cuotaNueva });
  const { tabla: _tabla, ...resumenSimulacion } = simulacion.simulacion;
  return {
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
    const { modalidad, condiciones, ingresoDeclarado } = validado.pedido;
    if (modalidad === "plus" && (await buroDeLaBase(serviceClient)) !== "equifax") {
      return responder({ error: "La modalidad Plus usa Equifax, y el buró de esta institución no es Equifax (Configuración › Buró)." }, 400);
    }
    const cedula = ident.cedula as string;
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
        pasos: pasosIniciales(modalidad),
        resultado: { version: MODALIDADES_VERSION },
      })
      .select("*")
      .single();
    if (error || !creada) return responder({ error: "No se pudo guardar la solicitud." }, 500);
    await serviceClient.from("audit_log").insert({
      actor: actor!.id,
      action: "solicitud.crear",
      client_id: cliente?.id ?? null,
      meta: { solicitud_id: creada.id, modalidad },
    });
    return responder(creada);
  }

  if (cuerpo.accion !== "avanzar" && cuerpo.accion !== "reintentar") return responder({ error: "La acción es «crear», «avanzar» o «reintentar»." }, 400);
  if (typeof cuerpo.id !== "string") return responder({ error: "Falta el id de la solicitud." }, 400);

  const { data: s } = await serviceClient.from("solicitudes").select("*").eq("id", cuerpo.id).maybeSingle();
  if (!s) return responder({ error: "No existe esa solicitud." }, 404);

  if (cuerpo.accion === "reintentar") {
    const { data } = await serviceClient
      .from("solicitudes")
      .update({ pasos: reintentarPasos(s.pasos), estado: "en_evaluacion", actualizada_el: new Date().toISOString() })
      .eq("id", s.id)
      .select("*")
      .single();
    return responder(data ?? s);
  }

  const pasos = s.pasos as RegistroDePaso[];
  const paso = siguientePaso(pasos);
  if (!paso) {
    if (s.estado === "en_evaluacion" && todosHechos(pasos)) {
      const { data } = await serviceClient.from("solicitudes").update({ estado: "evaluada" }).eq("id", s.id).select("*").single();
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
        actualizada_el: new Date().toISOString(),
      })
      .eq("id", s.id)
      .select("*")
      .single();
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
    const detalle = err instanceof PasoFallido ? err.message : "Algo falló en este paso.";
    if (!(err instanceof PasoFallido)) console.error("evaluar-solicitud:", paso, (err as Error)?.name);
    const { data } = await serviceClient
      .from("solicitudes")
      .update({ pasos: marcarPaso(tomada.pasos, paso, "fallido", detalle), estado: "fallida", actualizada_el: new Date().toISOString() })
      .eq("id", s.id)
      .select("*")
      .single();
    return responder(data);
  }
});
