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
