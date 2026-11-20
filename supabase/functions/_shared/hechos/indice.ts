// derivarHechos(): el único que conoce todos los grupos (docs/capa-de-hechos.md,
// sección 3.2). Se creó con los grupos ya nombrados y vacíos para que sumar un
// grupo no obligue a tocar este archivo: quien lo llena edita sólo el suyo.
//
// Función pura: ni reloj, ni base, ni fuentes. El reloj es `contexto.fechaDeLaConsulta`.

import { crearEmisor } from "./emisor.ts";
import type { CodigoDelCatalogo, Contexto, HechosDeLaPersona } from "./tipos.ts";
import * as comportamientoBancario from "./grupos/comportamiento-bancario.ts";
import * as cooperativas from "./grupos/cooperativas.ts";
import * as historialConLaInstitucion from "./grupos/historial-con-la-institucion.ts";
import * as riesgoJudicial from "./grupos/riesgo-judicial.ts";
import * as empleo from "./grupos/empleo.ts";
import * as actividadConRuc from "./grupos/actividad-con-ruc.ts";
import * as ingresos from "./grupos/ingresos.ts";
import * as identidad from "./grupos/identidad.ts";
import * as contacto from "./grupos/contacto.ts";
import * as familia from "./grupos/familia.ts";
import * as tributario from "./grupos/tributario.ts";
import * as seguridadSocial from "./grupos/seguridad-social.ts";
import * as patrimonio from "./grupos/patrimonio.ts";
import * as transito from "./grupos/transito.ts";
import * as penal from "./grupos/penal.ts";
import * as cumplimiento from "./grupos/cumplimiento.ts";

// hechos-v2 (estructura-v25): un hecho sin valor porque su fuente no contestó
// lleva su `parcial`, y un hecho de unidad «lista» puede ser una lista de
// registros simples (los préstamos del IESS/BIESS de la capacidad de pago).
export const HECHOS_VERSION = "hechos-v2";

// El nombre es el del grupo en la sección 3.1 y el de `--grupo=` de comparar-hechos.mjs.
export const GRUPOS = {
  comportamientoBancario,
  cooperativas,
  historialConLaInstitucion,
  riesgoJudicial,
  empleo,
  actividadConRuc,
  ingresos,
  identidad,
  contacto,
  familia,
  tributario,
  seguridadSocial,
  patrimonio,
  transito,
  penal,
  cumplimiento,
};

// Los grupos cuya etapa A dio paridad sobre el crudo real (sección 5.3): la
// prueba de los crudos inventados repite su paridad en cada PR. El grupo 1, el
// 2026-11-18: 0 diferencias en 112.980 campos de 3.766 personas, salvo 12 de 3
// personas a las que les faltó una fuente de préstamos del BIESS. Desde su
// etapa B (estructura-v25) process.ts lo arma desde los hechos.
export const GRUPOS_EN_PARIDAD: string[] = ["comportamientoBancario", "cooperativas"];

export function catalogoCompleto(): CodigoDelCatalogo[] {
  return Object.values(GRUPOS).flatMap((g) => g.CATALOGO);
}

export function derivarHechos(crudo: unknown, contexto: Contexto): HechosDeLaPersona {
  const emisor = crearEmisor(contexto, catalogoCompleto());
  for (const grupo of Object.values(GRUPOS)) grupo.emitir(crudo, contexto, emisor);
  return { version: HECHOS_VERSION, contexto, ...emisor.resultado() };
}
