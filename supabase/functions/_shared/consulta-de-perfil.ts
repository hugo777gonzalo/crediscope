// La consulta de una persona a Proveedor_Info_1 y su Perfil estandarizado guardado,
// sin pasar por HTTP: ingesta -> estructura estandarizada -> persistencia.
//
// Antes vivía entera en el handler de `structure-client`. Se sacó acá para
// que el trabajador de la API (`procesar-evaluaciones`) la llame directo, sin
// dar la vuelta por HTTP a su propia base, y para que la pantalla, los
// guiones y la API guarden el perfil por el mismo camino y no por copias.
// `structure-client` quedó como la envoltura: CORS, quién llama, el cuerpo y
// la validación de la identificación.
//
// Los resultados esperables (la fuente no contestó, la persona no existe) se
// DEVUELVEN con su status y su cuerpo; los errores inesperados se dejan
// lanzar, y quien llama los convierte en su 500.

import { consultarTodasLasFuentes, duracionesPorFuente, personaNoExiste } from "./proveedor-info-1-client.ts";
import { buildStandardProfile, PROCESS_VERSION } from "./process.ts";
import { CORTE_IESS_CONOCIDO } from "./fuentes-ingreso.ts";
import { columnasDelPerfil } from "./columnas-del-perfil.ts";
import { guardarCrudoProveedorInfo1 } from "./crudo-proveedor-info-1.ts";
import { evaluarControlesBloqueo } from "./controles-bloqueo.ts";
import { loadCorteIess, loadDisabledResources } from "./runtime-config.ts";
import { cuantasFuentesContestaron, estadoPorFuente, laConsultaSirve, porQueNoSirve } from "./calidad-de-la-consulta.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

export interface OpcionesDeConsultaDePerfil {
  // Cliente de servicio de supabase-js: escribe en clients, client_profiles,
  // audit_log y Storage.
  // deno-lint-ignore no-explicit-any
  db: any;
  // Ya validada y normalizada por clasificarIdentificacion.
  cedula: string;
  // Lo que se escribió (ident.ingresado): si era un RUC, el mensaje de "no
  // existe" lo nombra.
  ingresado: string;
  // ident.tipo ("cedula", "ruc_persona_natural"...).
  tipoIdentificacion: string;
  // Quién se hace cargo: va a client_profiles.requested_by y a audit_log.actor.
  actorId: string;
  // Se mezcla en audit_log.meta junto a client_profile_id. Desde un guion,
  // { origen: "guion", base_legal }; desde la pantalla, nada.
  metaDeAuditoria?: Record<string, unknown>;
  // Devuelve también el crudo de Proveedor_Info_1. Sólo lo pide un guion con la clave
  // de guiones: quien llama decide si lo honra (ver structure-client).
  devolverCrudo?: boolean;
}

export type ResultadoDeConsultaDePerfil =
  // `guardado` es la fila de client_profiles, con crudo_ruta.
  // deno-lint-ignore no-explicit-any
  | { ok: true; guardado: Record<string, any>; crudo?: unknown }
  // `cuerpo` es el mismo JSON que devolvía la función.
  | { ok: false; status: 404 | 503; cuerpo: Record<string, unknown> };

// Qué dice lo que contestó la fuente, antes de guardar nada. Sale aparte para que
// el sandbox (sandbox-pasos.ts) decida con la misma regla que una consulta real.
export function leerLaConsulta(
  raw: RespuestaProveedorInfo1,
  o: Pick<OpcionesDeConsultaDePerfil, "cedula" | "ingresado" | "tipoIdentificacion">,
): { ok: true; estadoDeCadaFuente: Record<string, string> } | { ok: false; status: 404 | 503; cuerpo: Record<string, unknown> } {
  const { cedula, ingresado } = o;

  // ¿La fuente contestó algo?
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
    return {
      ok: false,
      status: 503,
      cuerpo: {
        error: porQueNoSirve(estadoDeCadaFuente),
        tipoIdentificacion: "fuente_sin_respuesta",
        ingresado,
        cedula,
        fuentes: estadoDeCadaFuente,
      },
    };
  }

  // ¿Existe esta persona?
  //
  // La fuente responde HTTP 200 aunque no exista: lo dice adentro del
  // cuerpo. Sin esta comprobación se guardaba un Perfil del Cliente
  // completo y en blanco, que desde afuera se ve igual que el de
  // alguien sin historial. Un analista podía leerlo como "esta
  // persona no tiene deudas" cuando en realidad esa persona no
  // existe.
  const noExiste = personaNoExiste(raw.general);
  if (noExiste) {
    const esRuc = o.tipoIdentificacion === "ruc_persona_natural";
    return {
      ok: false,
      status: 404,
      cuerpo: {
        error: esRuc
          ? `La fuente no encuentra a la persona con cédula ${cedula}, que son los 10 primeros dígitos del RUC ${ingresado}. Si ese RUC es de una empresa, hay que buscar al representante por su cédula.`
          : `La fuente no encuentra a ninguna persona con la cédula ${cedula}. El número es válido en su forma, así que puede ser un dígito cambiado o una cédula que la fuente todavía no tiene.`,
        tipoIdentificacion: "no_existe",
        ingresado,
        cedula,
      },
    };
  }

  return { ok: true, estadoDeCadaFuente };
}

export async function consultarYGuardarPerfil(o: OpcionesDeConsultaDePerfil): Promise<ResultadoDeConsultaDePerfil> {
  const { db, cedula, actorId } = o;

  // 1. Ingesta (con credenciales de servicio — sin pedirle nada al usuario)
  //    Recursos deshabilitados en proveedor_info_1_resource_config se saltan
  //    (ver _shared/runtime-config.ts).
  const disabledResources = await loadDisabledResources(db);
  const inicioIngesta = Date.now();
  const raw = await consultarTodasLasFuentes(cedula, undefined, disabledResources);

  // 2 y 3. ¿Contestó la fuente? ¿Existe la persona?
  const lectura = leerLaConsulta(raw, o);
  if (!lectura.ok) return lectura;
  const { estadoDeCadaFuente } = lectura;

  // 4. Cliente: obtener o crear.
  //
  // Recién acá, y no al principio. Dar de alta al cliente antes de
  // consultar dejaba una fila por cada número tecleado: quien escribía
  // una cédula que la fuente no conoce se llevaba un 404 y dejaba el
  // cliente creado. `clients` terminaba siendo la lista de lo que se
  // escribió, no la de las personas consultadas.
  let { data: client } = await db.from("clients").select("id").eq("cedula", cedula).maybeSingle();
  if (!client) {
    const { data: created, error: createError } = await db
      .from("clients")
      .insert({ cedula })
      .select("id")
      .single();
    if (createError) throw createError;
    client = created;
  }

  // 5. Estructura estandarizada
  const corteIess = await loadCorteIess(db, CORTE_IESS_CONOCIDO);
  const { profile, duracionFuentesMs } = buildStandardProfile(raw, cedula, corteIess);
  const duracionMs = Date.now() - inicioIngesta;

  // 6. Controles de bloqueo — determinísticos, no dependen del LLM.
  //     Perfil del Cliente necesita saber si hay un bloqueo activo
  //     para mostrar el aviso, aunque todavía no se corrió el
  //     Análisis con IA.
  const controlBloqueo = evaluarControlesBloqueo(raw, cedula);

  // 7. Persistir
  const { data: saved, error: saveError } = await db
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
  saved.crudo_ruta = await guardarCrudoProveedorInfo1(db, client.id, saved.id, cedula, raw);

  // 8. Auditoría (mismo patrón que analyze-client)
  await db.from("audit_log").insert({
    actor: actorId,
    action: "client.structure",
    client_id: client.id,
    // Desde un guion: "guion" desde el 2026-10-09 (E4); las anteriores de ese
    // día dicen "clave_de_servicio" y son lo mismo. Lo manda quien llama en
    // metaDeAuditoria.
    meta: { ...o.metaDeAuditoria, client_profile_id: saved.id },
  });

  // Desde la 090 el crudo queda en Storage (crudo-proveedor-info-1.ts). Antes se
  // descartaba, y sin crudo una regla nueva no se puede aplicar a los
  // perfiles guardados: el 2026-09-25 hubo que reconsultar la cartera para
  // eso. Devolverlo en la respuesta sigue sirviendo al guion de lotes, que
  // arma el respaldo local de research/.
  return o.devolverCrudo ? { ok: true, guardado: saved, crudo: raw } : { ok: true, guardado: saved };
}
