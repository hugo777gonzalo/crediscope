// La medición en seco del «ingreso adicional por corroborar» (docs/ingreso-adicional-por-corroborar.md, sección 5).
//
// Pedido del negocio (2026-11-22): separar el ingreso VALIDADO (peldaños 1 y 2 de la escalera) del ADICIONAL que la
// persona tiene que corroborar con un documento: la diferencia contra el indicio más alto (3a cuotas al día, 3b renta,
// 3c aporte propio, 4 mínimo certificado del predictor, 5 declarado). Este guion aplica la regla PROPUESTA del documento
// sobre el último perfil de cada persona real, sin buró, y cuenta:
//   1. a cuántas les aparece un adicional, de qué tamaño (mediana y p90) y de qué indicio sale, por tipo de persona;
//   2. la fuerza del adicional (la del indicio más alto, subida un grado si otra fuente distinta coincide);
//   3. a cuántas el adicional validado les cambiaría el veredicto de la escalera (de no alcanzar o sin medir a alcanzar),
//      con el adicional entero y con la parte respaldada (sólo indicios de fuerza media o fuerte);
//   4. cuántos de esos cambios ya los daba la «mejora» de la escalera (que hoy mira sólo el 4 y el 5) y cuántos son nuevos;
//   5. la variante de medir el adicional desde lo que SOSTIENE el cálculo (1, o el 3 que crea espacio) en vez de lo validado;
//   6. la renta (3b) de los dependientes con una base mayor que el sueldo neto: cuántas «corroboradas por sus cuotas».
//
// La regla vive acá y no en `_shared/` porque es una PROPUESTA: si el negocio la aprueba, se construye en
// `escalera-del-ingreso.ts` con su prueba (tareas A1 a A3 del documento) y este guion pasa a llamarla.
//
// El crédito es el de la solicitud más reciente con monto e Ingreso declarado y, para el resto, el de referencia del
// estándar (USD 5.000 a 36 meses con la Tasa máxima), como en `medir-escalera.mjs`.
//
// SOLO LEE. No llama a Proveedor_Info_1, a Equifax ni al modelo, y no escribe en la base (baja el modelo vigente del
// predictor del depósito privado, como `medir-escalera.mjs`). Por consola sólo conteos: ningún dato de una persona.
//
// Uso: node scripts/medir-ingreso-adicional.mjs [--limite=N] [--sin-predictor]
//
// AVISO: este archivo no pasa por lint ni build. Después de tocarlo, correrlo con --limite=50 antes de confiar en los números.

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { cargarEntorno } from "./_comun/entorno.mjs";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIMITE = Number(process.argv.find((a) => a.startsWith("--limite="))?.slice(9) ?? Infinity);
const SIN_PREDICTOR = process.argv.includes("--sin-predictor");
const modulo = (archivo) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", archivo)).href);
const { datosDeCapacidad, evaluarEscalera } = await modulo("capacidad-de-pago.ts");
const { armarIngresoDelPerfil } = await modulo("escalera-del-ingreso.ts");
const estimacion = await modulo("estimacion-de-ingreso.ts");
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
const percentil = (v, p) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null; };
const mediana = (v) => percentil(v, 0.5);
const suma = (o, k, n = 1) => { o[k] = (o[k] ?? 0) + n; };
const ALCANZA = new Set(["alcanza", "justo", "extendida"]);

// ---------------------------------------------------------------- la regla (PROPUESTA, sección 1 del documento)

const MATERIALIDAD = { usd: 100, fraccion: 0.1 }; // un adicional menor no se muestra: es ruido de redondeo o de corte
const COINCIDE_SI_LLEGA_AL = 0.8; // otro indicio de otra fuente llega al 80% del más alto: la fuerza sube un grado
const GRADOS = ["sin_respaldo", "debil", "media", "fuerte"];

/**
 * Los indicios de un ingreso mayor que lo validado, cada uno con su monto mensual (comparable con el neto del IESS) y su
 * fuerza. Nunca se suman: cada uno es otra lectura del mismo ingreso total.
 */
function indiciosDe(ingreso) {
  const [p1, , p3, p4, p5] = ingreso.peldanos;
  const sueldoNeto = p1.estado === "con_monto" ? p1.ingresoNeto : null;
  const comp = (clave) => p3.componentes.find((c) => c.clave === clave) ?? null;
  const cuotas = comp("cuotas_al_dia");
  const renta = comp("impuesto_a_la_renta");
  const aporte = comp("aporte_propio");
  const lista = [];
  if (cuotas) lista.push({ clave: "cuotas_al_dia", peldano: "3a", monto: cuotas.montoMensual, fuerza: "media", creaEspacio: false });
  if (renta) {
    // «Corroborada por sus cuotas»: las cuotas al día prueban, por su lado, un ingreso mayor que el sueldo neto.
    const corroborada = cuotas !== null && sueldoNeto !== null && cuotas.montoMensual > sueldoNeto;
    lista.push({ clave: "impuesto_a_la_renta", peldano: "3b", monto: renta.montoMensual, fuerza: corroborada ? "fuerte" : "media", creaEspacio: true, corroborada });
  }
  if (aporte) lista.push({ clave: "aporte_propio", peldano: "3c", monto: aporte.montoMensual, fuerza: "media", creaEspacio: true });
  if (p4.estado === "con_monto") lista.push({ clave: "predictor", peldano: "4", monto: p4.montoMensual, fuerza: "debil", creaEspacio: false });
  if (p5.estado === "con_monto") lista.push({ clave: "declarado", peldano: "5", monto: p5.montoMensual, fuerza: p5.coherencia === "coherente" ? "debil" : "sin_respaldo", creaEspacio: false });
  return lista;
}

/** El adicional por corroborar desde una base (lo validado o lo que sostiene). null: no hay adicional material. */
function adicionalDesde(base, indicios) {
  const encima = indicios.filter((x) => x.monto > base).sort((a, b) => b.monto - a.monto);
  if (encima.length === 0) return null;
  const mayor = encima[0];
  const monto = Math.round(mayor.monto - base);
  const material = monto >= MATERIALIDAD.usd && (base === 0 || monto >= base * MATERIALIDAD.fraccion);
  let grado = GRADOS.indexOf(mayor.fuerza);
  const coincide = encima.slice(1).some((x) => x.clave !== mayor.clave && x.fuerza !== "sin_respaldo" && x.monto >= mayor.monto * COINCIDE_SI_LLEGA_AL);
  if (coincide && mayor.fuerza !== "sin_respaldo" && grado < GRADOS.length - 1) grado++;
  // La parte respaldada: hasta el indicio más alto de fuerza media o fuerte.
  const respaldado = encima.find((x) => x.fuerza === "media" || x.fuerza === "fuerte") ?? null;
  return {
    origen: mayor.clave,
    monto,
    material,
    fuerza: GRADOS[grado],
    subioPorCoincidencia: coincide && GRADOS[grado] !== mayor.fuerza,
    respaldado: respaldado ? Math.round(respaldado.monto - base) : 0,
    origenRespaldado: respaldado?.clave ?? null,
    indiciosEncima: encima.length,
  };
}

/** La escalera con sólo lo validado: el 3, el 4 y el 5 sin monto. Es lo que la institución puede defender sin un documento. */
function soloValidado(ingreso) {
  const peldanos = ingreso.peldanos.map((p) => (p.numero >= 3 && p.numero <= 5 ? { ...p, estado: "sin_monto", motivo: "solo_validado", montoMensual: null, montoQueCreaEspacio: null, ingresoNeto: null, componentes: [] } : { ...p }));
  return { ...ingreso, peldanos };
}

/** La escalera con un documento validado (peldaño 2) por `monto` neto, al 100%: lo que pasaría si la persona lo corrobora. */
function conDocumento(ingreso, monto) {
  const peldanos = ingreso.peldanos.map((p) => ({ ...p }));
  peldanos[1] = {
    ...peldanos[1], estado: "con_monto", motivo: null, montoMensual: monto, montoQueCreaEspacio: monto, ingresoNeto: monto,
    componentes: [{ clave: "documento", montoMensual: monto, regla: "documento_hipotetico", creaEspacio: true, aFecha: null, hechos: [], avisos: ["hipotetico"] }],
  };
  return { ...ingreso, peldanos };
}

// ---------------------------------------------------------------- las personas

const sinteticas = new Set((await todas("clients", "id", "&es_sintetico=eq.true")).map((c) => c.id));
const ultimo = new Map();
for (const p of await todas("client_profiles", "id,client_id,created_at")) {
  if (sinteticas.has(p.client_id)) continue;
  const a = ultimo.get(p.client_id);
  if (!a || p.created_at > a.created_at) ultimo.set(p.client_id, p);
}
const solicitudPorPersona = new Map();
for (const s of await todas("solicitudes", "id,identificacion,client_id,creada_el,monto,plazo_meses,tasa_nominal_anual,ingreso_declarado", "&ingreso_declarado=not.is.null&client_id=not.is.null&monto=not.is.null")) {
  if (String(s.identificacion ?? "").startsWith("00")) continue; // el sandbox
  const a = solicitudPorPersona.get(s.client_id);
  if (!a || s.creada_el > a.creada_el) solicitudPorPersona.set(s.client_id, s);
}
const elegidos = [...ultimo.values()].slice(0, LIMITE);
const conDeclarado = [...solicitudPorPersona.keys()].filter((c) => ultimo.has(c)).length;
console.log(`Personas reales: ${miles(ultimo.size)} (medidas: ${miles(elegidos.length)}); con una solicitud que trae Ingreso declarado: ${miles(conDeclarado)}.`);

let vigente = null;
let filaModelo = null;
if (!SIN_PREDICTOR) {
  [filaModelo] = await pedir("modelos_de_ingreso?select=id,version,nivel,huella_sha256,ruta_archivo,poblacion,calibracion&nivel=eq.1&estado=eq.vigente");
  if (filaModelo) {
    const cargar = estimacion.crearCargadorDeModelo(async (ruta) => {
      const r = await fetch(`${U}/storage/v1/object/modelos-de-ingreso/${ruta}`, { headers: H });
      if (!r.ok) throw new Error(`El depósito contestó ${r.status} al bajar el modelo`);
      return new Uint8Array(await r.arrayBuffer());
    });
    vigente = await cargar(filaModelo);
  }
}
console.log(vigente ? `Predictor: modelo ${filaModelo.version} (nivel 1, sin buró).` : "Predictor: sin modelo (el peldaño 4 queda sin medir).");

const REFERENCIA = { monto: 5000, plazoMeses: 36, tasaNominalAnualPorcentaje: PRODUCTO_CONSUMO.tasaNominalMaximaPorcentaje };

// ---------------------------------------------------------------- la corrida

const nuevoGrupo = () => ({
  personas: 0, conValidado: 0, conAdicional: 0, material: 0, montos: [], montosConValidado: [], montosSinValidado: [],
  origen: {}, fuerza: {}, subioPorCoincidencia: 0, conRespaldo: 0, montosRespaldados: [],
  veredictoHoy: {}, cambiaConTodo: 0, cambiaConRespaldado: 0, cambiaYaLoDabaLaMejora: 0, noAlcanzaHoy: 0,
  noAlcanzaSoloValidado: 0, desdeValidadoConTodo: 0, desdeValidadoConRespaldado: 0,
  montoMaximoSube: [],
});
const total = nuevoGrupo();
const porTipo = {};
const desdeLoQueSostiene = { conAdicional: 0, material: 0, montos: [], origen: {}, yaSostieneElIndicio: 0 };
const renta = { dependientesConSueldo: 0, rentaMayorQueSueldo: 0, corroboradas: 0, corroboradaAlternativa: 0 };
const desacuerdos = { dosOMasIndicios: 0, elMayorEsDebil: 0, conRespaldoMasBajo: 0, ratios: [] };
let medidas = 0;
let fallaron = 0;

for (let i = 0; i < elegidos.length; i += 50) {
  const lote = elegidos.slice(i, i + 50);
  const perfiles = await pedir(`client_profiles?select=id,client_id,created_at,standard_profile,estado_por_fuente&id=in.(${lote.map((p) => p.id).join(",")})`);
  for (const fila of perfiles) {
    const perfil = fila.standard_profile;
    const sol = solicitudPorPersona.get(fila.client_id);
    const condiciones = sol ? { monto: Number(sol.monto), plazoMeses: sol.plazo_meses, tasaNominalAnualPorcentaje: Number(sol.tasa_nominal_anual) } : REFERENCIA;
    const declarado = sol && sol.ingreso_declarado !== null ? Number(sol.ingreso_declarado) : null;
    try {
      if (!simularCredito(condiciones).ok) { fallaron++; continue; }
      const hoyDelPerfil = new Date(fila.created_at);
      const datos = datosDeCapacidad(perfil, null, hoyDelPerfil);
      let respuesta;
      if (vigente) {
        const decision = estimacion.decidirEstimacion(perfil, fila.estado_por_fuente);
        respuesta = estimacion.armarEstimacion({ id: "00000000-0000-4000-8000-000000000000", perfil, decision, consultadoEl: fila.created_at, ahora: hoyDelPerfil, vigente }).respuesta;
      }
      const ingreso = armarIngresoDelPerfil(perfil, datos, { ingresoDeclarado: declarado, estimacion: respuesta });
      const r = evaluarEscalera({ datos, ingreso, condiciones });
      medidas++;

      const g = (porTipo[ingreso.tipoDePersona] ??= nuevoGrupo());
      const anotar = (fn) => { fn(total); fn(g); };
      anotar((x) => { x.personas++; suma(x.veredictoHoy, r.veredicto); if (!ALCANZA.has(r.veredicto)) x.noAlcanzaHoy++; });

      const [p1, , p3] = ingreso.peldanos;
      // Lo validado: el peldaño 1 neto (el 2 todavía no existe: D8, sin construir).
      const validado = p1.estado === "con_monto" ? p1.ingresoNeto : 0;
      if (validado > 0) anotar((x) => x.conValidado++);
      const indicios = indiciosDe(ingreso);

      // La renta de los dependientes: ¿cuántas mayores que el sueldo y cuántas corroboradas por sus cuotas?
      if (validado > 0) {
        renta.dependientesConSueldo++;
        const ir = indicios.find((x) => x.clave === "impuesto_a_la_renta");
        if (ir && ir.monto > validado) {
          renta.rentaMayorQueSueldo++;
          if (ir.corroborada) renta.corroboradas++;
          // Variante: las cuotas al día llegan a la mitad de la base de la renta.
          const cu = indicios.find((x) => x.clave === "cuotas_al_dia");
          if (cu && cu.monto >= ir.monto * 0.5) renta.corroboradaAlternativa++;
        }
      }

      const a = adicionalDesde(validado, indicios);
      if (a) {
        anotar((x) => x.conAdicional++);
        if (a.material) {
          const encima = indicios.filter((x) => x.monto > validado);
          if (encima.length >= 2) {
            desacuerdos.dosOMasIndicios++;
            const montos = encima.map((x) => x.monto).sort((u, v) => u - v);
            desacuerdos.ratios.push(montos.at(-1) / montos[0]);
            if (a.respaldado > 0 && a.respaldado < a.monto) desacuerdos.conRespaldoMasBajo++;
          }
          if (a.fuerza === "debil" || a.fuerza === "sin_respaldo") desacuerdos.elMayorEsDebil++;
          anotar((x) => {
            x.material++;
            x.montos.push(a.monto);
            (validado > 0 ? x.montosConValidado : x.montosSinValidado).push(a.monto);
            suma(x.origen, a.origen);
            suma(x.fuerza, a.fuerza);
            if (a.subioPorCoincidencia) x.subioPorCoincidencia++;
            if (a.respaldado > 0) { x.conRespaldo++; x.montosRespaldados.push(a.respaldado); }
          });
          // Contra lo validado solo (sin las cotas, el predictor ni lo declarado): lo que destraba el requisito.
          const r0 = evaluarEscalera({ datos, ingreso: soloValidado(ingreso), condiciones });
          if (!ALCANZA.has(r0.veredicto)) {
            anotar((x) => x.noAlcanzaSoloValidado++);
            const rT = evaluarEscalera({ datos, ingreso: conDocumento(soloValidado(ingreso), validado + a.monto), condiciones });
            if (ALCANZA.has(rT.veredicto)) anotar((x) => x.desdeValidadoConTodo++);
            if (a.respaldado > 0) {
              const rR = evaluarEscalera({ datos, ingreso: conDocumento(soloValidado(ingreso), validado + a.respaldado), condiciones });
              if (ALCANZA.has(rR.veredicto)) anotar((x) => x.desdeValidadoConRespaldado++);
            }
          }
          // ¿Le cambiaría el veredicto si lo corrobora? Con el adicional entero y con la parte respaldada.
          if (!ALCANZA.has(r.veredicto)) {
            const rTodo = evaluarEscalera({ datos, ingreso: conDocumento(ingreso, validado + a.monto), condiciones });
            if (ALCANZA.has(rTodo.veredicto)) {
              anotar((x) => x.cambiaConTodo++);
              // La mejora de la escalera de hoy ya lo decía si mira el 4 o el 5 y su 2 hipotético alcanza.
              const hip = r.ingreso.escalera.find((e) => e.hipotetico);
              if (hip && ALCANZA.has(hip.veredicto)) anotar((x) => x.cambiaYaLoDabaLaMejora++);
            }
            if (a.respaldado > 0) {
              const rResp = evaluarEscalera({ datos, ingreso: conDocumento(ingreso, validado + a.respaldado), condiciones });
              if (ALCANZA.has(rResp.veredicto)) anotar((x) => x.cambiaConRespaldado++);
            }
          }
          // Cuánto sube el monto máximo al plazo pedido con el adicional validado (sobre la oferta de hoy, o cero).
          const rTodo = evaluarEscalera({ datos, ingreso: conDocumento(ingreso, validado + a.monto), condiciones });
          const antes = r.ingreso.oferta?.montoMaximoAlPlazo ?? 0;
          const despues = rTodo.ingreso.oferta?.montoMaximoAlPlazo ?? 0;
          if (despues > antes) anotar((x) => x.montoMaximoSube.push(despues - antes));
        }
      }

      // Variante: desde lo que SOSTIENE el cálculo sin documento (1 neto o el 3 que crea espacio), no desde lo validado.
      const sostiene = Math.max(validado, p3.estado === "con_monto" ? (p3.montoQueCreaEspacio ?? 0) : 0);
      const b = adicionalDesde(sostiene, indicios);
      if (b) {
        desdeLoQueSostiene.conAdicional++;
        if (b.material) { desdeLoQueSostiene.material++; desdeLoQueSostiene.montos.push(b.monto); suma(desdeLoQueSostiene.origen, b.origen); }
      }
      if (a?.material && (a.origen === "impuesto_a_la_renta" || a.origen === "aporte_propio")) desdeLoQueSostiene.yaSostieneElIndicio++;
    } catch (e) {
      fallaron++;
      if (fallaron <= 3) console.log(`Una persona no se pudo medir: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

// ---------------------------------------------------------------- el informe

const reparto = (o) => Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${miles(v)}`).join(", ") || "—";
const tamano = (v) => (v.length ? `mediana USD ${miles(mediana(v))}, p90 USD ${miles(percentil(v, 0.9))}` : "—");
console.log(`\nMedidas: ${miles(medidas)}; no se pudieron medir: ${fallaron}. Sin buró. Materialidad: USD ${MATERIALIDAD.usd} y ${MATERIALIDAD.fraccion * 100}% de lo validado.`);

console.log("\n1. A cuántas les aparece un adicional por corroborar (desde lo validado: el peldaño 1 neto)");
console.log(`  Con ingreso validado: ${miles(total.conValidado)} de ${miles(total.personas)}`);
console.log(`  Con algún indicio por encima de lo validado: ${miles(total.conAdicional)}; con un adicional material: ${miles(total.material)} (${pct(total.material, total.personas)})`);
console.log(`  Tamaño (material): ${tamano(total.montos)}; con validado ${tamano(total.montosConValidado)} (${miles(total.montosConValidado.length)}); sin validado ${tamano(total.montosSinValidado)} (${miles(total.montosSinValidado.length)})`);
console.log(`  De qué indicio sale: ${reparto(total.origen)}`);
console.log(`  Fuerza: ${reparto(total.fuerza)}; subió un grado por coincidir con otra fuente: ${miles(total.subioPorCoincidencia)}`);
console.log(`  Con parte respaldada (indicio de fuerza media o fuerte): ${miles(total.conRespaldo)}; tamaño de esa parte: ${tamano(total.montosRespaldados)}`);

console.log("\n2. Por tipo de persona");
for (const [tipo, t] of Object.entries(porTipo).sort((a, b) => b[1].personas - a[1].personas)) {
  console.log(`  ${tipo}: ${miles(t.personas)} · con validado ${miles(t.conValidado)} · adicional material ${miles(t.material)} (${pct(t.material, t.personas)}) · ${tamano(t.montos)}`);
  if (t.material) console.log(`      origen: ${reparto(t.origen)} · fuerza: ${reparto(t.fuerza)}`);
}

console.log("\n3. A cuántas el adicional validado les cambiaría el veredicto (de no alcanzar o sin medir a alcanzar)");
console.log(`  Veredicto de la escalera hoy: ${reparto(total.veredictoHoy)}; no alcanzan o sin medir: ${miles(total.noAlcanzaHoy)}`);
console.log(`  Con el adicional entero validado: ${miles(total.cambiaConTodo)}; con sólo la parte respaldada: ${miles(total.cambiaConRespaldado)}`);
console.log(`  De los ${miles(total.cambiaConTodo)}, la mejora de la escalera de hoy (sólo 4 y 5) ya lo daba en ${miles(total.cambiaYaLoDabaLaMejora)}; nuevos: ${miles(total.cambiaConTodo - total.cambiaYaLoDabaLaMejora)}`);
for (const [tipo, t] of Object.entries(porTipo)) if (t.cambiaConTodo) console.log(`    ${tipo}: ${miles(t.cambiaConTodo)} (con lo respaldado ${miles(t.cambiaConRespaldado)})`);
console.log(`  Contra lo validado solo (sin cotas, predictor ni declarado), de los que tienen un adicional material: no alcanzan ${miles(total.noAlcanzaSoloValidado)}; alcanzarían con el adicional entero ${miles(total.desdeValidadoConTodo)} y con la parte respaldada ${miles(total.desdeValidadoConRespaldado)}`);
for (const [tipo, t] of Object.entries(porTipo)) if (t.desdeValidadoConTodo) console.log(`    ${tipo}: ${miles(t.desdeValidadoConTodo)} (con lo respaldado ${miles(t.desdeValidadoConRespaldado)})`);
console.log(`  Monto máximo al plazo pedido con el adicional validado: sube en ${miles(total.montoMaximoSube.length)}; ${tamano(total.montoMaximoSube)}`);

console.log("\n4. Cuando los indicios no coinciden");
console.log(`  Adicionales materiales con dos o más indicios por encima de lo validado: ${miles(desacuerdos.dosOMasIndicios)}; el más alto sobre el más bajo: ${desacuerdos.ratios.length ? `mediana ${(mediana(desacuerdos.ratios)).toFixed(2).replace(".", ",")} veces, p90 ${(percentil(desacuerdos.ratios, 0.9)).toFixed(2).replace(".", ",")}` : "—"}`);
console.log(`  El indicio más alto es débil o sin respaldo: ${miles(desacuerdos.elMayorEsDebil)}; con una parte respaldada más baja que el adicional: ${miles(desacuerdos.conRespaldoMasBajo)}`);

console.log("\n5. Variante: desde lo que sostiene el cálculo sin documento (1 neto, o la renta o el aporte propio del 3)");
console.log(`  Con adicional material: ${miles(desdeLoQueSostiene.material)} (desde lo validado: ${miles(total.material)}); ${tamano(desdeLoQueSostiene.montos)}; origen: ${reparto(desdeLoQueSostiene.origen)}`);
console.log(`  Adicionales desde lo validado cuyo indicio más alto ya sostiene el cálculo (renta o aporte propio): ${miles(desdeLoQueSostiene.yaSostieneElIndicio)}`);

console.log("\n6. La renta (3b) de quien tiene sueldo verificado");
console.log(`  Con sueldo: ${miles(renta.dependientesConSueldo)}; base de la renta mayor que el sueldo neto: ${miles(renta.rentaMayorQueSueldo)}; corroboradas por sus cuotas (las cuotas al día prueban más que el sueldo): ${miles(renta.corroboradas)}; variante (cuotas al día de al menos la mitad de la base): ${miles(renta.corroboradaAlternativa)}`);
