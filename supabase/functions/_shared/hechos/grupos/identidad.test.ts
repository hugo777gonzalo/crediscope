// La prueba del grupo de identidad (docs/capa-de-hechos.md, 4.5): cada campo de `identidad` tiene su
// código y el grupo lo arma igual que process.ts con el mismo reloj, el nivel más alto conocido sale del
// mayor entre el registro civil y los títulos, y una fuente caída no se escribe como un dato. La paridad
// sobre los crudos inventados la corre probar-crudos-sinteticos.mjs. Todo es inventado.
//
// deno test --allow-env --allow-read=supabase/functions supabase/functions/

import { assertEquals } from "jsr:@std/assert@1";
import { derivarHechos } from "../indice.ts";
import { perfilDesdeHechos } from "../perfil-desde-hechos.ts";
import { buildStandardProfile } from "../../process.ts";
import type { Contexto, Hecho } from "../tipos.ts";
import { CATALOGO } from "./identidad.ts";

const CEDULA = "0000000000";
const CONSULTA = "2026-10-01T12:00:00-05:00";
const contexto: Contexto = { cedula: CEDULA, consulta: "perfil-de-prueba", fechaDeLaConsulta: CONSULTA, corteIess: "2026-10", persona: { nombre: null, fechaDeNacimiento: null } };
const ok = (data: unknown) => ({ status: "ok", data });
const hecho = (doc: ReturnType<typeof derivarHechos>, codigo: string): Hecho => doc.hechos.find((h) => h.codigo === codigo)!;
const de = (doc: ReturnType<typeof derivarHechos>, codigo: string) => doc.diferencias.filter((d) => d.codigo === codigo);

// process.ts mide la edad con la hora del armado: se fija en la de la consulta, como en los guiones.
function enLaConsulta<T>(fn: () => T): T {
  const DateReal = globalThis.Date;
  const fijo = new DateReal(CONSULTA).getTime();
  class DateFijo extends DateReal {
    constructor(...a: ConstructorParameters<typeof Date>) {
      // @ts-ignore: el constructor de Date acepta estas formas
      super(...(a.length ? a : [fijo]));
    }
    static override now() {
      return fijo;
    }
  }
  globalThis.Date = DateFijo as DateConstructor;
  try {
    return fn();
  } finally {
    globalThis.Date = DateReal;
  }
}
const paridad = (crudo: unknown) => {
  const perfil = enLaConsulta(() => buildStandardProfile(crudo as never, CEDULA, "2026-10").profile.identidad);
  assertEquals(perfilDesdeHechos(derivarHechos(crudo, contexto, { estricto: true }), "identidad"), perfil as unknown as Record<string, unknown>);
};

const completo = {
  general: ok({
    personaNatural: {
      nombre: "PRUEBA FICTICIO ANA MARIA",
      // Cumple años el 3 de octubre: el día de la consulta todavía tiene 39. Con el 2, la fecha se lee
      // en UTC (parseFecha) y en Ecuador cae el 1, el mismo día de la consulta.
      fechaNacimiento: "1986-10-03",
      genero: { descripcion: "MUJER" },
      lugarNacimiento: { parroquia: { canton: { nombre: "CANTON FICTICIO", provincia: { nombre: "PROVINCIA FICTICIA" } } } },
    },
    estadoCivil: { estadoCivil: { descripcion: "CASADO" } },
    nivelEducacion: { nivelEducacion: { descripcion: "BACHILLERATO", nivel: 6 } },
    profesiones: [{ profesion: { descripcion: "PROFESION INVENTADA" } }, { profesion: {} }],
    nacionalidades: [{ pais: { nombre: "Ecuador", codigoIso3: "ECU", codigoIso: 218 } }, { pais: { nombre: "Pais Ficticio", codigoIso3: "PFI", codigoIso: 999 } }],
    personaNaturalConyuge: { fechaMatrimonio: "2015-06-20", personaConyuge: { nombre: "PRUEBA CONYUGE FICTICIO", fechaNacimiento: "1984-01-15" } },
  }),
  titulos: ok({
    titulos: [
      { titulo: { descripcion: "TECNOLOGIA INVENTADA", nivelEducacion: { descripcion: "TECNICO_SUPERIOR", nivel: 7 } }, establecimientoEducativo: { descripcion: "INSTITUTO FICTICIO" } },
      { titulo: { descripcion: "LICENCIATURA INVENTADA", nivelEducacion: { descripcion: "TERCER_NIVEL", nivel: 8 } }, establecimientoEducativo: { descripcion: "UNIVERSIDAD FICTICIA" } },
    ],
  }),
};

Deno.test("cero campos sin procedencia: todo campo de identidad tiene su código", () => {
  const texto = Deno.readTextFileSync(new URL("../../types.ts", import.meta.url));
  const desde = texto.indexOf("  identidad: {");
  const hasta = texto.indexOf("\n  };", desde);
  const campos = [...texto.slice(desde, hasta).matchAll(/^ {4}([\wñ]+)\??:/gm)].map((m) => m[1]);
  assertEquals(campos.length, 20);
  const conCodigo = new Set(CATALOGO.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil] : [])));
  assertEquals(campos.filter((c) => !conCodigo.has(`identidad.${c}`)), []);
  // Lo que no llega al modelo es lo que perfil-del-modelo.ts borra: el nombre y la institución del título.
  assertEquals(CATALOGO.filter((c) => c.campoDelPerfil && !c.llegaAlModelo).map((c) => c.campoDelPerfil), ["identidad.nombreCompleto", "identidad.institucionTituloMasAlto"]);
});

Deno.test("el grupo arma identidad igual que process.ts, con el reloj de la consulta", () => {
  paridad(completo);
  const doc = derivarHechos(completo, contexto, { estricto: true });
  assertEquals(hecho(doc, "ide.edad").valor, 39);
  assertEquals(hecho(doc, "ide.conyuge.anios_casado").valor, 11);
  // La primera nacionalidad manda y la otra se descarta con su motivo.
  assertEquals(hecho(doc, "ide.origen.es_extranjero").valor, false);
  assertEquals(hecho(doc, "ide.origen.pais").descartados?.map((d) => [d.registro.indice, d.motivo]), [[1, "no_es_la_primera_nacionalidad"]]);
  // El título de mayor nivel, y el otro descartado.
  assertEquals(hecho(doc, "ide.titulo_mas_alto.descripcion").valor, "LICENCIATURA INVENTADA");
  assertEquals(hecho(doc, "ide.titulo_mas_alto.descripcion").descartados?.map((d) => [d.registro.indice, d.motivo]), [[0, "titulo_de_menor_nivel"]]);
  assertEquals(hecho(doc, "ide.titulos.cantidad").registros.map((r) => r.indice), [0, 1]);
  // La profesión sin descripción no cuenta.
  assertEquals(hecho(doc, "ide.profesiones").valor, ["PROFESION INVENTADA"]);
});

Deno.test("un matrimonio disuelto no da años de casada ni edad del cónyuge, y lo dice", () => {
  const crudo = { general: ok({ personaNatural: { nombre: "PRUEBA FICTICIO" }, personaNaturalConyuge: { fechaMatrimonio: "2010-01-01", personaConyuge: {} } }) };
  paridad(crudo);
  const doc = derivarHechos(crudo, contexto, { estricto: true });
  assertEquals(hecho(doc, "ide.conyuge.tiene").valor, false);
  const anios = hecho(doc, "ide.conyuge.anios_casado");
  assertEquals([anios.valor, anios.motivo, anios.descartados?.map((d) => d.motivo)], [null, "no_aplica", ["matrimonio_sin_conyuge_actual"]]);
});

Deno.test("el nivel más alto conocido: el mayor entre el registro civil y los títulos, con su fuente", () => {
  const conEducacion = (nivel: number | null, titulos: number[]) => ({
    general: ok({ nivelEducacion: nivel === null ? null : { nivelEducacion: { nivel, descripcion: `NIVEL_${nivel}` } } }),
    titulos: ok({ titulos: titulos.map((n) => ({ titulo: { descripcion: `TITULO ${n}`, nivelEducacion: { nivel: n, descripcion: `NIVEL_${n}` } } })) }),
  });
  const masAlto = (nivel: number | null, titulos: number[]) => {
    const h = hecho(derivarHechos(conEducacion(nivel, titulos), contexto), "ide.nivel_educacion.mas_alto");
    return [h.valor, (h.descartados ?? []).map((d) => d.motivo)];
  };
  // El título es más alto: manda y el registro civil cede.
  assertEquals(masAlto(6, [8, 9]), [{ nivel: 9, descripcion: "NIVEL_9", fuente: "titulos" }, ["el_titulo_registrado_es_mas_alto"]]);
  // Iguales o el registro civil más alto: manda el registro civil.
  assertEquals(masAlto(8, [8]), [{ nivel: 8, descripcion: "NIVEL_8", fuente: "general" }, ["el_registro_civil_no_es_mas_bajo"]]);
  assertEquals(masAlto(8, [7]), [{ nivel: 8, descripcion: "NIVEL_8", fuente: "general" }, ["el_registro_civil_no_es_mas_bajo"]]);
  // Uno solo.
  assertEquals(masAlto(null, [7]), [{ nivel: 7, descripcion: "NIVEL_7", fuente: "titulos" }, []]);
  assertEquals(masAlto(6, []), [{ nivel: 6, descripcion: "NIVEL_6", fuente: "general" }, []]);
  // Ninguno: no aplica.
  assertEquals(masAlto(null, []), [null, []]);
});

Deno.test("una fuente que no contestó deja sin dato lo que lee, con lo que el perfil escribe como parcial", () => {
  const sinTitulos = { general: completo.general, titulos: { status: "error", data: null } };
  paridad(sinTitulos);
  const doc = derivarHechos(sinTitulos, contexto, { estricto: true });
  const cantidad = hecho(doc, "ide.titulos.cantidad");
  assertEquals([cantidad.valor, cantidad.motivo, cantidad.parcial], [null, "fuente_sin_respuesta", 0]);
  const masAlto = hecho(doc, "ide.nivel_educacion.mas_alto");
  assertEquals([masAlto.valor, masAlto.motivo, masAlto.parcial], [null, "fuente_sin_respuesta", { nivel: 6, descripcion: "BACHILLERATO", fuente: "general" }]);
  // La identidad sigue con valor: su fuente contestó.
  assertEquals(hecho(doc, "ide.genero").valor, "MUJER");

  const sinGeneral = { general: { status: "faltante", data: null }, titulos: completo.titulos };
  paridad(sinGeneral);
  const sin = derivarHechos(sinGeneral, contexto, { estricto: true });
  const fallecido = hecho(sin, "ide.fallecido");
  assertEquals([fallecido.valor, fallecido.motivo, fallecido.parcial], [null, "fuente_sin_respuesta", false]);
  assertEquals(hecho(sin, "ide.profesiones").parcial, []);
});

// ---- E9, punto 13: se mudó de conciliacion.test.ts con su grupo ----

Deno.test("dif.ide.nivel_de_educacion: el título más alto contra el registro civil; iguales, sin títulos o sin nivel, no", () => {
  const conEducacion = (nivel: number | null, titulos: number[]) => ({
    general: ok({ nivelEducacion: nivel === null ? null : { nivelEducacion: { nivel, descripcion: `NIVEL_${nivel}` } } }),
    titulos: ok({ titulos: titulos.map((n) => ({ titulo: { descripcion: `TITULO ${n}`, nivelEducacion: { nivel: n, descripcion: `NIVEL_${n}` } } })) }),
  });
  const sube = de(derivarHechos(conEducacion(6, [8, 9]), contexto), "dif.ide.nivel_de_educacion");
  assertEquals(sube.map((d) => [d.manda.valor, d.cede[0].valor, d.cede[0].registro.indice, d.magnitud.absoluta, d.lectura]), [["NIVEL_6", "NIVEL_9", 1, 3, "esperada"]]);
  // El registro civil más alto que el título: con signo negativo.
  assertEquals(de(derivarHechos(conEducacion(8, [7]), contexto), "dif.ide.nivel_de_educacion").map((d) => d.magnitud.absoluta), [-1]);
  for (const raw of [conEducacion(8, [8, 6]), conEducacion(8, []), conEducacion(null, [9])]) {
    assertEquals(de(derivarHechos(raw, contexto), "dif.ide.nivel_de_educacion"), []);
  }
});
