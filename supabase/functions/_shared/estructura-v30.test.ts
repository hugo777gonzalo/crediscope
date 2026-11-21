// estructura-v30 (E7, etapa B del grupo 4 de la capa de hechos, parte laboral): `laboral` sale de los hechos y
// una fuente que no contestó deja el campo sin dato. Lo que se prueba:
//   - con todas las fuentes contestando el perfil es el de siempre: sin `camposSinDato` y con las 33 claves en
//     el orden de siempre (el modelo lee el JSON en orden);
//   - con una fuente caída el campo es null, el grupo lo marca con lo que escribía la v29, y todo lo que lee
//     el perfil guardado lo lee como antes (conLosValoresDeAntes): el modelo, la capacidad de pago, el
//     predictor de ingresos, el perfil laboral y los eventos entre consultas;
//   - la migración 153 lee lo laboral del resumen por persona con `valor_de_antes()`: un null de JSON en
//     `empleosActuales` rompía `jsonb_array_length(coalesce(...))`.
// Todo valor es inventado: el repositorio es público.

import { assertEquals } from "jsr:@std/assert@1";
import { buildStandardProfile, PROCESS_VERSION } from "./process.ts";
import { camposSinDato, conLosValoresDeAntes } from "./campos-sin-dato.ts";
import { armarPerfilDelModelo } from "./perfil-del-modelo.ts";
import { clasificarPerfilLaboral } from "./perfil-laboral.ts";
import { vectorDeNivel1 } from "./variables-de-ingreso.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

const CEDULA = "0000000000";
const ok = (data: unknown) => ({ status: "ok", data });
const caida = { status: "error", data: null };

const ahora = new Date();
const mesActual = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
const aporte = { rucEmp: "1790000000001", nomEmp: "EMPRESA FICTICIA S.A.", tipEmp: "2-EMPRESA PRIVADA", salario: "800", fecIng: "01/03/2020", fecSal: "", ocupacion: "ANALISTA", anio: ahora.getFullYear(), mes: ahora.getMonth() + 1 };

function crudo(cambios: Record<string, unknown> = {}): RespuestaProveedorInfo1 {
  return {
    general: ok({ personaNatural: { identificacion: CEDULA, nombre: "PRUEBA FICTICIO UNO", fechaNacimiento: "1985-05-05" } }),
    basesInternas: ok({ tiess: [aporte] }),
    trabajoHistoricosMecanizado: ok({ mecanizadoEmpleados: [{ baseDate: mesActual, rucEmpresa: "1790000000001", nombreEmpresa: "EMPRESA FICTICIA S.A.", personaIngreso: { valor: 800 }, cargo: { nombre: "ANALISTA" } }] }),
    trabajoHistoricos: ok({ trabajosHistoricos: [] }),
    empleados: ok({ empleados: [] }),
    administraciones: ok({ administraciones: [] }),
    cumplimientoPatronal: ok({ afiliaciones: [] }),
    contribuyente: ok({ datosContribuyente: [{ ruc: "0000000000001", fecha_inscripcion_ruc: "2020/01/10", fecha_inicio_actividades: "2020/01/10", obligado: "NO" }] }),
    establecimientoActEconomica: ok({ datosEstablecimientoActEco: [{ num_establecimiento: "001", estado_establecimiento: "ABIERTO", act_economica: "VENTA INVENTADA" }] }),
    ...cambios,
  } as unknown as RespuestaProveedorInfo1;
}
const perfilDe = (raw: RespuestaProveedorInfo1) => buildStandardProfile(raw, CEDULA, "2026-10").profile;

const CLAVES = [
  "empleosActuales", "empleadorConApellidoDelCliente", "clienteEsSuPropioEmpleador", "numeroEmpleadoresUltimos24Meses", "ingresoPromedioUltimos6Meses",
  "esEmpleadorOAdministrador", "tieneRucActivo", "tieneEstablecimientoActivo", "esIndependiente", "numeroEmpleadosRegistrados", "tipoEmpleador",
  "obligacionesPatronalesEnMora", "historialEmpleosRegistrados", "salarioMasAltoRegistrado", "cargoVigente", "empleadorVigenteSituacionLegal",
  "empleadorVigenteTipoCompania", "empleadorVigenteAntiguedadAnios", "empleadoresJuridicos", "fechaInicioActividadesRuc", "fechaCeseActividadesRuc",
  "fechaReinicioActividadesRuc", "numeroEstablecimientosActivos", "numeroEstablecimientosInactivos", "tieneEstablecimientosRegistrados",
  "estadoActividadEconomica", "antiguedadUltimaEtapaActivaMeses", "mesesInactivoActividadEconomica", "tipoUltimoCeseRuc", "rucDepuradoPorElSri",
  "obligadoALlevarContabilidadRuc", "antiguedadEmpleoActualMeses", "duracionEmpleoMasLargoMeses",
];

Deno.test("la versión de la estructura es la v30 o posterior", () => {
  assertEquals(Number(PROCESS_VERSION.replace("estructura-v", "")) >= 30, true, PROCESS_VERSION);
});

Deno.test("con todas las fuentes contestando no hay marca y las 33 claves van en el orden de siempre", () => {
  const p = perfilDe(crudo());
  assertEquals("camposSinDato" in p.laboral, false);
  assertEquals(Object.keys(p.laboral), CLAVES);
  assertEquals(p.laboral.tieneRucActivo, true);
  assertEquals(p.laboral.numeroEstablecimientosActivos, 1);
  assertEquals((p.laboral.empleosActuales as unknown[]).length, 1);
});

Deno.test("el mecanizado caído: el empleo actual queda sin dato y lleva el parcial que daban los aportes", () => {
  const p = perfilDe(crudo({ trabajoHistoricosMecanizado: caida }));
  assertEquals(p.laboral.empleosActuales, null);
  assertEquals(camposSinDato(p.laboral).includes("empleosActuales"), true);
  assertEquals((p.laboral.camposSinDato?.empleosActuales as unknown[]).length, 1);
  assertEquals(Object.keys(p.laboral).slice(0, 33), CLAVES);
});

Deno.test("el contribuyente caído: el RUC y sus fechas quedan sin dato, y lo que no lo mira sigue con valor", () => {
  const p = perfilDe(crudo({ contribuyente: caida }));
  for (const c of ["tieneRucActivo", "estadoActividadEconomica", "fechaInicioActividadesRuc", "obligadoALlevarContabilidadRuc", "esIndependiente"]) {
    assertEquals((p.laboral as unknown as Record<string, unknown>)[c], null, c);
    assertEquals(camposSinDato(p.laboral).includes(c), true, c);
  }
  assertEquals((p.laboral.empleosActuales as unknown[]).length, 1);
  assertEquals(p.laboral.numeroEmpleadoresUltimos24Meses, 1);
});

Deno.test("todo lo que lee el perfil guardado lo lee como antes: el valor de antes de cada campo", () => {
  const p = perfilDe(crudo({ contribuyente: caida, trabajoHistoricosMecanizado: caida, empleados: caida }));
  const leido = conLosValoresDeAntes(p);
  assertEquals("camposSinDato" in leido.laboral, false);
  assertEquals(Object.keys(leido.laboral), CLAVES);
  assertEquals(leido.laboral.tieneRucActivo, false); // lo que escribía la v29 sin el contribuyente
  assertEquals(leido.laboral.estadoActividadEconomica, "sin_ruc");
  assertEquals(leido.laboral.numeroEmpleadosRegistrados, 0);
  assertEquals(Array.isArray(leido.laboral.empleosActuales), true);
  // El modelo no ve la marca.
  const delModelo = armarPerfilDelModelo(p as unknown as Record<string, unknown>) as unknown as Record<string, Record<string, unknown>>;
  assertEquals("camposSinDato" in delModelo.laboral, false);
  assertEquals(delModelo.laboral.tieneRucActivo, false);
});

Deno.test("el predictor y el perfil laboral no cambian por una fuente caída: leen los valores de antes", () => {
  const p = perfilDe(crudo({ contribuyente: caida }));
  const deAntes = conLosValoresDeAntes(p);
  // Sin el contribuyente el predictor deja el SRI sin dato, igual con la marca que con el valor de antes.
  assertEquals(vectorDeNivel1(p as never, { ahora: ahora.toISOString() }).variables, vectorDeNivel1(deAntes as never, { ahora: ahora.toISOString() }).variables);
  assertEquals(clasificarPerfilLaboral(p as unknown as Record<string, unknown>), clasificarPerfilLaboral(deAntes as unknown as Record<string, unknown>));
});

Deno.test("la migración 153 lee lo laboral del resumen con valor_de_antes() y no con el coalesce que falla con un null de JSON", () => {
  const sql = Deno.readTextFileSync(new URL("../../migrations/153_el_resumen_lee_lo_laboral_como_antes.sql", import.meta.url));
  const sinComentarios = sql.replace(/--[^\n]*/g, "");
  assertEquals(sinComentarios.includes("valor_de_antes(p.sp, 'laboral', 'empleosActuales')"), true);
  assertEquals(sinComentarios.includes("valor_de_antes(p.sp, 'laboral', 'esIndependiente')"), true);
  assertEquals(sinComentarios.includes("coalesce(p.sp -> 'laboral' -> 'empleosActuales'"), false);
  assertEquals(sinComentarios.includes("p.sp -> 'laboral' ->> 'esIndependiente'"), false);
  // Es el twin de conLosValoresDeAntes: el null de JSON se reemplaza por lo que dice camposSinDato.
  assertEquals(sinComentarios.includes("-> 'camposSinDato' -> p_campo"), true);
});
