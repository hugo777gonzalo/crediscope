# Qué pasaría si se SUMA el adicional estimado al ingreso del dependiente con RUC activo: la sesión 3 de
# docs/propuesta-adicional-del-dependiente.md, 8.5. El negocio decidió el 2026-11-27 sumarlo («Dependiente con Ingresos Adicionales», nombre
# pendiente). Esto mide la consecuencia antes de construir nada; no construye.
#
# Fijado ANTES de medir:
#   - Población: la prueba (desde julio de 2026), dependientes y públicos con RUC activo según el bloque de Equifax, con total validado (`med_ivt`)
#     mayor que cero.
#   - Modelo: la variante del RUC reconstruido con el catastro (8.2), escenario principal (A o B, sin arriendo ni jubilación). Dos
#     entrenamientos: con todos (8.2) y sin las personas sin respuesta (8.4).
#   - El ingreso estimado es el sueldo (`ver_f`) más el mínimo del adicional, que es el cuantil 10 del modelo de monto. Cuatro versiones:
#       1. el sueldo solo (lo de hoy, para comparar);
#       2. el sueldo más el mínimo, a todos;
#       3. el sueldo más el mínimo, sólo a quien supera el umbral del clasificador; a los demás, el sueldo;
#       4 y 5. lo mismo que 2 y 3 con el mínimo calibrado (conforme) para cubrir al 90%.
#   - El umbral: R3 no tiene uno (ninguno llega al 70% comprobable). Se usa el puntaje con el que, en el entrenamiento con RUC activo y fuera de
#     muestra, se le muestra a tantas personas como comprobables hay (la fracción mostrada igual a la tasa base). No es un umbral que pase una regla:
#     es el corte más estrecho que no deja afuera, de entrada, a más comprobables que los que muestra.
#   - La calibración: el cuantil 10 fuera de muestra (cinco particiones) de los comprobables del entrenamiento; el mínimo se corre en el logaritmo lo
#     justo para que el 90% de ellos quede por encima (con la corrección de muestra finita). Se fija con el entrenamiento y se aplica a la prueba.
#   - Contra el total validado (`med_ivt`, sólo para medir: nunca entra al modelo), por persona, la razón estimado / total validado:
#       mediana; % a ±10% y a ±20%; % sobrestimado en más de 10% y en más de 20%; % subestimado en más de 10%.
#   - Tres grupos: A o B (comprobables), negativos («sin adicional documentado») y todos (incluye C, fuera, y arriendo o jubilación).
#   - **Contra el negativo, la sobrestimación es un techo**: «sin adicional documentado» no es «sin adicional», y parte de lo que figura como
#     sobrestimado puede ser un adicional real que nadie documentó.
#
# Sólo lee lo ya bajado; no consulta AWS, Equifax ni Proveedor_Info_1, no usa el modelo de lenguaje y no escribe en la base. A git va sólo
# `metricas/adicional-suma-2026-11.json`; las medianas en dólares, sólo de grupos de 50 o más.
#
#   python -I scripts/predictor-ingresos/adicional_suma.py [--rapido]
import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import adicional_catastro as k
import adicional_modelo as m
import adicional_sin_respuesta as s
import comun as c

AQUI = Path(__file__).parent
METRICAS = AQUI / "metricas" / "adicional-suma-2026-11.json"
COBERTURA = 0.90
I10 = c.LEV.index(0.10)


def umbral_tasa_base(p, comprobable):
    """El puntaje con el que se muestra a tantos como comprobables hay."""
    n = int(comprobable.sum())
    return float(np.sort(p)[::-1][n - 1]) if n else None


def corrimiento_conforme(mod, cols, cat, pos_tr):
    """Cuánto bajar el logaritmo del mínimo para que, fuera de muestra, cubra al 90% de los comprobables del entrenamiento."""
    y = np.log(pos_tr.monto.values)
    q10 = np.zeros(len(pos_tr))
    for a_tr, a_te in c.particiones(len(pos_tr)):
        qm = c.entrenar_cuantiles(c.matriz(pos_tr.iloc[a_tr], cols, cat), y[a_tr])
        q10[a_te] = c.predecir(qm, c.matriz(pos_tr.iloc[a_te], cols, cat))[:, I10]
    exceso = q10 - y  # positivo: el mínimo quedó por encima del real
    n = len(exceso)
    nivel = min(1.0, np.ceil((n + 1) * COBERTURA) / n)
    return float(np.quantile(exceso, nivel, method="higher")), m.rd(100 * (y >= q10).mean(), 1)


def medir(est, total):
    r = est / total
    return {"n": int(len(r)), "mediana_de_la_razon": m.rd(np.median(r)) if len(r) else None,
            "a_10pct": m.rd(100 * (np.abs(r - 1) <= 0.10).mean(), 1), "a_20pct": m.rd(100 * (np.abs(r - 1) <= 0.20).mean(), 1),
            "sobrestimado_mas_de_10pct": m.rd(100 * (r > 1.10).mean(), 1), "sobrestimado_mas_de_20pct": m.rd(100 * (r > 1.20).mean(), 1),
            "subestimado_mas_de_10pct": m.rd(100 * (r < 0.90).mean(), 1)}


def main():
    t0 = time.time()
    t = k.datos_con_catastro()
    k.registrar_variante()
    tr_full = k.con_reconstruido(t)
    fuera = s.sin_respuesta_en_el_entrenamiento(t)
    out = {"que_es": "docs/propuesta-adicional-del-dependiente.md, 8.5: el sueldo más el mínimo del adicional, contra el total validado, en la "
                     "prueba con RUC activo. Sólo agregados. Contra el negativo, la sobrestimación es un techo.",
           "corte": str(c.CORTE_FECHA.date()), "cobertura_de_la_calibracion": COBERTURA, "resultados": {}}
    for entrenamiento in ("con todos (8.2)", "sin las personas sin respuesta (8.4)"):
        d = tr_full if entrenamiento.startswith("con todos") else tr_full[~fuera.values].reset_index(drop=True)
        mod = {}
        r = m.correr(d, k.VARIANTE_NUEVA, "principal: A o B", modelos=mod)
        tr, te, cols, cat = mod["tr"], mod["te"], mod["cols"], mod["cat"]
        ruc_tr = tr.ruc_activo.values
        umbral = umbral_tasa_base(mod["p_tr"][ruc_tr], tr.comprobable.values[ruc_tr])
        delta, cob_oof = corrimiento_conforme(mod, cols, cat, mod["pos_tr"])

        sel = (te.ruc_activo & (te.med_ivt > 0)).values
        p = te[sel].reset_index(drop=True)
        pp = mod["p_te"][sel]
        q10 = np.exp(c.predecir(mod["qmod"], c.matriz(p, cols, cat))[:, I10])
        q10_cal = q10 * np.exp(-delta)
        se_muestra = pp >= umbral
        versiones = {
            "1. el sueldo solo": p.sueldo.values,
            "2. sueldo más el mínimo, a todos": p.sueldo.values + q10,
            "3. sueldo más el mínimo, sólo sobre el umbral": p.sueldo.values + np.where(se_muestra, q10, 0),
            "4. sueldo más el mínimo calibrado, a todos": p.sueldo.values + q10_cal,
            "5. sueldo más el mínimo calibrado, sólo sobre el umbral": p.sueldo.values + np.where(se_muestra, q10_cal, 0),
        }
        grupos = {"A o B": p.comprobable.values, "negativos (la sobrestimación es un techo)": p.negativo.values,
                  "todos": np.ones(len(p), bool)}
        total = p.med_ivt.values
        res = {"reglas_del_modelo": r["reglas"],
               "umbral": {"puntaje": m.rd(umbral, 4), "se_muestra_a": int(se_muestra.sum()), "de": len(p),
                          "comprobables_mostrados": int((se_muestra & p.comprobable.values).sum()), "comprobables": int(p.comprobable.sum()),
                          "acierto_pct": m.rd(100 * p.comprobable.values[se_muestra].mean(), 1) if se_muestra.any() else None},
               "calibracion": {"cobertura_fuera_de_muestra_sin_calibrar_pct": cob_oof, "corrimiento_en_logaritmo": m.rd(delta, 3),
                               "factor_del_minimo": m.rd(np.exp(-delta), 3),
                               "cobertura_en_la_prueba_A_calibrado_pct": m.rd(100 * (p[p.grado == "A"].monto.values >= q10_cal[(p.grado == "A").values]).mean(), 1)},
               "sueldo_sobre_total_validado_mediana": {g: m.rd(np.median(p.sueldo.values[x] / total[x])) for g, x in grupos.items()},
               "por_grupo": {}}
        for g, x in grupos.items():
            res["por_grupo"][g] = {v: medir(e[x], total[x]) for v, e in versiones.items()}
            if x.sum() >= m.MIN_GRUPO:
                res["por_grupo"][g]["mediana_del_minimo_sumado_a_todos"] = m.rd(np.median(q10[x]), 0)
                res["por_grupo"][g]["mediana_del_minimo_calibrado"] = m.rd(np.median(q10_cal[x]), 0)
                res["por_grupo"][g]["mediana_del_sueldo"] = m.rd(np.median(p.sueldo.values[x]), 0)
        out["resultados"][entrenamiento] = res
        print(f"== {entrenamiento}: {len(p)} con RUC activo | umbral {res['umbral']} | calibración {res['calibracion']}", flush=True)
        for g in grupos:
            for v in versiones:
                x = res["por_grupo"][g][v]
                print(f"  {g[:9]:9} | {v[:48]:48} | n {x['n']} | razón {x['mediana_de_la_razon']} | ±10 {x['a_10pct']} ±20 {x['a_20pct']}"
                      f" | sobre>10 {x['sobrestimado_mas_de_10pct']} sobre>20 {x['sobrestimado_mas_de_20pct']} | sub>10 {x['subestimado_mas_de_10pct']}",
                      flush=True)
    out["entradas"] = {"tabla_de_la_sesion_1_sha256": c.huella(m.TABLA)}
    out["versiones"] = c.versiones()
    if not m.RAPIDO:
        c.escribir_json(METRICAS, out)
    print(f"listo en {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
