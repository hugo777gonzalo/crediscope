// El cliente de Novadata con el plazo por fuente y el token compartido
// (auditoría externa del 2026-10-09, E5), contra un fetch falso: sin red y
// sin datos de nadie.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";

Deno.env.set("NOVADATA_BASE_URL", "https://novadata.prueba");
Deno.env.set("NOVADATA_USERNAME", "usuario");
Deno.env.set("NOVADATA_PASSWORD", "clave");

// Cada prueba importa su propia copia del módulo: el token se guarda en
// memoria del módulo y una prueba no puede heredar el de otra.
let copia = 0;
const cliente = () => import(`./novadata-client.ts?copia=${++copia}`);

type Fetch = typeof globalThis.fetch;
const fetchOriginal = globalThis.fetch;

// Un Novadata falso: cuenta los pedidos de token y deja colgada la fuente
// que se le diga hasta que el plazo la corte.
function novadataFalso({ colgada = "", tokenFalla = false } = {}) {
  const cuenta = { tokens: 0, fuentes: 0 };
  const falso: Fetch = (entrada, init) => {
    const url = String(entrada);
    if (url.includes("/openid-connect/token")) {
      cuenta.tokens++;
      if (tokenFalla) return Promise.resolve(new Response("no", { status: 401 }));
      return new Promise((r) =>
        setTimeout(() => r(Response.json({ access_token: "t", expires_in: 900 })), 10)
      );
    }
    cuenta.fuentes++;
    if (colgada && url.includes(colgada)) {
      return new Promise((_, rechazar) => {
        const senal = init?.signal;
        senal?.addEventListener("abort", () => rechazar(senal.reason));
      });
    }
    return Promise.resolve(Response.json({ estado: { codigo: "OK" }, datos: [1] }));
  };
  globalThis.fetch = falso;
  return cuenta;
}

const opciones = { sanitizeOps: false, sanitizeResources: false };

Deno.test({
  name: "una consulta pide un solo token, no uno por fuente",
  ...opciones,
  async fn() {
    const cuenta = novadataFalso();
    try {
      const { consultarTodasLasFuentes, RUTAS_POR_FUENTE } = await cliente();
      await consultarTodasLasFuentes("sin-cedula-1");
      assertEquals(cuenta.tokens, 1);
      assertEquals(cuenta.fuentes, Object.keys(RUTAS_POR_FUENTE).length);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  },
});

Deno.test({
  name: "dos consultas simultáneas comparten el pedido de token",
  ...opciones,
  async fn() {
    const cuenta = novadataFalso();
    try {
      const { consultarTodasLasFuentes } = await cliente();
      await Promise.all([consultarTodasLasFuentes("sin-cedula-1"), consultarTodasLasFuentes("sin-cedula-2")]);
      assertEquals(cuenta.tokens, 1);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  },
});

Deno.test({
  name: "una fuente colgada se corta en el plazo y las demás contestan",
  ...opciones,
  async fn() {
    novadataFalso({ colgada: "pn_inf_basica" });
    try {
      const { consultarTodasLasFuentes, duracionesPorFuente, fuentesQueAgotaronElPlazo, RUTAS_POR_FUENTE } = await cliente();
      const raw = await consultarTodasLasFuentes("sin-cedula-1", undefined, new Set(), 50);
      assertEquals(raw.general.status, "error");
      assertEquals(raw.general.tiempoAgotado, true);
      assertEquals(fuentesQueAgotaronElPlazo(raw), ["general"]);
      assertEquals(raw.direcciones.status, "ok");
      assertEquals(Object.keys(duracionesPorFuente(raw)).length, Object.keys(RUTAS_POR_FUENTE).length);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  },
});

Deno.test({
  name: "las fuentes apagadas no se piden ni tienen duración",
  ...opciones,
  async fn() {
    const cuenta = novadataFalso();
    try {
      const { consultarTodasLasFuentes, duracionesPorFuente, RUTAS_POR_FUENTE } = await cliente();
      const raw = await consultarTodasLasFuentes("sin-cedula-1", undefined, new Set(["hijos"]));
      assertEquals(raw.hijos.status, "deshabilitado");
      assertEquals(cuenta.fuentes, Object.keys(RUTAS_POR_FUENTE).length - 1);
      assertEquals("hijos" in duracionesPorFuente(raw), false);
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  },
});

Deno.test({
  name: "sin token, todas las fuentes quedan en error con el motivo y no se pide ninguna",
  ...opciones,
  async fn() {
    const cuenta = novadataFalso({ tokenFalla: true });
    try {
      const { consultarTodasLasFuentes } = await cliente();
      const raw = await consultarTodasLasFuentes("sin-cedula-1");
      assertEquals(cuenta.fuentes, 0);
      assertEquals(raw.general.status, "error");
      assertEquals(raw.general.errorMessage, "No se pudo autenticar con Novadata (HTTP 401)");
    } finally {
      globalThis.fetch = fetchOriginal;
    }
  },
});
