// Valida el perfil del modelo (lo único que lee el análisis con IA) sobre
// el último perfil guardado de cada cliente, SIN llamar al modelo.
//
// Nació con marco-v23 (2026-09-26): el negocio pidió validar antes de
// desplegar y sin gastar llamadas. Correrlo cada vez que cambie
// perfil-del-modelo.ts, nombres-ingresos.ts o las lecturas de
// fuentes-ingreso.ts / perfil-laboral.ts que usa.
//
// Qué verifica, perfil por perfil:
//   1. Se arma sin errores.
//   2. fuentesIngreso trae exactamente los campos de la vista, y ninguno
//      del perfil guardado que no debe llegar (detalle, correccion,
//      recalculo, pisoIngresoMensualReportado, senalesDeEscala, evidencia).
//   3. Ningún texto que llega al modelo usa los nombres retirados ("piso",
//      "autodeclarada", "reportada_por_tercero", "señales de escala").
//   4. El perfil laboral coincide con la columna perfil_laboral guardada.
//   5. Un aporte "como patrono de su propio negocio" llega como "Empresa
//      propia", y esa persona no figura trabajando para un tercero salvo
//      que tenga además un aporte de un empleador.
//   6. Los campos deshabilitados llegan en null y el resto intacto.
//   7. (marco-v24) Los préstamos IESS/BIESS llegan como
//      numeroPrestamosIessBiess, y el bloque endeudamiento suma bien.
//   8. (marco-v24) Ningún monto de deuda llega con más de dos decimales.
//   9. (marco-v25) La disponibilidad llega primera, cada tema en una sola
//      lista, y ningún nombre técnico de fuente llega al modelo.
//  10. (marco-v25) Un jubilado no llega "sin información actual en el IESS"
//      ni con meses sin aportar.
//
// Uso:  node scripts/validar-perfil-del-modelo.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const RAIZ = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "..");
const compartido = (f) => import(pathToFileURL(path.join(RAIZ, "supabase/functions/_shared", f)).href);
const { armarPerfilDelModelo, mensajeParaElModelo } = await compartido("perfil-del-modelo.ts");
const { clasificarPerfilLaboral } = await compartido("perfil-laboral.ts");

// Los secretos se leen del archivo y no se imprimen.
const env = Object.fromEntries(
  fs.readFileSync(path.join(RAIZ, ".env.functions"), "utf8").split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const cabeceras = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` };
async function pedir(url, extra = {}) {
  const r = await fetch(url, { headers: { ...cabeceras, ...extra } });
  const texto = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${texto.slice(0, 300)}`);
  return { cuerpo: JSON.parse(texto), rango: r.headers.get("content-range") };
}

// El último perfil de cada cliente, paginando hasta el conteo (PostgREST
// corta en 1.000 sin avisar).
const ultimo = new Map();
{
  let total = null;
  for (let desde = 0; total === null || desde < total; desde += 1000) {
    const { cuerpo, rango } = await pedir(
      `${env.SUPABASE_URL}/rest/v1/client_profiles?select=id,client_id,created_at&order=id&limit=1000&offset=${desde}`,
      { Prefer: "count=exact" },
    );
    if (total === null) total = Number(rango?.split("/")[1] ?? cuerpo.length);
    for (const p of cuerpo) {
      const a = ultimo.get(p.client_id);
      if (!a || p.created_at > a.created_at) ultimo.set(p.client_id, p);
    }
    if (cuerpo.length === 0) break;
  }
}
const ids = [...ultimo.values()].map((p) => p.id);

const CAMPOS_VISTA = [
  "segmento", "estado", "condicionesDeLaSegmentacion", "informacionIess", "sinInformacionActualEnElIess",
  "mesesSinAportar", "ingresoReportadoIess", "esIngresoMinimoSbu", "aportes", "otrasFuentesSinMonto",
  "perfilLaboral", "tamanoDelNegocio", "indiciosIngresoMayor", "estabilidad", "documentosDeConfirmacion",
].sort().join(",");
const CLAVES_QUE_NO_LLEGAN = /"(detalle|correccion|recalculo|pisoIngresoMensualReportado|senalesDeEscala|evidencia|paraConfirmar|motivoSegmento)"\s*:/;
// Nombres de fuentes de Novadata que no son también nombres de campos del
// perfil (impedimentoCargosPublicos, por ejemplo, es las dos cosas).
const NOMBRES_DE_FUENTES = /buroCredito(Super|Diners|Coop)|trabajoHistoricosMecanizado|bienesInmueble|pensionAlimenticiaNovadata|afiliacionIssfac|afiliacionSiisspol|sriImpuestoRenta|basesInternas|establecimientoActEconomica|deudas(Ant|Amt|Emov|Firmes)\b|listasControl|fuentes(ConDatos|SinDatos|NoMedidas)|metaConsulta/;
const PALABRAS_RETIRADAS = /\bpiso\b|autodeclarad|reportada_por_tercero|reportada por un tercero|se[nñ]ales de escala/i;

const fallas = new Map();
const fallar = (regla, cedula) => {
  if (!fallas.has(regla)) fallas.set(regla, []);
  fallas.get(regla).push(cedula);
};
const tamanos = { antes: [], despues: [] };
let revisados = 0, conIngresos = 0, propios = 0, conIndicios = 0, conEstabilidad = 0, conTamano = 0, conTemasSinConsultar = 0;

for (let i = 0; i < ids.length; i += 100) {
  const { cuerpo: filas } = await pedir(
    `${env.SUPABASE_URL}/rest/v1/client_profiles?id=in.(${ids.slice(i, i + 100).join(",")})&select=id,perfil_laboral,standard_profile,clients(cedula)`,
  );
  for (const fila of filas) {
    const cedula = fila.clients?.cedula ?? fila.id;
    const sp = fila.standard_profile;
    revisados++;
    let pm;
    try {
      pm = armarPerfilDelModelo(sp);
    } catch (e) {
      fallar(`1. no se arma: ${e.message}`, cedula);
      continue;
    }
    // Lo que se mandaba hasta v22: el perfil sin fuentesIngreso.detalle.
    const f = sp.fuentesIngreso;
    const antes = f ? { ...sp, fuentesIngreso: Object.fromEntries(Object.entries(f).filter(([k]) => k !== "detalle")) } : sp;
    tamanos.antes.push(JSON.stringify(antes).length);
    tamanos.despues.push(JSON.stringify(mensajeParaElModelo(sp, [])).length);

    const vi = pm.fuentesIngreso;
    if (!f) {
      if (vi !== null) fallar("2. perfil sin clasificación y la vista no es null", cedula);
      continue;
    }
    conIngresos++;
    if (Object.keys(vi).sort().join(",") !== CAMPOS_VISTA) fallar("2. la vista no trae exactamente sus campos", cedula);
    const textoVista = JSON.stringify(vi);
    if (CLAVES_QUE_NO_LLEGAN.test(textoVista)) fallar("2. llega un campo interno del perfil guardado", cedula);
    if (PALABRAS_RETIRADAS.test(textoVista)) fallar("3. la parte de ingresos usa un nombre retirado", cedula);
    if (/\bpiso\b/i.test(JSON.stringify(pm))) fallar("3. el perfil del modelo dice 'piso'", cedula);

    const clave = clasificarPerfilLaboral(sp)?.clave ?? null;
    if (clave !== fila.perfil_laboral) fallar(`4. perfil laboral ${clave} y la columna dice ${fila.perfil_laboral}`, cedula);

    const comoPatrono = vi.aportes.filter((a) => a.tipo === "aporte como patrono de su propio negocio");
    if (comoPatrono.length) {
      propios++;
      if (comoPatrono.some((a) => a.declaradoPor !== "Empresa propia")) fallar("5. aporte como patrono no llega como Empresa propia", cedula);
      const deUnEmpleador = vi.aportes.some((a) => String(a.declaradoPor).startsWith("Empleador") || a.declaradoPor === "Otros empleadores");
      if (vi.perfilLaboral?.trabajaParaUnTercero && !deUnEmpleador) fallar("5. propio patrono figura trabajando para un tercero", cedula);
    }
    if (vi.indiciosIngresoMayor.length) conIndicios++;
    if (vi.estabilidad) conEstabilidad++;
    if (vi.tamanoDelNegocio) conTamano++;

    // 7. Desde marco-v24: los préstamos IESS/BIESS con su nombre, y el
    // endeudamiento igual a la suma de sus partes.
    const b = pm.comportamientoBancario;
    if (b && ("numeroCreditosFormales" in b || !("numeroPrestamosIessBiess" in b))) fallar("7. los préstamos IESS/BIESS no llegan con su nombre", cedula);
    const en = pm.endeudamiento;
    if ((sp.comportamientoBancario || sp.comportamientoCooperativas) && !en) fallar("7. falta el bloque endeudamiento", cedula);
    if (en) {
      const suma = Math.round((en.deudaPropiaBancos + en.deudaPropiaCooperativas + en.deudaPropiaRetail) * 100) / 100;
      if (Math.abs(suma - en.deudaPropiaTotal) > 0.01) fallar("7. la deuda propia total no es la suma de sus partes", cedula);
      if (en.deudaEnAtrasoTotal > en.deudaPropiaTotal + 0.01) fallar("7. hay más deuda en atraso que deuda total", cedula);
    }
    // 8. Montos a centavos: 258798.83000000002 llegaba así al modelo.
    if (/\d\.\d{3,}/.test(JSON.stringify({ b, c: pm.comportamientoCooperativas, en, p: pm.riesgoJudicialCivil }))) fallar("8. un monto llega con más de dos decimales", cedula);

    // 9. Desde marco-v25: la disponibilidad por tema, primera, sin fuentes.
    const di = pm.disponibilidad;
    if (Object.keys(pm)[0] !== "disponibilidad") fallar("9. la disponibilidad no llega primera", cedula);
    if (sp.metaConsulta && !di) fallar("9. hay metaConsulta y no llega la disponibilidad", cedula);
    if (di) {
      const temas = [...di.temasConsultados, ...di.temasNoConsultados];
      if (new Set(temas).size !== temas.length) fallar("9. un tema está en las dos listas", cedula);
      if (di.temasNoConsultados.length) conTemasSinConsultar++;
    }
    if (NOMBRES_DE_FUENTES.test(JSON.stringify(pm))) fallar("9. llega un nombre técnico de fuente", cedula);

    // 10. Desde marco-v25: un jubilado dejó de aportar porque se jubiló.
    if (vi.perfilLaboral?.registraJubilacion && (vi.sinInformacionActualEnElIess || vi.mesesSinAportar !== null)) {
      fallar("10. un jubilado llega sin información actual en el IESS", cedula);
    }
  }
}

// 6. Campos deshabilitados, sobre un perfil cualquiera con ingresos.
{
  const { cuerpo } = await pedir(`${env.SUPABASE_URL}/rest/v1/client_profiles?id=eq.${ids[0]}&select=standard_profile`);
  const sp = cuerpo[0].standard_profile;
  const apagados = new Set(["fuentesIngreso.indiciosIngresoMayor", "laboral.salarioMasAltoRegistrado"]);
  const pm = armarPerfilDelModelo(sp, apagados);
  const completo = armarPerfilDelModelo(sp);
  if (sp.fuentesIngreso && pm.fuentesIngreso.indiciosIngresoMayor !== null) fallar("6. un campo de ingresos deshabilitado no llega en null", "prueba");
  if (sp.laboral && pm.laboral.salarioMasAltoRegistrado !== null) fallar("6. un campo de laboral deshabilitado no llega en null", "prueba");
  if (sp.fuentesIngreso && JSON.stringify(pm.fuentesIngreso.aportes) !== JSON.stringify(completo.fuentesIngreso.aportes)) fallar("6. ocultar un campo tocó otro", "prueba");
}

const mediana = (v) => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];
const p90 = (v) => [...v].sort((x, y) => x - y)[Math.floor(v.length * 0.9)];
console.log(`perfiles revisados: ${revisados} (${conIngresos} con clasificación de ingresos)`);
console.log(`  aportes como propio patrono: ${propios} | con indicios: ${conIndicios} | con estabilidad: ${conEstabilidad} | con tamaño del negocio: ${conTamano} | con algún tema sin consultar: ${conTemasSinConsultar}`);
console.log(`  mensaje al modelo (caracteres): antes mediana ${mediana(tamanos.antes)} p90 ${p90(tamanos.antes)} | ahora mediana ${mediana(tamanos.despues)} p90 ${p90(tamanos.despues)}`);
if (fallas.size === 0) {
  console.log("VALIDACIÓN OK: 0 fallas en las 10 reglas.");
} else {
  console.log("FALLAS:");
  for (const [regla, casos] of fallas) console.log(`  ${regla}: ${casos.length} (ej. ${casos.slice(0, 5).join(", ")})`);
  process.exitCode = 1;
}
