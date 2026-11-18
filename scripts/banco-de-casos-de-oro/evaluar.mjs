// Evalúa las afirmaciones automáticas de un caso del banco de casos de oro contra
// una respuesta del modelo (o contra un análisis ya guardado, con la misma forma).
// Función pura, sin base ni red: la usa el corredor (scripts/correr-banco-de-casos.mjs).
//
// La respuesta tiene la forma de ESQUEMA_RESPUESTA de llm-scoring.ts: score,
// recomendacion, accionesSugeridas, indicadorRiesgo, indicadorHistorial, positives,
// negatives, missingInfo y reasoning.
//
// AVISO: este archivo no pasa por lint ni build.

import { INDICADORES, TIPOS_DE_ACCION } from "./formato.mjs";

const textoDelCampo = (respuesta, campo) => {
  if (campo === "todo") return JSON.stringify(respuesta);
  const v = respuesta[campo];
  return Array.isArray(v) ? v.join("\n") : String(v ?? "");
};

// La primera oración: hasta el primer punto, cierre de interrogación o de exclamación
// seguido de espacio. Un «S.A.» o un «1.5» no la corta (exige espacio y mayúscula después).
export function primeraOracion(texto) {
  const t = String(texto ?? "").trim();
  const corte = t.search(/[.!?](?=\s+[A-ZÁÉÍÓÚÑ¿¡"«])/u);
  return corte === -1 ? t : t.slice(0, corte + 1);
}

/** Evalúa una afirmación automática: { ok, detalle } (el detalle dice lo que dijo el modelo si falló). */
export function evaluarAfirmacion(a, respuesta) {
  switch (a.tipo) {
    case "score_entre": {
      const s = respuesta.score;
      return { ok: Number.isFinite(s) && s >= a.min && s <= a.max, detalle: `score ${s}, se esperaba entre ${a.min} y ${a.max}` };
    }
    case "indicador": {
      const valor = respuesta[INDICADORES[a.indicador].campo];
      return { ok: a.valores.includes(valor), detalle: `indicador de ${a.indicador} «${valor ?? "sin valor"}», se esperaba ${a.valores.join(" o ")}` };
    }
    case "texto_prohibido": {
      const re = new RegExp(a.patron, "iu");
      const donde = a.campos.filter((c) => re.test(textoDelCampo(respuesta, c)));
      return { ok: donde.length === 0, detalle: `aparece el patrón prohibido /${a.patron}/ en ${donde.join(", ")}` };
    }
    case "texto_requerido": {
      const re = new RegExp(a.patron, "iu");
      return { ok: a.campos.some((c) => re.test(textoDelCampo(respuesta, c))), detalle: `no aparece /${a.patron}/ en ${a.campos.join(", ")}` };
    }
    case "accion": {
      const re = TIPOS_DE_ACCION[a.accion];
      return { ok: (respuesta.accionesSugeridas ?? []).some((x) => re.test(x)), detalle: `ninguna acción sugerida es de tipo ${a.accion}` };
    }
    case "primera_frase": {
      const re = new RegExp(a.patron, "iu");
      return { ok: re.test(primeraOracion(respuesta.reasoning)), detalle: `la primera oración del razonamiento no calza con /${a.patron}/` };
    }
    default:
      return { ok: false, detalle: `tipo «${a.tipo}» desconocido` };
  }
}

/** Todas las afirmaciones automáticas de un caso: las que fallaron, con su porqué. */
export function evaluarCaso(caso, respuesta) {
  const fallas = [];
  caso.afirmaciones.automaticas.forEach((a, i) => {
    const r = evaluarAfirmacion(a, respuesta);
    if (!r.ok) fallas.push({ numero: i + 1, tipo: a.tipo, porque: a.porque, detalle: r.detalle });
  });
  return { total: caso.afirmaciones.automaticas.length, fallas };
}

/** La recomendación entregada, contra lo que el caso acepta hoy. */
export function entregaAceptable(caso, entregada) {
  const aceptadas = [caso.recomendacion_hoy, ...(caso.hoy_tambien_aceptable ?? [])].filter(Boolean);
  return { ok: aceptadas.includes(entregada), aceptadas };
}
