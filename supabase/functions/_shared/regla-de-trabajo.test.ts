// Qué cuenta como trabajo, la regla que comparten la continuidad laboral y,
// desde estructura-v14, la antigüedad en el empleo actual. Hasta entonces la
// antigüedad contaba cualquier afiliación vigente y salía más larga que la
// continuidad en 35 de 1.644 personas (2026-10-19): años de aporte
// voluntario sin RUC, del hogar o de un código desconocido.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { reglaDeTrabajo } from "./fuentes-ingreso.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

// Datos inventados: el repositorio es público.
const CEDULA = "0000000000";
const aporte = (codigo: string, anio: number, mes: number) => ({
  anio,
  mes,
  tipEmp: `${codigo} - TIPO DE PRUEBA`,
  nomEmp: "EMPLEADOR DE PRUEBA",
  rucEmp: "0990000000001",
  fecIng: "01/01/2010",
});

// Un RUC que abrió en marzo de 2014 y cesó en junio de 2020, sin reinicio:
// el período con RUC activo es 2014-03..2020-06 (fuentes-ingreso.ts no lo da
// por abierto hoy sin un establecimiento abierto).
const conRuc = {
  contribuyente: {
    data: {
      datosContribuyente: [
        { ruc: "0990000000001", fecha_inscripcion_ruc: "2014-03-01", fecha_inicio_actividades: "2014-03-01", fecha_cancelacion: "2020-06-30" },
      ],
    },
  },
} as unknown as RespuestaProveedorInfo1;
const sinRuc = {} as unknown as RespuestaProveedorInfo1;

Deno.test("con un empleador es trabajo desde su fecha de ingreso", () => {
  const regla = reglaDeTrabajo(sinRuc, CEDULA, null);
  assertEquals(regla(aporte("1", 2026, 8)), { pisoInicio: "1950-01", cuentaPropia: false });
  assertEquals(regla(aporte("9", 2026, 8)), { pisoInicio: "1950-01", cuentaPropia: false });
});

Deno.test("el aporte por cuenta propia sin RUC activo no es trabajo", () => {
  const regla = reglaDeTrabajo(sinRuc, CEDULA, null);
  assertEquals(regla(aporte("3", 2026, 8)), null);
  assertEquals(regla(aporte("24", 2026, 8)), null);
});

Deno.test("el aporte por cuenta propia cuenta desde que abrió el RUC, y no después del cese", () => {
  const regla = reglaDeTrabajo(conRuc, CEDULA, null);
  assertEquals(regla(aporte("3", 2016, 5)), { pisoInicio: "2014-03", cuentaPropia: true });
  assertEquals(regla(aporte("3", 2013, 5)), null);
  assertEquals(regla(aporte("3", 2021, 1)), null);
});

Deno.test("el RISE es trabajo aunque el RUC figure después", () => {
  const regla = reglaDeTrabajo(sinRuc, CEDULA, null);
  assertEquals(regla(aporte("34", 2019, 4)), { pisoInicio: "1950-01", cuentaPropia: true });
});

Deno.test("el trabajo del hogar y un código desconocido no son un empleo", () => {
  const regla = reglaDeTrabajo(conRuc, CEDULA, null);
  assertEquals(regla(aporte("35", 2016, 5)), null);
  assertEquals(regla(aporte("99", 2016, 5)), null);
});
