// Formato de valores para la pantalla "Perfil Aval" del analista —
// análogo a formatValor en perfilClienteCampos.js, pero con el
// vocabulario de tipos de aval-estructura.ts (texto/entero/decimal/
// dinero/fecha/booleano), que es distinto del de Novadata (moneda/lista/
// meses/...). Vive aparte para no mezclar dos vocabularios en un mismo
// switch.

const MONEDA = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const ENTERO = new Intl.NumberFormat("es-EC");
const PORCENTAJE = new Intl.NumberFormat("es-EC", { style: "percent", maximumFractionDigits: 2 });

// Aval entrega fechas como "2025-10-31" -- una FECHA DE CORTE que Aval ya
// resolvió, no un instante UTC. Pasarla por Date()+zona horaria (como
// hace fechas.js con created_at) la corre un día para atrás: new
// Date("2025-10-31") es medianoche UTC, y a las 19:00 de Ecuador del día
// 30 -- exactamente el error que fechas.js existe para evitar, pero al
// revés. Se reformatea el string tal cual, sin crear un Date.
function formatearFechaCorte(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(v);
}

// clientesPeorScore, tasaMalos y participacionAcreedorPrincipal son
// fracciones (0..1): se leen mejor como porcentaje que como "0.0147".
// (participacion recién desde aval-estructura-v4: antes venía en 0-100 y
// esto la mostraba como "2.262 %".)
export function formatearValorAval(valor, tipo) {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (tipo) {
    case "dinero":
      return MONEDA.format(valor);
    case "entero":
      return ENTERO.format(valor);
    case "decimal":
      return PORCENTAJE.format(valor);
    case "fecha":
      return formatearFechaCorte(valor);
    case "booleano":
      return valor ? "Sí" : "No";
    default:
      return String(valor);
  }
}

// Score 0 no es "el peor riesgo": es un archivo sin operaciones de crédito
// (93 de las 240 del pool; tipoScore vacío y tasaMalos 0). Rotularlo
// "Riesgo alto" -- o mostrar su tasaMalos como "0 % de probabilidad de
// caer en vencido" -- diría lo contrario de lo que Aval sabe, que es nada.
export function tieneScoreAval(score) {
  return typeof score === "number" && score > 0;
}

// Los cortes son los mismos 400/700 con los que ScoreGauge ya pinta el
// arco, así que el rótulo nombra lo que el color ya decía. Contra la
// probabilidad que Aval publica calzan exacto (medido sobre las 240 del
// pool, sin una sola inversión entre score y tasaMalos en 146 casos):
// debajo de 400 la tasaMalos va de 37,6 % a 95,7 %; entre 400 y 699, de
// 11,8 % a 37,6 %; desde 700, de 0,8 % a 11,8 %.
export function bandaDeRiesgoAval(score) {
  if (!tieneScoreAval(score)) return { etiqueta: "Sin historial crediticio", clase: "crediscope-tag-neutral" };
  if (score < 400) return { etiqueta: "Riesgo alto", clase: "crediscope-tag-bad" };
  if (score < 700) return { etiqueta: "Riesgo medio", clase: "crediscope-tag-warn" };
  return { etiqueta: "Riesgo bajo", clase: "crediscope-tag-ok" };
}
