// El papel de la persona en una denuncia de la Fiscalía.
//
// denuncias[].detalleDenuncia lista a TODAS las partes (denunciante,
// víctima, testigo, sospechoso, procesado, policía, abogado...), cada una
// con su cédula. Hasta estructura-v8 el control de bloqueo por delitos de
// seguridad ciudadana buscaba las palabras clave en todas las denuncias sin
// mirar ese papel. Medido el 2026-09-28 sobre la cartera real: de 59
// personas bloqueadas, 42 lo estaban sólo por denuncias en las que eran
// denunciantes o víctimas (31 de extorsión), testigos, el policía o el
// abogado defensor. Salían con score 1 y "negar" por haber denunciado una
// extorsión.
//
// Decisión del negocio (2026-09-28):
//   - Es acusada sólo si figura CON SU CÉDULA como sospechosa o procesada.
//     "Aprehendida" (detenida en flagrancia) también: es la misma acusación
//     en su primera etapa.
//   - Si su cédula no figura entre las partes, la denuncia no es de ella:
//     Novadata la asocia por el nombre, y en una de ellas quien se llama
//     igual es el fallecido. No cuenta para nada, ni como aviso de posible
//     homónimo. Pasa con 232 de 1.780 denuncias.
//
// La usan el control de bloqueo y el perfil (riesgoPenal,
// riesgoSeguridadCiudadana): una sola regla. Antes el perfil contaba bien a
// los sospechosos y el bloqueo no; dos lecturas de lo mismo es como
// aparecen estas diferencias.

type AnyRecord = Record<string, unknown>;

export type RolEnDenuncia = "acusada" | "otro_papel" | "no_figura";

// SOSPECHOSO cubre también "SOSPECHOSO NO RECONOCIDO". Hasta v8 la regla
// del perfil buscaba sólo SOSPECHOSO, y las 18 denuncias en las que la
// persona figura como PROCESADA -- ya acusada formalmente -- contaban como
// si fuera la víctima.
const ROL_ACUSADA = /SOSPECHOSO|PROCESADO|APREHENDIDO/;

export function partesDeLaDenuncia(d: AnyRecord): AnyRecord[] {
  return Array.isArray(d.detalleDenuncia) ? (d.detalleDenuncia as AnyRecord[]) : [];
}

export function rolEnDenuncia(d: AnyRecord, cedula: string | null | undefined): RolEnDenuncia {
  if (!cedula) return "no_figura";
  const suyas = partesDeLaDenuncia(d).filter((p) => String(p.cedula ?? "") === cedula);
  if (suyas.length === 0) return "no_figura";
  return suyas.some((p) => ROL_ACUSADA.test(String(p.estado ?? "").toUpperCase())) ? "acusada" : "otro_papel";
}
