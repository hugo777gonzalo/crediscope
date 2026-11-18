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

export const HECHOS_VERSION = "hechos-v1";

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

// Los grupos que ya pasaron la etapa A (sección 5.3): vacío hasta que uno pase.
export const GRUPOS_EN_PARIDAD: string[] = [];

export function catalogoCompleto(): CodigoDelCatalogo[] {
  return Object.values(GRUPOS).flatMap((g) => g.CATALOGO);
}

export function derivarHechos(crudo: unknown, contexto: Contexto): HechosDeLaPersona {
  const emisor = crearEmisor(contexto, catalogoCompleto());
  for (const grupo of Object.values(GRUPOS)) grupo.emitir(crudo, contexto, emisor);
  return { version: HECHOS_VERSION, contexto, ...emisor.resultado() };
}
