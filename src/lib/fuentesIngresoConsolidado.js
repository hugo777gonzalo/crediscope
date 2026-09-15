// Agregación de las fuentes de ingreso sobre toda la cartera
// consultada. La clasificación la calcula fuentes-ingreso.ts al generar
// cada Perfil del Cliente; acá solo se cuenta y se agrupa.
//
// Se toma el ÚLTIMO perfil de cada cliente: consultarlo dos veces no lo
// convierte en dos personas.

import { ultimoPorCliente } from "./reporteGerencial.js";

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
  no_clasificado: "Tipo de aporte no reconocido",
};

// Por qué existe cada segmento: no es de dónde viene la plata, es cómo
// puede fallar. Se muestra en la pantalla para que la separación se
// entienda sin tener que leer el código.
export const RIESGO_SEGMENTO = {
  dependiente_privado: "Quiebra del empleador, despido, crisis del sector",
  publico: "Decisión política: una ley, un ministerio que cierra",
  diplomatico: "Ajeno a la política local; de los más estables",
  independiente: "No se conoce el ingreso real",
  empleo_domestico: "Vínculo precario, sin respaldo institucional",
  agricola: "Estacional; clima y precios",
  trabajo_hogar: "Sin ingreso propio",
  jubilado: "Casi no falla: el pago es del Estado y es vitalicio",
  jubilado_con_ingreso_adicional: "Pensión estable más una actividad a verificar",
  ingresos_mixtos: "Diversificado: dos fuentes de naturaleza distinta",
  informal_o_sin_actividad: "No se puede determinar si hay ingreso",
  no_clasificado: "Código de empleador fuera del catálogo: requiere revisión manual",
};

export const ETIQUETA_EVIDENCIA = {
  reportada_por_tercero: "Reportada por un tercero",
  autodeclarada_sobre_minimo: "Autodeclarada, sobre el mínimo",
  autodeclarada_en_minimo: "Autodeclarada, en el mínimo legal",
  indirecta: "Indirecta (hay actividad, no hay monto)",
};

export const ETIQUETA_ESTADO = {
  confirmada: "Confirmada",
  provisional: "Provisional",
  indeterminada: "Indeterminada",
};

const MONEDA = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
export const formatMoneda = (n) => (n === null || n === undefined ? "—" : MONEDA.format(n));

// Acepta las dos formas: las columnas planas del resumen (lo que usa el
// panorama) o el perfil completo (lo que usa el detalle). Así una sola
// función sirve a las dos pantallas sin que ninguna baje de más.
function clasificacionDe(p) {
  if (p.standard_profile?.fuentesIngreso) return p.standard_profile.fuentesIngreso;
  if (!p.fuente_segmento) return null;
  return {
    segmento: p.fuente_segmento,
    estadoSegmento: p.fuente_estado,
    version: p.fuente_version,
    corteIessUsado: p.fuente_corte,
    pisoIngresoMensualReportado: p.fuente_piso_ingreso === null ? null : Number(p.fuente_piso_ingreso),
    fuentes: [],
    senalesDeEscala: [],
    paraConfirmar: [],
    apareceEnUltimoCorte: null,
    corteDesactualizado: false,
  };
}

export function consolidar(perfilesRaw) {
  const perfiles = ultimoPorCliente(perfilesRaw)
    .map((p) => ({ fila: p, f: clasificacionDe(p) }))
    .filter((x) => x.f?.segmento);

  const total = perfiles.length;
  const porSegmento = {};
  const porEstado = {};
  const porEvidencia = {};
  const cortes = {};
  let conPiso = 0;
  let sumaPisos = 0;
  let desvinculados = 0;
  let corteDesactualizado = 0;
  let nominaTotal = 0;
  let conNomina = 0;
  let obligadosContabilidad = 0;
  const requierenRespaldo = [];

  for (const { fila, f } of perfiles) {
    porSegmento[f.segmento] = (porSegmento[f.segmento] ?? 0) + 1;
    porEstado[f.estadoSegmento] = (porEstado[f.estadoSegmento] ?? 0) + 1;
    if (f.corteIessUsado) cortes[f.corteIessUsado] = (cortes[f.corteIessUsado] ?? 0) + 1;
    if (f.corteDesactualizado) corteDesactualizado++;
    if (f.apareceEnUltimoCorte === false) desvinculados++;
    if (f.pisoIngresoMensualReportado) {
      conPiso++;
      sumaPisos += f.pisoIngresoMensualReportado;
    }
    for (const fuente of f.fuentes ?? []) {
      porEvidencia[fuente.evidencia] = (porEvidencia[fuente.evidencia] ?? 0) + 1;
    }
    for (const senal of f.senalesDeEscala ?? []) {
      if (senal.senal === "nómina que paga" && senal.valor) {
        nominaTotal += senal.valor;
        conNomina++;
      }
      if (senal.senal === "obligado a llevar contabilidad") obligadosContabilidad++;
    }
    // Lo accionable: a quién hay que pedirle respaldo y qué.
    if (f.estadoSegmento !== "confirmada" && (f.paraConfirmar ?? []).length) {
      requierenRespaldo.push({
        clientId: fila.client_id,
        cedula: fila.clients?.cedula ?? null,
        perfilId: fila.id,
        segmento: f.segmento,
        estado: f.estadoSegmento,
        motivo: f.motivoSegmento,
        pedir: f.paraConfirmar,
      });
    }
  }

  const lista = (obj) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([clave, n]) => ({ clave, n, pct: total ? Math.round((n / total) * 100) : 0 }));

  return {
    total,
    // Perfiles anteriores al módulo: no tienen la clasificación y no se
    // pueden recalcular sin volver a consultar la fuente (el crudo no se
    // guarda). Se informa en pantalla en vez de disimular el hueco.
    sinClasificar: ultimoPorCliente(perfilesRaw).length - total,
    segmentos: lista(porSegmento),
    estados: lista(porEstado),
    evidencias: Object.entries(porEvidencia)
      .sort((a, b) => b[1] - a[1])
      .map(([clave, n]) => ({ clave, n })),
    conPiso,
    pisoPromedio: conPiso ? Math.round(sumaPisos / conPiso) : null,
    pisoTotal: Math.round(sumaPisos),
    desvinculados,
    corteDesactualizado,
    cortes: Object.entries(cortes).sort((a, b) => b[1] - a[1]),
    nominaTotal: Math.round(nominaTotal),
    conNomina,
    obligadosContabilidad,
    requierenRespaldo,
  };
}
