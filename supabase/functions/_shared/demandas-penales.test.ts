// p1 de la revisión del análisis (estructura-v20): una demanda por un delito de
// seguridad ciudadana bloquea sólo si el demandado es la persona. Nombres
// inventados: el repositorio es público.
//
// deno test --allow-env supabase/functions/

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { cotejarDemandado } from "./demandas.ts";
import { delitosDeSeguridadEnDemandas } from "./delitos-seguridad.ts";
import { evaluarControlesBloqueo } from "./controles-bloqueo.ts";
import { buildStandardProfile } from "./process.ts";
import type { RespuestaProveedorInfo1 } from "./types.ts";

const PERSONA = "PEREZ LOPEZ JUAN CARLOS";

Deno.test("cotejo: los dos apellidos y el primer nombre seguidos, en los dos órdenes en que se escriben", () => {
  assertEquals(cotejarDemandado("PEREZ LOPEZ JUAN CARLOS", PERSONA), "es_la_persona");
  assertEquals(cotejarDemandado("PEREZ LOPEZ JUAN", PERSONA), "es_la_persona");
  assertEquals(cotejarDemandado("JUAN CARLOS PEREZ LOPEZ", PERSONA), "es_la_persona");
  assertEquals(cotejarDemandado("JUAN PEREZ LOPEZ", PERSONA), "es_la_persona");
  // Tildes y mayúsculas no cuentan.
  assertEquals(cotejarDemandado("Pérez López Juan Carlos", PERSONA), "es_la_persona");
});

Deno.test("cotejo: sin el segundo apellido o con otro primer nombre es otra persona", () => {
  assertEquals(cotejarDemandado("PEREZ JUAN CARLOS", PERSONA), "otra_persona");
  assertEquals(cotejarDemandado("PEREZ LOPEZ CARLOS JUAN", PERSONA), "otra_persona");
  assertEquals(cotejarDemandado("PEREZ LOPEZ ANDRES JUAN CARLOS", PERSONA), "otra_persona");
  assertEquals(cotejarDemandado("PEREZ VERA JUAN CARLOS", PERSONA), "otra_persona");
});

Deno.test("cotejo: con varios demandados, los apellidos y el nombre tienen que estar en el mismo", () => {
  // Separados por coma, punto y coma o «Y».
  assertEquals(cotejarDemandado("PEREZ LOPEZ MARIA, GOMEZ RUIZ JUAN", PERSONA), "otra_persona");
  assertEquals(cotejarDemandado("GOMEZ PEREZ JUAN; LOPEZ RUIZ PEDRO", PERSONA), "otra_persona");
  assertEquals(cotejarDemandado("MARIA PEREZ LOPEZ Y JUAN GOMEZ RUIZ", PERSONA), "otra_persona");
  // Pegados sólo por espacios: el nombre suelto en otro lugar no vale.
  assertEquals(cotejarDemandado("PEREZ LOPEZ MARIA GOMEZ RUIZ JUAN", PERSONA), "otra_persona");
  // La persona en medio de una lista pegada sí.
  assertEquals(cotejarDemandado("GOMEZ RUIZ PEDRO PEREZ LOPEZ JUAN CARLOS VERA MORA ANA", PERSONA), "es_la_persona");
  assertEquals(cotejarDemandado("GOMEZ RUIZ PEDRO, PEREZ LOPEZ JUAN CARLOS", PERSONA), "es_la_persona");
});

Deno.test("cotejo: el abogado o el defensor con el mismo nombre no es la persona", () => {
  assertEquals(cotejarDemandado("GOMEZ RUIZ PEDRO DEF PART AB. JUAN PEREZ LOPEZ", PERSONA), "otra_persona");
  assertEquals(cotejarDemandado("GOMEZ RUIZ PEDRO; ABOGADO DEFENSOR PEREZ LOPEZ JUAN", PERSONA), "otra_persona");
  assertEquals(cotejarDemandado("GOMEZ RUIZ PEDRO, DEL AB. JUAN CARLOS PEREZ LOPEZ", PERSONA), "otra_persona");
  assertEquals(cotejarDemandado("GOMEZ RUIZ PEDRO DR. PEREZ LOPEZ JUAN", PERSONA), "otra_persona");
  // El defendido que sigue al nombre de su abogado sí es ella.
  assertEquals(cotejarDemandado("POR ULTIMA VEZ DEL AB. ANDRES VERA PEREZ LOPEZ JUAN CARLOS", PERSONA), "es_la_persona");
});

Deno.test("cotejo: los apellidos compuestos cuentan como un apellido", () => {
  const conParticula = "DE LA TORRE VASQUEZ MARIA JOSE";
  assertEquals(cotejarDemandado("DE LA TORRE VASQUEZ MARIA JOSE", conParticula), "es_la_persona");
  assertEquals(cotejarDemandado("MARIA JOSE DE LA TORRE VASQUEZ", conParticula), "es_la_persona");
  assertEquals(cotejarDemandado("GOMEZ RUIZ PEDRO, DE LA TORRE VASQUEZ MARIA", conParticula), "es_la_persona");
  // Sin la partícula es otro apellido.
  assertEquals(cotejarDemandado("TORRE VASQUEZ MARIA JOSE", conParticula), "otra_persona");
  // Antes, "DE LA" contaba como los dos apellidos y "TORRE" como el nombre.
  assertEquals(cotejarDemandado("DE LA TORRE GOMEZ JOSE", conParticula), "otra_persona");
  // El segundo apellido compuesto y un primer nombre compuesto.
  assertEquals(cotejarDemandado("PEREZ DEL POZO MARIA DE LOS ANGELES", "PEREZ DEL POZO MARIA DE LOS ANGELES"), "es_la_persona");
  assertEquals(cotejarDemandado("MARIA DE LOS ANGELES PEREZ DEL POZO", "PEREZ DEL POZO MARIA DE LOS ANGELES"), "es_la_persona");
});

Deno.test("cotejo: los apellidos en otro orden se distinguen, sin ser la persona", () => {
  assertEquals(cotejarDemandado("LOPEZ PEREZ JUAN CARLOS", PERSONA), "apellidos_invertidos");
  assertEquals(cotejarDemandado("JUAN LOPEZ PEREZ", PERSONA), "apellidos_invertidos");
  assertEquals(cotejarDemandado("VASQUEZ DE LA TORRE MARIA", "DE LA TORRE VASQUEZ MARIA JOSE"), "apellidos_invertidos");
  // Con los dos apellidos iguales no hay orden que invertir.
  assertEquals(cotejarDemandado("PEREZ PEREZ ANA", "PEREZ PEREZ JUAN"), "otra_persona");
});

Deno.test("cotejo: sin demandado o sin el nombre de la persona no hay con qué cotejar", () => {
  assertEquals(cotejarDemandado("", PERSONA), "sin_demandado");
  assertEquals(cotejarDemandado(null, PERSONA), "sin_demandado");
  assertEquals(cotejarDemandado(" , ; ", PERSONA), "sin_demandado");
  assertEquals(cotejarDemandado("PEREZ LOPEZ JUAN", null), "sin_nombre");
  assertEquals(cotejarDemandado("PEREZ LOPEZ JUAN", "PEREZ"), "sin_nombre");
});

Deno.test("cotejo: una letra rota de la fuente vale por cualquiera", () => {
  assertEquals(cotejarDemandado("PE��A LOPEZ JUAN", "PEÑA LOPEZ JUAN"), "es_la_persona");
  assertEquals(cotejarDemandado("PEÑA LOPEZ JUAN", "PE��A LOPEZ JUAN"), "es_la_persona");
  assertEquals(cotejarDemandado("PEÃ‘A LOPEZ JUAN", "PEÑA LOPEZ JUAN"), "es_la_persona");
});

const demanda = (delito: string, demandado: string, ofendido = "FISCALIA GENERAL DEL ESTADO") => ({
  tipoDemanda: { descripcion: "DEMANDADO" },
  // 2019-12-11 a la medianoche de Ecuador.
  demanda: { delito, demandado, ofendido, fecha: Date.UTC(2019, 11, 11, 5) },
});

Deno.test("demandas: sólo las del demandado cuentan como propias; el actor no se mira", () => {
  const r = delitosDeSeguridadEnDemandas(
    [
      demanda("TRAFICO ILICITO DE SUSTANCIAS CATALOGADAS", "GOMEZ RUIZ PEDRO", PERSONA),
      demanda("COBRO DE DINERO", "PEREZ LOPEZ JUAN CARLOS"),
      demanda("LAVADO DE ACTIVOS", "PEREZ LOPEZ JUAN CARLOS"),
    ],
    PERSONA,
  );
  assertEquals(r.propias, ["Lavado de activos"]);
  assertEquals(r.sinCotejo, [{ categorias: ["Narcotráfico / tráfico de sustancias"], cotejo: "otra_persona", anio: 2019 }]);
});

const crudo = (nombre: string | null, demandas: unknown[]) =>
  ({
    general: { status: "ok", data: { personaNatural: { identificacion: "0000000000", nombre } } },
    demandas: { status: "ok", data: { demandas } },
  }) as unknown as RespuestaProveedorInfo1;

Deno.test("bloqueo: la demanda penal de otra persona avisa y no bloquea", () => {
  const r = evaluarControlesBloqueo(crudo(PERSONA, [demanda("360 TENENCIA Y PORTE DE ARMAS, INC.2", "LOPEZ PEREZ JUAN CARLOS")]), "0000000000");
  assertEquals(r.bloqueado, false);
  assertEquals(r.hallazgos.map((h) => [h.code, h.bloqueante]), [["posible_homonimo_en_demanda_penal", false]]);
  assertStringIncludes(r.hallazgos[0].message, "Posible homónimo: verificar");
  assertStringIncludes(r.hallazgos[0].message, "(2019)");
  assertStringIncludes(r.hallazgos[0].message, "apellidos en otro orden");
});

Deno.test("bloqueo: la demanda penal de la persona bloquea, y la de otro se avisa además", () => {
  const r = evaluarControlesBloqueo(
    crudo(PERSONA, [demanda("EXTORSION", "JUAN CARLOS PEREZ LOPEZ"), demanda("LAVADO DE ACTIVOS", "")]),
    "0000000000",
  );
  assertEquals(r.bloqueado, true);
  assertEquals(r.hallazgos.map((h) => [h.code, h.bloqueante]), [
    ["delito_seguridad_ciudadana", true],
    ["posible_homonimo_en_demanda_penal", false],
  ]);
  assertStringIncludes(r.hallazgos[0].message, "Extorsión");
  assert(!r.hallazgos[0].message.includes("Lavado"));
  assertStringIncludes(r.hallazgos[1].message, "la fuente no dice a quién se demanda");
});

Deno.test("bloqueo: sin el nombre de la persona no se bloquea por una demanda", () => {
  const r = evaluarControlesBloqueo(crudo(null, [demanda("ASESINATO", "PEREZ LOPEZ JUAN CARLOS")]), "0000000000");
  assertEquals(r.bloqueado, false);
  assertStringIncludes(r.hallazgos[0].message, "no se pudo leer el nombre de la persona");
});

Deno.test("perfil: riesgoSeguridadCiudadana cuenta sólo las demandas de la persona", () => {
  const otra = buildStandardProfile(crudo(PERSONA, [demanda("ESTUPEFACIENTES", "GOMEZ RUIZ PEDRO")]), "0000000000").profile;
  assertEquals(otra.riesgoSeguridadCiudadana, { tieneDelitoSeguridadCiudadana: false, categoriasDelitoSeguridadCiudadana: [] });
  const suya = buildStandardProfile(crudo(PERSONA, [demanda("ESTUPEFACIENTES", "PEREZ LOPEZ JUAN CARLOS")]), "0000000000").profile;
  assertEquals(suya.riesgoSeguridadCiudadana, {
    tieneDelitoSeguridadCiudadana: true,
    categoriasDelitoSeguridadCiudadana: ["Narcotráfico / tráfico de sustancias"],
  });
});
