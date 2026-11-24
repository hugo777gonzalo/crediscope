# El adicional del dependiente por componente: la sesión 1 de docs/propuesta-adicional-del-dependiente.md (datos y etiquetas, sin modelo).
#
# Por qué existe: el extra del dependiente ya falló como etiqueta «total validado menos sueldo» (12.14 y 12.36: AUC 0,687, R² 0,01). En AWS cada
# ítem de ingreso del titular dice de dónde sale (fuente, montos por tipo, observación) y `estado`, el check con que el analista elige qué
# ítems cuentan para el total. Separando por componente queda una etiqueta más chica y más limpia. Este guion arma esa etiqueta, una fila por
# persona con su grado (A, B, C, arriendo o jubilación, fuera, negativo), y mide lo que la propuesta dejó abierto:
#   - qué es el «IESS no recuperado» (un ítem de fuente IESS que no es el recuperado del proveedor);
#   - qué son los ítems sin el check;
#   - la paridad del sueldo de AWS (`ver_f`) con el peldaño 1 de producción (el sueldo reportado al IESS menos el aporte personal).
#
# No entrena nada (el modelo es la sesión 2). Lee sólo las extracciones de AWS ya bajadas (`research/ingresos-aws/`, de la carpeta principal) y,
# para la paridad, los respaldos del crudo de Proveedor_Info_1 de la cartera (`research/proveedor-info-1-raw*`), que pasa por el código de
# producción en `paridad-del-sueldo.mjs`. No consulta AWS, Equifax ni Proveedor_Info_1, no usa el modelo de lenguaje y no escribe en la base.
#
# Salidas:
#   - `RESULTADOS/adicional-por-componente.parquet`: una fila por persona, sin identificación (la id de consulta y la de persona del
#     requerimiento son de AWS). Fuera de git.
#   - `metricas/adicional-por-componente-2026-11.json`: sólo conteos, porcentajes y medianas de grupos de 50 o más. Va a git.
#
#   python -I scripts/predictor-ingresos/adicional_por_componente.py
#   python -I scripts/predictor-ingresos/adicional_por_componente.py --sin-paridad      (sin Node; la paridad queda «no medida»)
import hashlib
import json
import secrets
import subprocess
import sys
import time
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
import preparar as p

AQUI = Path(__file__).parent
METRICAS = AQUI / "metricas" / "adicional-por-componente-2026-11.json"
TABLA = c.RESULTADOS / "adicional-por-componente.parquet"
APORTE_PERSONAL = 0.0945  # PARAMETROS_CAPACIDAD.aportePersonalIess de capacidad-de-pago.ts: el peldaño 1 es el bruto menos esto
MIN_GRUPO = 50  # un grupo más chico no lleva medianas de montos en el agregado
# El flujo de efectivo guarda versiones (y los ítems apagados) recién desde esta fecha (base-aws-originacion.md, punto 12; 12.15).
INICIO_AUDITORIA = pd.Timestamp("2026-03-08")
# Las cifras de la sección 2 de la propuesta (componentes.py de la sesión de A14): este guion tiene que dar lo mismo.
ESPERADO = {"personas": 39017, "material": 9106, "cuentas o IVA": 1356, "cuentas o IVA con archivo": 393, "declarado": 5881,
            "IESS no recuperado": 1171, "predictor": 477, "arriendo": 152, "jubilación": 69, "ruc_activo": 3874, "ruc_activo_material": 1523}

CLASES = ["cuentas o IVA", "IESS no recuperado", "declarado", "predictor", "arriendo", "jubilación"]


def pct(x):
    return round(100 * float(x), 1)


def mediana(s):
    s = pd.Series(s).dropna()
    return round(float(s.median()), 0) if len(s) >= MIN_GRUPO else None


def poblacion(con):
    """Dependientes y públicos con sueldo recuperado del IESS, una consulta por persona (la más reciente), como la sección 2."""
    a = p.armar_consultas(con)
    a["id_persona_requerimiento"] = pd.to_numeric(a.id_persona_requerimiento, errors="coerce").astype("Int64")
    d = a[a.rel.isin(["DEPENDIENTE", "PUBLICO"]) & (a.ver_f > 0) & (a.med_ivt > 0) & (a.med_ivt < 60000)].reset_index(drop=True)
    d["ruc_activo"] = (d.sri_ruc == 1) & (d.sri_estado == "ACTIVO")
    d["ok"] = d.med_resp.isin(c.OK_FACTURAR)
    d["auditado"] = d.t >= INICIO_AUDITORIA
    return d


def flujos(con, ids):
    """Los ítems de ingreso del titular, cada uno con su clase. «recuperado» es el sueldo del IESS que trajo el proveedor (lo verificado)."""
    fl = con.execute(f"""select try_cast(id_persona_requerimiento as bigint) ipr, try_cast(id_flujo_efectivo as bigint) id_flujo,
        upper(coalesce(fuente_ingreso,'')) fuente, upper(coalesce(tipo_actividad,'')) actividad, upper(coalesce(relacion_dependencia,'')) relacion,
        estado, upper(coalesce(observacion_categoria,'')) obs, coalesce(ingreso,0) ingreso, coalesce(monto_declarado,0) m_decl,
        coalesce(monto_banco_principal,0)+coalesce(monto_banco_secundaria,0) m_banco, coalesce(monto_iva,0)+coalesce(monto_iva_semestral,0) m_iva
        from {p.leer('ingresos_por_actividad')} where tipo_deudor='TITULAR'""").df()
    fl = fl[fl.ipr.isin(ids) & (fl.ingreso > 0)].reset_index(drop=True)
    fl["recuperado"] = fl.obs.str.startswith("RECUPERADO " + p.CATEGORIA_RECUPERADO)
    fl["pred"] = fl.obs.str.contains("PREDICTOR")
    # El orden decide: lo recuperado y lo marcado predictor primero, después lo que trae montos de cuentas o IVA (aunque la fuente diga otra cosa).
    fl["clase"] = np.select(
        [fl.recuperado, fl.pred, (fl.m_banco > 0) | (fl.m_iva > 0) | fl.fuente.isin(["CUENTAS", "IVAS"]), fl.fuente == "IESS", fl.fuente == "JUBILACION", fl.fuente == "ARRIENDOS"],
        ["sueldo recuperado", "predictor", "cuentas o IVA", "IESS no recuperado", "jubilación", "arriendo"], default="declarado")
    fl["sel"] = fl.estado.fillna(False).astype(bool)
    # Un ítem apagado con el mismo monto (a USD 1) que un ítem con el check de la misma persona es el mismo ingreso escrito dos veces.
    con_check = set(zip(fl[fl.sel].ipr, fl[fl.sel].ingreso.round(0)))
    fl["duplica_uno_con_check"] = [(i, r) in con_check for i, r in zip(fl.ipr, fl.ingreso.round(0))]
    return fl


def documentos():
    doc = pd.read_csv(c.ENTRADAS / "documentos_por_persona.csv", encoding="utf-8-sig")
    arch = [x for x in doc.columns if x.startswith("arch_")]
    return doc.groupby("id_persona_requerimiento")[arch].sum(), arch


def por_persona(d, fl, doc):
    piv = fl[fl.sel & ~fl.recuperado].pivot_table(index="ipr", columns="clase", values="ingreso", aggfunc="sum", fill_value=0)
    for k in CLASES:
        if k not in piv.columns:
            piv[k] = 0.0
    piv = piv[CLASES]
    apagados = fl[~fl.sel & ~fl.recuperado]
    sin_check = apagados.groupby("ipr").ingreso.sum().rename("sin_check")
    sin_check_real = apagados[~apagados.duplica_uno_con_check].groupby("ipr").ingreso.sum().rename("sin_check_sin_duplicados")
    t = d.join(piv, on="id_persona_requerimiento").join(sin_check, on="id_persona_requerimiento").join(sin_check_real, on="id_persona_requerimiento")
    t = t.join(doc, on="id_persona_requerimiento")
    t[CLASES + ["sin_check", "sin_check_sin_duplicados"]] = t[CLASES + ["sin_check", "sin_check_sin_duplicados"]].fillna(0)
    t["adicional"] = t[CLASES].sum(axis=1)
    t["material"] = t.adicional >= np.maximum(100, 0.10 * t.ver_f)
    t["origen"] = np.where(t.material, t[CLASES].idxmax(axis=1), "sin adicional material")
    t["n_componentes"] = (t[CLASES] > 0).sum(axis=1)
    a0 = lambda col: t[col].fillna(0) > 0
    # El archivo que respalda cada origen (componentes.py): cuentas o IVA, los estados de cuenta o la declaración; arriendo, el contrato;
    # el IESS no recuperado, los roles; lo demás, la renta, el certificado de ingresos o los estados de cuenta.
    t["archivo_del_origen"] = np.select(
        [t.origen == "cuentas o IVA", t.origen == "arriendo", t.origen == "IESS no recuperado"],
        [a0("arch_mov_bancarios") | a0("arch_declaraciones_iva"), a0("arch_contratos_arriendo"), a0("arch_roles")],
        default=a0("arch_impuesto_renta") | a0("arch_cert_ingresos") | a0("arch_mov_bancarios"))
    t["cuadra"] = np.abs(t.ver_f + t.adicional - t.med_ivt) <= np.maximum(1, 0.01 * t.med_ivt)
    # Arriendo y jubilación son ingresos extra que la persona puede percibir (negocio, 2026-11-24): cuentan como adicional para entrenar, pero en
    # una columna aparte, para medir con y sin ellos (el arriendo trae el contrato en el 0,7%).
    t["adicional_arriendo_o_jubilacion"] = t["arriendo"] + t["jubilación"]
    # El grado de la etiqueta (sección 3 de la propuesta, con las respuestas del negocio del 2026-11-24, 6.6). El IESS no recuperado queda
    # fuera como el predictor: en los casos que abrió el negocio, el analista partió el ingreso del IESS en dos para llegar a la cifra de Equifax.
    t["grado"] = np.select(
        [(t.origen == "cuentas o IVA") & t.archivo_del_origen, t.origen == "cuentas o IVA", t.origen.isin(["arriendo", "jubilación"]), t.origen == "declarado",
         t.origen == "predictor", t.origen == "IESS no recuperado", t.adicional > 0],
        ["A", "B", "arriendo o jubilación", "C", "fuera: predictor", "fuera: IESS no recuperado", "negativo: adicional no material"],
        default="negativo: ningún ítem adicional")
    return t


def anclaje_a_la_cifra(con, t):
    """Cuántas veces el total validado queda cerca de la cifra de Equifax, por origen del adicional (12.15: el analista la veía al validar).
    La cifra se lee sólo para medir y para marcar `med_total_a_1pct_de_la_cifra`; nunca es una entrada (decisión del negocio del 2026-11-23,
    reafirmada el 2026-11-24, y `comun.PROHIBIDAS` la corta por el prefijo `med_`)."""
    cifra = con.execute(f"select try_cast(id_consulta_equifax as bigint) id_consulta_equifax, try_cast(income_predictor_equifax as double) cifra "
                        f"from {p.leer('predictor_equifax_por_consulta')}").df().drop_duplicates("id_consulta_equifax").set_index("id_consulta_equifax").cifra
    x = t.id_consulta_equifax.astype("int64").map(cifra)
    razon = t.med_ivt / x.where(x > 0)
    t["med_total_a_1pct_de_la_cifra"] = (razon - 1).abs() <= 0.01
    con_cifra = razon.notna()
    out = {"personas_con_la_cifra": int(con_cifra.sum()), "por_origen": {}}
    for k, g in t[con_cifra].groupby("origen"):
        r = razon[g.index]
        out["por_origen"][k] = {"n": len(g), "a_1pct_pct": pct(((r - 1).abs() <= 0.01).mean()), "a_5pct_pct": pct(((r - 1).abs() <= 0.05).mean()),
                                "mediana_total_sobre_cifra": round(float(r.median()), 2)}
    prueba = t.t >= c.CORTE_FECHA
    sin_ancla = ~t.med_total_a_1pct_de_la_cifra
    out["a_y_b_sin_los_casos_a_1pct"] = {g: {"todos": int(((t.grado == g) & sin_ancla).sum()), "en_la_prueba": int(((t.grado == g) & sin_ancla & prueba).sum()),
                                             "en_la_prueba_con_ruc_activo": int(((t.grado == g) & sin_ancla & prueba & t.ruc_activo).sum())} for g in ["A", "B"]}
    return out


def reproducir(t):
    m = t[t.material]
    obtenido = {"personas": len(t), "material": len(m), "cuentas o IVA": int((m.origen == "cuentas o IVA").sum()),
                "cuentas o IVA con archivo": int(((m.origen == "cuentas o IVA") & m.archivo_del_origen).sum()),
                "declarado": int(m.origen.eq("declarado").sum()), "IESS no recuperado": int(m.origen.eq("IESS no recuperado").sum()),
                "predictor": int(m.origen.eq("predictor").sum()), "arriendo": int(m.origen.eq("arriendo").sum()),
                "jubilación": int(m.origen.eq("jubilación").sum()), "ruc_activo": int(t.ruc_activo.sum()),
                "ruc_activo_material": int((t.ruc_activo & t.material).sum())}
    # Una persona tiene el mismo monto en cuentas o IVA y en IESS no recuperado: componentes.py desempataba por el orden alfabético de las
    # columnas (IESS primero) y acá gana lo que trae un movimiento bancario o de IVA. Es la única diferencia.
    empates = int((t.material & (t["cuentas o IVA"] > 0) & (t["cuentas o IVA"] == t["IESS no recuperado"]) & (t["cuentas o IVA"] == t[CLASES].max(axis=1))).sum())
    return {"obtenido": obtenido, "esperado": ESPERADO, "diferencias": {k: obtenido[k] - v for k, v in ESPERADO.items() if obtenido[k] != v},
            "empates_entre_cuentas_o_iva_e_iess_no_recuperado": empates,
            "el_total_cuadra_con_sueldo_mas_items_con_check_pct": round(100 * float(t.cuadra.mean()), 2),
            "personas_con_algun_item_sin_check_pct": pct((t.sin_check > 0).mean()),
            "personas_con_ruc_activo_con_algun_item_sin_check_pct": pct((t[t.ruc_activo].sin_check > 0).mean())}


def tabla_de_origenes(t):
    out = {}
    for nom, g in {"todos": t, "OK FACTURAR y condicionado": t[t.ok], "con el bloque del SRI": t[t.sri_bloque], "con RUC activo": t[t.ruc_activo],
                   "con RUC activo, OK FACTURAR": t[t.ruc_activo & t.ok]}.items():
        m = g[g.material]
        out[nom] = {"personas": len(g), "material": len(m), "material_pct": pct(g.material.mean() if len(g) else 0),
                    "por_origen": {k: {"n": int(v), "con_archivo_del_origen_pct": pct(m[m.origen == k].archivo_del_origen.mean()),
                                       "mediana": mediana(m[m.origen == k].adicional)} for k, v in m.origen.value_counts().items()}}
    return out


def iess_no_recuperado(t, fl, doc_cols):
    """Qué es el ítem de fuente IESS con el check que no es el recuperado del proveedor."""
    e = fl[fl.sel & (fl.clase == "IESS no recuperado")].merge(
        t[["id_persona_requerimiento", "ver_f", "aporte", "n_empleos", "med_resp", "t", "origen"]], left_on="ipr", right_on="id_persona_requerimiento")
    iess = pd.read_csv(c.ENTRADAS / "iess_mismo_mes.csv", encoding="utf-8-sig").drop_duplicates("id_persona_requerimiento")
    e = e.merge(iess[["id_persona_requerimiento", "iess_promedio_novadata", "iess_salario_total_ultimo_mes", "iess_meses_disponibles"]],
                on="id_persona_requerimiento", how="left")
    h = pd.read_csv(c.ENTRADAS / "flujos_historial.csv", encoding="utf-8-sig")
    eh = e.merge(h, left_on="id_flujo", right_on="id_flujo_efectivo")
    act_rec = fl[fl.sel & fl.recuperado].groupby("ipr").actividad.agg(lambda s: "+".join(sorted(set(s))))
    personas = e.drop_duplicates("ipr")
    pt = t[t.id_persona_requerimiento.isin(set(e.ipr))]
    con_archivo = (pt[doc_cols].fillna(0) > 0)

    def razon(den):
        r = e.ingreso / den.where(den > 0)
        return {"n": int(r.notna().sum()), "mediana": round(float(r.median()), 3), "a_5pct_pct": pct(((r - 1).abs() <= 0.05).mean())}

    otro_empleo = e.iess_salario_total_ultimo_mes - e.ver_f / 0.9
    r_otro = e.ingreso / otro_empleo.where(otro_empleo > 50)
    resto = t[~t.id_persona_requerimiento.isin(set(e.ipr))]
    return {
        "items": len(e), "personas": int(e.ipr.nunique()), "personas_con_origen_iess_no_recuperado": int((t.origen == "IESS no recuperado").sum()),
        "actividad_del_item": {k: int(v) for k, v in e.actividad.value_counts().items()},
        "actividad_del_recuperado_de_la_misma_persona": {k: int(v) for k, v in e.ipr.map(act_rec).value_counts().items()},
        "relacion_del_item": {k: int(v) for k, v in e.relacion.value_counts().items()},
        "observacion": {k: int(v) for k, v in e.obs.value_counts().head(6).items()},
        "multiplo_de_100_pct": pct((e.ingreso % 100 == 0).mean()),
        "con_montos_por_tipo_pct": pct(((e.m_decl > 0) | (e.m_banco > 0) | (e.m_iva > 0)).mean()),
        "razon_contra": {"el sueldo recuperado (ver_f)": razon(e.ver_f), "el IESS del último mes (todos los empleadores)": razon(e.iess_salario_total_ultimo_mes),
                         "el promedio del proveedor": razon(e.iess_promedio_novadata)},
        "razon_contra_el_otro_empleo_del_ultimo_mes": {"n": int(r_otro.notna().sum()), "a_10pct_pct": pct(((r_otro - 1).abs() <= 0.10).mean())},
        "sueldo_mas_no_recuperado_sobre_iess_del_ultimo_mes_mediana": round(float(((e.ver_f + e.ingreso) / e.iess_salario_total_ultimo_mes.where(e.iess_salario_total_ultimo_mes > 0)).median()), 2),
        "mas_de_un_empleo_en_el_iess_pct": pct((personas.n_empleos > 1).mean()),
        "mas_de_un_empleo_en_el_iess_el_resto_pct": pct((resto.n_empleos > 1).mean()),
        "sin_historial_del_iess_pct": pct((personas.iess_meses_disponibles.fillna(0) == 0).mean()),
        "respuesta": {k: int(v) for k, v in personas.med_resp.value_counts().head(6).items()},
        "con_algun_archivo_de_ingresos_pct": pct(con_archivo.any(axis=1).mean()),
        "archivo_mas_comun_pct": {k.removeprefix("arch_"): pct(v) for k, v in con_archivo.mean().sort_values(ascending=False).head(5).items()},
        "con_historial_desde_2026_03_08": {"items": len(eh), "primera_version_manual_pct": pct((eh.autor_primera_tipo == "manual").mean()),
                                           "monto_cambiado_pct": pct((eh.n_cambios_de_monto > 0).mean())},
    }


def sin_check(t, fl):
    """Qué son los ítems que el analista (o el sistema) dejó sin el check."""
    ap = fl[~fl.sel & ~fl.recuperado].merge(t[["id_persona_requerimiento", "t"]], left_on="ipr", right_on="id_persona_requerimiento")
    h = pd.read_csv(c.ENTRADAS / "flujos_historial.csv", encoding="utf-8-sig")
    aph = ap.merge(h, left_on="id_flujo", right_on="id_flujo_efectivo")
    con_check = fl[fl.sel]
    dup_de = ap[ap.duplica_uno_con_check].merge(con_check.assign(r=con_check.ingreso.round(0))[["ipr", "r", "clase"]].drop_duplicates(["ipr", "r"]),
                                                 left_on=[ap[ap.duplica_uno_con_check].ipr, ap[ap.duplica_uno_con_check].ingreso.round(0)], right_on=["ipr", "r"], suffixes=("", "_con_check"))
    sec = fl[(fl.fuente == "IESS") & fl.actividad.str.startswith("SECUND")]
    aud = t[t.auditado]
    return {
        "items": len(ap), "items_de_consultas_desde_2026_03_08_pct": pct((ap.t >= INICIO_AUDITORIA).mean()),
        "items_antes_de_2026_03_08": int((ap.t < INICIO_AUDITORIA).sum()),
        "items_con_historial_pct": pct(ap.id_flujo.isin(set(h.id_flujo_efectivo)).mean()),
        "con_historial_empezaron_con_el_check_pct": pct(aph.estado_primera.astype(str).str.lower().eq("true").mean()),
        "por_clase": {k: {"n": int(len(g)), "duplica_uno_con_check_pct": pct(g.duplica_uno_con_check.mean()),
                          "lo_apago_un_autor_automatico_pct": pct((aph[aph.clase == k].autor_ultima_tipo == "automatico").mean()) if (aph.clase == k).any() else None}
                      for k, g in ap.groupby("clase")},
        "los_duplicados_copian_a": {k: int(v) for k, v in dup_de.clase_con_check.value_counts().items()},
        "flujos_iess_secundarios": {"n": len(sec), "con_check_pct": pct(sec.sel.mean()),
                                    "recuperados_con_check_pct": pct(sec[sec.recuperado].sel.mean()), "no_recuperados_con_check_pct": pct(sec[~sec.recuperado].sel.mean())},
        "personas_con_algun_item_sin_check_pct": {"todas": pct((t.sin_check > 0).mean()), "desde_2026_03_08": pct((aud.sin_check > 0).mean()),
                                                  "antes": pct((t[~t.auditado].sin_check > 0).mean())},
        "sin_los_duplicados_pct": {"todas": pct((t.sin_check_sin_duplicados > 0).mean()), "desde_2026_03_08": pct((aud.sin_check_sin_duplicados > 0).mean()),
                                   "con_ruc_activo_desde_2026_03_08": pct((aud[aud.ruc_activo].sin_check_sin_duplicados > 0).mean())},
        "rechazados_sin_duplicados_por_clase": {k: int(v) for k, v in ap[~ap.duplica_uno_con_check].clase.value_counts().items()},
    }


def grados(t):
    prueba = t.t >= c.CORTE_FECHA
    out = {}
    for g, s in t.groupby("grado"):
        out[g] = {"n": len(s), "con_ruc_activo": int(s.ruc_activo.sum()), "en_la_prueba_desde_julio_2026": int((s.t >= c.CORTE_FECHA).sum()),
                  "en_la_prueba_con_ruc_activo": int(((s.t >= c.CORTE_FECHA) & s.ruc_activo).sum()), "ok_pct": pct(s.ok.mean()),
                  "por_anio": {int(k): int(v) for k, v in s.t.dt.year.value_counts().sort_index().items()},
                  "mediana_del_adicional": mediana(s.adicional) if not g.startswith("negativo: ning") else None}
    ab = t[t.grado.isin(["A", "B"])]
    mixtos = t[t.material & (t.n_componentes > 1)]
    # Lo que pesa el componente de cuentas o IVA dentro del adicional de A y B: si es casi todo, la etiqueta del monto es el adicional entero.
    peso = ab["cuentas o IVA"] / ab.adicional
    return {
        "por_grado": out,
        "material_con_mas_de_un_componente_pct": pct(len(mixtos) / max(1, int(t.material.sum()))),
        "a_y_b_peso_de_cuentas_o_iva_en_el_adicional": {"mediana": round(float(peso.median()), 3), "todo_pct": pct((peso >= 0.999).mean())},
        "personas_con_cuentas_o_iva_que_no_es_el_origen": int(((t["cuentas o IVA"] > 0) & ~t.grado.isin(["A", "B"])).sum()),
        "archivo_registrado_por_anio_cuentas_o_iva": {int(y): {"cuentas_o_iva": int((g.origen == "cuentas o IVA").sum()), "con_archivo": int((g.grado == "A").sum())}
                                                      for y, g in t.groupby(t.t.dt.year)},
        "prueba_desde": str(c.CORTE_FECHA.date()), "personas_en_la_prueba": int(prueba.sum()), "con_ruc_activo_en_la_prueba": int((prueba & t.ruc_activo).sum()),
    }


def corte_de_produccion(t):
    """El corte del IESS que producción habría tenido el día de la consulta: el último mes que trae la mayoría de las consultas de ese mes
    (`corte_iess_vigente()` es el mes más reciente con 20 personas o más en 90 días; acá, el más frecuente del mes, que no salta con un caso raro)."""
    iess = pd.read_csv(c.ENTRADAS / "iess_mismo_mes.csv", encoding="utf-8-sig", dtype={"iess_ultimo_mes": str, "ym_requerimiento": str})
    iess = iess[iess.iess_ultimo_mes.notna()]
    moda = iess.groupby("ym_requerimiento").iess_ultimo_mes.agg(lambda s: s.mode().iat[0] if len(s) >= 20 else None).dropna()
    per = iess.drop_duplicates("id_persona_requerimiento").set_index("id_persona_requerimiento").iess_ultimo_mes
    ym = t.t.dt.strftime("%Y%m")
    corte = ym.map(moda)
    return corte.str[:4] + "-" + corte.str[4:], t.id_persona_requerimiento.map(per)


def paridad(t, con_node=True):
    """El sueldo de AWS contra el peldaño 1 de producción: primero con el IESS de AWS (todos) y después con el código de producción sobre el
    crudo de la cartera (los que tienen uno)."""
    corte, ultimo_persona = corte_de_produccion(t)
    neto_aws_iess = t.aporte * (1 - APORTE_PERSONAL)
    r = t.ver_f / neto_aws_iess.where(neto_aws_iess > 0)
    con_mes = corte.notna() & ultimo_persona.notna()
    deja = con_mes & (ultimo_persona.str[:4] + "-" + ultimo_persona.str[4:] < corte)
    res = {"con_el_iess_de_aws": {
        "personas_con_salario_del_ultimo_mes": int(r.notna().sum()),
        "ver_f_sobre_el_bruto_del_ultimo_mes_menos_aporte_mediana": round(float(r.median()), 3),
        "a_2pct_pct": pct(((r - 1).abs() <= 0.02).mean()), "a_10pct_pct": pct(((r - 1).abs() <= 0.10).mean()),
        "aws_mayor_en_mas_de_10pct_pct": pct((r > 1.10).mean()), "aws_menor_en_mas_de_10pct_pct": pct((r < 0.90).mean()),
        "el_ultimo_mes_de_la_persona_es_anterior_al_corte_pct": pct(deja[con_mes].mean()),
        "nota": "El IESS de AWS es la copia de Proveedor_Info_1 que guardó la originación; el último mes es el de la persona, no el corte.",
    }}
    if not con_node:
        res["con_el_codigo_de_produccion"] = "no medido (--sin-paridad)"
        return res, pd.Series(np.nan, index=t.index)
    sal = secrets.token_hex(16)
    huella = t.identificacion.map(lambda x: hashlib.sha256((sal + str(x)).encode()).hexdigest())
    ok = corte.notna()
    entrada = {"sal": sal, "personas": {h: {"corte": cte, "fecha": ts.isoformat()} for h, cte, ts in zip(huella[ok], corte[ok], t.t[ok])}}
    c.RESULTADOS.mkdir(parents=True, exist_ok=True)
    f_in, f_out = c.RESULTADOS / "paridad-del-sueldo-entrada.json", c.RESULTADOS / "paridad-del-sueldo-salida.jsonl"
    f_in.write_text(json.dumps(entrada), encoding="utf-8")
    try:
        r_node = subprocess.run(["node", str(AQUI / "paridad-del-sueldo.mjs"), f"--entrada={f_in}", f"--salida={f_out}"], capture_output=True, text=True, timeout=1800)
    finally:
        f_in.unlink(missing_ok=True)  # lleva la sal: con ella la huella se podría deshacer
    if r_node.returncode != 0:
        raise SystemExit(f"paridad-del-sueldo.mjs falló:\n{r_node.stderr[-2000:]}")
    cuenta = json.loads(r_node.stdout.strip().splitlines()[-1])
    s = pd.read_json(f_out, lines=True)
    f_out.unlink(missing_ok=True)
    s = s.set_index("huella")
    t2 = t.assign(huella=huella).join(s, on="huella", how="inner")
    con = t2[t2.estado == "con_monto"]
    rr = con.ver_f / con.neto
    res["con_el_codigo_de_produccion"] = {
        "dependientes_con_crudo_en_la_cartera": cuenta["crudos_leidos"], "fallas": cuenta["fallas"],
        "estado_del_peldaño_1": {str(k): int(v) for k, v in t2.estado.value_counts().items()},
        "motivo_sin_monto": {str(k): int(v) for k, v in t2[t2.estado != "con_monto"].motivo.value_counts().head(5).items()},
        "con_monto": len(con), "ver_f_sobre_el_peldaño_1_mediana": round(float(rr.median()), 3) if len(con) else None,
        "a_2pct_pct": pct(((rr - 1).abs() <= 0.02).mean()), "a_10pct_pct": pct(((rr - 1).abs() <= 0.10).mean()),
        "aws_mayor_en_mas_de_10pct_pct": pct((rr > 1.10).mean()), "aws_menor_en_mas_de_10pct_pct": pct((rr < 0.90).mean()),
        "con_mas_de_un_sueldo": int((con.sueldos > 1).sum()),
        "a_10pct_con_un_solo_sueldo_pct": pct(((rr[con.sueldos == 1] - 1).abs() <= 0.10).mean()),
        "a_10pct_con_dos_o_mas_sueldos_pct": pct(((rr[con.sueldos > 1] - 1).abs() <= 0.10).mean()),
        "por_anio_a_10pct_pct": {int(y): {"n": int(len(g)), "a_10pct": pct(((g.ver_f / g.neto - 1).abs() <= 0.10).mean())} for y, g in con.groupby(con.t.dt.year)},
    }
    # La alternativa para entrenar: el bruto del último mes del IESS de AWS menos el aporte, la misma cuenta que el peldaño 1. Si coincide
    # más que `ver_f`, la sesión 2 entrena con ella y no con lo que validó el analista.
    ra = (con.aporte * (1 - APORTE_PERSONAL)) / con.neto
    res["con_el_codigo_de_produccion"]["el_iess_de_aws_menos_aporte_contra_el_peldaño_1"] = {
        "n": int(ra.notna().sum()), "mediana": round(float(ra.median()), 3), "a_2pct_pct": pct(((ra - 1).abs() <= 0.02).mean()),
        "a_10pct_pct": pct(((ra - 1).abs() <= 0.10).mean())}
    neto = pd.Series(np.nan, index=t.index)
    neto.loc[t2.index] = t2.neto.where(t2.estado == "con_monto")
    return res, neto


def main():
    t0 = time.time()
    sin_paridad = "--sin-paridad" in sys.argv
    con = duckdb.connect()
    d = poblacion(con)
    fl = flujos(con, set(d.id_persona_requerimiento.dropna().astype("int64")))
    doc, doc_cols = documentos()
    t = por_persona(d, fl, doc)

    r = {"que_es": "docs/propuesta-adicional-del-dependiente.md, sesión 1: datos y etiquetas, sin modelo. Sólo agregados.",
         "reproduccion_de_la_seccion_2": reproducir(t), "origenes": tabla_de_origenes(t), "grados": grados(t),
         "iess_no_recuperado": iess_no_recuperado(t, fl, doc_cols), "items_sin_el_check": sin_check(t, fl),
         "anclaje_a_la_cifra_de_equifax": anclaje_a_la_cifra(con, t)}
    r["paridad_del_sueldo"], t["peldano_1_neto"] = paridad(t, con_node=not sin_paridad)
    r["entradas"] = {n: c.huella(c.ENTRADAS / n) for n in ["ingresos_por_actividad.csv", "documentos_por_persona.csv", "flujos_historial.csv", "iess_mismo_mes.csv"]}
    r["versiones"] = c.versiones()

    columnas = ["id_consulta_equifax", "id_persona_requerimiento", "t", "rel", "med_resp", "ok", "ruc_activo", "sri_bloque", "ver_f", "med_ivt", "peldano_1_neto",
                *CLASES, "adicional", "material", "origen", "n_componentes", "archivo_del_origen", "grado", "adicional_arriendo_o_jubilacion", "med_total_a_1pct_de_la_cifra", "sin_check", "sin_check_sin_duplicados", "auditado"]
    c.RESULTADOS.mkdir(parents=True, exist_ok=True)
    t[columnas].to_parquet(TABLA, index=False)
    r["tabla"] = {"archivo": TABLA.name, "filas": len(t), "sha256": c.huella(TABLA)}
    c.escribir_json(METRICAS, r)

    rep = r["reproduccion_de_la_seccion_2"]
    print("sección 2:", "igual" if not rep["diferencias"] else f"DIFIERE {rep['diferencias']}", f"| cuadra {rep['el_total_cuadra_con_sueldo_mas_items_con_check_pct']}%")
    for g, v in r["grados"]["por_grado"].items():
        print(f"  {g:<34} {v['n']:>6}  RUC activo {v['con_ruc_activo']:>5}  prueba {v['en_la_prueba_desde_julio_2026']:>5} ({v['en_la_prueba_con_ruc_activo']} con RUC)")
    print(f"listo en {time.time() - t0:.0f} s -> {TABLA} y {METRICAS.relative_to(AQUI.parent.parent)}")


if __name__ == "__main__":
    main()
