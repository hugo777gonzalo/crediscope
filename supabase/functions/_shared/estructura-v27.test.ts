// estructura-v27 (E6, etapa B del grupo 3 de la capa de hechos): el riesgo judicial sale de los
// hechos y una fuente que no contestó deja el campo sin dato. Lo que se prueba:
//   - sin fuentes caídas el perfil es el de siempre y no lleva `camposSinDato`;
//   - con una fuente caída el campo es null, el grupo lo marca con el parcial, y el modelo y
//     la capacidad de pago leen lo de antes (campos-sin-dato.ts);
//   - el bloqueo no se mueve por una fuente caída: no desbloquea a quien tiene un delito en otra
//     y no bloquea sin evidencia.
// Todo valor es inventado: el repositorio es público.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { buildStandardProfile } from "./process.ts";
import { evaluarControlesBloqueo } from "./controles-bloqueo.ts";
import { camposSinDato, conLosValoresDeAntes } from "./campos-sin-dato.ts";
import { armarPerfilDelModelo } from "./perfil-del-modelo.ts";
import { datosDeCapacidad } from "./capacidad-de-pago.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

const CEDULA = "0000000000";
const NOMBRE = "PRUEBA FICTICIO UNO";

const demanda = (delito: string, demandado: string, ofendido = "PERSONA INVENTADA") => ({
  demanda: { numeroProceso: `7000-${delito.length}-${demandado.length}`, delito, demandado, ofendido, fecha: Date.UTC(2024, 4, 10, 5) },
});

// El crudo mínimo de las fuentes judiciales; cada una se puede reemplazar o tirar abajo.
function crudo(cambios: Record<string, unknown> = {}): RespuestaProveedorInfo1 {
  return {
    general: { status: "ok", data: { personaNatural: { identificacion: CEDULA, nombre: NOMBRE } } },
    demandas: { status: "ok", data: { demandas: [] } },
    demandasOfendido: { status: "ok", data: { demandas: [] } },
    pensionAlimenticia: { status: "ok", data: { supas: [] } },
    pensionAlimenticiaProveedorInfo1: { status: "ok", data: { supas: [] } },
    denuncias: { status: "ok", data: { denuncias: [] } },
    antecedentesPenales: { status: "ok", data: { antecedentes: { descripcion: "NO" } } },
    ...cambios,
  } as unknown as RespuestaProveedorInfo1;
}
const caida = { status: "error", data: null };
const perfilDe = (raw: RespuestaProveedorInfo1) => buildStandardProfile(raw, CEDULA).profile;

Deno.test("sin fuentes caídas el perfil judicial no lleva la marca ni valores en null", () => {
  const p = perfilDe(crudo({ demandas: { status: "ok", data: { demandas: [demanda("PAGARE", NOMBRE, "BANCO INVENTADO S.A.")] } } }));
  for (const g of ["riesgoJudicialCrediticio", "riesgoJudicialCivil", "riesgoSeguridadCiudadana"] as const) {
    assertEquals("camposSinDato" in p[g], false, g);
    assertEquals(Object.values(p[g]).includes(null as never), g === "riesgoJudicialCivil" ? true : false, g); // la deuda de pensión es null «sin pensiones», como siempre
  }
  assertEquals(p.riesgoJudicialCrediticio.numeroDemandasComoDemandado, 1);
  assertEquals(p.riesgoJudicialCivil.deudaPensionAlimenticia, null);
  assertEquals(p.riesgoSeguridadCiudadana, { tieneDelitoSeguridadCiudadana: false, categoriasDelitoSeguridadCiudadana: [] });
});

Deno.test("el orden de las claves de los tres grupos es el de siempre (el modelo lee el JSON en orden)", () => {
  const p = perfilDe(crudo());
  assertEquals(Object.keys(p.riesgoJudicialCrediticio), ["numeroDemandasComoDemandado", "tiposDemandasComoDemandado", "demandasDeCobro", "numeroDemandasDeOtroDemandado", "numeroDemandasSinCotejo"]);
  assertEquals(Object.keys(p.riesgoJudicialCivil), [
    "numeroDemandasComoDemandado", "tiposDemandasComoDemandado", "demandasPorCategoria", "numeroDemandasDeOtroDemandado", "numeroDemandasSinCotejo",
    "numeroDemandasComoOfendido", "tienePensionAlimenticia", "pensionAlimenticiaEnMora", "deudaPensionAlimenticia", "numeroPensionesAlimenticias",
    "numeroPensionesVigentes", "valorMensualPensiones", "numeroPensionesEnMora",
  ]);
  assertEquals(Object.keys(p.riesgoSeguridadCiudadana), ["tieneDelitoSeguridadCiudadana", "categoriasDelitoSeguridadCiudadana"]);
});

Deno.test("sin la fuente de demandas: demandas y seguridad en null, con el parcial; el resto del grupo civil sigue", () => {
  const p = perfilDe(crudo({ demandas: caida }));
  const cred = p.riesgoJudicialCrediticio;
  assertEquals(cred.numeroDemandasComoDemandado, null);
  assertEquals(cred.tiposDemandasComoDemandado, null);
  assertEquals(cred.demandasDeCobro, null);
  assertEquals(camposSinDato(cred).sort(), ["demandasDeCobro", "numeroDemandasComoDemandado", "numeroDemandasDeOtroDemandado", "numeroDemandasSinCotejo", "tiposDemandasComoDemandado"]);
  assertEquals(cred.camposSinDato?.numeroDemandasComoDemandado, 0);
  const civil = p.riesgoJudicialCivil;
  assertEquals(civil.numeroDemandasComoDemandado, null);
  // Las demandas que presentó y las pensiones vienen de otras fuentes, que sí contestaron.
  assertEquals(civil.numeroDemandasComoOfendido, 0);
  assertEquals(civil.tienePensionAlimenticia, false);
  assertEquals("numeroDemandasComoOfendido" in (civil.camposSinDato ?? {}), false);
  assertEquals(p.riesgoSeguridadCiudadana.tieneDelitoSeguridadCiudadana, null);
});

// pn_supa (`pensionAlimenticia`) no trae al obligado y ninguno de sus registros cuenta: su caída no
// cambia lo que se sabe de las pensiones, así que no deja nada sin dato. Sólo la fuente que cuenta
// (`pensionAlimenticiaProveedorInfo1`) lo hace.
Deno.test("pensiones: la caída de pn_supa no deja nada sin dato", () => {
  const p = perfilDe(crudo({
    pensionAlimenticia: caida,
    pensionAlimenticiaProveedorInfo1: { status: "ok", data: { supas: [{ numeroProceso: "S-9", obligadoPrincipal: NOMBRE, valorMensual: 120, totalDeuda: 40 }] } },
  }));
  const civil = p.riesgoJudicialCivil;
  assertEquals("camposSinDato" in civil, false);
  assertEquals(civil.valorMensualPensiones, 120);
  assertEquals(civil.tienePensionAlimenticia, true);
  assertEquals(civil.deudaPensionAlimenticia, 40);
});

Deno.test("pensiones: sin la fuente que cuenta, los 7 campos son null, aunque pn_supa conteste", () => {
  const p = perfilDe(crudo({
    pensionAlimenticiaProveedorInfo1: caida,
    // Un registro de pn_supa sin obligado: nunca cuenta, tampoco como parcial.
    pensionAlimenticia: { status: "ok", data: { supas: [{ numeroProceso: "S-1", representanteLegal: NOMBRE, valorMensual: 99, totalDeuda: 500 }] } },
  }));
  const civil = p.riesgoJudicialCivil;
  assertEquals(
    ["tienePensionAlimenticia", "pensionAlimenticiaEnMora", "deudaPensionAlimenticia", "numeroPensionesAlimenticias", "numeroPensionesVigentes", "valorMensualPensiones", "numeroPensionesEnMora"]
      .map((c) => [c, (civil as unknown as Record<string, unknown>)[c]]),
    ["tienePensionAlimenticia", "pensionAlimenticiaEnMora", "deudaPensionAlimenticia", "numeroPensionesAlimenticias", "numeroPensionesVigentes", "valorMensualPensiones", "numeroPensionesEnMora"].map((c) => [c, null]),
  );
  assertEquals(civil.camposSinDato?.valorMensualPensiones, 0);
  assertEquals(civil.camposSinDato?.tienePensionAlimenticia, false);
  assertEquals(civil.numeroDemandasComoDemandado, 0); // las demandas contestaron
});

Deno.test("pensiones: si caen las dos, también", () => {
  const civil = perfilDe(crudo({ pensionAlimenticia: caida, pensionAlimenticiaProveedorInfo1: caida })).riesgoJudicialCivil;
  assertEquals(civil.valorMensualPensiones, null);
  assertEquals(civil.tienePensionAlimenticia, null);
});

Deno.test("el modelo y la capacidad de pago leen los valores de antes, byte a byte", () => {
  const raw = crudo({
    demandas: caida,
    pensionAlimenticiaProveedorInfo1: { status: "ok", data: { supas: [{ numeroProceso: "S-9", obligadoPrincipal: NOMBRE, valorMensual: 120, totalDeuda: 40 }] } },
    pensionAlimenticia: caida,
  });
  // Con demandas caídas y pn_supa caída: las pensiones siguen con valor (la que cayó no cuenta).
  const p = perfilDe(raw);
  const leido = conLosValoresDeAntes(p);
  assertEquals(leido.riesgoJudicialCrediticio, { numeroDemandasComoDemandado: 0, tiposDemandasComoDemandado: [], demandasDeCobro: [], numeroDemandasDeOtroDemandado: 0, numeroDemandasSinCotejo: 0 });
  assertEquals(leido.riesgoSeguridadCiudadana, { tieneDelitoSeguridadCiudadana: false, categoriasDelitoSeguridadCiudadana: [] });
  const delModelo = armarPerfilDelModelo(p as unknown as Record<string, unknown>) as unknown as Record<string, Record<string, unknown>>;
  assertEquals("camposSinDato" in delModelo.riesgoJudicialCivil, false);
  assertEquals(delModelo.riesgoJudicialCivil.valorMensualPensiones, 120);
  assertEquals(delModelo.riesgoJudicialCrediticio.numeroDemandasComoDemandado, 0);
  const capacidad = datosDeCapacidad(p as unknown as Record<string, unknown>, null);
  assertEquals(capacidad.obligaciones.find((o) => o.concepto === "Pensión alimenticia que paga")?.montoMensual, 120);
});

// ---- El bloqueo con una fuente caída ----

Deno.test("bloqueo: la fuente de demandas caída no bloquea ni deja hallazgo, y no limpia a nadie", () => {
  const r = evaluarControlesBloqueo(crudo({ demandas: caida }), CEDULA);
  assertEquals(r.bloqueado, false);
  assertEquals(r.hallazgos, []);
});

Deno.test("bloqueo: un delito en los antecedentes sigue bloqueando con las demandas caídas", () => {
  const r = evaluarControlesBloqueo(crudo({ demandas: caida, antecedentesPenales: { status: "ok", data: { antecedentes: { descripcion: "EXTORSION" } } } }), CEDULA);
  assertEquals(r.bloqueado, true);
  assertEquals(r.hallazgos.map((h) => h.code), ["delito_seguridad_ciudadana"]);
});

Deno.test("bloqueo: una demanda penal propia sigue bloqueando con las denuncias caídas", () => {
  const r = evaluarControlesBloqueo(crudo({ denuncias: caida, demandas: { status: "ok", data: { demandas: [demanda("EXTORSION", NOMBRE)] } } }), CEDULA);
  assertEquals(r.bloqueado, true);
  assertEquals(r.hallazgos.map((h) => h.code), ["delito_seguridad_ciudadana"]);
});

Deno.test("bloqueo: el hallazgo sale sin campos de más (el análisis lo guarda y el modelo lo lee)", () => {
  const r = evaluarControlesBloqueo(crudo({ demandas: { status: "ok", data: { demandas: [demanda("EXTORSION", NOMBRE), demanda("LAVADO DE ACTIVOS", "OTRA PERSONA INVENTADA")] } } }), CEDULA);
  for (const h of r.hallazgos) assertEquals(Object.keys(h).sort(), ["bloqueante", "code", "message"]);
  assert(r.hallazgos.length === 2);
});
