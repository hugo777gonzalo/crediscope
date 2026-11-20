// La medición de E9 (docs/capa-de-hechos.md, secciones 6 y 10): por cada punto donde dos fuentes
// hablan de lo mismo, cuántas personas tienen la diferencia y, para cada regla «propuesta», cuántas
// cambiarían y en qué si el negocio la aprueba. No cambia nada: mide para que el negocio decida.
//
// Cada diferencia nueva se mide además con un criterio DISTINTO del de su regla
// (supabase/CLAUDE.md, «Crudo de Proveedor_Info_1»): la deuda de la institución contra la lista de
// bancos de OTRA persona (lo que sale al azar) y a 5% sin la ventana de la cuota; el PEP por
// empresa y sueldo; la multa por placa y monto.
//
// Las propuestas:
//   - 7, unificar «obligado a llevar contabilidad»: las personas con dif.ing.obligado.
//   - 8, pensión: que mande el registro más reciente si la fuente trae una fecha. Se cuenta cuántos
//     registros traen una fecha.
//   - 10, PEP: comparar la fecha como fecha. Se cuenta en cuántas personas cambia el más reciente.
//   - 13, educación: que mande el título registrado. Se cuenta en cuántas cambia el nivel, y hacia dónde.
//   - 15, el reloj: el perfil armado con la fecha de la consulta contra el armado hoy. Lo que cambia
//     es lo que un recálculo de hoy le mueve a un perfil, sin que cambie el crudo.
//   - 16, el buró: dif.end.bancos con la última consulta de Equifax de cada persona (la que lee el
//     análisis). Sin estructura guardada, se deriva en memoria del crudo con derivarLaConsulta(),
//     sin escribir. Se cuenta aparte la que está a 31 días o menos del perfil: con más, las dos
//     fotos son de meses distintos y la diferencia no dice nada de las fuentes.
//
// SÓLO LEE. Con --deposito, el último perfil de cada persona real y su crudo (la carpeta y, lo que
// falte, Storage) y las consultas de Equifax ya guardadas (consultas_equifax y su crudo en Storage).
// No llama a Proveedor_Info_1, a Equifax ni al modelo, y no escribe en la base. El detalle, con
// montos, va a research/medir-conciliacion/ (fuera de git); por consola, conteos y referencias
// c-xxxxxxxx.
//
// Uso: node scripts/medir-conciliacion.mjs [--deposito] [--carpeta=...] [--limite=N] [--sin-buro]
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo con --limite=20.

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath, pathToFileURL } from "node:url";
import { candidatosDelUltimoPerfil, leerCrudo } from "./_comun/crudo-del-ultimo-perfil.mjs";
import { cargarEntorno, raizPrincipal } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(process.argv.slice(2).map((a) => {
  const [k, ...v] = a.replace(/^--/, "").split("=");
  return [k, v.length ? v.join("=") : true];
}));
const PRINCIPAL = raizPrincipal(RAIZ);
const CARPETA = path.resolve(PRINCIPAL, typeof args.carpeta === "string" ? args.carpeta : "research/proveedor-info-1-raw-2026-10-03");
const LIMITE = args.limite ? Number(args.limite) : Infinity;
const importar = (ruta) => import(pathToFileURL(path.join(RAIZ, ruta)).href);
const { derivarHechos, GRUPOS } = await importar("supabase/functions/_shared/hechos/indice.ts");
const { diferenciaDeBancosConElBuro } = await importar("supabase/functions/_shared/hechos/conciliacion-con-el-buro.ts");
const { buildStandardProfile } = await importar("supabase/functions/_shared/process.ts");
const { CORTE_IESS_CONOCIDO } = await importar("supabase/functions/_shared/fuentes-ingreso.ts");
const { derivarLaConsulta } = await importar("supabase/functions/_shared/equifax-persistencia.ts");

// ---- De dónde salen los crudos (como comparar-hechos.mjs) ----

let candidatos;
let pedir = null;
let cabeceras = null;
if (args.deposito) {
  cargarEntorno(RAIZ);
  cabeceras = { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` };
  pedir = async (ruta) => {
    const r = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${ruta}`, { headers: cabeceras });
    const texto = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 300)}`);
    return JSON.parse(texto);
  };
  const paginar = async (base, campo = "id") => {
    const filas = [];
    for (let despues = null; ;) {
      const pagina = await pedir(`${base}&order=${campo}&limit=1000${despues ? `&${campo}=gt.${despues}` : ""}`);
      filas.push(...pagina);
      if (pagina.length < 1000) return filas;
      despues = pagina.at(-1)[campo];
    }
  };
  const sinteticas = new Set((await paginar("clients?select=id&es_sintetico=eq.true")).map((f) => f.id));
  const ultimoPorCliente = new Map();
  for (const p of await paginar("client_profiles?select=id,client_id,created_at,crudo_ruta")) {
    if (sinteticas.has(p.client_id)) continue;
    const a = ultimoPorCliente.get(p.client_id);
    if (!a || p.created_at > a.created_at) ultimoPorCliente.set(p.client_id, p);
  }
  const r = candidatosDelUltimoPerfil(CARPETA, ultimoPorCliente);
  console.log(`Personas reales: ${ultimoPorCliente.size}; crudo en la carpeta ${r.cuenta.enLaCarpeta}, en el depósito ${r.cuenta.delDeposito}, sin crudo ${r.cuenta.sinCrudo}.`);
  const clientePorPerfil = new Map([...ultimoPorCliente.values()].map((p) => [p.id, p.client_id]));
  candidatos = r.candidatos.map((c) => ({ ...c, clientId: clientePorPerfil.get(c.perfilId), cita: `c-${clientePorPerfil.get(c.perfilId).slice(0, 8)}`, leer: () => leerCrudo(c, process.env.SUPABASE_URL, cabeceras) }));
} else {
  candidatos = fs.readdirSync(CARPETA).filter((a) => a.endsWith(".json")).map((a) => ({ archivo: path.join(CARPETA, a), leer: () => leerCrudo({ archivo: path.join(CARPETA, a) }) }));
}
candidatos = candidatos.slice(0, LIMITE);

// La última consulta de Equifax de cada persona, con lo necesario para tener su estructura.
const equifaxDe = new Map();
if (args.deposito && !args["sin-buro"]) {
  for (let despues = null; ;) {
    const filas = await pedir(`consultas_equifax?select=id,client_id,identificacion,created_at,ambiente,crudo_ruta,http_equifax,bancos:estructura->deudaActualTitular->bancos->saldoDeudaUsd,con_estructura:estructura->>version&ambiente=eq.produccion&client_id=not.is.null&order=id&limit=1000${despues ? `&id=gt.${despues}` : ""}`);
    for (const f of filas) {
      const a = equifaxDe.get(f.client_id);
      if (!a || f.created_at > a.created_at) equifaxDe.set(f.client_id, f);
    }
    if (filas.length < 1000) break;
    despues = filas.at(-1).id;
  }
}
async function estructuraDe(fila) {
  // Con la estructura guardada basta la cifra; sin ella, se deriva del crudo en memoria.
  if (fila.con_estructura) return { deudaActualTitular: { bancos: { saldoDeudaUsd: fila.bancos } } };
  let crudo;
  if (fila.crudo_ruta) {
    const r = await fetch(`${process.env.SUPABASE_URL}/storage/v1/object/crudo-equifax-migrado/${fila.crudo_ruta}`, { headers: cabeceras });
    if (!r.ok) throw new Error(`Storage contestó ${r.status}`);
    crudo = JSON.parse(zlib.gunzipSync(Buffer.from(await r.arrayBuffer())).toString("utf8"));
  } else {
    const [conCrudo] = await pedir(`consultas_equifax?select=respuesta_cruda&id=eq.${fila.id}`);
    crudo = conCrudo?.respuesta_cruda;
  }
  return derivarLaConsulta(crudo, fila).estructura;
}

// ---- Ayudantes ----

function armarEnFecha(instante, fn) {
  const DateReal = globalThis.Date;
  const fijo = new DateReal(instante).getTime();
  class DateFijo extends DateReal {
    constructor(...a) { super(...(a.length ? a : [fijo])); }
    static now() { return fijo; }
  }
  globalThis.Date = DateFijo;
  try { return fn(); } finally { globalThis.Date = DateReal; }
}
const canonico = (v) => JSON.stringify(v, (_, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));
const n = (v) => (v === null || v === undefined || v === "" || Number.isNaN(Number(v)) ? 0 : Number(v));
const deudaBanco = (r) => n(r.saldoVigente) + (n(r.saldomora) > 0 ? n(r.saldomora) : n(r.mora)) + n(r.noDevengaInteres) + n(r.judicial) + n(r.castigo);
const lista = (raw, fuente, campo) => (Array.isArray(raw?.[fuente]?.data?.[campo]) ? raw[fuente].data[campo] : []);
const norm = (v) => String(v ?? "").trim().toUpperCase().replace(/\s+/g, " ");
const sumar = (m, k, x = 1) => { m[k] = (m[k] ?? 0) + x; };
const HOY = new Date().toISOString();

// ---- La corrida ----

const m = {
  personas: 0,
  diferencias: {}, // código -> { personas, total, revisar, refs }
  inst: { conVigente: 0, regla: 0, alAzar: 0, a5: 0, a5SinRegla: 0, reglaSin5: 0, porSuma: 0, entidades: {} },
  pep: { conPep: 0, enLasDos: 0, regla: 0, porEmpresaYSueldo: 0, fechasNoIso: 0, cambiaElMasReciente: 0 },
  tra: { ant: 0, amt: 0, emovConInfracciones: 0, emovMultas: 0, emovConFecha: 0, emovMismaPlacaYMontoQueAnt: 0, lasDos: 0, regla: 0, porPlacaYMonto: 0 },
  edu: { conTitulo: 0, distinto: 0, tituloMasAlto: 0, registroMasAlto: 0, pares: {} },
  pension: { registros: 0, conFecha: 0 },
  obligado: 0,
  reloj: { personas: 0, campos: {} },
  buro: { conEquifax: 0, comparadas: 0, a31dias: 0, revisar: 0, revisar31: 0, relativas: [], relativas31: [], sinBancos: 0, fallas: 0, refs: [] },
};
const refs = { inst: [], pep: [], tra: [], edu: [], reloj: [] };
let bancosAnteriores = null; // la lista de bancos de la persona anterior: el azar del punto 3

const historial = { historialConLaInstitucion: GRUPOS.historialConLaInstitucion };
for (let i = 0; i < candidatos.length; i += 25) {
  const lote = candidatos.slice(i, i + 25);
  const crudos = await Promise.all(lote.map((c) => c.leer().catch((e) => ({ error: e.message }))));
  for (const [j, c] of lote.entries()) {
    const crudo = crudos[j];
    if (crudo.error || !crudo.raw || !crudo.capturadoEl || (c.perfilId && crudo.perfilId !== c.perfilId)) continue;
    m.personas++;
    const raw = crudo.raw;
    const ref = c.cita ?? `p-${String(crudo.perfilId ?? "x").slice(0, 8)}`;
    const contexto = { cedula: crudo.cedula, consulta: crudo.perfilId ?? "sin-perfil", fechaDeLaConsulta: crudo.capturadoEl, corteIess: CORTE_IESS_CONOCIDO, persona: { nombre: null, fechaDeNacimiento: null } };
    const doc = derivarHechos(raw, contexto, { estricto: true });
    const vistos = new Set();
    for (const d of doc.diferencias) {
      const x = (m.diferencias[d.codigo] ??= { personas: 0, total: 0, revisar: 0 });
      x.total++;
      if (d.lectura === "revisar") x.revisar++;
      if (!vistos.has(d.codigo)) { vistos.add(d.codigo); x.personas++; }
    }
    const tiene = (codigo) => vistos.has(codigo);

    // Punto 3: la regla, la misma regla contra los bancos de otra persona, y a 5% sin cuota.
    const vigentes = (raw.basesInternas?.data?.personasIncumplimientos ?? []).filter((o) => norm(o.estadoOperacion) !== "CANCELADA" && n(o.saldoCapital) > 0);
    const bancos = [...lista(raw, "buroCreditoSuper", "datosSuper"), ...lista(raw, "buroCreditoDiners", "datosSuper")];
    if (vigentes.length) {
      m.inst.conVigente++;
      const regla = tiene("dif.inst.posible_en_bancos");
      if (regla) {
        m.inst.regla++;
        if (refs.inst.length < 5) refs.inst.push(ref);
        for (const d of doc.diferencias.filter((x) => x.codigo === "dif.inst.posible_en_bancos")) {
          if (d.sobre === "inst.operaciones.vigentes") m.inst.porSuma++;
          const fila = lista(raw, d.cede[0].registro.fuente, "datosSuper")[d.cede[0].registro.indice];
          sumar(m.inst.entidades, norm(fila?.entnombre) || "sin nombre");
        }
      }
      if (bancosAnteriores) {
        const mezcla = { basesInternas: raw.basesInternas, buroCreditoSuper: bancosAnteriores.s, buroCreditoDiners: bancosAnteriores.d };
        if (derivarHechos(mezcla, contexto, { estricto: true, grupos: historial }).diferencias.length) m.inst.alAzar++;
      }
      const propias = bancos.filter((b) => b.riesgo !== "G" && b.riesgo !== "C");
      const a5 = vigentes.some((o) => propias.some((b) => deudaBanco(b) > 0 && Math.abs(deudaBanco(b) - n(o.saldoCapital)) <= 0.05 * n(o.saldoCapital)));
      if (a5) m.inst.a5++;
      if (a5 && !regla) m.inst.a5SinRegla++;
      if (regla && !a5) m.inst.reglaSin5++;
    }
    if (raw.buroCreditoSuper || raw.buroCreditoDiners) bancosAnteriores = { s: raw.buroCreditoSuper, d: raw.buroCreditoDiners };

    // Punto 10: PEP.
    const pepA = lista(raw, "listasControl", "personaPublicasOpr");
    const pepB = lista(raw, "basesInternas", "tpeps");
    if (pepA.length || pepB.length) m.pep.conPep++;
    if (pepA.length && pepB.length) m.pep.enLasDos++;
    if (tiene("dif.cum.pep.repetido")) { m.pep.regla++; if (refs.pep.length < 5) refs.pep.push(ref); }
    if (pepA.some((a) => pepB.some((b) => norm(a.empresa) && norm(a.empresa) === norm(b.empresaSector) && n(a.sueldo) === n(b.sueldo)))) m.pep.porEmpresaYSueldo++;
    const todasPep = [...pepA, ...pepB];
    m.pep.fechasNoIso += todasPep.filter((r) => r.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha))).length;
    if (todasPep.length) {
      const porTexto = [...todasPep].sort((a, b) => String(b.fecha ?? "").localeCompare(String(a.fecha ?? "")))[0];
      const comoFecha = (r) => { const t = Date.parse(String(r.fecha ?? "")); return Number.isNaN(t) ? -Infinity : t; };
      const porFecha = [...todasPep].sort((a, b) => comoFecha(b) - comoFecha(a))[0];
      if (canonico(porTexto) !== canonico(porFecha)) m.pep.cambiaElMasReciente++;
    }

    // Punto 12: multas.
    const ant = lista(raw, "deudasAnt", "deudaAnts");
    const amt = lista(raw, "deudasAmt", "deudaAmt");
    if (ant.length) m.tra.ant++;
    if (amt.length) m.tra.amt++;
    // EMOV trae las multas en `infraccion` (con la placa en detalleRubro y, hasta hoy, sin fecha):
    // sin el día no hay regla; se cuenta cuántas tienen la placa y el monto de una de la ANT.
    const deEmov = lista(raw, "deudasEmov", "deudaEmov").flatMap((r) => (Array.isArray(r.infraccion) ? r.infraccion : []));
    if (deEmov.length) m.tra.emovConInfracciones++;
    m.tra.emovMultas += deEmov.length;
    m.tra.emovConFecha += deEmov.filter((x) => String(x?.detalleRubro?.fecha ?? "").trim()).length;
    const placaDe = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (deEmov.some((x) => ant.some((a) => placaDe(a.placa) && placaDe(a.placa) === placaDe(x?.detalleRubro?.placa) && Math.abs(n(a.total) - n(x.total)) <= 0.05 * Math.max(n(a.total), n(x.total))))) m.tra.emovMismaPlacaYMontoQueAnt++;
    if (ant.length && amt.length) m.tra.lasDos++;
    if (tiene("dif.tra.posible_repetida")) { m.tra.regla++; if (refs.tra.length < 5) refs.tra.push(ref); }
    const placa = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (ant.some((a) => amt.some((b) => placa(a.placa) && placa(a.placa) === placa(b.placa) && Math.abs(n(a.total) - n(b.total)) <= 0.05 * Math.max(n(a.total), n(b.total))))) m.tra.porPlacaYMonto++;

    // Punto 13: educación. La diferencia trae los dos niveles; con signo, el título más alto.
    const nivelesTitulo = lista(raw, "titulos", "titulos").map((t) => t?.titulo?.nivelEducacion?.nivel).filter((x) => x !== undefined && x !== null);
    if (nivelesTitulo.length) m.edu.conTitulo++;
    const edu = doc.diferencias.find((d) => d.codigo === "dif.ide.nivel_de_educacion");
    if (edu) {
      m.edu.distinto++;
      if (edu.magnitud.absoluta > 0) m.edu.tituloMasAlto++;
      else m.edu.registroMasAlto++;
      sumar(m.edu.pares, `${edu.manda.valor} -> ${edu.cede[0].valor}`);
      if (refs.edu.length < 5) refs.edu.push(ref);
    }

    // Punto 8: ¿la pensión trae fecha?
    for (const k of ["pensionAlimenticia", "pensionAlimenticiaProveedorInfo1"]) {
      for (const r of lista(raw, k, "supas")) {
        m.pension.registros++;
        if (Object.keys(r).some((c) => /fecha/i.test(c) && r[c])) m.pension.conFecha++;
      }
    }

    // Punto 7.
    if (tiene("dif.ing.obligado")) m.obligado++;

    // Punto 15: el perfil con el reloj de la consulta contra el de hoy.
    const conConsulta = armarEnFecha(crudo.capturadoEl, () => buildStandardProfile(raw, crudo.cedula, undefined).profile);
    const conHoy = armarEnFecha(HOY, () => buildStandardProfile(raw, crudo.cedula, undefined).profile);
    let cambia = false;
    // `consultadoEn` es la hora del armado, no una edad: cambia siempre y no se cuenta.
    for (const g of new Set([...Object.keys(conConsulta), ...Object.keys(conHoy)].filter((k) => k !== "consultadoEn"))) {
      const a = conConsulta[g], b = conHoy[g];
      if (a && b && typeof a === "object" && !Array.isArray(a)) {
        for (const campo of new Set([...Object.keys(a), ...Object.keys(b)])) {
          if (canonico(a[campo]) !== canonico(b[campo])) { sumar(m.reloj.campos, `${g}.${campo}`); cambia = true; }
        }
      } else if (canonico(a) !== canonico(b)) { sumar(m.reloj.campos, g); cambia = true; }
    }
    if (cambia) { m.reloj.personas++; if (refs.reloj.length < 5) refs.reloj.push(ref); }

    // Punto 16.
    const eq = c.clientId ? equifaxDe.get(c.clientId) : null;
    if (eq && eq.http_equifax === 200) {
      m.buro.conEquifax++;
      try {
        const estructura = await estructuraDe(eq);
        const d = diferenciaDeBancosConElBuro(doc, { proveedor: "equifax", estructura }, eq.id);
        if (!d) m.buro.sinBancos++;
        else {
          m.buro.comparadas++;
          const dias = Math.abs(Date.parse(eq.created_at) - Date.parse(crudo.capturadoEl)) / 86_400_000;
          const relativa = d.magnitud.relativa ?? (d.magnitud.absoluta ? 1 : 0);
          m.buro.relativas.push(relativa);
          if (d.lectura === "revisar") m.buro.revisar++;
          if (dias <= 31) {
            m.buro.a31dias++;
            m.buro.relativas31.push(relativa);
            if (d.lectura === "revisar") { m.buro.revisar31++; if (m.buro.refs.length < 5) m.buro.refs.push(ref); }
          }
        }
      } catch {
        m.buro.fallas++;
      }
    }
  }
}

// ---- El informe ----

const fmt = (x) => x.toLocaleString("es-EC");
const pct = (a, b) => (b ? `${(Math.round((a / b) * 1000) / 10).toLocaleString("es-EC")}%` : "sin medir");
const percentil = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const reparto = (v) => (v.length ? `mediana ${pct(percentil(v, 0.5), 1)}, p90 ${pct(percentil(v, 0.9), 1)}; a 5% o menos ${fmt(v.filter((x) => x <= 0.05).length)}, más de 50% ${fmt(v.filter((x) => x > 0.5).length)}` : "sin pares");
console.log(`\nPersonas: ${fmt(m.personas)}.`);
console.log("Diferencias por código:");
for (const [k, x] of Object.entries(m.diferencias).sort(([a], [b]) => (a < b ? -1 : 1))) console.log(`  ${k}: ${fmt(x.total)} en ${fmt(x.personas)} personas; ${fmt(x.revisar)} para revisar`);
const I = m.inst;
console.log(`3, institución en bancos: ${fmt(I.regla)} de ${fmt(I.conVigente)} personas con una vigente con saldo (${fmt(I.porSuma)} por la suma de dos o más); con los bancos de otra persona, ${fmt(I.alAzar)}. A 5% sin cuota: ${fmt(I.a5)} (${fmt(I.a5SinRegla)} que la regla no toma, ${fmt(I.reglaSin5)} que toma y a 5% no). (${refs.inst.join(", ")})`);
console.log(`  Entidad de la fila candidata más cercana: ${Object.entries(I.entidades).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([e, k]) => `${e} ${fmt(k)}`).join(", ")}`);
const P = m.pep;
console.log(`10, PEP: ${fmt(P.conPep)} personas con PEP, ${fmt(P.enLasDos)} en las dos listas; la regla (cargo y fecha) en ${fmt(P.regla)}; por empresa y sueldo, ${fmt(P.porEmpresaYSueldo)}. Fechas que no son aaaa-mm-dd: ${fmt(P.fechasNoIso)}. Propuesta (fecha como fecha): cambia el más reciente en ${fmt(P.cambiaElMasReciente)}. (${refs.pep.join(", ")})`);
const T = m.tra;
console.log(`12, multas: ANT en ${fmt(T.ant)}, AMT en ${fmt(T.amt)}, las dos en ${fmt(T.lasDos)}; EMOV con multas en el detalle: ${fmt(T.emovConInfracciones)} personas, ${fmt(T.emovMultas)} multas, ${fmt(T.emovConFecha)} con fecha; con la placa y el monto de una de la ANT: ${fmt(T.emovMismaPlacaYMontoQueAnt)} personas. La regla (placa y día): ${fmt(T.regla)}; por placa y monto a 5%: ${fmt(T.porPlacaYMonto)}. (${refs.tra.join(", ")})`);
const E = m.edu;
console.log(`13, educación: ${fmt(E.conTitulo)} con un título con nivel; distinto del registro civil en ${fmt(E.distinto)} (título más alto ${fmt(E.tituloMasAlto)}, registro civil más alto ${fmt(E.registroMasAlto)}). (${refs.edu.join(", ")})`);
for (const [par, k] of Object.entries(E.pares).sort((a, b) => b[1] - a[1])) console.log(`    ${par}: ${fmt(k)}`);
console.log(`8, pensión: ${fmt(m.pension.registros)} registros, ${fmt(m.pension.conFecha)} con alguna fecha.`);
console.log(`7, obligado: ${fmt(m.obligado)} personas con dif.ing.obligado.`);
console.log(`15, el reloj: armado hoy (${HOY.slice(0, 10)}) contra la fecha de la consulta, cambia en ${fmt(m.reloj.personas)} personas. (${refs.reloj.join(", ")})`);
for (const [campo, k] of Object.entries(m.reloj.campos).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`    ${campo}: ${fmt(k)}`);
const B = m.buro;
if (args.deposito && !args["sin-buro"]) {
  console.log(`16, buró: ${fmt(B.conEquifax)} personas con una consulta de Equifax; comparadas ${fmt(B.comparadas)} (sin bancos de Proveedor_Info_1 o sin la cifra: ${fmt(B.sinBancos)}; no se pudo leer: ${fmt(B.fallas)}).`);
  console.log(`  Todas: ${reparto(B.relativas)}; una en cero y la otra no: ${fmt(B.revisar)}.`);
  console.log(`  A 31 días o menos del perfil: ${fmt(B.a31dias)}; ${reparto(B.relativas31)}; una en cero y la otra no: ${fmt(B.revisar31)}. (${B.refs.join(", ")})`);
} else console.log("16, buró: sin medir (hace falta --deposito).");

const destino = path.join(PRINCIPAL, "research", "medir-conciliacion");
fs.mkdirSync(destino, { recursive: true });
const archivo = path.join(destino, `medir-conciliacion-${HOY.replace(/[-:]/g, "").replace("T", "-").slice(0, 15)}.json`);
fs.writeFileSync(archivo, JSON.stringify({ ...m, buro: { ...B, relativas: undefined, relativas31: undefined } }, null, 1));
console.log(`Detalle (fuera de git): ${path.relative(PRINCIPAL, archivo)}`);
