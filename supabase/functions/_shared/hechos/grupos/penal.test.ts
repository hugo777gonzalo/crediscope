// La prueba del grupo penal (docs/capa-de-hechos.md, 4.5 y 5.2): cada campo de `riesgoPenal` tiene su
// código, las denuncias se reparten por el papel de la persona y descartan las que no son suyas, y una
// fuente caída no se escribe como «sin denuncias». La paridad sobre los crudos inventados la corre
// probar-crudos-sinteticos.mjs.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import { buildStandardProfile } from "../../process.ts";
import type { Contexto, Hecho } from "../tipos.ts";
import { CATALOGO } from "./penal.ts";

const CEDULA = "0000000000";
const contexto: Contexto = { cedula: CEDULA, consulta: "perfil-de-prueba", fechaDeLaConsulta: "2026-10-01T12:00:00-05:00", corteIess: "2026-10", persona: { nombre: null, fechaDeNacimiento: null } };
const ok = (data: unknown) => ({ status: "ok", data });
const denuncia = (nro: string, partes: Array<{ cedula: string; estado: string }>) => ({ nroNoticia: nro, delito: "ROBO", fecha: "2024-01-01", detalleDenuncia: partes });
let ultimoCrudo: unknown = null;
function derivar(partes: Record<string, unknown>) {
  ultimoCrudo = { general: ok({ personaNatural: { nombre: "PRUEBA FICTICIO" } }), ...partes };
  return derivarHechos(ultimoCrudo, contexto);
}
const hecho = (doc: ReturnType<typeof derivarHechos>, codigo: string): Hecho => doc.hechos.find((h) => h.codigo === codigo)!;
const perfilDelCrudo = () => buildStandardProfile(ultimoCrudo as never, CEDULA).profile.riesgoPenal;

Deno.test("cero campos sin procedencia: todo campo de riesgoPenal tiene su código", () => {
  const texto = Deno.readTextFileSync(new URL("../../types.ts", import.meta.url));
  const desde = texto.indexOf("  riesgoPenal: {");
  const hasta = texto.indexOf("\n  };", desde);
  const campos = [...texto.slice(desde, hasta).matchAll(/^ {4}(\w+)\??:/gm)].map((m) => m[1]).filter((c) => c !== "camposSinDato");
  assertEquals(campos.length, 4);
  const conCodigo = new Set(CATALOGO.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil] : [])));
  assertEquals(campos.filter((c) => !conCodigo.has(`riesgoPenal.${c}`)), []);
});

Deno.test("las denuncias se reparten por el papel: acusada, otro papel, y la que no trae su cédula se descarta con su motivo", () => {
  const doc = derivar({
    antecedentesPenales: ok({ antecedentes: { descripcion: "NO" } }),
    denuncias: ok({
      denuncias: [
        denuncia("N-1", [{ cedula: CEDULA, estado: "SOSPECHOSO" }]),
        denuncia("N-2", [{ cedula: CEDULA, estado: "DENUNCIANTE" }]),
        denuncia("N-3", [{ cedula: "9999999999", estado: "SOSPECHOSO" }]),
        denuncia("N-4", [{ cedula: CEDULA, estado: "VICTIMA" }]),
      ],
    }),
  });
  assertEquals(hecho(doc, "pen.denuncias.como_acusada.cantidad").valor, 1);
  assertEquals(hecho(doc, "pen.denuncias.como_acusada.cantidad").registros.map((r) => r.indice), [0]);
  assertEquals(hecho(doc, "pen.denuncias.con_otro_papel.cantidad").valor, 2);
  assertEquals(hecho(doc, "pen.denuncias.con_otro_papel.cantidad").registros.map((r) => r.indice), [1, 3]);
  assertEquals(
    (hecho(doc, "pen.denuncias.con_otro_papel.cantidad").descartados ?? []).map((d) => `${d.registro.indice}:${d.motivo}`),
    ["0:figura_como_acusada_y_se_cuenta_aparte", "2:su_cedula_no_figura_en_la_denuncia"],
  );
  assertEquals(perfilDesdeHechos(doc, "riesgoPenal"), perfilDelCrudo());
});

Deno.test("antecedentes: «NO» no es un antecedente, cualquier otra descripción sí, y sin el objeto es null", () => {
  const sin = derivar({ antecedentesPenales: ok({ antecedentes: { descripcion: "NO" } }), denuncias: ok({ denuncias: [] }) });
  assertEquals([hecho(sin, "pen.antecedentes.existe").valor, hecho(sin, "pen.antecedentes.descripcion").motivo], [false, "no_aplica"]);
  const con = derivar({ antecedentesPenales: ok({ antecedentes: { descripcion: "ESTAFA" } }), denuncias: ok({ denuncias: [] }) });
  assertEquals([hecho(con, "pen.antecedentes.existe").valor, hecho(con, "pen.antecedentes.descripcion").valor], [true, "ESTAFA"]);
  assertEquals(perfilDesdeHechos(con, "riesgoPenal"), perfilDelCrudo());
  // `faltante` es el «no hay» de antecedentes: ni valor inventado ni falla.
  const faltante = derivar({ antecedentesPenales: { status: "faltante", data: null }, denuncias: ok({ denuncias: [] }) });
  assertEquals([hecho(faltante, "pen.antecedentes.existe").valor, hecho(faltante, "pen.antecedentes.existe").motivo], [null, "no_aplica"]);
  assertEquals(perfilDesdeHechos(faltante, "riesgoPenal").camposSinDato, undefined);
});

// El caso que motivó el grupo (2026-11-20): la fuente de denuncias no contestó y la tarjeta decía «sin
// antecedentes ni denuncias».
Deno.test("denuncias caída (faltante): los dos campos de denuncias quedan sin dato con el parcial 0; los antecedentes siguen", () => {
  const doc = derivar({ antecedentesPenales: ok({ antecedentes: { descripcion: "NO" } }), denuncias: { status: "faltante", data: null } });
  for (const c of ["pen.denuncias.como_acusada.cantidad", "pen.denuncias.con_otro_papel.cantidad"]) {
    const h = hecho(doc, c);
    assertEquals([h.valor, h.calidad, h.motivo, h.parcial], [null, "no_disponible", "fuente_sin_respuesta", 0]);
  }
  assertEquals(hecho(doc, "pen.antecedentes.existe").valor, false);
  const perfil = perfilDesdeHechos(doc, "riesgoPenal");
  assertEquals([perfil.numeroDenunciasComoSospechoso, perfil.numeroDenunciasComoVictima], [null, null]);
  assertEquals(perfil.camposSinDato, { numeroDenunciasComoSospechoso: 0, numeroDenunciasComoVictima: 0 });
  assertEquals(perfil.tieneAntecedentesPenales, false);
});

Deno.test("antecedentes con error: sin dato; deshabilitada: el motivo lo dice", () => {
  const caida = derivar({ antecedentesPenales: { status: "error", data: null }, denuncias: ok({ denuncias: [] }) });
  assertEquals(perfilDesdeHechos(caida, "riesgoPenal").camposSinDato, { tieneAntecedentesPenales: null, descripcionAntecedentes: null });
  const apagada = derivar({ antecedentesPenales: ok({ antecedentes: { descripcion: "NO" } }), denuncias: { status: "deshabilitado", data: null } });
  assertEquals(hecho(apagada, "pen.denuncias.como_acusada.cantidad").motivo, "fuente_deshabilitada");
});
