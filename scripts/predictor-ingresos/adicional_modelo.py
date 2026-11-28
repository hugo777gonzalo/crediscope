# El modelo del adicional del dependiente: la sesión 2 de docs/propuesta-adicional-del-dependiente.md (sección 3, con las respuestas del negocio
# del 2026-11-24 en 6.6). Sale con la decisión «sigue» o «se cierra».
#
# Por qué existe: el extra del dependiente ya falló con la etiqueta «total validado menos sueldo» (12.14 y 12.36: AUC de 0,687, R² de 0,01). La
# sesión 1 (`adicional_por_componente.py`) separó el adicional por componente y dejó la etiqueta por grado: A (cuentas o IVA con el archivo del
# origen), B (cuentas o IVA sin archivo registrado), arriendo o jubilación aparte, C (lo declarado, nunca como monto), fuera (el predictor y el IESS
# no recuperado, que es un ajuste hacia la cifra de Equifax) y el negativo («sin adicional documentado»). Este guion entrena con esa etiqueta.
#
# El modelo, en dos partes:
#   1. Si tiene un adicional comprobable: un clasificador de A o B contra el negativo (C, fuera y arriendo no entrenan).
#   2. Cuánto: los doce cuantiles del logaritmo del adicional, sólo con A y B. El mínimo es el cuantil 10.
#
# Entradas: el sueldo (`ver_f`, lo que validó el analista: decisión del negocio, 6.6), la carga de cuotas sobre el sueldo, el buró anterior a la
# consulta (`comun.BURO` y `comun.CUOTA`; el crédito mayor posterior a la consulta ya llega vacío de `preparar`), edad, sexo y fecha, y el SRI
# de Proveedor_Info_1 y de Equifax en la variante que lo tiene. Nunca la cifra de Equifax (`comun.PROHIBIDAS` la corta) ni una de `NO_SERVIBLES`.
# Lo declarado (C) no entra como variable: CrediScope no le pide a la persona que declare un ingreso (decisión del 2026-10-21).
#
# Dos variantes, siempre hacia adelante (entrena con lo anterior a julio de 2026, prueba con lo posterior):
#   - todos los años sin SRI (39.017 personas);
#   - 2026 con SRI.
# Y cuatro escenarios de la etiqueta: el principal (A o B), sin los A y B cuyo total queda a ±1% de la cifra de Equifax
# (`med_total_a_1pct_de_la_cifra`), con arriendo o jubilación como adicional (`adicional_arriendo_o_jubilacion`), y las dos cosas.
#
# Reglas fijadas ANTES de medir (propuesta, sección 3; se aplican tal cual, en el escenario principal):
#   R1  Si tiene un adicional comprobable: AUC de 0,75 o más con RUC activo, en la etiqueta A contra el negativo.
#   R2  El mínimo del adicional cubre al 90% o más de los A de la prueba, y la mediana del mínimo sobre el adicional real de cada uno es 0,5 o más.
#       Decide la cifra central (negocio, 2026-11-24). Si pasa y el intervalo de la cobertura baja de 80%, queda «sigue» sin conectar hasta
#       juntar más A.
#   R3  De los adicionales que se mostrarían a personas con RUC activo, el 70% o más es comprobable (A o B). Tasa base: 6,8%. El umbral de
#       «se muestra» se elige SIN mirar la prueba: el puntaje más bajo con el que, en el entrenamiento con RUC activo (fuera de muestra), lo
#       mostrado llega al 70% con 10 personas o más. Si ningún umbral llega, la regla falla.
#   Una variante pasa si cumple R1, R2 y R3. La decisión es «sigue» si pasa alguna de las dos variantes; si no, «se cierra» (la opción (b) de
#   A14 hasta tener documentos anotados, D8). Los otros tres escenarios y el sueldo movido ±10% se informan, no deciden.
#
# Lee la tabla de la sesión 1 y las extracciones de AWS ya bajadas (con `preparar.armar_consultas()`). No consulta AWS, Equifax ni
# Proveedor_Info_1, no usa el modelo de lenguaje y no escribe en la base. A git va sólo `metricas/adicional-modelo-2026-11.json`: conteos, tasas,
# razones e intervalos; las medianas en dólares, sólo de grupos de 50 o más.
#
#   python -I scripts/predictor-ingresos/adicional_modelo.py [--rapido]
import sys
import time
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from scipy.stats import rankdata

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
import preparar as p

AQUI = Path(__file__).parent
METRICAS = AQUI / "metricas" / "adicional-modelo-2026-11.json"
TABLA = c.RESULTADOS / "adicional-por-componente.parquet"
RAPIDO = "--rapido" in sys.argv
B = 100 if RAPIDO else 1000
MIN_GRUPO = 50
MIN_MOSTRADOS = 10
TASA_BASE_PROPUESTA = 6.8

BASE = ["edad", "genero", "anio_mes", "sueldo", "carga_cuotas"]
VARIANTES = {
    "todos los años, sin SRI": {"filtro": lambda t: np.ones(len(t), bool), "cols": BASE + c.BURO + c.CUOTA},
    "2026, con SRI": {"filtro": lambda t: (t.sri_bloque & (t.t.dt.year == 2026)).values,
                      "cols": BASE + c.BURO + c.CUOTA + c.SRI_PROVEEDOR_INFO_1 + c.SRI_EQUIFAX},
}
ESCENARIOS = {
    "principal: A o B": {"positivos": ["A", "B"], "sin_anclados": False, "con_arriendo": False},
    "sin los anclados a la cifra": {"positivos": ["A", "B"], "sin_anclados": True, "con_arriendo": False},
    "con arriendo o jubilación": {"positivos": ["A", "B", "arriendo o jubilación"], "sin_anclados": False, "con_arriendo": True},
    "con arriendo o jubilación, sin los anclados": {"positivos": ["A", "B", "arriendo o jubilación"], "sin_anclados": True, "con_arriendo": True},
}
for _v in VARIANTES.values():
    c.verificar_entradas(_v["cols"])
    assert not set(_v["cols"]) & set(c.NO_SERVIBLES), "una variable que en producción llega vacía"


def auc(puntaje, evento):
    """Área bajo la curva ROC por rangos: la probabilidad de que un caso con el evento tenga un puntaje mayor que uno sin él."""
    evento = np.asarray(evento, bool)
    n1 = evento.sum()
    n0 = len(evento) - n1
    if n1 == 0 or n0 == 0:
        return np.nan
    return float((rankdata(puntaje)[evento].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def con_ic(f, n, semilla=5):
    """`f(índices)` en la muestra y su intervalo del 95% remuestreando personas B veces."""
    rng = np.random.default_rng(semilla)
    punto = f(np.arange(n))
    r = np.array([f(rng.integers(0, n, n)) for _ in range(B)], float)
    if n == 0 or np.isnan(r).all():
        return {"valor": rd(punto), "ic_bajo": None, "ic_alto": None}
    return {"valor": rd(punto), "ic_bajo": rd(np.nanpercentile(r, 2.5)), "ic_alto": rd(np.nanpercentile(r, 97.5))}


def rd(x, d=3):
    return None if x is None or (isinstance(x, float) and np.isnan(x)) else round(float(x), d)


def datos():
    """La tabla de la sesión 1 con las entradas de `preparar.armar_consultas()`, cruzadas por la id de consulta. La identificación no sale de acá."""
    g = pd.read_parquet(TABLA)
    a = p.armar_consultas(duckdb.connect())
    entradas = ["edad", "genero", *c.BURO, *c.CUOTA, *c.SRI_PROVEEDOR_INFO_1, *c.SRI_EQUIFAX, "cuota_fin"]
    a = a[["id_consulta_equifax", *dict.fromkeys(entradas)]].drop_duplicates("id_consulta_equifax")
    t = g.merge(a, on="id_consulta_equifax", how="left", validate="one_to_one", indicator=True)
    sin_cruce = int((t._merge != "both").sum())
    if sin_cruce:
        raise SystemExit(f"{sin_cruce} personas de la tabla de la sesión 1 no cruzan con armar_consultas()")
    t = t.drop(columns="_merge")
    # `ver_*` es un prefijo que `verificar_entradas` corta (lo verificado no entra al predictor de independientes); acá el sueldo SÍ es la entrada
    # (el peldaño 1 se conoce en producción), con otro nombre.
    t["sueldo"] = t.ver_f
    t["carga_cuotas"] = t.cuota_fin / t.sueldo
    t["anio_mes"] = t.t.dt.year + (t.t.dt.month - 1) / 12
    t["negativo"] = t.grado.str.startswith("negativo")
    return t


def con_sueldo(df, factor):
    d = df.copy()
    d["sueldo"] = d.sueldo * factor
    d["carga_cuotas"] = d.cuota_fin / d.sueldo
    return d


def umbral_de_mostrar(puntaje, comprobable):
    """El puntaje más bajo con el que lo mostrado (de mayor a menor) tiene 70% o más comprobable con 10 personas o más. None si no llega nunca."""
    orden = np.argsort(-puntaje)
    acierto = np.cumsum(comprobable[orden]) / np.arange(1, len(orden) + 1)
    validos = np.where((acierto >= 0.70) & (np.arange(1, len(orden) + 1) >= MIN_MOSTRADOS))[0]
    maximo = float(acierto[MIN_MOSTRADOS - 1:].max()) if len(orden) >= MIN_MOSTRADOS else np.nan
    return (float(puntaje[orden][validos.max()]) if len(validos) else None), maximo


def correr(t, variante, escenario, modelos=None):
    """`modelos`, si llega un dict, se llena con lo entrenado: `adicional_suma.py` lo usa para sumar el mínimo al sueldo."""
    import lightgbm as lgb
    v, e = VARIANTES[variante], ESCENARIOS[escenario]
    cols = v["cols"]
    pob = t[v["filtro"](t)].copy()
    if e["sin_anclados"]:
        pob = pob[~(pob.grado.isin(e["positivos"]) & pob.med_total_a_1pct_de_la_cifra)]
    pob["comprobable"] = pob.grado.isin(e["positivos"])
    pob["monto"] = pob.adicional if e["con_arriendo"] else pob.adicional - pob.adicional_arriendo_o_jubilacion
    tr = pob[pob.t < c.CORTE_FECHA].reset_index(drop=True)
    te = pob[pob.t >= c.CORTE_FECHA].reset_index(drop=True)
    ent = tr[tr.comprobable | tr.negativo].reset_index(drop=True)
    cat = c.categorias_de(tr, [x for x in c.CATEGORICAS if x in cols])
    cats = [x for x in cols if x in c.CATEGORICAS]

    def clasificador(df):
        return lgb.LGBMClassifier(n_estimators=c.N_ARBOLES, **c.PAR).fit(c.matriz(df, cols, cat), df.comprobable.values, categorical_feature=cats)

    # 1) Si tiene un adicional comprobable. Fuera de muestra en el entrenamiento, para elegir el umbral sin mirar la prueba: los que entrenan,
    #    por validación cruzada; los demás (C, fuera, arriendo), con el modelo entero, que no los vio.
    clf = clasificador(ent)
    oof = np.zeros(len(ent))
    for a_tr, a_te in c.particiones(len(ent)):
        oof[a_te] = clasificador(ent.iloc[a_tr]).predict_proba(c.matriz(ent.iloc[a_te], cols, cat))[:, 1]
    p_tr = clf.predict_proba(c.matriz(tr, cols, cat))[:, 1]
    p_tr[np.flatnonzero(tr.comprobable | tr.negativo)] = oof
    ruc_tr = tr.ruc_activo.values
    umbral, max_tr = umbral_de_mostrar(p_tr[ruc_tr], tr.comprobable.values[ruc_tr])

    def puntajes(df):
        return clf.predict_proba(c.matriz(df, cols, cat))[:, 1]

    p_te = puntajes(te)
    ruc = te.ruc_activo.values
    A = (te.grado == "A").values
    neg = te.negativo.values
    comp = te.comprobable.values

    def auc_en(mask, evento, pp=p_te):
        ii = np.flatnonzero(mask)
        return con_ic(lambda k: auc(pp[ii][k], evento[ii][k]), len(ii)) | {"positivos": int(evento[ii].sum()), "personas": len(ii)}

    aucs = {
        "A contra el negativo, con RUC activo": auc_en(ruc & (A | neg), A),
        "A contra el negativo, todos": auc_en(A | neg, A),
        "comprobable contra el negativo, con RUC activo": auc_en(ruc & (comp | neg), comp),
        "comprobable contra el negativo, todos": auc_en(comp | neg, comp),
        "comprobable contra todos los demás, con RUC activo": auc_en(ruc, comp),
        "comprobable contra todos los demás, todos": auc_en(np.ones(len(te), bool), comp),
    }
    # 3) Lo que vería el analista: de lo mostrado con RUC activo, cuánto es comprobable.
    pr, cr = p_te[ruc], comp[ruc]

    def acierto_de(k, corte):
        m = pr[k] >= corte
        return 100 * cr[k][m].mean() if m.any() else np.nan

    mostrar = {"umbral_elegido_en_el_entrenamiento": rd(umbral, 4),
               "acierto_maximo_en_el_entrenamiento_con_10_o_mas_pct": rd(100 * max_tr, 1),
               "personas_con_ruc_activo_en_la_prueba": int(ruc.sum()), "tasa_base_en_la_prueba_pct": rd(100 * cr.mean(), 1)}
    if umbral is not None:
        m = pr >= umbral
        mostrar |= {"mostrados": int(m.sum()), "comprobables_mostrados": int(cr[m].sum()),
                    "acierto_pct": con_ic(lambda k: acierto_de(k, umbral), len(pr)),
                    "comprobables_alcanzados_pct": rd(100 * cr[m].sum() / max(cr.sum(), 1), 1)}
    mostrar["por_fraccion_mostrada"] = {}
    for f in (0.01, 0.02, 0.05, 0.10, 0.20):
        n = max(1, int(round(f * len(pr))))
        top = np.argsort(-pr)[:n]
        mostrar["por_fraccion_mostrada"][f"{int(f * 100)}%"] = {"mostrados": n, "acierto_pct": rd(100 * cr[top].mean(), 1),
                                                                "comprobables_alcanzados_pct": rd(100 * cr[top].sum() / max(cr.sum(), 1), 1)}

    # 2) Cuánto: los doce cuantiles del logaritmo del adicional, sólo con lo comprobable del entrenamiento.
    pos_tr = tr[tr.comprobable].reset_index(drop=True)
    qmod = c.entrenar_cuantiles(c.matriz(pos_tr, cols, cat), np.log(pos_tr.monto.values))
    pos_te = te[te.comprobable].reset_index(drop=True)
    sin_variables = np.tile(np.quantile(np.log(pos_tr.monto.values), c.LEV), (len(pos_te), 1))

    def montos(df, Q):
        real = df.monto.values
        return real, np.exp(Q[:, c.LEV.index(0.10)]), np.exp(Q[:, c.LEV.index(0.50)])

    Q_te = c.predecir(qmod, c.matriz(pos_te, cols, cat))
    real, minimo, central = montos(pos_te, Q_te)
    _, min_base, central_base = montos(pos_te, sin_variables)
    grupos = {"A": (pos_te.grado == "A").values, "A con RUC activo": ((pos_te.grado == "A") & pos_te.ruc_activo).values,
              "B": (pos_te.grado == "B").values, "comprobables": np.ones(len(pos_te), bool)}

    def medir_monto(sel, mn, cen):
        ii = np.flatnonzero(sel)
        y = np.log(real[ii])
        r = {"n": len(ii),
             "cobertura_del_minimo_pct": con_ic(lambda k: 100 * (real[ii][k] >= mn[ii][k]).mean(), len(ii)),
             "minimo_sobre_real_mediana": con_ic(lambda k: np.median(mn[ii][k] / real[ii][k]), len(ii)),
             "mediana_del_minimo_sobre_mediana_del_real": rd(np.median(mn[ii]) / np.median(real[ii])) if len(ii) else None,
             "r2_del_central_en_logaritmo": rd(1 - ((y - np.log(cen[ii])) ** 2).sum() / ((y - y.mean()) ** 2).sum()) if len(ii) > 2 else None}
        if len(ii) >= MIN_GRUPO:
            r |= {"mediana_del_adicional_real": rd(np.median(real[ii]), 0), "mediana_del_minimo": rd(np.median(mn[ii]), 0)}
        return r

    monto = {g: {"modelo": medir_monto(s, minimo, central), "sin_variables": medir_monto(s, min_base, central_base)} for g, s in grupos.items()}

    # El sueldo movido ±10% en la prueba: la paridad de `ver_f` con el peldaño 1 es de 79,4% a ±10% (6.4).
    sueldo = {}
    for f in (0.9, 1.1):
        te_f = con_sueldo(te, f)
        p_f = puntajes(te_f)
        _, min_f, _ = montos(pos_te, c.predecir(qmod, c.matriz(con_sueldo(pos_te, f), cols, cat)))
        cambio = {"probabilidad_cambio_absoluto_mediano_en_puntos": rd(100 * np.median(np.abs(p_f[ruc] - p_te[ruc])), 2),
                  "probabilidad_cambio_absoluto_p90_en_puntos": rd(100 * np.percentile(np.abs(p_f[ruc] - p_te[ruc]), 90), 2),
                  "auc_A_contra_el_negativo_con_ruc_activo": rd(auc(p_f[ruc & (A | neg)], A[ruc & (A | neg)])),
                  "minimo_nuevo_sobre_el_anterior_mediana": rd(np.median(min_f / minimo)),
                  "cobertura_del_minimo_en_A_pct": rd(100 * (real[grupos["A"]] >= min_f[grupos["A"]]).mean(), 1)}
        if umbral is not None:
            cambio["cambia_si_se_muestra_con_ruc_activo_pct"] = rd(100 * ((p_f[ruc] >= umbral) != (p_te[ruc] >= umbral)).mean(), 2)
        sueldo[f"{'+' if f > 1 else '-'}10%"] = cambio

    imp = pd.Series(clf.booster_.feature_importance("gain"), index=cols)
    res = {
        "entrenamiento": {"personas": len(tr), "entrenan_el_clasificador": len(ent), "comprobables": int(tr.comprobable.sum()),
                          "por_grado": {k: int(n) for k, n in tr.grado.value_counts().items()}},
        "prueba": {"personas": len(te), "con_ruc_activo": int(ruc.sum()), "por_grado": {k: int(n) for k, n in te.grado.value_counts().items()},
                   "A": int(A.sum()), "A_con_ruc_activo": int((A & ruc).sum())},
        # Si el AUC del entrenamiento (fuera de muestra) es parecido al de la prueba, lo bajo no es el corte en el tiempo sino la etiqueta.
        "auc_fuera_de_muestra_en_el_entrenamiento": {
            "comprobable contra el negativo, todos": rd(auc(oof, ent.comprobable.values)),
            "comprobable contra el negativo, con RUC activo": rd(auc(oof[ent.ruc_activo.values], ent.comprobable.values[ent.ruc_activo.values])),
            "A contra el negativo, todos": rd(auc(oof[(ent.grado == "A") | ent.negativo], (ent.grado == "A").values[((ent.grado == "A") | ent.negativo).values]))},
        "si_tiene_un_adicional_comprobable_auc": aucs, "lo_que_se_mostraria": mostrar, "cuanto": monto, "sueldo_movido": sueldo,
        "variables_que_mas_pesan": {k: rd(100 * x / imp.sum(), 1) for k, x in imp.sort_values(ascending=False).head(10).items()},
    }
    res["reglas"] = reglas(res)
    if modelos is not None:
        modelos.update(clf=clf, qmod=qmod, cols=cols, cat=cat, tr=tr, te=te, ent=ent, oof=oof, p_tr=p_tr, p_te=p_te, pos_tr=pos_tr)
    return res


def reglas(r):
    a = r["si_tiene_un_adicional_comprobable_auc"]["A contra el negativo, con RUC activo"]
    cob = r["cuanto"]["A"]["modelo"]["cobertura_del_minimo_pct"]
    raz = r["cuanto"]["A"]["modelo"]["minimo_sobre_real_mediana"]
    mo = r["lo_que_se_mostraria"]
    acierto = mo.get("acierto_pct", {}).get("valor") if isinstance(mo.get("acierto_pct"), dict) else None
    r1 = a["valor"] is not None and a["valor"] >= 0.75
    r2 = cob["valor"] is not None and cob["valor"] >= 90 and raz["valor"] is not None and raz["valor"] >= 0.5
    r3 = acierto is not None and acierto >= 70
    return {"R1_auc_ruc_activo_075": {"valor": a["valor"], "ic": [a["ic_bajo"], a["ic_alto"]], "pasa": bool(r1)},
            "R2_minimo_cubre_90_y_mediana_05": {"cobertura": cob["valor"], "cobertura_ic": [cob["ic_bajo"], cob["ic_alto"]],
                                                "minimo_sobre_real": raz["valor"], "pasa": bool(r2),
                                                "pasa_solo_por_la_cifra_central": bool(r2 and (cob["ic_bajo"] or 0) < 80)},
            "R3_mostrado_70_comprobable": {"umbral": mo["umbral_elegido_en_el_entrenamiento"], "acierto": acierto,
                                           "mostrados": mo.get("mostrados", 0), "pasa": bool(r3)},
            "pasa": bool(r1 and r2 and r3)}


def main():
    t0 = time.time()
    t = datos()
    print(f"{c.miles(len(t))} personas; {time.time() - t0:.0f} s", flush=True)
    out = {"que_es": "docs/propuesta-adicional-del-dependiente.md, sesión 2: el modelo del adicional del dependiente, hacia adelante. Sólo agregados.",
           "corte": str(c.CORTE_FECHA.date()), "remuestreos": B, "variables": {k: v["cols"] for k, v in VARIANTES.items()}, "resultados": {}}
    for variante in VARIANTES:
        out["resultados"][variante] = {}
        for escenario in ESCENARIOS:
            r = correr(t, variante, escenario)
            out["resultados"][variante][escenario] = r
            g = r["reglas"]
            print(f"{variante} | {escenario}: A en la prueba {r['prueba']['A']} | R1 AUC {g['R1_auc_ruc_activo_075']['valor']} {g['R1_auc_ruc_activo_075']['ic']}"
                  f" | R2 cob {g['R2_minimo_cubre_90_y_mediana_05']['cobertura']} {g['R2_minimo_cubre_90_y_mediana_05']['cobertura_ic']}"
                  f" razón {g['R2_minimo_cubre_90_y_mediana_05']['minimo_sobre_real']}"
                  f" | R3 {g['R3_mostrado_70_comprobable']['acierto']} ({g['R3_mostrado_70_comprobable']['mostrados']} mostrados)"
                  f" | {'PASA' if g['pasa'] else 'no pasa'} ({time.time() - t0:.0f} s)", flush=True)
    # Los conteos que la propuesta da para la prueba: si no coinciden, la tabla no es la de la sesión 1.
    pr = out["resultados"]["todos los años, sin SRI"]
    esperado = {"A": 71, "A_con_ruc_activo": 59}
    obtenido = {k: pr["principal: A o B"]["prueba"][k] for k in esperado}
    sa = pr["sin los anclados a la cifra"]["prueba"]["por_grado"]
    obtenido |= {"A_sin_anclados": sa.get("A", 0), "B_sin_anclados": sa.get("B", 0)}
    esperado |= {"A_sin_anclados": 69, "B_sin_anclados": 60}
    out["conteos_de_la_propuesta"] = {"esperado": esperado, "obtenido": obtenido, "iguales": esperado == obtenido}
    principales = {v: out["resultados"][v]["principal: A o B"]["reglas"] for v in VARIANTES}
    pasan = [v for v, g in principales.items() if g["pasa"]]
    out["decision"] = {
        "resultado": "sigue" if pasan else "se cierra",
        "variantes_que_pasan": pasan,
        "se_puede_conectar": bool(pasan) and not all(principales[v]["R2_minimo_cubre_90_y_mediana_05"]["pasa_solo_por_la_cifra_central"] for v in pasan),
        "por_variante": principales,
    }
    out["entradas"] = {"tabla_de_la_sesion_1_sha256": c.huella(TABLA)}
    out["versiones"] = c.versiones()
    if not RAPIDO:
        c.escribir_json(METRICAS, out)
    print("conteos de la propuesta:", "iguales" if out["conteos_de_la_propuesta"]["iguales"] else out["conteos_de_la_propuesta"])
    print(f"DECISIÓN: {out['decision']['resultado']} {pasan} | listo en {time.time() - t0:.0f} s" + ("" if RAPIDO else f" -> {METRICAS.relative_to(AQUI.parent.parent)}"))


if __name__ == "__main__":
    main()
