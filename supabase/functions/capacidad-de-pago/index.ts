// Capacidad de pago como servicio propio: si la cuota de un crédito entra en
// el ingreso de una persona, sumada a lo que ya paga. Se llama sola, sin
// pasar por la evaluación entera (pedido del negocio del 2026-10-17: cada
// módulo con su propia puerta).
//
// Dos maneras de llamarla:
//   - Con una cédula: lee el último perfil de la persona y, si el buró de la
//     institución es Equifax, su última consulta. NO consulta a ninguna fuente
//     (no cuesta y no se cobra): si la persona no se consultó, lo dice.
//   - Con los datos: { ingresos, obligaciones, deudasSinCuota } armados por
//     quien llama (una institución que ya tiene el rol de pagos). No lee la
//     base.
// En las dos, la cuota sale de simularCredito() y la capacidad de
// evaluarCapacidad(): lo mismo que ve el analista en la pantalla.
//
// Exige sesión (analista o admin) antes de leer el cuerpo (regla 6).
//
// Body: { "cedula": "...", "solicitud": { "monto": 5000, "plazoMeses": 36,
//         "tasaNominalAnualPorcentaje": 15 }, "ingresoDeclarado": 2500,
//         "parametros": { "cargaMaxima": 0.4 } }
// ingresoDeclarado (opcional) es lo que la persona dice que recibe por mes:
// reemplaza al del IESS en el cálculo, y la respuesta trae además el
// resultado con sólo el IESS (capacidadSoloIess), para comparar.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cabecerasCors } from "../_shared/cors.ts";
import { exigirEsquema } from "../_shared/version-esquema.ts";
import { exigirRol, identificarActor } from "../_shared/autorizacion.ts";
import { clasificarIdentificacion } from "../_shared/identificacion.ts";
import { montoMaximoParaCuota, type PedidoDeSimulacion, simularCredito } from "../_shared/simulador-credito.ts";
import {
  conIngresoDeclarado,
  type DatosDeCapacidad,
  datosDeCapacidad,
  evaluarCapacidad,
  type ParametrosCapacidad,
} from "../_shared/capacidad-de-pago.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const comoLista = (v: unknown) => (Array.isArray(v) ? v : []);

// Sólo se aceptan números entre 0 y 1: una carga de 40 (en vez de 0,40)
// aprobaba todo.
function parametrosDelCuerpo(v: unknown): Partial<ParametrosCapacidad> {
  const p = v && typeof v === "object" ? (v as Record<string, unknown>) : {};
  const fraccion = (x: unknown) => (typeof x === "number" && x >= 0 && x <= 1 ? x : undefined);
  const salida: Partial<ParametrosCapacidad> = {};
  for (const clave of ["cargaMaxima", "margenJusto", "aportePersonalIess"] as const) {
    const valor = fraccion(p[clave]);
    if (valor !== undefined) salida[clave] = valor;
  }
  return salida;
}

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

  const solicitud = (cuerpo.solicitud ?? {}) as PedidoDeSimulacion;
  const simulacion = simularCredito(solicitud);
  if (!simulacion.ok) return responder({ error: "Las condiciones del crédito no son válidas.", errores: simulacion.errores }, 400);
  const parametros = parametrosDelCuerpo(cuerpo.parametros);

  let datos: DatosDeCapacidad;
  let procedencia: Record<string, unknown> = { modo: "datos_del_pedido" };

  if (typeof cuerpo.cedula === "string" || typeof cuerpo.identificacion === "string") {
    const sinEsquema = await exigirEsquema(serviceClient, corsHeaders);
    if (sinEsquema) return sinEsquema;

    const ident = clasificarIdentificacion(String(cuerpo.cedula ?? cuerpo.identificacion));
    if (!ident.consultable) return responder({ error: ident.mensaje }, 400);
    const cedula = ident.cedula as string;

    const { data: cliente, error: errorCliente } = await serviceClient.from("clients").select("id").eq("cedula", cedula).maybeSingle();
    if (errorCliente) return responder({ error: "No se pudo leer la persona." }, 500);
    if (!cliente) return responder({ error: "La persona todavía no se consultó: primero hay que consultarla." }, 404);

    const { data: perfil, error: errorPerfil } = await serviceClient
      .from("client_profiles")
      .select("id, created_at, standard_profile")
      .eq("client_id", cliente.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (errorPerfil) return responder({ error: "No se pudo leer el perfil." }, 500);
    if (!perfil) return responder({ error: "La persona no tiene un perfil guardado: primero hay que consultarla." }, 404);

    // El buró de la institución decide si las cuotas salen de Equifax. Una
    // consulta del ambiente de prueba contesta por otra persona: no sirve.
    // La misma regla que la pantalla (CapacidadDePago.jsx): la última consulta,
    // y sólo si es de producción y tiene su estructura. Buscar la última que
    // las cumpla daba otra cuota que la pantalla cuando la más nueva no tenía
    // estructura: la función tomaba una de un mes anterior.
    const { data: buro, error: errorBuro } = await serviceClient.from("proveedores").select("clave").eq("es_buro", true).maybeSingle();
    // Sin saber cuál es el buró, las cuotas saldrían de Novadata sin que nadie se entere.
    if (errorBuro) return responder({ error: "No se pudo leer cuál es el buró de la institución." }, 500);
    let equifax: { id: string; created_at: string; estructura: Record<string, unknown> | null } | null = null;
    if (buro?.clave === "equifax") {
      const { data, error } = await serviceClient
        .from("consultas_equifax")
        .select("id, created_at, ambiente, estructura")
        .eq("identificacion", cedula)
        .eq("tipo_identificacion", "C")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return responder({ error: "No se pudo leer la consulta de Equifax." }, 500);
      equifax = data?.ambiente === "produccion" && data?.estructura ? data : null;
    }

    datos = datosDeCapacidad(perfil.standard_profile as Record<string, unknown>, equifax?.estructura ?? null);
    procedencia = {
      modo: "persona",
      perfilDel: perfil.created_at,
      buroDeLaInstitucion: buro?.clave ?? null,
      equifaxDel: equifax?.created_at ?? null,
    };

    await serviceClient.from("audit_log").insert({
      actor: actor!.id,
      action: "capacidad.evaluar",
      client_id: cliente.id,
      meta: { client_profile_id: perfil.id, consulta_equifax_id: equifax?.id ?? null },
    });
  } else {
    datos = {
      ingresos: comoLista(cuerpo.ingresos),
      obligaciones: comoLista(cuerpo.obligaciones),
      deudasSinCuota: comoLista(cuerpo.deudasSinCuota),
      fuenteDeLasCuotas: "novadata",
      corteIess: null,
    } as DatosDeCapacidad;
    if (datos.ingresos.some((x) => typeof x?.montoMensual !== "number" || !["sueldo", "aporte_propio", "declarado"].includes(x.tipo))) {
      return responder({ error: "Cada ingreso lleva montoMensual (número) y tipo («sueldo», «aporte_propio» o «declarado»)." }, 400);
    }
    // evaluarCapacidad() deja afuera una cuota que no es número: con un "350"
    // en texto, la obligación contaba como cero y el crédito «alcanzaba».
    if (datos.obligaciones.some((x) => typeof x?.montoMensual !== "number" || !Number.isFinite(x.montoMensual) || x.montoMensual < 0)) {
      return responder({ error: "Cada obligación lleva montoMensual: lo que paga por mes, como número." }, 400);
    }
    if (datos.deudasSinCuota.some((x) => !x || typeof x !== "object")) {
      return responder({ error: "Cada deuda sin cuota va como objeto: { concepto, saldo, origen }." }, 400);
    }
  }

  const declarado = cuerpo.ingresoDeclarado;
  if (declarado !== undefined && declarado !== null && (typeof declarado !== "number" || !Number.isFinite(declarado) || declarado < 0)) {
    return responder({ error: "ingresoDeclarado va en dólares por mes, como número." }, 400);
  }
  const cuotaNueva = simulacion.simulacion.cuotaPrimerMes;
  const conDeclarado = conIngresoDeclarado(datos, declarado as number | null | undefined);
  const capacidad = evaluarCapacidad({ ...conDeclarado, cuotaNueva, parametros });
  // Con una persona y un Ingreso declarado, también lo que da el IESS solo.
  const capacidadSoloIess = conDeclarado !== datos && procedencia.modo === "persona" ? evaluarCapacidad({ ...datos, cuotaNueva, parametros }) : null;
  const { tabla: _tabla, ...resumenSimulacion } = simulacion.simulacion;
  const { monto: _monto, ...condiciones } = solicitud;
  return responder({
    capacidad,
    simulacion: resumenSimulacion,
    montoMaximo: montoMaximoParaCuota(capacidad.cuotaMaximaAdmisible, condiciones),
    capacidadSoloIess,
    datos: conDeclarado,
    procedencia,
  });
});
