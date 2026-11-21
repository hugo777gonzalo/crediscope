// estructura-v31 (E7, etapa B del grupo 4 de la capa de hechos, los ingresos): `fuentesIngreso` sale de los
// hechos y una fuente que no contestó deja el campo sin dato. Lo que se prueba:
//   - analizarFuentesIngreso() sigue siendo la única implementación de las reglas: con todas las fuentes
//     contestando, el perfil trae exactamente lo que da esa función, en el mismo orden de claves, y process.ts
//     ya no la llama (corre una sola vez, dentro del grupo `ingresos`);
//   - con una fuente caída el campo es null (los del `detalle`, anidados, con su nombre con punto en la marca), y
//     con los valores de antes el perfil es exactamente lo que escribía la v30: lo que da la función con lo que sí
//     llegó;
//   - lo que lee el perfil guardado lo lee como antes: el modelo, la capacidad de pago, el selector del
//     predictor de ingresos y las columnas del perfil;
//   - la migración 154 copia al resumen el grupo con `grupo_de_antes()`.
// Todo valor es inventado: el repositorio es público.

import { assertEquals } from "jsr:@std/assert@1";
import { buildStandardProfile, PROCESS_VERSION } from "./process.ts";
import { analizarFuentesIngreso } from "./fuentes-ingreso.ts";
import { camposSinDato, conLosValoresDeAntes } from "./campos-sin-dato.ts";
import { armarPerfilDelModelo } from "./perfil-del-modelo.ts";
import { columnasDelPerfil } from "./columnas-del-perfil.ts";
import { decidirEstimacion } from "./estimacion-de-ingreso.ts";
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
    jubilados: ok({ trabajos: [] }),
    afiliacionIssfacCertMedico: ok({ afiliaciones: [] }),
    afiliacionSiisspol: ok({ afiliacionSiisspol: [] }),
    pensionAlimenticiaProveedorInfo1: ok({ supas: [] }),
    sriImpuestoRenta: { status: "faltante", data: null },
    ...cambios,
  } as unknown as RespuestaProveedorInfo1;
}
const CORTE = "2026-10";
const perfilDe = (raw: RespuestaProveedorInfo1) => buildStandardProfile(raw, CEDULA, CORTE).profile;
// Lo que escribía la v30: la función de las reglas sobre el mismo crudo.
const deLaV30 = (raw: RespuestaProveedorInfo1) => analizarFuentesIngreso(raw, "PRUEBA FICTICIO UNO", CORTE, CEDULA);

const CLAVES = [
  "version", "corteIessUsado", "corteDesactualizado", "segmento", "estadoSegmento", "motivoSegmento", "apareceEnUltimoCorte",
  "cortesDesdeLaDesvinculacion", "fuentes", "pisoIngresoMensualReportado", "senalesDeEscala", "paraConfirmar", "detalle",
];
const CLAVES_DEL_DETALLE = [
  "aportesPorMes", "vinculos", "mesesConAporteUltimos12", "mesesConAporteUltimos24", "promedioUltimos6", "promedioUltimos12",
  "totalHace12Meses", "continuidadLaboral", "actividadesEconomicas", "impuestoRentaPorAnio",
];

Deno.test("la versión de la estructura es la v31 o posterior", () => {
  assertEquals(Number(PROCESS_VERSION.replace("estructura-v", "")) >= 31, true, PROCESS_VERSION);
});

Deno.test("con todas las fuentes contestando el perfil trae lo que da analizarFuentesIngreso(), sin marca y en el mismo orden", () => {
  const raw = crudo();
  const p = perfilDe(raw);
  assertEquals("camposSinDato" in p.fuentesIngreso, false);
  assertEquals(Object.keys(p.fuentesIngreso), CLAVES);
  assertEquals(Object.keys(p.fuentesIngreso.detalle ?? {}), CLAVES_DEL_DETALLE);
  assertEquals(JSON.stringify(p.fuentesIngreso), JSON.stringify(deLaV30(raw)));
  assertEquals(p.fuentesIngreso.segmento, "dependiente_privado");
});

Deno.test("process.ts ya no llama a analizarFuentesIngreso(): corre una sola vez, dentro del grupo ingresos", () => {
  const codigo = Deno.readTextFileSync(new URL("./process.ts", import.meta.url));
  assertEquals(/analizarFuentesIngreso\(/.test(codigo.replace(/\/\/[^\n]*/g, "")), false);
  assertEquals(/from "\.\/fuentes-ingreso\.ts"/.test(codigo), false);
});

Deno.test("los aportes caídos: el segmento y sus cifras quedan sin dato, y con los valores de antes es exactamente la v30", () => {
  const raw = crudo({ basesInternas: caida });
  const p = perfilDe(raw);
  assertEquals(p.fuentesIngreso.segmento, null);
  assertEquals(p.fuentesIngreso.fuentes, null);
  assertEquals(p.fuentesIngreso.corteIessUsado, null);
  // Lo que escribía la v30: con el RUC activo y sin los aportes, un independiente (no «sin_datos»: el RUC sí contestó).
  assertEquals(p.fuentesIngreso.camposSinDato?.segmento, "independiente");
  assertEquals(p.fuentesIngreso.camposSinDato?.segmento, deLaV30(raw).segmento);
  // Un campo del detalle va anidado en el perfil y con su nombre con punto en la marca.
  assertEquals(p.fuentesIngreso.detalle?.aportesPorMes, null);
  assertEquals(Object.hasOwn(p.fuentesIngreso, "detalle.aportesPorMes"), false);
  assertEquals(camposSinDato(p.fuentesIngreso).includes("detalle.aportesPorMes"), true);
  const antes = conLosValoresDeAntes(p).fuentesIngreso;
  assertEquals("camposSinDato" in antes, false);
  assertEquals(JSON.stringify(antes), JSON.stringify(deLaV30(raw)));
});

Deno.test("una fuente de las que el segmento lee, caída: sólo el segmento y lo que la lee quedan sin dato", () => {
  const raw = crudo({ empleados: caida });
  const p = perfilDe(raw);
  assertEquals(p.fuentesIngreso.segmento, null);
  assertEquals(p.fuentesIngreso.senalesDeEscala, null);
  assertEquals(p.fuentesIngreso.pisoIngresoMensualReportado, 800); // lo calculan los aportes, que contestaron
  assertEquals(p.fuentesIngreso.detalle?.mesesConAporteUltimos12, 1);
  assertEquals(JSON.stringify(conLosValoresDeAntes(p).fuentesIngreso), JSON.stringify(deLaV30(raw)));
});

Deno.test("todo lo que lee el perfil guardado lo lee como antes: el modelo, la capacidad, el selector del predictor y las columnas", () => {
  const raw = crudo({ basesInternas: caida, contribuyente: caida });
  const p = perfilDe(raw);
  const delModelo = armarPerfilDelModelo(p as unknown as Record<string, unknown>) as unknown as Record<string, Record<string, unknown>>;
  assertEquals(JSON.stringify(delModelo).includes("camposSinDato"), false);
  // El selector del predictor y las columnas: con la marca y con los valores de antes dan lo mismo.
  const deAntes = conLosValoresDeAntes(p);
  assertEquals(
    decidirEstimacion(p as unknown as Record<string, unknown>, null),
    decidirEstimacion(deAntes as unknown as Record<string, unknown>, null),
  );
  assertEquals(columnasDelPerfil(p), columnasDelPerfil(deAntes));
  assertEquals(columnasDelPerfil(p).fuente_segmento, deLaV30(raw).segmento);
});

Deno.test("la migración 154 copia el grupo al resumen con grupo_de_antes() y no el grupo tal cual", () => {
  const sql = Deno.readTextFileSync(new URL("../../migrations/154_el_resumen_copia_las_fuentes_de_ingreso_como_antes.sql", import.meta.url));
  const sinComentarios = sql.replace(/--[^\n]*/g, "");
  assertEquals(sinComentarios.includes("grupo_de_antes(p.sp -> 'fuentesIngreso')"), true);
  assertEquals(/^\s+p\.sp -> 'fuentesIngreso',/m.test(sinComentarios), false);
  assertEquals(sinComentarios.includes("string_to_array(c.key, '.')"), true); // los campos con punto del detalle
});
