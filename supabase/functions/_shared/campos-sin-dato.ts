// El «sin dato» del perfil (estructura-v25, E4 de la reestructuración del núcleo).
//
// Hasta estructura-v24, con una fuente que no contestó, el perfil escribía lo
// que trajeron las demás, o 0, como si fuera el total: «0 operaciones en
// bancos» para alguien cuyo buró no respondió. Con el proveedor rechazando 41 de
// 52 fuentes, 740 de 3.766 personas estaban en consulta incompleta (2026-11-18).
// Desde la v25 el campo es null y su grupo lo lista en `camposSinDato`, con lo
// que dicen las fuentes que sí contestaron (el valor que el perfil escribía).
//
// Quien todavía tiene que leer como antes lo pide acá, en un solo lugar:
//   - el perfil del modelo, hasta la versión mayor del marco (cambiar lo que lee
//     el modelo es versión nueva del marco; supabase/CLAUDE.md, «El modelo»);
//   - la capacidad de pago, que no cambia de cálculo con esta versión.
// La pantalla lee el null y la marca.
//
// Sin dependencias: lo importan las funciones y el navegador.

type Registro = Record<string, unknown>;

export const CLAVE_SIN_DATO = "camposSinDato";

// Los grupos del perfil que pueden traer `camposSinDato` (los grupos 1 y 3 de la
// capa de hechos, más el penal y el de cumplimiento desde la v28). Un grupo nuevo en
// etapa B se suma acá.
export const GRUPOS_CON_SIN_DATO = [
  "comportamientoBancario",
  "comportamientoCooperativas",
  "riesgoJudicialCrediticio",
  "riesgoJudicialCivil",
  "riesgoSeguridadCiudadana",
  "riesgoPenal",
  "cumplimiento",
] as const;

// Los campos de un grupo que quedaron sin dato, o una lista vacía.
export function camposSinDato(grupo: unknown): string[] {
  const g = grupo && typeof grupo === "object" ? (grupo as Registro)[CLAVE_SIN_DATO] : null;
  return g && typeof g === "object" && !Array.isArray(g) ? Object.keys(g) : [];
}

// Una copia del perfil con cada campo sin dato devuelto al valor que escribía
// estructura-v24, y sin `camposSinDato`. Un perfil sin la marca vuelve igual.
// El campo conserva su posición en el grupo: el modelo lee el JSON en orden.
export function conLosValoresDeAntes<T>(perfil: T): T {
  if (!perfil || typeof perfil !== "object") return perfil;
  let copia: Registro | null = null;
  for (const nombre of GRUPOS_CON_SIN_DATO) {
    const grupo = (perfil as Registro)[nombre];
    if (!grupo || typeof grupo !== "object" || !(CLAVE_SIN_DATO in grupo)) continue;
    copia ??= { ...(perfil as Registro) };
    const g = { ...(grupo as Registro) };
    const antes = g[CLAVE_SIN_DATO];
    delete g[CLAVE_SIN_DATO];
    if (antes && typeof antes === "object" && !Array.isArray(antes)) {
      for (const [campo, valor] of Object.entries(antes as Registro)) g[campo] = valor;
    }
    copia[nombre] = g;
  }
  return (copia ?? perfil) as T;
}
