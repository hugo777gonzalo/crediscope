import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  elPerfilSePuedeAnalizar,
  FUENTES_QUE_DECIDEN,
  fuentesClaveSinRespuesta,
  porQueNoSePuedeAnalizar,
} from "./calidad-de-la-consulta.ts";

const completa = (): Record<string, string> => Object.fromEntries(Object.keys(FUENTES_QUE_DECIDEN).map((f) => [f, "ok"]));

Deno.test("con las fuentes que deciden contestadas se analiza, también si contestaron vacío", () => {
  assert(elPerfilSePuedeAnalizar(completa()));
  assert(elPerfilSePuedeAnalizar({ ...completa(), creditoHipotecario: "ok_vacio", retails: "error", vehiculos: "faltante" }));
});

Deno.test("una fuente clave con error o faltante frena el análisis", () => {
  for (const estado of ["error", "faltante"]) {
    for (const fuente of Object.keys(FUENTES_QUE_DECIDEN)) {
      assertEquals(fuentesClaveSinRespuesta({ ...completa(), [fuente]: estado }), [fuente]);
    }
  }
});

Deno.test("una fuente clave que no figura en un estado con detalle también frena", () => {
  const { general: _general, ...sinGeneral } = completa();
  assertEquals(fuentesClaveSinRespuesta(sinGeneral), ["general"]);
});

Deno.test("una fuente apagada por configuración no frena", () => {
  assert(elPerfilSePuedeAnalizar({ ...completa(), creditoQuirografario: "deshabilitado" }));
});

Deno.test("sin detalle por fuente no hay nada que juzgar", () => {
  assert(elPerfilSePuedeAnalizar(null));
  assert(elPerfilSePuedeAnalizar(undefined));
  assert(elPerfilSePuedeAnalizar({}));
});

Deno.test("el mensaje nombra cada tema una vez, sin los nombres de las fuentes", () => {
  const estado = { ...completa(), general: "error", creditoHipotecario: "error", creditoQuirografario: "faltante" };
  const mensaje = porQueNoSePuedeAnalizar(estado);
  assertStringIncludes(mensaje, "no se pudo obtener la identidad y los préstamos del BIESS.");
  assertEquals(mensaje.match(/BIESS/g)?.length, 1);
  assert(!/creditoHipotecario|general|Novadata/.test(mensaje));
});
