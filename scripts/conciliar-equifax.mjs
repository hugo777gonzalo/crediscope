// Concilia las cifras que Equifax entrega más de una vez en una misma respuesta
// (el detalle contra su resumen, un bloque contra otro, el rol de la persona),
// sobre las respuestas guardadas en disco. Es la evidencia de
// docs/propuesta-estructura-equifax.md, sección 3: la misma deuda no está igual
// en los dos bloques de la respuesta, y sumarlos duplicaría montos (lo que pasó
// con la «fila fantasma» de Aval).
//
// SOLO LEE research/equifax/crudo/. No llama a Equifax, no cobra y no toca la
// base. Imprime únicamente CONTEOS de coincidencia entre personas: nunca un
// monto, una cédula ni un código de persona.
//
//   node scripts/conciliar-equifax.mjs
//
// AVISO: este archivo no pasa por lint ni build. Si cambia la forma de la
// respuesta de Equifax, ajustar acá o la prueba mide otra cosa sin avisar.

import fs from "node:fs";
import path from "node:path";
import { carpetaDeResearch } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(import.meta.dirname, "..");
const dir = carpetaDeResearch(RAIZ, "equifax", "crudo");

// La consulta más reciente de cada persona que contestó.
const ultimas = new Map();
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".json")).sort()) {
  const c = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  if (c.cuerpo) ultimas.set(c.etiqueta, c.cuerpo);
}
const P = [...ultimas.values()];
if (P.length === 0) {
  console.error("No hay respuestas guardadas en research/equifax/crudo/.");
  process.exit(1);
}

const rc = (p) => p.reporteCrediticio;
const ir = (p) => p.interconnectResponse;
const S = (filas, campo) => (filas ?? []).reduce((a, f) => a + (Number(f?.[campo]) || 0), 0);
const igual = (a, b) => Math.abs(a - b) < 0.015; // a un centavo
const rolDe = (f) => String(f.tipo_riesgo ?? f.Tipo_Riesgo).toUpperCase(); // viene como TITULAR y como Titular
const esTitular = (f) => rolDe(f) === "TITULAR";
const rcTodas = (p) => [...(rc(p).detalle_deuda_actual_sb ?? []), ...(rc(p).detalle_deuda_actual_seps ?? []), ...(rc(p).detalle_deuda_actual_sicom ?? [])];
const irTodas = (p) => [...(ir(p).DetalleDeudaActualReportadaSBSSBS_Educativo ?? []), ...(ir(p).DetalleDeudaActualReportadaRFRSBS ?? []), ...(ir(p).DetalleDeudaActualReportadaSICOMSBS ?? [])];
const resumen3 = (p, sistema) => rc(p).valor_deuda_3_sistemas?.find((x) => x.institucion?.includes(sistema));
const compo = (p, d) => ir(p).Composicion_deuda_actual?.find((x) => x.Detalle === d);
const corteISO = (f) => String(f.fecha_corte).split("/").reverse().join("-");

// medir devuelve true (cuadra), false (difiere) o null (sin dato)
function contar(titulo, medir) {
  let ok = 0, difiere = 0, sinDato = 0;
  for (const p of P) {
    const r = medir(p);
    if (r === null || r === undefined) sinDato++; else if (r) ok++; else difiere++;
  }
  console.log(`${titulo.padEnd(96)} cuadran ${String(ok).padStart(2)} | difieren ${String(difiere).padStart(2)} | sin dato ${sinDato}`);
}

console.log(`Personas: ${P.length}\n`);

console.log("A. El detalle de cada sistema contra su resumen (valor_deuda_3_sistemas)");
contar("bancos: Σ saldo del detalle = total del resumen", (p) => { const r = resumen3(p, "SB"); return r ? igual(S(rc(p).detalle_deuda_actual_sb, "saldo_deuda"), r.total) : null; });
contar("cooperativas: Σ saldo del detalle = total del resumen", (p) => { const r = resumen3(p, "SEPS"); return r ? igual(S(rc(p).detalle_deuda_actual_seps, "saldo_deuda"), r.total) : null; });
contar("comercial: Σ saldo del detalle = total del resumen", (p) => { const r = resumen3(p, "SICOM"); return r ? igual(S(rc(p).detalle_deuda_actual_sicom, "saldo_deuda"), r.total) : null; });

console.log("\nB. La deuda de reporteCrediticio contra la de interconnectResponse");
contar("bancos: nº de filas igual", (p) => (rc(p).detalle_deuda_actual_sb?.length ?? 0) === (ir(p).DetalleDeudaActualReportadaSBSSBS_Educativo?.length ?? 0));
contar("bancos: saldo igual", (p) => igual(S(rc(p).detalle_deuda_actual_sb, "saldo_deuda"), S(ir(p).DetalleDeudaActualReportadaSBSSBS_Educativo, "Saldo_Deuda")));
contar("cooperativas: saldo igual", (p) => igual(S(rc(p).detalle_deuda_actual_seps, "saldo_deuda"), S(ir(p).DetalleDeudaActualReportadaRFRSBS, "Saldo_Deuda")));
contar("comercial: saldo igual", (p) => igual(S(rc(p).detalle_deuda_actual_sicom, "saldo_deuda"), S(ir(p).DetalleDeudaActualReportadaSICOMSBS, "Saldo_Deuda")));
contar("bancos: interconnectResponse trae igual o MÁS filas que reporteCrediticio", (p) => (ir(p).DetalleDeudaActualReportadaSBSSBS_Educativo?.length ?? 0) >= (rc(p).detalle_deuda_actual_sb?.length ?? 0));
contar("bancos: saldo de interconnectResponse = sólo lo que es titular en reporteCrediticio", (p) => igual(S(ir(p).DetalleDeudaActualReportadaSBSSBS_Educativo, "Saldo_Deuda"), S((rc(p).detalle_deuda_actual_sb ?? []).filter(esTitular), "saldo_deuda")));

console.log("\nC. El sector comercial: ¿qué fuente coincide con su resumen?");
contar("resumen comercial = Σ detalle de reporteCrediticio", (p) => { const r = resumen3(p, "SICOM"); return r ? igual(S(rc(p).detalle_deuda_actual_sicom, "saldo_deuda"), r.total) : null; });
contar("resumen comercial = Σ detalle de interconnectResponse", (p) => { const r = resumen3(p, "SICOM"); return r ? igual(S(ir(p).DetalleDeudaActualReportadaSICOMSBS, "Saldo_Deuda"), r.total) : null; });
contar("resumen comercial = Σ del detalle con el corte MÁS RECIENTE", (p) => {
  const r = resumen3(p, "SICOM"); if (!r) return null;
  const det = rc(p).detalle_deuda_actual_sicom ?? []; const m = det.map(corteISO).sort().pop();
  return igual(S(det.filter((f) => corteISO(f) === m), "saldo_deuda"), r.total);
});
const cortes = new Set(); for (const p of P) for (const f of rc(p).detalle_deuda_actual_sicom ?? []) cortes.add(String(f.fecha_corte));
console.log(`cortes distintos en el detalle comercial de reporteCrediticio: ${cortes.size} (${[...cortes].join(" | ")})`);

console.log("\nD. Titular, codeudor y garante: ¿Equifax separa por rol lo que dice separar?");
contar("riesgo DIRECTO de 'Saldo Deuda' = Σ de lo que es TITULAR", (p) => { const c = compo(p, "Saldo Deuda"); return c ? igual(S(rcTodas(p).filter(esTitular), "saldo_deuda"), c.RiesgoDirecto) : null; });
contar("riesgo DIRECTO de 'Saldo Deuda' = Σ de TODAS las operaciones", (p) => { const c = compo(p, "Saldo Deuda"); return c ? igual(S(rcTodas(p), "saldo_deuda"), c.RiesgoDirecto) : null; });
contar("riesgo DIRECTO de 'Saldo Deuda' = Σ de lo que es TITULAR en interconnectResponse", (p) => { const c = compo(p, "Saldo Deuda"); return c ? igual(S(irTodas(p).filter(esTitular), "Saldo_Deuda"), c.RiesgoDirecto) : null; });
contar("Composicion: total = directo + indirecto", (p) => { const c = compo(p, "Saldo Deuda"); return c ? igual(c.Total, c.RiesgoDirecto + c.RiesgoIndirecto) : null; });
contar("resumen de los 3 sistemas = Σ de TODAS las operaciones (titular o no)", (p) => igual(S(rcTodas(p), "saldo_deuda"), S(rc(p).valor_deuda_3_sistemas, "total")));
contar("resumen de los 3 sistemas = Σ sólo de TITULAR", (p) => igual(S(rcTodas(p).filter(esTitular), "saldo_deuda"), S(rc(p).valor_deuda_3_sistemas, "total")));
const conOtroRol = P.filter((p) => rcTodas(p).some((f) => !esTitular(f))).length;
console.log(`personas con alguna operación donde NO son titulares (codeudor o garante): ${conOtroRol} de ${P.length}`);
const roles = new Set(); for (const p of P) for (const f of rcTodas(p)) roles.add(f.tipo_riesgo);
console.log(`valores de tipo_riesgo (ojo con las mayúsculas): ${[...roles].join(" | ")}`);

console.log("\nE. Scores");
contar("score 'Actual' del histórico = score vigente", (p) => { const h = rc(p).historico_score?.find((x) => x.retroactivo === "Actual"); const s = rc(p).score?.[0]; return h && s ? Number(h.score) === Number(s.score) : null; });
contar("ScoreV4 de interconnectResponse = score vigente", (p) => { const s = rc(p).score?.[0]; const v = ir(p).ResultadoSegmentacion?.ScoreV4; return s && v !== undefined ? String(v) === String(s.score) : null; });
contar("score dentro de su banda (score_min a score_max)", (p) => { const s = rc(p).score?.[0]; return s ? s.score >= s.score_min && s.score <= s.score_max : null; });

console.log("\nF. Filas fantasma de totales (lo que pasó con Aval)");
let fantasmas = 0;
for (const p of P) for (const f of rcTodas(p)) {
  const inst = String(f.institucion ?? "").toUpperCase();
  if (inst === "TOTAL" || inst === "-" || inst === "" || String(f.tipo_credito).toUpperCase() === "TOTAL") fantasmas++;
}
console.log(`filas de detalle con institución o tipo "TOTAL", "-" o vacío: ${fantasmas}`);

console.log("\nG. El tamaño de la historia mensual que habría que guardar normalizada");
const hist = P.map((p) => ["sb", "seps", "sicom"].reduce((a, s) => a + (rc(p)[`detalle_deuda_historica_${s}`]?.length ?? 0), 0));
console.log(`filas por persona (bancos + cooperativas + comercial): mínimo ${Math.min(...hist)}, promedio ${Math.round(hist.reduce((a, b) => a + b, 0) / hist.length)}, máximo ${Math.max(...hist)}`);
const meses = new Set(); for (const p of P) for (const f of rc(p).detalle_deuda_historica_sb ?? []) meses.add(String(f.fecha_corte).slice(0, 10));
console.log(`cortes mensuales distintos en la historia de bancos: ${meses.size}`);
