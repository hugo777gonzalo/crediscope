// La huella del pedido (auditoría externa del 2026-10-09, E1): el mismo
// pedido tiene que dar la misma huella, y cualquier cambio en lo que el
// modelo lee, otra. Si esto falla, analyze-client reutiliza análisis que no
// corresponden o deja de reutilizar los que sí.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { armarPedidoScoring, CONFIG_LLM, huellaDelPedido } from "./llm-scoring.ts";

const perfil = {
  identidad: { edad: 41 },
  laboral: { esIndependiente: false, empleosActuales: [] },
} as Record<string, unknown>;
const sinBloqueo = { bloqueado: false, hallazgos: [] };
const pedido = () => armarPedidoScoring(perfil, sinBloqueo, new Set());

Deno.test("el mismo pedido da la misma huella", async () => {
  assertEquals(await huellaDelPedido(pedido()), await huellaDelPedido(pedido()));
});

Deno.test("la huella es SHA-256 en hexadecimal", async () => {
  assertEquals(/^[0-9a-f]{64}$/.test(await huellaDelPedido(pedido())), true);
});

Deno.test("el orden de las claves no cambia la huella", async () => {
  const a = pedido();
  const b = Object.fromEntries(Object.entries(a).reverse());
  assertEquals(await huellaDelPedido(a), await huellaDelPedido(b));
});

Deno.test("cache_control y max_tokens no cambian la huella (lote y pantalla piden lo mismo)", async () => {
  const pantalla = pedido();
  const lote = armarPedidoScoring(perfil, sinBloqueo, new Set(), { ...CONFIG_LLM, maxTokens: 16_000, cachearMarco: true });
  assertEquals(await huellaDelPedido(lote), await huellaDelPedido(pantalla));
});

Deno.test("otro perfil da otra huella", async () => {
  const otro = armarPedidoScoring({ ...perfil, identidad: { edad: 42 } }, sinBloqueo, new Set());
  assertNotEquals(await huellaDelPedido(otro), await huellaDelPedido(pedido()));
});

Deno.test("un hallazgo de bloqueo da otra huella", async () => {
  const conHallazgo = armarPedidoScoring(perfil, { bloqueado: true, hallazgos: [{ code: "fallecido", message: "x", bloqueante: true }] } as never, new Set());
  assertNotEquals(await huellaDelPedido(conHallazgo), await huellaDelPedido(pedido()));
});

Deno.test("otro modelo u otro razonamiento dan otra huella", async () => {
  const base = await huellaDelPedido(pedido());
  const otroModelo = armarPedidoScoring(perfil, sinBloqueo, new Set(), { ...CONFIG_LLM, modelo: "otro-modelo" });
  const sinRazonar = armarPedidoScoring(perfil, sinBloqueo, new Set(), { ...CONFIG_LLM, razonamiento: "desactivado" });
  assertNotEquals(await huellaDelPedido(otroModelo), base);
  assertNotEquals(await huellaDelPedido(sinRazonar), base);
});

Deno.test("otro marco da otra huella", async () => {
  const a = pedido();
  const b = { ...a, system: [{ type: "text", text: "otro marco" }] };
  assertNotEquals(await huellaDelPedido(b), await huellaDelPedido(a));
});
