import { get, GRUPOS_CONFIG } from "./perfilClienteCampos.js";

// Métricas agregadas para el Reporte Gerencial de Gestión (pestaña
// Reportes) -- pensado para un Jefe/Coordinador/Sub-gerente, sobre TODA
// la cartera de clientes consultados, no un cliente a la vez.
//
// Base de cálculo: el último client_profiles/analysis_results de cada
// cliente (deduplicado por client_id) -- una persona reconsultada 5
// veces cuenta 1 vez en "distribución de score"/"riesgo", no 5. Para
// "actividad"/"tendencia" (cuánto se usó la app) SÍ se cuentan todas
// las consultas, deduplicar ahí ocultaría el volumen real de trabajo.
//
// Escala: esto trae TODO client_profiles/analysis_results a memoria y
// agrega en JS -- correcto y simple mientras la cartera sea de cientos/
// pocos miles de clientes (hoy: decenas). Si crece mucho, esto debería
// moverse a una vista/agregación en Postgres.

export function ultimoPorCliente(rows) {
  const vistos = new Set();
  const out = [];
  for (const r of rows || []) {
    if (vistos.has(r.client_id)) continue;
    vistos.add(r.client_id);
    out.push(r);
  }
  return out;
}

function claseScore(score) {
  if (score >= 700) return "bueno";
  if (score >= 400) return "medio";
  return "malo";
}

const NOMBRES_MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function ultimosNMeses(n) {
  const ahora = new Date();
  const meses = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
    meses.push({ clave: `${d.getFullYear()}-${d.getMonth()}`, etiqueta: `${NOMBRES_MES[d.getMonth()]} ${String(d.getFullYear()).slice(2)}` });
  }
  return meses;
}

export function calcularMetricas({ perfilesRaw, analisisRaw, nombrePorId }) {
  const perfiles = ultimoPorCliente(perfilesRaw);
  const analisis = ultimoPorCliente(analisisRaw);

  const totalClientes = perfiles.length;
  const totalAnalizados = analisis.length;

  const distribucionScore = { bueno: 0, medio: 0, malo: 0 };
  let sumaScore = 0;
  for (const a of analisis) {
    sumaScore += a.crediscope_score;
    distribucionScore[claseScore(a.crediscope_score)]++;
  }
  const scorePromedio = totalAnalizados ? Math.round(sumaScore / totalAnalizados) : null;

  const pct = (n) => (totalClientes ? Math.round((n / totalClientes) * 100) : 0);

  const conDemandaCrediticia = perfiles.filter((p) => (get(p.standard_profile, "riesgoJudicialCrediticio.numeroDemandasComoDemandado") ?? 0) > 0).length;
  const conCalificacionBaja = perfiles.filter((p) => ["D", "E"].includes(get(p.standard_profile, "comportamientoBancario.peorCalificacionRiesgo"))).length;
  const conMora = perfiles.filter(
    (p) => (get(p.standard_profile, "comportamientoBancario.saldoEnMoraBuroCredito") ?? 0) > 0 || (get(p.standard_profile, "comportamientoCooperativas.saldoEnMora") ?? 0) > 0
  ).length;
  const conBloqueo = perfiles.filter((p) => p.control_bloqueo?.bloqueado).length;

  const independientes = perfiles.filter((p) => get(p.standard_profile, "laboral.esIndependiente")).length;
  const dependientes = perfiles.filter((p) => get(p.standard_profile, "laboral.empleoActual")).length;
  const jubilados = perfiles.filter((p) => get(p.standard_profile, "seguridadSocial.esJubilado")).length;
  const pensionistas = perfiles.filter((p) => get(p.standard_profile, "seguridadSocial.esPensionista")).length;

  const conRespaldoPatrimonial = perfiles.filter((p) => get(p.standard_profile, "patrimonio.tieneVehiculos") || (get(p.standard_profile, "patrimonio.numeroInmuebles") ?? 0) > 0).length;
  const valorColateralTotal = perfiles.reduce((s, p) => s + (get(p.standard_profile, "patrimonio.valorColateralVehiculos") ?? 0), 0);

  const meses = ultimosNMeses(6);
  const consultasPorMes = meses.map((m) => ({
    ...m,
    total: perfilesRaw.filter((p) => {
      const d = new Date(p.created_at);
      return `${d.getFullYear()}-${d.getMonth()}` === m.clave;
    }).length,
  }));

  const conteoPorAnalista = {};
  for (const p of perfilesRaw) {
    const nombre = nombrePorId[p.requested_by] || "Sin asignar";
    conteoPorAnalista[nombre] = (conteoPorAnalista[nombre] || 0) + 1;
  }
  const actividadPorAnalista = Object.entries(conteoPorAnalista).sort((a, b) => b[1] - a[1]);

  return {
    totalClientes,
    totalAnalizados,
    scorePromedio,
    distribucionScore,
    riesgo: [
      { etiqueta: "Con demanda de cobro/crediticia", valor: conDemandaCrediticia, pct: pct(conDemandaCrediticia) },
      { etiqueta: "Calificación baja en buró (D/E)", valor: conCalificacionBaja, pct: pct(conCalificacionBaja) },
      { etiqueta: "Mora bancaria o en cooperativas", valor: conMora, pct: pct(conMora) },
      { etiqueta: "Control de bloqueo activo", valor: conBloqueo, pct: pct(conBloqueo) },
    ],
    laboral: [
      { etiqueta: "Independientes", valor: independientes, pct: pct(independientes) },
      { etiqueta: "Dependientes (empleo actual)", valor: dependientes, pct: pct(dependientes) },
      { etiqueta: "Jubilados", valor: jubilados, pct: pct(jubilados) },
      { etiqueta: "Pensionistas", valor: pensionistas, pct: pct(pensionistas) },
    ],
    patrimonio: { conRespaldoPatrimonial, pct: pct(conRespaldoPatrimonial), valorColateralTotal },
    consultasPorMes,
    actividadPorAnalista,
    perfiles,
  };
}

// ---------- Explorador por eje ----------
// Reutiliza GRUPOS_CONFIG (la misma curación de campos que ve el
// analista en Perfil del Cliente) para agregar CUALQUIER eje sin
// lógica particular por grupo: según el `tipo` de cada campo, calcula
// % (booleano), promedio (numero/moneda/meses) o distribución de
// valores más frecuentes (texto/lista/estado).
export function agregarCampo(perfiles, campo, tipo) {
  const valores = perfiles.map((p) => get(p.standard_profile, campo)).filter((v) => v !== null && v !== undefined && v !== "");
  const conDato = valores.length;
  if (conDato === 0) return { tipo: "vacio", conDato: 0 };

  if (tipo === "booleano_si_true") {
    const conTrue = valores.filter((v) => v === true).length;
    return { tipo: "porcentaje", conDato, pct: Math.round((conTrue / perfiles.length) * 100) };
  }
  if (tipo === "numero" || tipo === "moneda" || tipo === "meses") {
    const promedio = valores.reduce((a, b) => a + b, 0) / valores.length;
    return { tipo: "promedio", conDato, promedio };
  }
  const contador = {};
  const agregarValor = (v) => {
    contador[v] = (contador[v] || 0) + 1;
  };
  for (const v of valores) {
    if (Array.isArray(v)) v.forEach(agregarValor);
    else agregarValor(v);
  }
  const top = Object.entries(contador)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  return { tipo: "distribucion", conDato, top };
}

export function camposDeEje(grupo) {
  return GRUPOS_CONFIG[grupo]?.campos ?? [];
}
