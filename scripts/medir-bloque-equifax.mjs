// Mide cuánto pesaría el bloque `buroEquifax` del perfil del modelo (propuesta
// en docs/propuesta-marco-equifax.md) con la estructura de las consultas ya
// guardadas: tamaño en caracteres y en tokens estimados, por persona. Es el
// primer paso de la validación y NO gasta nada: lee consultas_equifax.estructura
// y no llama al modelo ni a Equifax.
//
// El bloque se arma con la misma tabla de la sección 3 de la propuesta: qué
// grupos y campos de la estructura le llegarían al modelo y cuáles se quedan
// afuera (estimaciones de Equifax, lo que depende del diccionario, el material
// de control). Cuando la propuesta se apruebe, esta lista se vuelve
// buroEquifaxDelPerfilDelModelo() en perfil-del-modelo.ts y este guion usa esa.
//
// Imprime sólo conteos de caracteres y de tokens estimados: nunca un valor de la
// estructura ni un código de persona.
//
//   node scripts/medir-bloque-equifax.mjs
//
// AVISO: este archivo no pasa por lint ni build.

import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { cargarEntorno } from "./_comun/entorno.mjs";
import { explicar } from "./_comun/casos.mjs";

cargarEntorno(path.resolve(import.meta.dirname, ".."));
const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const BLOQUES_DE_DEUDA = ["numeroDeOperaciones", "saldoDeudaUsd", "saldoPorVencerUsd", "saldoVencidoUsd", "saldoNoDevengaInteresesUsd", "saldoDemandaJudicialUsd", "saldoCarteraCastigadaUsd", "cuotaMensualUsd", "maximoDiasDeMora", "conciliaConElResumen"];
const elegir = (o, claves) => (o ? Object.fromEntries(claves.filter((k) => k in o).map((k) => [k, o[k]])) : null);

// La proyección de la sección 3 de la propuesta.
export function bloqueDelModelo(e) {
  const t = e.deudaActualTitular;
  const o = e.deudaCodeudorGarante;
  return {
    fechaDelReporte: e.consulta?.consultadoEl?.slice(0, 10) ?? null,
    scores: elegir(e.scores, ["scoreEquifax", "scoreEquifaxHace6Meses", "scoreEquifaxHace12Meses", "variacionDelScore12Meses", "scoreInclusionEquifax", "scoreSobreendeudamientoEquifax", "nivelDeSobreendeudamiento"]),
    estadoGeneral: {
      estadoDeCartera: e.estadoGeneral?.estadoDeCartera ? { descripcion: e.estadoGeneral.estadoDeCartera.descripcion, calculadoPor: "Equifax" } : null,
      ...elegir(e.estadoGeneral, ["antiguedadCrediticiaMeses", "tieneInhabilitacionBancaria", "ultimaInhabilitacion", "numeroDeMorosidades"]),
    },
    deudaActualTitular: {
      bancos: elegir(t?.bancos, BLOQUES_DE_DEUDA),
      cooperativas: elegir(t?.cooperativas, BLOQUES_DE_DEUDA),
      comercial: elegir(t?.comercial, BLOQUES_DE_DEUDA),
      total: elegir(t?.total, BLOQUES_DE_DEUDA),
    },
    deudaCodeudorGarante: { total: elegir(o?.total, ["numeroDeOperaciones", "saldoDeudaUsd", "saldoVencidoUsd", "maximoDiasDeMora"]) },
    moraActual: elegir(e.moraActual, Object.keys(e.moraActual ?? {}).filter((k) => k !== "vencidoSegunElResumenDeEquifaxTodosLosRolesUsd")),
    conductaDePago: e.conductaDePago,
    evolucion: e.evolucion,
    tarjetas: e.tarjetas,
    creditosOtorgados: elegir(e.creditosOtorgados, ["numeroDeCreditosOtorgados", "numeroDeCreditosRefinanciados", "numeroDeCreditosReestructurados", "numeroDeCreditosNovados", "numeroDeCreditosCancelados"]),
    consultasRecibidas: e.consultasRecibidas
      ? elegir(e.consultasRecibidas, ["entidadesQueLaConsultaronEnLosUltimos12Meses", "consultasEnLosUltimos12Meses", "entidadesEnLosUltimos3Meses", "consultasEnLosUltimos3Meses"])
      : null,
    listasQueNoVinieron: e.calidad?.listasQueNoVinieron ?? [],
  };
}

const { data, error } = await db.from("consultas_equifax").select("id, estructura").not("estructura", "is", null).eq("ambiente", "produccion");
if (error) {
  console.error(explicar(error));
  process.exit(1);
}
if (data.length === 0) {
  console.error("No hay estructuras guardadas en producción.");
  process.exit(1);
}
// ~3,2 caracteres por token en un JSON en castellano con nombres largos: una estimación, no una medición.
const CARACTERES_POR_TOKEN = 3.2;
const tam = data.map((f) => JSON.stringify(bloqueDelModelo(f.estructura)).length);
const completa = data.map((f) => JSON.stringify(f.estructura).length);
const media = (v) => Math.round(v.reduce((a, b) => a + b, 0) / v.length);
console.log(`personas con estructura de producción: ${data.length}`);
console.log(`estructura entera guardada : ${media(completa)} caracteres en promedio (máx ${Math.max(...completa)})`);
console.log(`bloque que leería el modelo : ${media(tam)} caracteres en promedio (mín ${Math.min(...tam)}, máx ${Math.max(...tam)})`);
console.log(`tokens estimados del bloque : ${Math.round(media(tam) / CARACTERES_POR_TOKEN)} en promedio (máx ${Math.round(Math.max(...tam) / CARACTERES_POR_TOKEN)}); una ESTIMACIÓN con ${CARACTERES_POR_TOKEN} caracteres por token`);
