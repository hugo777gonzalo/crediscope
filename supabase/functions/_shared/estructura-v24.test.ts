// estructura-v24 (D2 del negocio, 2026-11-18): una demanda de cobro o civil en la
// que el demandado es otra persona deja de contar, y lo que no se puede atribuir
// sigue contando y se avisa. Datos inventados: el repositorio es público.
//
// deno test --allow-env supabase/functions/

import { assertEquals, assertFalse } from "jsr:@std/assert@1";
import { atribuirDemandas } from "./demandas.ts";
import { buildStandardProfile, PROCESS_VERSION } from "./process.ts";
import { armarPerfilDelModelo } from "./perfil-del-modelo.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

const PERSONA = "ZZPRUEBA ZZINVENTADA ANA";
const demanda = (delito: string, demandado: unknown, ofendido = "ZZDEMANDANTE UNO") => ({
  tipoDemanda: { descripcion: "DEMANDADO" },
  demanda: { delito, demandado, ofendido, fecha: Date.UTC(2022, 5, 1, 5) },
});
const perfilDe = (demandas: unknown[], nombre: string | null = PERSONA) =>
  buildStandardProfile(
    {
      general: { status: "ok", data: { personaNatural: { nombre } } },
      demandas: { status: "ok", data: { demandas } },
    } as unknown as RespuestaProveedorInfo1,
    "0000000000",
  ).profile;

// v24 o una posterior: la v25 (E4) trae D2 tal cual.
Deno.test("la versión de la estructura es la v24 o posterior", () => {
  assertEquals(Number(PROCESS_VERSION.replace("estructura-v", "")) >= 24, true, PROCESS_VERSION);
});

Deno.test("D2: la de otro demandado y la de apellidos invertidos dejan de contar; vacío y de la persona siguen", () => {
  const delPerfil = [
    demanda("COBRO DE DINERO", PERSONA),
    demanda("COBRO DE DINERO", "ZZINVENTADA ZZPRUEBA ANA"),
    demanda("COBRO DE DINERO", ""),
    demanda("COBRO DE DINERO", "ZZOTRO UNO PEDRO"),
    demanda("COBRO DE DINERO", "ZZPRUEBA ZZOTRO ANA"),
  ];
  const a = atribuirDemandas(delPerfil, PERSONA);
  assertEquals(a.cuentan.length, 2);
  assertEquals(a.deOtroDemandado.length, 3);
  // La contada sin poder confirmarla: sin demandado.
  assertEquals(a.sinCotejo.length, 1);
  const c = perfilDe(delPerfil).riesgoJudicialCrediticio;
  assertEquals(c.numeroDemandasComoDemandado, 2);
  assertEquals(c.demandasDeCobro?.length, 2);
  assertEquals(c.numeroDemandasDeOtroDemandado, 3);
  assertEquals(c.numeroDemandasSinCotejo, 1);
});

Deno.test("D2: las civiles también, y cada una se cuenta en su grupo", () => {
  const p = perfilDe([
    demanda("COBRO DE DINERO", PERSONA),
    demanda("COBRO DE DINERO", "ZZOTRO UNO PEDRO"),
    demanda("DESPIDO INTEMPESTIVO", PERSONA),
    demanda("DIVORCIO", "ZZOTRO DOS LUIS"),
    demanda("DIVORCIO", "ZZOTRO TRES LUIS"),
    demanda("DESPIDO INTEMPESTIVO", null),
  ]);
  assertEquals(p.riesgoJudicialCrediticio.numeroDemandasComoDemandado, 1);
  assertEquals(p.riesgoJudicialCrediticio.numeroDemandasDeOtroDemandado, 1);
  assertEquals(p.riesgoJudicialCrediticio.numeroDemandasSinCotejo, 0);
  assertEquals(p.riesgoJudicialCivil.numeroDemandasComoDemandado, 2);
  assertEquals(p.riesgoJudicialCivil.numeroDemandasDeOtroDemandado, 2);
  assertEquals(p.riesgoJudicialCivil.numeroDemandasSinCotejo, 1);
  assertEquals(p.riesgoJudicialCivil.demandasPorCategoria, [
    { categoria: "Laboral", cantidad: 2, tipos: ["Despido intempestivo"] },
  ]);
});

Deno.test("D2: sin el nombre de la persona nada se descarta (sin cotejo)", () => {
  const p = perfilDe([demanda("COBRO DE DINERO", "ZZOTRO UNO PEDRO"), demanda("DIVORCIO", "ZZOTRO DOS LUIS")], null);
  assertEquals(p.riesgoJudicialCrediticio.numeroDemandasComoDemandado, 1);
  assertEquals(p.riesgoJudicialCrediticio.numeroDemandasDeOtroDemandado, 0);
  assertEquals(p.riesgoJudicialCrediticio.numeroDemandasSinCotejo, 1);
  assertEquals(p.riesgoJudicialCivil.numeroDemandasComoDemandado, 1);
  assertEquals(p.riesgoJudicialCivil.numeroDemandasSinCotejo, 1);
});

Deno.test("D2: sin demandas, ceros", () => {
  const p = perfilDe([]);
  assertEquals(p.riesgoJudicialCrediticio.numeroDemandasDeOtroDemandado, 0);
  assertEquals(p.riesgoJudicialCrediticio.numeroDemandasSinCotejo, 0);
  assertEquals(p.riesgoJudicialCivil.numeroDemandasDeOtroDemandado, 0);
  assertEquals(p.riesgoJudicialCivil.numeroDemandasSinCotejo, 0);
});

Deno.test("D2: el aviso es para el analista: no llega al modelo, los números sí", () => {
  const p = perfilDe([demanda("COBRO DE DINERO", PERSONA), demanda("COBRO DE DINERO", "ZZOTRO UNO PEDRO"), demanda("COBRO DE DINERO", "")]);
  const m = armarPerfilDelModelo(p as unknown as Record<string, unknown>) as Record<string, Record<string, unknown>>;
  assertEquals(m.riesgoJudicialCrediticio.numeroDemandasComoDemandado, 2);
  assertFalse("numeroDemandasDeOtroDemandado" in m.riesgoJudicialCrediticio);
  assertFalse("numeroDemandasSinCotejo" in m.riesgoJudicialCrediticio);
  assertFalse("numeroDemandasDeOtroDemandado" in m.riesgoJudicialCivil);
  assertFalse("numeroDemandasSinCotejo" in m.riesgoJudicialCivil);
});
