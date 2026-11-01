// La estimación de ingreso, de punta a punta y sin base.
//
// Dos pruebas, como en predictor-ingresos.test.ts (el modelo entrenado vive fuera de git):
//   - Siempre, con un modelo CHICO inventado: el selector, los bloques de la respuesta, el
//     reloj, los rótulos, la fila que se guarda y el cargador. Y de los casos de oro, que el
//     perfil da las variables calculadas aparte en Python.
//   - Sólo si existe PREDICTOR_INGRESOS_MODELOS: los casos de oro contra el modelo real, con
//     los cuantiles del evaluador de referencia. En Windows, desde PowerShell:
//
//   $env:PREDICTOR_INGRESOS_MODELOS="C:\datos\ingresos\modelos\exportado"
//   deno test --no-lock --allow-env --allow-read supabase/functions/_shared/estimacion-de-ingreso.test.ts

import { assert, assertAlmostEquals, assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import oro from "../../../scripts/predictor-ingresos/casos-de-oro/estimaciones-nivel1.json" with { type: "json" };
import {
  armarEstimacion,
  crearCargadorDeModelo,
  decidirEstimacion,
  DIAS_DE_UNA_CONSULTA_RECIENTE,
  type FilaDeModelo,
  huellaSha256,
  ingresoVerificado,
  type ModeloVigente,
  type RespuestaDeEstimacion,
} from "./estimacion-de-ingreso.ts";
import { FORMATO_DE_ARBOLES, leerModeloComprimido, type ModeloExportado, prepararModelo } from "./predictor-ingresos.ts";
import { type PerfilParaIngreso, VARIABLES_DE_INGRESO_VERSION, VARIABLES_DEL_NIVEL_1, vectorDeNivel1 } from "./variables-de-ingreso.ts";

const NIVELES = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95];
const CONSULTA = "2026-10-15T17:00:00Z";
const AHORA = new Date("2026-10-30T12:00:00Z");
const ID = "11111111-1111-4111-8111-111111111111";

// ---------------------------------------------------------------- lo inventado

// Un árbol de una sola hoja por cuantil: lo que sale no depende de la entrada y se puede
// elegir el mínimo. Los dólares de cada cuantil suben parejo desde `base` (el del 0,10 es base).
function archivoDeModelo(base: number, version = "ingreso-prueba"): ModeloExportado {
  const dolares = NIVELES.map((_, k) => base * (1 + 0.1 * (k - 1)));
  return {
    formato: FORMATO_DE_ARBOLES, version, nivel: 1, entrenado_el: "2026-10-29", cuantiles: NIVELES, arboles_por_cuantil: 1,
    variables: VARIABLES_DEL_NIVEL_1.map((nombre) =>
      nombre === "genero" ? { nombre, tipo: "categorica" as const, categorias: ["FEMENINO", "MASCULINO"] }
      : nombre === "sri_estado" ? { nombre, tipo: "categorica" as const, categorias: ["ACTIVO", "SUSPENDIDO"] }
      : { nombre, tipo: "numerica" as const }
    ),
    arboles: NIVELES.map((_, k) => -1 - k),
    nodos: { variable: [], umbral: [], categorica: [], falta: [], falta_izquierda: [], izquierda: [], derecha: [] },
    conjuntos: [],
    hojas: dolares.map(Math.log),
  };
}

const vigenteDe = (base: number, calibracion: ModeloVigente["calibracion"] = null): ModeloVigente => ({
  id: "22222222-2222-4222-8222-222222222222", poblacion: "solicitantes de crédito", calibracion, modelo: prepararModelo(archivoDeModelo(base)),
});

function perfilDe(segmento: string | null, cambios: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    cedula: "0000000001",
    identidad: { nombreCompleto: "PERSONA INVENTADA", edad: 41, genero: "FEMENINO" },
    laboral: { estadoActividadEconomica: "activa_sin_interrupciones", fechaInicioActividadesRuc: "2015-03-10", obligadoALlevarContabilidadRuc: false },
    metaConsulta: { fuentesConDatos: ["contribuyente"], fuentesSinDatos: [], fuentesNoMedidas: [] },
    fuentesIngreso: { segmento, corteIessUsado: "2026-08", fuentes: [] },
    ...cambios,
  };
}

const sueldo = (monto: number) => ({ tipo: "x", naturaleza: "privado", montoMensualReportado: monto, evidencia: "reportada_por_tercero", vigenteAlCorte: true });
const conSueldos = (segmento: string, montos: number[]) =>
  perfilDe(segmento, { fuentesIngreso: { segmento, corteIessUsado: "2026-08", fuentes: montos.map(sueldo) } });

function estimar(perfil: Record<string, unknown>, opciones: { base?: number; consultadoEl?: string; ahora?: Date; vigente?: ModeloVigente | null } = {}) {
  return armarEstimacion({
    id: ID, perfil, decision: decidirEstimacion(perfil), consultadoEl: opciones.consultadoEl ?? CONSULTA, ahora: opciones.ahora ?? AHORA,
    vigente: opciones.vigente !== undefined ? opciones.vigente : vigenteDe(opciones.base ?? 1200),
  });
}

function estimadoDe(r: RespuestaDeEstimacion) {
  if (!r.estimado.aplica) throw new Error("Se esperaba una estimación");
  return r.estimado;
}

// ---------------------------------------------------------------- el selector

Deno.test("el selector: cada segmento cae donde dice la especificación (3.2)", () => {
  const casos: Array<[string, number[], 0 | 1 | null, string | null]> = [
    ["publico", [1000], 0, "ingreso_verificado"],
    ["diplomatico", [1000], 0, "ingreso_verificado"],
    ["dependiente_privado", [1000], 0, "ingreso_verificado"],
    ["empleo_domestico", [500], 0, "ingreso_verificado"],
    ["dependiente_privado", [], null, "dependiente_sin_monto"],
    ["jubilado", [], null, "jubilado"],
    ["jubilado_con_ingreso_adicional", [], null, "jubilado"],
    ["jubilado_con_ingreso_adicional", [800], 0, "jubilado"],
    ["independiente", [], 1, null],
    ["ingresos_mixtos", [600], 1, null],
    ["agricola", [], 1, null],
    ["trabajo_hogar", [], 1, null],
    ["informal_o_sin_actividad", [], 1, null],
    ["sin_datos", [], null, "sin_datos"],
    ["no_clasificado", [], null, "sin_datos"],
    ["no_clasificado", [700], 0, "sin_datos"],
  ];
  for (const [segmento, montos, nivel, motivo] of casos) {
    const d = decidirEstimacion(conSueldos(segmento, montos));
    assertEquals([segmento, d.nivel, d.motivo], [segmento, nivel, motivo]);
  }
});

Deno.test("un perfil viejo sin clasificación de ingresos no se estima", () => {
  assertEquals(decidirEstimacion({}).nivel, null);
  assertEquals(decidirEstimacion({ fuentesIngreso: null }).motivo, "sin_datos");
});

// ---------------------------------------------------------------- lo verificado

Deno.test("lo verificado suma los sueldos y descuenta el aporte como la capacidad de pago", () => {
  assertEquals(ingresoVerificado(conSueldos("dependiente_privado", [1000, 250.5])), {
    origen: "IESS", salarioReportado: 1250.5, aportePersonal: 118.17, ingresoNeto: 1132.33, mes: "2026-08",
  });
  assertEquals(ingresoVerificado(perfilDe("independiente")), null);
});

Deno.test("un aporte propio no es ingreso verificado: lo elige la persona", () => {
  const aporte = { tipo: "x", naturaleza: "cuenta_propia", montoMensualReportado: 900, evidencia: "autodeclarada_sobre_minimo", vigenteAlCorte: true };
  assertEquals(ingresoVerificado(perfilDe("independiente", { fuentesIngreso: { segmento: "independiente", corteIessUsado: "2026-08", fuentes: [aporte] } })), null);
});

Deno.test("un dependiente: verificado, sin evaluar el modelo y sin dejar fila", () => {
  const { respuesta, fila } = estimar(conSueldos("publico", [1250]), { vigente: null });
  assertEquals(fila, null);
  assertEquals(respuesta.id, null);
  assertEquals(respuesta.nivel, 0);
  assertEquals(respuesta.version, null);
  assertEquals(respuesta.modelo, null);
  assertEquals(respuesta.estimado, { aplica: false, motivo: "ingreso_verificado" });
  assertEquals(respuesta.verificado?.salarioReportado, 1250);
  assertEquals(respuesta.calidad.avisos, ["Puede tener ingresos que no constan."]);
});

Deno.test("quien tiene salario y otra actividad trae los dos bloques, sin sumarlos", () => {
  const { respuesta, fila } = estimar(conSueldos("ingresos_mixtos", [600]));
  assertEquals(respuesta.nivel, 1);
  assertEquals(respuesta.verificado?.salarioReportado, 600);
  assertEquals(estimadoDe(respuesta).minimoCertificado.monto, 1200);
  assertEquals(fila?.minimo_90, 1200);
});

Deno.test("un jubilado no recibe estimación y la respuesta dice por qué", () => {
  const { respuesta, fila } = estimar(perfilDe("jubilado"), { vigente: null });
  assertEquals(fila, null);
  assertEquals(respuesta.nivel, null);
  assertEquals(respuesta.estimado, { aplica: false, motivo: "jubilado" });
  assertEquals(respuesta.referencia, null);
  assertEquals(respuesta.calidad.avisos, ["La referencia de pensión por tipo de afiliación todavía no está disponible."]);
});

Deno.test("sin datos no se estima, aunque haya un modelo vigente", () => {
  const { respuesta, fila } = estimar(perfilDe("sin_datos"));
  assertEquals(fila, null);
  assertEquals(respuesta.estimado, { aplica: false, motivo: "sin_datos" });
});

Deno.test("el nivel 1 sin modelo vigente es un error de quien llama, no una respuesta vacía", () => {
  assertThrows(() => estimar(perfilDe("independiente"), { vigente: null }), Error, "modelo vigente");
});

// ---------------------------------------------------------------- el reloj

Deno.test("el reloj es la fecha de la consulta: el mismo perfil y el mismo modelo dan siempre lo mismo", () => {
  const perfil = perfilDe("independiente");
  const hoy = estimar(perfil, { ahora: new Date("2026-10-16T12:00:00Z") });
  const despues = estimar(perfil, { ahora: new Date("2027-03-01T12:00:00Z") });
  assertEquals(hoy.fila?.variables, despues.fila?.variables);
  assertEquals(hoy.fila?.cuantiles_log, despues.fila?.cuantiles_log);
  assertEquals(hoy.fila?.variables.anio_mes, 2026 + 9 / 12);
});

Deno.test("los tramos son del año de la consulta en Ecuador, no del UTC", () => {
  // Las 22:00 del 31 de diciembre en Ecuador: en UTC ya es 2026.
  const r = estimar(perfilDe("independiente"), { consultadoEl: "2026-01-01T03:00:00Z" }).respuesta;
  assertEquals(estimadoDe(r).tramos.slice(0, 2).map((t) => t.hasta), [470, 940]);
  const r2026 = estimar(perfilDe("independiente"), { consultadoEl: "2026-01-01T06:00:00Z" }).respuesta;
  assertEquals(estimadoDe(r2026).tramos.slice(0, 2).map((t) => t.hasta), [482, 964]);
});

Deno.test("una consulta antigua se estima igual, con un aviso pasados los 90 días", () => {
  const dias = (n: number) => new Date(new Date(CONSULTA).getTime() + n * 86_400_000);
  const aviso = `La consulta tiene más de ${DIAS_DE_UNA_CONSULTA_RECIENTE} días: el resultado es a esa fecha.`;
  assertEquals(estimar(perfilDe("independiente"), { ahora: dias(90) }).respuesta.calidad.avisos, []);
  const vieja = estimar(perfilDe("independiente"), { ahora: dias(91) });
  assertEquals(vieja.respuesta.calidad.avisos, [aviso]);
  assert(vieja.fila !== null);
  assertEquals(estimar(conSueldos("publico", [1000]), { ahora: dias(91), vigente: null }).respuesta.calidad.avisos, ["Puede tener ingresos que no constan.", aviso]);
});

// ---------------------------------------------------------------- lo que se contesta

Deno.test("el rótulo cambia cuando el mínimo pasa de 1.000, no al llegar", () => {
  assertEquals(estimadoDe(estimar(perfilDe("independiente"), { base: 1000 }).respuesta).rotulo, "Referencia de solicitantes");
  assertEquals(estimadoDe(estimar(perfilDe("independiente"), { base: 1000.5 }).respuesta).rotulo, "Ingreso estimado, sin verificar");
});

Deno.test("la respuesta del nivel 1 trae lo que dice la especificación (2.1)", () => {
  const { respuesta } = estimar(perfilDe("independiente"));
  assertEquals(respuesta.id, ID);
  assertEquals(respuesta.version, "ingreso-prueba");
  assertEquals(respuesta.consultadoEl, CONSULTA);
  assertEquals(respuesta.referencia, null);
  assertEquals(respuesta.verificado, null);
  assertEquals(respuesta.modelo, { poblacion: "solicitantes de crédito", calibradoPara: null, entrenadoEl: "2026-10-29" });
  assertEquals(respuesta.calidad, { variablesUsadas: 7, variablesSinDato: 1, avisos: [] });
  const e = estimadoDe(respuesta);
  assertEquals(e.minimoCertificado.seguridad, 0.90);
  assertEquals(e.minimoAlternativo.seguridad, 0.85);
  assertAlmostEquals(e.tramos.reduce((a, t) => a + t.probabilidad, 0), 1, 1e-9);
});

Deno.test("una variable sin dato no corta la estimación: se dice en la calidad", () => {
  const perfil = perfilDe("independiente", { metaConsulta: { fuentesConDatos: [], fuentesSinDatos: [], fuentesNoMedidas: ["contribuyente"] } });
  const { respuesta, fila } = estimar(perfil);
  assertEquals(respuesta.calidad.variablesSinDato, 5);
  assertEquals(respuesta.calidad.avisos.length, 1);
  assertEquals(fila?.sin_dato, ["sri_ruc", "sri_estado", "sri_obligado", "sri_antig", "sri_susp"]);
});

Deno.test("la calibración de la fila del modelo se aplica, se dice y queda guardada", () => {
  const calibracion = { para: "Institución inventada", casos: 800, corrimientoLog90: Math.log(1.25), corrimientoLog85: 0 };
  const { respuesta, fila } = estimar(perfilDe("independiente"), { vigente: vigenteDe(1200, calibracion) });
  assertEquals(estimadoDe(respuesta).minimoCertificado.monto, 960);
  assertEquals(respuesta.modelo?.calibradoPara, "Institución inventada");
  assertEquals(fila?.calibracion, calibracion);
});

// ---------------------------------------------------------------- la fila

Deno.test("la fila lleva lo que hace falta para vigilar el modelo y ningún identificador", () => {
  const perfil = perfilDe("independiente");
  const { fila, respuesta } = estimar(perfil);
  assert(fila !== null);
  assertEquals(fila.id, ID);
  assertEquals(fila.nivel, 1);
  assertEquals(fila.version_variables, VARIABLES_DE_INGRESO_VERSION);
  assertEquals(fila.consultada_el, CONSULTA);
  assertEquals(Object.keys(fila.variables), [...VARIABLES_DEL_NIVEL_1]);
  assertEquals(fila.cuantiles_log.length, 12);
  assertEquals(fila.respuesta, respuesta);
  const guardado = JSON.stringify(fila);
  for (const dato of ["0000000001", "PERSONA INVENTADA"]) assert(!guardado.includes(dato), `La fila lleva ${dato}`);
});

// ---------------------------------------------------------------- el cargador

async function comprimido(archivo: ModeloExportado): Promise<Uint8Array> {
  const flujo = new Blob([JSON.stringify(archivo)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

const filaDe = async (bytes: Uint8Array, cambios: Partial<FilaDeModelo> = {}): Promise<FilaDeModelo> => ({
  id: "33333333-3333-4333-8333-333333333333", version: "ingreso-prueba", nivel: 1, huella_sha256: await huellaSha256(bytes),
  ruta_archivo: "ingreso-prueba-nivel1.json.gz", poblacion: "solicitantes", calibracion: null, ...cambios,
});

Deno.test("el cargador baja el modelo una vez y lee la calibración de cada pedido", async () => {
  const bytes = await comprimido(archivoDeModelo(1200));
  let bajadas = 0;
  const cargar = crearCargadorDeModelo(() => {
    bajadas++;
    return Promise.resolve(bytes);
  });
  const fila = await filaDe(bytes);
  const primero = await cargar(fila);
  const calibracion = { para: "Institución inventada", casos: 800, corrimientoLog90: 0.1, corrimientoLog85: 0.1 };
  const segundo = await cargar({ ...fila, calibracion });
  assertEquals(bajadas, 1);
  assertEquals(primero.calibracion, null);
  assertEquals(segundo.calibracion, calibracion);
  assert(primero.modelo === segundo.modelo);
});

Deno.test("cuando cambia la huella, el cargador baja el modelo nuevo", async () => {
  const uno = await comprimido(archivoDeModelo(1200));
  const dos = await comprimido(archivoDeModelo(1500, "ingreso-prueba-2"));
  const archivos: Record<string, Uint8Array> = { uno, dos };
  const cargar = crearCargadorDeModelo((ruta) => Promise.resolve(archivos[ruta]));
  assertEquals((await cargar(await filaDe(uno, { ruta_archivo: "uno" }))).modelo.version, "ingreso-prueba");
  assertEquals((await cargar(await filaDe(dos, { ruta_archivo: "dos", version: "ingreso-prueba-2" }))).modelo.version, "ingreso-prueba-2");
});

Deno.test("el cargador se niega a un archivo que no es el de la fila", async () => {
  const bytes = await comprimido(archivoDeModelo(1200));
  const cargar = crearCargadorDeModelo(() => Promise.resolve(bytes));
  await assertRejects(async () => await cargar(await filaDe(bytes, { huella_sha256: "0".repeat(64) })), Error, "huella");
  await assertRejects(async () => await cargar(await filaDe(bytes, { version: "otra" })), Error, "no es el modelo");
  await assertRejects(async () => await cargar(await filaDe(bytes, { nivel: 2 })), Error, "no es el modelo");
});

Deno.test("una bajada fallida no queda en memoria: el pedido siguiente vuelve a intentar", async () => {
  const bytes = await comprimido(archivoDeModelo(1200));
  let intentos = 0;
  const cargar = crearCargadorDeModelo(() => {
    if (++intentos === 1) throw new Error("Storage no contestó");
    return Promise.resolve(bytes);
  });
  const fila = await filaDe(bytes);
  await assertRejects(() => cargar(fila), Error, "Storage no contestó");
  assertEquals((await cargar(fila)).modelo.version, "ingreso-prueba");
});

// ---------------------------------------------------------------- casos de oro

type CasoDeOro = (typeof oro.casos)[number];

Deno.test("casos de oro: el perfil da las variables calculadas aparte en Python", () => {
  assertEquals(oro.casos.length, 8);
  for (const caso of oro.casos as CasoDeOro[]) {
    const v = vectorDeNivel1(caso.perfil as PerfilParaIngreso, { ahora: caso.consultadoEl });
    assertEquals(v.variables, caso.variables, caso.id);
  }
});

const CARPETA_DE_MODELOS = Deno.env.get("PREDICTOR_INGRESOS_MODELOS");

Deno.test({
  name: "casos de oro: el perfil llega a los cuantiles y a los montos del evaluador de referencia",
  ignore: !CARPETA_DE_MODELOS,
  fn: async () => {
    const bytes = await Deno.readFile(`${CARPETA_DE_MODELOS}/ingreso-v1-nivel1.json.gz`);
    const modelo = await leerModeloComprimido(new Blob([bytes]));
    const vigente: ModeloVigente = { id: ID, poblacion: "solicitantes de crédito", calibracion: null, modelo };
    for (const caso of oro.casos as CasoDeOro[]) {
      const { fila, respuesta } = estimar(caso.perfil, { consultadoEl: caso.consultadoEl, vigente });
      assert(fila !== null, caso.id);
      caso.cuantiles_log.forEach((q: number, i: number) => assertAlmostEquals(fila.cuantiles_log[i], q, oro.tolerancia, caso.id));
      const e = estimadoDe(respuesta);
      assertEquals([e.minimoCertificado.monto, e.minimoAlternativo.monto, e.valorCentral], [caso.minimo90, caso.minimo85, caso.valorCentral], caso.id);
    }
  },
});
