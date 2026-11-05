// Cerrojo de QA: frena en la página todo lo que se cobra, consulta a una persona o
// escribe en la base, y cuenta cuántas veces se intentó.
//
// Por qué existe: el perfil «el que rompe» hace doble clic en todo. En CrediScope un
// doble clic en «Analizar» son dos llamadas al modelo, en «Consultar a Equifax» dos
// consultas cobradas, y en «Consultar» dos consultas de una persona real, que una
// prueba en producción no hace (CLAUDE.md). Con el cerrojo, el doble clic se mide
// (cuántos envíos salieron) sin que salga ninguno.
//
// Se carga igual que el verificador de revision-ux, una vez por carga completa de la
// página (navigate o recarga lo borran; history.pushState no):
//   const r = await fetch('/.claude/skills/qa-crediscope/cerrojo.js'); (0, eval)(await r.text());
//
// supabase-js resuelve `fetch` en cada llamada (resolveFetch, 2.117), así que
// reemplazar window.fetch alcanza. Si una versión nueva lo capturara al crear el
// cliente, las lecturas de la app dejarían de pasar por acá: después de cambiar de
// pantalla con pushState, `leer().pasaron` tiene que ser mayor que cero. Si da cero,
// el cerrojo no protege nada y no se prueba ningún botón que se cobre.

(() => {
  if (window.__cerrojoQa) return;

  // Funciones que no consultan fuentes ni al modelo (cálculo puro).
  const FUNCIONES_PERMITIDAS = new Set(["simular-credito", "capacidad-de-pago"]);

  // RPC de sólo lectura que usa la pantalla (src/lib/api.js). Una RPC nueva queda
  // frenada hasta sumarla acá: mejor un falso aviso que una escritura.
  // registrar_evento pasa: que la auditoría registre la revisión de QA es correcto.
  const RPC_PERMITIDAS = new Set([
    "agregar_por_campo", "bandeja_conteos", "metricas_gerenciales", "resumen_fuentes_ingreso",
    "lab_calidad_de_la_carga", "lab_centro_de_datos", "lab_cobertura_de_la_estructura",
    "lab_motivos_de_cada_malo", "lab_volumen_de_analisis", "lab_simular_politica",
    "registrar_evento",
  ]);

  const original = window.fetch;
  const frenadas = [];
  let pasaron = 0;
  let demoraMs = 0;

  // La ruta de la app lleva la cédula (/perfil/:cedula): se tapa antes de anotarla.
  const tapar = (s) => String(s).replace(/\d{7,}/g, "#######");

  function motivoParaFrenar(url, metodo) {
    const ruta = new URL(url, location.href).pathname;
    if (ruta.startsWith("/functions/v1/")) {
      const f = ruta.split("/")[3];
      return FUNCIONES_PERMITIDAS.has(f) ? null : `función ${f}`;
    }
    if (ruta.startsWith("/rest/v1/rpc/")) {
      const f = ruta.split("/")[4];
      return RPC_PERMITIDAS.has(f) ? null : `rpc ${f}`;
    }
    if ((ruta.startsWith("/rest/v1/") || ruta.startsWith("/storage/v1/")) && !["GET", "HEAD"].includes(metodo)) {
      return `${metodo} ${ruta.split("/")[3]}`;
    }
    // Salir de la cuenta cerraría la sesión que abrió el usuario: no la puedo reabrir.
    if (ruta.startsWith("/auth/v1/logout")) return "salir de la cuenta";
    return null;
  }

  window.fetch = async (...a) => {
    const req = a[0] instanceof Request ? a[0] : null;
    const url = String(req?.url ?? a[0]);
    const metodo = String(a[1]?.method ?? req?.method ?? "GET").toUpperCase();
    const motivo = motivoParaFrenar(url, metodo);
    if (motivo) {
      frenadas.push({ que: motivo, pantalla: tapar(location.pathname), ms: Math.round(performance.now()) });
      return new Response(JSON.stringify({ message: "Frenado por el cerrojo de QA", code: "QA_CERROJO" }), {
        status: 418,
        headers: { "content-type": "application/json" },
      });
    }
    pasaron++;
    if (demoraMs) await new Promise((r) => setTimeout(r, demoraMs));
    return original(...a);
  };

  window.__cerrojoQa = {
    // Lo frenado desde la última vez que se leyó, y se vacía.
    leer() {
      const salida = { frenadas: frenadas.splice(0), pasaron };
      pasaron = 0;
      return salida;
    },
    // Envíos repetidos: el mismo motivo dos veces o más en menos de `ventanaMs`.
    // Es el hallazgo del doble clic: el botón no se deshabilitó al primer envío.
    repetidas(ventanaMs = 1500) {
      const vistas = {};
      for (const f of frenadas) (vistas[f.que] ??= []).push(f.ms);
      return Object.entries(vistas)
        .filter(([, ts]) => ts.length > 1 && ts[ts.length - 1] - ts[0] < ventanaMs)
        .map(([que, ts]) => ({ que, veces: ts.length }));
    },
    // Red lenta: demora cada lectura que pasa. 1500 ms se parece a una 3G mala.
    lento(ms) { demoraMs = ms; },
    // Doble clic sobre un botón por su texto visible, en la misma llamada que comprueba
    // que el cerrojo está puesto: un clic de `computer` podría caer después de una
    // recarga que lo borró.
    async dobleClic(texto, { veces = 2, entreMs = 80 } = {}) {
      if (window.fetch === original) throw new Error("El cerrojo no está puesto");
      const boton = [...document.querySelectorAll("button, a, [role=button]")]
        .find((b) => b.textContent.trim().toLowerCase().includes(texto.toLowerCase()));
      if (!boton) return { encontrado: false };
      frenadas.length = 0;
      for (let i = 0; i < veces; i++) {
        boton.click();
        await new Promise((r) => setTimeout(r, entreMs));
      }
      await new Promise((r) => setTimeout(r, 1500));
      return { encontrado: true, deshabilitado: boton.disabled === true, frenadas: frenadas.map((f) => f.que), repetidas: this.repetidas() };
    },
    // Comprueba que frena de verdad: una escritura a una tabla que no existe.
    async probar() {
      const r = await window.fetch(new URL("/rest/v1/qa_cerrojo_prueba", location.href), { method: "POST" });
      frenadas.length = 0;
      return r.status === 418 ? "frena" : `NO FRENA (${r.status})`;
    },
    quitar() {
      window.fetch = original;
      delete window.__cerrojoQa;
    },
  };
})();
