// Consulta un lote de cédulas contra la fuente de datos y genera el
// Perfil del Cliente de cada una -- con su estructura estandarizada y
// su clasificación de fuentes de ingreso.
//
// NO pasa por el modelo de lenguaje: structure-client hace ingesta,
// normalización y módulo de ingresos, todo determinístico. Por eso este
// proceso funciona aunque el tope de consumo del proveedor de IA esté
// alcanzado, y por eso no cuesta nada más que tiempo.
//
// TRES DECISIONES QUE HACEN QUE ESTO SIRVA PARA MILES
//
// 1. Reanudable. Cada resultado se escribe en el momento a un archivo
//    de línea por cédula. Si el proceso se corta -- y en dos horas de
//    corrida se corta -- volver a lanzarlo retoma donde quedó en vez de
//    empezar de cero.
//
// 2. Concurrencia con cola, no por tandas. Repartir en bloques de N y
//    esperar a que termine el bloque deja hilos ociosos esperando al
//    más lento de cada tanda; una cola mantiene los N ocupados todo el
//    tiempo. Con consultas que tardan entre 20 y 90 segundos, la
//    diferencia es de horas.
//
// 3. Los fallos no detienen nada y quedan anotados con su causa. Una
//    cédula que no existe en la fuente no puede abortar las otras dos
//    mil.
//
// SOBRE LA CONCURRENCIA -- medido, no supuesto
//
// El cuello de botella NO es la fuente de datos: es el límite de
// cómputo de la función que la consulta. Con 36 pedidos en paralelo la
// mediana de una consulta pasó de 41 a 86 segundos, el 28% de las
// exitosas necesitó reintento y aparecieron dos errores que solo salen
// por saturación: WORKER_RESOURCE_LIMIT y el corte a los 150 segundos.
//
// Más hilos no es más rápido a partir de cierto punto: los pedidos
// hacen cola adentro de la función, cada uno tarda más, los de la cola
// se cortan por tiempo y se reintentan -- trabajo pagado dos veces. Si
// vuelven a aparecer esos dos errores, BAJAR la concurrencia.
//
// Uso:
//   node scripts/consultar-lote.mjs <archivo-de-cedulas> [concurrencia]

import fs from "node:fs";
import path from "node:path";

const ARCHIVO = process.argv[2] ?? "research/cedulas_lote_2026-09-15.txt";
const CONCURRENCIA = Number(process.argv[3] ?? 24);
const SALIDA = path.resolve(`research/lote-${path.basename(ARCHIVO, ".txt")}.jsonl`);

// Reintentos para lo pasajero. Mismo criterio que el análisis: el
// proveedor puede tener un mal momento y eso no es una cédula sin
// datos.
const INTENTOS = 3;
const ESPERA_BASE_MS = 2000;

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

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function leerCedulas() {
  const crudas = fs
    .readFileSync(path.resolve(ARCHIVO), "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^\d{10}$/.test(l));
  return [...new Set(crudas)];
}

// Lo ya hecho en corridas anteriores. Solo cuentan los éxitos: una
// cédula que falló se vuelve a intentar, porque la causa pudo ser
// pasajera.
function leerHechas() {
  if (!fs.existsSync(SALIDA)) return new Set();
  const hechas = new Set();
  for (const linea of fs.readFileSync(SALIDA, "utf8").split(/\r?\n/)) {
    if (!linea.trim()) continue;
    try {
      const r = JSON.parse(linea);
      if (r.ok) hechas.add(r.cedula);
    } catch {
      // Línea a medio escribir de una corrida interrumpida: se ignora.
    }
  }
  return hechas;
}

async function consultarUna(cedula) {
  for (let intento = 1; intento <= INTENTOS; intento++) {
    const t0 = Date.now();
    try {
      const res = await fetch(`${env.SUPABASE_URL}/functions/v1/structure-client`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
          apikey: env.SUPABASE_SERVICE_ROLE_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cedula }),
      });
      const segundos = Math.round((Date.now() - t0) / 1000);

      if (res.ok) {
        const data = await res.json();
        const f = data?.standard_profile?.fuentesIngreso ?? null;
        return {
          cedula,
          // Cuándo terminó. Sin esto el ritmo real solo se puede
          // deducir de los avisos de progreso, que vienen redondeados
          // -- y con tandas que terminan en bloque, esa cuenta da
          // tiempos negativos. Una corrida de dos horas tiene que poder
          // explicarse después.
          fin: new Date().toISOString(),
          ok: true,
          perfilId: data?.id ?? null,
          segmento: f?.segmento ?? null,
          estado: f?.estadoSegmento ?? null,
          piso: f?.pisoIngresoMensualReportado ?? null,
          segundos,
          intento,
        };
      }

      const texto = (await res.text()).slice(0, 300);
      // 4xx que no sea 429: la cédula o el pedido tienen un problema
      // que no se arregla repitiendo.
      if (res.status >= 400 && res.status < 500 && res.status !== 429) {
        return { cedula, fin: new Date().toISOString(), ok: false, http: res.status, error: texto, segundos, intento };
      }
      if (intento === INTENTOS) {
        return { cedula, fin: new Date().toISOString(), ok: false, http: res.status, error: texto, segundos, intento };
      }
    } catch (err) {
      if (intento === INTENTOS) {
        return { cedula, ok: false, error: String(err).slice(0, 300), segundos: Math.round((Date.now() - t0) / 1000), intento };
      }
    }
    await dormir(ESPERA_BASE_MS * Math.pow(2, intento - 1) * (0.7 + Math.random() * 0.6));
  }
}

async function main() {
  const todas = leerCedulas();
  const hechas = leerHechas();
  const pendientes = todas.filter((c) => !hechas.has(c));

  console.log(`archivo: ${ARCHIVO}`);
  console.log(`cédulas únicas: ${todas.length} | ya consultadas: ${hechas.size} | por consultar: ${pendientes.length}`);
  console.log(`concurrencia: ${CONCURRENCIA} | salida: ${SALIDA}`);
  if (pendientes.length === 0) {
    console.log("No queda nada por consultar.");
    return;
  }

  const salida = fs.createWriteStream(SALIDA, { flags: "a" });
  const arranque = Date.now();
  let siguiente = 0;
  let listas = 0;
  let fallidas = 0;

  async function trabajador() {
    while (true) {
      const i = siguiente++;
      if (i >= pendientes.length) return;
      const r = await consultarUna(pendientes[i]);
      salida.write(JSON.stringify(r) + "\n");
      listas++;
      if (!r.ok) fallidas++;

      if (listas % 25 === 0 || listas === pendientes.length) {
        const min = (Date.now() - arranque) / 60000;
        const ritmo = listas / min;
        const restan = (pendientes.length - listas) / Math.max(ritmo, 0.01);
        console.log(
          `${listas}/${pendientes.length} | ${fallidas} fallidas | ${ritmo.toFixed(1)}/min | faltan ~${Math.round(restan)} min`
        );
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCIA, pendientes.length) }, trabajador));
  salida.end();

  const min = ((Date.now() - arranque) / 60000).toFixed(1);
  console.log(`\nTERMINADO en ${min} min: ${listas - fallidas} con perfil, ${fallidas} fallidas.`);
}

main().catch((err) => {
  console.error("El lote se detuvo:", err);
  process.exit(1);
});
