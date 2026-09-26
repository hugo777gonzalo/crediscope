// Rótulos de las fuentes de ingreso, compartidos por las pantallas que las
// muestran. La clasificación la calcula fuentes-ingreso.ts al generar cada
// perfil; el conteo sobre la cartera lo hace la base
// (resumen_fuentes_ingreso, migración 081) -- antes se contaba acá, sobre
// las 1.000 filas que PostgREST dejaba pasar.

import { esIngresoMinimoSbu, INGRESO_MINIMO_SBU } from "./ingresosCampos.js";

export const ETIQUETA_SEGMENTO = {
  dependiente_privado: "Dependiente privado",
  publico: "Sector público",
  diplomatico: "Misión diplomática u organismo internacional",
  independiente: "Independiente",
  empleo_domestico: "Empleo doméstico",
  agricola: "Agrícola",
  trabajo_hogar: "Trabajo no remunerado del hogar",
  jubilado: "Jubilado",
  jubilado_con_ingreso_adicional: "Jubilado con ingreso adicional",
  ingresos_mixtos: "Ingresos mixtos",
  informal_o_sin_actividad: "Informal o sin actividad",
  sin_datos: "Sin datos: la fuente no respondió",
  no_clasificado: "Tipo de aporte no reconocido",
};

// Hasta el 2026-09-26 había acá un "cómo puede fallar" por segmento
// ("quiebra del empleador, despido, crisis del sector"). Se sacó de todas
// las pantallas y de la exportación a pedido del negocio: eran
// generalidades del segmento, no hechos de la persona, y se leían como si
// lo fueran.

// Quién declara el monto, con los nombres que eligió el negocio el
// 2026-09-26. Hasta ese día eran "Reportada por un tercero",
// "Autodeclarada" e "Indirecta", que no se entendían sin haber estado en el
// diseño. Esta tabla es la genérica (reglas, panorama); para una fuente
// concreta se usa quienDeclara(), que nombra el tipo de empleador.
export const ETIQUETA_EVIDENCIA = {
  reportada_por_tercero: "Empleador privado, público, diplomático, externo u otros",
  autodeclarada_sobre_minimo: "Empresa propia o afiliación voluntaria, más que el SBU",
  autodeclarada_en_minimo: "Empresa propia o afiliación voluntaria",
  // RUC activo, nómina, jubilación o pensión: consta que existen, pero
  // ninguna fuente pública trae cuánto dejan.
  indirecta: "Sin monto: consta que existe",
};

const EMPLEADOR_POR_NATURALEZA = { privado: "Empleador privado", publico: "Empleador público" };

// El código 29 del IESS junta embajadas y organismos internacionales
// ("29-EMBAJADAS, MISIONES DIPL., CONSULARES, ORG. INTERNACIONALES") y no
// hay otro campo que los separe: se distinguen por el nombre del empleador.
// Al 2026-09-26 las 2 personas de la cartera con código 29 trabajan en
// organismos internacionales (Universidad Andina Simón Bolívar, OIM).
const ES_MISION_DIPLOMATICA = /EMBAJADA|CONSULADO|CONSULAR|MISI[OÓ]N DIPLOM/i;

// Quién declara el monto de UNA fuente, con los nombres que decidió el
// negocio el 2026-09-26:
//   Empleador privado / público;
//   Empleador diplomático (embajada, consulado) / Empleador externo (sólo
//     organismos internacionales);
//   Otros empleadores (doméstico, agrícola y código no reconocido);
//   Empresa propia (se afilia como patrono o tiene RUC activo) /
//     Afiliación voluntaria (aporta por su cuenta sin negocio registrado:
//     puede ser sólo para no perder la seguridad social).
export function quienDeclara(fuente, perfil) {
  if (fuente.evidencia === "reportada_por_tercero") {
    if (fuente.naturaleza === "diplomatico") {
      return ES_MISION_DIPLOMATICA.test(String(fuente.empleador ?? "")) ? "Empleador diplomático" : "Empleador externo";
    }
    return EMPLEADOR_POR_NATURALEZA[fuente.naturaleza] ?? "Otros empleadores";
  }
  if (fuente.evidencia === "indirecta") return ETIQUETA_EVIDENCIA.indirecta;
  const conNegocio = fuente.tipo === "aporte como patrono de su propio negocio" || perfil?.laboral?.tieneRucActivo === true;
  return conNegocio ? "Empresa propia" : "Afiliación voluntaria";
}

// Los nombres de lo que el perfil guarda como senalesDeEscala ("Tamaño del
// negocio" en pantalla). "establecimientos registrados" es de perfiles
// anteriores a fuentes-v8, que contaban también los cerrados.
export const ETIQUETA_SENAL = {
  "nómina que paga": "Nómina",
  "establecimientos activos": "Establecimientos Activos (SRI)",
  "establecimientos registrados": "Establecimientos registrados (SRI)",
  "obligado a llevar contabilidad": "Obligado a llevar contabilidad",
};

export const DOCUMENTOS_DE_CONFIRMACION = "Documentos de Confirmación de Ingresos";

// Los estados dicen qué falta, no una categoría interna. Antes:
// Confirmada / Provisional / Indeterminada.
export const ETIQUETA_ESTADO = {
  confirmada: "Confirmado por un tercero",
  provisional: "Por confirmar",
  indeterminada: "Sin determinar",
};

const MONEDA = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const formatMoneda = (n) => (n === null || n === undefined ? "—" : MONEDA.format(n));

// El ingreso reportado al IESS, dicho como se dice en Ecuador: el monto, y
// "Ingreso Mínimo SBU" cuando es el salario básico del año del corte. Nunca
// "piso" (pedido del negocio, 2026-09-25). Una sola función para todas las
// pantallas que lo muestran.
export function textoIngresoReportado(monto, corte) {
  if (monto === null || monto === undefined || monto === "" || !(Number(monto) > 0)) return "—";
  const texto = formatMoneda(Number(monto));
  return esIngresoMinimoSbu(Number(monto), corte) ? `${texto} · ${INGRESO_MINIMO_SBU}` : texto;
}
