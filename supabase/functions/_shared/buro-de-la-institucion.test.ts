// Qué consulta del buró se lee. Si esto falla:
// - el análisis lee una consulta del ambiente de prueba (que contesta por otra
//   persona), una posterior a su fecha o el buró de una base que eligió otro;
// - o deja sin buró a quien tiene una consulta guardada (p4 de la revisión del
//   análisis: 214 de 247 análisis pedían una cuota que Equifax ya tenía);
// - o el cobro reutiliza una consulta vencida (la regla de la vigente).
// Datos inventados (equifax-respuesta-de-prueba.ts): el repositorio es público.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  buroDeLaBase,
  buroDeLaPersonaParaElAnalisis,
  consultaVigenteDeEquifax,
  ultimaConsultaDeEquifax,
} from "./buro-de-la-institucion.ts";
import {
  armarIndiceDelCrudoMigrado,
  comprimirTexto,
  consultasDelIndice,
  entradaDelIndice,
  fechaDeAws,
  type IndiceDelCrudoMigrado,
  olvidarElIndice,
  RUTA_DEL_INDICE_POR_CEDULA,
  rutaDelCrudoMigrado,
} from "./crudo-equifax-migrado.ts";
import { CEDULA_DE_PRUEBA, respuestaDePrueba } from "./equifax-respuesta-de-prueba.ts";
import { buroEquifaxDelPerfilDelModelo } from "./perfil-del-modelo.ts";

type Respuesta = { data: unknown; error: { message: string } | null };

// Una base falsa con la forma encadenada de supabase-js: anota cada filtro y
// contesta lo que se le dio para cada tabla. `maybeSingle()` contesta
// `respuestas[tabla]`; esperar la consulta sin él (una lista), `listas[tabla]`.
// Storage contesta los objetos dados, y «Object not found» para los demás.
function baseFalsa(
  respuestas: Record<string, Respuesta>,
  opciones: { listas?: Record<string, Respuesta>; objetos?: Record<string, Uint8Array>; storageFalla?: boolean } = {},
) {
  const llamadas: Array<{ tabla: string; metodo: string; args: unknown[] }> = [];
  const descargas: string[] = [];
  return {
    llamadas,
    descargas,
    from(tabla: string) {
      // deno-lint-ignore no-explicit-any
      const q: any = {};
      for (const metodo of ["select", "eq", "not", "lte", "order", "limit"]) {
        q[metodo] = (...args: unknown[]) => {
          llamadas.push({ tabla, metodo, args });
          return q;
        };
      }
      q.maybeSingle = () => Promise.resolve(respuestas[tabla] ?? { data: null, error: null });
      q.then = (ok: (r: Respuesta) => unknown, mal: (e: unknown) => unknown) =>
        Promise.resolve(opciones.listas?.[tabla] ?? { data: [], error: null }).then(ok, mal);
      return q;
    },
    storage: {
      from: (deposito: string) => ({
        download: (ruta: string) => {
          descargas.push(`${deposito}/${ruta}`);
          if (opciones.storageFalla) return Promise.resolve({ data: null, error: { message: "Gateway Timeout", statusCode: "504" } });
          const bytes = deposito === "crudo-equifax-migrado" ? opciones.objetos?.[ruta] : undefined;
          return Promise.resolve(bytes ? { data: new Blob([bytes as BlobPart]), error: null } : { data: null, error: { message: "Object not found", statusCode: "404" } });
        },
      }),
    },
  };
}

// 2026-10-16 a mediodía de Ecuador: el ciclo vigente empezó el 18/09 a las
// 00:00 de Ecuador (05:00 UTC).
const AHORA = new Date("2026-10-16T17:00:00Z");
const ESTRUCTURA = { consulta: { identidadVerificada: true }, deudaActualTitular: {} };
const consulta = (created_at: string, estructura: unknown = ESTRUCTURA): Respuesta => ({ data: { id: "c-1", created_at, estructura }, error: null });
const equifax: Respuesta = { data: { clave: "equifax" }, error: null };
const PERSONA = { id: "persona-1", cedula: CEDULA_DE_PRUEBA };

const fila = (id: string, created_at: string, otros: Record<string, unknown> = {}) => ({
  id, created_at, ambiente: "produccion", estructura: ESTRUCTURA, crudo_ruta: null, id_aws: null, ...otros,
});
const filas = (...lista: unknown[]): Respuesta => ({ data: lista, error: null });
const indiceCon = (entradas: Array<[string, string, string?]>): IndiceDelCrudoMigrado =>
  armarIndiceDelCrudoMigrado(entradas.map(([idAws, consultadaEl, cedula]) => ({ idAws, consultadaEl, cedula: cedula ?? CEDULA_DE_PRUEBA })), "2026-11-09T00:00:00Z");
const gz = async (v: unknown) => await comprimirTexto(JSON.stringify(v));
async function deposito(indice: IndiceDelCrudoMigrado | null, crudos: Record<string, unknown> = {}): Promise<Record<string, Uint8Array>> {
  const objetos: Record<string, Uint8Array> = {};
  if (indice) objetos[RUTA_DEL_INDICE_POR_CEDULA] = await gz(indice);
  for (const [idAws, cuerpo] of Object.entries(crudos)) objetos[rutaDelCrudoMigrado(idAws)] = await gz(cuerpo);
  return objetos;
}

Deno.test("el buró de la base es el que dice proveedores.es_buro", async () => {
  assertEquals(await buroDeLaBase(baseFalsa({ proveedores: equifax })), "equifax");
  assertEquals(await buroDeLaBase(baseFalsa({ proveedores: { data: { clave: "aval" }, error: null } })), "aval");
  assertEquals(await buroDeLaBase(baseFalsa({ proveedores: { data: null, error: null } })), null);
  const db = baseFalsa({ proveedores: equifax });
  await buroDeLaBase(db);
  assertEquals(db.llamadas.find((l) => l.metodo === "eq")?.args, ["es_buro", true]);
});

Deno.test("sin saber cuál es el buró no se sigue: un error no se lee como 'no hay buró'", async () => {
  await assertRejects(() => buroDeLaBase(baseFalsa({ proveedores: { data: null, error: { message: "column es_buro does not exist" } } })));
});

// ---------- la vigente: la que decide si se vuelve a pagar ----------

Deno.test("la consulta vigente es de la persona, de producción, con estructura y anterior al análisis", async () => {
  const db = baseFalsa({ consultas_equifax: consulta("2026-10-12T21:54:00Z") });
  const c = await consultaVigenteDeEquifax(db, "persona-1", AHORA);
  assertEquals(c, { proveedor: "equifax", consultaId: "c-1", consultadoEl: "2026-10-12T21:54:00Z", estructura: ESTRUCTURA });
  const filtros = db.llamadas.filter((l) => l.metodo !== "select").map((l) => [l.metodo, ...l.args]);
  assertEquals(filtros, [
    ["eq", "client_id", "persona-1"],
    ["eq", "ambiente", "produccion"],
    ["eq", "http_equifax", 200],
    ["not", "estructura", "is", null],
    ["lte", "created_at", AHORA.toISOString()],
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
    ["limit", 1],
  ]);
});

Deno.test("una consulta del ciclo anterior ya no vale para cobrar: el 18 a las 00:00 de Ecuador caduca todo", async () => {
  // 17/09 a las 23:30 de Ecuador: un ciclo atrás.
  assertEquals(await consultaVigenteDeEquifax(baseFalsa({ consultas_equifax: consulta("2026-09-18T04:30:00Z") }), "p", AHORA), null);
  // 18/09 a las 00:30 de Ecuador: este ciclo.
  assertEquals((await consultaVigenteDeEquifax(baseFalsa({ consultas_equifax: consulta("2026-09-18T05:30:00Z") }), "p", AHORA))?.consultaId, "c-1");
});

Deno.test("sin consulta, o con la de otra persona, no hay consulta vigente", async () => {
  assertEquals(await consultaVigenteDeEquifax(baseFalsa({}), "p", AHORA), null);
  const ajena = consulta("2026-10-12T21:54:00Z", { consulta: { identidadVerificada: false } });
  assertEquals(await consultaVigenteDeEquifax(baseFalsa({ consultas_equifax: ajena }), "p", AHORA), null);
});

Deno.test("un error al leer la consulta vigente no se disimula como 'no tiene buró'", async () => {
  await assertRejects(() => consultaVigenteDeEquifax(baseFalsa({ consultas_equifax: { data: null, error: { message: "timeout" } } }), "p", AHORA));
});

// ---------- la última: la que lee el análisis ----------

Deno.test("el análisis lee la última consulta aunque haya vencido, con los filtros de la vigente salvo la vigencia", async () => {
  olvidarElIndice();
  // 10/09: vencida el 18/09, y antes no llegaba al modelo.
  const db = baseFalsa({}, { listas: { consultas_equifax: filas(fila("c-1", "2026-09-10T15:00:00Z"), fila("c-0", "2026-08-01T15:00:00Z")) } });
  const c = await ultimaConsultaDeEquifax(db, PERSONA, AHORA);
  assertEquals(c, { proveedor: "equifax", consultaId: "c-1", crudoAws: null, consultadoEl: "2026-09-10T15:00:00Z", estructura: ESTRUCTURA, vigente: false });
  const filtros = db.llamadas.filter((l) => l.tabla === "consultas_equifax" && l.metodo !== "select").map((l) => [l.metodo, ...l.args]);
  assertEquals(filtros, [
    ["eq", "client_id", "persona-1"],
    ["eq", "ambiente", "produccion"],
    ["eq", "http_equifax", 200],
    ["lte", "created_at", AHORA.toISOString()],
    ["order", "created_at", { ascending: false }],
    ["order", "id", { ascending: false }],
    ["limit", 5],
  ]);
  // Con una del ciclo, vigente lo dice: sólo informa.
  olvidarElIndice();
  const vigente = await ultimaConsultaDeEquifax(baseFalsa({}, { listas: { consultas_equifax: filas(fila("c-2", "2026-10-12T21:54:00Z")) } }), PERSONA, AHORA);
  assertEquals(vigente?.vigente, true);
});

Deno.test("una consulta de AWS sin fila se encuentra por cédula en el índice y se deriva en memoria, con su fecha", async () => {
  olvidarElIndice();
  const indice = indiceCon([["7002", "2026-10-02T14:00:00.000Z"], ["7001", "2026-09-05T14:00:00.000Z"], ["7999", "2026-10-02T14:00:00.000Z", "0999999999"]]);
  const objetos = await deposito(indice, { "7002": respuestaDePrueba(), "7001": respuestaDePrueba() });
  // La fila es más vieja que la de AWS: gana la de AWS.
  const db = baseFalsa({}, { listas: { consultas_equifax: filas(fila("c-1", "2026-09-20T15:00:00Z")) }, objetos });
  const c = await ultimaConsultaDeEquifax(db, PERSONA, AHORA);
  assertEquals([c?.consultaId, c?.crudoAws, c?.consultadoEl, c?.vigente], [null, "aws/7002.json.gz", "2026-10-02T14:00:00.000Z", true]);
  const consultaDeLaEstructura = c?.estructura.consulta as Record<string, unknown>;
  assertEquals([consultaDeLaEstructura.consultadoEl, consultaDeLaEstructura.identidadVerificada, consultaDeLaEstructura.ambiente], ["2026-10-02T14:00:00.000Z", true, "produccion"]);
  // El modelo sabe de cuándo es: fechaDelReporte, en día de Ecuador.
  assertEquals(buroEquifaxDelPerfilDelModelo(c!.estructura).fechaDelReporte, "2026-10-02");
  // Se bajaron el índice y ese crudo, nada más; nada se escribió.
  assertEquals(db.descargas, ["crudo-equifax-migrado/" + RUTA_DEL_INDICE_POR_CEDULA, "crudo-equifax-migrado/aws/7002.json.gz"]);
  assertEquals(db.llamadas.some((l) => !["select", "eq", "not", "lte", "order", "limit"].includes(l.metodo)), false);
});

Deno.test("nunca una consulta posterior a la fecha del análisis, ni de la base ni de AWS", async () => {
  olvidarElIndice();
  const indice = indiceCon([["7003", "2026-10-20T14:00:00.000Z"], ["7001", "2026-09-05T14:00:00.000Z"]]);
  const objetos = await deposito(indice, { "7001": respuestaDePrueba() });
  // La fila posterior la saca la base con lte; la de AWS, el filtro del índice.
  const c = await ultimaConsultaDeEquifax(baseFalsa({}, { objetos }), PERSONA, AHORA);
  assertEquals(c?.crudoAws, "aws/7001.json.gz");
  assertEquals(consultasDelIndice(indice, CEDULA_DE_PRUEBA, AHORA).map((x) => x.idAws), ["7001"]);
});

Deno.test("una migrada y su entrada en el índice son la misma consulta: gana la fila, y su crudo se lee de Storage", async () => {
  olvidarElIndice();
  const indice = indiceCon([["7002", "2026-10-02T14:00:00.000Z"]]);
  const objetos = await deposito(indice, { "7002": respuestaDePrueba() });
  const migrada = fila("c-9", "2026-10-02T14:00:00.000Z", { estructura: null, crudo_ruta: "aws/7002.json.gz", id_aws: "7002" });
  const c = await ultimaConsultaDeEquifax(baseFalsa({}, { listas: { consultas_equifax: filas(migrada) }, objetos }), PERSONA, AHORA);
  assertEquals([c?.consultaId, c?.crudoAws], ["c-9", null]);
  assertEquals((c?.estructura.consulta as Record<string, unknown>).identidadVerificada, true);
});

Deno.test("una fila sin estructura y con el crudo en la fila se deriva desde ese crudo", async () => {
  olvidarElIndice();
  const sinTablas = fila("c-3", "2026-10-01T14:00:00Z", { estructura: null });
  const db = baseFalsa(
    { consultas_equifax: { data: { respuesta_cruda: respuestaDePrueba(), crudo_ruta: null }, error: null } },
    { listas: { consultas_equifax: filas(sinTablas) } },
  );
  const c = await ultimaConsultaDeEquifax(db, PERSONA, AHORA);
  assertEquals([c?.consultaId, (c?.estructura.consulta as Record<string, unknown>).consultadoEl], ["c-3", "2026-10-01T14:00:00Z"]);
  assertEquals(db.llamadas.some((l) => l.metodo === "eq" && l.args[0] === "id" && l.args[1] === "c-3"), true);
});

Deno.test("una consulta que vino por otra persona no se lee: se pasa a la anterior", async () => {
  olvidarElIndice();
  const ajena = fila("c-2", "2026-10-10T14:00:00Z", { estructura: { consulta: { identidadVerificada: false } } });
  const c = await ultimaConsultaDeEquifax(baseFalsa({}, { listas: { consultas_equifax: filas(ajena, fila("c-1", "2026-09-10T15:00:00Z")) } }), PERSONA, AHORA);
  assertEquals(c?.consultaId, "c-1");
  // En AWS: el documento de la respuesta no es el de la persona pedida.
  olvidarElIndice();
  const indice = indiceCon([["7002", "2026-10-02T14:00:00.000Z"]]);
  const otra = respuestaDePrueba({ reporteCrediticio: { identificacion_consultada: [{ tipo_documento: "C", numero_documento: "0999999999" }] } });
  const sinNada = await ultimaConsultaDeEquifax(baseFalsa({}, { objetos: await deposito(indice, { "7002": otra }) }), PERSONA, AHORA);
  assertEquals(sinNada, null);
});

Deno.test("sin consultas no hay buró, y sin índice en el depósito se leen sólo las filas", async () => {
  olvidarElIndice();
  assertEquals(await ultimaConsultaDeEquifax(baseFalsa({}), PERSONA, AHORA), null);
  olvidarElIndice();
  const c = await ultimaConsultaDeEquifax(baseFalsa({}, { listas: { consultas_equifax: filas(fila("c-1", "2026-09-10T15:00:00Z")) } }), PERSONA, AHORA);
  assertEquals(c?.consultaId, "c-1");
});

Deno.test("un error al leer la base, el índice o el crudo no se disimula como 'no tiene buró'", async () => {
  olvidarElIndice();
  await assertRejects(() => ultimaConsultaDeEquifax(baseFalsa({}, { listas: { consultas_equifax: { data: null, error: { message: "timeout" } } } }), PERSONA, AHORA));
  olvidarElIndice();
  await assertRejects(() => ultimaConsultaDeEquifax(baseFalsa({}, { storageFalla: true }), PERSONA, AHORA));
  // El índice dice que hay un crudo y el depósito no lo tiene.
  olvidarElIndice();
  const indice = indiceCon([["7002", "2026-10-02T14:00:00.000Z"]]);
  const soloElIndice = await deposito(indice);
  await assertRejects(() => ultimaConsultaDeEquifax(baseFalsa({}, { objetos: soloElIndice }), PERSONA, AHORA));
});

Deno.test("si el buró de la base es Aval, o no hay, el análisis no busca ninguna consulta de Equifax", async () => {
  for (const proveedores of [{ data: { clave: "aval" }, error: null }, { data: null, error: null }]) {
    olvidarElIndice();
    const db = baseFalsa({ proveedores }, { listas: { consultas_equifax: filas(fila("c-1", "2026-10-12T21:54:00Z")) } });
    assertEquals(await buroDeLaPersonaParaElAnalisis(db, PERSONA, AHORA), null);
    assertEquals(db.llamadas.some((l) => l.tabla === "consultas_equifax"), false);
    assertEquals(db.descargas, []);
  }
  olvidarElIndice();
  const db = baseFalsa({ proveedores: equifax }, { listas: { consultas_equifax: filas(fila("c-1", "2026-10-12T21:54:00Z")) } });
  assertEquals((await buroDeLaPersonaParaElAnalisis(db, PERSONA, AHORA))?.proveedor, "equifax");
});

// ---------- el índice ----------

Deno.test("al índice entra lo mismo que se migra: reporte, cédula y fecha; la fecha sin zona es de Ecuador", () => {
  const base = { estado: 1, id_consulta_equifax: 7002, fecha_consulta: "2026-10-26T21:24:42.547263", response_json: respuestaDePrueba() };
  assertEquals(entradaDelIndice(base), { ok: true, entrada: { idAws: "7002", cedula: CEDULA_DE_PRUEBA, consultadaEl: "2026-10-27T02:24:42.547Z" } });
  assertEquals(entradaDelIndice({ ...base, estado: 0 }), { ok: false, motivo: "sin_respuesta_util" });
  assertEquals(entradaDelIndice({ ...base, response_json: { decision: "X" } }), { ok: false, motivo: "sin_respuesta_util" });
  assertEquals(entradaDelIndice({ ...base, response_json: respuestaDePrueba({ reporteCrediticio: { identificacion_consultada: [] } }) }), { ok: false, motivo: "sin_documento" });
  assertEquals(entradaDelIndice({ ...base, response_json: respuestaDePrueba({ reporteCrediticio: { identificacion_consultada: [{ numero_documento: "0102030405001" }] } }) }), { ok: false, motivo: "documento_invalido" });
  assertEquals(entradaDelIndice({ ...base, fecha_consulta: null, fecha_creacion: "no es fecha" }), { ok: false, motivo: "sin_fecha" });
  // Con zona, se respeta.
  assertEquals(fechaDeAws("2026-10-26T21:24:42Z"), "2026-10-26T21:24:42.000Z");
});

Deno.test("el índice ordena de la más reciente a la más vieja y no cuenta dos veces un id repetido entre lotes", () => {
  const indice = armarIndiceDelCrudoMigrado([
    { idAws: "1", cedula: "0102030405", consultadaEl: "2026-09-01T00:00:00.000Z" },
    { idAws: "3", cedula: "0102030405", consultadaEl: "2026-10-01T00:00:00.000Z" },
    { idAws: "3", cedula: "0102030405", consultadaEl: "2026-10-01T00:00:00.000Z" },
    { idAws: "2", cedula: "0999999999", consultadaEl: "2026-09-15T00:00:00.000Z" },
  ], "2026-11-09T00:00:00Z");
  assertEquals(indice.consultas, 3);
  assertEquals(indice.personas["0102030405"], [["3", "2026-10-01T00:00:00.000Z"], ["1", "2026-09-01T00:00:00.000Z"]]);
  assertEquals(consultasDelIndice(null, "0102030405", AHORA), []);
});
