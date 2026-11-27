# El RUC reconstruido con el catastro del SRI: la sesión 3 de docs/propuesta-adicional-del-dependiente.md, parte 2.
#
# Por qué: antes de 2026 AWS no sabe quién tiene RUC activo (0% en 2023 y 2024, 0,1% en 2025): el bloque SRI de Equifax existe desde diciembre de
# 2025. La curva de aprendizaje del 2026-11-27 dio que, con SRI y sin los anclados a la cifra, el AUC de A con RUC activo todavía sube con más casos
# (0,58 con 28 comprobables a 0,68 con 230). Sin SRI, sumar años viejos no agrega. Si el RUC de 2023 a 2025 se reconstruye, esos años entran con SRI.
#
# La fuente: el catastro del RUC del SRI, «Base de Datos Catastro RUC por provincia - Personas Naturales y Sociedades»
# (https://www.sri.gob.ec/datasets), de acceso libre (CC BY 4.0, sin registro y sin restricciones en robots.txt). Son 24 ZIP por provincia (606 MB),
# con corte al 2026-11-01, bajados el 2026-11-27 con el sí del usuario. El enlace publicado de Cañar da 404: el archivo es `SRI_RUC_Cañar.zip`, con
# eñe, y acá se guarda como `SRI_RUC_Canar.zip`. Trae una fila por establecimiento, con estado (ACTIVO, SUSPENDIDO, PASIVO), clase (GEN, RMP, SIM), obligado, tipo de contribuyente, las
# fechas de inicio, suspensión definitiva y reinicio, y el CIIU. Es una foto del 2026-11-01: de cada RUC sólo se ven la ÚLTIMA suspensión y el
# ÚLTIMO reinicio.
#
# El cruce: el RUC de una persona natural es su cédula más «001». La identificación sale de `predictor_equifax_por_consulta.csv` (ya bajado) y sólo
# se usa acá: el catastro reducido a la muestra queda en C:\datos\ingresos\catastro-sri y a git va sólo
# `metricas/adicional-catastro-2026-11.json`, con conteos y tasas.
#
# El estado a la fecha de la consulta `d`, con S la suspensión definitiva y R el reinicio:
#   - sin RUC en el catastro, o con el inicio después de `d`: sin RUC;
#   - sin S: ACTIVO;
#   - con R después de S (se suspendió y volvió): SUSPENDIDO si S <= d < R; si no, ACTIVO;
#   - con S después de R, o sin R: el estado de hoy desde S; ACTIVO antes de S. Si hay R y `d` es anterior, hubo una suspensión previa de fecha
#     desconocida: se toma ACTIVO y se cuenta aparte («ambiguo»).
#   La clase, el obligado y el CIIU son los de hoy (los del establecimiento de número más bajo). La clase se traduce a la de Equifax: GEN → OTROS,
#   RMP → RIMPE, SIM → RISE, y ESPECIAL si el contribuyente es especial. `sri_antig` y `sri_susp` se calculan como en `preparar.py`; `sri_susp`
#   queda vacía si S es posterior a `d`.
#
# Cuándo la paridad SIRVE, fijado ANTES de medir. Se mide contra el bloque SRI de Equifax en los casos de 2026 que lo tienen, que dice lo que el SRI
# decía ese día:
#   P1  RUC activo: sensibilidad de 90% o más (de los que Equifax da con RUC activo, el reconstruido también) y especificidad de 95% o más.
#   P2  Las dos se sostienen hacia atrás: en el mes más viejo con bloque (diciembre de 2025 y enero de 2026 juntos), ninguna baja más de 5 puntos
#       respecto de la de todo 2026. Los años que se reconstruyen están más lejos de la foto: si la paridad ya cae en un año, a dos o tres no sirve.
#   Si no sirve, el modelo no se vuelve a correr (no se fuerza).
#   Corrección DESPUÉS de medir, en la referencia y no en la reconstrucción ni en las reglas: la primera corrida dio P1 (95,4% y 95,0%) y no P2
#   (especificidad de 88,6% en diciembre y enero). 59 de los 103 falsos activos de enero eran bloques de Equifax que se contradicen: estado ACTIVO con
#   `sri_tiene_ruc` falso, y `ruc_activo` los cuenta como sin RUC. En `sri_por_consulta.csv` hay 1.858 así, todos de enero de 2026 (de 10.805
#   bloques de ese mes; ninguno en otro mes). Equifax no dijo qué decía el SRI ese día, así que no sirven de referencia y la paridad los saca. El
#   resultado literal queda en el JSON (`paridad_literal`).
#
# Si sirve: el modelo de la sesión 2 tal cual (clasificador, monto y reglas R1, R2 y R3), con una variante nueva: entrena con 2023 a junio de 2026, con
# el SRI de Equifax donde está y el reconstruido donde no, y prueba con lo mismo que la variante «2026, con SRI» (desde julio de 2026, con el bloque de
# Equifax). La parte 1 (el negativo corregido) no mejoró: no se combina.
#
# No consulta AWS, Equifax ni Proveedor_Info_1, no usa el modelo de lenguaje y no escribe en la base.
#
#   python -I scripts/predictor-ingresos/adicional_catastro.py [--rapido]
import sys
import time
import zipfile
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import adicional_modelo as m
import comun as c
import preparar as p

AQUI = Path(__file__).parent
METRICAS = AQUI / "metricas" / "adicional-catastro-2026-11.json"
CARPETA = c.RAIZ_DATOS / "catastro-sri"
DESCARGAS = CARPETA / "descargas"
MUESTRA = CARPETA / "catastro-de-la-muestra.parquet"
CLASE = {"GEN": "OTROS", "RMP": "RIMPE", "SIM": "RISE"}
SENS_MIN, ESPEC_MIN, CAIDA_MAX = 90.0, 95.0, 5.0
ESCENARIOS = ["principal: A o B", "sin los anclados a la cifra"]
VARIANTE_NUEVA = "2023 a 2026, con el RUC reconstruido antes del bloque"


def identificaciones():
    """La identificación y la fecha de cada consulta de la tabla de la sesión 1. No sale de esta función más que como RUC."""
    ids = pd.read_parquet(m.TABLA, columns=["id_consulta_equifax"])
    q = duckdb.connect().execute(f"""
        select cast(id_consulta_equifax as bigint) id_consulta_equifax, identificacion, fecha_consulta_equifax
        from {p.leer('predictor_equifax_por_consulta', texto=True)}""").df()
    q["id_consulta_equifax"] = q.id_consulta_equifax.astype("int64")
    q = q[q.id_consulta_equifax.isin(ids.id_consulta_equifax)].drop_duplicates("id_consulta_equifax")
    q["ruc"] = q.identificacion.str.strip().str.zfill(10) + "001"
    q["fecha_consulta"] = pd.to_datetime(q.fecha_consulta_equifax, errors="coerce")
    return q[["id_consulta_equifax", "ruc", "fecha_consulta"]]


def catastro(rucs):
    """El catastro de personas naturales reducido a los RUC de la muestra, uno por RUC. Se arma una vez desde los ZIP."""
    if MUESTRA.exists():
        return pd.read_parquet(MUESTRA)
    partes, filas, zips = [], 0, sorted(DESCARGAS.glob("SRI_RUC_*.zip"))
    for z in zips:
        with zipfile.ZipFile(z) as zz:
            nombre = [i.filename for i in zz.infolist() if i.filename.lower().endswith(".csv")][0]
            for trozo in pd.read_csv(zz.open(nombre), sep="|", dtype=str, encoding="utf-8", chunksize=500_000, on_bad_lines="skip"):
                filas += len(trozo)
                partes.append(trozo[trozo.NUMERO_RUC.isin(rucs) & trozo.TIPO_CONTRIBUYENTE.eq("PERSONA NATURAL")])
    k = pd.concat(partes)
    k["n_est"] = pd.to_numeric(k.NUMERO_ESTABLECIMIENTO, errors="coerce")
    k = k.sort_values(["NUMERO_RUC", "n_est"]).drop_duplicates("NUMERO_RUC")
    k = k[["NUMERO_RUC", "ESTADO_CONTRIBUYENTE", "CLASE_CONTRIBUYENTE", "OBLIGADO", "ESPECIAL", "FECHA_INICIO_ACTIVIDADES",
           "FECHA_SUSPENSION_DEFINITIVA", "FECHA_REINICIO_ACTIVIDADES", "CODIGO_CIIU"]].rename(columns={"NUMERO_RUC": "ruc"})
    k.attrs = {}
    CARPETA.mkdir(parents=True, exist_ok=True)
    k.to_parquet(MUESTRA, index=False)
    print(f"catastro: {len(zips)} ZIP, {c.miles(filas)} filas, {c.miles(len(k))} RUC de la muestra", flush=True)
    return k


def reconstruir(q, k):
    """El SRI a la fecha de cada consulta, con los mismos nombres que `preparar.py` y el sufijo `_r`."""
    d = q.merge(k, on="ruc", how="left")
    f = d.fecha_consulta
    ini = pd.to_datetime(d.FECHA_INICIO_ACTIVIDADES, errors="coerce")
    S = pd.to_datetime(d.FECHA_SUSPENSION_DEFINITIVA, errors="coerce")
    R = pd.to_datetime(d.FECHA_REINICIO_ACTIVIDADES, errors="coerce")
    tiene = d.ESTADO_CONTRIBUYENTE.notna() & (ini <= f)
    hoy = d.ESTADO_CONTRIBUYENTE.str.upper()
    volvio = R.notna() & S.notna() & (R > S)
    estado = np.select(
        [~tiene, S.isna(), volvio & (S <= f) & (f < R), volvio, (S <= f)],
        [None, "ACTIVO", "SUSPENDIDO", "ACTIVO", hoy], default="ACTIVO")
    d["sri_ruc_r"] = tiene.astype(float)
    d["sri_estado_r"] = pd.Series(estado, index=d.index).where(tiene)
    d["ambiguo"] = tiene & R.notna() & S.notna() & ~volvio & (f < R)
    d["sri_clase_r"] = np.where(d.ESPECIAL.fillna("").str.upper().str.startswith(("S", "E")), "ESPECIAL",
                                d.CLASE_CONTRIBUYENTE.map(CLASE))
    d["sri_clase_r"] = d.sri_clase_r.where(tiene)
    d["sri_obligado_r"] = d.OBLIGADO.map({"S": 1.0, "N": 0.0}).where(tiene)
    d["sri_antig_r"] = ((f - ini).dt.days / 365.25).clip(lower=0).where(tiene)
    d["sri_susp_r"] = ((f - S).dt.days / 365.25).where(tiene & (S <= f))
    codigo = d.CODIGO_CIIU.fillna("").str.replace(r"[^A-Za-z0-9]", "", regex=True).str.upper().replace("", np.nan)
    d["sri_ciiu_secc_r"] = codigo.str[0].where(tiene)
    d["sri_ciiu_div_r"] = codigo.str[:3].where(tiene)
    d["ruc_activo_r"] = tiene & d.sri_estado_r.eq("ACTIVO")
    d["en_catastro"] = d.ESTADO_CONTRIBUYENTE.notna()
    return d[["id_consulta_equifax", "en_catastro", *[x for x in d.columns if x.endswith("_r")], "ambiguo"]]


def pct(x):
    return m.rd(100 * float(np.mean(x)), 1) if len(x) else None


def contradictorio(t):
    """El bloque de Equifax que da estado sin RUC (sólo en enero de 2026): no dice qué decía el SRI ese día."""
    return (t.sri_ruc == 0) & t.sri_estado.notna()


def paridad(t, sin_contradictorios=True):
    """El reconstruido contra el bloque de Equifax del mismo día, en 2026."""
    fuera = contradictorio(t) if sin_contradictorios else pd.Series(False, index=t.index)
    e = t[t.sri_bloque & (t.t.dt.year >= 2025) & ~fuera]
    if not len(e):
        return {}

    def sens_espec(g):
        pos, neg = g[g.ruc_activo], g[~g.ruc_activo]
        return {"personas": len(g), "con_ruc_activo_en_equifax": len(pos), "sensibilidad_pct": pct(pos.ruc_activo_r),
                "especificidad_pct": pct(~neg.ruc_activo_r), "acuerdo_pct": pct(g.ruc_activo == g.ruc_activo_r)}

    mes = e.t.dt.to_period("M").astype(str)
    viejo = e[mes.isin(["2025-12", "2026-01"])]
    ambos = e[(e.sri_ruc == 1) & (e.sri_ruc_r == 1)]
    r = {"todo": sens_espec(e), "diciembre_y_enero": sens_espec(viejo),
         "por_mes": {k: sens_espec(g) for k, g in e.groupby(mes)},
         "tiene_ruc": {"equifax_si_reconstruido_si": int(((e.sri_ruc == 1) & (e.sri_ruc_r == 1)).sum()),
                       "equifax_si_reconstruido_no": int(((e.sri_ruc == 1) & (e.sri_ruc_r == 0)).sum()),
                       "equifax_no_reconstruido_si": int(((e.sri_ruc == 0) & (e.sri_ruc_r == 1)).sum()),
                       "equifax_no_reconstruido_no": int(((e.sri_ruc == 0) & (e.sri_ruc_r == 0)).sum())},
         "con_ruc_en_los_dos": {"personas": len(ambos),
                                "estado_igual_pct": pct(ambos.sri_estado == ambos.sri_estado_r),
                                "clase_igual_pct": pct(ambos.sri_clase == ambos.sri_clase_r),
                                "obligado_igual_pct": pct(ambos.sri_obligado == ambos.sri_obligado_r),
                                "ciiu_seccion_igual_pct": pct(ambos.sri_ciiu_secc == ambos.sri_ciiu_secc_r),
                                "ciiu_division_igual_pct": pct(ambos.sri_ciiu_div == ambos.sri_ciiu_div_r),
                                "inicio_a_menos_de_un_mes_pct": pct((ambos.sri_antig - ambos.sri_antig_r).abs() < 1 / 12),
                                "ambiguos": int(ambos.ambiguo.sum())},
         "estado_equifax_contra_reconstruido": {f"{a} / {b}": int(n) for (a, b), n in
                                                e.fillna({"sri_estado": "sin RUC", "sri_estado_r": "sin RUC"})
                                                .groupby(["sri_estado", "sri_estado_r"]).size().items()},
         "clase_equifax_contra_reconstruido": {f"{a} / {b}": int(n) for (a, b), n in
                                               ambos.fillna({"sri_clase": "vacía", "sri_clase_r": "vacía"}).groupby(["sri_clase", "sri_clase_r"]).size().items()}}
    s, es = r["todo"]["sensibilidad_pct"], r["todo"]["especificidad_pct"]
    sv, ev = r["diciembre_y_enero"]["sensibilidad_pct"], r["diciembre_y_enero"]["especificidad_pct"]
    p1 = s is not None and s >= SENS_MIN and es >= ESPEC_MIN
    p2 = sv is not None and (s - sv) <= CAIDA_MAX and (es - ev) <= CAIDA_MAX
    r["reglas"] = {"P1_sensibilidad_90_especificidad_95": bool(p1), "P2_no_cae_mas_de_5_puntos_en_dic_y_ene": bool(p2), "sirve": bool(p1 and p2)}
    return r


def con_reconstruido(t):
    """Donde no hay bloque de Equifax, el SRI y el RUC activo reconstruidos. Donde lo hay, el de Equifax tal cual."""
    t = t.copy()
    sin = ~t.sri_bloque
    for col in c.SRI_PROVEEDOR_INFO_1 + c.SRI_EQUIFAX:
        t.loc[sin, col] = t.loc[sin, col + "_r"]
    t.loc[sin, "ruc_activo"] = t.loc[sin, "ruc_activo_r"]
    return t


def main():
    t0 = time.time()
    t = m.datos()
    q = identificaciones()
    k = catastro(set(q.ruc))
    r = reconstruir(q, k)
    t = t.merge(r, on="id_consulta_equifax", how="left", validate="one_to_one")
    t["ruc_activo_r"] = t.ruc_activo_r.eq(True)
    t["anio"] = t.t.dt.year
    print(f"{c.miles(len(t))} personas; en el catastro {c.miles(int(t.en_catastro.eq(True).sum()))}; {time.time() - t0:.0f} s", flush=True)

    por_anio = t.groupby("anio").agg(personas=("grado", "size"), ruc_activo_equifax_pct=("ruc_activo", lambda x: 100 * x.mean()),
                                    ruc_activo_reconstruido_pct=("ruc_activo_r", lambda x: 100 * x.mean()),
                                    en_el_catastro_pct=("en_catastro", lambda x: 100 * x.eq(True).mean()),
                                    A=("grado", lambda g: (g == "A").sum()), B=("grado", lambda g: (g == "B").sum()))
    out = {"que_es": "docs/propuesta-adicional-del-dependiente.md, sesión 3, parte 2: el RUC reconstruido con el catastro del SRI. Sólo agregados.",
           "fuente": {"nombre": "Catastro RUC por provincia - Personas Naturales y Sociedades (SRI, datos abiertos, CC BY 4.0)",
                      "corte": "2026-11-01", "zip": len(list(DESCARGAS.glob("SRI_RUC_*.zip")))},
           "por_anio": {int(a): {kk: (m.rd(v, 1) if isinstance(v, float) else int(v)) for kk, v in fila.items()} for a, fila in por_anio.iterrows()},
           "comprobables_con_ruc_activo_por_anio": {int(a): {"A": int(((g.grado == "A") & g.ruc_activo_r).sum()), "B": int(((g.grado == "B") & g.ruc_activo_r).sum())}
                                                    for a, g in t.groupby("anio")},
           "ambiguos_antes_de_2026": int(t[t.anio < 2026].ambiguo.eq(True).sum()),
           "bloques_contradictorios_en_la_muestra": {str(k): int(n) for k, n in t[contradictorio(t)].t.dt.to_period("M").value_counts().items()},
           "paridad_con_equifax": paridad(t),
           "paridad_literal": {kk: v for kk, v in paridad(t, sin_contradictorios=False).items() if kk in ("todo", "diciembre_y_enero", "reglas")}}
    sirve = out["paridad_con_equifax"]["reglas"]["sirve"]
    print("paridad:", {kk: out["paridad_con_equifax"][kk] for kk in ("todo", "diciembre_y_enero", "reglas")}, flush=True)

    out["resultados"] = {}
    if sirve:
        tr = con_reconstruido(t)
        m.VARIANTES[VARIANTE_NUEVA] = {
            "filtro": lambda d: ((d.sri_bloque & (d.t.dt.year == 2026)) | (~d.sri_bloque & (d.t.dt.year >= 2023) & (d.t < c.CORTE_FECHA))).values,
            "cols": m.VARIANTES["2026, con SRI"]["cols"]}
        for variante in ["2026, con SRI", VARIANTE_NUEVA]:
            out["resultados"][variante] = {}
            for escenario in ESCENARIOS:
                res = m.correr(tr if variante == VARIANTE_NUEVA else t, variante, escenario)
                out["resultados"][variante][escenario] = {kk: res[kk] for kk in ("reglas", "entrenamiento", "prueba", "si_tiene_un_adicional_comprobable_auc",
                                                                                   "auc_fuera_de_muestra_en_el_entrenamiento", "lo_que_se_mostraria",
                                                                                   "variables_que_mas_pesan")} | {"cuanto_A": res["cuanto"]["A"]}
                g = res["reglas"]
                print(f"{variante} | {escenario}: entrenan {res['entrenamiento']['entrenan_el_clasificador']} ({res['entrenamiento']['comprobables']} comprobables)"
                      f" | R1 {g['R1_auc_ruc_activo_075']['valor']} {g['R1_auc_ruc_activo_075']['ic']}"
                      f" | R2 {g['R2_minimo_cubre_90_y_mediana_05']['cobertura']} razón {g['R2_minimo_cubre_90_y_mediana_05']['minimo_sobre_real']}"
                      f" | R3 umbral {g['R3_mostrado_70_comprobable']['umbral']} acierto {g['R3_mostrado_70_comprobable']['acierto']}"
                      f" máx. entrenamiento {res['lo_que_se_mostraria']['acierto_maximo_en_el_entrenamiento_con_10_o_mas_pct']}"
                      f" | {'PASA' if g['pasa'] else 'no pasa'} ({time.time() - t0:.0f} s)", flush=True)
        pasa = out["resultados"][VARIANTE_NUEVA]["principal: A o B"]["reglas"]["pasa"]
        out["decision"] = {"paridad": "sirve", "resultado": "sigue" if pasa else "sigue cerrada"}
    else:
        out["decision"] = {"paridad": "no sirve", "resultado": "sigue cerrada", "nota": "El modelo no se volvió a correr."}
    out["entradas"] = {"tabla_de_la_sesion_1_sha256": c.huella(m.TABLA)}
    out["versiones"] = c.versiones()
    if not m.RAPIDO:
        c.escribir_json(METRICAS, out)
    print(f"DECISIÓN: {out['decision']} | {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
