// estructura-v16: el historial de empleos lee las tres fuentes del IESS, los
// préstamos del IESS/BIESS las dos suyas y el retail guarda su corte. Datos
// inventados: el repositorio es público.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { buildStandardProfile } from "./process.ts";
import type { RespuestaNovadata } from "./types.ts";

const CEDULA = "0000000000";
const ahora = new Date();
const MES_ACTUAL = `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, "0")}`;
const RUC_NUEVA = "0990000001001";
const RUC_VIEJA = "0990000002001";
const RUC_OTRA = "0990000003001";
const RUC_CUARTA = "0990000004001";

const fuente = (data: Record<string, unknown>) => ({ status: "ok", data });

const registroDelHistorial = (ruc: string, nombre: string, salario: number, cargo: string, hasta: number | null) => ({
  personaTrabajo: {
    fechaIngreso: Date.UTC(2019, 0, 1),
    fechaAfiliacionHasta: hasta,
    personaPatrono: {
      tipoPersona: "JURIDICA",
      identificacion: ruc,
      nombre,
      fechaConstitucion: Date.UTC(1990, 0, 1),
      tipoCompania: { nombre: "ANONIMA" },
      situacionLegal: { nombre: "ACTIVA" },
    },
    personaIngreso: { valor: salario },
    cargo: { nombre: cargo },
  },
});

const registroDelMecanizado = (ruc: string, nombre: string, salario: number, cargo: string, mes: string) => ({
  baseDate: mes,
  rucEmpresa: ruc,
  nombreEmpresa: nombre,
  personaPatrono: { identificacion: ruc, nombre },
  personaIngreso: { valor: salario },
  cargo: { nombre: cargo },
});

const aporte = (ruc: string | null, nombre: string, salario: number, anio: number, mes: number) => ({
  rucEmp: ruc ?? "",
  nomEmp: nombre,
  salario: String(salario),
  fecIng: "01/01/2018",
  fecSal: "",
  ocupacion: "AUXILIAR",
  anio,
  mes,
});

function perfilDe(fuentes: Record<string, unknown>) {
  const raw = { general: { status: "ok", data: { personaNatural: { nombre: "ZZPRUEBA ZZINVENTADA ANA" } } }, ...fuentes } as unknown as RespuestaNovadata;
  return buildStandardProfile(raw, CEDULA).profile;
}

// El caso que lo destapó: el historial trae una pasantía vieja con la salida
// en 1900-01-01, y los aportes y el mecanizado dicen otra cosa.
const FUENTES_LABORALES = {
  trabajoHistoricos: fuente({
    trabajosHistoricos: [registroDelHistorial(RUC_VIEJA, "EMPRESA VIEJA S.A.", 328.33, "PASANTE", Date.UTC(1900, 0, 1))],
  }),
  trabajoHistoricosMecanizado: fuente({
    mecanizadoEmpleados: [
      registroDelMecanizado(RUC_NUEVA, "EMPRESA NUEVA S.A.", 2400, "ANALISTA", MES_ACTUAL),
      registroDelMecanizado(RUC_NUEVA, "EMPRESA NUEVA S.A.", 2000, "ANALISTA", "2020-01"),
    ],
  }),
  basesInternas: fuente({
    tiess: [
      // La misma empresa nueva escrita de otra manera y sin RUC: no es otro empleador.
      aporte(null, "EMPRESA NUEVA SA", 2400, ahora.getFullYear(), ahora.getMonth() + 1),
      aporte(RUC_OTRA, "OTRA EMPRESA CIA. LTDA.", 3517.57, 2021, 5),
      aporte(RUC_CUARTA, "CUARTA EMPRESA", 900, 2019, 2),
      // Y la empresa vieja del historial, con su RUC.
      aporte(RUC_VIEJA, "EMPRESA VIEJA SA", 400, 2019, 3),
    ],
  }),
};

Deno.test("el salario más alto es el máximo de las tres fuentes del IESS", () => {
  assertEquals(perfilDe(FUENTES_LABORALES).laboral.salarioMasAltoRegistrado, 3517.57);
});

Deno.test("los empleadores registrados son los distintos de las tres fuentes, una empresa con grafías distintas cuenta una vez", () => {
  // Nueva, vieja, otra y cuarta: cuatro; «EMPRESA NUEVA SA» sin RUC es la nueva.
  assertEquals(perfilDe(FUENTES_LABORALES).laboral.historialEmpleosRegistrados, 4);
});

Deno.test("el cargo vigente es el del empleo actual y no el de la pasantía vieja de 1900", () => {
  const l = perfilDe(FUENTES_LABORALES).laboral;
  assertEquals(l.cargoVigente, "ANALISTA");
  // La pasantía es de otro empleador que el del empleo actual: nada de ella se hereda.
  assertEquals(l.empleadorVigenteAntiguedadAnios, null);
  assertEquals(l.empleadorVigenteSituacionLegal, null);
  assertEquals(l.empleadorVigenteTipoCompania, null);
  assertEquals(l.empleadoresJuridicos, null);
});

Deno.test("sin empleo actual no hay cargo vigente", () => {
  const l = perfilDe({
    trabajoHistoricos: FUENTES_LABORALES.trabajoHistoricos,
    basesInternas: fuente({ tiess: [aporte(RUC_OTRA, "OTRA EMPRESA CIA. LTDA.", 800, 2019, 5)] }),
  }).laboral;
  assertEquals(l.empleosActuales, []);
  assertEquals(l.cargoVigente, null);
  assertEquals(l.empleadorVigenteSituacionLegal, null);
});

Deno.test("los datos del empleador salen del historial sólo si es el de un empleo actual, por RUC", () => {
  const l = perfilDe({
    ...FUENTES_LABORALES,
    trabajoHistoricos: fuente({
      trabajosHistoricos: [
        registroDelHistorial(RUC_VIEJA, "EMPRESA VIEJA S.A.", 328.33, "PASANTE", Date.UTC(1900, 0, 1)),
        // El mismo RUC del empleo actual, con otra grafía del nombre.
        registroDelHistorial(RUC_NUEVA, "NUEVA EMPRESA", 2400, "ANALISTA", null),
      ],
    }),
  }).laboral;
  assertEquals(l.empleadorVigenteSituacionLegal, "ACTIVA");
  assertEquals(l.empleadorVigenteTipoCompania, "ANONIMA");
  assertEquals(typeof l.empleadorVigenteAntiguedadAnios, "number");
  assertEquals(l.empleadoresJuridicos, 1);
});

Deno.test("sin ninguna fuente laboral el perfil se arma con los campos en vacío", () => {
  const l = perfilDe({}).laboral;
  assertEquals(l.historialEmpleosRegistrados, 0);
  assertEquals(l.salarioMasAltoRegistrado, null);
  assertEquals(l.cargoVigente, null);
});

const prestamo = (nro: string, saldo: number, vencido = 0, diasMora = 0, concesion = "04/02/2025", monto = 524) => ({
  nroOperacion: nro,
  estado: "PV",
  diasMora,
  valorPorVencer: saldo,
  valorVencido: vencido,
  fechaConcesion: concesion,
  valorPrestamo: monto,
});

Deno.test("los préstamos de creditoQuirografario cuentan como crédito del IESS/BIESS, con su saldo", () => {
  const b = perfilDe({
    creditoQuirografario: fuente({ prestamos: [prestamo("1654354400", 300.48), prestamo("1654354401", 120.02, 10, 35, "05/03/2025", 800)] }),
  }).comportamientoBancario;
  assertEquals(b.tieneCreditoIessBiess, true);
  assertEquals(b.diasMoraCreditoIessBiess, 35);
  assertEquals(b.saldoPrestamosIessBiess, 430.5);
  assertEquals(b.numeroCreditosFormales, 2);
});

Deno.test("una operación que está en las dos fuentes se cuenta una vez, por su número o por su fecha y monto", () => {
  const deLaBase = (numero: string, saldo: string, fecha: string, monto: string, mora = "0") => ({
    numeroOperacion: numero,
    fechaConsesion: fecha,
    montoTransferido: monto,
    saldoTotalCredito: saldo,
    diasMoraAfi: mora,
  });
  const b = perfilDe({
    basesInternas: fuente({
      tcredQuirografarios: [deLaBase("0000123", "1000", "10/01/2024", "3000"), deLaBase("999", "500", "11/02/2024", "1500")],
    }),
    creditoQuirografario: fuente({
      prestamos: [
        // El mismo número, sin ceros, con más mora: se cuenta una vez y manda el saldo de la base.
        prestamo("123", 900, 0, 20, "10/01/2024", 3000),
        // Otro número, pero la misma fecha y monto que la segunda de la base.
        prestamo("777", 450, 0, 0, "11/02/2024", 1500),
        // Y una que sólo está en los préstamos.
        prestamo("555", 200, 0, 0, "01/06/2025", 400),
      ],
    }),
  }).comportamientoBancario;
  assertEquals(b.saldoPrestamosIessBiess, 1700);
  assertEquals(b.diasMoraCreditoIessBiess, 20);
});

Deno.test("el hipotecario de la base lleva su mora en srDiasmoraafi", () => {
  const b = perfilDe({
    basesInternas: fuente({
      tcredHipotecarios: [{ srNrooperaciongaf: "259681", srFecprimerdesembolso: "19/04/2013", srMontofinanciado: "48000", srSaldototalcredito: "23847.28", srDiasmoraafi: "45" }],
    }),
  }).comportamientoBancario;
  assertEquals(b.diasMoraCreditoIessBiess, 45);
  assertEquals(b.saldoPrestamosIessBiess, 23847.28);
});

Deno.test("sin préstamos del IESS/BIESS no hay crédito, mora ni saldo", () => {
  const b = perfilDe({}).comportamientoBancario;
  assertEquals(b.tieneCreditoIessBiess, false);
  assertEquals(b.diasMoraCreditoIessBiess, null);
  assertEquals(b.saldoPrestamosIessBiess, null);
});

Deno.test("el retail guarda el corte de sus deudas, no el día de la consulta", () => {
  const retail = (fecha: string) => ({ institucion: "CASA INVENTADA", totalDeuda: 100, valorVencido: 0, diasMora: 0, fecha, fechaActualizacion: "2026-10-28" });
  const una = perfilDe({ retails: fuente({ retails: [retail("31/07/25")] }) }).comportamientoBancario;
  assertEquals(una.fechaCorteRetail, "2025-07-31");
  // Con cortes distintos, el más antiguo: la deuda no es más reciente que eso.
  const dos = perfilDe({ retails: fuente({ retails: [retail("31/07/2025"), retail("30/04/25")] }) }).comportamientoBancario;
  assertEquals(dos.fechaCorteRetail, "2025-04-30");
  // Una fecha imposible no se inventa.
  assertEquals(perfilDe({ retails: fuente({ retails: [retail("31/02/25")] }) }).comportamientoBancario.fechaCorteRetail, null);
  assertEquals(perfilDe({}).comportamientoBancario.fechaCorteRetail, null);
});
