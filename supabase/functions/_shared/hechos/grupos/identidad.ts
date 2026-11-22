// Grupo de identidad de la capa de hechos (docs/capa-de-hechos.md, 4.5): `identidad`, los 20 campos
// del perfil que salen de la fuente de identidad (`general`, el registro civil) y del registro de
// títulos (`titulos`).
//
// ETAPA A. process.ts sigue armando `identidad` como hoy; lo que hay de reglas en
// `buildStandardProfile` está copiado acá hasta la etapa B, y la comparación en seco lo compara campo
// por campo contra el perfil. El «hoy» de la edad y de los años de casado es la fecha de la consulta
// (`ahoraDe`): process.ts usa la hora del armado.
//
// Lo nuevo, que no va al perfil ni al modelo:
//   - `ide.nivel_educacion.mas_alto`: el nivel más alto conocido, el mayor entre el registro civil y el
//     título registrado, con su fuente. Es la decisión 4 de la sección 10.5 (negocio, 2026-11-22), y lo
//     lee la lectura de P63 (tercer o cuarto nivel);
//   - `dif.ide.nivel_de_educacion`, la diferencia entre los dos niveles (E9, punto 13), que vivía en
//     conciliacion.ts mientras este grupo estaba vacío: se mudó con el mismo código y la misma regla.
//
// Una fuente que no contestó: los campos que lee quedan sin valor y con el `parcial`, lo que el perfil
// escribe hoy (null, false, 0 o la lista vacía). `general` es obligatoria: sin ella la consulta queda
// incompleta y el modelo no corre.

import type { Emisor } from "../emisor.ts";
import { type AnyRecord, type Fila, filasDe, num, obj, parseFecha, ref, refDeFila, refDeRespuesta, respuestaDe, textoDe } from "../lectura-del-crudo.ts";
import { ahoraDe, mesesEntreFechas } from "../reloj.ts";
import type { Calidad, CodigoDelCatalogo, Contexto, Descarte, ElementoDeLista, Hecho, MotivoDeNoDisponible, RefDeRegistro } from "../tipos.ts";
import { registraFallecido } from "./cumplimiento.ts";

const P = "identidad.";

// La escala que traen las dos fuentes en `nivelEducacion.nivel`: 6 bachillerato, 7 técnico superior,
// 8 tercer nivel, 9 cuarto nivel. El técnico superior cuenta como tercer nivel (la LOES lo llama tercer
// nivel técnico; negocio, 2026-11-22).
export const NIVEL_TERCERO_DESDE = 7;
export const NIVEL_CUARTO = 9;

type Perfil = { campo: string; enSinValor: CodigoDelCatalogo["enElPerfilSinValor"] } | null;
function codigo(
  cod: string,
  unidad: CodigoDelCatalogo["unidad"],
  descripcion: string,
  perfil: Perfil,
  opciones: { llegaAlModelo?: boolean; esIdentificador?: boolean; recuento?: CodigoDelCatalogo["recuento"] } = {},
): CodigoDelCatalogo {
  const c: CodigoDelCatalogo = { codigo: cod, unidad, descripcion, llegaAlModelo: perfil !== null && (opciones.llegaAlModelo ?? true), esIdentificador: opciones.esIdentificador ?? false };
  if (perfil) {
    c.campoDelPerfil = P + perfil.campo;
    c.enElPerfilSinValor = perfil.enSinValor;
  }
  if (opciones.recuento) c.recuento = opciones.recuento;
  return c;
}
const en = (campo: string, enSinValor: CodigoDelCatalogo["enElPerfilSinValor"]): Perfil => ({ campo, enSinValor });

export const CATALOGO: CodigoDelCatalogo[] = [
  // La persona, del registro civil
  codigo("ide.nombre", "texto", "Nombre completo, como lo escribe el registro civil", en("nombreCompleto", null), { esIdentificador: true, llegaAlModelo: false }),
  codigo("ide.edad", "anios", "Edad cumplida a la fecha de la consulta", en("edad", null)),
  codigo("ide.genero", "texto", "Sexo registrado", en("genero", null)),
  codigo("ide.estado_civil", "texto", "Estado civil registrado", en("estadoCivil", null)),
  codigo("ide.nivel_educacion", "texto", "Nivel de educación según el registro civil", en("nivelEducacion", null)),
  codigo("ide.profesiones", "lista", "Profesiones registradas", en("profesiones", null)),
  codigo("ide.fallecido", "si_no", "El registro civil la registra como fallecida", en("fallecido", false)),
  codigo("ide.conyuge.tiene", "si_no", "Tiene un cónyuge actual registrado", en("tieneConyuge", false)),
  codigo("ide.nacimiento.canton", "texto", "Cantón de nacimiento", en("cantonNacimiento", null)),
  codigo("ide.nacimiento.provincia", "texto", "Provincia de nacimiento", en("provinciaNacimiento", null)),
  codigo("ide.origen.pais", "texto", "País de su nacionalidad", en("paisOrigen", null)),
  codigo("ide.origen.iso3", "texto", "Código ISO de tres letras del país de su nacionalidad", en("paisOrigenIso3", null)),
  codigo("ide.origen.iso", "cantidad", "Código ISO numérico del país de su nacionalidad", en("paisOrigenIso", null)),
  codigo("ide.origen.es_extranjero", "si_no", "Su nacionalidad no es la ecuatoriana", en("esExtranjero", null)),
  codigo("ide.conyuge.anios_casado", "anios", "Años de casada con el cónyuge actual", en("añosCasado", null)),
  codigo("ide.conyuge.edad", "anios", "Edad del cónyuge actual", en("edadConyuge", null)),
  // Los títulos
  codigo("ide.titulos.cantidad", "cantidad", "Títulos registrados", en("titulosRegistrados", 0), { recuento: "conteo" }),
  codigo("ide.titulo_mas_alto.descripcion", "texto", "Título de mayor nivel", en("tituloMasAlto", null)),
  codigo("ide.titulo_mas_alto.nivel", "texto", "Nivel del título de mayor nivel", en("nivelMaximoSegunTitulos", null)),
  // Quien estudió y trabaja en la misma universidad la tiene de empleador (perfil-del-modelo.ts).
  codigo("ide.titulo_mas_alto.institucion", "texto", "Institución que emitió el título de mayor nivel", en("institucionTituloMasAlto", null), { esIdentificador: true, llegaAlModelo: false }),
  // Lo nuevo, sin campo del perfil
  codigo("ide.nivel_educacion.mas_alto", "objeto", "Nivel de educación más alto conocido entre el registro civil y los títulos, con su fuente", null),
  // E9, punto 13: se mudó de conciliacion.ts con el mismo código.
  { codigo: "dif.ide.nivel_de_educacion", unidad: "texto", descripcion: "Nivel de educación del registro civil contra el del título registrado más alto", llegaAlModelo: false, esIdentificador: false },
];

// Las que eligen o descartan registros: cada una con un crudo inventado en que aplica y uno en que no
// (scripts/crudos-sinteticos/, campo `reglas`).
export const REGLAS_QUE_MEZCLAN: string[] = [
  "ide.titulo_mas_alto@1", // con varios títulos, el de mayor nivel: descarta los demás
  "ide.origen@1", // con varias nacionalidades, la primera: descarta las demás
  "ide.conyuge@1", // años de casada y edad del cónyuge sólo con un cónyuge actual: descarta el matrimonio disuelto
  "ide.nivel_mas_alto@1", // el mayor entre el registro civil y el título: el otro cede
];

const GENERAL = "general";
const TITULOS = "titulos";

// La edad cumplida a una fecha (edadDesde de process.ts, con el reloj de la consulta).
function edadA(fecha: unknown, ahora: Date): number | null {
  const d = parseFecha(fecha);
  if (!d) return null;
  let edad = ahora.getFullYear() - d.getFullYear();
  const cumple = new Date(ahora.getFullYear(), d.getMonth(), d.getDate());
  if (ahora < cumple) edad--;
  return edad;
}

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  const consulta = contexto.consulta;
  const ahora = ahoraDe(contexto);
  const unidades = new Map(CATALOGO.map((c) => [c.codigo, c.unidad]));

  const estado = new Map<string, "contesto" | MotivoDeNoDisponible>();
  const contesto = (fuente: string) => {
    if (!estado.has(fuente)) estado.set(fuente, respuestaDe(crudo, fuente));
    return estado.get(fuente)!;
  };
  // Un hecho con valor si contestaron las fuentes que lee; si no, sin valor y con el parcial: lo que
  // escribe el perfil con lo que sí llegó.
  function emitirHecho(
    cod: string,
    regla: string,
    fuentes: string[],
    valor: Hecho["valor"],
    registros: RefDeRegistro[],
    opciones: { calidad?: Calidad; descartados?: Descarte[] } = {},
  ) {
    const caidas = fuentes.filter((f) => contesto(f) !== "contesto");
    const h: Omit<Hecho, "clase" | "fechaDeLaConsulta"> = { codigo: cod, regla, unidad: unidades.get(cod)!, valor: null, calidad: "no_disponible", fuentes, fechaDelDato: null, registros: [] };
    if (caidas.length) {
      h.motivo = caidas.some((f) => contesto(f) === "fuente_sin_respuesta") ? "fuente_sin_respuesta" : "fuente_deshabilitada";
      h.parcial = valor;
      return void emisor.hecho(h);
    }
    if (valor === null) {
      // Lo descartado se dice igual: el matrimonio disuelto es la razón de que no haya años de casada.
      h.motivo = "no_aplica";
      if (opciones.descartados?.length) h.descartados = opciones.descartados;
      return void emisor.hecho(h);
    }
    h.valor = valor;
    h.calidad = opciones.calidad ?? "confirmado_por_tercero";
    h.registros = registros.length ? registros : fuentes.map((f) => ref(consulta, f));
    if (opciones.descartados?.length) h.descartados = opciones.descartados;
    emisor.hecho(h);
  }

  const g = (crudo[GENERAL] as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const persona = obj(crudo, GENERAL, "personaNatural");
  // Un objeto suelto de `general`: se cita su campo si vino, y la respuesta entera si no.
  const deGeneral = (campo: string): RefDeRegistro[] => [g && campo in g ? ref(consulta, GENERAL, undefined, undefined, campo) : ref(consulta, GENERAL)];
  const dePersona = deGeneral("personaNatural");
  const simple = (cod: string, valor: Hecho["valor"], registros: RefDeRegistro[], calidad?: Calidad) =>
    emitirHecho(cod, "ide.simple@1", [GENERAL], valor, registros, { calidad });

  // ---- La persona ----
  simple("ide.nombre", (persona?.nombre as string) ?? null, dePersona);
  simple("ide.edad", edadA(persona?.fechaNacimiento, ahora), dePersona, "calculado");
  simple("ide.genero", ((persona?.genero as AnyRecord | undefined)?.descripcion as string) ?? null, dePersona);
  simple("ide.estado_civil", (((g?.estadoCivil as AnyRecord | undefined)?.estadoCivil as AnyRecord | undefined)?.descripcion as string) ?? null, deGeneral("estadoCivil"));
  const nivelDelRegistro = (g?.nivelEducacion as AnyRecord | undefined)?.nivelEducacion as AnyRecord | undefined;
  simple("ide.nivel_educacion", (nivelDelRegistro?.descripcion as string) ?? null, deGeneral("nivelEducacion"));

  const filasProfesiones = filasDe(crudo, GENERAL, "profesiones");
  const conProfesion = filasProfesiones.filter((f) => Boolean((f.r.profesion as AnyRecord | undefined)?.descripcion));
  // El perfil lee `profesiones` aunque no sea una lista (process.ts: `?? []`); filasDe da [] igual.
  simple("ide.profesiones", conProfesion.map((f) => (f.r.profesion as AnyRecord).descripcion as string),
    conProfesion.length ? conProfesion.map((f) => refDeFila(consulta, f, "profesion")) : [refDeRespuesta(crudo, consulta, GENERAL, "profesiones")]);
  simple("ide.fallecido", registraFallecido(persona), dePersona);

  // ---- El cónyuge: sólo el ACTUAL. fechaMatrimonio puede quedar en el registro aunque la persona ya
  // esté divorciada ----
  const conyuge = g?.personaNaturalConyuge as AnyRecord | undefined;
  const conyugePersona = conyuge?.personaConyuge as AnyRecord | undefined;
  const tieneConyugeActual = Boolean(conyugePersona?.nombre);
  const deConyuge = deGeneral("personaNaturalConyuge");
  simple("ide.conyuge.tiene", tieneConyugeActual, deConyuge);
  const matrimonioDisuelto: Descarte[] = !tieneConyugeActual && conyuge?.fechaMatrimonio
    ? [{ registro: ref(consulta, GENERAL, undefined, undefined, "personaNaturalConyuge"), motivo: "matrimonio_sin_conyuge_actual" }]
    : [];
  const fechaMatrimonio = tieneConyugeActual && conyuge?.fechaMatrimonio ? parseFecha(conyuge.fechaMatrimonio) : null;
  const aniosCasado = tieneConyugeActual && conyuge?.fechaMatrimonio ? (fechaMatrimonio ? Math.floor(mesesEntreFechas(fechaMatrimonio, ahora) / 12) : null) : null;
  emitirHecho("ide.conyuge.anios_casado", "ide.conyuge@1", [GENERAL], aniosCasado, deConyuge, { calidad: "calculado", descartados: matrimonioDisuelto });
  emitirHecho("ide.conyuge.edad", "ide.conyuge@1", [GENERAL], tieneConyugeActual ? edadA(conyugePersona?.fechaNacimiento, ahora) : null, deConyuge, {
    calidad: "calculado",
    descartados: matrimonioDisuelto,
  });

  // ---- El nacimiento y la nacionalidad ----
  const canton = ((persona?.lugarNacimiento as AnyRecord | undefined)?.parroquia as AnyRecord | undefined)?.canton as AnyRecord | undefined;
  simple("ide.nacimiento.canton", (canton?.nombre as string) ?? null, dePersona);
  simple("ide.nacimiento.provincia", ((canton?.provincia as AnyRecord | undefined)?.nombre as string) ?? null, dePersona);
  const nacionalidades = filasDe(crudo, GENERAL, "nacionalidades");
  const pais = (nacionalidades[0]?.r.pais as AnyRecord | undefined) ?? undefined;
  const deLaNacionalidad = nacionalidades.length ? [refDeFila(consulta, nacionalidades[0], "pais")] : [refDeRespuesta(crudo, consulta, GENERAL, "nacionalidades")];
  const otrasNacionalidades: Descarte[] = nacionalidades.slice(1).map((f) => ({ registro: refDeFila(consulta, f), motivo: "no_es_la_primera_nacionalidad" }));
  const origen = (cod: string, valor: Hecho["valor"], calidad?: Calidad) =>
    emitirHecho(cod, "ide.origen@1", [GENERAL], valor, deLaNacionalidad, { calidad, descartados: otrasNacionalidades });
  origen("ide.origen.pais", (pais?.nombre as string) ?? null);
  origen("ide.origen.iso3", (pais?.codigoIso3 as string) ?? null);
  origen("ide.origen.iso", (pais?.codigoIso as number) ?? null);
  origen("ide.origen.es_extranjero", pais ? pais.nombre !== "Ecuador" : null, "calculado");

  // ---- Los títulos: el de mayor nivel manda. `nivelEducacion.nivel` es un número ordenable que trae la
  // propia fuente, así que no hace falta interpretar el texto ----
  const titulos = filasDe(crudo, TITULOS, "titulos");
  const respuestaTitulos = [refDeRespuesta(crudo, consulta, TITULOS, "titulos")];
  // El mismo orden que process.ts, con su `Number(... ?? -1)`: un título sin nivel queda al final.
  const ordenados = titulos
    .map((f) => {
      const titulo = (f.r.titulo as AnyRecord | undefined) ?? {};
      const nivel = (titulo.nivelEducacion as AnyRecord | undefined) ?? {};
      return {
        f,
        descripcion: textoDe(titulo.descripcion),
        nivelTexto: textoDe(nivel.descripcion),
        nivel: Number(nivel.nivel ?? -1),
        institucion: textoDe(((f.r.establecimientoEducativo as AnyRecord | undefined) ?? {}).descripcion),
      };
    })
    .sort((a, b) => b.nivel - a.nivel);
  const alto = ordenados[0] ?? null;
  emitirHecho("ide.titulos.cantidad", "ide.simple@1", [TITULOS], titulos.length, titulos.length ? titulos.map((f) => refDeFila(consulta, f)) : respuestaTitulos);
  const otrosTitulos: Descarte[] = ordenados.slice(1).map((t) => ({ registro: refDeFila(consulta, t.f), motivo: "titulo_de_menor_nivel" }));
  const delMasAlto = (campo: string): RefDeRegistro[] => (alto ? [refDeFila(consulta, alto.f, campo)] : respuestaTitulos);
  const masAlto = (cod: string, valor: string | null, campo: string) =>
    emitirHecho(cod, "ide.titulo_mas_alto@1", [TITULOS], valor, delMasAlto(campo), { descartados: otrosTitulos });
  masAlto("ide.titulo_mas_alto.descripcion", alto?.descripcion ?? null, "titulo");
  masAlto("ide.titulo_mas_alto.nivel", alto?.nivelTexto ?? null, "titulo");
  masAlto("ide.titulo_mas_alto.institucion", alto?.institucion ?? null, "establecimientoEducativo");

  nivelMasAlto(crudo, consulta, nivelDelRegistro, titulos, emitirHecho);
  diferenciaDeNivel(crudo, consulta, emisor);
}

// ---- El nivel más alto conocido (P63; decisión 4 de la sección 10.5) ----
//
// El registro civil no se entera del título: medido el 2026-11-20 sobre las 3.766 personas, 1.256 con
// un título con nivel y en 327 los dos niveles difieren (en 227 el título es más alto). Manda el mayor;
// con los dos iguales, el registro civil. Sólo cuentan los títulos con un nivel numérico (como la
// diferencia de abajo), no el orden del perfil, que pone primero un título sin nivel si es el único.
function nivelMasAlto(
  crudo: AnyRecord,
  consulta: string,
  nivelDelRegistro: AnyRecord | undefined,
  titulos: Fila[],
  emitirHecho: (cod: string, regla: string, fuentes: string[], valor: Hecho["valor"], registros: RefDeRegistro[], opciones?: { calidad?: Calidad; descartados?: Descarte[] }) => void,
): void {
  const g = (crudo[GENERAL] as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const nivelRc = num(nivelDelRegistro?.nivel);
  const refRc = g && "nivelEducacion" in g ? ref(consulta, GENERAL, undefined, undefined, "nivelEducacion") : ref(consulta, GENERAL);
  const conNivel = titulos
    .map((f) => ({ f, nivel: (((f.r.titulo as AnyRecord | undefined)?.nivelEducacion as AnyRecord | undefined) ?? {}) as AnyRecord }))
    .filter((t) => num(t.nivel.nivel) !== null)
    .sort((a, b) => num(b.nivel.nivel)! - num(a.nivel.nivel)!);
  const titulo = conNivel[0];
  const nivelTitulo = titulo ? num(titulo.nivel.nivel) : null;
  const ganaElTitulo = nivelTitulo !== null && (nivelRc === null || nivelTitulo > nivelRc);
  let valor: ElementoDeLista | null = null;
  const registros: RefDeRegistro[] = [];
  const descartados: Descarte[] = [];
  if (ganaElTitulo) {
    valor = { nivel: nivelTitulo, descripcion: textoDe(titulo.nivel.descripcion), fuente: TITULOS };
    registros.push(refDeFila(consulta, titulo.f, "titulo"));
    if (nivelRc !== null) descartados.push({ registro: refRc, motivo: "el_titulo_registrado_es_mas_alto" });
  } else if (nivelRc !== null) {
    valor = { nivel: nivelRc, descripcion: textoDe(nivelDelRegistro?.descripcion), fuente: GENERAL };
    registros.push(refRc);
    if (titulo) descartados.push({ registro: refDeFila(consulta, titulo.f, "titulo"), motivo: "el_registro_civil_no_es_mas_bajo" });
  }
  emitirHecho("ide.nivel_educacion.mas_alto", "ide.nivel_mas_alto@1", [GENERAL, TITULOS], valor, registros, { calidad: "calculado", descartados });
}

// ---- E9, punto 13: el nivel de educación del registro civil y el de los títulos ----
//
// El perfil muestra los dos (`nivelEducacion` y `nivelMaximoSegunTitulos`) y ninguno reemplaza al otro.
// Las dos fuentes usan la misma escala numérica (6 bachillerato, 7 técnico superior, 8 tercer nivel, 9
// cuarto nivel). Medido el 2026-11-20 sobre las 3.766 personas: 1.256 con un título con nivel; en 327 el
// registro civil dice otro nivel (en 227 el título es más alto: el registro civil no se entera del
// título). Se guarda como esperada. Se mudó de conciliacion.ts sin cambios.
function diferenciaDeNivel(crudo: AnyRecord, consulta: string, emisor: Emisor): void {
  const general = (crudo.general as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const delRegistro = (general?.nivelEducacion as AnyRecord | undefined)?.nivelEducacion as AnyRecord | undefined;
  const nivelRc = num(delRegistro?.nivel);
  if (nivelRc === null) return;
  const titulos = filasDe(crudo, "titulos", "titulos")
    .map((f) => ({ f, nivel: (((f.r.titulo as AnyRecord | undefined)?.nivelEducacion as AnyRecord | undefined) ?? {}) as AnyRecord }))
    .filter((t) => num(t.nivel.nivel) !== null)
    .sort((a, b) => num(b.nivel.nivel)! - num(a.nivel.nivel)!);
  const alto = titulos[0];
  if (!alto || num(alto.nivel.nivel) === nivelRc) return;
  const registroRc: RefDeRegistro = { consulta, fuente: "general", campo: "nivelEducacion" };
  emisor.diferencia({
    codigo: "dif.ide.nivel_de_educacion",
    regla: "ide.nivel_de_educacion@1",
    sobre: "general.nivelEducacion",
    manda: { fuente: "general", valor: textoDe(delRegistro?.descripcion), registro: registroRc },
    cede: [{ fuente: "titulos", valor: textoDe(alto.nivel.descripcion), registro: refDeFila(consulta, alto.f, "titulo") }],
    // Con signo: positiva si el título es más alto que lo que dice el registro civil.
    magnitud: { absoluta: num(alto.nivel.nivel)! - nivelRc, relativa: null },
    lectura: "esperada",
  });
}
