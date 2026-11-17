// Prueba el FORMATO del banco de casos de oro (scripts/banco-de-casos-de-oro/):
// campos obligatorios, valores permitidos, referencias bien formadas y nada con
// forma de cédula, de monto o de nombre en un caso real. Sin base, sin red y sin
// modelo: lee los JSON. Corre en el control `guiones` de cada PR.
//
// No prueba si el modelo cumple los casos: eso es el corredor (README del banco).
//
// AVISO: este guion no pasa por lint ni build.
//
// Uso: node scripts/probar-banco-de-casos.mjs

import path from "node:path";
import { pathToFileURL } from "node:url";
import { leerCasos, textoQueParecePersonal, validarCaso } from "./banco-de-casos-de-oro/formato.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
// La lista de identificaciones del sandbox se importa del código, no se copia: un
// caso de una identificación que el sandbox ya no tiene tiene que fallar acá.
const { IDENTIFICACIONES_DEL_SANDBOX } = await import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared/sandbox-casos.ts")).href);

let fallas = 0;
function control(nombre, ok, detalle = "") {
  if (!ok) fallas++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre}${detalle ? `\n      ${detalle}` : ""}`);
}

// 1. Los casos del banco
const leidos = leerCasos();
const ids = new Set();
for (const { archivo, caso, error } of leidos) {
  if (error) {
    control(archivo, false, error);
    continue;
  }
  const errores = validarCaso(caso, archivo, { identificacionesDelSandbox: IDENTIFICACIONES_DEL_SANDBOX });
  if (ids.has(caso.id)) errores.push("id repetido.");
  ids.add(caso.id);
  control(archivo, errores.length === 0, errores.join("\n      "));
}

// El banco arranca con 25 casos (12 del piloto, 5 observaciones, 8 del sandbox):
// que no se pierdan en silencio al mover archivos.
const porFuente = (f) => leidos.filter((l) => l.caso?.fuente === f).length;
control("al menos 25 casos", leidos.length >= 25, `hay ${leidos.length}`);
control("los 8 casos del sandbox", IDENTIFICACIONES_DEL_SANDBOX.every((i) => ids.has(`sandbox-${i}`)));
control("al menos 12 casos del piloto", porFuente("piloto_revision_del_analisis") >= 12, `hay ${porFuente("piloto_revision_del_analisis")}`);
control("al menos 5 observaciones del negocio", porFuente("observacion_del_negocio") >= 5, `hay ${porFuente("observacion_del_negocio")}`);

// 2. Que la prueba atrape lo que tiene que atrapar: un validador que deja pasar todo
// también da verde.
const bueno = leidos.find((l) => l.caso?.id?.startsWith("c-"))?.caso;
const con = (cambio) => ({ ...structuredClone(bueno), ...cambio });
const rechaza = (nombre, caso, archivo = `${caso.id}.json`) => control(`rechaza ${nombre}`, validarCaso(caso, archivo).length > 0);

if (bueno) {
  rechaza("una cédula en un caso real", con({ tema: "Persona 1712345678 con atraso." }));
  rechaza("un monto en un caso real", con({ dictamen: ["Debe $12.500 en bancos.", "Negar."] }));
  rechaza("una cifra con miles", con({ dictamen: ["Debe 12.500 en bancos.", "Negar."] }));
  rechaza("un nombre en mayúsculas", con({ dictamen: ["Trabaja en EMPRESA INVENTADA.", "Negar."] }));
  rechaza("una referencia mal formada", con({ id: "c-12345" }), "c-12345.json");
  rechaza("un archivo con otro nombre", con({}), "otro.json");
  rechaza("una recomendación fuera de la lista", con({ recomendacion_hoy: "observar" }));
  rechaza("una salida mayor fuera de la lista", con({ salida_version_mayor: "aprobado" }));
  rechaza("negar hoy con Aprobar en la mayor", con({ recomendacion_hoy: "negar", salida_version_mayor: "aprobar", hoy_tambien_aceptable: [] }));
  rechaza("un dictamen de una línea", con({ dictamen: ["Negar."] }));
  rechaza("un perfil copiado al caso", con({ perfil: { ...bueno.perfil, standard_profile: {} } }));
  rechaza("un patrón que no compila", con({ afirmaciones: { ...bueno.afirmaciones, automaticas: [{ tipo: "texto_prohibido", patron: "(", campos: ["todo"], porque: "x" }] } }));
  rechaza("una acción desconocida", con({ afirmaciones: { ...bueno.afirmaciones, automaticas: [{ tipo: "accion", accion: "llamar", porque: "x" }] } }));
  rechaza("un campo de más", con({ cedula: "x" }));
}
control("acepta años y relaciones", textoQueParecePersonal("La demanda de 2009 pesa menos; la deuda supera el ingreso de un año y el 63% está en bancos.") === null);
control("acepta las siglas", textoQueParecePersonal("El saldo del BIESS y la pensión del SUPA.") === null);

console.log(fallas ? `\n${fallas} fallas.` : `\nTodo bien: ${leidos.length} casos.`);
process.exit(fallas ? 1 : 0);
