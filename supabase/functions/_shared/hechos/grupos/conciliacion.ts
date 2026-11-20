// E9 de la capa de hechos: las diferencias entre fuentes cuyo grupo todavía no existe
// (docs/capa-de-hechos.md, sección 6, puntos 12 y 13).
//
// Cada una debería vivir en el archivo de su grupo: las multas en transito.ts y el nivel de
// educación en identidad.ts. Esos grupos están vacíos. Cuando el grupo se llena, la diferencia
// se muda a su archivo CON EL MISMO CÓDIGO y sale de acá: un código no cambia de significado ni
// se repite en dos catálogos. El PEP (punto 10) ya se mudó: `dif.cum.pep.repetido` vive en
// cumplimiento.ts desde estructura-v28.
//
// Ninguna cambia un valor del perfil: process.ts sigue sumando las multas y mostrando el nivel del registro civil junto al del título. Lo que no se guarda no
// se puede medir después: por eso se guardan aunque sean esperadas. Lo que el negocio puede
// decidir sobre cada una está en la sección 10 del diseño, con su medición.
//
// Sin campos del perfil: perfil-desde-hechos.ts no arma nada de este grupo y la paridad no
// cambia. Sin reglas que mezclan: ninguna une, elige ni descarta registros para un valor.

import type { Emisor } from "../emisor.ts";
import { type AnyRecord, type Fila, filasDe, num, redondear, refDeFila, textoDe } from "../lectura-del-crudo.ts";
import type { CodigoDelCatalogo, Contexto, RefDeRegistro } from "../tipos.ts";

const dif = (codigo: string, descripcion: string, unidad: CodigoDelCatalogo["unidad"]): CodigoDelCatalogo => ({
  codigo,
  unidad,
  descripcion,
  llegaAlModelo: false,
  esIdentificador: false,
});

export const CATALOGO: CodigoDelCatalogo[] = [
  dif("dif.tra.posible_repetida", "La misma multa de tránsito (placa y día de emisión) en dos entidades, contada en las dos", "usd"),
  dif("dif.ide.nivel_de_educacion", "Nivel de educación del registro civil contra el del título registrado más alto", "texto"),
  // Punto 16. No la emite este grupo: necesita el buró, que derivarHechos no recibe. La arma
  // conciliacion-con-el-buro.ts; el código vive acá para que esté en el catálogo como todos.
  dif("dif.end.bancos", "Deuda propia en bancos según el buró de la institución contra según Proveedor_Info_1", "usd"),
];

export const REGLAS_QUE_MEZCLAN: string[] = [];

export function emitir(crudoSinTipo: unknown, contexto: Contexto, emisor: Emisor): void {
  const crudo = (crudoSinTipo ?? {}) as AnyRecord;
  multaRepetida(crudo, contexto.consulta, emisor);
  nivelDeEducacion(crudo, contexto.consulta, emisor);
}

// ---- Punto 12: la misma multa en dos entidades de tránsito ----
//
// process.ts suma las multas de deudasAnt, deudasAmt y deudasEmov. Medido el 2026-11-20 sobre las
// 3.766 personas: 361 con multas de la ANT, 5 con la AMT, 2 con las dos y ninguna multa repetida. La ANT lista también multas de autoridades municipales (la de Guayaquil), así
// que una multa municipal puede venir en las dos. EMOV trae un resumen por persona con las multas
// en `infraccion` (38 personas y 44 multas), con la placa pero con la fecha vacía en
// todas: sin el día no se puede decir que es la misma multa, y no se compara (la medición cuenta
// las de la misma placa y monto que una de la ANT, scripts/medir-conciliacion.mjs).
//
// La misma multa: la misma placa y el mismo día de emisión. No se mira el monto: la AMT le suma
// intereses y la ANT no. Si pasa, el perfil la cuenta dos veces: lectura «revisar».
const placa = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

// La ANT trae «2024-12-29 12:47:47.0»; la AMT, «11/07/2025».
export function diaDeEmision(v: unknown): string | null {
  const t = String(v ?? "").trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

function multaRepetida(crudo: AnyRecord, consulta: string, emisor: Emisor): void {
  const ant = filasDe(crudo, "deudasAnt", "deudaAnts");
  const amt = filasDe(crudo, "deudasAmt", "deudaAmt");
  const tomadas = new Set<Fila>();
  for (const a of ant) {
    const p = placa(a.r.placa);
    const dia = diaDeEmision(a.r.fechaEmision);
    if (!p || !dia) continue;
    const b = amt.find((x) => !tomadas.has(x) && placa(x.r.placa) === p && diaDeEmision(x.r.fechaEmision) === dia);
    if (!b) continue;
    tomadas.add(b);
    const deA = num(a.r.total) ?? 0;
    const deB = num(b.r.total) ?? 0;
    const absoluta = redondear(Math.abs(deA - deB));
    emisor.diferencia({
      codigo: "dif.tra.posible_repetida",
      regla: "tra.repetida@1",
      sobre: `deudasAnt.deudaAnts#${a.indice}`,
      manda: { fuente: "deudasAnt", valor: redondear(deA), registro: refDeFila(consulta, a, "total") },
      cede: [{ fuente: "deudasAmt", valor: redondear(deB), registro: refDeFila(consulta, b, "total") }],
      magnitud: { absoluta, relativa: deA ? Math.round((absoluta / deA) * 10_000) / 10_000 : null },
      lectura: "revisar",
    });
  }
}

// ---- Punto 13: el nivel de educación del registro civil y el de los títulos ----
//
// El perfil muestra los dos (`nivelEducacion` y `nivelMaximoSegunTitulos`) y ninguno manda. Las
// dos fuentes usan la misma escala numérica (6 bachillerato, 7 técnico superior, 8 tercer nivel,
// 9 cuarto nivel). Medido el 2026-11-20 sobre las 3.766 personas: 1.256 con un título con nivel;
// en 327 el registro civil dice otro nivel (en 227 el título es más alto: el registro civil no se
// entera del título). Se guarda como esperada: hasta que el negocio decida
// cuál manda, conviven.
function nivelDeEducacion(crudo: AnyRecord, consulta: string, emisor: Emisor): void {
  const general = (crudo.general as AnyRecord | undefined)?.data as AnyRecord | undefined;
  const delRegistro = (general?.nivelEducacion as AnyRecord | undefined)?.nivelEducacion as AnyRecord | undefined;
  const nivelRc = num(delRegistro?.nivel);
  if (nivelRc === null) return;
  const titulos = filasDe(crudo, "titulos", "titulos")
    .map((f) => ({ f, nivel: (((f.r.titulo as AnyRecord | undefined)?.nivelEducacion as AnyRecord | undefined) ?? {}) as AnyRecord }))
    .filter((t) => num(t.nivel.nivel) !== null)
    .sort((a, b) => num(b.nivel.nivel)! - num(a.nivel.nivel)!);
  const alto = titulos[0];
  if (!alto || num(alto.nivel.nivel) === nivelRc) return;
  const registroRc: RefDeRegistro = { consulta, fuente: "general", campo: "nivelEducacion" };
  emisor.diferencia({
    codigo: "dif.ide.nivel_de_educacion",
    regla: "ide.nivel_de_educacion@1",
    sobre: "general.nivelEducacion",
    manda: { fuente: "general", valor: textoDe(delRegistro?.descripcion), registro: registroRc },
    cede: [{ fuente: "titulos", valor: textoDe(alto.nivel.descripcion), registro: refDeFila(consulta, alto.f, "titulo") }],
    // Con signo: positiva si el título es más alto que lo que dice el registro civil.
    magnitud: { absoluta: num(alto.nivel.nivel)! - nivelRc, relativa: null },
    lectura: "esperada",
  });
}
