// El catalogador de procesos judiciales: qué actuación cierra un proceso y
// cuáles parecen cerrarlo y no lo hacen. Procesos y fechas inventados.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import {
  ANIOS_SIN_AVANCE_PROVISIONAL,
  estadoDelProcesoJudicial,
  type ProcesoJudicial,
} from "./estado-del-proceso-judicial.ts";

const HOY = "2026-11-18";
const opc = { hoy: HOY, aniosSinAvance: ANIOS_SIN_AVANCE_PROVISIONAL };

const PAGO = "SOLUCION O PAGO Y/O EXTINCION DE LA OBLIGACION (AUTO INTERLOCUTORIO)";
const ARCHIVO = "ARCHIVO DEL PROCESO (AUTO INTERLOCUTORIO)";
const ABANDONO =
  "ABANDONO POR FALTA DE IMPULSO PROCESAL ART. 245 (AUTO INTERLOCUTORIO)";
const ACUERDO = "ACUERDO TRANSACCIONAL (AUTO INTERLOCUTORIO)";

function cobro(
  tipos: [string, string][],
  extra: Partial<ProcesoJudicial> = {},
): ProcesoJudicial {
  return {
    numeroProceso: "17371202000001G",
    materia: "CIVIL",
    tipoAccion: "COBRO DE DINERO",
    dependencias: [{
      nombre: "UNIDAD JUDICIAL CIVIL",
      instancia: "PRIMERA INSTANCIA",
      actuaciones: tipos.map(([fecha, tipo]) => ({ fecha, tipo })),
    }],
    ...extra,
  };
}

Deno.test("pago por auto interlocutorio termina", () => {
  const r = estadoDelProcesoJudicial(
    cobro([["2024-01-10", "DEMANDA"], ["2025-03-05", PAGO]]),
    opc,
  );
  assertEquals(r.estado, "terminado");
  assertEquals(r.motivo, "pago");
  assertEquals(r.fechaDeCierre, "2025-03-05");
  assertEquals(r.actuacionDeCierre, PAGO);
  assertEquals(r.ultimaActuacion, "2025-03-05");
  assertEquals(r.dependenciaPrincipal, "UNIDAD JUDICIAL CIVIL");
});

Deno.test("variante: extinción de la obligación, sin tildes ni mayúsculas", () => {
  const r = estadoDelProcesoJudicial(
    cobro([["2025-03-05", "  extinción  de la obligación (Auto Interlocutorio)"]]),
    opc,
  );
  assertEquals(r.motivo, "pago");
});

Deno.test("archivo del proceso termina", () => {
  const r = estadoDelProcesoJudicial(cobro([["2025-06-01", ARCHIVO]]), opc);
  assertEquals([r.estado, r.motivo], ["terminado", "archivo"]);
});

Deno.test("abandono del art. 245 termina", () => {
  const r = estadoDelProcesoJudicial(cobro([["2025-06-01", ABANDONO]]), opc);
  assertEquals([r.estado, r.motivo], ["terminado", "abandono"]);
});

Deno.test("acuerdo transaccional termina", () => {
  const r = estadoDelProcesoJudicial(cobro([["2025-06-01", ACUERDO]]), opc);
  assertEquals([r.estado, r.motivo], ["terminado", "acuerdo_transaccional"]);
});

Deno.test("desistimiento por auto interlocutorio termina", () => {
  const r = estadoDelProcesoJudicial(
    cobro([["2025-06-01", "DESISTIMIENTO DE LA DEMANDA (AUTO INTERLOCUTORIO)"]]),
    opc,
  );
  assertEquals([r.estado, r.motivo], ["terminado", "desistimiento"]);
});

Deno.test("acuerdo y luego archivo: el motivo es el del cierre más reciente y se ven los dos", () => {
  const r = estadoDelProcesoJudicial(
    cobro([["2025-02-01", ACUERDO], ["2025-08-01", ARCHIVO]]),
    opc,
  );
  assertEquals(r.motivo, "archivo");
  assertEquals(r.fechaDeCierre, "2025-08-01");
  assertEquals(r.cierres.map((c) => c.motivo), [
    "acuerdo_transaccional",
    "archivo",
  ]);
});

Deno.test("trampa: caducidad de nombramiento de perito no cierra", () => {
  const r = estadoDelProcesoJudicial(
    cobro([["2025-06-01", "CADUCIDAD DE NOMBRAMIENTO DE PERITO"]]),
    opc,
  );
  assertEquals(r.estado, "pendiente");
});

Deno.test("trampa: envío al archivo general (razón) no cierra, aunque se repita", () => {
  const r = estadoDelProcesoJudicial(
    cobro([
      ["2025-01-01", "ENVIO DEL PROCESO AL ARCHIVO GENERAL (RAZON)"],
      ["2025-05-01", "ENVIO DEL PROCESO AL ARCHIVO GENERAL (RAZON)"],
    ]),
    opc,
  );
  assertEquals([r.estado, r.motivo], ["pendiente", null]);
});

Deno.test("trampa: sentencia y razón de ejecutoria no cierran un ejecutivo", () => {
  const r = estadoDelProcesoJudicial(
    cobro([
      ["2025-01-01", "SENTENCIA"],
      ["2025-02-01", "RAZON DE EJECUTORIA"],
      ["2025-03-01", "MANDAMIENTO DE EJECUCION"],
    ]),
    opc,
  );
  assertEquals(r.estado, "pendiente");
});

Deno.test("trampa: «archivo» o «pago» sueltos en el texto o sin auto interlocutorio no cierran", () => {
  const r = estadoDelProcesoJudicial({
    ...cobro([]),
    dependencias: [{
      nombre: "UNIDAD JUDICIAL CIVIL",
      instancia: "PRIMERA INSTANCIA",
      actuaciones: [
        {
          fecha: "2025-01-01",
          tipo: "PROVIDENCIA GENERAL",
          texto: "Se dispone el archivo del proceso y el pago de la obligación",
        },
        { fecha: "2025-02-01", tipo: "ARCHIVO DEL PROCESO (RAZON)" },
        { fecha: "2025-03-01", tipo: "SOLUCION O PAGO (PROVIDENCIA)" },
      ],
    }],
  }, opc);
  assertEquals(r.estado, "pendiente");
});

Deno.test("deprecatorio por tipo de acción: no es demanda", () => {
  const r = estadoDelProcesoJudicial(
    cobro([["2025-01-01", "DEVOLUCION DEPRECATORIO"]], {
      tipoAccion: "DEPRECATORIO",
    }),
    opc,
  );
  assertEquals([r.estado, r.motivo], ["no_es_demanda", "deprecatorio"]);
});

Deno.test("deprecatorio sin tipo de acción: lo delata la devolución", () => {
  const r = estadoDelProcesoJudicial(
    cobro([["2025-01-01", "DEVOLUCION DEPRECATORIO"]], {
      tipoAccion: undefined,
      materia: undefined,
    }),
    opc,
  );
  assertEquals(r.estado, "no_es_demanda");
});

Deno.test("un cobro con un deprecatorio devuelto entre sus dependencias sigue siendo demanda", () => {
  const r = estadoDelProcesoJudicial({
    numeroProceso: "17371202000005G",
    dependencias: [
      {
        nombre: "UNIDAD JUDICIAL CIVIL",
        instancia: "PRIMERA INSTANCIA",
        actuaciones: [
          { fecha: "2025-02-01", tipo: "CALIFICACION DE LA DEMANDA" },
          { fecha: "2025-03-01", tipo: "PROVIDENCIA GENERAL" },
          { fecha: "2025-06-01", tipo: PAGO },
        ],
      },
      {
        nombre: "UNIDAD JUDICIAL DE OTRA CIUDAD",
        actuaciones: [{ fecha: "2025-04-01", tipo: "DEVOLUCION DEPRECATORIO" }],
      },
    ],
  }, opc);
  assertEquals(r.estado, "terminado");
  assertEquals(r.motivo, "pago");
});

Deno.test("varias dependencias: el cierre vale en la de primera instancia", () => {
  const r = estadoDelProcesoJudicial({
    numeroProceso: "17371202000002G",
    dependencias: [
      {
        nombre: "SALA DE LA CORTE PROVINCIAL",
        instancia: "SEGUNDA INSTANCIA",
        actuaciones: [
          { fecha: "2025-09-01", tipo: "ARCHIVO DEL PROCESO (AUTO INTERLOCUTORIO)" },
          { fecha: "2025-09-02", tipo: "RAZON DE EJECUTORIA" },
          { fecha: "2025-09-03", tipo: "OFICIO" },
        ],
      },
      {
        nombre: "UNIDAD JUDICIAL CIVIL",
        instancia: "PRIMERA INSTANCIA",
        actuaciones: [{ fecha: "2025-10-01", tipo: "MANDAMIENTO DE EJECUCION" }],
      },
    ],
  }, opc);
  assertEquals(r.dependenciaPrincipal, "UNIDAD JUDICIAL CIVIL");
  assertEquals(r.estado, "pendiente");
  assertEquals(r.ultimaActuacion, "2025-10-01");
});

Deno.test("varias dependencias sin instancia: manda la de más actuaciones", () => {
  const r = estadoDelProcesoJudicial({
    numeroProceso: "17371202000003G",
    dependencias: [
      { nombre: "OTRA CIUDAD", actuaciones: [{ fecha: "2025-01-01", tipo: "OFICIO" }] },
      {
        nombre: "UNIDAD A",
        actuaciones: [
          { fecha: "2025-01-02", tipo: "DEMANDA" },
          { fecha: "2025-02-01", tipo: PAGO },
        ],
      },
    ],
  }, opc);
  assertEquals(r.dependenciaPrincipal, "UNIDAD A");
  assertEquals(r.motivo, "pago");
});

Deno.test("sin_avance: justo en el límite sigue pendiente y un día después ya no", () => {
  // hoy 2026-11-18, 3 años -> límite 2023-11-18
  const enElLimite = estadoDelProcesoJudicial(cobro([["2023-11-18", "SENTENCIA"]]), opc);
  assertEquals(enElLimite.estado, "pendiente");
  const pasado = estadoDelProcesoJudicial(cobro([["2023-11-17", "SENTENCIA"]]), opc);
  assertEquals(pasado.estado, "sin_avance");
  assertEquals(pasado.motivo, null);
});

Deno.test("sin_avance mira la última actuación de cualquier dependencia", () => {
  const r = estadoDelProcesoJudicial({
    numeroProceso: "17371202000004G",
    dependencias: [
      {
        nombre: "UNIDAD A",
        instancia: "PRIMERA INSTANCIA",
        actuaciones: [{ fecha: "2022-07-01", tipo: "SENTENCIA" }],
      },
      { nombre: "OTRA CIUDAD", actuaciones: [{ fecha: "2026-05-01", tipo: "OFICIO" }] },
    ],
  }, opc);
  assertEquals(r.estado, "pendiente");
  assertEquals(r.ultimaActuacion, "2026-05-01");
});

Deno.test("años desde la última actuación en fechas de calendario", () => {
  const r = estadoDelProcesoJudicial(cobro([["2022-07-01", "SENTENCIA"]]), opc);
  assertEquals(r.estado, "sin_avance");
  assertEquals(r.aniosDesdeUltimaActuacion, 4.38);
});

Deno.test("proceso sin actuaciones: pendiente, sin fechas", () => {
  const r = estadoDelProcesoJudicial(
    { numeroProceso: "17371202000005G", dependencias: [] },
    opc,
  );
  assertEquals(r.estado, "pendiente");
  assertEquals(r.ultimaActuacion, null);
  assertEquals(r.aniosDesdeUltimaActuacion, null);
  assertEquals(r.dependenciaPrincipal, null);
});

Deno.test("29 de febrero como hoy: tres años atrás no existe y el límite cae el 28", () => {
  const o = { hoy: "2028-02-29", aniosSinAvance: 3 };
  assertEquals(
    estadoDelProcesoJudicial(cobro([["2025-02-28", "SENTENCIA"]]), o).estado,
    "pendiente",
  );
  assertEquals(
    estadoDelProcesoJudicial(cobro([["2025-02-27", "SENTENCIA"]]), o).estado,
    "sin_avance",
  );
});
