// Orquestador de la consulta al buró Aval (fuente independiente):
//   Consulta Aval -> gate (¿sirve?) -> Perfil de Aval -> Persistencia.
// Requiere usuario autenticado de Supabase (igual que structure-client)
// porque persiste en consultas_aval y consulta un buró de crédito.
//
// Body esperado: { "identificacion": "0102030405", "tipoIdentificacion": "C" }
// (acepta "cedula" como alias; tipoIdentificacion por defecto "C").
//
// DOS BLOQUEOS CONOCIDOS PARA QUE ESTO CORRA EN PRODUCCIÓN (ver
// aval-client.ts): api-test/api de Aval solo admite IPs de Ecuador y las
// Edge Functions egresan global; y el ambiente de prueba usa un cert no
// válido que Deno rechaza salvo Deno.createHttpClient. Mientras no se
// resuelva el egreso, esta función se despliega pero la consulta real se
// prueba desde una máquina con IP ecuatoriana.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { consultarAval, laConsultaAvalSirve, porQueNoSirveAval, type TipoIdentificacionAval } from "../_shared/aval-client.ts";
import { construirPerfilAval, PERFIL_AVAL_VERSION } from "../_shared/aval-perfil.ts";
import { construirEstructuraAval, AVAL_ESTRUCTURA_VERSION } from "../_shared/aval-estructura.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TIPOS_VALIDOS: TipoIdentificacionAval[] = ["C", "R", "E", "P", "F"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  let identificacion: string | undefined;
  let tipoIdentificacion: TipoIdentificacionAval = "C";
  let actorDeclarado: string | undefined;
  try {
    const body = await req.json();
    identificacion = body?.identificacion ?? body?.cedula;
    if (typeof body?.tipoIdentificacion === "string" && TIPOS_VALIDOS.includes(body.tipoIdentificacion)) {
      tipoIdentificacion = body.tipoIdentificacion;
    }
    actorDeclarado = body?.actorId;
  } catch {
    // body inválido, se maneja abajo
  }
  if (!identificacion || typeof identificacion !== "string") {
    return new Response(JSON.stringify({ error: "Falta 'identificacion' en el body" }), {
      status: 400,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }

  // Para cédula usamos la misma validación que Novadata: un RUC de persona
  // natural se reduce a su cédula, y lo que no es persona natural se rechaza
  // antes de gastar una consulta (que en producción factura). Los otros
  // tipos (R/E/P/F) se mandan tal cual — hoy solo se usa C.
  let ingresado = identificacion.trim();
  let identConsultar = ingresado;
  if (tipoIdentificacion === "C") {
    const ident = clasificarIdentificacion(identificacion);
    if (!ident.consultable) {
      return new Response(JSON.stringify({ error: ident.mensaje, tipoIdentificacion: ident.tipo, ingresado: ident.ingresado }), {
        status: 400,
        headers: { ...corsHeaders, "content-type": "application/json" },
      });
    }
    ingresado = ident.ingresado;
    identConsultar = ident.cedula as string;
  }

  // Quién lo pidió. Si hay usuario en el encabezado, su id gana; el actor
  // declarado solo llena el hueco cuando no hay sesión (mismo criterio que
  // structure-client — ver su nota sobre los actores nulos).
  let actorId: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader) {
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY") ?? "", {
      global: { headers: { Authorization: authHeader } },
    });
    const { data } = await userClient.auth.getUser();
    actorId = data.user?.id ?? null;
  }
  if (!actorId && typeof actorDeclarado === "string" && actorDeclarado.length > 0) {
    actorId = actorDeclarado;
  }

  try {
    // 1. Consultar Aval.
    const respuesta = await consultarAval(identConsultar, tipoIdentificacion);

    // 2. ¿Sirve? Solo un A200 se guarda. Todo lo demás NO deja fila: sería el
    //    perfil-en-blanco del 2026-09-15. El HTTP y si se reintenta dependen
    //    de la familia (ver aval-client.ts): transitorio -> 503 reintentable;
    //    configuración -> 500/502 (arreglar credenciales/producto, no reintentar);
    //    solicitud -> 400; identificación -> 422. El cliente ya agotó los
    //    reintentos de la familia transitorio con su tope y backoff.
    if (!laConsultaAvalSirve(respuesta)) {
      // Registro durable del fallo, listo para una vista de salud/sobrecarga
      // (todavía sin UI): familia, intentos, si se agotó el tope, duración.
      await serviceClient.from("audit_log").insert({
        actor: actorId,
        action: "aval.consulta.fallo",
        meta: {
          identificacion: identConsultar,
          familia: respuesta.familia,
          codigo: respuesta.codigo ?? null,
          intentos: respuesta.intentos,
          agotoReintentos: respuesta.agotoReintentos ?? false,
          duracion_ms: respuesta.duracionMs,
          mensaje: porQueNoSirveAval(respuesta),
        },
      });
      return new Response(
        JSON.stringify({
          error: porQueNoSirveAval(respuesta),
          familia: respuesta.familia,
          codigo: respuesta.codigo,
          intentos: respuesta.intentos,
          agotoReintentos: respuesta.agotoReintentos ?? false,
          ingresado,
          identificacion: identConsultar,
        }),
        { status: respuesta.httpStatus, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // 3. Normalizar. El sobre para la estructura lleva responseCode y result;
    //    perfil = normalización full, estructura = estructura estandarizada.
    const sobre = { responseCode: respuesta.codigo, transactionNumber: respuesta.transactionNumber, result: respuesta.result };
    const perfil = construirPerfilAval(respuesta.result ?? {}, identConsultar);
    const estructura = construirEstructuraAval(sobre);

    // 4. Enlace blando a la persona (solo cédula): buscar-o-crear el cliente
    //    para que consultas_aval.client_id una esta fuente con Novadata y
    //    con las que vengan después. Los otros tipos quedan sin client_id.
    let clientId: string | null = null;
    if (tipoIdentificacion === "C") {
      const { data: existente } = await serviceClient.from("clients").select("id").eq("cedula", identConsultar).maybeSingle();
      if (existente) {
        clientId = existente.id;
      } else {
        const { data: creado, error: errCrear } = await serviceClient.from("clients").insert({ cedula: identConsultar }).select("id").single();
        if (errCrear) throw errCrear;
        clientId = creado.id;
      }
    }

    // 5. Persistir. respuesta_cruda es el sobre de Aval sin tocar (fuente de
    //    verdad); perfil es la normalización derivada; las columnas planas
    //    son copia consultable.
    const { data: guardado, error: errGuardar } = await serviceClient
      .from("consultas_aval")
      .insert({
        identificacion: identConsultar,
        tipo_identificacion: tipoIdentificacion,
        client_id: clientId,
        respuesta_cruda: {
          responseCode: respuesta.codigo,
          message: respuesta.mensaje,
          transactionNumber: respuesta.transactionNumber,
          result: respuesta.result,
        },
        perfil,
        perfil_version: PERFIL_AVAL_VERSION,
        estructura,
        estructura_version: AVAL_ESTRUCTURA_VERSION,
        response_code: respuesta.codigo,
        transaction_number: respuesta.transactionNumber,
        score: perfil.resumen.score,
        total_deuda: perfil.resumen.totalDeuda,
        num_tarjetas_vigentes: perfil.resumen.numTarjetasVigentes,
        consultas_12m: perfil.resumen.consultas12Meses,
        tasa_malos: perfil.resumen.tasaMalos,
        nombre_sujeto: perfil.resumen.nombre,
        duracion_ms: respuesta.duracionMs,
        requested_by: actorId,
      })
      .select("*")
      .single();
    if (errGuardar) throw errGuardar;

    // 6. Auditoría (mismo patrón que structure-client).
    await serviceClient.from("audit_log").insert({
      actor: actorId,
      action: "aval.consulta",
      client_id: clientId,
      meta: { consulta_aval_id: guardado.id, identificacion: identConsultar, intentos: respuesta.intentos, duracion_ms: respuesta.duracionMs },
    });

    return new Response(JSON.stringify(guardado), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (err) {
    const mensaje = err instanceof Error ? err.message : (err as { message?: string })?.message ?? JSON.stringify(err);
    return new Response(JSON.stringify({ error: mensaje }), {
      status: 500,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
