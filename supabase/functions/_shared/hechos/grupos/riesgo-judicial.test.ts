// La prueba del grupo 3 (docs/capa-de-hechos.md, 4.3 y 5.2): cada campo de los tres grupos
// judiciales del perfil tiene su código; la atribución de cada demanda se calcula una vez y
// reproduce estructura-v24 (D2); las pensiones se unen por proceso con la de mayor deuda;
// una fuente caída no inventa un valor y el bloqueo desde hechos da lo mismo que el de hoy.
// La paridad sobre los crudos inventados la corre probar-crudos-sinteticos.mjs.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import { controlesDesdeHechos, CODIGOS_DE_SEGURIDAD } from "../controles.ts";
import { evaluarControlesBloqueo } from "../../controles-bloqueo.ts";
import { buildStandardProfile } from "../../process.ts";
import { mismoNombre } from "../../mismo-nombre.ts";
import type { Contexto, Hecho } from "../tipos.ts";
import { CATALOGO, esClienteObligadoSupa, type RegistroJudicial as RegistroJudicialDeLaPrueba } from "./riesgo-judicial.ts";

const CEDULA = "0000000000";
const contexto: Contexto = {
  cedula: CEDULA,
  consulta: "perfil-de-prueba",
  fechaDeLaConsulta: "2026-10-01T12:00:00-05:00",
  corteIess: "2026-10",
  persona: { nombre: null, fechaDeNacimiento: null },
};
const NOMBRE = "PRUEBA FICTICIO MARTA";

const demanda = (delito: string, demandado: string, extra: Record<string, unknown> = {}) => ({
  demanda: { numeroProceso: `1000-${delito.length}-${demandado.length}`, delito, demandado, ofendido: "PERSONA INVENTADA", fecha: Date.UTC(2024, 4, 10, 5), ...extra },
});
const ok = (data: unknown) => ({ status: "ok", data });
const crudoCon = (partes: Record<string, unknown>) => ({ general: ok({ personaNatural: { nombre: NOMBRE } }), ...partes });
// El crudo con que se armó el último documento, para compararlo con el perfil y el bloqueo de hoy.
let ultimoCrudo: unknown = null;
function derivar(partes: Record<string, unknown>) {
  const crudo = crudoCon(partes);
  ultimoCrudo = crudo;
  return derivarHechos(crudo, contexto);
}
const hecho = (doc: ReturnType<typeof derivarHechos>, codigo: string): Hecho => doc.hechos.find((h) => h.codigo === codigo)!;
const indices = (doc: ReturnType<typeof derivarHechos>, codigo: string) => hecho(doc, codigo).registros.map((r) => r.indice);
const descartados = (doc: ReturnType<typeof derivarHechos>, codigo: string) => (hecho(doc, codigo).descartados ?? []).map((d) => `${d.registro.fuente}#${d.registro.indice}:${d.motivo}`);

// Los campos de los tres grupos en types.ts, leídos del archivo: un campo nuevo del perfil
// sin su código en el catálogo corta acá, sin datos.
Deno.test("cero campos sin procedencia: todo campo de los tres grupos judiciales tiene su código", () => {
  const texto = Deno.readTextFileSync(new URL("../../types.ts", import.meta.url));
  const conCodigo = new Set(CATALOGO.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil] : [])));
  const esperados: Record<string, number> = { riesgoJudicialCrediticio: 5, riesgoJudicialCivil: 13, riesgoSeguridadCiudadana: 2 };
  for (const [grupo, cantidad] of Object.entries(esperados)) {
    const desde = texto.indexOf(`  ${grupo}: {`);
    const hasta = texto.indexOf("\n  };", desde);
    const campos = [...texto.slice(desde, hasta).matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]).filter((c) => c !== "camposSinDato");
    assertEquals(campos.length, cantidad, grupo);
    assertEquals(campos.filter((c) => !conCodigo.has(`${grupo}.${c}`)), [], grupo);
  }
});

Deno.test("la atribución de cada demanda es la de atribuirDemandas, y cobro y civil filtran por ella (D2)", () => {
  const doc = derivar({
      demandas: ok({
        demandas: [
          demanda("COBRO DE DINERO", NOMBRE), // 0: es la persona
          demanda("COBRO DE DINERO", "FICTICIO PRUEBA MARTA"), // 1: apellidos invertidos, no cuenta
          demanda("COBRO DE DINERO", ""), // 2: sin demandado, cuenta como sin cotejo
          demanda("COBRO DE DINERO", "INVENTADO ALFA BETA OMEGA"), // 3: otra persona, no cuenta
          demanda("DIVORCIO", "INVENTADO GAMA DELTA"), // 4: civil de otra persona
          demanda("DESPIDO INTEMPESTIVO", NOMBRE), // 5: civil de ella
        ],
      }),
  });
  const demandas = doc.entidades.filter((e) => (e.atributos as RegistroJudicialDeLaPrueba).clase === "demanda_contra_la_persona");
  assertEquals(demandas.map((e) => `${e.atribucion.deLaPersona}:${e.atribucion.detalle}`), [
    "si:es_la_persona", "no:apellidos_invertidos", "sin_cotejo:sin_demandado", "no:otra_persona", "no:otra_persona", "si:es_la_persona",
  ]);
  assertEquals(demandas.every((e) => e.atribucion.metodo === "nombre"), true);
  assertEquals(
    [hecho(doc, "jud.cobro.cantidad").valor, hecho(doc, "jud.cobro.de_otro_demandado.cantidad").valor, hecho(doc, "jud.cobro.sin_cotejo.cantidad").valor],
    [2, 2, 1],
  );
  assertEquals(indices(doc, "jud.cobro.cantidad"), [0, 2]);
  assertEquals(descartados(doc, "jud.cobro.cantidad"), ["demandas#1:demandado_con_los_apellidos_invertidos", "demandas#3:demandado_es_otra_persona"]);
  assertEquals([hecho(doc, "jud.civil.cantidad").valor, hecho(doc, "jud.civil.de_otro_demandado.cantidad").valor, hecho(doc, "jud.civil.sin_cotejo.cantidad").valor], [1, 1, 0]);
  assertEquals(indices(doc, "jud.civil.cantidad"), [5]);
  assertEquals(descartados(doc, "jud.civil.cantidad"), ["demandas#4:demandado_es_otra_persona"]);
  // Lo que cuenta el perfil de hoy es lo mismo.
  const perfil = buildStandardProfile(ultimoCrudo as never, CEDULA).profile;
  assertEquals(perfilDesdeHechos(doc, "riesgoJudicialCrediticio"), perfil.riesgoJudicialCrediticio);
});

Deno.test("sin nombre que cotejar, las demandas cuentan como sin cotejo y no como de otra persona", () => {
  const doc = derivarHechos({ demandas: ok({ demandas: [demanda("COBRO DE DINERO", "INVENTADO ALFA BETA OMEGA")] }) }, contexto);
  assertEquals([hecho(doc, "jud.cobro.cantidad").valor, hecho(doc, "jud.cobro.sin_cotejo.cantidad").valor, hecho(doc, "jud.cobro.de_otro_demandado.cantidad").valor], [1, 1, 0]);
  assertEquals(doc.entidades.find((e) => e.tipo === "demanda")!.atribucion.detalle, "sin_nombre");
});

Deno.test("las de cobro dicen su año y quién demanda, de la más reciente a la más vieja", () => {
  const doc = derivar({
    demandas: ok({
      demandas: [
        demanda("COBRO DE DINERO", NOMBRE, { fecha: Date.UTC(2019, 0, 15, 5), ofendido: "COMERCIAL INVENTADA S.A." }),
        demanda("PAGARE", NOMBRE, { fecha: Date.UTC(2024, 0, 15, 5), ofendido: "BANCO INVENTADO" }),
      ],
    }),
  });
  assertEquals(hecho(doc, "jud.cobro.detalle").valor, [{ anio: 2024, quienDemanda: "institucion_financiera" }, { anio: 2019, quienDemanda: "empresa" }]);
});

Deno.test("sin demandas: cero, citando la respuesta de la fuente", () => {
  const doc = derivar({ demandas: ok({ demandas: [] }), demandasOfendido: ok({ demandas: [] }) });
  for (const c of ["jud.cobro.cantidad", "jud.civil.cantidad", "jud.ofendido.cantidad"]) {
    const h = hecho(doc, c);
    assertEquals([h.valor, h.calidad, h.registros.every((r) => r.indice === undefined && r.lista !== undefined)], [0, "confirmado_por_tercero", true], c);
  }
  assertEquals(hecho(doc, "jud.cobro.tipos").valor, []);
});

Deno.test("las demandas que presentó la persona no se cotejan: son sin cotejo", () => {
  const doc = derivar({ demandasOfendido: ok({ demandas: [demanda("COBRO DE DINERO", "INVENTADO ALFA BETA OMEGA", { ofendido: NOMBRE })] }) });
  assertEquals(hecho(doc, "jud.ofendido.cantidad").valor, 1);
  assertEquals(doc.entidades.find((e) => (e.atributos as RegistroJudicialDeLaPrueba).clase === "demanda_de_la_persona")!.atribucion.deLaPersona, "sin_cotejo");
});

const sinDerivaDe = (h: ReturnType<typeof controlesDesdeHechos>[number]) => {
  const copia: Record<string, unknown> = { ...h };
  delete copia.derivaDe;
  return copia;
};
const pension = (extra: Record<string, unknown>) => ({ representanteLegal: "PERSONA INVENTADA UNO", valorMensual: 0, totalDeuda: 0, ...extra });

Deno.test("pensiones: el mismo proceso en las dos fuentes vale una vez, con la de mayor deuda, y queda la diferencia", () => {
  const doc = derivar({
    pensionAlimenticia: ok({ supas: [pension({ numeroProceso: "P-1", obligadoPrincipal: NOMBRE, totalDeuda: 100, valorMensual: 50 }), pension({ numeroProceso: "P-5", totalDeuda: 800 })] }),
    pensionAlimenticiaProveedorInfo1: ok({
      supas: [
        pension({ numeroProceso: "P-1", obligadoPrincipal: NOMBRE, totalDeuda: 300, valorMensual: 50 }),
        pension({ numeroProceso: "P-2", obligadoPrincipal: "FICTICIO PRUEBA MARTA", totalDeuda: 900 }), // mismo conjunto de palabras
        pension({ numeroProceso: "P-3", obligadoPrincipal: "INVENTADO ALFA BETA OMEGA", totalDeuda: 5000 }), // otra persona
        pension({ numeroProceso: "P-4", representanteLegal: NOMBRE, totalDeuda: 7000 }), // a ella le deben
      ],
    }),
  });
  // P-1 está en las dos fuentes: vale una vez, con la mayor deuda. P-5 no trae al obligado (como
  // la fuente `pensionAlimenticia` real, que nunca lo trae) y no cuenta.
  assertEquals([hecho(doc, "jud.pension.cantidad").valor, hecho(doc, "jud.pension.deuda").valor, hecho(doc, "jud.pension.en_mora.cantidad").valor], [2, 1200, 2]);
  assertEquals(hecho(doc, "jud.pension.valor_mensual").valor, 50);
  assertEquals(hecho(doc, "jud.pension.vigentes").valor, 1);
  assertEquals(descartados(doc, "jud.pension.cantidad"), [
    "pensionAlimenticia#1:la_fuente_no_trae_al_obligado",
    "pensionAlimenticiaProveedorInfo1#2:la_persona_no_es_el_obligado",
    "pensionAlimenticiaProveedorInfo1#3:la_fuente_no_trae_al_obligado",
    "pensionAlimenticia#0:mismo_proceso_de_menor_deuda",
  ]);
  assertEquals(doc.diferencias.map((d) => [d.manda.fuente, d.manda.valor, d.cede.map((c) => [c.fuente, c.valor])]), [
    ["pensionAlimenticiaProveedorInfo1", 300, [["pensionAlimenticia", 100]]],
  ]);
});

Deno.test("pensiones: un proceso repetido con deudas distintas manda la mayor, descarta la otra y deja la diferencia", () => {
  const doc = derivar({
    pensionAlimenticia: ok({ supas: [] }),
    pensionAlimenticiaProveedorInfo1: ok({
      supas: [
        pension({ numeroProceso: "P-1", obligadoPrincipal: NOMBRE, totalDeuda: 100 }),
        pension({ numeroProceso: "P-1", obligadoPrincipal: NOMBRE, totalDeuda: 300 }),
        pension({ numeroProceso: "P-1", obligadoPrincipal: NOMBRE, totalDeuda: 300 }),
        pension({ obligadoPrincipal: NOMBRE, totalDeuda: 40 }), // sin proceso: vale por uno
        pension({ obligadoPrincipal: NOMBRE, totalDeuda: 40 }), // y otro
      ],
    }),
  });
  assertEquals([hecho(doc, "jud.pension.cantidad").valor, hecho(doc, "jud.pension.deuda").valor], [3, 380]);
  assertEquals(indices(doc, "jud.pension.cantidad"), [1, 3, 4]);
  assertEquals(descartados(doc, "jud.pension.cantidad"), [
    "pensionAlimenticiaProveedorInfo1#0:mismo_proceso_de_menor_deuda",
    "pensionAlimenticiaProveedorInfo1#2:mismo_proceso_misma_deuda_gana_la_primera",
  ]);
  assertEquals(doc.diferencias.map((d) => [d.codigo, d.manda.valor, d.cede.map((c) => c.valor), d.magnitud.absoluta]), [["dif.jud.pension.deuda", 300, [100], 200]]);
  const union = doc.entidades.filter((e) => e.union?.criterio === "proceso");
  assertEquals([union.length, union[0].vistas.length], [1, 3]);
});

Deno.test("sin pensiones: existe es false, la deuda no aplica y el perfil escribe lo de hoy", () => {
  const doc = derivar({ pensionAlimenticiaProveedorInfo1: ok({ supas: [] }), pensionAlimenticia: ok({ supas: [] }) });
  assertEquals([hecho(doc, "jud.pension.existe").valor, hecho(doc, "jud.pension.cantidad").valor, hecho(doc, "jud.pension.valor_mensual").valor], [false, 0, 0]);
  assertEquals([hecho(doc, "jud.pension.deuda").valor, hecho(doc, "jud.pension.deuda").motivo], [null, "no_aplica"]);
  assertEquals(perfilDesdeHechos(doc, "riesgoJudicialCivil").deudaPensionAlimenticia, null);
});

Deno.test("mismoNombre compara el conjunto de palabras, en cualquier orden", () => {
  assertEquals(mismoNombre("MARTA PRUEBA  FICTICIO", "prueba ficticio marta"), true);
  assertEquals(mismoNombre("", ""), false);
  assertEquals(mismoNombre("PRUEBA FICTICIO", "PRUEBA FICTICIO MARTA"), false);
  assertEquals(esClienteObligadoSupa({ representanteLegal: NOMBRE }, NOMBRE), false);
  assertEquals(esClienteObligadoSupa({ obligadoPrincipal: NOMBRE }, NOMBRE), true);
});

Deno.test("seguridad: demanda propia, denuncia como acusada y antecedentes cuentan; lo demás queda descartado con su motivo", () => {
  const denuncia = (delito: string, partes: Array<{ cedula: string; estado: string }>) => ({ nroNoticia: `N-${delito.length}-${partes.length}`, delito, detalleDenuncia: partes });
  const doc = derivar({
    demandas: ok({
      demandas: [
        demanda("EXTORSION", NOMBRE), // 0: propia
        demanda("LAVADO DE ACTIVOS", "INVENTADO ALFA BETA OMEGA"), // 1: otra persona
        demanda("TRAFICO ILICITO DE SUSTANCIAS", ""), // 2: sin demandado
        demanda("COBRO DE DINERO", NOMBRE), // sin delito de seguridad
      ],
    }),
    denuncias: ok({
      denuncias: [
        denuncia("ASOCIACION ILICITA", [{ cedula: CEDULA, estado: "SOSPECHOSO" }]), // 0: acusada
        denuncia("TRATA DE PERSONAS", [{ cedula: CEDULA, estado: "DENUNCIANTE" }]), // 1: otro papel
        denuncia("TENENCIA DE ARMAS", [{ cedula: "1111111111", estado: "SOSPECHOSO" }]), // 2: no figura
        denuncia("ROBO", [{ cedula: CEDULA, estado: "SOSPECHOSO" }]), // sin delito de seguridad
      ],
    }),
    antecedentesPenales: ok({ antecedentes: { descripcion: "ASESINATO" } }),
  });
  assertEquals(hecho(doc, "seg.delito.categorias").valor, ["Extorsión", "Asociación ilícita", "Asesinato / homicidio intencional"]);
  assertEquals(hecho(doc, "seg.delito.existe").valor, true);
  assertEquals(hecho(doc, "seg.delito.categorias").registros.map((r) => `${r.fuente}#${r.indice ?? r.campo}`), ["demandas#0", "denuncias#0", "antecedentesPenales#descripcion"]);
  assertEquals(descartados(doc, "seg.delito.categorias"), [
    "demandas#1:demandado_es_otra_persona",
    "demandas#2:la_fuente_no_dice_el_demandado",
    "denuncias#1:figura_con_otro_papel_que_el_de_acusada",
    "denuncias#2:su_cedula_no_figura_en_la_denuncia",
  ]);
  assertEquals(hecho(doc, "seg.demandas.posible_homonimo.cantidad").valor, 2);
  // Lo que escribe el perfil de hoy, y lo que dice el bloqueo de hoy.
  const crudo = ultimoCrudo as Parameters<typeof evaluarControlesBloqueo>[0];
  assertEquals(perfilDesdeHechos(doc, "riesgoSeguridadCiudadana"), buildStandardProfile(crudo, CEDULA).profile.riesgoSeguridadCiudadana);
  const hoy = evaluarControlesBloqueo(crudo, CEDULA).hallazgos.filter((x) => CODIGOS_DE_SEGURIDAD.includes(x.code));
  const desdeHechos = controlesDesdeHechos(doc);
  assertEquals(desdeHechos.map((x) => sinDerivaDe(x)), hoy.map((h) => ({ ...h })));
  assertEquals(desdeHechos.map((h) => [h.code, h.derivaDe]), [
    ["delito_seguridad_ciudadana", ["seg.delito.categorias"]],
    ["posible_homonimo_en_demanda_penal", ["seg.demandas.posible_homonimo.cantidad"]],
  ]);
});

Deno.test("sin delitos de seguridad no hay hallazgos, y una fuente que no contestó no desbloquea a quien tiene uno en otra", () => {
  const limpio = derivar({ demandas: ok({ demandas: [demanda("COBRO DE DINERO", NOMBRE)] }), denuncias: ok({ denuncias: [] }), antecedentesPenales: ok({ antecedentes: { descripcion: "NO" } }) });
  assertEquals(controlesDesdeHechos(limpio), []);
  assertEquals(hecho(limpio, "seg.delito.categorias").valor, []);
  // `demandas` en error pero el antecedente trae un delito: el hecho no tiene valor, su parcial sí.
  const caida = derivar({ demandas: { status: "error", data: null }, antecedentesPenales: ok({ antecedentes: { descripcion: "EXTORSION" } }) });
  const h = hecho(caida, "seg.delito.categorias");
  assertEquals([h.valor, h.calidad, h.motivo, h.parcial], [null, "no_disponible", "fuente_sin_respuesta", ["Extorsión"]]);
  assertEquals(controlesDesdeHechos(caida).map((x) => [x.code, x.bloqueante]), [["delito_seguridad_ciudadana", true]]);
  assertEquals(controlesDesdeHechos(caida).map((x) => sinDerivaDe(x)), evaluarControlesBloqueo(ultimoCrudo as never, CEDULA).hallazgos.filter((x) => CODIGOS_DE_SEGURIDAD.includes(x.code)) as unknown[]);
});

Deno.test("antecedentes: un «faltante» es su «no hay», no una falla", () => {
  const doc = derivar({ demandas: ok({ demandas: [] }), denuncias: ok({ denuncias: [] }), antecedentesPenales: { status: "faltante", data: null } });
  assertEquals([hecho(doc, "seg.delito.existe").valor, hecho(doc, "seg.delito.existe").motivo], [false, undefined]);
});

Deno.test("una fuente caída: sin valor, con el parcial de las filas que llegaron, y el perfil escribe lo de hoy", () => {
  const doc = derivar({
    demandas: { status: "error", data: null },
    demandasOfendido: ok({ demandas: [demanda("COBRO DE DINERO", "X Y Z")] }),
    pensionAlimenticia: { status: "error", data: null },
    pensionAlimenticiaProveedorInfo1: ok({ supas: [pension({ numeroProceso: "P-1", obligadoPrincipal: NOMBRE, totalDeuda: 300, valorMensual: 20 })] }),
  });
  const cobro = hecho(doc, "jud.cobro.cantidad");
  assertEquals([cobro.valor, cobro.calidad, cobro.motivo, cobro.parcial], [null, "no_disponible", "fuente_sin_respuesta", 0]);
  assertEquals(hecho(doc, "jud.cobro.tipos").parcial, []);
  assertEquals(hecho(doc, "jud.ofendido.cantidad").valor, 1);
  // Una pensión de dos fuentes con una caída: lo que trajo la otra es el parcial.
  const deuda = hecho(doc, "jud.pension.deuda");
  assertEquals([deuda.valor, deuda.motivo, deuda.parcial], [null, "fuente_sin_respuesta", 300]);
  const perfil = buildStandardProfile(ultimoCrudo as never, CEDULA).profile;
  assertEquals(perfilDesdeHechos(doc, "riesgoJudicialCivil"), perfil.riesgoJudicialCivil);
  assertEquals(perfilDesdeHechos(doc, "riesgoJudicialCrediticio"), perfil.riesgoJudicialCrediticio);
});

Deno.test("deshabilitada no es caída: el motivo lo dice", () => {
  const doc = derivar({ demandas: { status: "deshabilitado", data: null } });
  assertEquals(hecho(doc, "jud.cobro.cantidad").motivo, "fuente_deshabilitada");
});

Deno.test("las demandas civiles por categoría y sus tipos son los del perfil", () => {
  const doc = derivar({
    demandas: ok({ demandas: [demanda("DIVORCIO", NOMBRE), demanda("ALIMENTOS", NOMBRE), demanda("DESPIDO INTEMPESTIVO", NOMBRE), demanda("INVENTO RARO", NOMBRE)] }),
  });
  const perfil = buildStandardProfile(ultimoCrudo as never, CEDULA).profile.riesgoJudicialCivil;
  assertEquals(hecho(doc, "jud.civil.por_categoria").valor, perfil.demandasPorCategoria);
  assertEquals(hecho(doc, "jud.civil.tipos").valor, perfil.tiposDemandasComoDemandado);
});
