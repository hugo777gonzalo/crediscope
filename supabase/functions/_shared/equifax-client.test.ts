// El cliente de Equifax contra un Equifax falso: sin red, sin datos de nadie y
// sin credenciales reales. Lo que se prueba es lo que cuesta plata o abre una
// puerta: que un timeout no se repita, que el token se pida una vez, que la
// clave no salga en un mensaje y que el cónyuge no viaje.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals, assertFalse, assertStringIncludes } from "jsr:@std/assert@1";

const ENTORNO: Record<string, string> = {
  EQUIFAX_BASE_URL: "https://equifax.prueba",
  EQUIFAX_CLIENT_ID: "usuario-de-prueba",
  EQUIFAX_CLIENT_SECRET: "clave-de-prueba-que-no-sirve",
  EQUIFAX_BILL_TO: "FACT-1",
  EQUIFAX_SHIP_TO: "ENVIO-1",
  EQUIFAX_CONFIGURATION: "Config",
  EQUIFAX_CUSTOMER: "CLIENTE-1",
  EQUIFAX_MODEL: "MODELO-1",
  EQUIFAX_ESPERA_MS: "1",
  EQUIFAX_MAX_INTENTOS: "2",
  EQUIFAX_PLAZO_MS: "60",
};
const ponerEntorno = () => { for (const [k, v] of Object.entries(ENTORNO)) Deno.env.set(k, v); };
const quitarEntorno = () => { for (const k of Object.keys(ENTORNO)) Deno.env.delete(k); };

// El token se guarda en memoria del módulo: cada prueba importa su copia.
let copia = 0;
const cliente = () => import(`./equifax-client.ts?copia=${++copia}`);

type Fetch = typeof globalThis.fetch;
const fetchOriginal = globalThis.fetch;

interface Guion {
  // qué contesta la consulta, en orden; el último se repite
  consulta: Array<() => Promise<Response> | Response>;
  tokenFalla?: number; // HTTP con el que falla el token
}

// Un Equifax falso que cuenta cuántas veces le pegaron a cada ruta.
function equifaxFalso({ consulta, tokenFalla }: Guion) {
  const cuenta = { tokens: 0, consultas: 0, cuerpos: [] as string[] };
  const falso: Fetch = (entrada, init) => {
    const url = String(entrada);
    if (url.endsWith("/v2/oauth/token")) {
      cuenta.tokens++;
      if (tokenFalla) return Promise.resolve(new Response(JSON.stringify({ error: "invalid_client" }), { status: tokenFalla }));
      return Promise.resolve(
        new Response(JSON.stringify({ access_token: `token-de-prueba-${cuenta.tokens}`, token_type: "Bearer", expires_in: 86396 }), { status: 200 }),
      );
    }
    cuenta.cuerpos.push(String(init?.body ?? ""));
    const paso = consulta[Math.min(cuenta.consultas, consulta.length - 1)];
    cuenta.consultas++;
    return Promise.resolve(paso());
  };
  globalThis.fetch = falso;
  return cuenta;
}

const json = (cuerpo: unknown, status = 200, cabeceras: Record<string, string> = {}) => () =>
  new Response(JSON.stringify(cuerpo), { status, headers: cabeceras });

// Una consulta que no vuelve nunca: se corta cuando el plazo del cliente vence.
const colgada = (init?: RequestInit) =>
  new Promise<Response>((_, rechazar) => init?.signal?.addEventListener("abort", () => rechazar(init.signal!.reason)));

function conEntorno(nombre: string, prueba: () => Promise<void>) {
  Deno.test(nombre, async () => {
    ponerEntorno();
    try { await prueba(); } finally { globalThis.fetch = fetchOriginal; quitarEntorno(); }
  });
}

conEntorno("el pedido no tiene lugar para el cónyuge", async () => {
  const { armarPedido, PARAMETROS_DE_RELLENO } = await cliente();
  const pedido = armarPedido("0102030405", "C", PARAMETROS_DE_RELLENO, {
    billTo: "a", shipTo: "b", configuration: "c", customer: "d", model: "e",
  });
  const texto = JSON.stringify(pedido);
  assertFalse(/conyuge/i.test(texto), "el pedido no puede llevar datos del cónyuge");
  assertEquals(pedido.applicants.primaryConsumer.personalInformation.numeroDocumento, "0102030405");
  assertEquals(pedido.applicants.primaryConsumer.personalInformation.tipoProducto, "1");
});

conEntorno("una exitosa devuelve el JSON entero sin tocar", async () => {
  const { consultarEquifax, laConsultaEquifaxSirve } = await cliente();
  const cuerpo = { decision: { resultado: "X" }, listas: [{ a: 1 }, { a: 2 }] };
  const eq = equifaxFalso({ consulta: [json(cuerpo, 200, { "x-correlation-id": "abc-123", "set-cookie": "no-debe-pasar=1" })] });
  const r = await consultarEquifax("0102030405");
  assertEquals(r.status, "ok");
  assertEquals(r.cuerpo, cuerpo);
  assert(laConsultaEquifaxSirve(r));
  assertEquals(eq.tokens, 1);
  assertEquals(eq.consultas, 1);
  // de las cabeceras sólo viajan las que identifican la transacción
  assertEquals(r.cabeceras, { "x-correlation-id": "abc-123" });
});

conEntorno("varias consultas simultáneas piden un solo token", async () => {
  const { consultarEquifax } = await cliente();
  const eq = equifaxFalso({ consulta: [json({ ok: true })] });
  const rs = await Promise.all([consultarEquifax("0102030405"), consultarEquifax("0102030406"), consultarEquifax("0102030407")]);
  assertEquals(rs.every((r: { status: string }) => r.status === "ok"), true);
  assertEquals(eq.tokens, 1);
  assertEquals(eq.consultas, 3);
});

conEntorno("un timeout NO se reintenta: pudo haberse cobrado", async () => {
  const { consultarEquifax } = await cliente();
  const cuenta = { consultas: 0 };
  globalThis.fetch = ((entrada: string | URL | Request, init?: RequestInit) => {
    if (String(entrada).endsWith("/v2/oauth/token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "token-de-prueba", expires_in: 86396 })));
    }
    cuenta.consultas++;
    return colgada(init);
  }) as Fetch;
  const r = await consultarEquifax("0102030405");
  assertEquals(r.familia, "sin_respuesta");
  assertEquals(r.puedeHaberCobrado, true);
  assertEquals(cuenta.consultas, 1, "repetirlo pagaría dos veces");
  assertStringIncludes(r.mensaje ?? "", "pudo haberse procesado y cobrado");
});

conEntorno("un 503 del portón se reintenta con tope y no cobra", async () => {
  const { consultarEquifax } = await cliente();
  const eq = equifaxFalso({ consulta: [json({ error: "no" }, 503)] });
  const r = await consultarEquifax("0102030405");
  assertEquals(r.familia, "transitorio");
  assertEquals(r.httpStatus, 503);
  assertEquals(eq.consultas, 2, "1 intento + 1 reintento");
  assertEquals(r.puedeHaberCobrado, false);
});

conEntorno("un 503 que se arregla al segundo intento termina bien", async () => {
  const { consultarEquifax } = await cliente();
  const eq = equifaxFalso({ consulta: [json({}, 503), json({ listo: true })] });
  const r = await consultarEquifax("0102030405");
  assertEquals(r.status, "ok");
  assertEquals(r.intentos, 2);
  assertEquals(eq.consultas, 2);
});

conEntorno("un 401 renueva el token y repite una vez", async () => {
  const { consultarEquifax } = await cliente();
  const eq = equifaxFalso({ consulta: [json({}, 401), json({ listo: true })] });
  const r = await consultarEquifax("0102030405");
  assertEquals(r.status, "ok");
  assertEquals(eq.tokens, 2);
  assertEquals(eq.consultas, 2);
});

conEntorno("un 401 que se repite es de configuración y no insiste", async () => {
  const { consultarEquifax } = await cliente();
  const eq = equifaxFalso({ consulta: [json({}, 401)] });
  const r = await consultarEquifax("0102030405");
  assertEquals(r.familia, "configuracion");
  assertEquals(eq.consultas, 2, "el original y el repetido con token nuevo");
});

conEntorno("un 400 es de la solicitud y no se reintenta", async () => {
  const { consultarEquifax } = await cliente();
  const eq = equifaxFalso({ consulta: [json({ message: "campo inválido" }, 400)] });
  const r = await consultarEquifax("0102030405");
  assertEquals(r.familia, "solicitud");
  assertEquals(eq.consultas, 1);
  assertEquals(r.puedeHaberCobrado, false);
});

conEntorno("un 200 que no es JSON no es una consulta", async () => {
  const { consultarEquifax, laConsultaEquifaxSirve } = await cliente();
  equifaxFalso({ consulta: [() => new Response("<html>mantenimiento</html>", { status: 200 })] });
  const r = await consultarEquifax("0102030405");
  assertFalse(laConsultaEquifaxSirve(r));
  assertEquals(r.familia, "desconocido");
  assertEquals(r.puedeHaberCobrado, true, "no se sabe: hay que revisar antes de repetir");
});

conEntorno("si el token falla por credenciales no se consulta nada", async () => {
  const { consultarEquifax } = await cliente();
  const eq = equifaxFalso({ consulta: [json({})], tokenFalla: 401 });
  const r = await consultarEquifax("0102030405");
  assertEquals(r.familia, "configuracion");
  assertEquals(eq.consultas, 0);
  assertEquals(r.puedeHaberCobrado, false);
});

conEntorno("una identificación mal formada no sale a la red", async () => {
  const { consultarEquifax } = await cliente();
  const eq = equifaxFalso({ consulta: [json({})] });
  for (const mala of ["", "  ", "123", "01020304051", "01020304ab", "0102030405; drop"]) {
    const r = await consultarEquifax(mala);
    assertEquals(r.familia, "solicitud", `"${mala}"`);
  }
  assertEquals(eq.tokens + eq.consultas, 0);
});

conEntorno("sin configuración no sale a la red", async () => {
  const { consultarEquifax } = await cliente();
  Deno.env.delete("EQUIFAX_CLIENT_SECRET");
  const eq = equifaxFalso({ consulta: [json({})] });
  const r = await consultarEquifax("0102030405");
  assertEquals(r.status, "sin_config");
  assertEquals(eq.tokens + eq.consultas, 0);
  assertStringIncludes(r.detalleTecnico ?? "", "EQUIFAX_CLIENT_SECRET");
});

conEntorno("la clave y el token no salen en ningún mensaje, aunque el servidor los repita", async () => {
  const { consultarEquifax, sanitizar } = await cliente();
  const basic = "Basic " + btoa("usuario-de-prueba:clave-de-prueba-que-no-sirve");
  equifaxFalso({ consulta: [json({ detalle: `recibí ${basic} y Bearer token-de-prueba-1` }, 400)] });
  const r = await consultarEquifax("0102030405");
  const todo = JSON.stringify(r);
  assertFalse(todo.includes("clave-de-prueba"), "la clave salió");
  assertFalse(todo.includes(btoa("usuario-de-prueba:clave-de-prueba-que-no-sirve")), "el encabezado Basic salió");
  assertFalse(todo.includes("token-de-prueba-1"), "el token salió");
  assertEquals(sanitizar("sin nada raro"), "sin nada raro");
});

conEntorno("el ambiente se deriva del host y ante la duda es prueba", async () => {
  const { ambienteEquifax } = await cliente();
  assertEquals(ambienteEquifax(), "prueba");
  Deno.env.set("EQUIFAX_BASE_URL", "https://api.latam.equifax.com/");
  assertEquals(ambienteEquifax(), "produccion");
  Deno.env.set("EQUIFAX_BASE_URL", "no es una url");
  assertEquals(ambienteEquifax(), "prueba");
});
