// El «obligado a llevar contabilidad» del RUC (estructura-v15): ruc.ts lo lee y
// process.ts lo pone en laboral, del mismo registro que las fechas.
import { assertEquals } from "jsr:@std/assert@1";
import { establecimientoAbierto, obligadoALlevarContabilidad, rucActivo, rucDepuradoEnRelacionDeDependencia } from "./ruc.ts";
import { buildStandardProfile } from "./process.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

const registro = (obligado: unknown) => ({ ruc: "0000000000001", fecha_inscripcion_ruc: "2020/01/10", fecha_inicio_actividades: "2020/01/10", obligado });

Deno.test("el obligado: Proveedor_Info_1 lo abrevia, «S» es «SI» y «N» es «NO»; otro valor queda sin dato", () => {
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

// estructura-v17 (decisión del negocio del 2026-10-31): las dos condiciones, y nada más.
const RUC_DEPURADO = { ruc: "0000000000001", fecha_suspension_definitiva: "2017/05/02", observ_solicitud_suspension: "DEPURACION" };
const EN_DEPENDENCIA = { ruc: "0000000000001", act_economica: "ACTIVIDADES LABORALES REALIZADAS BAJO RELACION DE DEPENDENCIA EN EL SECTOR PRIVADO" };

Deno.test("RUC depurado: hacen falta el motivo y la actividad en relación de dependencia", () => {
  assertEquals(rucDepuradoEnRelacionDeDependencia(RUC_DEPURADO, [EN_DEPENDENCIA]), true);
  assertEquals(rucDepuradoEnRelacionDeDependencia({ ...RUC_DEPURADO, observ_solicitud_suspension: " depuración " }, [{ ...EN_DEPENDENCIA, act_economica: "BAJO RELACIÓN DE DEPENDENCIA" }]), true);
  assertEquals(rucDepuradoEnRelacionDeDependencia({ ...RUC_DEPURADO, observ_solicitud_suspension: "CESE DE ACTIVIDADES" }, [EN_DEPENDENCIA]), false);
  assertEquals(rucDepuradoEnRelacionDeDependencia(RUC_DEPURADO, [{ ...EN_DEPENDENCIA, act_economica: "SIN ACTIVIDAD ECONOMICA - CIIU" }]), false);
  assertEquals(rucDepuradoEnRelacionDeDependencia(RUC_DEPURADO, []), false);
  // «NO DEPENDIENTES DE COMERCIOS» es una actividad de comisionistas, no un empleo.
  assertEquals(rucDepuradoEnRelacionDeDependencia(RUC_DEPURADO, [{ ...EN_DEPENDENCIA, act_economica: "VENTA POR COMISIONISTAS (NO DEPENDIENTES DE COMERCIOS)" }]), false);
});

Deno.test("RUC depurado: el establecimiento de otro RUC no cuenta, y sin RUC no hay dato", () => {
  assertEquals(rucDepuradoEnRelacionDeDependencia(RUC_DEPURADO, [{ ...EN_DEPENDENCIA, ruc: "0000000000002" }]), false);
  assertEquals(rucDepuradoEnRelacionDeDependencia(null, [EN_DEPENDENCIA]), null);
  assertEquals(rucDepuradoEnRelacionDeDependencia({ ruc: null, observ_solicitud_suspension: "DEPURACION" }, [EN_DEPENDENCIA]), null);
});

Deno.test("process.ts pone el RUC depurado en laboral, del RUC de referencia", () => {
  const raw = {
    general: { status: "ok", data: { personaNatural: { nombre: "ZZPRUEBA ZZINVENTADA ANA" } } },
    contribuyente: { status: "ok", data: { datosContribuyente: [RUC_DEPURADO] } },
    establecimientoActEconomica: { status: "ok", data: { datosEstablecimientoActEco: [EN_DEPENDENCIA] } },
  } as unknown as RespuestaProveedorInfo1;
  assertEquals(buildStandardProfile(raw, "0000000000").profile.laboral.rucDepuradoEnRelacionDeDependencia, true);
  const sinRuc = { general: raw.general } as unknown as RespuestaProveedorInfo1;
  assertEquals(buildStandardProfile(sinRuc, "0000000000").profile.laboral.rucDepuradoEnRelacionDeDependencia, null);
});

// estructura-v15 (decisión del negocio del 2026-10-29): inactivo sólo si una fecha lo respalda.
Deno.test("un RUC sin fecha de inscripción cuenta, y sin cese está activo; el cascarón sin número, no", () => {
  const sinInscripcion = { ruc: "0000000000001", fecha_inscripcion_ruc: null, fecha_inicio_actividades: "2023/05/02" };
  assertEquals(rucActivo(sinInscripcion), true);
  assertEquals(rucActivo({ ...sinInscripcion, fecha_cancelacion: "2025/01/31" }), false, "con un cese, inactivo");
  assertEquals(rucActivo({ ruc: null, fecha_inscripcion_ruc: null }), false);
});

Deno.test("un establecimiento sin estado está abierto salvo una fecha de cierre sin reinicio posterior", () => {
  assertEquals(establecimientoAbierto({ estado_establecimiento: null, fech_cierre: null }), true);
  assertEquals(establecimientoAbierto({ estado_establecimiento: "", fech_cierre: "15/03/2024" }), false);
  assertEquals(establecimientoAbierto({ estado_establecimiento: null, fech_cierre: "15/03/2024", fech_reinicio_actividades: "01/06/2025" }), true);
  assertEquals(establecimientoAbierto({ estado_establecimiento: null, fech_cierre: "15/03/2024", fech_reinicio_actividades: "01/01/2020" }), false);
  // Abierto según el estado, aunque no traiga la fecha de reapertura.
  assertEquals(establecimientoAbierto({ estado_establecimiento: "ABIERTO", fech_cierre: "15/03/2024" }), true);
  assertEquals(establecimientoAbierto({ estado_establecimiento: "CER", fech_cierre: null }), false);
  // Reabrió después del último cierre: reinició actividades, aunque el estado diga cerrado.
  assertEquals(establecimientoAbierto({ estado_establecimiento: "CER", fech_cierre: "15/03/2024", fech_reinicio_actividades: "01/06/2025" }), true);
  assertEquals(establecimientoAbierto({ estado_establecimiento: "CERRADO", fech_cierre: "15/03/2024", fech_reinicio_actividades: "01/01/2020" }), false);
  // Cerrado sin ninguna fecha: lo dice el estado y nada lo contradice.
  assertEquals(establecimientoAbierto({ estado_establecimiento: "CERRADO", fech_cierre: null, fech_reinicio_actividades: null }), false);
  const ruc = { ruc: "0000000000001", fecha_inscripcion_ruc: null, fecha_inicio_actividades: "2023/05/02" };
  assertEquals(rucActivo(ruc, [{ estado_establecimiento: null, fech_cierre: null }]), true);
  assertEquals(rucActivo(ruc, [{ estado_establecimiento: "CERRADO" }]), false);
});

const crudo = (datosContribuyente: unknown[]) =>
  ({ contribuyente: { status: 200, data: { estado: { codigo: "OK" }, datosContribuyente } } }) as unknown as RespuestaProveedorInfo1;

Deno.test("el perfil lleva el obligado en laboral, del mismo RUC que las fechas", () => {
  const { profile } = buildStandardProfile(crudo([registro("S")]), "0000000000", "2026-08");
  assertEquals(profile.laboral.obligadoALlevarContabilidadRuc, true);
  assertEquals(profile.laboral.fechaInicioActividadesRuc, "2020-01-10");
  assertEquals(buildStandardProfile(crudo([registro("N")]), "0000000000", "2026-08").profile.laboral.obligadoALlevarContabilidadRuc, false);
  assertEquals(buildStandardProfile(crudo([]), "0000000000", "2026-08").profile.laboral.obligadoALlevarContabilidadRuc, null);
  assertEquals(buildStandardProfile({} as never, "0000000000", "2026-08").profile.laboral.obligadoALlevarContabilidadRuc, null);
});
