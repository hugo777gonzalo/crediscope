// El «obligado a llevar contabilidad» del RUC (estructura-v15): ruc.ts lo lee y
// process.ts lo pone en laboral, del mismo registro que las fechas.
import { assertEquals } from "jsr:@std/assert@1";
import { obligadoALlevarContabilidad } from "./ruc.ts";
import { buildStandardProfile } from "./process.ts";
import type { RespuestaNovadata } from "./types.ts";

const registro = (obligado: unknown) => ({ ruc: "0000000000001", fecha_inscripcion_ruc: "2020/01/10", fecha_inicio_actividades: "2020/01/10", obligado });

Deno.test("el obligado: Novadata lo abrevia, «S» es «SI» y «N» es «NO»; otro valor queda sin dato", () => {
  for (const v of ["SI", "S", "si", " S "]) assertEquals(obligadoALlevarContabilidad(registro(v)), true, v);
  for (const v of ["NO", "N", "no"]) assertEquals(obligadoALlevarContabilidad(registro(v)), false, v);
  for (const v of [null, undefined, "", "X", "SIN DATO"]) assertEquals(obligadoALlevarContabilidad(registro(v)), null, String(v));
});

Deno.test("el obligado sin RUC no es false: un cascarón o ningún registro quedan sin dato", () => {
  assertEquals(obligadoALlevarContabilidad({ ruc: null, fecha_inscripcion_ruc: null, obligado: "NO" }), null);
  // Con el número de RUC y sin fecha de inscripción, el perfil lo da con RUC (estadoActividadEconomica): el obligado viene.
  assertEquals(obligadoALlevarContabilidad({ ruc: "0000000000001", fecha_inscripcion_ruc: null, obligado: "N" }), false);
  assertEquals(obligadoALlevarContabilidad(null), null);
  assertEquals(obligadoALlevarContabilidad(undefined), null);
});

const crudo = (datosContribuyente: unknown[]) =>
  ({ contribuyente: { status: 200, data: { estado: { codigo: "OK" }, datosContribuyente } } }) as unknown as RespuestaNovadata;

Deno.test("el perfil lleva el obligado en laboral, del mismo RUC que las fechas", () => {
  const { profile } = buildStandardProfile(crudo([registro("S")]), "0000000000", "2026-08");
  assertEquals(profile.laboral.obligadoALlevarContabilidadRuc, true);
  assertEquals(profile.laboral.fechaInicioActividadesRuc, "2020-01-10");
  assertEquals(buildStandardProfile(crudo([registro("N")]), "0000000000", "2026-08").profile.laboral.obligadoALlevarContabilidadRuc, false);
  assertEquals(buildStandardProfile(crudo([]), "0000000000", "2026-08").profile.laboral.obligadoALlevarContabilidadRuc, null);
  assertEquals(buildStandardProfile({} as never, "0000000000", "2026-08").profile.laboral.obligadoALlevarContabilidadRuc, null);
});
