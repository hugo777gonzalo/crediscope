// Configurar una institución: elegir una plantilla, ponerle los cambios de la institución (datos,
// no código) y validar. Es lo que se le pide a CrediScope por escrito (decisión O1: en la primera
// versión el estándar lo cambia CrediScope a pedido de la institución, con versión nueva y la
// comparación en seco como constancia).
//
// Lo que sale de acá es el `contenido` completo de una fila de la tabla de estándares (155): la
// plantilla ya mezclada, nunca «la plantilla más los cambios» por separado, para que el mismo caso con
// el mismo estándar dé la misma salida aunque una plantilla cambie después.

import { aplicarCambios, type Cambios } from "./cambios.ts";
import { type EstandarDeLaInstitucion, type FilaDelEstandar, type NombreDePlantilla, PLANTILLAS } from "./estandar.ts";
import { plantillaSinValidar } from "./plantillas.ts";
import { type ResultadoDeValidar, validarEstandar } from "./validar-estandar.ts";

/** Una plantilla completa y validada. Una que no pase el validador es un error de programación, y se dice. */
export function plantillaCompleta(nombre: NombreDePlantilla): EstandarDeLaInstitucion {
  const r = validarEstandar(plantillaSinValidar(nombre));
  if (!r.ok) throw new Error(`La plantilla ${nombre} no pasa el validador:\n- ${r.errores.join("\n- ")}`);
  return r.estandar;
}

export interface PedidoDeConfiguracion {
  plantilla: NombreDePlantilla;
  /** Lo que la institución cambia de la plantilla. Un objeto con la misma forma del estándar, parcial; `null` quita una clave opcional. */
  cambios?: Cambios;
  conBuroDeLaInstitucion?: boolean;
}

/** Arma el estándar de una institución nueva. Un valor fuera de rango o una clave que no existe no se carga y se dice cuál. */
export function configurarEstandar(pedido: PedidoDeConfiguracion): ResultadoDeValidar {
  if (!PLANTILLAS.includes(pedido.plantilla)) {
    return { ok: false, errores: [`plantilla: no se conoce ${JSON.stringify(pedido.plantilla)}; las plantillas son ${PLANTILLAS.join(", ")}.`] };
  }
  const base = plantillaSinValidar(pedido.plantilla);
  const conCambios = aplicarCambios(base, { ...(pedido.cambios ?? {}), ...(pedido.conBuroDeLaInstitucion === undefined ? {} : { conBuroDeLaInstitucion: pedido.conBuroDeLaInstitucion }) });
  return validarEstandar(conCambios);
}

// ---------------------------------------------------------------- la huella

// JSON canónico: claves ordenadas, sin espacios. Dos estándares iguales dan la misma huella aunque se hayan armado en otro orden.
export function jsonCanonico(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(jsonCanonico).join(",")}]`;
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${jsonCanonico(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(v);
}

/** El sha256 (hexadecimal) del contenido canónico. Cada análisis guarda la versión y la huella con que se calculó (1.1). */
export async function huellaDelEstandar(estandar: EstandarDeLaInstitucion): Promise<string> {
  const bytes = new TextEncoder().encode(jsonCanonico(estandar));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export interface DatosDeLaVersion {
  version: string;
  vigenteDesde: string;
  pedidoPor: string;
  aplicadoPor: string;
}

/** La fila de una versión nueva, con su huella. Valida otra vez: no se arma una fila con un estándar que no pasa. */
export async function armarFilaDelEstandar(contenido: unknown, datos: DatosDeLaVersion): Promise<FilaDelEstandar> {
  const r = validarEstandar(contenido);
  if (!r.ok) throw new Error(`No se arma la fila: el estándar no se puede cargar:\n- ${r.errores.join("\n- ")}`);
  if (!/^estandar-v\d+$/.test(datos.version)) throw new Error(`La versión tiene que ser estandar-vN; se escribió ${JSON.stringify(datos.version)}.`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datos.vigenteDesde)) throw new Error(`vigenteDesde tiene que ser una fecha aaaa-mm-dd; se escribió ${JSON.stringify(datos.vigenteDesde)}.`);
  return { version: datos.version, plantilla: r.estandar.plantilla, contenido: r.estandar, huella: await huellaDelEstandar(r.estandar), vigenteDesde: datos.vigenteDesde, pedidoPor: datos.pedidoPor, aplicadoPor: datos.aplicadoPor };
}
