# El entrenamiento sin las personas sin respuesta comercial: la sesión 3 de docs/propuesta-adicional-del-dependiente.md, 8.4 (pedido del negocio
# del 2026-11-27, que respondió «ok» a lo que 8.1 dejó sin medir).
#
# Por qué: el 38% de la tabla de la sesión 1 (14.854 personas) no tiene respuesta comercial. De ellos, el 77% es negativo y el 0,4% comprobable:
# lo más probable es que el análisis no se haya completado, y entonces «sin adicional documentado» no dice nada. Es ruido en el negativo, como el
# de quien no buscaba porque el sueldo alcanzaba (8.1), pero con otra causa.
#
# La definición, fijada ANTES de medir:
#   - «Sin respuesta» es `med_resp` vacía: la consulta no tiene respuesta comercial vigente en el histórico de AWS
#     (`predictor_equifax_por_consulta.respuesta_comercial`). Cualquier respuesta, también RECHAZADO o PENDIENTE, cuenta como respuesta.
#   - Se sacan sólo del ENTRENAMIENTO (antes de julio de 2026): del clasificador, del monto y del umbral de R3.
#   - La prueba no cambia: en producción la respuesta no se conoce al consultar, así que el modelo ve a todos.
#
# Lo demás, tal cual: el clasificador, el monto y las reglas R1, R2 y R3, en el escenario principal y sin los anclados a la cifra. Dos variantes:
#   - «2026, con SRI»;
#   - la del RUC reconstruido con el catastro (8.2).
# La decisión es «mejora» si alguna pasa las tres reglas en el escenario principal.
#
# Sólo lee lo ya bajado; no consulta AWS, Equifax ni Proveedor_Info_1, no usa el modelo de lenguaje y no escribe en la base. A git va sólo
# `metricas/adicional-sin-respuesta-2026-11.json`.
#
#   python -I scripts/predictor-ingresos/adicional_sin_respuesta.py [--rapido]
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import adicional_catastro as k
import adicional_modelo as m
import comun as c

AQUI = Path(__file__).parent
METRICAS = AQUI / "metricas" / "adicional-sin-respuesta-2026-11.json"
ESCENARIOS = ["principal: A o B", "sin los anclados a la cifra"]
VARIANTES = ["2026, con SRI", k.VARIANTE_NUEVA]


def sin_respuesta_en_el_entrenamiento(t):
    return t.med_resp.isna() & (t.t < c.CORTE_FECHA)


def main():
    t0 = time.time()
    t = k.datos_con_catastro()
    k.registrar_variante()
    tr = k.con_reconstruido(t)
    fuera = sin_respuesta_en_el_entrenamiento(t)
    out = {"que_es": "docs/propuesta-adicional-del-dependiente.md, 8.4: el entrenamiento sin las personas sin respuesta comercial. Sólo agregados.",
           "corte": str(c.CORTE_FECHA.date()), "remuestreos": m.B,
           "sin_respuesta": {"en_la_tabla": int(t.med_resp.isna().sum()), "en_el_entrenamiento": int(fuera.sum()),
                             "en_la_prueba_que_queda": int((t.med_resp.isna() & (t.t >= c.CORTE_FECHA)).sum()),
                             "por_grado_en_el_entrenamiento": {g: int(n) for g, n in t[fuera].grado.value_counts().items()}},
           "resultados": {}}
    for entrenamiento in ("con todos (8.2)", "sin las personas sin respuesta"):
        out["resultados"][entrenamiento] = {}
        for variante in VARIANTES:
            base = tr if variante == k.VARIANTE_NUEVA else t
            d = base if entrenamiento.startswith("con todos") else base[~fuera.values].reset_index(drop=True)
            out["resultados"][entrenamiento][variante] = {}
            for escenario in ESCENARIOS:
                r = m.correr(d, variante, escenario)
                out["resultados"][entrenamiento][variante][escenario] = {x: r[x] for x in (
                    "reglas", "entrenamiento", "prueba", "si_tiene_un_adicional_comprobable_auc", "auc_fuera_de_muestra_en_el_entrenamiento",
                    "lo_que_se_mostraria", "variables_que_mas_pesan")} | {"cuanto_A": r["cuanto"]["A"]}
                g = r["reglas"]
                print(f"{entrenamiento} | {variante} | {escenario}: entrenan {r['entrenamiento']['entrenan_el_clasificador']}"
                      f" ({r['entrenamiento']['comprobables']} comprobables) | prueba {r['prueba']['personas']}"
                      f" | R1 {g['R1_auc_ruc_activo_075']['valor']} {g['R1_auc_ruc_activo_075']['ic']}"
                      f" | R2 {g['R2_minimo_cubre_90_y_mediana_05']['cobertura']} razón {g['R2_minimo_cubre_90_y_mediana_05']['minimo_sobre_real']}"
                      f" | R3 umbral {g['R3_mostrado_70_comprobable']['umbral']} máx. entrenamiento"
                      f" {r['lo_que_se_mostraria']['acierto_maximo_en_el_entrenamiento_con_10_o_mas_pct']}"
                      f" | top 1% {r['lo_que_se_mostraria']['por_fraccion_mostrada']['1%']['acierto_pct']}"
                      f" | {'PASA' if g['pasa'] else 'no pasa'} ({time.time() - t0:.0f} s)", flush=True)
    pasan = [v for v in VARIANTES if out["resultados"]["sin las personas sin respuesta"][v]["principal: A o B"]["reglas"]["pasa"]]
    out["decision"] = {"resultado": "mejora" if pasan else "no mejora", "pasan": pasan}
    out["entradas"] = {"tabla_de_la_sesion_1_sha256": c.huella(m.TABLA)}
    out["versiones"] = c.versiones()
    if not m.RAPIDO:
        c.escribir_json(METRICAS, out)
    print(f"DECISIÓN: {out['decision']} | {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
