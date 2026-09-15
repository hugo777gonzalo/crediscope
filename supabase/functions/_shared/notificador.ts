// El canal de aviso: cómo sale del sistema la noticia de que algo pasa.
//
// POR QUÉ TELEGRAM PRIMERO
//
// El requisito real es "que llegue al teléfono de alguien en segundos,
// sin que esa persona tenga que abrir nada". Contra eso:
//
//   correo       llega, pero a las 4 de la mañana nadie lo mira, y con
//                el tiempo cae en la carpeta que nadie revisa. Sirve
//                para dejar constancia, no para despertar.
//   mensajería   cuesta por mensaje, exige plantillas aprobadas y un
//   comercial    número verificado. Es lo correcto para avisarle a un
//                cliente; es desproporcionado para avisarnos a nosotros.
//   Telegram     gratis, instantáneo, admite un grupo para el equipo y
//                se configura con dos valores. Es lo que hay que
//                construir primero porque es lo que se va a usar.
//
// Por eso esto es un canal detrás de una función y no una llamada
// directa: cuando haya un acuerdo firmado que exija avisarle al cliente
// por otro medio, se agrega acá sin tocar quien avisa.
//
// LA REGLA QUE NO SE NEGOCIA
//
// Un aviso que no se pudo mandar se registra igual, con estado
// `sin_canal`. Un sistema de alertas que calla cuando no puede hablar
// es indistinguible de uno donde no pasó nada -- y esa confusión es la
// que vinimos a resolver.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TELEGRAM_CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";

export interface Aviso {
  // incidente_abierto | incidente_cerrado | presupuesto
  tipo: string;
  // Sobre qué. Junto al tipo forma la llave que impide repetir el mismo
  // aviso: el id del incidente, o "2026-09:70" para el 70% de
  // septiembre.
  referencia: string;
  titulo: string;
  cuerpo?: string;
}

export function hayCanal(): boolean {
  return Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID);
}

async function enviarPorTelegram(texto: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TELEGRAM_CHAT_ID,
        text: texto,
        // Sin formato enriquecido: un mensaje de alerta con un carácter
        // suelto que el formateador no acepta se rechaza entero, y
        // justo ese es el que no se puede perder.
        disable_web_page_preview: true,
      }),
    });
    if (!res.ok) return { ok: false, error: `Telegram HTTP ${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `no se pudo contactar a Telegram: ${String(err)}` };
  }
}

/**
 * Manda el aviso una sola vez. Devuelve `true` si esta llamada fue la
 * que lo registró (haya salido o no), `false` si ya estaba registrado.
 *
 * El control de repetición es la restricción única de la tabla y no una
 * consulta previa: entre consultar y escribir pueden pasar dos vigías a
 * la vez, y el que pierde tiene que enterarse por el error, no mandar
 * un segundo mensaje.
 */
export async function avisar(client: SupabaseClient, aviso: Aviso): Promise<boolean> {
  const texto = aviso.cuerpo ? `${aviso.titulo}\n\n${aviso.cuerpo}` : aviso.titulo;

  // Se reserva el aviso ANTES de mandarlo. Si se mandara primero y la
  // fila fallara, el mensaje ya salió y el próximo vigía lo mandaría de
  // nuevo.
  const { error: errorReserva } = await client.from("alertas").insert({
    tipo: aviso.tipo,
    referencia: aviso.referencia,
    canal: hayCanal() ? "telegram" : null,
    estado: hayCanal() ? "fallida" : "sin_canal",
    titulo: aviso.titulo,
    cuerpo: aviso.cuerpo ?? null,
    detalle: hayCanal() ? null : "No hay canal de aviso configurado: faltan TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID.",
  });

  // 23505 = ya existe. No es un error: es el mecanismo funcionando.
  if (errorReserva) {
    if (errorReserva.code === "23505") return false;
    console.error("No se pudo registrar el aviso:", errorReserva.message);
    return false;
  }

  if (!hayCanal()) return true;

  const r = await enviarPorTelegram(texto);
  await client
    .from("alertas")
    .update({
      estado: r.ok ? "enviada" : "fallida",
      detalle: r.error ?? null,
    })
    .eq("tipo", aviso.tipo)
    .eq("referencia", aviso.referencia);

  return true;
}
