// Orquestador del flujo SIN LLM:
//   Ingesta Novadata -> Estructura Estandarizada -> Persistencia -> Web.
// Usa las credenciales de servicio de Novadata (secrets de la función,
// no las escribe el usuario) y requiere un usuario autenticado de
// Supabase (igual que analyze-client) porque persiste en client_profiles.
//
// Body esperado: { "cedula": "0102030405" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { fetchAllBlocks, personaNoExiste } from "../_shared/novadata-client.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { buildStandardProfile, PROCESS_VERSION } from "../_shared/process.ts";
import { CORTE_IESS_CONOCIDO } from "../_shared/fuentes-ingreso.ts";
import { evaluarControlesBloqueo } from "../_shared/controles-bloqueo.ts";
import { loadDisabledResources, loadCorteIess } from "../_shared/runtime-config.ts";
import { estadoDeLosBloques, laConsultaSirve, porQueNoSirve } from "../_shared/calidad-de-la-consulta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let cedula: string | undefined;
  try {
    const body = await req.json();
    cedula = body?.cedula;
  } catch {
    // body inválido, se maneja abajo
  }
  if (!cedula || typeof cedula !== "string") {
    return new Response(JSON.stringify({ error: "Falta 'cedula' en el body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Qué escribieron realmente. La validación de la pantalla es una
  // cortesía; esta es la que vale, porque a este endpoint también lo
  // llaman sistemas de afuera. Un RUC de persona natural se convierte
  // en su cédula y se sigue; lo que no es una persona natural se
  // rechaza acá, antes de gastar una consulta.
  const ident = clasificarIdentificacion(cedula);
  if (!ident.consultable) {
    return new Response(JSON.stringify({ error: ident.mensaje, tipoIdentificacion: ident.tipo, ingresado: ident.ingresado }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  const ingresado = ident.ingresado;
  cedula = ident.cedula as string;

  let actorId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    actorId = data.user?.id ?? null;
  }

  try {
    // 1. Ingesta (con credenciales de servicio — sin pedirle nada al usuario)
    //    Recursos deshabilitados en novadata_resource_config se saltan
    //    (ver _shared/runtime-config.ts).
    const disabledResources = await loadDisabledResources(serviceClient);
    const inicioIngesta = Date.now();
    const raw = await fetchAllBlocks(cedula, undefined, disabledResources);

    // 2. ¿La fuente contestó algo?
    //
    // Esto va ANTES de mirar si la persona existe, porque si ningún eje
    // respondió tampoco sabemos si existe. El 2026-09-15 una caída de
    // una hora dejó 373 perfiles en blanco guardados como si fueran
    // personas sin historial, y clasificados como "informal o sin
    // actividad". Ver _shared/calidad-de-la-consulta.ts.
    //
    // 503 y no 500: el problema es de la fuente y es pasajero. El
    // trabajador de lotes usa ese código para reintentar en vez de dar
    // la cédula por perdida.
    const blockStatusPrevio = estadoDeLosBloques(raw);
    if (!laConsultaSirve(blockStatusPrevio)) {
      return new Response(
        JSON.stringify({
          error: porQueNoSirve(blockStatusPrevio),
          tipoIdentificacion: "fuente_sin_respuesta",
          ingresado,
          cedula,
          bloques: blockStatusPrevio,
        }),
        { status: 503, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // 3. ¿Existe esta persona?
    //
    // La fuente responde HTTP 200 aunque no exista: lo dice adentro del
    // cuerpo. Sin esta comprobación se guardaba un Perfil del Cliente
    // completo y en blanco, que desde afuera se ve igual que el de
    // alguien sin historial. Un analista podía leerlo como "esta
    // persona no tiene deudas" cuando en realidad esa persona no
    // existe.
    const noExiste = personaNoExiste(raw.general);
    if (noExiste) {
      const esRuc = ident.tipo === "ruc_persona_natural";
      return new Response(
        JSON.stringify({
          error: esRuc
            ? `La fuente no encuentra a la persona con cédula ${cedula}, que son los 10 primeros dígitos del RUC ${ingresado}. Si ese RUC es de una empresa, hay que buscar al representante por su cédula.`
            : `La fuente no encuentra a ninguna persona con la cédula ${cedula}. El número es válido en su forma, así que puede ser un dígito cambiado o una cédula que la fuente todavía no tiene.`,
          tipoIdentificacion: "no_existe",
          ingresado,
          cedula,
        }),
        { status: 404, headers: { ...corsHeaders, "content-type": "application/json" } }
      );
    }

    // 4. Cliente: obtener o crear.
    //
    // Recién acá, y no al principio. Dar de alta al cliente antes de
    // consultar dejaba una fila por cada número tecleado: quien escribía
    // una cédula que la fuente no conoce se llevaba un 404 y dejaba el
    // cliente creado. `clients` terminaba siendo la lista de lo que se
    // escribió, no la de las personas consultadas.
    let { data: client } = await serviceClient.from("clients").select("id").eq("cedula", cedula).maybeSingle();
    if (!client) {
      const { data: created, error: createError } = await serviceClient
        .from("clients")
        .insert({ cedula })
        .select("id")
        .single();
      if (createError) throw createError;
      client = created;
    }

    // 5. Estructura estandarizada
    const corteIess = await loadCorteIess(serviceClient, CORTE_IESS_CONOCIDO);
    const { profile, blockStatus, duracionFuentesMs } = buildStandardProfile(raw, cedula, corteIess);
    const duracionMs = Date.now() - inicioIngesta;

    // 6. Controles de bloqueo — determinísticos, no dependen del LLM.
    //     Perfil del Cliente necesita saber si hay un bloqueo activo
    //     para mostrar el aviso, aunque todavía no se corrió el
    //     Análisis con IA.
    const controlBloqueo = evaluarControlesBloqueo(raw, cedula);

    // 7. Persistir
    const { data: saved, error: saveError } = await serviceClient
      .from("client_profiles")
      .insert({
        client_id: client.id,
        standard_profile: profile,
        // Copia consultable de la clasificación (ver 043): el JSON sigue
        // siendo la fuente de verdad, esto evita bajar el perfil entero
        // para agrupar o cruzar con resultados reales.
        fuente_segmento: profile.fuentesIngreso?.segmento ?? null,
        fuente_estado: profile.fuentesIngreso?.estadoSegmento ?? null,
        fuente_version: profile.fuentesIngreso?.version ?? null,
        fuente_corte: profile.fuentesIngreso?.corteIessUsado ?? null,
        fuente_piso_ingreso: profile.fuentesIngreso?.pisoIngresoMensualReportado ?? null,
        duracion_fuentes_ms: duracionFuentesMs,
        control_bloqueo: controlBloqueo,
        block_status: blockStatus,
        // Cuántos ejes contestó la fuente. Se guarda plano para
        // poder excluir consultas vacías sin abrir el JSON de cada
        // perfil -- ver 065 y calidad-de-la-consulta.ts.
        ejes_ok: profile.metaConsulta.ejesOk.length,
        structure_version: PROCESS_VERSION,
        requested_by: actorId,
        duracion_ms: duracionMs,
      })
      .select("*")
      .single();
    if (saveError) throw saveError;

    // 8. Auditoría (mismo patrón que analyze-client)
    await serviceClient.from("audit_log").insert({
      actor: actorId,
      action: "client.structure",
      client_id: client.id,
      meta: { client_profile_id: saved.id },
    });

    return new Response(JSON.stringify(saved), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const mensaje =
      err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err);
    return new Response(JSON.stringify({ error: mensaje }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
