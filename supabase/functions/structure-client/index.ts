// Orquestador del flujo SIN LLM:
//   Ingesta Novadata -> Estructura Estandarizada -> Persistencia -> Web.
// Usa las credenciales de servicio de Novadata (secrets de la función,
// no las escribe el usuario) y requiere un usuario autenticado de
// Supabase (igual que analyze-client) porque persiste en client_profiles.
//
// Body esperado: { "cedula": "0102030405" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { type Actor, clavesIguales, exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { consultarTodasLasFuentes, duracionesPorFuente, personaNoExiste } from "../_shared/novadata-client.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { buildStandardProfile, PROCESS_VERSION } from "../_shared/process.ts";
import { CORTE_IESS_CONOCIDO } from "../_shared/fuentes-ingreso.ts";
import { columnasDelPerfil } from "../_shared/columnas-del-perfil.ts";
import { guardarCrudoNovadata } from "../_shared/crudo-novadata.ts";
import { evaluarControlesBloqueo } from "../_shared/controles-bloqueo.ts";
import { loadDisabledResources, loadCorteIess } from "../_shared/runtime-config.ts";
import { estadoPorFuente, cuantasFuentesContestaron, laConsultaSirve, porQueNoSirve } from "../_shared/calidad-de-la-consulta.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const GUIONES_CLAVE = Deno.env.get("GUIONES_CLAVE") ?? "";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const corsHeaders = cabecerasCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Quién llama, ANTES de mirar el cuerpo. Hasta el 2026-10-09 esta
  // función sólo anotaba al usuario "para la auditoría" y seguía: el
  // portón de Supabase deja pasar la clave pública (va en el JavaScript
  // de la página), así que cualquiera en internet podía consultar el
  // buró, la Función Judicial y el IESS de cualquier cédula, recibir el
  // perfil entero y anotarlo a nombre de otro usuario con `actorId`.
  // Lo encontró la auditoría de seguridad de ese día, probando desde
  // afuera con la clave pública.
  //
  // Los guiones (consultar-lote.mjs) entran con una clave propia,
  // GUIONES_CLAVE, en el encabezado x-guiones-clave. Hasta la tarde del
  // mismo día se reconocían por el rol "service_role" leído del token SIN
  // verificar su firma, confiando en que lo hacía el portón
  // (verify_jwt = true). Con verify_jwt apagado -- pasó el 2026-09-16 --,
  // un token armado a mano que dijera service_role saltaba exigirRol()
  // (auditoría externa, E4). La clave se compara acá, en tiempo constante,
  // y no depende de ninguna configuración de la plataforma.
  const authHeader = req.headers.get("Authorization");
  const claveDeGuiones = req.headers.get("x-guiones-clave");
  const desdeUnGuion = claveDeGuiones !== null;
  if (desdeUnGuion && (!GUIONES_CLAVE || !clavesIguales(claveDeGuiones, GUIONES_CLAVE))) {
    return new Response(JSON.stringify({ error: "no autorizado" }), {
      status: 401,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  let actor: Actor | null = null;
  if (!desdeUnGuion) {
    actor = await identificarActor(
      authHeader,
      SUPABASE_URL,
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      serviceClient,
      createClient,
    );
    const rechazo = exigirRol(actor, ["analista", "admin"], corsHeaders);
    if (rechazo) return rechazo;
  }
  // La base tiene que estar al día con lo que este código necesita (ESQUEMA_MINIMO en _shared/version-esquema.ts).
  const sinEsquema = await exigirEsquema(serviceClient, corsHeaders);
  if (sinEsquema) return sinEsquema;

  let cedula: string | undefined;
  // Quién se hace cargo, cuando llama un guion con la clave de guiones.
  // Con una sesión de usuario se ignora: manda la sesión.
  let actorDeclarado: string | undefined;
  // Sólo se honra con la clave de guiones: ver al final.
  let devolverCrudo = false;
  // Por qué se puede consultar a estas personas, declarado una vez por
  // lote (decisión del negocio del 2026-10-09): la IFI garantiza por
  // contrato la autorización de cada titular, y el lote dice bajo qué
  // contrato o base legal se consulta. Desde la pantalla no hace falta:
  // la consulta queda a nombre del usuario y de su entidad.
  let baseLegal: string | undefined;
  try {
    const body = await req.json();
    cedula = body?.cedula;
    actorDeclarado = body?.actorId;
    devolverCrudo = body?.devolverCrudo === true;
    baseLegal = typeof body?.baseLegal === "string" ? body.baseLegal.trim() : undefined;
  } catch {
    // body inválido, se maneja abajo
  }

  // Desde un guion el responsable es obligatorio y tiene que ser un
  // usuario real: una consulta que nadie ordenó no se puede explicar al
  // titular ni a un auditor (el 2026-10-07 quedó una así). La base legal
  // también: es lo primero que pregunta un auditor de protección de datos
  // sobre una consulta masiva.
  if (desdeUnGuion) {
    const { data: responsable } = typeof actorDeclarado === "string" && actorDeclarado.length > 0
      ? await serviceClient.from("profiles").select("id").eq("id", actorDeclarado).maybeSingle()
      : { data: null };
    if (!responsable) {
      return new Response(
        JSON.stringify({ error: "Desde un guion hay que mandar 'actorId': el id de un usuario existente que se hace cargo de la consulta." }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }
    if (!baseLegal || baseLegal.length < 10) {
      return new Response(
        JSON.stringify({ error: "Desde un guion hay que mandar 'baseLegal': bajo qué contrato o base legal se consulta a estas personas (al menos 10 caracteres)." }),
        { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }
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

  // Quién lo pidió, cuando lo pide el guion de lotes con la clave de
  // servicio: `getUser()` no devuelve a nadie para esa clave, y la
  // auditoría del 2026-09-16 encontró 2.637 consultas sin responsable.
  // Ya se comprobó arriba que el responsable declarado existe.
  const actorId: string = actor ? actor.id : (actorDeclarado as string);

  try {
    // 1. Ingesta (con credenciales de servicio — sin pedirle nada al usuario)
    //    Recursos deshabilitados en novadata_resource_config se saltan
    //    (ver _shared/runtime-config.ts).
    const disabledResources = await loadDisabledResources(serviceClient);
    const inicioIngesta = Date.now();
    const raw = await consultarTodasLasFuentes(cedula, undefined, disabledResources);

    // 2. ¿La fuente contestó algo?
    //
    // Esto va ANTES de mirar si la persona existe, porque si ninguna
    // fuente respondió tampoco sabemos si existe. El 2026-09-15 una
    // caída de una hora dejó 373 perfiles en blanco guardados como si
    // fueran personas sin historial, y clasificados como "informal o sin
    // actividad". Ver _shared/calidad-de-la-consulta.ts.
    //
    // 503 y no 500: el problema es de la fuente y es pasajero. El
    // trabajador de lotes usa ese código para reintentar en vez de dar
    // la cédula por perdida.
    const estadoDeCadaFuente = estadoPorFuente(raw);
    if (!laConsultaSirve(estadoDeCadaFuente)) {
      return new Response(
        JSON.stringify({
          error: porQueNoSirve(estadoDeCadaFuente),
          tipoIdentificacion: "fuente_sin_respuesta",
          ingresado,
          cedula,
          fuentes: estadoDeCadaFuente,
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
    const { profile, duracionFuentesMs } = buildStandardProfile(raw, cedula, corteIess);
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
        // Segmento, perfil laboral e indicios, copiados para que la base
        // cuente y filtre sin bajar el perfil entero. El JSON sigue siendo
        // la fuente de verdad.
        ...columnasDelPerfil(profile),
        duracion_fuentes_ms: duracionFuentesMs,
        control_bloqueo: controlBloqueo,

        // Qué contestó cada fuente. Se guarda plano (fuentes_ok) además
        // del detalle para poder excluir consultas vacías sin abrir el
        // JSON de cada perfil -- ver 065, 068 y 078. `ejes_ok` ya no se
        // escribe: contaba los nueve bloques, que exageraban.
        estado_por_fuente: estadoDeCadaFuente,
        fuentes_ok: cuantasFuentesContestaron(estadoDeCadaFuente),
        fuentes_totales: Object.keys(estadoDeCadaFuente).length,
        structure_version: PROCESS_VERSION,
        requested_by: actorId,
        duracion_ms: duracionMs,
        duracion_por_fuente_ms: duracionesPorFuente(raw),
      })
      .select("*")
      .single();
    if (saveError) throw saveError;
    saved.crudo_ruta = await guardarCrudoNovadata(serviceClient, client.id, saved.id, cedula, raw);

    // 8. Auditoría (mismo patrón que analyze-client)
    await serviceClient.from("audit_log").insert({
      actor: actorId,
      action: "client.structure",
      client_id: client.id,
      // "guion" desde el 2026-10-09 (E4); las anteriores de ese día dicen
      // "clave_de_servicio" y son lo mismo.
      meta: desdeUnGuion
        ? { client_profile_id: saved.id, origen: "guion", base_legal: baseLegal }
        : { client_profile_id: saved.id },
    });

    // Desde la 090 el crudo queda en Storage (crudo-novadata.ts). Antes se
    // descartaba, y sin crudo una regla nueva no se puede aplicar a los
    // perfiles guardados: el 2026-09-25 hubo que reconsultar la cartera para
    // eso. Devolverlo en la respuesta sigue sirviendo al guion de lotes, que
    // arma el respaldo local de research/. Sólo lo pide un guion con la
    // clave de guiones (la máquina del negocio, nunca la pantalla), que ya
    // tiene la clave de servicio y con ella acceso a todo: esto no abre
    // nada que no estuviera abierto.
    const respuesta = devolverCrudo && desdeUnGuion ? { ...saved, crudo: raw } : saved;
    return new Response(JSON.stringify(respuesta), {
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
