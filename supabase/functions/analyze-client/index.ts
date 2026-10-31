// Orquestador principal: ingesta Proveedor_Info_1 -> Estructura Estandarizada ->
// controles de bloqueo duros -> scoring aproximado por LLM -> persiste
// en Supabase. Este mismo endpoint HTTP sirve tanto a la interfaz web
// (via supabase.functions.invoke, con el JWT del analista) como a
// sistemas externos que quieran consumir el análisis vía API (con su
// propio JWT/API key de servicio).
//
// Body esperado: { "cedula": "0102030405", "profileId"?: "uuid" }
//
// profileId (opcional, usado por "Análisis con IA" en la web): id de un
// client_profiles ya generado por structure-client. Si viene, se
// reutiliza ese standard_profile/control_bloqueo tal cual — SIN volver
// a consultar Proveedor_Info_1 — para que el análisis explique exactamente lo
// que el analista vio en Perfil del Cliente (ventana de reutilización:
// 7 días, decisión de la UI, no de este endpoint). Si no viene (uso
// típico de sistemas externos vía API), se consulta Proveedor_Info_1 en fresco
// y el perfil resultante SE GUARDA igual — el análisis siempre queda
// atado a la data estructurada que lo produjo (ver 032).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { analizarPersona, ConsultaIncompleta } from "../_shared/analisis-de-la-persona.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Cliente con privilegios de servicio: es el único que puede escribir en
// ingestion_runs / analysis_results / audit_log (ver RLS en schema.sql).
// La service role key vive solo en las secrets de esta función, nunca
// llega al navegador.
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const corsHeaders = cabecerasCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Identificar al actor y EXIGIR rol antes de seguir, y antes de mirar
  // el cuerpo: quien no tiene permiso no recibe ni la validación de la
  // cédula. Antes esto era "solo para fines de auditoría" y la función
  // continuaba aunque el JWT no resolviera a ningún usuario. Analizar
  // dispara consultas pagas a los burós sobre una cédula concreta: no
  // puede quedar disponible para cualquiera que traiga una sesión válida.
  const actor = await identificarActor(
    req.headers.get("Authorization"),
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    serviceClient,
    createClient,
  );
  const rechazo = exigirRol(actor, ["analista", "admin"], corsHeaders);
  if (rechazo) return rechazo;
  const actorId: string | null = actor!.id;
  // La base tiene que estar al día con lo que este código necesita (ESQUEMA_MINIMO en _shared/version-esquema.ts).
  const sinEsquema = await exigirEsquema(serviceClient, corsHeaders);
  if (sinEsquema) return sinEsquema;

  let cedula: string | undefined;
  let profileId: string | undefined;
  // Marca las corridas de verificación del equipo técnico para que su
  // consumo quede identificado en vez de borrarse (ver llm_llamadas).
  let esPrueba = false;
  try {
    const body = await req.json();
    cedula = body?.cedula;
    profileId = body?.profileId;
    esPrueba = body?.esPrueba === true;
  } catch {
    // body inválido, se maneja abajo
  }
  if (!cedula || typeof cedula !== "string") {
    return new Response(JSON.stringify({ error: "Falta 'cedula' en el body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Mismo criterio que structure-client: un RUC de persona natural se
  // convierte en su cédula, y lo que no es una persona natural se
  // rechaza antes de gastar una consulta a la fuente y una llamada al
  // modelo. Acá importa el doble, porque este endpoint también cuesta
  // dinero.
  const ident = clasificarIdentificacion(cedula);
  if (!ident.consultable) {
    return new Response(JSON.stringify({ error: ident.mensaje, tipoIdentificacion: ident.tipo, ingresado: ident.ingresado }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  cedula = ident.cedula as string;

  try {
    // Todo el análisis (cliente, corrida de ingesta, perfil, buró, reutilización,
    // modelo, consumo y auditoría) vive en _shared/analisis-de-la-persona.ts,
    // para que el trabajador de la API lo llame sin pasar por HTTP.
    const analysis = await analizarPersona({
      db: serviceClient,
      cedula,
      profileId,
      actorId,
      esPrueba,
    });

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    if (err instanceof ConsultaIncompleta) {
      return new Response(JSON.stringify({ error: err.message, motivo: "consulta_incompleta" }), {
        status: 409,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const mensaje =
      err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err);
    return new Response(JSON.stringify({ error: mensaje }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
