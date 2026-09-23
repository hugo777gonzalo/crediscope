// Orquestador de la consulta al buró Aval (fuente independiente):
//   Reutilizar (si hay consulta vigente) -> si no, Consultar -> gate ->
//   Perfil + Estructura -> Persistencia.
// Requiere usuario autenticado de Supabase (igual que structure-client)
// porque persiste en consultas_aval y consulta un buró de crédito.
//
// REUTILIZACIÓN (Aval cuesta): si la persona ya tiene una consulta vigente
// (Aval publica el 18; el 18 caduca todo — ver aval-vigencia.ts), se
// reutiliza sin volver a pagar. Múltiples solicitudes de un mismo cliente en
// el período comparten la misma consulta. Solo se guardan y reutilizan las
// exitosas (A200); una fallida no deja fila, así que la próxima solicitud la
// vuelve a consultar. `forzar: true` en el body salta la reutilización.
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
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { consultarAval, laConsultaAvalSirve, porQueNoSirveAval, type TipoIdentificacionAval } from "../_shared/aval-client.ts";
import { construirPerfilAval, PERFIL_AVAL_VERSION } from "../_shared/aval-perfil.ts";
import { construirEstructuraAval, AVAL_ESTRUCTURA_VERSION } from "../_shared/aval-estructura.ts";
import { estaVigenteAval, finVigenciaAval } from "../_shared/aval-vigencia.ts";

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
  let forzar = false; // salta la reutilización y consulta de nuevo (refresco manual)
  try {
    const body = await req.json();
    identificacion = body?.identificacion ?? body?.cedula;
    if (typeof body?.tipoIdentificacion === "string" && TIPOS_VALIDOS.includes(body.tipoIdentificacion)) {
      tipoIdentificacion = body.tipoIdentificacion;
    }
    forzar = body?.forzar === true;
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

  // Quién lo pidió, y si tiene permiso. Consultar Aval CUESTA plata por
  // cada consulta, así que la identidad no puede venir declarada en el
  // cuerpo del pedido: sale de la sesión verificada y de ningún otro
  // lado. El `actorId` del body se ignora a propósito — era un hueco por
  // donde cualquiera podía firmar una consulta paga con el nombre de
  // otro.
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

  try {
    // -1. ¿Aval está prendido como proveedor? A diferencia de Novadata, que
    //     tiene 52 endpoints apagables uno por uno, Aval es una sola llamada
    //     atómica: el on/off es de todo o nada, y vive en `proveedores`
    //     (migración 067) -- creada para justo este caso. Se chequea ANTES
    //     de mirar si hay una consulta vigente para reutilizar, porque
    //     reutilizar una fila vieja mientras el proveedor está apagado por
    //     decisión operativa (ej. contrato suspendido) seguiría sirviendo
    //     datos de una fuente que la institución decidió no usar.
    const { data: proveedor } = await serviceClient.from("proveedores").select("activo, notas").eq("clave", "aval").maybeSingle();
    if (proveedor && !proveedor.activo) {
      return new Response(
        JSON.stringify({ error: `Aval está desactivado como proveedor.${proveedor.notas ? ` ${proveedor.notas}` : ""}`, familia: "sin_config" }),
        { status: 503, headers: { ...corsHeaders, "content-type": "application/json" } },
      );
    }

    // 0. Reutilización: si ya hay una consulta VIGENTE de esta persona, se
    //    reutiliza (Aval cuesta). Solo se guardan las exitosas, así que
    //    cualquier fila previa es un A200; si está vencida o no hay, se
    //    consulta. `forzar` salta este atajo.
    if (!forzar) {
      const { data: previa } = await serviceClient
        .from("consultas_aval")
        .select("*")
        .eq("identificacion", identConsultar)
        .eq("tipo_identificacion", tipoIdentificacion)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (previa && estaVigenteAval(previa.created_at)) {
        return new Response(
          JSON.stringify({ ...previa, reutilizada: true, vigente_hasta: finVigenciaAval().toISOString() }),
          { headers: { ...corsHeaders, "content-type": "application/json" } },
        );
      }
    }

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
          // La causa TÉCNICA, además del mensaje para la persona: sin esto,
          // un fallo de conexión quedaba registrado solo como "posible
          // sobrecarga" y había que adivinar si era cert, IP o red.
          http_aval: respuesta.httpAval ?? null,
          detalle_tecnico: respuesta.errorMessage ?? null,
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

    return new Response(JSON.stringify({ ...guardado, reutilizada: false, vigente_hasta: finVigenciaAval().toISOString() }), {
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
