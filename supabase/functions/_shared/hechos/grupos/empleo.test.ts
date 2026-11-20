// La prueba del grupo 4, parte 1 (docs/capa-de-hechos.md, 4.4.1 y 5.2): cada campo de
// `laboral` tiene su código, la calidad distingue al empleador de quien se paga a sí
// mismo, un empleo visto por tres fuentes es una entidad, el reloj es la fecha de la
// consulta y una fuente caída deja el hecho sin valor con su parcial. La paridad contra el
// perfil la miden comparar-hechos.mjs (los reales) y probar-crudos-sinteticos.mjs.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { catalogoCompleto, derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import type { Contexto } from "../tipos.ts";
import { analizarFuentesIngreso } from "../../fuentes-ingreso.ts";
import type { RespuestaProveedorInfo1 } from "../../types.ts";
import { agruparEmpleadores, CATALOGO, corteIessUsado, nombreComparable, rucComparable } from "./empleo.ts";
import { CODIGOS_DE_AFILIACION_PROPIA } from "../lectura-del-iess.ts";
import { CATALOGO as CATALOGO_RUC } from "./actividad-con-ruc.ts";

const contexto: Contexto = {
  cedula: "0000000000",
  consulta: "perfil-de-prueba",
  fechaDeLaConsulta: "2026-10-01T12:00:00-05:00",
  corteIess: "2026-10",
  persona: { nombre: null, fechaDeNacimiento: null },
};

const ms = (a: number, m: number, d: number) => Date.UTC(a, m - 1, d);
const ok = (data: unknown) => ({ status: "ok", data });
const general = ok({ personaNatural: { nombre: "PRUEBA FICTICIO MARTA" } });
const aporte = (mes: number, extra: Record<string, unknown> = {}, anio = 2026) => ({
  ci: "0000000000", rucEmp: "1790000000001", tipEmp: "2-EMPRESA PRIVADA", nomEmp: "EMPRESA FICTICIA S.A.", nomAfi: "PRUEBA FICTICIO MARTA",
  salario: "800", fecIng: "01/03/2020", fecSal: "", ocupacion: "ANALISTA", anio, mes, ...extra,
});
const mecanizado = (baseDate: string, valor: number) => ({
  baseDate, fechaIngreso: ms(2020, 3, 1), rucEmpresa: "1790000000001", nombreEmpresa: "EMPRESA FICTICIA S.A.",
  personaPatrono: { identificacion: "1790000000001", nombre: "EMPRESA FICTICIA S.A." }, personaIngreso: { valor }, cargo: { nombre: "ANALISTA" },
});
const historial = {
  personaTrabajo: {
    fechaIngreso: ms(2020, 3, 1),
    personaPatrono: { tipoPersona: "JURIDICA", identificacion: "1790000000001", nombre: "EMPRESA FICTICIA SA", situacionLegal: { nombre: "ACTIVA" }, tipoCompania: { nombre: "ANONIMA" }, fechaConstitucion: ms(2010, 1, 1) },
    personaIngreso: { valor: 1500 }, cargo: { nombre: "GERENTE" },
  },
};
const vacio = (lista: string) => ok({ [lista]: [] });
const crudoBase = (extra: Record<string, unknown>) => ({
  general,
  basesInternas: vacio("tiess"), trabajoHistoricosMecanizado: vacio("mecanizadoEmpleados"), trabajoHistoricos: vacio("trabajosHistoricos"),
  empleados: vacio("empleados"), administraciones: vacio("administraciones"), cumplimientoPatronal: vacio("afiliaciones"),
  contribuyente: vacio("datosContribuyente"), establecimientoActEconomica: vacio("datosEstablecimientoActEco"),
  ...extra,
});
const tresFuentes = () => crudoBase({
  basesInternas: ok({ tiess: [6, 7, 8, 9, 10].map((m) => aporte(m)) }),
  trabajoHistoricosMecanizado: ok({ mecanizadoEmpleados: [mecanizado("2026-10", 820), mecanizado("2026-09", 800)] }),
  trabajoHistoricos: ok({ trabajosHistoricos: [historial] }),
});

type Doc = ReturnType<typeof derivarHechos>;
const hecho = (doc: Doc, codigo: string) => doc.hechos.find((h) => h.codigo === codigo)!;

// Los campos de `laboral` en types.ts, leídos del archivo: un campo nuevo del perfil sin su
// código en el catálogo del grupo corta acá, sin datos.
Deno.test("cero campos sin procedencia: todo campo de laboral tiene su código en empleo.ts o actividad-con-ruc.ts", () => {
  const texto = Deno.readTextFileSync(new URL("../../types.ts", import.meta.url));
  const desde = texto.indexOf("  laboral: {");
  const hasta = texto.indexOf("\n  };", desde);
  const campos = [...texto.slice(desde, hasta).matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]).filter((c) => c !== "camposSinDato"); // la marca no es un campo
  assertEquals(campos.length, 33);
  const conCodigo = new Set([...CATALOGO, ...CATALOGO_RUC].flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil] : [])));
  assertEquals(campos.filter((c) => !conCodigo.has(`laboral.${c}`)), []);
  assertEquals(catalogoCompleto().filter((c) => c.codigo.startsWith("lab.") || c.codigo.startsWith("ruc.") || c.codigo.startsWith("dif.lab.") || c.codigo.startsWith("dif.ruc.")).length, CATALOGO.length + CATALOGO_RUC.length);
});

Deno.test("la lista de códigos de afiliación propia es la que fuentes-ingreso.ts lee como cuenta propia o del hogar", () => {
  // Una afiliación bajo cada código del 1 al 40, con un RUC ajeno: la naturaleza que
  // le da la clasificación decide si el aporte es propio.
  for (let codigo = 1; codigo <= 40; codigo++) {
    const crudo = crudoBase({ basesInternas: ok({ tiess: [aporte(10, { tipEmp: `${codigo}-ALGO`, rucEmp: "1790000000001" })] }) });
    const f = analizarFuentesIngreso(crudo as unknown as RespuestaProveedorInfo1, "PRUEBA FICTICIO MARTA", "2026-10", "0000000000");
    const naturaleza = f.fuentes[0]?.naturaleza;
    assertEquals(CODIGOS_DE_AFILIACION_PROPIA.has(String(codigo)), naturaleza === "cuenta_propia" || naturaleza === "hogar", `código ${codigo}: ${naturaleza}`);
  }
});

Deno.test("un empleo visto por tres fuentes es una entidad con tres vistas, y su unión no cambia ningún campo", () => {
  const doc = derivarHechos(tresFuentes(), contexto);
  const empleos = doc.entidades.filter((e) => e.tipo === "empleo");
  assertEquals(empleos.length, 1);
  assertEquals(empleos[0].vistas.map((v) => v.registro.fuente).sort(), ["basesInternas", "trabajoHistoricos", "trabajoHistoricosMecanizado"]);
  assertEquals(empleos[0].union, { regla: "emp.union@1", criterio: "ruc" });
  // El historial escribe el nombre distinto («SA» y «S.A.»): un solo empleador.
  assertEquals(hecho(doc, "lab.empleadores.historial").valor, 1);
  assertEquals(hecho(doc, "lab.empleadores.historial").entidades, [empleos[0].clave]);
  assertEquals((empleos[0].atributos as { calidad: string }).calidad, "confirmado_por_tercero");
  // Los aportes dicen 800 y el mecanizado 820 en el último mes: una diferencia, y manda el
  // mecanizado porque de él salió el empleo actual.
  const dif = doc.diferencias.filter((d) => d.codigo === "dif.lab.salario_del_mes");
  assertEquals(dif.length, 1);
  assertEquals([dif[0].manda.fuente, dif[0].manda.valor, dif[0].cede[0].valor, dif[0].lectura], ["trabajoHistoricosMecanizado", 820, 800, "revisar"]);
  assertEquals(hecho(doc, "lab.empleo_actual.fuente").valor, "mecanizado");
});

Deno.test("el salario más alto cita qué registro lo sostiene y deja afuera a las fuentes que no llegan", () => {
  const doc = derivarHechos(tresFuentes(), contexto);
  const h = hecho(doc, "lab.salario.mas_alto");
  assertEquals(h.valor, 1500);
  assertEquals(h.registros.map((r) => `${r.fuente}#${r.indice}`), ["trabajoHistoricos#0"]);
  assertEquals((h.descartados ?? []).map((d) => `${d.registro.fuente}:${d.motivo}`).sort(), ["basesInternas:el_maximo_de_esta_fuente_es_menor", "trabajoHistoricosMecanizado:el_maximo_de_esta_fuente_es_menor"]);
});

Deno.test("la calidad: el empleador es un tercero; quien se paga a sí mismo, por su RUC o por cuenta propia, se declara", () => {
  assertEquals(hecho(derivarHechos(tresFuentes(), contexto), "lab.empleos_actuales").calidad, "confirmado_por_tercero");
  // El patrono es la propia persona (su cédula más 001).
  const propio = crudoBase({ basesInternas: ok({ tiess: [aporte(10, { rucEmp: "0000000000001", nomEmp: "PRUEBA FICTICIO MARTA" })] }) });
  const d1 = derivarHechos(propio, contexto);
  assertEquals(hecho(d1, "lab.empleos_actuales").calidad, "declarado");
  assertEquals(hecho(d1, "lab.salario.mas_alto").calidad, "declarado");
  assertEquals(hecho(d1, "lab.cliente_es_su_propio_empleador").valor, true);
  assertEquals((d1.entidades.find((e) => e.tipo === "empleo")!.atributos as { esSuPropioPatrono: boolean }).esSuPropioPatrono, true);
  // Un afiliado voluntario (código 3) con un RUC ajeno también se declara.
  const voluntario = crudoBase({ basesInternas: ok({ tiess: [aporte(10, { tipEmp: "3-AFILIADO VOLUNTARIO" })] }) });
  assertEquals(hecho(derivarHechos(voluntario, contexto), "lab.salario.mas_alto").calidad, "declarado");
  // Juntar filas de las dos clases toma la más débil.
  const mezcla = crudoBase({ basesInternas: ok({ tiess: [aporte(9), aporte(10, { rucEmp: "0000000000001", nomEmp: "PRUEBA FICTICIO MARTA", salario: "900" })] }) });
  assertEquals(hecho(derivarHechos(mezcla, contexto), "lab.empleadores.historial").calidad, "declarado");
  // La nómina que paga la persona la declara ella; el cumplimiento patronal lo informa el IESS.
  const nomina = crudoBase({
    empleados: ok({ empleados: [{ ci: "1111111111", nomAfi: "OTRA PERSONA", tipEmp: "2-EMPRESA PRIVADA", salario: 500, anio: 2026, mes: 9 }] }),
    cumplimientoPatronal: ok({ afiliaciones: [{ obligaciones: "TIENE DEUDA" }] }),
  });
  const d2 = derivarHechos(nomina, contexto);
  assertEquals([hecho(d2, "lab.empleados.cantidad").calidad, hecho(d2, "lab.obligaciones_patronales_en_mora").calidad], ["declarado", "confirmado_por_tercero"]);
  assertEquals(hecho(d2, "lab.obligaciones_patronales_en_mora").valor, true);
});

Deno.test("la propia persona en la nómina no es un empleado y queda descartada", () => {
  const crudo = crudoBase({
    empleados: ok({ empleados: [
      { ci: "0000000000", nomAfi: "PRUEBA FICTICIO MARTA", tipEmp: "2-EMPRESA PRIVADA", salario: 400, anio: 2026, mes: 9 },
      { ci: "1111111111", nomAfi: "OTRA PERSONA", tipEmp: "2-EMPRESA PRIVADA", salario: 500, anio: 2026, mes: 9 },
      { ci: "1111111111", nomAfi: "OTRA PERSONA", tipEmp: "2-EMPRESA PRIVADA", salario: 500, anio: 2026, mes: 8 },
    ] }),
  });
  const h = hecho(derivarHechos(crudo, contexto), "lab.empleados.cantidad");
  assertEquals(h.valor, 1);
  assertEquals(h.registros.map((r) => r.indice), [1]);
  assertEquals((h.descartados ?? []).map((d) => `${d.registro.indice}:${d.motivo}`), ["0:es_la_propia_persona"]);
});

Deno.test("el reloj es la fecha de la consulta: el mismo crudo da lo mismo el día que sea, y cambia con ella", () => {
  const crudo = tresFuentes();
  const a = derivarHechos(crudo, contexto);
  const b = derivarHechos(crudo, { ...contexto });
  assertEquals(JSON.stringify(a.hechos), JSON.stringify(b.hechos));
  // Un año después el mecanizado ya no es de los últimos 3 meses: el empleo actual sale de
  // los aportes del corte, y el mecanizado viejo queda descartado.
  const tarde = derivarHechos(crudo, { ...contexto, fechaDeLaConsulta: "2027-10-01T12:00:00-05:00" });
  assertEquals(hecho(tarde, "lab.empleo_actual.fuente").valor, "aportes");
  assertEquals((hecho(tarde, "lab.empleos_actuales").descartados ?? []).map((d) => d.motivo), ["mecanizado_de_mas_de_3_meses"]);
  assertEquals(hecho(a, "lab.empleo_actual.fuente").valor, "mecanizado");
});

Deno.test("el mecanizado viejo queda descartado cuando los aportes del corte toman su lugar", () => {
  const crudo = crudoBase({
    basesInternas: ok({ tiess: [aporte(10)] }),
    trabajoHistoricosMecanizado: ok({ mecanizadoEmpleados: [mecanizado("2026-05", 700)] }),
  });
  const doc = derivarHechos(crudo, contexto);
  assertEquals(hecho(doc, "lab.empleo_actual.fuente").valor, "aportes");
  assertEquals((hecho(doc, "lab.empleos_actuales").descartados ?? []).map((d) => d.motivo), ["mecanizado_de_mas_de_3_meses"]);
});

Deno.test("una fuente caída deja el hecho sin valor, con el parcial que el perfil escribe hoy", () => {
  const crudo = crudoBase({ basesInternas: ok({ tiess: [aporte(10)] }), trabajoHistoricosMecanizado: { status: "error", data: null } });
  const doc = derivarHechos(crudo, contexto);
  const h = hecho(doc, "lab.empleos_actuales");
  assertEquals([h.valor, h.motivo, h.calidad], [null, "fuente_sin_respuesta", "no_disponible"]);
  assertEquals(h.parcial, [{ empleador: "EMPRESA FICTICIA S.A.", cargo: "ANALISTA", salarioAprox: 800 }]);
  // Y el perfil armado desde los hechos (etapa B, estructura-v30) escribe null y deja el parcial en camposSinDato.
  const perfil = perfilDesdeHechos(doc, "laboral");
  assertEquals(perfil.empleosActuales, null);
  assertEquals(((perfil.camposSinDato as Record<string, unknown>).empleosActuales as unknown[]).length, 1);
  // Lo que no lee el mecanizado no se ve afectado.
  assertEquals(hecho(doc, "lab.empleadores.ultimos_24_meses").valor, 1);
});

Deno.test("el corte del IESS es el pasado, o el último mes del propio cliente si es posterior", () => {
  const crudo = (mes: number) => ({ basesInternas: ok({ tiess: [aporte(mes)] }) });
  assertEquals(corteIessUsado(crudo(9), "2026-10"), "2026-10");
  assertEquals(corteIessUsado(crudo(12), "2026-10"), "2026-12");
  // Sin corte en el contexto (process.ts lo pasa vacío cuando no hay uno), el conocido.
  const doc = derivarHechos(crudoBase({ basesInternas: ok({ tiess: [aporte(10)] }), trabajoHistoricosMecanizado: vacio("mecanizadoEmpleados") }), { ...contexto, corteIess: "" });
  assertEquals(hecho(doc, "lab.empleo_actual.fuente").valor === "aportes" || hecho(doc, "lab.empleo_actual.fuente").valor === "ninguna", true);
});

Deno.test("el empleador se compara por RUC y, sin RUC, por nombre; cada registro sin RUC se une al de igual nombre", () => {
  assertEquals(rucComparable("0000000000"), "0000000000001");
  assertEquals(rucComparable("123"), null);
  assertEquals(nombreComparable("Empresa Ficticia S. A."), nombreComparable("EMPRESA FICTICIA SA"));
  const g = agruparEmpleadores([
    { ruc: "1790000000001", nombre: "EMPRESA FICTICIA S.A." },
    { ruc: null, nombre: "empresa ficticia sa" },
    { ruc: null, nombre: "OTRA SIN RUC" },
    { ruc: "1790000000002", nombre: "TERCERA" },
  ]);
  assertEquals(g.size, 3);
});

Deno.test("con datos raros en los campos (tipos que no son los esperados) los hechos no se caen", () => {
  const raro = crudoBase({
    basesInternas: ok({ tiess: [aporte(10, { salario: null, fecIng: 12, fecSal: 0, nomEmp: undefined, rucEmp: 5, tipEmp: null }), aporte(11, { anio: "x", mes: [] })] }),
    trabajoHistoricosMecanizado: ok({ mecanizadoEmpleados: [{ baseDate: 5, personaPatrono: "x", personaIngreso: 3, cargo: null }] }),
    trabajoHistoricos: ok({ trabajosHistoricos: [{ personaTrabajo: { fechaIngreso: "ayer", personaPatrono: { identificacion: [] } } }] }),
    contribuyente: ok({ datosContribuyente: [{ ruc: 5, fecha_cancelacion: {}, obligado: 1 }] }),
    establecimientoActEconomica: ok({ datosEstablecimientoActEco: [{ estado_establecimiento: 7 }] }),
  });
  const doc = derivarHechos(raro, contexto);
  assertEquals(doc.hechos.length > 0, true);
});
