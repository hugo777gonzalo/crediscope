// La paridad del sueldo de AWS (lo recuperado del IESS que validó el analista, `ver_f`) con el peldaño 1 de producción: el sueldo
// reportado al IESS neto del aporte personal, armado con el código que sirve (`buildStandardProfile` -> `datosDeCapacidad` ->
// `armarIngresoDelPerfil`). Lo llama `adicional_por_componente.py` (docs/propuesta-adicional-del-dependiente.md, sesión 1): ninguna regla
// se copia acá.
//
// Por qué existe: el modelo del adicional del dependiente se entrenaría con el sueldo de AWS como entrada y se serviría con el peldaño 1.
// AWS no arma ese sueldo como producción: es el 90% del `promedio` de Proveedor_Info_1 en tres de cada cuatro (12.15, punto 10) y, a veces,
// el bruto menos el aporte escrito a mano. Si no coinciden, el modelo aprende con una cifra y recibe otra.
//
// Cómo: para cada dependiente de AWS cuyo crudo de Proveedor_Info_1 está en un respaldo de la cartera (`research/`, de la carpeta principal),
// se cortan los aportes del IESS al mes que producción habría tenido como corte el día de la consulta de AWS (lo calcula el guion de Python)
// y se arma el perfil con ese corte y el reloj en esa fecha. El crudo es de septiembre u octubre de 2026: lo anterior al corte es lo que
// el IESS publica hoy de esos meses, que casi nunca cambia.
//
// Entrada: `--entrada=` (JSON de Python): { sal, personas: { <sha256(sal + cédula)>: { corte: "AAAA-MM", fecha: ISO } } }. Ni la entrada
// ni la salida llevan la cédula. Salida: `--salida=` (JSONL), una fila por persona con el estado del peldaño 1, el bruto y el neto.
// No consulta AWS, Proveedor_Info_1, Equifax ni el modelo de lenguaje, y no escribe en la base.
//
//   node scripts/predictor-ingresos/paridad-del-sueldo.mjs --entrada=<json> --salida=<jsonl>
//
// AVISO: este archivo no pasa por lint ni build ni por el control `guiones`. Antes de commitear: `node --check`.

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { raizPrincipal } from "../_comun/entorno.mjs";
import { buildStandardProfile } from "../../supabase/functions/_shared/process.ts";
import { datosDeCapacidad } from "../../supabase/functions/_shared/capacidad-de-pago.ts";
import { armarIngresoDelPerfil } from "../../supabase/functions/_shared/escalera-del-ingreso.ts";

const RAIZ = path.resolve(import.meta.dirname, "..", "..");
const PRINCIPAL = raizPrincipal(RAIZ);
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const ENTRADA = arg("entrada");
const SALIDA = arg("salida");
if (!ENTRADA || !SALIDA) throw new Error("Uso: --entrada=<json> --salida=<jsonl>");

// El respaldo más reciente manda: el de la reconsulta entera del 03/10, después el del 25/09 y la muestra fija.
const CARPETAS = ["proveedor-info-1-raw-2026-10-03", "proveedor-info-1-raw-2026-09-25", "proveedor-info-1-raw"].map((c) => path.join(PRINCIPAL, "research", c));

// El cambio de nombre del proveedor reescribió los perfiles, no el crudo (scripts/_comun/crudo-del-ultimo-perfil.mjs): la misma traducción.
const CLAVE_ANTERIOR = "pensionAlimenticia" + "Nova" + "data";
const conLaClaveActual = (raw) => (raw && CLAVE_ANTERIOR in raw
  ? Object.fromEntries(Object.entries(raw).map(([k, v]) => [k === CLAVE_ANTERIOR ? "pensionAlimenticiaProveedorInfo1" : k, v]))
  : raw);

const mes = (a) => (Number.isFinite(Number(a?.anio)) && Number.isFinite(Number(a?.mes)) ? `${a.anio}-${String(a.mes).padStart(2, "0")}` : null);

// Los aportes posteriores al corte no existían el día de la consulta de AWS. Están en basesInternas.data.data.tiess o en basesInternas.data.tiess.
function cortarAportes(raw, corte) {
  const bi = raw?.basesInternas;
  const cont = bi?.data?.data && Array.isArray(bi.data.data.tiess) ? bi.data.data : bi?.data && Array.isArray(bi.data.tiess) ? bi.data : null;
  if (!cont) return { raw, despues: 0 };
  const antes = cont.tiess.length;
  const tiess = cont.tiess.filter((a) => { const m = mes(a); return m === null || m <= corte; });
  const nuevoCont = { ...cont, tiess };
  const nuevoBi = bi.data.data === cont ? { ...bi, data: { ...bi.data, data: nuevoCont } } : { ...bi, data: nuevoCont };
  return { raw: { ...raw, basesInternas: nuevoBi }, despues: antes - tiess.length };
}

// El reloj en la fecha de la consulta de AWS, como recalcular-fuentes-ingreso.mjs: la edad y lo que dependa de hoy.
function enFecha(instante, fn) {
  const DateReal = globalThis.Date;
  const fijo = new DateReal(instante).getTime();
  class DateFijo extends DateReal {
    constructor(...a) { super(...(a.length ? a : [fijo])); }
    static now() { return fijo; }
  }
  globalThis.Date = DateFijo;
  try { return fn(); } finally { globalThis.Date = DateReal; }
}

const entrada = JSON.parse(fs.readFileSync(ENTRADA, "utf8"));
const huella = (cedula) => crypto.createHash("sha256").update(entrada.sal + cedula).digest("hex");
const filas = [];
const vistas = new Set();
const cuenta = { crudos_leidos: 0, sin_raw: 0, fallas: 0 };
for (const carpeta of CARPETAS) {
  if (!fs.existsSync(carpeta)) continue;
  for (const archivo of fs.readdirSync(carpeta).filter((x) => x.endsWith(".json"))) {
    const cedula = archivo.slice(0, -5);
    const h = huella(cedula);
    const p = entrada.personas[h];
    if (!p || vistas.has(h)) continue;
    vistas.add(h);
    cuenta.crudos_leidos++;
    const crudo = JSON.parse(fs.readFileSync(path.join(carpeta, archivo), "utf8"));
    const raw = conLaClaveActual(crudo.raw ?? crudo);
    if (!raw?.basesInternas) { cuenta.sin_raw++; filas.push({ huella: h, estado: "sin_bases_internas" }); continue; }
    try {
      const { raw: cortado, despues } = cortarAportes(raw, p.corte);
      const fila = enFecha(p.fecha, () => {
        const perfil = buildStandardProfile(cortado, cedula, p.corte).profile;
        const datos = datosDeCapacidad(perfil, null, new Date(p.fecha));
        const p1 = armarIngresoDelPerfil(perfil, datos).peldanos.find((x) => x.numero === 1);
        const fi = perfil.fuentesIngreso ?? {};
        return {
          huella: h, estado: p1.estado, motivo: p1.motivo, bruto: p1.montoMensual, neto: p1.ingresoNeto,
          sueldos: datos.ingresos.filter((x) => x.tipo === "sueldo").length, segmento: fi.segmento ?? null, corte_usado: fi.corteIessUsado ?? null,
          aportes_despues_del_corte: despues,
        };
      });
      filas.push(fila);
    } catch (e) {
      cuenta.fallas++;
      filas.push({ huella: h, estado: "falla", motivo: String(e?.message ?? e).slice(0, 120) });
    }
  }
}
fs.writeFileSync(SALIDA, filas.map((f) => JSON.stringify(f)).join("\n") + "\n");
console.log(JSON.stringify({ personas_pedidas: Object.keys(entrada.personas).length, ...cuenta, filas: filas.length }));
