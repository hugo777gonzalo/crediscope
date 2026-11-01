// La puerta de la API para instituciones (api/openapi.yaml). Lo que atiende vive en
// `_shared/puerta-de-la-api.ts`; acá, los secretos y con qué cliente se conecta.
//
// API_SANDBOX=activo acepta las identificaciones de prueba de la especificación.
// Cualquier otro valor, o no tenerlo, las rechaza: está apagado salvo que se lo
// encienda a propósito.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { identificarActor } from "../_shared/autorizacion.ts";
import { despertarAlTrabajador } from "../_shared/despertar-trabajador.ts";
import { crearPuertaDeLaApi } from "../_shared/puerta-de-la-api.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

Deno.serve(crearPuertaDeLaApi({
  db: serviceClient,
  identificar: (autorizacion) => identificarActor(autorizacion, SUPABASE_URL, SUPABASE_ANON_KEY, serviceClient, createClient),
  despertar: despertarAlTrabajador,
  sandboxActivo: Deno.env.get("API_SANDBOX") === "activo",
}));
