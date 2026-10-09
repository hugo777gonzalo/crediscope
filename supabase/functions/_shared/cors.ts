import { VERSION_DESPLIEGUE } from "./version-despliegue.ts";

// Qué páginas pueden llamar a las funciones desde un navegador.
//
// Hasta el 2026-10-09 era "*". Con la sesión en localStorage eso no
// abría una puerta concreta (otra página no puede leer el token), pero
// la auditoría de seguridad de ese día lo marcó: cualquier sitio podía
// armar pedidos contra las funciones desde el navegador de un usuario,
// y lo único que lo frenaba era otra capa. Ahora sólo contestan a la
// aplicación.
//
// La lista sale de la secret ORIGENES_PERMITIDOS (separada por comas)
// para poder sumar el dominio nuevo al mudar la publicación sin
// redesplegar. "*.algo.pages.dev" acepta los subdominios de vista previa
// de Cloudflare Pages. Sin la secret, valen la publicación actual y los
// puertos locales de Vite.
const PREDETERMINADOS = [
  "https://hugo777gonzalo.github.io",
  "http://localhost:5184",
  "http://localhost:5173",
  "http://localhost:4173",
];

const CONFIGURADOS = (Deno.env.get("ORIGENES_PERMITIDOS") ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const PERMITIDOS = CONFIGURADOS.length > 0 ? CONFIGURADOS : PREDETERMINADOS;

function estaPermitido(origen: string): boolean {
  return PERMITIDOS.some((p) =>
    p.startsWith("https://*.") ? origen.startsWith("https://") && origen.endsWith(p.slice("https://*".length)) : p === origen
  );
}

// Un origen que no está en la lista recibe el primero permitido: el
// navegador ve que no coincide y bloquea la respuesta. Los guiones y el
// programador de tareas no mandan Origin y no les afecta.
//
// Todas las respuestas pasan por acá, así que también llevan qué cambio de
// git está desplegado (version-despliegue.ts): el control de seguridad lo
// compara contra el repositorio.
export function cabecerasCors(req: Request): Record<string, string> {
  const origen = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": estaPermitido(origen) ? origen : PERMITIDOS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Expose-Headers": "x-crediscope-version",
    "x-crediscope-version": VERSION_DESPLIEGUE,
    "Vary": "Origin",
  };
}
