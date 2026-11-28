# El negativo corregido: la sesión 3 de docs/propuesta-adicional-del-dependiente.md, parte 1. Mide si el modelo de la sesión 2
# (`adicional_modelo.py`, que no pasó) pasa cuando el negativo es sólo de quien tenía razón para buscar un adicional.
#
# Por qué: el negativo de la sesión 2 es «sin adicional documentado», y el analista no busca un adicional cuando el sueldo ya alcanza. El clasificador
# aprendía cuándo se documenta, no quién tiene un adicional: lo comprobable entre lo mostrado no pasó de 20% (R3). Si la población se reduce a quien
# el sueldo solo no le alcanzaba, el negativo debería ser más limpio: ahí el analista sí tenía por qué buscar.
#
# Las definiciones, fijadas ANTES de medir. Ninguna usa algo que se conoce después de la consulta: ni el perfil final, ni la respuesta, ni el
# monto aprobado. `perfil_riesgo_catalogo` pone un ingreso mínimo por perfil (1.200 para AAA PLUS a AA, 1.500 para A y B, 1.700 para C y E;
# docs/base-aws-originacion.md, punto 18), pero el perfil es el final, que sale después: por eso N1 y N1b usan el mínimo sin perfil.
#   N1   El sueldo (`ver_f`) está debajo de 1.200: no alcanza el mínimo de ningún perfil.
#   N1b  El sueldo está debajo de 1.700: no alcanza el mínimo de todos los perfiles (el de C y E).
#   N2   La cuota del buró (`cuota_fin`, la cuota financiera de Equifax a la consulta) más la cuota del crédito pedido (`cuota_pagar` del simulador,
#        en `credito_por_requerimiento.csv`) sobre el sueldo pasa de 0,40.
#        - El límite de la política no está en AWS: `capacidad_pago` no sigue una razón fija del ingreso (medido el 2026-11-27: su razón sobre el
#          ingreso del hogar va de 0 a 0,76 entre el percentil 5 y el 95, con 5.531 en cero). El 0,40 es la regla habitual de carga y queda cerca
#          del percentil 90 de la cuota más el gasto financiero sobre el ingreso del hogar en OK FACTURAR (0,41).
#        - `credito_por_requerimiento.csv` sólo trae OK FACTURAR (con y sin condicionado): N2 se mide sólo ahí, y esa población la elige la
#          respuesta. Si pasa sólo N2, no decide sola: hay que medirla con la cuota pedida de todos los requerimientos, que no está bajada.
#        - Sin cuota del buró (vacía) no cuenta como «no alcanzaba».
#
# Dos alcances:
#   - «la población» (DECIDE): positivos y negativos se reducen a quien tenía razón para buscar. Es lo que se podría aplicar en producción (la
#     definición se conoce al consultar): el adicional se mostraría sólo cuando el sueldo no alcanza. R3 se mide en esa población.
#   - «sólo el negativo» (se informa, no decide): los positivos quedan todos y sólo el negativo se reduce. R3 ahí no es honesto: en producción
#     el modelo vería también a los negativos que se sacaron, y de ellos no se sabe si tienen un adicional.
#
# Lo demás, tal cual la sesión 2: el clasificador, el monto, las tres reglas (R1 AUC de 0,75 con RUC activo; R2 el mínimo cubre al 90% de los A con
# una mediana de 0,5; R3 de lo mostrado con RUC activo, 70% comprobable con el umbral elegido en el entrenamiento), las dos variantes (todos los
# años sin SRI y 2026 con SRI), la prueba hacia adelante desde julio de 2026, y el principal y sin los anclados a la cifra aparte. Además, la
# población sin reducir, como control: tiene que dar lo de la sesión 2.
#
# La decisión: «mejora» si alguna definición, en el alcance «la población», pasa R1, R2 y R3 en alguna variante del escenario principal. Si no,
# la opción (b) de A14 sigue cerrada por este camino.
#
# Lee la tabla de la sesión 1 y las extracciones de AWS ya bajadas. No consulta AWS, Equifax ni Proveedor_Info_1, no usa el modelo de lenguaje y no
# escribe en la base. A git va sólo `metricas/adicional-negativo-2026-11.json`: conteos, tasas, razones e intervalos.
#
#   python -I scripts/predictor-ingresos/adicional_negativo.py [--rapido]
import sys
import time
from pathlib import Path

import duckdb
import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import adicional_modelo as m
import comun as c
import preparar as p

AQUI = Path(__file__).parent
METRICAS = AQUI / "metricas" / "adicional-negativo-2026-11.json"
LIMITE_CARGA = 0.40
DEFINICIONES = {
    "N1: sueldo debajo de 1.200": lambda t: (t.sueldo < 1200).values,
    "N1b: sueldo debajo de 1.700": lambda t: (t.sueldo < 1700).values,
    "N2: cuota del buró más la pedida sobre el sueldo, más de 0,40 (sólo OK FACTURAR)": lambda t: (t.carga_con_pedido > LIMITE_CARGA).values,
}
ESCENARIOS = ["principal: A o B", "sin los anclados a la cifra"]


def cuota_pedida():
    """La cuota del crédito pedido por id de consulta: la consulta del titular → su requerimiento → el simulador. Sólo OK FACTURAR."""
    return duckdb.connect().execute(f"""
        with k as (select id_requerimiento, max(cuota_pagar) cuota_pedida from {p.leer('credito_por_requerimiento')}
                   where cuota_pagar > 0 group by 1)
        select q.id_consulta_equifax, k.cuota_pedida
        from {p.leer('predictor_equifax_por_consulta')} q join k using (id_requerimiento)
        where q.tipo_deudor = 'TITULAR'""").df().drop_duplicates("id_consulta_equifax")


def conteos(t, razon):
    sub = t[razon]
    prueba = sub[sub.t >= c.CORTE_FECHA]
    ruc = prueba[prueba.ruc_activo]
    return {"personas": int(razon.sum()), "pct_de_todos": m.rd(100 * razon.mean(), 1),
            "negativos": int(sub.negativo.sum()), "A": int((sub.grado == "A").sum()), "B": int((sub.grado == "B").sum()),
            "en_la_prueba": {"personas": len(prueba), "negativos": int(prueba.negativo.sum()), "A": int((prueba.grado == "A").sum()),
                             "B": int((prueba.grado == "B").sum()), "con_ruc_activo": len(ruc), "negativos_con_ruc_activo": int(ruc.negativo.sum()),
                             "A_con_ruc_activo": int((ruc.grado == "A").sum()), "B_con_ruc_activo": int((ruc.grado == "B").sum())},
            "tasa_comprobable_con_ruc_activo_pct": m.rd(100 * sub[sub.ruc_activo].grado.isin(["A", "B"]).mean(), 1)}


def resumen(r):
    """Lo que decide y lo que hace falta para leerlo, sin el detalle de la sesión 2 (que queda en su JSON)."""
    mo = r["lo_que_se_mostraria"]
    return {"reglas": r["reglas"], "prueba": r["prueba"], "entrenamiento": r["entrenamiento"],
            "auc": r["si_tiene_un_adicional_comprobable_auc"], "auc_fuera_de_muestra_en_el_entrenamiento": r["auc_fuera_de_muestra_en_el_entrenamiento"],
            "lo_que_se_mostraria": mo, "cuanto_A": r["cuanto"]["A"], "variables_que_mas_pesan": r["variables_que_mas_pesan"]}


def main():
    t0 = time.time()
    t = m.datos()
    k = cuota_pedida()
    t = t.merge(k, on="id_consulta_equifax", how="left", validate="one_to_one")
    t["carga_con_pedido"] = (t.cuota_fin + t.cuota_pedida) / t.sueldo
    print(f"{c.miles(len(t))} personas; con cuota pedida {c.miles(int(t.cuota_pedida.notna().sum()))}; {time.time() - t0:.0f} s", flush=True)

    out = {"que_es": "docs/propuesta-adicional-del-dependiente.md, sesión 3, parte 1: el negativo corregido. Sólo agregados.",
           "corte": str(c.CORTE_FECHA.date()), "remuestreos": m.B, "limite_de_carga": LIMITE_CARGA,
           "con_cuota_pedida": int(t.cuota_pedida.notna().sum()), "conteos": {"sin reducir": conteos(t, np.ones(len(t), bool))},
           "resultados": {}}
    alcances = {"sin reducir (control)": {"": np.ones(len(t), bool)}}
    for nombre, f in DEFINICIONES.items():
        razon = f(t)
        out["conteos"][nombre] = conteos(t, razon)
        alcances.setdefault("la población", {})[nombre] = razon
        alcances.setdefault("sólo el negativo", {})[nombre] = razon | ~t.negativo.values

    for alcance, defs in alcances.items():
        for nombre, mascara in defs.items():
            sub = t[mascara].reset_index(drop=True)
            clave = f"{alcance} | {nombre}" if nombre else alcance
            out["resultados"][clave] = {}
            for variante in m.VARIANTES:
                out["resultados"][clave][variante] = {}
                for escenario in ESCENARIOS:
                    r = m.correr(sub, variante, escenario)
                    out["resultados"][clave][variante][escenario] = resumen(r)
                    g = r["reglas"]
                    print(f"{clave} | {variante} | {escenario}: A {r['prueba']['A']} ({r['prueba']['A_con_ruc_activo']} con RUC)"
                          f" | R1 {g['R1_auc_ruc_activo_075']['valor']} {g['R1_auc_ruc_activo_075']['ic']}"
                          f" | R2 {g['R2_minimo_cubre_90_y_mediana_05']['cobertura']} razón {g['R2_minimo_cubre_90_y_mediana_05']['minimo_sobre_real']}"
                          f" | R3 umbral {g['R3_mostrado_70_comprobable']['umbral']} acierto {g['R3_mostrado_70_comprobable']['acierto']}"
                          f" máx. entrenamiento {r['lo_que_se_mostraria']['acierto_maximo_en_el_entrenamiento_con_10_o_mas_pct']}"
                          f" | {'PASA' if g['pasa'] else 'no pasa'} ({time.time() - t0:.0f} s)", flush=True)

    control = out["resultados"]["sin reducir (control)"]["todos los años, sin SRI"]["principal: A o B"]["reglas"]["R1_auc_ruc_activo_075"]["valor"]
    out["control_igual_a_la_sesion_2"] = {"R1_sin_SRI": control, "esperado": 0.631, "igual": abs(control - 0.631) < 0.0015}
    pasan = [f"{d} | {v}" for d in DEFINICIONES for v in m.VARIANTES
             if out["resultados"][f"la población | {d}"][v]["principal: A o B"]["reglas"]["pasa"]]
    out["decision"] = {"resultado": "mejora" if pasan else "no mejora", "pasan": pasan,
                       "nota": "Decide el alcance «la población», escenario principal. Si sólo pasa N2, no decide sola (población elegida por la respuesta)."}
    out["entradas"] = {"tabla_de_la_sesion_1_sha256": c.huella(m.TABLA)}
    out["versiones"] = c.versiones()
    if not m.RAPIDO:
        c.escribir_json(METRICAS, out)
    print("control igual a la sesión 2:", out["control_igual_a_la_sesion_2"])
    print(f"DECISIÓN: {out['decision']['resultado']} {pasan} | {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
