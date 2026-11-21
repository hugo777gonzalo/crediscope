// Las columnas de client_profiles que son copia de algo del perfil
// estandarizado. El JSON es la fuente de verdad; las copias existen para
// que la base cuente y filtre sin bajar perfiles enteros (043, 085, 089).
//
// Se calculan acá y en ningún otro lado. Hasta el 2026-09-28 cada función
// que guarda un perfil las armaba con su propia copia, y los scripts de
// recálculo reescribían el perfil sin tocarlas: después de fuentes-v8 y v9
// el Panorama contaba a 65 personas en el segmento de antes -- entre ellas
// 12 militares y policías retirados como "informal o sin actividad" y 16 en
// servicio activo fuera del sector público -- mientras la ficha mostraba el
// nuevo. Todo lo que escriba standard_profile escribe también esto, y
// scripts/calcular-columnas-del-perfil.mjs realinea lo ya guardado.
import type { StandardClientProfile } from "./types.ts";
import { indiciosDeIngresoMayor } from "./fuentes-ingreso.ts";
import { clasificarPerfilLaboral } from "./perfil-laboral.ts";
import { conLosValoresDeAntes } from "./campos-sin-dato.ts";

export function columnasDelPerfil(perfilGuardado: StandardClientProfile) {
  // Las columnas copian los valores de antes: un campo sin dato (campos-sin-dato.ts) no cambia el segmento ni el
  // perfil laboral de la columna, que filtran la bandeja y Monitoreo.
  const perfil = conLosValoresDeAntes(perfilGuardado);
  const f = perfil.fuentesIngreso;
  return {
    fuente_segmento: f?.segmento ?? null,
    fuente_estado: f?.estadoSegmento ?? null,
    fuente_version: f?.version ?? null,
    fuente_corte: f?.corteIessUsado ?? null,
    fuente_piso_ingreso: f?.pisoIngresoMensualReportado ?? null,
    perfil_laboral: clasificarPerfilLaboral(perfil as unknown as Record<string, unknown>)?.clave ?? null,
    indicios_ingreso: indiciosDeIngresoMayor(f as unknown as Record<string, unknown>).map((i) => i.clave),
  };
}
