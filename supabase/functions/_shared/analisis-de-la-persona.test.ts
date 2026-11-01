// El freno del análisis con una consulta incompleta. Lo que importa es que el
// modelo no se llame: cada llamada se paga y su score afirma lo que nadie leyó.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { analizarPersona, ConsultaIncompleta } from "./analisis-de-la-persona.ts";
import { correrPaso } from "./pasos-de-evaluacion.ts";
import { FUENTES } from "./calidad-de-la-consulta.ts";

// Provincia 99, que no existe: no es la cédula de nadie, y con 00 la evaluación
// se iría al sandbox antes de llegar al freno.
const CEDULA = "9900000000";
const completo = (): Record<string, string> => Object.fromEntries(Object.keys(FUENTES).map((f) => [f, "ok"]));
const BLOQUEADA = { bloqueado: true, hallazgos: [{ code: "lista_negra", message: "Aparece en la lista negra interna.", bloqueante: true }] };

type Escritura = { tabla: string; accion: string; fila: Record<string, unknown> };

// Lo justo para el recorrido hasta el freno. Copia lo que recibe: una prueba no
// comparte filas con otra (supabase/CLAUDE.md, «Pruebas»). `consultas` es lo que
// se lee de la historia de la persona, y `analysis_results` devuelve lo insertado.
function baseFalsa(
  estado: Record<string, string> | null,
  controlBloqueo: Record<string, unknown> = { bloqueado: false, hallazgos: [] },
  consultas: Array<Record<string, unknown>> = [],
) {
  const escrito: Escritura[] = [];
  const filas: Record<string, unknown> = {
    clients: { id: "persona" },
    ingestion_runs: { id: "corrida" },
    client_profiles: { standard_profile: {}, control_bloqueo: controlBloqueo, estado_por_fuente: estado ? { ...estado } : null },
  };
  const from = (tabla: string) => {
    let insertada: Record<string, unknown> | null = null;
    const q = {
      select: () => q,
      eq: () => q,
      order: () => q,
      limit: () => Promise.resolve({ data: consultas, error: null }),
      insert: (fila: Record<string, unknown>) => {
        escrito.push({ tabla, accion: "insert", fila });
        insertada = fila;
        return q;
      },
      update: (fila: Record<string, unknown>) => {
        escrito.push({ tabla, accion: "update", fila });
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: filas[tabla] ?? null, error: null }),
      single: () => Promise.resolve({ data: filas[tabla] ?? (insertada ? { id: "fila", ...insertada } : null), error: null }),
      then: (resolver: (r: unknown) => void) => resolver({ data: null, error: null }),
    };
    return q;
  };
  return { from, escrito };
}

// Una llamada a la red acá sería al modelo: la prueba falla en vez de gastar.
async function sinRed(prueba: (llamadas: () => number) => Promise<void>) {
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = () => {
    llamadas++;
    return Promise.reject(new Error("no debía salir a la red"));
  };
  try {
    await prueba(() => llamadas);
  } finally {
    globalThis.fetch = original;
  }
}

Deno.test("con la consulta incompleta no se llama al modelo y queda constancia", async () => {
  await sinRed(async (llamadas) => {
    const db = baseFalsa({ ...completo(), creditoHipotecario: "error" });
    await assertRejects(
      () => analizarPersona({ db, cedula: CEDULA, profileId: "perfil", actorId: "analista" }),
      ConsultaIncompleta,
      "préstamos del BIESS",
    );
    assertEquals(llamadas(), 0);
    assert(db.escrito.some((e) => e.tabla === "ingestion_runs" && e.accion === "update" && e.fila.status === "fallido"));
    const constancia = db.escrito.find((e) => e.tabla === "audit_log");
    assertEquals(constancia?.fila.action, "client.analyze_frenado");
    const meta = constancia?.fila.meta as { fuentes: string[]; lista: string; revision_manual: boolean };
    assertEquals(meta.fuentes, ["creditoHipotecario"]);
    assertEquals(meta.lista, "fuentes-obligatorias-v1");
    assertEquals(meta.revision_manual, false);
    assert(!db.escrito.some((e) => e.tabla === "analysis_results"));
  });
});

Deno.test("una de las 16 obligatorias nuevas también frena antes del modelo", async () => {
  await sinRed(async (llamadas) => {
    for (const fuente of ["listaNegra", "demandas", "buroCreditoDiners", "pensionAlimenticiaProveedorInfo1"]) {
      const db = baseFalsa({ ...completo(), [fuente]: "error" });
      await assertRejects(() => analizarPersona({ db, cedula: CEDULA, profileId: "perfil", actorId: "analista" }), ConsultaIncompleta);
    }
    assertEquals(llamadas(), 0);
  });
});

Deno.test("una persona cuya falla no se va queda sin score y a revisión manual", async () => {
  await sinRed(async (llamadas) => {
    const estado = { ...completo(), listaNegra: "faltante" };
    const consultas = [
      { created_at: "2026-10-03T12:00:00.000Z", estado_por_fuente: estado },
      { created_at: "2026-09-25T12:00:00.000Z", estado_por_fuente: estado },
    ];
    const db = baseFalsa(estado, undefined, consultas);
    const error = await assertRejects(() => analizarPersona({ db, cedula: CEDULA, profileId: "perfil", actorId: "analista" }), ConsultaIncompleta, "revisión manual");
    assertEquals((error as ConsultaIncompleta).revisionManual, true);
    assertEquals(llamadas(), 0);
    const constancia = db.escrito.find((e) => e.tabla === "audit_log");
    assertEquals(constancia?.fila.meta, { ingestion_run_id: "corrida", client_profile_id: "perfil", fuentes: ["listaNegra"], lista: "fuentes-obligatorias-v1", revision_manual: true });
    assert(!db.escrito.some((e) => e.tabla === "analysis_results"));

    // En la API no se reintenta: la evaluación se cierra con el motivo.
    const r = await correrPaso("analisis", { identificacion: CEDULA, client_profile_id: "perfil" }, { db: baseFalsa(estado, undefined, consultas), actorId: "institucion", puedeCobrarEquifax: false });
    assert(!r.ok);
    if (r.ok) return;
    assertEquals([r.fallo.codigo, r.fallo.noReintentar], ["fuentes_no_disponibles", true]);
  });
});

Deno.test("un bloqueo con la consulta incompleta niega por control, sin modelo", async () => {
  await sinRed(async (llamadas) => {
    const db = baseFalsa({ ...completo(), denuncias: "error", vehiculos: "error" }, BLOQUEADA);
    const analisis = await analizarPersona({ db, cedula: CEDULA, profileId: "perfil", actorId: "analista" });
    assertEquals(llamadas(), 0);
    assertEquals([analisis.crediscope_score, analisis.recomendacion, analisis.veredicto_origen], [1, "negar", "control_bloqueo"]);
    assertEquals([analisis.fallo, analisis.llm_model, analisis.huella_pedido, analisis.narrative_summary], [null, null, null, null]);
    assertEquals(analisis.negatives, ["Aparece en la lista negra interna."]);
    assertEquals(analisis.missing_info, ["No se pudo obtener las denuncias."]);
    assertEquals(analisis.completitud, "parcial");
    assert(db.escrito.some((e) => e.tabla === "ingestion_runs" && e.fila.status === "completado"));
    const constancia = db.escrito.find((e) => e.tabla === "audit_log");
    assertEquals(constancia?.fila.action, "client.analyze");
    assertEquals(constancia?.fila.meta, {
      ingestion_run_id: "corrida",
      client_profile_id: "perfil",
      crediscope_score: 1,
      recomendacion: "negar",
      control_bloqueado: true,
      sin_modelo: true,
      fuentes: ["denuncias"],
      lista: "fuentes-obligatorias-v1",
    });
  });
});

Deno.test("una evaluación de la API frenada queda con un fallo que se reintenta", async () => {
  await sinRed(async () => {
    const db = baseFalsa({ ...completo(), general: "faltante" });
    const r = await correrPaso("analisis", { identificacion: CEDULA, client_profile_id: "perfil" }, { db, actorId: "institucion", puedeCobrarEquifax: false });
    assert(!r.ok);
    if (r.ok) return;
    assertEquals(r.fallo.codigo, "fuentes_no_disponibles");
    assertEquals(r.fallo.noReintentar, undefined);
    assert(/identidad/.test(r.fallo.detalle), r.fallo.detalle);
  });
});

Deno.test("una evaluación de la API con un bloqueo y la consulta incompleta termina negada", async () => {
  await sinRed(async () => {
    const db = baseFalsa({ ...completo(), demandas: "error" }, BLOQUEADA);
    const r = await correrPaso("analisis", { identificacion: CEDULA, client_profile_id: "perfil" }, { db, actorId: "institucion", puedeCobrarEquifax: false });
    assert(r.ok);
    if (!r.ok) return;
    const { recomendacion, veredictoOrigen, completitud } = r.resultado.analisis as Record<string, unknown>;
    assertEquals([recomendacion, veredictoOrigen, completitud], ["negar", "control_bloqueo", "parcial"]);
  });
});
