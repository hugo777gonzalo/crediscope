// Lo que no llega al modelo (marco-v29, auditoría externa E27): ni la
// cédula, ni el nombre, ni el de un empleador. Si esto falla, el modelo
// vuelve a leer datos que no necesita y la ficha para clientes miente.
// Los datos son inventados: el repositorio es público.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { ATRIBUTOS_PROTEGIDOS, mensajeParaElModelo, RUTAS_QUE_NO_LLEGAN } from "./perfil-del-modelo.ts";

const NOMBRES = ["ZZPRUEBA ZZINVENTADA ANA", "MINISTERIO INVENTADO", "ZZINVENTADO PEDRO", "EMPRESA SIN APORTE S.A.", "INSTITUCION INVENTADA"];

const perfil = () =>
  ({
    cedula: "0000000000",
    identidad: { nombreCompleto: NOMBRES[0], edad: 41, genero: "MUJER", estadoCivil: "CASADO", tieneConyuge: true },
    familia: { numeroHijos: 2, padresFallecidos: 1 },
    laboral: {
      empleosActuales: [
        { empleador: NOMBRES[1], cargo: "ANALISTA", salarioAprox: 1200 },
        // El empleo doméstico: el empleador es otra persona.
        { empleador: ` ${NOMBRES[2].toLowerCase()} `, cargo: "EMPLEADA DOMESTICA", salarioAprox: 470 },
        { empleador: NOMBRES[3], cargo: "VENDEDOR", salarioAprox: 600 },
      ],
    },
    cumplimiento: { detallePep: { cargo: "DIRECTOR", empresa: NOMBRES[4], sueldo: 3000, fecha: "2025-01-01" } },
    fuentesIngreso: {
      segmento: "dependiente_publico",
      fuentes: [
        { evidencia: "reportada_por_tercero", naturaleza: "publico", empleador: NOMBRES[1], tipo: "empleo en el sector público", montoMensualReportado: 1200 },
        { evidencia: "reportada_por_tercero", naturaleza: "domestico", empleador: NOMBRES[2], tipo: "empleo doméstico", montoMensualReportado: 470 },
      ],
    },
  }) as Record<string, unknown>;

// deno-lint-ignore no-explicit-any
const armar = (p = perfil()) => mensajeParaElModelo(p, []).perfilDelModelo as any;

Deno.test("no llegan la cédula, el nombre ni la institución de la PEP", () => {
  const pm = armar();
  assertEquals("cedula" in pm, false);
  assertEquals("nombreCompleto" in pm.identidad, false);
  assertEquals(pm.cumplimiento.detallePep, { cargo: "DIRECTOR", sueldo: 3000, fecha: "2025-01-01" });
});

Deno.test("ningún nombre aparece en ningún lado del mensaje", () => {
  const texto = JSON.stringify(mensajeParaElModelo(perfil(), [])).toUpperCase();
  for (const nombre of NOMBRES) assertEquals(texto.includes(nombre), false, nombre);
  assertEquals(/\d{10}/.test(texto), false);
});

Deno.test("un número de 10 dígitos se tapa en cualquier texto", () => {
  const p = perfil();
  (p.laboral as { empleosActuales: Array<Record<string, unknown>> }).empleosActuales[0].cargo = "ANALISTA 0000000000 EXT 12";
  assertEquals(armar(p).laboral.empleosActuales[0].cargo, "ANALISTA [número omitido] EXT 12");
});

Deno.test("todo número llega entero, y la deuda total es la suma de sus partes", () => {
  const p = perfil();
  p.patrimonio = { valorAvaluoVehiculos: 1234.5678901234, numeroVehiculos: 1 };
  p.comportamientoBancario = { saldoTotalVigente: 100.4, deudaEnAtraso: 0.4, totalDeudaRetail: 10.4 };
  p.comportamientoCooperativas = { saldoTotal: 50.4, cuotaMensualTotal: 25.5 };
  const pm = armar(p);
  assertEquals(pm.patrimonio, { valorAvaluoVehiculos: 1235, numeroVehiculos: 1 });
  assertEquals(pm.comportamientoCooperativas.cuotaMensualTotal, 26);
  // 100,8 + 50,4 + 10,4 = 161,6 daría 162; las partes redondeadas suman 161.
  const e = pm.endeudamiento;
  assertEquals([e.deudaPropiaBancos, e.deudaPropiaCooperativas, e.deudaPropiaRetail, e.deudaPropiaTotal], [101, 50, 10, 161]);
  const decimales = (n: unknown): boolean =>
    typeof n === "number" ? !Number.isInteger(n) : Boolean(n) && typeof n === "object" && Object.values(n as object).some(decimales);
  assertEquals(decimales(mensajeParaElModelo(p, [{ code: "x", monto: 1.5 }])), false);
});

Deno.test("la institución del título no llega (puede ser el empleador); el nivel sí", () => {
  const p = perfil();
  p.identidad = { ...(p.identidad as object), institucionTituloMasAlto: NOMBRES[1], nivelEducacion: "TERCER NIVEL" };
  const pm = armar(p);
  assertEquals("institucionTituloMasAlto" in pm.identidad, false);
  assertEquals(pm.identidad.nivelEducacion, "TERCER NIVEL");
});

Deno.test("cada empleo llega con el tipo de su aporte en lugar del empleador", () => {
  const pm = armar();
  assertEquals(pm.laboral.empleosActuales, [
    { tipoEmpleador: "Empleador público", esSuPropioPatrono: false, posibleNegocioFamiliar: false, cargo: "ANALISTA", salarioAprox: 1200 },
    // Se cruza sin importar mayúsculas ni espacios.
    { tipoEmpleador: "Otros empleadores", esSuPropioPatrono: false, posibleNegocioFamiliar: false, cargo: "EMPLEADA DOMESTICA", salarioAprox: 470 },
    // Sin su aporte, el tipo no se sabe: null, no un tipo inventado.
    { tipoEmpleador: null, esSuPropioPatrono: false, posibleNegocioFamiliar: false, cargo: "VENDEDOR", salarioAprox: 600 },
  ]);
  assertEquals(pm.fuentesIngreso.aportes.map((a: Record<string, unknown>) => Object.keys(a)), [
    ["tipo", "declaradoPor", "esSuPropioPatrono", "posibleNegocioFamiliar", "montoMensual"],
    ["tipo", "declaradoPor", "esSuPropioPatrono", "posibleNegocioFamiliar", "montoMensual"],
  ]);
});

Deno.test("cada empleo y cada aporte dicen si es de la persona o posiblemente de un pariente", () => {
  const p = perfil();
  (p.laboral as { empleosActuales: Array<Record<string, unknown>> }).empleosActuales = [
    { empleador: "COMERCIAL ZZINVENTADA CIA LTDA", cargo: "VENDEDORA" },
    // Lleva el apellido, pero un Empleador público nunca es negocio familiar.
    { empleador: "GAD MUNICIPAL ZZINVENTADA", cargo: "TECNICA" },
    { empleador: NOMBRES[0], cargo: "GERENTE" },
  ];
  (p.fuentesIngreso as { fuentes: Array<Record<string, unknown>> }).fuentes = [
    { evidencia: "reportada_por_tercero", naturaleza: "privado", empleador: "COMERCIAL ZZINVENTADA CIA LTDA", tipo: "empleo en relación de dependencia" },
    { evidencia: "reportada_por_tercero", naturaleza: "publico", empleador: "GAD MUNICIPAL ZZINVENTADA", tipo: "empleo en el sector público" },
    { evidencia: "autodeclarada_sobre_minimo", naturaleza: "cuenta_propia", empleador: NOMBRES[0], tipo: "aporte como patrono de su propio negocio" },
  ];
  const pm = armar(p);
  const marcas = (xs: Array<Record<string, unknown>>) => xs.map((x) => [x.esSuPropioPatrono, x.posibleNegocioFamiliar]);
  assertEquals(marcas(pm.laboral.empleosActuales), [[false, true], [false, false], [true, false]]);
  assertEquals(marcas(pm.fuentesIngreso.aportes), [[false, true], [false, false], [true, false]]);
  assertEquals(JSON.stringify(pm).includes("ZZINVENTADA"), false);
});

Deno.test("la forma vieja del empleo actual (antes de marco-v20) tampoco lleva el empleador", () => {
  const p = perfil();
  p.laboral = { empleoActual: { empleador: NOMBRES[1], cargo: "ANALISTA" } };
  assertEquals(armar(p).laboral.empleoActual, { tipoEmpleador: "Empleador público", esSuPropioPatrono: false, posibleNegocioFamiliar: false, cargo: "ANALISTA" });
});

Deno.test("los atributos protegidos llegan o no según la lista", () => {
  const pm = armar();
  for (const [ruta, llega] of Object.entries(ATRIBUTOS_PROTEGIDOS)) {
    const [grupo, campo] = ruta.split(".");
    const enElPerfil = campo in ((perfil()[grupo] ?? {}) as Record<string, unknown>);
    if (enElPerfil) assertEquals(campo in pm[grupo], llega, ruta);
    assertEquals(RUTAS_QUE_NO_LLEGAN.includes(ruta), !llega, ruta);
  }
});

Deno.test("un perfil sin laboral ni ingresos se arma igual", () => {
  const pm = mensajeParaElModelo({ cedula: "0000000000", identidad: { nombreCompleto: NOMBRES[0] } }, []).perfilDelModelo as Record<string, unknown>;
  assertEquals("cedula" in pm, false);
  assertEquals(pm.identidad, {});
});
