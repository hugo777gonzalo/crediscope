// Arma un grupo del perfil estandarizado desde los hechos, con el catálogo
// (docs/capa-de-hechos.md, 3.3). Desde la etapa B del grupo 1 es lo que usa
// process.ts para los grupos que ya salen de hechos.
//
// Un hecho sin valor no inventa uno:
//   - si la fuente no contestó (o está apagada), el campo es null y el grupo lo
//     lista en `camposSinDato` con el `parcial` del hecho, lo que dicen las
//     fuentes que sí contestaron (estructura-v25; campos-sin-dato.ts);
//   - si no aplica o la fuente no lo informa, el campo toma lo que el perfil
//     escribe en ese caso (`enElPerfilSinValor`: 0, false o null).

import { CLAVE_SIN_DATO } from "../campos-sin-dato.ts";
import { esFuenteQueNoContesto } from "./emisor.ts";
import { catalogoCompleto } from "./indice.ts";
import type { HechosDeLaPersona } from "./tipos.ts";

export function perfilDesdeHechos(doc: HechosDeLaPersona, grupoDelPerfil: string): Record<string, unknown> {
  const porCodigo = new Map(doc.hechos.map((h) => [h.codigo, h]));
  const salida: Record<string, unknown> = {};
  const sinDato: Record<string, unknown> = {};
  for (const c of catalogoCompleto()) {
    if (!c.campoDelPerfil?.startsWith(`${grupoDelPerfil}.`)) continue;
    const campo = c.campoDelPerfil.slice(grupoDelPerfil.length + 1);
    const h = porCodigo.get(c.codigo);
    if (!h) throw new Error(`El código ${c.codigo} no se emitió: el campo ${c.campoDelPerfil} quedaría sin procedencia`);
    if (h.valor === null && esFuenteQueNoContesto(h.motivo)) {
      salida[campo] = null;
      sinDato[campo] = h.parcial ?? c.enElPerfilSinValor ?? null;
    } else {
      salida[campo] = h.valor ?? c.enElPerfilSinValor ?? null;
    }
  }
  if (Object.keys(sinDato).length) salida[CLAVE_SIN_DATO] = sinDato;
  return salida;
}

// Los grupos del perfil que arma un grupo de hechos, leídos de su catálogo.
export function gruposDelPerfil(catalogo: { campoDelPerfil?: string }[]): string[] {
  return [...new Set(catalogo.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil.split(".")[0]] : [])))];
}
