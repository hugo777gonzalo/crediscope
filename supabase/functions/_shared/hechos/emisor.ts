// El emisor: lo único con lo que un grupo arma hechos (sección 3.1 del diseño).
//
// Valida al armar lo que el diseño exige y el control del PR repite: un hecho con
// valor cita al menos un registro, uno sin valor dice su motivo, una señal dice de
// qué hechos sale, y todo código está en el catálogo. Mínimo del paso 0: sin reglas.

import type { CodigoDelCatalogo, Contexto, Descarte, Diferencia, Entidad, Hecho, MotivoDeNoDisponible, RefDeRegistro, Senal } from "./tipos.ts";

// Los motivos de «sin dato»: la fuente existe y no contestó, o la apagó la
// configuración. Los demás (no aplica, la fuente no lo informa) sí son el dato.
export function esFuenteQueNoContesto(motivo: MotivoDeNoDisponible | undefined): boolean {
  return motivo === "fuente_sin_respuesta" || motivo === "fuente_deshabilitada";
}

export const FORMA_DE_UN_CODIGO = /^[a-z]{2,5}(\.[a-z0-9_]+){1,3}$/;

export interface Emisor {
  hecho(h: Omit<Hecho, "clase" | "fechaDeLaConsulta">): void;
  entidad(e: Entidad): void;
  diferencia(d: Omit<Diferencia, "clase" | "fechaDeLaConsulta">): void;
  senal(s: Omit<Senal, "clase" | "fechaDeLaConsulta">): void;
  // La clave de una entidad nueva (1.3): estable dentro de la consulta. Si dos
  // entidades distintas caen en la misma huella, la segunda se resume con un
  // contador. La lleva el emisor porque dos grupos emiten operaciones.
  clave(prefijo: "op" | "emp" | "dem" | "est", identidad: string): Entidad["clave"];
  // Una marca de lo emitido hasta ahora: llamarla devuelve el emisor a ese punto (hechos,
  // entidades, diferencias, señales y claves). Es lo que usa derivarHechos para que un grupo
  // en etapa A que falla no deje a medias lo que alcanzó a emitir.
  marca(): () => void;
  resultado(): { hechos: Hecho[]; entidades: Entidad[]; diferencias: Diferencia[]; senales: Senal[] };
}

// Lo que todo grupo repite al emitir: la unidad sale de su catálogo, y un hecho
// de una fuente es «confirmado por un tercero» o no tiene valor y dice por qué.
export function ayudanteDelGrupo(emisor: Emisor, catalogo: CodigoDelCatalogo[]) {
  const unidades = new Map(catalogo.map((c) => [c.codigo, c.unidad]));
  const unidad = (codigo: string) => {
    const u = unidades.get(codigo);
    if (!u) throw new Error(`Código fuera del catálogo del grupo: ${codigo}`);
    return u;
  };
  return {
    confirmado(
      codigo: string,
      regla: string,
      fuentes: string[],
      valor: Hecho["valor"],
      registros: RefDeRegistro[],
      fechaDelDato: string | null,
      extra: { descartados?: Descarte[]; entidades?: string[] } = {},
    ) {
      const h: Omit<Hecho, "clase" | "fechaDeLaConsulta"> = { codigo, regla, unidad: unidad(codigo), valor, calidad: "confirmado_por_tercero", fuentes, fechaDelDato, registros };
      if (extra.descartados?.length) h.descartados = extra.descartados;
      if (extra.entidades?.length) h.entidades = extra.entidades;
      emisor.hecho(h);
    },
    // `parcial`: con una fuente que no contestó, lo que dice la regla con las
    // que sí (tipos.ts). Se omite en los demás motivos.
    sinValor(codigo: string, regla: string, fuentes: string[], motivo: MotivoDeNoDisponible, parcial?: Hecho["parcial"]) {
      const h: Omit<Hecho, "clase" | "fechaDeLaConsulta"> = { codigo, regla, unidad: unidad(codigo), valor: null, calidad: "no_disponible", motivo, fuentes, fechaDelDato: null, registros: [] };
      if (parcial !== undefined) h.parcial = parcial;
      emisor.hecho(h);
    },
  };
}

// La huella de una entidad (1.1): seis caracteres hexadecimales de un resumen
// de lo que la identifica. FNV-1a de 32 bits: sincrónico y sin dependencias,
// porque derivar es puro y corre igual en Deno, en Node y en el navegador.
export function huella(texto: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0").slice(0, 6);
}

export function crearEmisor(contexto: Contexto, catalogo: CodigoDelCatalogo[]): Emisor {
  const codigos = new Set(catalogo.map((c) => c.codigo));
  const hechos: Hecho[] = [];
  const entidades: Entidad[] = [];
  const diferencias: Diferencia[] = [];
  const senales: Senal[] = [];
  const usadas = new Set<string>();
  const fecha = contexto.fechaDeLaConsulta;

  function exigirCodigo(codigo: string) {
    if (!FORMA_DE_UN_CODIGO.test(codigo)) throw new Error(`Código con forma inválida: ${codigo}`);
    if (!codigos.has(codigo)) throw new Error(`Código fuera del catálogo: ${codigo}`);
  }

  return {
    hecho(h) {
      exigirCodigo(h.codigo);
      if (h.valor !== null && h.registros.length === 0) throw new Error(`Hecho con valor y sin registros: ${h.codigo}`);
      if (h.valor === null && !h.motivo) throw new Error(`Hecho sin valor y sin motivo: ${h.codigo}`);
      if (h.valor === null && h.calidad !== "no_disponible") throw new Error(`Hecho sin valor con calidad ${h.calidad}: ${h.codigo}`);
      if (h.parcial !== undefined && !esFuenteQueNoContesto(h.motivo)) throw new Error(`Hecho con parcial sin una fuente que no contestó: ${h.codigo}`);
      hechos.push({ ...h, clase: "hecho", fechaDeLaConsulta: fecha });
    },
    entidad(e) {
      if (!usadas.has(e.clave)) throw new Error(`Entidad con una clave que no dio el emisor: ${e.clave}`);
      entidades.push(e);
    },
    clave(prefijo, identidad) {
      let clave = `${prefijo}-${huella(identidad)}` as Entidad["clave"];
      for (let n = 1; usadas.has(clave); n++) clave = `${prefijo}-${huella(`${identidad}#${n}`)}` as Entidad["clave"];
      usadas.add(clave);
      return clave;
    },
    diferencia(d) {
      exigirCodigo(d.codigo);
      diferencias.push({ ...d, clase: "diferencia", fechaDeLaConsulta: fecha });
    },
    senal(s) {
      exigirCodigo(s.codigo);
      if (s.derivaDe.length === 0) throw new Error(`Señal sin derivaDe: ${s.codigo}`);
      senales.push({ ...s, clase: "senal", fechaDeLaConsulta: fecha });
    },
    marca() {
      const largos = [hechos.length, entidades.length, diferencias.length, senales.length];
      const claves = new Set(usadas);
      return () => {
        hechos.length = largos[0];
        entidades.length = largos[1];
        diferencias.length = largos[2];
        senales.length = largos[3];
        usadas.clear();
        for (const c of claves) usadas.add(c);
      };
    },
    resultado: () => ({ hechos, entidades, diferencias, senales }),
  };
}
