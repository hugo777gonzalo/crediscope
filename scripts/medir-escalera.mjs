// La medición en seco de la escalera del ingreso (F10, docs/escalera-del-ingreso.md, sección 5, paso 3).
//
// Por cada persona real (sin las sintéticas de Aval), con su ÚLTIMO perfil guardado y SIN buró (el
// escenario que se diseña primero; con buró no se mide acá):
//   1. cuántas tienen cada peldaño, por tipo de persona;
//   2. el veredicto de la escalera contra la capacidad de HOY (`conIngresoDeclarado()` + `evaluarCapacidad()`),
//      cuántos cambian y por qué: el declarado que ya no reemplaza al sueldo (D4), el aporte propio que ya
//      no se suma al sueldo (D3), el aporte en el Ingreso Mínimo SBU que vale por el SBU del año, u otra causa;
//   3. la cobertura de la cota por cuotas contra el sueldo neto del IESS de los dependientes (solicitantes sin filtrar);
//   4. la capacidad máxima informativa: cuántas personas la tienen y cuánto sube el monto máximo contra el del
//      peldaño que sostiene (o contra cero si ninguno sostiene).
//
// El crédito es el de la solicitud más reciente de la persona que trae monto, plazo, tasa e Ingreso declarado y, para
// todos los demás, el de referencia del estándar (USD 5.000 a 36 meses) con la Tasa máxima del producto. El Ingreso
// declarado sólo existe donde hay una solicitud: es lo que permite medir D4.
//
// SOLO LEE. No llama a Proveedor_Info_1, a Equifax ni al modelo, y no escribe en la base. Por consola sólo conteos:
// ningún dato de una persona.
//
// F11 (pasos 4 y 5): la renta como 3b y el predictor como peldaño 4 (y 6 si el mínimo no pasa de USD 1.000), con el modelo vigente
// del nivel 1 (sólo lee: se baja del depósito privado). Además: cuántas personas tienen renta reciente, que el predictor da lo mismo
// que en origin/main (el código no se toca: se compara armarEstimacion() de los dos lados, persona por persona), que el 4 no cambia
// ninguna capacidad con su fracción en 0%, y la capacidad máxima con la estimación central y, de comparación, con el mínimo certificado.
//
// Uso: node scripts/medir-escalera.mjs [--limite=N] [--contra=origin/main]
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo con --limite=50 antes de confiar en los números.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cargarEntorno } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMITE = Number(process.argv.find((a) => a.startsWith("--limite="))?.slice(9) ?? Infinity);
const modulo = (archivo) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", archivo)).href);
const { conIngresoDeclarado, datosDeCapacidad, evaluarCapacidad, evaluarEscalera } = await modulo("capacidad-de-pago.ts");
const { armarIngresoDelPerfil } = await modulo("escalera-del-ingreso.ts");
const ahoraEstimacion = await modulo("estimacion-de-ingreso.ts");
const { PRODUCTO_CONSUMO, simularCredito } = await modulo("simulador-credito.ts");

cargarEntorno(RAIZ);
const U = process.env.SUPABASE_URL;
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}` };
async function pedir(ruta) {
  const r = await fetch(`${U}/rest/v1/${ruta}`, { headers: H });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 400)}`);
  return JSON.parse(texto);
}
// PostgREST corta en 1.000: se pagina por id.
async function todas(tabla, select, filtro = "") {
  const filas = [];
  let despues = null;
  for (;;) {
    const p = await pedir(`${tabla}?select=${select}${filtro}&order=id&limit=1000${despues ? `&id=gt.${despues}` : ""}`);
    filas.push(...p);
    if (p.length < 1000) return filas;
    despues = p.at(-1).id;
  }
}

const miles = (n) => Math.round(n).toLocaleString("es-EC");
const pct = (a, b) => (b === 0 ? "0%" : `${Math.round((a / b) * 1000) / 10}%`.replace(".", ","));
const mediana = (v) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
const percentil = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const suma = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };

// ---- las personas y su último perfil ----
const sinteticas = new Set((await todas("clients", "id", "&es_sintetico=eq.true")).map((c) => c.id));
const ultimo = new Map();
for (const p of await todas("client_profiles", "id,client_id,created_at")) {
  if (sinteticas.has(p.client_id)) continue;
  const a = ultimo.get(p.client_id);
  if (!a || p.created_at > a.created_at) ultimo.set(p.client_id, p);
}
// La solicitud más reciente de cada persona con Ingreso declarado y condiciones.
const solicitudPorPersona = new Map();
for (const s of await todas("solicitudes", "id,identificacion,client_id,creada_el,monto,plazo_meses,tasa_nominal_anual,ingreso_declarado", "&ingreso_declarado=not.is.null&client_id=not.is.null&monto=not.is.null")) {
  if (!String(s.identificacion ?? "").startsWith("00")) {
    const a = solicitudPorPersona.get(s.client_id);
    if (!a || s.creada_el > a.creada_el) solicitudPorPersona.set(s.client_id, s);
  }
}
const elegidos = [...ultimo.values()].slice(0, LIMITE);
console.log(`Personas reales: ${miles(ultimo.size)} (medidas: ${miles(elegidos.length)}); con solicitud que trae Ingreso declarado: ${miles([...solicitudPorPersona.keys()].filter((c) => ultimo.has(c)).length)}.`);

// El predictor: el modelo vigente del nivel 1 y, para comparar, el código de --contra (por omisión origin/main).
const CONTRA = process.argv.find((a) => a.startsWith("--contra="))?.slice(9) ?? "origin/main";
const git = (...a) => execFileSync("git", ["-C", RAIZ, ...a], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
const sello = git("rev-parse", "--short=12", CONTRA).trim();
const destino = path.join(os.tmpdir(), `medir-escalera-${sello}`);
for (const archivo of git("ls-tree", "-r", "--name-only", CONTRA, "supabase/functions/_shared").split("\n").filter((a) => a && !a.endsWith(".test.ts"))) {
  const salida = path.join(destino, archivo);
  if (fs.existsSync(salida)) continue;
  fs.mkdirSync(path.dirname(salida), { recursive: true });
  fs.writeFileSync(salida, execFileSync("git", ["-C", RAIZ, "show", `${CONTRA}:${archivo}`], { maxBuffer: 64 * 1024 * 1024 }));
}
const antesEstimacion = await import(pathToFileURL(path.join(destino, "supabase/functions/_shared/estimacion-de-ingreso.ts")).href);
const [filaModelo] = await pedir("modelos_de_ingreso?select=id,version,nivel,huella_sha256,ruta_archivo,poblacion,calibracion&nivel=eq.1&estado=eq.vigente");
let vigente = null;
if (filaModelo) {
  const cargar = ahoraEstimacion.crearCargadorDeModelo(async (ruta) => {
    const r = await fetch(`${U}/storage/v1/object/modelos-de-ingreso/${ruta}`, { headers: H });
    if (!r.ok) throw new Error(`El depósito contestó ${r.status} al bajar el modelo`);
    return new Uint8Array(await r.arrayBuffer());
  });
  vigente = await cargar(filaModelo);
}
console.log(vigente ? `Predictor: modelo ${filaModelo.version} (nivel 1, ${filaModelo.calibracion ? "calibrado" : "con la calibración del archivo"}); código de comparación ${CONTRA} (${sello}).` : "Predictor: no hay un modelo vigente del nivel 1; se mide sin él.");

const REFERENCIA = { monto: 5000, plazoMeses: 36, tasaNominalAnualPorcentaje: PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje };

// ---- la corrida ----
const porTipo = {}; // tipo -> { personas, peldanos: {n: con_monto}, sostiene: {n: personas}, cambian }
const transiciones = {}; // "hoy -> escalera": personas
const causas = {}; // causa: personas
const causasPorTipo = {};
const rentaCuenta = { conRenta: 0, porTipo: {}, regimenSinVerificar: 0, mayorQueElSueldo: 0, cambianDeVeredicto: 0, cambianPorQueSostiene: 0 };
const predictor = {
  conModelo: 0, estados: {}, motivos: {}, porTipo: {}, pasaDe1000: 0, bajaAl6: 0, iguales: 0, distintos: 0, filasIguales: 0, filasDistintas: 0,
  invarianzaRota: 0, invarianzaComparadas: 0, declaradoCambia: 0,
  capMin: { personas: 0, sube: 0, mejoras: [], mejorasRelativas: [], deNoAlcanzaAAlcanza: 0, mejoraInforma: 0 },
  capCentral: { personas: 0, conCentral: 0, sube: 0, mejoras: [], mejorasRelativas: [], deNoAlcanzaAAlcanza: 0 },
};
const mixtos = { personas: 0, bajaElIngreso: 0, bajas: [], cambianDeVeredicto: 0 };
const cobertura = { dependientesConCota: 0, cotaCubierta: 0, conMoraOSinMedir: 0, dependientesConSueldo: 0 };
const capMax = { personas: 0, conSostiene: 0, sinOferta: 0, sube: 0, igual: 0, baja: 0, deNoAlcanzaAAlcanza: 0, mejoras: [], mejorasRelativas: [], porTipo: {} };
let medidas = 0;
let fallaron = 0;

for (let i = 0; i < elegidos.length; i += 50) {
  const lote = elegidos.slice(i, i + 50);
  const perfiles = await pedir(`client_profiles?select=id,client_id,created_at,standard_profile,estado_por_fuente&id=in.(${lote.map((p) => p.id).join(",")})`);
  for (const fila of perfiles) {
    const perfil = fila.standard_profile;
    const sol = solicitudPorPersona.get(fila.client_id);
    const condiciones = sol
      ? { monto: Number(sol.monto), plazoMeses: sol.plazo_meses, tasaNominalAnualPorcentaje: Number(sol.tasa_nominal_anual) }
      : REFERENCIA;
    const declarado = sol && sol.ingreso_declarado !== null ? Number(sol.ingreso_declarado) : null;
    try {
      // El reloj es el de la consulta, como el resto de los guiones de medición.
      const hoyDelPerfil = new Date(fila.created_at);
      const datosIess = datosDeCapacidad(perfil, null, hoyDelPerfil);
      const datosHoy = conIngresoDeclarado(datosIess, declarado);
      const cuota = simularCredito(condiciones);
      if (!cuota.ok) { fallaron++; continue; }
      const hoy = evaluarCapacidad({ ...datosHoy, cuotaNueva: cuota.simulacion.cuotaPrimerMes });
      const ingreso = armarIngresoDelPerfil(perfil, datosIess, { ingresoDeclarado: declarado });
      const r = evaluarEscalera({ datos: datosIess, ingreso, condiciones });
      medidas++;

      // La renta (3b): cuántas personas la tienen como cota y si cambia el veredicto contra hoy.
      const compRenta = ingreso.peldanos[2].componentes.find((c) => c.clave === "impuesto_a_la_renta");
      if (compRenta) {
        rentaCuenta.conRenta++;
        suma(rentaCuenta.porTipo, ingreso.tipoDePersona);
        if (compRenta.avisos.includes("regimen_sin_verificar")) rentaCuenta.regimenSinVerificar++;
        if (ingreso.peldanos[0].estado === "con_monto" && compRenta.montoMensual > ingreso.peldanos[0].ingresoNeto) rentaCuenta.mayorQueElSueldo++;
      }

      // El predictor (F11): el peldaño 4, el 6, que el predictor da lo mismo que en el código de comparación y que el 4 no cambia nada con 0%.
      if (vigente) {
        predictor.conModelo++;
        const decision = ahoraEstimacion.decidirEstimacion(perfil, fila.estado_por_fuente);
        const pedido = { id: "00000000-0000-4000-8000-000000000000", perfil, decision, consultadoEl: fila.created_at, ahora: new Date(fila.created_at), vigente };
        const { respuesta, fila: filaEstimacion } = ahoraEstimacion.armarEstimacion(pedido);
        const antes = antesEstimacion.armarEstimacion({ ...pedido, decision: antesEstimacion.decidirEstimacion(perfil, fila.estado_por_fuente) });
        if (JSON.stringify(respuesta) === JSON.stringify(antes.respuesta)) predictor.iguales++; else predictor.distintos++;
        if (JSON.stringify(filaEstimacion) === JSON.stringify(antes.fila)) predictor.filasIguales++; else predictor.filasDistintas++;

        const conPredictor = armarIngresoDelPerfil(perfil, datosIess, { ingresoDeclarado: declarado, estimacion: respuesta });
        const rp = evaluarEscalera({ datos: datosIess, ingreso: conPredictor, condiciones });
        const p4 = conPredictor.peldanos[3];
        suma(predictor.estados, p4.estado);
        if (p4.motivo) suma(predictor.motivos, p4.motivo);
        const pt = (predictor.porTipo[ingreso.tipoDePersona] ??= {});
        suma(pt, p4.estado === "con_monto" ? "con_monto" : conPredictor.peldanos[5].estado === "con_monto" ? "baja_al_6" : p4.estado);
        if (p4.estado === "con_monto") predictor.pasaDe1000++;
        if (conPredictor.peldanos[5].estado === "con_monto") predictor.bajaAl6++;
        // Con 0% el 4 no sostiene ni cambia la capacidad de los peldaños 1 a 3; sólo puede ampliar la coherencia de un declarado.
        if (declarado === null) {
          predictor.invarianzaComparadas++;
          const mismo = r.veredicto === rp.veredicto && JSON.stringify(r.ingreso.sostieneElCalculo) === JSON.stringify(rp.ingreso.sostieneElCalculo) && JSON.stringify(r.ingreso.oferta) === JSON.stringify(rp.ingreso.oferta);
          if (!mismo) predictor.invarianzaRota++;
        } else if (rp.veredicto !== r.veredicto) predictor.declaradoCambia++;

        // La capacidad máxima con el mínimo certificado (la comparación) y, más abajo, con la estimación central (la oficial).
        const cmMin = evaluarEscalera({ datos: datosIess, ingreso: { ...conPredictor, estimacionCentral: null }, condiciones }).ingreso.capacidadMaxima;
        if (cmMin) {
          predictor.capMin.personas++;
          const mejora = cmMin.mejoraDelMontoMaximo ?? 0;
          if (mejora > 0) {
            predictor.capMin.sube++;
            predictor.capMin.mejoras.push(mejora);
            const base = rp.ingreso.oferta?.montoMaximoAlPlazo ?? 0;
            if (base > 0) predictor.capMin.mejorasRelativas.push(mejora / base);
          }
          if (!["alcanza", "justo", "extendida"].includes(rp.veredicto) && ["alcanza", "justo"].includes(cmMin.veredicto)) predictor.capMin.deNoAlcanzaAAlcanza++;
        }
        // La capacidad máxima oficial (negocio, 2026-11-22) usa la estimación central; cmMin es la comparación con el mínimo certificado.
        const cmC = rp.ingreso.capacidadMaxima;
        if (cmC) {
          predictor.capCentral.personas++;
          if (conPredictor.estimacionCentral !== null) predictor.capCentral.conCentral++;
          const mejora = cmC.mejoraDelMontoMaximo ?? 0;
          if (mejora > 0) {
            predictor.capCentral.sube++;
            predictor.capCentral.mejoras.push(mejora);
            const base = rp.ingreso.oferta?.montoMaximoAlPlazo ?? 0;
            if (base > 0) predictor.capCentral.mejorasRelativas.push(mejora / base);
          }
          if (!["alcanza", "justo", "extendida"].includes(rp.veredicto) && ["alcanza", "justo"].includes(cmC.veredicto)) predictor.capCentral.deNoAlcanzaAAlcanza++;
        }
      }

      const t = (porTipo[ingreso.tipoDePersona] ??= { personas: 0, peldanos: {}, sostiene: {}, cambian: 0, sinMedir: 0 });
      t.personas++;
      for (const p of ingreso.peldanos) if (p.estado === "con_monto") suma(t.peldanos, p.numero);
      suma(t.sostiene, r.ingreso.sostieneElCalculo ? r.ingreso.sostieneElCalculo.numero : "ninguno");
      if (r.veredicto === "sin_medir") t.sinMedir++;

      // El veredicto de hoy y el de la escalera: sin_ingreso de hoy es lo mismo que sin_medir.
      const vHoy = hoy.veredicto === "sin_ingreso" ? "sin_medir" : hoy.veredicto;
      suma(transiciones, `${vHoy} -> ${r.veredicto}`);
      if (vHoy !== r.veredicto) {
        t.cambian++;
        const sueldos = datosIess.ingresos.filter((x) => x.tipo === "sueldo").length;
        const aportes = datosIess.ingresos.filter((x) => x.tipo === "aporte_propio");
        let causa = "otra";
        // Los aportes no contestaron (estructura-v31): hoy la capacidad lee el parcial; la escalera dice «no medido».
        if (Object.keys(perfil?.fuentesIngreso?.camposSinDato ?? {}).some((c) => c === "fuentes" || c === "segmento")) causa = "los aportes no contestaron: hoy lee el parcial y la escalera dice sin medir";
        else if (declarado !== null && datosHoy.ingresos[0]?.tipo === "declarado") causa = "D4: el declarado ya no reemplaza al ingreso del IESS";
        else if (sueldos > 0 && aportes.length > 0) causa = "D3: el aporte propio ya no se suma al sueldo";
        else if (aportes.some((x) => x.esIngresoMinimoSbu)) causa = "el aporte en el Ingreso Mínimo SBU vale por el SBU del año";
        else if (compRenta) causa = "la renta (3b) da un ingreso que hoy no se mide";
        suma(causas, causa);
        suma((causasPorTipo[ingreso.tipoDePersona] ??= {}), causa);
      }

      // D3: quien tiene sueldo y además aporte propio medía hoy con la suma; la escalera mide cada uno por separado.
      if (datosIess.ingresos.some((x) => x.tipo === "sueldo") && datosIess.ingresos.some((x) => x.tipo === "aporte_propio")) {
        mixtos.personas++;
        const quien = r.ingreso.oferta?.ingresoAceptado ?? 0;
        if (quien < hoy.ingresoNeto) { mixtos.bajaElIngreso++; mixtos.bajas.push(hoy.ingresoNeto - quien); }
        if (vHoy !== r.veredicto) mixtos.cambianDeVeredicto++;
      }

      // La cota por cuotas contra el sueldo neto de los dependientes.
      const p1 = ingreso.peldanos[0];
      if (["dependiente", "dependiente_con_ingreso_extra"].includes(ingreso.tipoDePersona) && p1.estado === "con_monto") {
        cobertura.dependientesConSueldo++;
        const comp = ingreso.peldanos[2].componentes.find((c) => c.clave === "cuotas_al_dia");
        if (comp) {
          cobertura.dependientesConCota++;
          if (p1.ingresoNeto >= comp.montoMensual) cobertura.cotaCubierta++;
        } else if ((ingreso.peldanos[2].motivo ?? "").includes("mora")) cobertura.conMoraOSinMedir++;
      }

      // La capacidad máxima.
      const cm = r.ingreso.capacidadMaxima;
      if (cm) {
        capMax.personas++;
        const pt = (capMax.porTipo[ingreso.tipoDePersona] ??= { personas: 0, sube: 0, mejoras: [] });
        pt.personas++;
        if (r.ingreso.oferta) capMax.conSostiene += r.ingreso.sostieneElCalculo ? 1 : 0;
        else capMax.sinOferta++;
        if ((cm.mejoraDelMontoMaximo ?? 0) === 0) capMax.igual++;
        else if ((cm.mejoraDelMontoMaximo ?? 0) < 0) capMax.baja++;
        if ((cm.mejoraDelMontoMaximo ?? 0) > 0) {
          capMax.sube++;
          pt.sube++;
          capMax.mejoras.push(cm.mejoraDelMontoMaximo);
          pt.mejoras.push(cm.mejoraDelMontoMaximo);
          const base = r.ingreso.oferta?.montoMaximoAlPlazo ?? 0;
          if (base > 0) capMax.mejorasRelativas.push(cm.mejoraDelMontoMaximo / base);
        }
        if (r.veredicto !== "alcanza" && r.veredicto !== "justo" && r.veredicto !== "extendida" && (cm.veredicto === "alcanza" || cm.veredicto === "justo")) capMax.deNoAlcanzaAAlcanza++;
      }
    } catch (e) {
      fallaron++;
      if (fallaron <= 3) console.log(`Una persona no se pudo medir: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ---- el informe ----
console.log(`\nMedidas: ${miles(medidas)}; no se pudieron medir: ${fallaron}. Sin buró; la capacidad de hoy es capacidad-v5.`);
console.log("\n1. Por tipo de persona: personas, peldaños con monto (1 a 5) y qué peldaño sostiene el cálculo");
for (const [tipo, t] of Object.entries(porTipo).sort((a, b) => b[1].personas - a[1].personas)) {
  const peldanos = [1, 2, 3, 4, 5].map((n) => `${n}:${miles(t.peldanos[n] ?? 0)}`).join(" ");
  const sostiene = Object.entries(t.sostiene).sort().map(([k, v]) => `${k}:${miles(v)}`).join(" ");
  console.log(`  ${tipo}: ${miles(t.personas)} · con monto ${peldanos} · sostiene ${sostiene} · sin medir ${miles(t.sinMedir)}`);
}
console.log("\n2. Veredicto de hoy -> veredicto de la escalera");
for (const [k, v] of Object.entries(transiciones).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${miles(v)}`);
const cambian = Object.values(porTipo).reduce((a, t) => a + t.cambian, 0);
console.log(`  Cambian: ${miles(cambian)} de ${miles(medidas)} (${pct(cambian, medidas)})`);
console.log("\n   Por qué cambian");
for (const [k, v] of Object.entries(causas).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${miles(v)}`);
console.log("\n   Cambian por tipo de persona");
for (const [tipo, t] of Object.entries(porTipo)) {
  if (t.cambian) console.log(`  ${tipo}: ${miles(t.cambian)} de ${miles(t.personas)} · ${Object.entries(causasPorTipo[tipo] ?? {}).map(([k, v]) => `${k.split(":")[0]} ${miles(v)}`).join(", ")}`);
}
console.log(`\n   D3, sueldo y aporte propio a la vez: ${miles(mixtos.personas)} personas; el ingreso con que se mide baja en ${miles(mixtos.bajaElIngreso)} (mediana USD ${miles(mediana(mixtos.bajas) ?? 0)}); cambian de veredicto ${miles(mixtos.cambianDeVeredicto)}`);
console.log(`   D4, declarado: ${miles([...solicitudPorPersona.keys()].filter((c) => ultimo.has(c)).length)} personas con Ingreso declarado en una solicitud: casi nadie declara en la base, así que D4 sólo se mide en ellas`);
console.log("\n3. Cota por cuotas contra el sueldo neto del IESS (dependientes con sueldo, sin buró)");
console.log(`  Dependientes con sueldo: ${miles(cobertura.dependientesConSueldo)}; con la cota armada: ${miles(cobertura.dependientesConCota)}; el sueldo neto la cubre: ${miles(cobertura.cotaCubierta)} (${pct(cobertura.cotaCubierta, cobertura.dependientesConCota)}); con mora, la cota no se arma: ${miles(cobertura.conMoraOSinMedir)}`);
console.log("\n4. Capacidad máxima informativa (el mayor ingreso entre los peldaños con monto, al 100%)");
console.log(`  Personas con capacidad máxima: ${miles(capMax.personas)} de ${miles(medidas)}; la escalera sostiene el cálculo en ${miles(capMax.conSostiene)} de ellas y en ${miles(capMax.personas - capMax.conSostiene)} no (la oferta es la del peldaño más fuerte, o ninguna)`);
console.log(`  Monto máximo de la capacidad máxima contra el de la oferta: sube ${miles(capMax.sube)}, igual ${miles(capMax.igual)}, baja ${miles(capMax.baja)} (la cota por cuotas prueba más ingreso pero, por construcción, no deja espacio)`);
console.log(`  El monto máximo sube contra el que sostiene: ${miles(capMax.sube)} personas; mejora mediana USD ${miles(mediana(capMax.mejoras) ?? 0)}, p90 USD ${miles(percentil(capMax.mejoras, 0.9) ?? 0)}; relativa mediana ${pct(mediana(capMax.mejorasRelativas) ?? 0, 1)}`);
console.log(`  Pasarían de no alcanzar a alcanzar con el mayor ingreso: ${miles(capMax.deNoAlcanzaAAlcanza)}`);
for (const [tipo, t] of Object.entries(capMax.porTipo)) console.log(`  ${tipo}: ${miles(t.personas)} con capacidad máxima, sube en ${miles(t.sube)}, mejora mediana USD ${miles(mediana(t.mejoras) ?? 0)}`);

console.log("\n5. La renta como cota (3b)");
console.log(`  Personas con renta reciente que da cota (impuesto de más de USD 100, año fiscal de hace dos años o menos): ${miles(rentaCuenta.conRenta)}; con el régimen sin verificar (sin buró): ${miles(rentaCuenta.regimenSinVerificar)}; con una base mayor que el sueldo neto: ${miles(rentaCuenta.mayorQueElSueldo)}`);
console.log(`  Por tipo: ${Object.entries(rentaCuenta.porTipo).map(([k, v]) => `${k} ${miles(v)}`).join(", ") || "ninguno"}`);
console.log("\n6. El predictor dentro de la escalera");
if (!vigente) console.log("  Sin modelo vigente: no se midió.");
else {
  console.log(`  Personas con estimación evaluada: ${miles(predictor.conModelo)}; peldaño 4 por estado: ${Object.entries(predictor.estados).map(([k, v]) => `${k} ${miles(v)}`).join(", ")}`);
  console.log(`  Motivos: ${Object.entries(predictor.motivos).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${miles(v)}`).join(", ")}`);
  console.log(`  El mínimo pasa de USD 1.000 (peldaño 4 con monto): ${miles(predictor.pasaDe1000)}; baja al 6: ${miles(predictor.bajaAl6)}`);
  for (const [tipo, t] of Object.entries(predictor.porTipo)) console.log(`    ${tipo}: ${Object.entries(t).map(([k, v]) => `${k} ${miles(v)}`).join(", ")}`);
  console.log(`  El predictor da lo mismo que ${CONTRA}: respuesta igual en ${miles(predictor.iguales)} de ${miles(predictor.conModelo)} (distinta en ${miles(predictor.distintos)}); fila igual en ${miles(predictor.filasIguales)} (distinta en ${miles(predictor.filasDistintas)})`);
  console.log(`  El 4 con fracción 0% no cambia nada: de ${miles(predictor.invarianzaComparadas)} personas sin declarado, ${miles(predictor.invarianzaRota)} cambian de veredicto, de quien sostiene o de oferta; con declarado, cambian de veredicto ${miles(predictor.declaradoCambia)} (sólo por la coherencia)`);
  const z = predictor.capCentral;
  console.log(`  Capacidad máxima (con la estimación CENTRAL, decisión del negocio del 2026-11-22): ${miles(z.personas)} personas (con central: ${miles(z.conCentral)}); el monto máximo sube en ${miles(z.sube)} (mejora mediana USD ${miles(mediana(z.mejoras) ?? 0)}, p90 USD ${miles(percentil(z.mejoras, 0.9) ?? 0)}; relativa mediana ${pct(mediana(z.mejorasRelativas) ?? 0, 1)}); pasarían de no alcanzar a alcanzar: ${miles(z.deNoAlcanzaAAlcanza)}`);
  const c = predictor.capMin;
  console.log(`  Comparación con el MÍNIMO certificado: ${miles(c.personas)} personas; sube en ${miles(c.sube)} (mejora mediana USD ${miles(mediana(c.mejoras) ?? 0)}, p90 USD ${miles(percentil(c.mejoras, 0.9) ?? 0)}); pasarían de no alcanzar a alcanzar: ${miles(c.deNoAlcanzaAAlcanza)}`);
}
