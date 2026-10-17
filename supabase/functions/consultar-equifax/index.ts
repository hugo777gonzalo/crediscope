// Consulta al buró Equifax (fuente independiente). CADA CONSULTA SE COBRA.
//
//   Reutilizar (si hay una vigente) -> tope diario -> consultar -> guardar el
//   crudo -> auditar. El recorrido vive en _shared/equifax-persistencia.ts,
//   que comparte con scripts/consultar-equifax-local.mjs: una sola
//   implementación.
//
// Requiere sesión de ADMIN, que se verifica ANTES de leer el cuerpo (el
// portón de Supabase deja pasar la clave pública, que va en la página). El
// responsable de la consulta sale de la sesión, nunca del cuerpo. Hasta el
// 2026-10-17 bastaba ser analista: el botón de la pantalla es sólo de
// administración (diseño aprobado el 2026-10-16) y un analista podía saltarlo
// llamando a la función directamente, con una consulta que se cobra.
//
// Body: { "identificacion": "0102030405", "baseLegal": "...", "forzar": false }
//   - baseLegal: bajo qué contrato se consulta a esta persona; queda en la
//     auditoría de cada consulta. Obligatoria (10 caracteres o más).
//   - forzar: salta la reutilización y vuelve a pagar.
//   - { "accion": "probar_conexion" }: pide un token y nada más.
//     No consulta a nadie y no cuesta; sirve para saber si Equifax deja pasar
//     a las Edge Functions (con Aval, el WAF rechazó su IP de salida).
//
// Devuelve un RESUMEN, no el crudo: los datos de la persona se leen de la
// tabla consultas_equifax con la sesión de quien tiene permiso, no viajan en
// la respuesta de la función.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { probarConexion } from "../_shared/equifax-client.ts";
import { procesarConsultaEquifax } from "../_shared/equifax-persistencia.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const corsHeaders = cabecerasCors(req);
  const responder = (cuerpo: unknown, status = 200) =>
    new Response(JSON.stringify(cuerpo), { status, headers: { ...corsHeaders, "content-type": "application/json" } });

  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Quién llama y si puede, antes de mirar qué pide.
  const actor = await identificarActor(
    req.headers.get("Authorization"),
    SUPABASE_URL,
    Deno.env.get("SUPABASE_ANON_KEY") ?? "",
    serviceClient,
    createClient,
  );
  const rechazo = exigirRol(actor, ["admin"], corsHeaders);
  if (rechazo) return rechazo;

  const sinEsquema = await exigirEsquema(serviceClient, corsHeaders);
  if (sinEsquema) return sinEsquema;

  let cuerpo: Record<string, unknown> = {};
  try {
    cuerpo = await req.json();
  } catch {
    // cuerpo inválido: se maneja abajo
  }

  if (cuerpo?.accion === "probar_conexion") {
    const prueba = await probarConexion();
    return responder({ ...prueba, accion: "probar_conexion" }, prueba.ok ? 200 : 502);
  }

  const identificacion = typeof cuerpo?.identificacion === "string" ? cuerpo.identificacion : typeof cuerpo?.cedula === "string" ? cuerpo.cedula : "";
  if (!identificacion) return responder({ error: "Falta 'identificacion' en el body" }, 400);

  const baseLegal = typeof cuerpo?.baseLegal === "string" ? cuerpo.baseLegal.trim() : "";
  if (baseLegal.length < 10) {
    return responder({ error: "Falta la base legal de la consulta (al menos 10 caracteres): queda en la auditoría de cada persona consultada." }, 400);
  }

  // forzar vuelve a pagar una consulta que ya estaba pagada y vigente.
  const forzar = cuerpo?.forzar === true;

  // La misma validación que Novadata y Aval: un RUC de persona natural se
  // reduce a su cédula, y lo que no es persona natural se rechaza antes de
  // gastar una consulta que se cobra.
  const ident = clasificarIdentificacion(identificacion);
  if (!ident.consultable) {
    return responder({ error: ident.mensaje, tipoIdentificacion: ident.tipo, ingresado: ident.ingresado }, 400);
  }
  const cedula = ident.cedula as string;

  try {
    const r = await procesarConsultaEquifax({
      db: serviceClient,
      cedula,
      actorId: actor!.id,
      baseLegal,
      origen: "consulta",
      forzar,
      transporte: { tipo: "funcion" },
    });

    if (r.resultado === "rechazada") {
      return responder({ error: r.error, motivo: r.motivo, familia: r.respuesta?.familia, identificacion: cedula }, r.http);
    }
    if (r.resultado === "simulada") return responder({ error: "simular sólo existe en el guion local" }, 400);

    return responder({
      id: r.fila.id,
      reutilizada: r.resultado === "reutilizada",
      consultada_el: r.fila.created_at,
      vigente_hasta: r.vigenteHasta,
      ambiente: r.fila.ambiente,
      identificacion: cedula,
      // false = el crudo quedó guardado pero las tablas y la estructura no se pudieron derivar (se
      // rehacen sin volver a pagar). null = la consulta se reutilizó: no se volvió a derivar nada.
      tablas_hechas: r.resultado === "consultada" ? r.tablas.ok : null,
    });
  } catch (err) {
    // Sin el mensaje crudo: un error de un tercero puede repetir lo que se le mandó.
    console.error("consultar-equifax:", (err as Error)?.name);
    return responder({ error: "No se pudo completar la consulta a Equifax." }, 500);
  }
});
