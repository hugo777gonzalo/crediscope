// La regla de capacidad (p2): «aprobar» sin capacidad evidenciada baja a
// «revisar», con la razón en la primera acción.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  ACCION_DE_LA_REGLA_DE_CAPACIDAD,
  accionDeLaRegla,
  aplicarReglaDeCapacidad,
  capacidadEvidenciada,
} from "./capacidad-evidenciada.ts";
import { filaDelAnalisis } from "./fila-del-analisis.ts";
import type { LlmScoringResult } from "./types.ts";

// deno-lint-ignore no-explicit-any
type AnyRecord = Record<string, any>;

// Un perfil del modelo con la capacidad evidenciada: ingreso confirmado y sin
// deuda propia. Cada prueba le cambia una cosa.
function perfil(cambios: AnyRecord = {}): AnyRecord {
  return {
    disponibilidad: { temasConsultados: ["buró de crédito de bancos", "cooperativas"], temasSinRespuesta: [] },
    comportamientoBancario: { saldoTotalVigente: 0, totalDeudaRetail: 0, numeroPrestamosIessBiess: 0, saldoPrestamosIessBiess: 0 },
    endeudamiento: {
      deudaPropiaTotal: 0,
      deudaPropiaBancos: 0,
      deudaPropiaCooperativas: 0,
      deudaPropiaRetail: 0,
      deudaEnAtrasoTotal: 0,
      deudaComoGaranteOCodeudor: 0,
      cuotaMensualConocida: 0,
    },
    fuentesIngreso: { segmento: "Dependiente privado", estado: "Confirmado por un tercero", ingresoReportadoIess: 1200 },
    ...cambios,
  };
}

const conDeuda = (deuda: AnyRecord, base: AnyRecord = perfil()) => ({ ...base, endeudamiento: { ...base.endeudamiento, ...deuda } });

const aprobacion = (perfilDelModelo: AnyRecord | null, acciones = ["Vigilar el uso de la tarjeta."]): LlmScoringResult => ({
  score: 780,
  recomendacion: "aprobar",
  accionesSugeridas: acciones,
  indicadorRiesgo: "bajo",
  indicadorHistorial: "bueno",
  positives: [],
  negatives: [],
  missingInfo: [],
  reasoning: "Buen comportamiento de pago.",
  llmModel: "claude-sonnet-5-5",
  llamadas: [],
  ...(perfilDelModelo ? { mensajeAlModelo: { perfilDelModelo, hallazgosControlBloqueo: [] } } : {}),
});

const motivos = (p: AnyRecord) => capacidadEvidenciada(p).faltantes.map((f) => f.motivo);

Deno.test("ingreso confirmado y sin deuda: la capacidad está evidenciada y la aprobación queda", () => {
  assertEquals(capacidadEvidenciada(perfil()), { evidenciada: true, faltantes: [] });
  const r = aprobacion(perfil());
  assertEquals(aplicarReglaDeCapacidad(r), r);
});

Deno.test("un ingreso que no confirma un tercero no evidencia la capacidad", () => {
  for (const estado of ["Por confirmar", "Sin determinar"]) {
    assertEquals(motivos(perfil({ fuentesIngreso: { estado, ingresoReportadoIess: 470 } })), ["ingreso_sin_confirmar"]);
  }
  // Confirmado pero sin monto: un militar o un jubilado cobran, no se sabe cuánto.
  assertEquals(motivos(perfil({ fuentesIngreso: { estado: "Confirmado por un tercero", ingresoReportadoIess: null } })), ["ingreso_sin_confirmar"]);
  assertEquals(motivos(perfil({ fuentesIngreso: null })), ["ingreso_sin_confirmar"]);
});

Deno.test("sin el buró de la institución, la deuda con bancos deja la cuota sin conocer", () => {
  assertEquals(motivos(conDeuda({ deudaPropiaBancos: 8374, deudaPropiaTotal: 8374 })), ["cuota_bancos"]);
});

Deno.test("cooperativas: con su cuota está evidenciada; sin ella, no", () => {
  assertEquals(motivos(conDeuda({ deudaPropiaCooperativas: 1801, cuotaMensualConocida: 95 })), []);
  assertEquals(motivos(conDeuda({ deudaPropiaCooperativas: 1801, cuotaMensualConocida: 0 })), ["cuota_cooperativas"]);
  assertEquals(motivos(conDeuda({ deudaPropiaCooperativas: 1801, cuotaMensualConocida: null })), ["cuota_cooperativas"]);
});

Deno.test("con el buró de la institución, la cuota de Equifax cubre bancos, cooperativas y el sector comercial", () => {
  const conBuro = (deuda: AnyRecord) => conDeuda(deuda, perfil({ buroEquifax: { fechaDelReporte: "2026-11-02" } }));
  assertEquals(motivos(conBuro({ deudaPropiaBancos: 8374, deudaPropiaSectorComercial: 900, deudaPropiaTotal: 9274, cuotaMensualConocida: 410 })), []);
  assertEquals(motivos(conBuro({ deudaPropiaBancos: 8374, deudaPropiaTotal: 8374, cuotaMensualConocida: null })), ["cuota_buro"]);
  // Equifax no trajo un sistema: el total es null y no se sabe cuánto debe.
  assertEquals(motivos(conBuro({ deudaPropiaBancos: null, deudaPropiaTotal: null, cuotaMensualConocida: null })), ["cuota_buro"]);
});

Deno.test("los préstamos del IESS/BIESS cuentan con saldo; sin saldo no se sabe si siguen vigentes", () => {
  const banco = (campos: AnyRecord) => perfil({ comportamientoBancario: { ...perfil().comportamientoBancario, ...campos } });
  assertEquals(motivos(banco({ numeroPrestamosIessBiess: 2, saldoPrestamosIessBiess: 3200 })), ["cuota_iess_biess"]);
  assertEquals(motivos(banco({ numeroPrestamosIessBiess: 8, saldoPrestamosIessBiess: 0 })), []);
  // Antes de marco-v32 llegaba sólo cuántos tuvo.
  const { saldoPrestamosIessBiess: _, ...sinSaldo } = perfil().comportamientoBancario;
  assertEquals(motivos(perfil({ comportamientoBancario: { ...sinSaldo, numeroPrestamosIessBiess: 8 } })), []);
});

Deno.test("el crédito con la institución llega sin cuota (p3)", () => {
  const interno = { esClienteInterno: true, proveedorInfo1SaldoCapitalVigente: 14665, proveedorInfo1ResultadoHabitoPago: "Excelente Pagador" };
  assertEquals(motivos(perfil({ comportamientoInterno: interno })), ["cuota_institucion"]);
  assertEquals(motivos(perfil({ comportamientoInterno: { ...interno, proveedorInfo1SaldoCapitalVigente: 0 } })), []);
});

Deno.test("casas comerciales y deuda como codeudor no cuentan: una es de su corte y la otra no es propia", () => {
  assertEquals(motivos(conDeuda({ deudaPropiaRetail: 640, deudaPropiaTotal: 640, deudaComoGaranteOCodeudor: 12000 })), []);
});

Deno.test("un tema de deuda sin respuesta deja sin saber si debe", () => {
  const p = perfil({ disponibilidad: { temasConsultados: [], temasSinRespuesta: ["cooperativas", "multas de tránsito"] } });
  assertEquals(capacidadEvidenciada(p).faltantes, [{ motivo: "deuda_sin_respuesta", detalle: "cooperativas" }]);
});

Deno.test("la acción dice qué falta en una oración", () => {
  const p = conDeuda(
    { deudaPropiaBancos: 8374, deudaPropiaTotal: 8374 },
    perfil({
      fuentesIngreso: { estado: "Por confirmar", ingresoReportadoIess: 470 },
      comportamientoInterno: { proveedorInfo1SaldoCapitalVigente: 14665 },
    }),
  );
  assertEquals(
    accionDeLaRegla(capacidadEvidenciada(p).faltantes),
    "Confirmar la capacidad de pago antes de aprobar: el ingreso no está confirmado por un tercero (Por confirmar) y no se conoce la cuota de su deuda con bancos ($8.374) ni con la institución ($14.665). El resto del análisis apunta a aprobar.",
  );
  assertEquals(
    accionDeLaRegla(capacidadEvidenciada(conDeuda({ deudaPropiaBancos: 500, deudaPropiaTotal: 500 })).faltantes),
    "Confirmar la capacidad de pago antes de aprobar: no se conoce la cuota de su deuda con bancos ($500). El resto del análisis apunta a aprobar.",
  );
});

Deno.test("sin capacidad evidenciada, «aprobar» baja a «revisar» con la razón primero", () => {
  const acciones = ["Uno.", "Dos.", "Tres.", "Cuatro.", "Cinco."];
  const r = aplicarReglaDeCapacidad(aprobacion(conDeuda({ deudaPropiaBancos: 8374, deudaPropiaTotal: 8374 }), acciones));
  assertEquals(r.recomendacion, "revisar");
  assert(r.accionesSugeridas[0].startsWith(ACCION_DE_LA_REGLA_DE_CAPACIDAD));
  // El tope de interpretar() es 5: sale la última del modelo.
  assertEquals(r.accionesSugeridas.slice(1), ["Uno.", "Dos.", "Tres.", "Cuatro."]);
  // El score y lo demás del modelo quedan.
  assertEquals(r.score, 780);
  assertEquals(r.indicadorRiesgo, "bajo");
  // Dos veces da lo mismo: un análisis reutilizado vuelve a pasar por acá.
  assertEquals(aplicarReglaDeCapacidad(r), r);
});

Deno.test("la regla no toca «revisar», «negar», un fallo ni un resultado sin lo que leyó el modelo", () => {
  const sinCapacidad = conDeuda({ deudaPropiaBancos: 8374, deudaPropiaTotal: 8374 });
  for (const recomendacion of ["revisar", "negar"] as const) {
    const r = { ...aprobacion(sinCapacidad), recomendacion };
    assertEquals(aplicarReglaDeCapacidad(r), r);
  }
  const fallido = { ...aprobacion(sinCapacidad), fallo: "error del LLM" };
  assertEquals(aplicarReglaDeCapacidad(fallido), fallido);
  const simulado = aprobacion(null);
  assertEquals(aplicarReglaDeCapacidad(simulado), simulado);
});

Deno.test("la fila guardada lleva la recomendación después de la regla; un bloqueo sigue negando", () => {
  const datos = (bloqueado: boolean) => ({
    runId: "run",
    clientId: "persona",
    clientProfileId: "perfil",
    marcoVersion: "marco-v35",
    llmResult: aprobacion(conDeuda({ deudaPropiaBancos: 8374, deudaPropiaTotal: 8374 })),
    controlBloqueo: { bloqueado, hallazgos: [] },
    duracionIngestaMs: null,
    duracionLlmMs: 1000,
  });
  const fila = filaDelAnalisis(datos(false));
  assertEquals(fila.recomendacion, "revisar");
  assertEquals(fila.veredicto_origen, "modelo");
  assertEquals(fila.crediscope_score, 780);
  assert(fila.acciones_sugeridas[0].startsWith(ACCION_DE_LA_REGLA_DE_CAPACIDAD));
  assertEquals(filaDelAnalisis(datos(true)).recomendacion, "negar");
  // Con la capacidad evidenciada, la aprobación del modelo queda.
  assertEquals(filaDelAnalisis({ ...datos(false), llmResult: aprobacion(perfil()) }).recomendacion, "aprobar");
});
