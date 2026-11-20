// derivarHechos(): el único que conoce todos los grupos (docs/capa-de-hechos.md,
// sección 3.2). Se creó con los grupos ya nombrados y vacíos para que sumar un
// grupo no obligue a tocar este archivo: quien lo llena edita sólo el suyo.
//
// Función pura: ni reloj, ni base, ni fuentes. El reloj es `contexto.fechaDeLaConsulta`.

import { crearEmisor, type Emisor } from "./emisor.ts";
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
// E9: las diferencias entre fuentes cuyo grupo todavía no existe (se mudan a su grupo al llenarlo).
import * as conciliacion from "./grupos/conciliacion.ts";

// hechos-v2 (estructura-v25): un hecho sin valor porque su fuente no contestó
// lleva su `parcial`, y un hecho de unidad «lista» puede ser una lista de
// registros simples (los préstamos del IESS/BIESS de la capacidad de pago).
//
// hechos-v3 (grupo 3, riesgo judicial): un elemento de una lista puede llevar una lista
// de textos (los tipos de cada categoría de demanda), y un grupo en etapa A escribe el
// `parcial` en el perfil cuando una fuente no contestó.
//
// hechos-v4 (grupo 4, ingresos): un hecho puede valer un objeto de valores simples (la
// continuidad laboral, unidad «objeto»), y un elemento puede llevar booleanos.
export const HECHOS_VERSION = "hechos-v4";

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
  conciliacion,
};

// Los grupos cuya etapa A dio paridad sobre el crudo real (sección 5.3): la
// prueba de los crudos inventados repite su paridad en cada PR. El grupo 1, el
// 2026-11-18: 0 diferencias en 112.980 campos de 3.766 personas, salvo 12 de 3
// personas a las que les faltó una fuente de préstamos del BIESS. Desde su
// etapa B (estructura-v25) process.ts lo arma desde los hechos. El grupo 2, el
// 2026-11-20: 0 diferencias en 26.362 campos de las mismas 3.766 personas. El grupo 3
// (riesgo judicial), el mismo día: 0 diferencias en 75.320 campos, y el hallazgo de
// seguridad ciudadana desde hechos da lo mismo que el control de bloqueo en las 3.766. Los
// grupos penal y cumplimiento (E7, 2026-11-20): paridad en las mismas 3.766 personas, y desde
// su etapa B (estructura-v28) process.ts los arma desde los hechos y el control de bloqueo toma
// de ellos todos sus hallazgos.
export const GRUPOS_EN_PARIDAD: string[] = ["comportamientoBancario", "cooperativas", "historialConLaInstitucion", "riesgoJudicial", "empleo", "actividadConRuc", "ingresos", "penal", "cumplimiento"];

export function catalogoCompleto(): CodigoDelCatalogo[] {
  return Object.values(GRUPOS).flatMap((g) => g.CATALOGO);
}

// Los grupos de los que depende el perfil: process.ts los arma con `perfilDesdeHechos`
// (etapa B). Si uno falla, el perfil no se puede armar, y tiene que fallar como hoy. Un grupo
// nuevo se suma acá cuando su bloque de process.ts pasa a armarse desde los hechos.
export const GRUPOS_EN_ETAPA_B: string[] = ["comportamientoBancario", "cooperativas", "riesgoJudicial", "penal", "cumplimiento"];

export interface OpcionesDeDerivacion {
  // Con `estricto`, el error de cualquier grupo se propaga. Lo usan los guiones y las
  // pruebas: un grupo en etapa A que se cae no puede pasar en silencio en un seco.
  estricto?: boolean;
  // Los grupos que corren, por nombre; por omisión GRUPOS. Sólo para las pruebas, que
  // reemplazan uno por otro que lanza un error. Los códigos del catálogo son los de GRUPOS.
  grupos?: Record<string, { emitir: (crudo: unknown, contexto: Contexto, emisor: Emisor) => void }>;
}

// Producción llama a derivarHechos en cada perfil (process.ts), y eso incluye a los grupos en
// etapa A, que todavía no alimentan nada. Un error en uno de ésos no debe romper el armado
// del perfil: ese grupo no emite nada (se deshace lo que alcanzó a emitir), el error queda
// en el registro con el grupo y el mensaje, sin datos de la persona, y el resto sigue.
export function derivarHechos(crudo: unknown, contexto: Contexto, opciones: OpcionesDeDerivacion = {}): HechosDeLaPersona {
  const emisor = crearEmisor(contexto, catalogoCompleto());
  for (const [nombre, grupo] of Object.entries(opciones.grupos ?? GRUPOS)) {
    if (opciones.estricto || GRUPOS_EN_ETAPA_B.includes(nombre)) {
      grupo.emitir(crudo, contexto, emisor);
      continue;
    }
    const deshacer = emisor.marca();
    try {
      grupo.emitir(crudo, contexto, emisor);
    } catch (e) {
      deshacer();
      console.error(`hechos: el grupo ${nombre} falló y no emitió nada: ${e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "error que no es un Error"}`);
    }
  }
  return { version: HECHOS_VERSION, contexto, ...emisor.resultado() };
}
