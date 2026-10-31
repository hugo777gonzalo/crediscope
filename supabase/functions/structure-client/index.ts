// Orquestador del flujo SIN LLM:
//   Ingesta Proveedor_Info_1 -> Estructura Estandarizada -> Persistencia -> Web.
// Usa las credenciales de servicio de Proveedor_Info_1 (secrets de la función,
// no las escribe el usuario) y requiere un usuario autenticado de
// Supabase (igual que analyze-client) porque persiste en client_profiles.
//
// Body esperado: { "cedula": "0102030405" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { type Actor, clavesIguales, exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { consultarYGuardarPerfil } from "../_shared/consulta-de-perfil.ts";

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
    // Los pasos 1 a 8 (ingesta, estructura, persistencia y auditoría) viven
    // en _shared/consulta-de-perfil.ts, para que el trabajador de la API los
    // llame sin pasar por HTTP. Acá quedan quién llama y la forma de la
    // respuesta.
    //
    // Sólo un guion con la clave de guiones (la máquina del negocio, nunca la
    // pantalla) puede pedir el crudo: ya tiene la clave de servicio y con ella
    // acceso a todo, así que esto no abre nada que no estuviera abierto.
    const conCrudo = devolverCrudo && desdeUnGuion;
    const resultado = await consultarYGuardarPerfil({
      db: serviceClient,
      cedula,
      ingresado,
      tipoIdentificacion: ident.tipo,
      actorId,
      // "guion" desde el 2026-10-09 (E4); las anteriores de ese día dicen
      // "clave_de_servicio" y son lo mismo.
      metaDeAuditoria: desdeUnGuion ? { origen: "guion", base_legal: baseLegal } : undefined,
      devolverCrudo: conCrudo,
    });
    if (!resultado.ok) {
      return new Response(JSON.stringify(resultado.cuerpo), {
        status: resultado.status,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    const respuesta = conCrudo ? { ...resultado.guardado, crudo: resultado.crudo } : resultado.guardado;
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
