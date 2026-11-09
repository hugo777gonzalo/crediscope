// estructura-v21: p6 (los préstamos del IESS/BIESS), p3 (la cartera de la
// institución) y p5 (las demandas de cobro) de la revisión del análisis. Datos
// inventados: el repositorio es público.
//
// deno test --allow-env supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { buildStandardProfile } from "./process.ts";
import { quienDemanda } from "./demandas.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

const fuente = (data: Record<string, unknown>) => ({ status: "ok", data });
const perfilDe = (fuentes: Record<string, unknown>) =>
  buildStandardProfile(
    { general: fuente({ personaNatural: { nombre: "ZZPRUEBA ZZINVENTADA ANA" } }), ...fuentes } as unknown as RespuestaProveedorInfo1,
    "0000000000",
  ).profile;

// ---- p6 ----

const hipotecarioDeLaBase = (o: Partial<Record<string, string>>) => ({
  srNrooperaciongaf: "100001",
  srEstadocredito: "VIGENTE",
  srMontofinanciado: "60000.00",
  srFecprimerdesembolso: "11/06/2015",
  srFecfincredito: "30/06/2040",
  srSaldototalcredito: "40000.00",
  srDiasmoraafi: "0",
  ...o,
});
const hipotecarioDeLosPrestamos = (o: Record<string, unknown> = {}) => ({
  nroOperacion: "7000001",
  estado: "PV",
  diasMora: 0,
  valorPorVencer: 30000,
  valorVencido: 0,
  valorPrestamo: 60000,
  fechaConcesion: "13/06/2015",
  ...o,
});

Deno.test("p6: el mismo hipotecario con otro número y la fecha corrida se cuenta una vez, con el saldo de la fuente de préstamos", () => {
  const b = perfilDe({
    basesInternas: fuente({ tcredHipotecarios: [hipotecarioDeLaBase({ srDiasmoraafi: "12" })] }),
    creditoHipotecario: fuente({ prestamos: [hipotecarioDeLosPrestamos()] }),
  }).comportamientoBancario;
  assertEquals(b.saldoPrestamosIessBiess, 30000);
  // La mora más alta de las dos.
  assertEquals(b.diasMoraCreditoIessBiess, 12);
});

Deno.test("p6: con la concesión a más de 31 días, o con otro monto, son dos préstamos", () => {
  const lejos = perfilDe({
    basesInternas: fuente({ tcredHipotecarios: [hipotecarioDeLaBase({ srFecprimerdesembolso: "01/01/2015" })] }),
    creditoHipotecario: fuente({ prestamos: [hipotecarioDeLosPrestamos({ fechaConcesion: "13/06/2015" })] }),
  }).comportamientoBancario;
  assertEquals(lejos.saldoPrestamosIessBiess, 70000);
  const otroMonto = perfilDe({
    basesInternas: fuente({ tcredHipotecarios: [hipotecarioDeLaBase({ srMontofinanciado: "58000" })] }),
    creditoHipotecario: fuente({ prestamos: [hipotecarioDeLosPrestamos()] }),
  }).comportamientoBancario;
  assertEquals(otroMonto.saldoPrestamosIessBiess, 70000);
});

Deno.test("p6: un préstamo de la base con el plazo cumplido y sin mora está terminado y no se cuenta", () => {
  const quirografario = (fin: string, estado = "VIGENTE", mora = "0") => ({
    numeroOperacion: "20010100000001",
    estadoOperacion: estado,
    montoTransferido: "2000",
    fechaConsesion: "20/09/2019",
    fechaFinCredito: fin,
    saldoTotalCredito: "800",
    diasMoraAfi: mora,
  });
  const terminado = perfilDe({ basesInternas: fuente({ tcredQuirografarios: [quirografario("01/09/2023")] }) }).comportamientoBancario;
  assertEquals(terminado.tieneCreditoIessBiess, false);
  assertEquals(terminado.saldoPrestamosIessBiess, null);
  // Con el plazo por delante, o en mora, o vencido según la base, se cuenta.
  assertEquals(perfilDe({ basesInternas: fuente({ tcredQuirografarios: [quirografario("01/09/2099")] }) }).comportamientoBancario.saldoPrestamosIessBiess, 800);
  assertEquals(perfilDe({ basesInternas: fuente({ tcredQuirografarios: [quirografario("01/09/2023", "VIGENTE", "40")] }) }).comportamientoBancario.diasMoraCreditoIessBiess, 40);
  assertEquals(perfilDe({ basesInternas: fuente({ tcredQuirografarios: [quirografario("01/09/2023", "VENCIDO")] }) }).comportamientoBancario.saldoPrestamosIessBiess, 800);
});

// ---- p3 ----

const operacion = (o: Record<string, string>) => ({
  identificacion: "0000000000",
  estadoOperacion: "VIGENTE",
  plazoCuotas: "48.00",
  cuotasCanceladas: "10.00",
  cuotasVencidas: "0.00",
  diasMoraVigentes: "0.00",
  diasMoraMax: "0.00",
  saldoCapital: "9000.0000",
  cuotaNova: "300.00",
  perfilInterno: "BUENO",
  resultadoHabitoPago: "Excelente Pagador",
  ...o,
});

Deno.test("p3: una vigente antes que una cancelada, y entre vigentes la de mayor saldo; nada se suma", () => {
  const i = perfilDe({
    basesInternas: fuente({
      personasIncumplimientos: [
        operacion({ operacion: "100", estadoOperacion: "CANCELADA", saldoCapital: "0.0000", cuotaNova: "900.00", diasMoraMax: "20.00" }),
        operacion({ operacion: "200", saldoCapital: "1000.5000", diasMoraVigentes: "5.00", diasMoraMax: "5.00", perfilInterno: "NUEVO" }),
        operacion({ operacion: "300", saldoCapital: "9000.0000" }),
      ],
    }),
  }).comportamientoInterno;
  // La de 9.000, sola: no 10.000,50 sumando las dos vigentes.
  assertEquals(i, {
    proveedorInfo1ResultadoHabitoPago: "Excelente Pagador",
    proveedorInfo1PerfilInterno: "BUENO",
    proveedorInfo1DiasMoraMaxima: 0,
    proveedorInfo1DiasMoraVigente: 0,
    proveedorInfo1SaldoCapitalVigente: 9000,
    esClienteInterno: true,
    proveedorInfo1EstadoOperacion: "VIGENTE",
  });
});

Deno.test("p3: con todo cancelado, la de mayor cuota por plazo; empate, la de número más alto", () => {
  const cancelada = (o: Record<string, string>) => operacion({ estadoOperacion: "CANCELADA", saldoCapital: "0", ...o });
  const mayor = perfilDe({
    basesInternas: fuente({
      personasIncumplimientos: [
        cancelada({ operacion: "900", cuotaNova: "138.14", plazoCuotas: "36", perfilInterno: "CHICA" }),
        cancelada({ operacion: "100", cuotaNova: "492.98", plazoCuotas: "36", perfilInterno: "GRANDE" }),
      ],
    }),
  }).comportamientoInterno;
  assertEquals([mayor.proveedorInfo1PerfilInterno, mayor.proveedorInfo1EstadoOperacion, mayor.proveedorInfo1SaldoCapitalVigente], ["GRANDE", "CANCELADA", 0]);
  const empate = perfilDe({
    basesInternas: fuente({
      personasIncumplimientos: [
        cancelada({ operacion: "100", perfilInterno: "VIEJA" }),
        cancelada({ operacion: "200", perfilInterno: "RECIENTE" }),
      ],
    }),
  }).comportamientoInterno;
  assertEquals(empate.proveedorInfo1PerfilInterno, "RECIENTE");
});

Deno.test("p3: sin operaciones con la institución no es cliente interno", () => {
  const sin = perfilDe({}).comportamientoInterno;
  assertEquals([sin.esClienteInterno, sin.proveedorInfo1SaldoCapitalVigente, sin.proveedorInfo1EstadoOperacion], [false, null, null]);
});

// ---- p5 ----

Deno.test("p5: quién demanda el cobro", () => {
  assertEquals(quienDemanda("BANCO DEL ZZPRUEBA S.A."), "institucion_financiera");
  assertEquals(quienDemanda("COOPERATIVA DE AHORRO Y CREDITO ZZPRUEBA LTDA"), "institucion_financiera");
  assertEquals(quienDemanda("IMPORTADORA ZZPRUEBA CIA. LTDA."), "empresa");
  assertEquals(quienDemanda("ZZPRUEBA COMERCIAL S.A."), "empresa");
  assertEquals(quienDemanda("PEREZ LOPEZ JUAN CARLOS"), "persona");
  assertEquals(quienDemanda(""), null);
});

Deno.test("p5: cada demanda de cobro con su año y quién demanda, la más reciente primero", () => {
  const demanda = (delito: string, ofendido: string, anio: number) => ({
    tipoDemanda: { descripcion: "DEMANDADO" },
    demanda: { delito, ofendido, demandado: "ZZPRUEBA ZZINVENTADA ANA", fecha: Date.UTC(anio, 5, 1, 5) },
  });
  const c = perfilDe({
    demandas: fuente({
      demandas: [
        demanda("COBRO DE LETRA DE CAMBIO", "PEREZ LOPEZ JUAN", 2009),
        demanda("OTROS", "BANCO DEL ZZPRUEBA S.A.", 2024),
        demanda("DIVORCIO", "PEREZ LOPEZ JUAN", 2020),
      ],
    }),
  }).riesgoJudicialCrediticio;
  assertEquals(c.numeroDemandasComoDemandado, 2);
  assertEquals(c.demandasDeCobro, [
    { anio: 2024, quienDemanda: "institucion_financiera" },
    { anio: 2009, quienDemanda: "persona" },
  ]);
});
