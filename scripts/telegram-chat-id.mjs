// Averigua a dónde mandar los avisos de Telegram.
//
// El identificador del destino no se elige: lo asigna Telegram y solo
// se puede leer de un mensaje que el bot haya recibido. Esto es lo que
// hace que el primer intento casi siempre devuelva una lista vacía --
// el bot existe pero nadie le habló todavía, o le hablaron en un grupo
// sin mencionarlo, que para el bot es lo mismo que el silencio.
//
// Espera hasta que llegue un mensaje y muestra los destinos
// encontrados, distinguiendo un chat personal de un grupo. Para el
// servicio conviene el grupo: sumar a alguien al equipo es agregarlo al
// grupo, sin tocar nada del sistema.
//
// Lee el token de .env.functions, que está excluido del repositorio,
// para que no haya que pegarlo en una terminal ni en un chat.
//
// Uso: node scripts/telegram-chat-id.mjs

import fs from "node:fs";
import path from "node:path";

const env = Object.fromEntries(
  fs
    .readFileSync(path.resolve(".env.functions"), "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const TOKEN = env.TELEGRAM_BOT_TOKEN;
if (!TOKEN) {
  console.error("Falta TELEGRAM_BOT_TOKEN en .env.functions.");
  console.error("Agregá la línea con el token que te dio BotFather y volvé a correr esto.");
  process.exit(1);
}

const ETIQUETA_TIPO = {
  private: "chat personal",
  group: "grupo",
  supergroup: "grupo",
  channel: "canal",
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function leerMensajes() {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getUpdates`);
  if (!res.ok) throw new Error(`Telegram respondió HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  if (!data.ok) throw new Error(`Telegram rechazó el pedido: ${JSON.stringify(data).slice(0, 200)}`);
  return data.result ?? [];
}

async function quienEs() {
  const res = await fetch(`https://api.telegram.org/bot${TOKEN}/getMe`);
  const data = await res.json();
  return data?.result?.username ?? null;
}

const usuario = await quienEs();
if (!usuario) {
  console.error("El token no es válido: Telegram no reconoce el bot.");
  process.exit(1);
}

console.log(`Bot: @${usuario}`);
console.log("Esperando un mensaje. Hacé una de las dos:");
console.log(`  · Abrí https://t.me/${usuario} y tocá Iniciar.`);
console.log(`  · O en el grupo donde quieras los avisos, escribí  /start@${usuario}`);
console.log("");

const destinos = new Map();
const hastaCuando = Date.now() + 5 * 60_000;

while (Date.now() < hastaCuando) {
  for (const u of await leerMensajes()) {
    const chat = u.message?.chat ?? u.my_chat_member?.chat ?? u.channel_post?.chat;
    if (!chat?.id) continue;
    if (!destinos.has(chat.id)) {
      destinos.set(chat.id, chat);
      const tipo = ETIQUETA_TIPO[chat.type] ?? chat.type;
      const nombre = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(" ") ?? "";
      console.log(`Encontrado: ${tipo} — ${nombre}`);
      console.log(`  TELEGRAM_CHAT_ID=${chat.id}`);
      console.log("");
    }
  }
  if (destinos.size > 0) {
    // Cinco segundos más por si también está por llegar el del grupo:
    // lo habitual es probar primero por privado.
    await dormir(5000);
    for (const u of await leerMensajes()) {
      const chat = u.message?.chat;
      if (chat?.id && !destinos.has(chat.id)) destinos.set(chat.id, chat);
    }
    break;
  }
  await dormir(3000);
}

if (destinos.size === 0) {
  console.log("No llegó ningún mensaje en cinco minutos.");
  console.log("Lo más probable: le escribiste al grupo sin mencionar al bot.");
  console.log(`Por defecto el bot NO ve los mensajes comunes de un grupo: tiene que ser /start@${usuario}`);
  process.exit(1);
}

const grupo = [...destinos.values()].find((c) => c.type === "group" || c.type === "supergroup");
if (grupo) {
  console.log(`Recomendado — el grupo "${grupo.title}": TELEGRAM_CHAT_ID=${grupo.id}`);
  console.log("Sumar a alguien al equipo es agregarlo al grupo, sin tocar el sistema.");
} else {
  console.log("Solo hay un chat personal. Sirve, pero conviene un grupo:");
  console.log("solo vos vas a recibir los avisos, y a las cuatro de la mañana eso importa.");
}
