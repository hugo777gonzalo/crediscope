// El emisor: lo único con lo que un grupo arma hechos (sección 3.1 del diseño).
//
// Valida al armar lo que el diseño exige y el control del PR repite: un hecho con
// valor cita al menos un registro, uno sin valor dice su motivo, una señal dice de
// qué hechos sale, y todo código está en el catálogo. Mínimo del paso 0: sin reglas.

import type { CodigoDelCatalogo, Contexto, Diferencia, Entidad, Hecho, Senal } from "./tipos.ts";

export const FORMA_DE_UN_CODIGO = /^[a-z]{2,5}(\.[a-z0-9_]+){1,3}$/;

export interface Emisor {
  hecho(h: Omit<Hecho, "clase" | "fechaDeLaConsulta">): void;
  entidad(e: Entidad): void;
  diferencia(d: Omit<Diferencia, "clase" | "fechaDeLaConsulta">): void;
  senal(s: Omit<Senal, "clase" | "fechaDeLaConsulta">): void;
  resultado(): { hechos: Hecho[]; entidades: Entidad[]; diferencias: Diferencia[]; senales: Senal[] };
}

export function crearEmisor(contexto: Contexto, catalogo: CodigoDelCatalogo[]): Emisor {
  const codigos = new Set(catalogo.map((c) => c.codigo));
  const hechos: Hecho[] = [];
  const entidades: Entidad[] = [];
  const diferencias: Diferencia[] = [];
  const senales: Senal[] = [];
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
      hechos.push({ ...h, clase: "hecho", fechaDeLaConsulta: fecha });
    },
    entidad(e) {
      entidades.push(e);
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
    resultado: () => ({ hechos, entidades, diferencias, senales }),
  };
}
