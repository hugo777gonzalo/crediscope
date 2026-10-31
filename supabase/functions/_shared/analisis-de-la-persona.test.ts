// El freno del análisis con una consulta incompleta. Lo que importa es que el
// modelo no se llame: cada llamada se paga y su score afirma lo que nadie leyó.
import { assert, assertEquals, assertRejects } from "jsr:@std/assert@1";
import { analizarPersona, ConsultaIncompleta } from "./analisis-de-la-persona.ts";
import { correrPaso } from "./pasos-de-evaluacion.ts";
import { FUENTES_QUE_DECIDEN } from "./calidad-de-la-consulta.ts";

// Provincia 99, que no existe: no es la cédula de nadie, y con 00 la evaluación
// se iría al sandbox antes de llegar al freno.
const CEDULA = "9900000000";
const completo = (): Record<string, string> => Object.fromEntries(Object.keys(FUENTES_QUE_DECIDEN).map((f) => [f, "ok"]));

type Escritura = { tabla: string; accion: string; fila: Record<string, unknown> };

// Lo justo para el recorrido hasta el freno. Copia lo que recibe: una prueba no
// comparte filas con otra (supabase/CLAUDE.md, «Pruebas»).
function baseFalsa(estado: Record<string, string> | null) {
  const escrito: Escritura[] = [];
  const filas: Record<string, unknown> = {
    clients: { id: "persona" },
    ingestion_runs: { id: "corrida" },
    client_profiles: { standard_profile: {}, control_bloqueo: { bloqueado: false }, estado_por_fuente: estado ? { ...estado } : null },
  };
  const from = (tabla: string) => {
    const q = {
      select: () => q,
      eq: () => q,
      insert: (fila: Record<string, unknown>) => {
        escrito.push({ tabla, accion: "insert", fila });
        return q;
      },
      update: (fila: Record<string, unknown>) => {
        escrito.push({ tabla, accion: "update", fila });
        return q;
      },
      maybeSingle: () => Promise.resolve({ data: filas[tabla] ?? null, error: null }),
      single: () => Promise.resolve({ data: filas[tabla] ?? null, error: null }),
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
    assertEquals((constancia?.fila.meta as { fuentes: string[] }).fuentes, ["creditoHipotecario"]);
    assert(!db.escrito.some((e) => e.tabla === "analysis_results"));
  });
});

Deno.test("una evaluación de la API frenada queda con un fallo que se reintenta", async () => {
  await sinRed(async () => {
    const db = baseFalsa({ ...completo(), general: "faltante" });
    const r = await correrPaso("analisis", { identificacion: CEDULA, client_profile_id: "perfil" }, { db, actorId: "institucion", puedeCobrarEquifax: false });
    assert(!r.ok);
    if (r.ok) return;
    assertEquals(r.fallo.codigo, "fuentes_no_disponibles");
    assert(/identidad/.test(r.fallo.detalle), r.fallo.detalle);
  });
});
