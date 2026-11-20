// Pruebas de las lecturas (E11). Hechos inventados: ningún dato de una persona real.

import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { catalogoCompleto } from "../indice.ts";
import type { Diferencia, Hecho, HechosDeLaPersona, Senal } from "../tipos.ts";
import { MARCO_INTERPRETATIVO } from "../../marco-interpretativo.ts";
import { aplicarLectura, CATALOGO_DE_LECTURAS, derivarLecturas, erroresDelCatalogoDeLecturas, type LecturaDelCatalogo } from "./lecturas.ts";
import { TRAMOS_QUE_SACA_LA_V37, ubicarTramos } from "./marco-v37.ts";

const SIN_DATO = Symbol("sin dato");
type Entrada = Hecho["valor"] | typeof SIN_DATO;

// Un documento con TODOS los códigos del catálogo de hechos: los que no se dan valen lo
// que el perfil escribe sin valor (no aplica), y SIN_DATO es una fuente que no contestó.
function documento(valores: Record<string, Entrada> = {}, fecha = "2026-11-20T15:00:00.000Z", diferencias: Diferencia[] = []): HechosDeLaPersona {
  const hechos: Hecho[] = catalogoCompleto().map((c) => {
    const base = { clase: "hecho" as const, codigo: c.codigo, regla: "prueba@1", fechaDeLaConsulta: fecha, unidad: c.unidad, fuentes: ["prueba"], fechaDelDato: null };
    const v = valores[c.codigo];
    if (v === SIN_DATO) return { ...base, valor: null, calidad: "no_disponible", motivo: "fuente_sin_respuesta", registros: [] };
    if (v === undefined || v === null) return { ...base, valor: null, calidad: "no_disponible", motivo: "no_aplica", registros: [] };
    return { ...base, valor: v, calidad: "confirmado_por_tercero", registros: [{ consulta: "prueba", fuente: "prueba" }] };
  });
  return {
    version: "prueba",
    contexto: { cedula: "0000000001", consulta: "prueba", fechaDeLaConsulta: fecha, corteIess: "2026-10", persona: { nombre: null, fechaDeNacimiento: null } },
    hechos,
    entidades: [],
    diferencias,
    senales: [],
  };
}

function lectura(codigo: string, doc: HechosDeLaPersona): Senal {
  const s = derivarLecturas(doc).find((x) => x.codigo === codigo);
  if (!s) throw new Error(`no salió ${codigo}`);
  return s;
}
const estadoYValor = (codigo: string, valores: Record<string, Entrada>, fecha?: string) => {
  const s = lectura(codigo, documento(valores, fecha));
  return [s.estado, s.valor];
};

Deno.test("el catálogo de lecturas: forma, dominio lec, sin repetir y leyendo sólo hechos que existen", () => {
  assertEquals(erroresDelCatalogoDeLecturas(), []);
  // Hasta la v37, ninguna llega al modelo: el mensaje de marco-v36 queda igual.
  assertEquals(CATALOGO_DE_LECTURAS.filter((c) => c.llegaAlModelo).map((c) => c.codigo), []);
});

Deno.test("se emiten todas, en el orden del catálogo, citando lo que leen", () => {
  const ls = derivarLecturas(documento());
  assertEquals(ls.map((s) => s.codigo), CATALOGO_DE_LECTURAS.map((c) => c.codigo));
  for (const s of ls) {
    const c = CATALOGO_DE_LECTURAS.find((x) => x.codigo === s.codigo)!;
    assertEquals(s.derivaDe, c.lee);
    assertEquals(s.regla, `${c.codigo}@${c.version}`);
    assertEquals(s.tipo, "lectura");
    assertEquals((s.texto ?? "").length > 0, true, s.codigo);
  }
});

Deno.test("una lectura que lee un código que no declara corta", () => {
  const trampa: LecturaDelCatalogo = { ...CATALOGO_DE_LECTURAS[0], lee: ["ban.operaciones.cantidad"] };
  assertThrows(() => aplicarLectura(trampa, documento({ "ban.calificacion.peor": "A1", "ban.operaciones.cantidad": 1 })), Error, "no declara");
});

Deno.test("una fuente que no contestó deja la lectura sin medir, nunca en «no se cumple»", () => {
  const doc = documento({ "ban.calificacion.peor": SIN_DATO, "ban.operaciones.cantidad": SIN_DATO, "ban.saldo.en_atraso": SIN_DATO });
  for (const codigo of ["lec.ban.calificacion.tramo", "lec.end.sin_mora_vigente", "lec.end.sin_historial", "lec.ban.deuda.toda_en_atraso"]) {
    assertEquals(lectura(codigo, doc).estado, "no_se_puede_medir", codigo);
  }
  // Un hecho que no se emitió (su grupo falló en etapa A), igual.
  const sinElHecho = documento({ "ret.deudas.cantidad": 1 });
  sinElHecho.hechos = sinElHecho.hechos.filter((h) => h.codigo !== "ret.corte");
  assertEquals(lectura("lec.ret.a_su_corte", sinElHecho).estado, "no_se_puede_medir");
});

Deno.test("la calificación de bancos por tramo: A1 y AL sin atraso, A2 y A3 atraso corto, el resto en atraso, nunca en días", () => {
  const tramo = (peor: string | null, n = 1) => estadoYValor("lec.ban.calificacion.tramo", { "ban.calificacion.peor": peor, "ban.operaciones.cantidad": n });
  assertEquals(tramo("A1"), ["se_cumple", "sin_atraso"]);
  assertEquals(tramo("AL"), ["se_cumple", "sin_atraso"]);
  assertEquals(tramo("A2"), ["se_cumple", "atraso_corto"]);
  assertEquals(tramo("A3"), ["se_cumple", "atraso_corto"]);
  for (const c of ["B1", "B2", "C1", "C2", "D", "E"]) assertEquals(tramo(c), ["se_cumple", "en_atraso"]);
  assertEquals(tramo(null, 0), ["no_se_cumple", "sin_operaciones"]);
  assertEquals(tramo(null, 2), ["no_se_puede_medir", "sin_calificacion"]);
  assertEquals(tramo("Z9"), ["no_se_puede_medir", "no_reconocida"]);
});

Deno.test("bancos: atraso sin monto, deuda toda en atraso y lo que respalda como garante", () => {
  assertEquals(estadoYValor("lec.ban.atraso_sin_monto", { "ban.operaciones.en_atraso_sin_monto": 2 }), ["se_cumple", 2]);
  assertEquals(estadoYValor("lec.ban.atraso_sin_monto", { "ban.operaciones.en_atraso_sin_monto": 0 }), ["no_se_cumple", 0]);
  assertEquals(estadoYValor("lec.ban.deuda.toda_en_atraso", { "ban.saldo.por_vencer": 0, "ban.saldo.en_atraso": 900 }), ["se_cumple", 900]);
  assertEquals(estadoYValor("lec.ban.deuda.toda_en_atraso", { "ban.saldo.por_vencer": 100, "ban.saldo.en_atraso": 900 })[0], "no_se_cumple");
  const g = lectura("lec.ban.garante.contingente", documento({ "ban.garante.operaciones.cantidad": 1, "ban.garante.deuda": 3400, "ban.garante.calificacion.peor": "D" }));
  assertEquals([g.estado, g.valor], ["se_cumple", 3400]);
  assertEquals(g.texto!.includes("nunca como que la persona no pagó"), true);
  assertEquals(estadoYValor("lec.ban.garante.contingente", { "ban.garante.operaciones.cantidad": 0 })[0], "no_se_cumple");
});

Deno.test("casas comerciales: a su corte, con los meses hasta la consulta, y la deuda toda vencida", () => {
  assertEquals(estadoYValor("lec.ret.a_su_corte", { "ret.deudas.cantidad": 1, "ret.corte": "2025-07-31" }), ["se_cumple", 15]);
  const sin = lectura("lec.ret.a_su_corte", documento({ "ret.deudas.cantidad": 0 }));
  assertEquals(sin.estado, "no_se_cumple");
  assertEquals(sin.texto!.includes("No prueba que hoy no le deba"), true);
  assertEquals(estadoYValor("lec.ret.deuda.toda_vencida", { "ret.deuda.total": 500, "ret.deuda.vencida": 500 }), ["se_cumple", 500]);
  assertEquals(estadoYValor("lec.ret.deuda.toda_vencida", { "ret.deuda.total": 500, "ret.deuda.vencida": 50 })[0], "no_se_cumple");
});

Deno.test("cooperativas: los días de mora son de hoy", () => {
  assertEquals(estadoYValor("lec.coop.atraso_de_hoy", { "coop.operaciones.cantidad": 2, "coop.mora.dias_max": 10 }), ["se_cumple", 10]);
  assertEquals(estadoYValor("lec.coop.atraso_de_hoy", { "coop.operaciones.cantidad": 2, "coop.mora.dias_max": 0 }), ["no_se_cumple", 0]);
  assertEquals(estadoYValor("lec.coop.atraso_de_hoy", { "coop.operaciones.cantidad": 0 })[0], "no_se_cumple");
});

Deno.test("endeudamiento: la cuota conocida es sólo de cooperativas", () => {
  assertEquals(estadoYValor("lec.end.cuota_incompleta", { "coop.cuota.mensual": 80, "ban.saldo.por_vencer": 1500, "ret.deuda.total": 100 }), ["se_cumple", ["bancos", "casas_comerciales"]]);
  assertEquals(estadoYValor("lec.end.cuota_incompleta", { "coop.cuota.mensual": 80 }), ["no_se_cumple", []]);
  assertEquals(estadoYValor("lec.end.cuota_incompleta", { "coop.cuota.mensual": SIN_DATO, "ban.saldo.por_vencer": 1500 })[0], "no_se_puede_medir");
  assertEquals(estadoYValor("lec.end.cuota_sobre_ingreso", { "coop.cuota.mensual": 120, "ing.reportado.mensual": 800 }), ["se_cumple", 15]);
  assertEquals(estadoYValor("lec.end.cuota_sobre_ingreso", { "coop.cuota.mensual": 120 })[0], "no_se_puede_medir");
  // Cada parte redondeada antes de sumar, como el bloque endeudamiento del perfil del modelo.
  assertEquals(
    estadoYValor("lec.end.deuda_sobre_ingreso_anual", { "ban.saldo.por_vencer": 1000.4, "ban.saldo.en_atraso": 0, "coop.saldo.total": 1999.6, "ret.deuda.total": 0, "ing.reportado.mensual": 500 }),
    ["se_cumple", 50],
  );
});

Deno.test("sin mora vigente: hace falta alguna operación, y A2 ya es mora", () => {
  const al = { "ban.operaciones.cantidad": 1, "ban.calificacion.peor": "A1", "ban.saldo.en_atraso": 0 };
  assertEquals(estadoYValor("lec.end.sin_mora_vigente", al), ["se_cumple", true]);
  assertEquals(estadoYValor("lec.end.sin_mora_vigente", { ...al, "ban.calificacion.peor": "A2" }), ["no_se_cumple", false]);
  assertEquals(estadoYValor("lec.end.sin_mora_vigente", { ...al, "coop.operaciones.cantidad": 1, "coop.mora.dias_max": 5 }), ["no_se_cumple", false]);
  assertEquals(estadoYValor("lec.end.sin_mora_vigente", { ...al, "biess.tiene": true, "biess.mora.dias_max": 30 }), ["no_se_cumple", false]);
  // Las casas comerciales no entran: su corte tiene meses.
  assertEquals(estadoYValor("lec.end.sin_mora_vigente", { ...al, "ret.deudas.cantidad": 1, "ret.deuda.vencida": 50 }), ["se_cumple", true]);
  assertEquals(estadoYValor("lec.end.sin_mora_vigente", {}), ["no_se_cumple", false]);
  assertEquals(estadoYValor("lec.end.sin_historial", {}), ["se_cumple", true]);
  assertEquals(estadoYValor("lec.end.sin_historial", { "ret.deudas.cantidad": 1 }), ["no_se_cumple", false]);
  assertEquals(estadoYValor("lec.end.sin_historial", { "biess.tiene": true }), ["no_se_cumple", false]);
});

Deno.test("demandas de cobro: años con el año de Ecuador de la consulta, y cuántas son de una institución financiera", () => {
  const detalle = [{ anio: 2009, quienDemanda: "persona" }, { anio: 2024, quienDemanda: "institucion_financiera" }];
  assertEquals(estadoYValor("lec.jud.cobro.mas_reciente", { "jud.cobro.cantidad": 2, "jud.cobro.detalle": detalle }), ["se_cumple", 2]);
  // El 1 de enero a las 03:00 UTC todavía es 31 de diciembre en Ecuador.
  assertEquals(estadoYValor("lec.jud.cobro.mas_reciente", { "jud.cobro.cantidad": 2, "jud.cobro.detalle": detalle }, "2027-01-01T03:00:00.000Z"), ["se_cumple", 2]);
  assertEquals(estadoYValor("lec.jud.cobro.mas_reciente", { "jud.cobro.cantidad": 2, "jud.cobro.detalle": detalle }, "2027-01-01T06:00:00.000Z"), ["se_cumple", 3]);
  assertEquals(estadoYValor("lec.jud.cobro.mas_reciente", { "jud.cobro.cantidad": 1, "jud.cobro.detalle": [{ anio: null, quienDemanda: "empresa" }] })[0], "no_se_puede_medir");
  assertEquals(estadoYValor("lec.jud.cobro.mas_reciente", { "jud.cobro.cantidad": 0 })[0], "no_se_cumple");
  assertEquals(estadoYValor("lec.jud.cobro.de_institucion_financiera", { "jud.cobro.cantidad": 2, "jud.cobro.detalle": detalle }), ["se_cumple", 1]);
});

Deno.test("procesos civiles: las investigaciones archivadas y los trámites no cuentan como demandas", () => {
  const porCategoria = [
    { categoria: "Investigación penal cerrada sin cargos", cantidad: 2, tipos: [] },
    { categoria: "Trámite (no es una demanda)", cantidad: 1, tipos: [] },
    { categoria: "Familia", cantidad: 1, tipos: [] },
  ];
  assertEquals(estadoYValor("lec.jud.civil.cuentan", { "jud.civil.cantidad": 4, "jud.civil.por_categoria": porCategoria }), ["se_cumple", 1]);
  assertEquals(estadoYValor("lec.jud.civil.cuentan", { "jud.civil.cantidad": 1, "jud.civil.por_categoria": [porCategoria[2]] }), ["no_se_cumple", 1]);
});

Deno.test("pensión alimenticia: el estado y el gasto mensual", () => {
  assertEquals(estadoYValor("lec.jud.pension.estado", { "jud.pension.existe": false }), ["no_se_cumple", "sin_pension"]);
  assertEquals(estadoYValor("lec.jud.pension.estado", { "jud.pension.existe": true, "jud.pension.con_mora": true }), ["se_cumple", "en_mora"]);
  assertEquals(estadoYValor("lec.jud.pension.estado", { "jud.pension.existe": true, "jud.pension.con_mora": false }), ["se_cumple", "al_dia"]);
  assertEquals(estadoYValor("lec.jud.pension.gasto_mensual", { "jud.pension.existe": true, "jud.pension.vigentes": 1, "jud.pension.valor_mensual": 50 }), ["se_cumple", 50]);
  assertEquals(estadoYValor("lec.jud.pension.gasto_mensual", { "jud.pension.existe": true, "jud.pension.vigentes": 1, "jud.pension.valor_mensual": 0 }), ["no_se_cumple", 0]);
});

Deno.test("impedimento para cargos públicos: la deuda con el Estado se separa de las otras causas", () => {
  const causa = (causal: string) => estadoYValor("lec.cum.impedimento.causa", { "cum.impedimento.existe": true, "cum.impedimento.causal": causal });
  assertEquals(causa("DEUDORES A ENTIDADES DEL SECTOR PÚBLICO"), ["se_cumple", "deuda_con_el_estado"]);
  assertEquals(causa("MORA CON EL SECTOR PUBLICO"), ["se_cumple", "deuda_con_el_estado"]);
  assertEquals(causa("JUBILADO"), ["se_cumple", "otra_causa"]);
  assertEquals(estadoYValor("lec.cum.impedimento.causa", { "cum.impedimento.existe": true })[0], "no_se_puede_medir");
  assertEquals(estadoYValor("lec.cum.impedimento.causa", { "cum.impedimento.existe": false })[0], "no_se_cumple");
});

Deno.test("ingresos: Ingreso Mínimo SBU, indicios, militares y policías", () => {
  assertEquals(estadoYValor("lec.ing.minimo_sbu", { "ing.reportado.mensual": 482, "ing.corte.usado": "2026-10" }), ["se_cumple", 482]);
  assertEquals(estadoYValor("lec.ing.minimo_sbu", { "ing.reportado.mensual": 800, "ing.corte.usado": "2026-10" })[0], "no_se_cumple");
  assertEquals(
    estadoYValor("lec.ing.indicios_de_ingreso_mayor", { "ing.version": "fuentes-v11", "ing.senales_de_escala": [{ senal: "obligado a llevar contabilidad" }], "ing.reportado.mensual": 482, "ing.corte.usado": "2026-10" })[0],
    "se_cumple",
  );
  assertEquals(estadoYValor("lec.ing.indicios_de_ingreso_mayor", { "ing.version": "fuentes-v11", "ing.senales_de_escala": [], "ing.reportado.mensual": 482 }), ["no_se_cumple", []]);
  assertEquals(
    estadoYValor("lec.ing.regimen_especial", { "ing.fuentes": [{ tipo: "servicio activo en las Fuerzas Armadas" }, { tipo: "jubilación" }] }),
    ["se_cumple", ["servicio activo en las Fuerzas Armadas"]],
  );
  assertEquals(estadoYValor("lec.ing.regimen_especial", { "ing.fuentes": [{ tipo: "jubilación" }] })[0], "no_se_cumple");
});

Deno.test("ingresos: continuidad, huecos (salvo una pensión), caída y dejar de aportar", () => {
  assertEquals(estadoYValor("lec.ing.continuidad", { "ing.continuidad": { meses: 80, vigente: true } }), ["se_cumple", 80]);
  assertEquals(estadoYValor("lec.ing.continuidad", { "ing.continuidad": { meses: 30, vigente: false } }), ["no_se_cumple", 30]);
  assertEquals(estadoYValor("lec.ing.continuidad", {}), ["no_se_cumple", 0]);
  assertEquals(estadoYValor("lec.ing.huecos_12_meses", { "ing.aportes.meses_12": 9, "ing.aportes.meses_24": 20 }), ["se_cumple", 3]);
  assertEquals(estadoYValor("lec.ing.huecos_12_meses", { "ing.fuentes": [{ tipo: "jubilación" }], "ing.aportes.meses_12": 0, "ing.aportes.meses_24": 10 })[0], "no_se_cumple");
  assertEquals(estadoYValor("lec.ing.huecos_12_meses", { "ing.aportes.meses_12": 0, "ing.aportes.meses_24": 0 })[0], "no_se_cumple");
  assertEquals(estadoYValor("lec.ing.variacion_anual", { "ing.reportado.mensual": 800, "ing.total.hace_12_meses": 1000 }), ["se_cumple", -20]);
  assertEquals(estadoYValor("lec.ing.variacion_anual", { "ing.reportado.mensual": 1100, "ing.total.hace_12_meses": 1000 }), ["no_se_cumple", 10]);
  assertEquals(estadoYValor("lec.ing.dejo_de_aportar", { "ing.aparece_en_ultimo_corte": false, "ing.fuentes": [], "ing.cortes_desde_la_desvinculacion": 4 }), ["se_cumple", 4]);
  assertEquals(estadoYValor("lec.ing.dejo_de_aportar", { "ing.aparece_en_ultimo_corte": false, "ing.fuentes": [{ tipo: "jubilación" }] })[0], "no_se_cumple");
  assertEquals(estadoYValor("lec.lab.sin_empleo_registrado", { "lab.empleos_actuales": [] }), ["se_cumple", 0]);
  assertEquals(estadoYValor("lec.lab.sin_empleo_registrado", { "lab.empleos_actuales": [{ cargo: "ANALISTA" }] }), ["no_se_cumple", 1]);
});

Deno.test("la operación con la institución que ya figura en bancos sale de la diferencia de E9", () => {
  const dif: Diferencia = {
    clase: "diferencia", codigo: "dif.inst.posible_en_bancos", regla: "inst.en_bancos@1", fechaDeLaConsulta: "2026-11-20T15:00:00.000Z",
    sobre: "inst.operacion.saldo", manda: { fuente: "a", valor: 1, registro: { consulta: "p", fuente: "a" } }, cede: [], magnitud: { absoluta: 0, relativa: 0 }, lectura: "esperada",
  };
  assertEquals([lectura("lec.inst.ya_en_bancos", documento({}, undefined, [dif])).estado, lectura("lec.inst.ya_en_bancos", documento({}, undefined, [dif])).valor], ["se_cumple", "esperada"]);
  assertEquals(lectura("lec.inst.ya_en_bancos", documento()).estado, "no_se_cumple");
});

Deno.test("la lista de la v37: cada marca está una vez en marco-v36 y los tramos no se pisan", () => {
  const ubicados = ubicarTramos(MARCO_INTERPRETATIVO);
  assertEquals(ubicados.length, TRAMOS_QUE_SACA_LA_V37.length);
  const codigos = new Set(CATALOGO_DE_LECTURAS.map((c) => c.codigo));
  for (const t of TRAMOS_QUE_SACA_LA_V37) for (const r of t.reemplazo) assertEquals(r === "perfil" || codigos.has(r), true, `${t.id}: ${r}`);
  // Una marca que no está corta, como en marco-con-buro.
  assertThrows(() => ubicarTramos("otro texto"), Error, "no está");
});
