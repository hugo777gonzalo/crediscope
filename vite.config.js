import { copyFileSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages sirve archivos estáticos: sabe de /crediscope/index.html
// pero no de /crediscope/login, que no es un archivo sino una ruta que
// resuelve React Router dentro de la aplicación ya cargada.
//
// Mientras se navega por la app no se nota, porque el enrutador cambia
// la URL sin pedirle nada al servidor. Pero al recargar, o al abrir un
// enlace guardado, el navegador sí le pide esa ruta a GitHub y responde
// 404. Le pasa a cualquier dirección que no sea la raíz.
//
// La convención de GitHub Pages para esto es 404.html: lo sirve ante
// cualquier ruta desconocida. Si es una copia del index, la aplicación
// arranca igual, lee la URL y muestra la pantalla correcta. El usuario
// no ve ningún rodeo.
function paginaDeRespaldoParaRutas() {
  return {
    name: "copia-404",
    closeBundle() {
      const dist = resolve(process.cwd(), "dist");
      copyFileSync(resolve(dist, "index.html"), resolve(dist, "404.html"));
    },
  };
}

// Cloudflare Pages (la publicación nueva desde el 2026-10-09, con el
// repositorio privado) marca su compilación con CF_PAGES=1. Ahí la app
// vive en la raíz del dominio, no en /crediscope/, y el 404.html sobra:
// sin él, Cloudflare ya trata al sitio como una aplicación de una sola
// página y devuelve el index para cualquier ruta.
const enCloudflare = Boolean(process.env.CF_PAGES);

// Las cabeceras de public/_headers también en `vite preview`, para probar
// la política de contenido en local antes de publicarla: una CSP que
// bloquea algo no da error de compilación, deja la pantalla en blanco.
function cabecerasDePublicacion() {
  const lineas = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8").split(/\r?\n/);
  return Object.fromEntries(
    lineas
      .filter((l) => /^\s+[A-Za-z-]+:\s/.test(l))
      .map((l) => [l.trim().slice(0, l.trim().indexOf(":")), l.trim().slice(l.trim().indexOf(":") + 1).trim()])
  );
}

// `vite preview` sirve lo compilado: necesita la misma base que la
// compilación, o el HTML pide /crediscope/assets/... y recibe 404.
export default defineConfig(({ command, isPreview }) => ({
  plugins: [react(), ...(enCloudflare ? [] : [paginaDeRespaldoParaRutas()])],
  base: (command === "build" || isPreview) && !enCloudflare ? "/crediscope/" : "/",
  preview: { headers: cabecerasDePublicacion() },
}));
