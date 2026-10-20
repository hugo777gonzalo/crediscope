// Simulador de crédito como servicio propio: la cuota de un crédito de
// consumo con el seguro de desgravamen, sin consultar a nadie ni leer la
// base. Se llama solo, sin pasar por la evaluación entera (pedido del negocio
// del 2026-10-17: cada módulo con su propia puerta).
//
// El cálculo es simularCredito() de _shared/simulador-credito.ts, el mismo de
// la pantalla: la cuota que ve el analista y la que recibe quien llama acá
// son la misma.
//
// Exige sesión (analista o admin) antes de leer el cuerpo, como toda función
// que atiende a la pantalla (regla 6 de CLAUDE.md). La puerta para las
// instituciones, con su propia autenticación, es la Fase 1 de la API.
//
// Body: { "monto": 5000, "plazoMeses": 36, "tasaNominalAnualPorcentaje": 15,
//         "sistema": "frances", "desgravamen": { "tasaPorcentaje": 0.6,
//         "periodicidad": "anual", "base": "saldo" }, "incluirTabla": true }
// Sólo el monto y el plazo son obligatorios: sin tasa se evalúa con la Tasa
// máxima del producto, y con una tasa se pide una menor, de la Tasa mínima (0%)
// a la máxima (negocio, 2026-10-19). El resto toma los parámetros del producto
// de consumo (PRODUCTO_CONSUMO). La Tasa máxima no se puede cambiar desde el
// cuerpo: es del producto. Un 400 trae en `detalles` el código de cada error
// (ErrorDeCondiciones en api/openapi.yaml).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { condicionesDelPedidoExterno, simularCredito } from "../_shared/simulador-credito.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

  const resultado = simularCredito(condicionesDelPedidoExterno(cuerpo));
  if (!resultado.ok) return responder({ error: "Las condiciones del crédito no son válidas.", errores: resultado.errores, detalles: resultado.detalles }, 400);

  const { tabla, ...resumen } = resultado.simulacion;
  return responder({ simulacion: cuerpo.incluirTabla === false ? resumen : { ...resumen, tabla } });
});
