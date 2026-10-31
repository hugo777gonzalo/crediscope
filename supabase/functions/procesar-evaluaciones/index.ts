// El trabajador de las evaluaciones de la API: toma las que están listas y corre
// UN paso de cada una (perfil, buró, análisis, capacidad). El cuerpo vive en
// `_shared/trabajador-de-evaluaciones.ts`; acá, quién llama y contestar enseguida.
//
// Lo despierta la agenda de la base cada minuto (139), la puerta al recibir un
// pedido, y él mismo al terminar un paso que deja otro listo. Así una
// evaluación de Plus no espera el minuto de la agenda entre un paso y el
// siguiente; la agenda queda como red de seguridad si alguno se corta.
//
// Quién corre: este trabajador, con la clave de la agenda (x-vigia-clave, la
// misma del vigía y del trabajador de lotes, comparada en tiempo constante).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasSinCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { clavesIguales } from "../_shared/autorizacion.ts";
import { despertarAlTrabajador } from "../_shared/despertar-trabajador.ts";
import { rondaDeEvaluaciones } from "../_shared/trabajador-de-evaluaciones.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const VIGIA_CLAVE = Deno.env.get("VIGIA_CLAVE") ?? "";

// deno-lint-ignore no-explicit-any
declare const EdgeRuntime: { waitUntil(promesa: Promise<unknown>): void } | undefined;

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  const cabeceras = { ...cabecerasSinCors(), "content-type": "application/json" };
  const responder = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: cabeceras });
  // El corredor de despliegue confirma el sello preguntando con OPTIONS.
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cabecerasSinCors() });
  if (req.method !== "POST") return responder({ error: "Sólo POST." }, 405);
  if (!VIGIA_CLAVE || !clavesIguales(req.headers.get("x-vigia-clave") ?? "", VIGIA_CLAVE)) return responder({ error: "no autorizado" }, 401);

  const sinEsquema = await exigirEsquema(serviceClient, cabeceras);
  if (sinEsquema) return sinEsquema;

  // Contesta enseguida y trabaja en segundo plano: quien despierta (la agenda, la
  // puerta, otra invocación) no tiene que esperar un paso de dos minutos.
  const trabajo = rondaDeEvaluaciones({ db: serviceClient, despertar: despertarAlTrabajador }).catch((err) => console.error("procesar-evaluaciones:", (err as Error)?.name));
  if (typeof EdgeRuntime !== "undefined") {
    EdgeRuntime.waitUntil(trabajo);
    return responder({ aceptado: true }, 202);
  }
  return responder({ aceptado: true, ...(await trabajo) });
});
