// El predictor de ingresos como servicio propio: el ingreso que verifica un
// tercero y, para quien no lo tiene, el mínimo estimado (cada módulo con su propia
// puerta, negocio, 2026-10-17). Lo que se decide está en
// _shared/estimacion-de-ingreso.ts; acá se lee, se guarda y se contesta.
//
// Lee el último perfil de la persona. NO consulta a ninguna fuente ni al modelo de
// lenguaje, y no se cobra: si la persona no se consultó, lo dice. Tampoco hay un
// límite por sesión: una estimación tarda menos de un milisegundo.
//
// Exige sesión (analista o admin) antes de leer el cuerpo (regla 6).
//
// Body: { "identificacion": "...", "solicitudId": "<uuid, opcional>" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { armarEstimacion, crearCargadorDeModelo, decidirEstimacion, type FilaDeModelo, type ModeloVigente } from "../_shared/estimacion-de-ingreso.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Vive mientras viva la instancia: el modelo se baja una vez, no en cada pedido.
const cargarModelo = crearCargadorDeModelo(async (ruta) => {
  const { data, error } = await serviceClient.storage.from("modelos-de-ingreso").download(ruta);
  if (error || !data) throw new Error(`No se pudo bajar ${ruta}: ${error?.message ?? "sin contenido"}`);
  return new Uint8Array(await data.arrayBuffer());
});

Deno.serve(async (req) => {
  const corsHeaders = cabecerasCors(req);
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, "content-type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return responder({ error: "Sólo POST." }, 405);

  const actor = await identificarActor(
    req.headers.get("Authorization"),
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    serviceClient,
    createClient,
  );
  const rechazo = exigirRol(actor, ["analista", "admin"], corsHeaders);
  if (rechazo) return rechazo;

  let cuerpo: Record<string, unknown>;
  try {
    cuerpo = await req.json();
  } catch {
    return responder({ error: "El cuerpo tiene que ser JSON." }, 400);
  }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) return responder({ error: "El cuerpo tiene que ser un objeto." }, 400);

  const sinEsquema = await exigirEsquema(serviceClient, corsHeaders);
  if (sinEsquema) return sinEsquema;

  if (typeof cuerpo.identificacion !== "string") return responder({ error: "Falta la identificación de la persona." }, 400);
  const ident = clasificarIdentificacion(cuerpo.identificacion);
  if (!ident.consultable) return responder({ error: ident.mensaje }, 400);
  const cedula = ident.cedula as string;
  const solicitudId = cuerpo.solicitudId ?? null;
  if (solicitudId !== null && (typeof solicitudId !== "string" || !UUID.test(solicitudId))) return responder({ error: "solicitudId no es un identificador válido." }, 400);

  const { data: cliente, error: errorCliente } = await serviceClient.from("clients").select("id").eq("cedula", cedula).maybeSingle();
  if (errorCliente) return responder({ error: "No se pudo leer la persona." }, 500);
  if (!cliente) return responder({ error: "La persona todavía no se consultó: primero hay que consultarla." }, 404);

  if (solicitudId !== null) {
    // Con el id de la solicitud de otra persona, la estimación quedaría colgada de ella.
    const { data: solicitud, error } = await serviceClient.from("solicitudes").select("client_id, identificacion").eq("id", solicitudId).maybeSingle();
    if (error) return responder({ error: "No se pudo leer la solicitud." }, 500);
    if (!solicitud || (solicitud.client_id !== cliente.id && solicitud.identificacion !== cedula)) return responder({ error: "La solicitud no existe o es de otra persona." }, 404);
  }

  const { data: perfil, error: errorPerfil } = await serviceClient
    .from("client_profiles")
    .select("id, created_at, standard_profile")
    .eq("client_id", cliente.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errorPerfil) return responder({ error: "No se pudo leer el perfil." }, 500);
  if (!perfil) return responder({ error: "La persona no tiene un perfil guardado: primero hay que consultarla." }, 404);

  const perfilEstandar = perfil.standard_profile as Record<string, unknown>;
  const decision = decidirEstimacion(perfilEstandar);

  // A un dependiente no se le evalúa el modelo: sin modelo publicado se le contesta igual.
  let vigente: ModeloVigente | null = null;
  if (decision.nivel === 1) {
    const { data: fila, error } = await serviceClient
      .from("modelos_de_ingreso")
      .select("id, version, nivel, huella_sha256, ruta_archivo, poblacion, calibracion")
      .eq("nivel", 1)
      .eq("estado", "vigente")
      .maybeSingle();
    if (error) return responder({ error: "No se pudo leer el modelo de ingresos." }, 500);
    if (!fila) {
      console.error("estimar-ingreso: no hay un modelo vigente del nivel 1. Publicarlo con scripts/publicar-modelo-de-ingreso.mjs.");
      return responder({ error: "El predictor de ingresos todavía no tiene un modelo publicado." }, 503);
    }
    try {
      vigente = await cargarModelo(fila as FilaDeModelo);
    } catch (e) {
      console.error("estimar-ingreso: no se pudo cargar el modelo:", e instanceof Error ? e.message : e);
      return responder({ error: "No se pudo cargar el modelo de ingresos." }, 503);
    }
  }

  let estimacion: ReturnType<typeof armarEstimacion>;
  try {
    estimacion = armarEstimacion({ id: crypto.randomUUID(), perfil: perfilEstandar, decision, consultadoEl: perfil.created_at, ahora: new Date(), vigente });
  } catch (e) {
    console.error("estimar-ingreso: no se pudo evaluar el modelo:", e instanceof Error ? e.message : e);
    return responder({ error: "No se pudo calcular la estimación." }, 500);
  }

  // Lo que no quedó guardado no se contesta: la vigilancia del modelo mide estas filas.
  if (estimacion.fila) {
    const { error } = await serviceClient.from("estimaciones_de_ingreso").insert({
      ...estimacion.fila,
      creada_por: actor!.id,
      client_id: cliente.id,
      client_profile_id: perfil.id,
      solicitud_id: solicitudId,
    });
    if (error) {
      console.error("estimar-ingreso: no se pudo guardar:", error.message);
      return responder({ error: "No se pudo guardar la estimación." }, 500);
    }
  }

  await serviceClient.from("audit_log").insert({
    actor: actor!.id,
    action: "ingreso.estimar",
    client_id: cliente.id,
    meta: { client_profile_id: perfil.id, estimacion_id: estimacion.fila?.id ?? null, nivel: decision.nivel, motivo: decision.motivo },
  });

  return responder(estimacion.respuesta);
});
