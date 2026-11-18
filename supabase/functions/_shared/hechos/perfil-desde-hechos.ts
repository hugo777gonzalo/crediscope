// Arma un grupo del perfil estandarizado desde los hechos, con el catálogo
// (docs/capa-de-hechos.md, 3.3). En la etapa A sólo lo usan la comparación en
// seco y las pruebas; en la etapa B reemplaza el bloque de process.ts.
//
// Un hecho sin valor no inventa uno: el campo toma lo que el perfil escribe hoy
// en ese caso (`enElPerfilSinValor`: 0, false o null), que es lo que hace
// process.ts cuando una fuente no contesta o no hay registros.

import { catalogoCompleto } from "./indice.ts";
import type { HechosDeLaPersona } from "./tipos.ts";

export function perfilDesdeHechos(doc: HechosDeLaPersona, grupoDelPerfil: string): Record<string, unknown> {
  const porCodigo = new Map(doc.hechos.map((h) => [h.codigo, h]));
  const salida: Record<string, unknown> = {};
  for (const c of catalogoCompleto()) {
    if (!c.campoDelPerfil?.startsWith(`${grupoDelPerfil}.`)) continue;
    const campo = c.campoDelPerfil.slice(grupoDelPerfil.length + 1);
    const h = porCodigo.get(c.codigo);
    if (!h) throw new Error(`El código ${c.codigo} no se emitió: el campo ${c.campoDelPerfil} quedaría sin procedencia`);
    salida[campo] = h.valor ?? c.enElPerfilSinValor ?? null;
  }
  return salida;
}

// Los grupos del perfil que arma un grupo de hechos, leídos de su catálogo.
export function gruposDelPerfil(catalogo: { campoDelPerfil?: string }[]): string[] {
  return [...new Set(catalogo.flatMap((c) => (c.campoDelPerfil ? [c.campoDelPerfil.split(".")[0]] : [])))];
}
