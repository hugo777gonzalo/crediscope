import { copyFileSync } from "node:fs";
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

export default defineConfig(({ command }) => ({
  plugins: [react(), paginaDeRespaldoParaRutas()],
  base: command === "build" ? "/crediscope/" : "/",
}));
