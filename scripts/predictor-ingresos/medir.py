# Mide el predictor de ingresos: reproduce las tablas de la sección 3.1 de la especificación y de 12.24 de la investigación (validación cruzada por
# persona y validación por fecha), con intervalos del 95% por remuestreo de personas, y la cobertura por grupo y por tipo de respuesta.
# Reemplaza a r4_5, r4_7, r4_8, r4_10 y r4_11. Si están los resultados de esos guiones (C:\datos\ingresos\resultados), cotea cada número y
# dice cuáles no coinciden: «los números tienen que coincidir o explicar por qué».
#
#   python -I scripts/predictor-ingresos/medir.py [--sin-cotejo] [--recalcular]
import hashlib
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c

SALIDA = c.RESULTADOS / "medir"
VIEJOS = c.RAIZ_DATOS / "resultados"
# Los nombres de las variantes en los guiones viejos, para cotejar.
NOMBRE_VIEJO = {
    "1 Proveedor_Info_1, sin SRI": "N1 Proveedor_Info_1", "1 con el SRI de Proveedor_Info_1": "N1 + SRI de Proveedor_Info_1", "1 con el SRI, la clase y el CIIU": "N1 + SRI de Proveedor_Info_1 + clase y CIIU",
    "2 Proveedor_Info_1 y buró, sin SRI": "N2 Proveedor_Info_1 y buro", "2 con el SRI de Proveedor_Info_1": "N2 + SRI de Proveedor_Info_1", "2 con el SRI, la clase y el CIIU": "N2 + SRI de Proveedor_Info_1 + clase y CIIU",
}
# Los niveles de 12.24, con los que se cotea contra los guiones viejos: el nivel 1 de entonces es c.NIVEL_1_ANTERIOR.
NIVEL_1, NIVEL_2 = "1 con el SRI de Proveedor_Info_1", "2 con el SRI, la clase y el CIIU"
# El nivel 1 que se entrena y se exporta (c.NIVELES[1]), por su nombre en c.VARIANTES_NIVEL_1.
NIVEL_1_VIGENTE = next(n for n, cols in c.VARIANTES_NIVEL_1.items() if cols == c.NIVELES[1])


def coma(x, d=1):
    return "—" if x is None or (isinstance(x, float) and np.isnan(x)) else f"{x:,.{d}f}".replace(",", "X").replace(".", ",").replace("X", ".")


def tabla_md(filas, columnas):
    t = ["| " + " | ".join(n for n, _ in columnas) + " |", "|" + "---|" * len(columnas)]
    for f in filas:
        t.append("| " + " | ".join(fn(f) for _, fn in columnas) + " |")
    return "\n".join(t)


def ic(f, k, d=1):
    return f"{coma(f[k], d)} ({coma(f[k + '_ic_bajo'], d)} a {coma(f[k + '_ic_alto'], d)})"


# ---------------------------------------------------------------- cuantiles fuera de muestra
def oof(t, cat, recalcular, variantes=c.VARIANTES_SRI):
    """Validación cruzada por persona de cada variante (las seis de 12.24 por omisión), guardada en disco para no repetirla."""
    SALIDA.mkdir(parents=True, exist_ok=True)
    Q = {}
    for nombre, cols in variantes.items():
        # La clave del archivo es el contenido de las columnas, no su nombre: cambiar las variables de un nivel invalida la copia.
        ruta = SALIDA / ("oof-" + hashlib.sha1("|".join(cols).encode()).hexdigest()[:10] + ".npy")
        if ruta.exists() and not recalcular:
            Q[nombre] = np.load(ruta)
        else:
            t0 = time.time()
            Q[nombre] = c.validacion_cruzada(t, cols, cat)
            np.save(ruta, Q[nombre])
            print(f"  validación cruzada «{nombre}»: {time.time() - t0:.0f} s", flush=True)
    return Q


def por_fecha(t, cat, variantes=c.VARIANTES_SRI):
    """Entrena con las consultas de antes de julio y predice las de julio a octubre, en cada variante."""
    tr, te = t[t.t < c.CORTE_FECHA], t[t.t >= c.CORTE_FECHA].reset_index(drop=True)
    cat_tr = c.categorias_de(tr)
    Q = {}
    for nombre, cols in variantes.items():
        modelos = c.entrenar_cuantiles(c.matriz(tr, cols, cat_tr), tr.y)
        Q[nombre] = c.predecir(modelos, c.matriz(te, cols, cat_tr))
    return te, Q


def subconjuntos(t):
    return {"todas": np.arange(len(t)), "OK FACTURAR y condicionado": np.where(t.med_resp.isin(c.OK_FACTURAR))[0]}


def grupos(t):
    est, ant, clase = t.sri_estado.astype(str), t.sri_antig, t.sri_clase.astype(str)
    g = {
        "todas": np.ones(len(t), bool),
        "con RUC": (t.sri_ruc == 1).values, "sin RUC": (t.sri_ruc == 0).values,
        "RUC activo": (est == "ACTIVO").values, "RUC suspendido": (est == "SUSPENDIDO").values,
        "antigüedad de menos de 2 años": (ant < 2).values, "antigüedad de 2 a 5": ((ant >= 2) & (ant < 5)).values,
        "antigüedad de 5 a 10": ((ant >= 5) & (ant < 10)).values, "antigüedad de 10 o más": (ant >= 10).values,
        "clase RIMPE": (clase == "RIMPE").values, "clase OTROS": (clase == "OTROS").values,
        "obligado a contabilidad": (t.sri_obligado == 1).values,
        "solo cuentas o IVA, sin marca de predictor": t.med_cuentas_o_iva_sin_predictor.values,
    }
    # Por tipo de respuesta: lo que separa la cobertura (en los rechazados el analista baja el ingreso, 12.21).
    for r, n in t.med_resp.value_counts(dropna=False).items():
        if n >= 100:
            g["respuesta: " + ("sin respuesta" if pd.isna(r) else str(r).capitalize())] = (t.med_resp.isna() if pd.isna(r) else t.med_resp == r).values
    g["respuesta: OK FACTURAR y condicionado"] = t.med_resp.isin(c.OK_FACTURAR).values
    return g


# ---------------------------------------------------------------- cotejo contra los guiones viejos
def cotejar(filas, viejo, clave_nuevo, clave_viejo, etiqueta, tol):
    """Compara la tabla nueva con la vieja y lista lo que difiere más que la tolerancia. Devuelve (comparadas, distintas)."""
    dist, n = [], 0
    for f in filas:
        v = viejo.get(clave_viejo(f))
        if v is None:
            continue
        for kn, kv, tl in tol:
            if kv in v and pd.notna(v[kv]) and kn in f:
                n += 1
                if abs(f[kn] - v[kv]) > tl:
                    dist.append((etiqueta, clave_viejo(f), kn, round(float(f[kn]), 3), float(v[kv])))
    return n, dist


def main():
    t0 = time.time()
    recalcular = "--recalcular" in sys.argv
    t = c.cargar_tabla()
    cat = c.categorias_de(t)
    real = t.unver.values
    informe, distintas, comparadas = [], [], 0
    SALIDA.mkdir(parents=True, exist_ok=True)
    print(f"{len(t):,} independientes con el bloque del SRI; {int(t.med_resp.isin(c.OK_FACTURAR).sum()):,} en OK FACTURAR y condicionado".replace(",", "."))

    # ============ 1) validación cruzada por persona
    Q = oof(t, cat, recalcular)
    M = {n: c.Medidas(q, real) for n, q in Q.items()}
    sub = subconjuntos(t)
    filas = []
    for n, m in M.items():
        for s, idx in sub.items():
            filas.append({"variante": n, "subconjunto": s, **m.con_intervalos(idx)})
    pd.DataFrame(filas).to_csv(SALIDA / "validacion-cruzada.csv", index=False)

    cols31 = [("Nivel", lambda f: f["variante"]), ("R²", lambda f: ic(f, "r2", 3)), ("Tramo exacto (%)", lambda f: coma(f["tramo_exacto"])),
              ("El real supera el mínimo del 90% (%)", lambda f: ic(f, "cobertura90")), ("Mediana del mínimo del 90%", lambda f: coma(f["mediana_min90"], 0)),
              ("Certifica «al menos 2.000» (% del total y precisión)", lambda f: f"{coma(f['cert2000_pct'])}% y {coma(f['cert2000_precision'])}%")]
    for s in sub:
        informe.append(f"### Validación cruzada por persona, {s} (n = {coma(sub[s].size, 0)})\n\n" + tabla_md([f for f in filas if f["subconjunto"] == s], cols31))

    dif_filas = []
    for a_, b_ in [(NIVEL_2, NIVEL_1), ("1 con el SRI de Proveedor_Info_1", "1 Proveedor_Info_1, sin SRI"), ("1 con el SRI, la clase y el CIIU", "1 con el SRI de Proveedor_Info_1"),
                   ("2 con el SRI de Proveedor_Info_1", "2 Proveedor_Info_1 y buró, sin SRI"), ("2 con el SRI, la clase y el CIIU", "2 con el SRI de Proveedor_Info_1")]:
        for s, idx in sub.items():
            m, lo, hi = c.diferencia_r2(M[a_], M[b_], idx)
            dif_filas.append({"a": a_, "b": b_, "subconjunto": s, "dif": m, "bajo": lo, "alto": hi})
    informe.append("### Diferencia de R² (intervalo del 95%)\n\n" + tabla_md(dif_filas, [("A", lambda f: f["a"]), ("menos B", lambda f: f["b"]), ("Casos", lambda f: f["subconjunto"]),
                                                                                        ("Diferencia", lambda f: f"{coma(f['dif'], 3)} ({coma(f['bajo'], 3)} a {coma(f['alto'], 3)})")]))

    # ============ 2) validación por fecha
    te, Qf = por_fecha(t, cat)
    Q1 = oof(t, cat, recalcular, c.VARIANTES_NIVEL_1)
    _, Qf1 = por_fecha(t, cat, c.VARIANTES_NIVEL_1)
    # El modelo guardado por `entrenar.py` tiene que dar lo mismo que el entrenado acá: si no, el guion y el modelo exportado se habrían separado.
    for nivel, Qn in ((1, Qf1[NIVEL_1_VIGENTE]), (2, Qf[NIVEL_2])):
        ruta = c.MODELOS / "validacion-hasta-2026-06" / f"nivel{nivel}"
        if ruta.exists():
            d = np.abs(c.ModeloGuardado(ruta).predecir(te) - Qn).max()
            print(f"  modelo guardado del nivel {nivel} contra el entrenado acá: diferencia máxima {d:.2e} en logaritmo")
            if d > 1e-9:
                distintas.append(("modelo guardado", f"nivel {nivel}", "predicción", float(d), 0.0))
    np.save(SALIDA / "fecha-nivel1-cuantiles.npy", Qf1[NIVEL_1_VIGENTE])
    np.save(SALIDA / "fecha-nivel2-cuantiles.npy", Qf[NIVEL_2])
    Mf = {n: c.Medidas(q, te.unver.values) for n, q in Qf.items()}
    subf = subconjuntos(te)
    filas_f = [{"variante": n, "subconjunto": s, **m.con_intervalos(idx)} for n, m in Mf.items() for s, idx in subf.items()]
    pd.DataFrame(filas_f).to_csv(SALIDA / "validacion-por-fecha.csv", index=False)
    for s in subf:
        informe.append(f"### Validación por fecha (entrenado hasta junio, probado de julio a octubre), {s} (n = {coma(subf[s].size, 0)})\n\n" + tabla_md([f for f in filas_f if f["subconjunto"] == s], cols31))
    dif_f = []
    for a_, b_ in [(NIVEL_1, "1 Proveedor_Info_1, sin SRI"), ("1 con el SRI, la clase y el CIIU", "1 Proveedor_Info_1, sin SRI"), ("2 con el SRI de Proveedor_Info_1", "2 Proveedor_Info_1 y buró, sin SRI"), ("2 con el SRI, la clase y el CIIU", "2 Proveedor_Info_1 y buró, sin SRI")]:
        for s, idx in subf.items():
            m, lo, hi = c.diferencia_r2(Mf[a_], Mf[b_], idx)
            dif_f.append({"a": a_, "b": b_, "subconjunto": s, "dif": m, "bajo": lo, "alto": hi})
    informe.append("### Diferencia de R² por fecha (intervalo del 95%)\n\n" + tabla_md(dif_f, [("A", lambda f: f["a"]), ("menos B", lambda f: f["b"]), ("Casos", lambda f: f["subconjunto"]),
                                                                                           ("Diferencia", lambda f: f"{coma(f['dif'], 3)} ({coma(f['bajo'], 3)} a {coma(f['alto'], 3)})")]))

    # ============ 2b) el nivel 1 contra el anterior y sin cada variable discutida (12.30)
    M1 = {n: c.Medidas(q, real) for n, q in Q1.items()}
    Mf1 = {n: c.Medidas(q, te.unver.values) for n, q in Qf1.items()}
    filas_1, dif_1 = [], []
    for etiqueta, MM, ss in (("validación cruzada", M1, sub), ("por fecha", Mf1, subf)):
        for n, m in MM.items():
            for s, idx in ss.items():
                filas_1.append({"validacion": etiqueta, "variante": n, "variables": len(c.VARIANTES_NIVEL_1[n]), "subconjunto": s, **m.con_intervalos(idx)})
        for n in MM:
            if n == NIVEL_1_VIGENTE:
                continue
            for s, idx in ss.items():
                m, lo, hi = c.diferencia_r2(MM[n], MM[NIVEL_1_VIGENTE], idx)
                dif_1.append({"validacion": etiqueta, "a": n, "subconjunto": s, "dif": m, "bajo": lo, "alto": hi})
    pd.DataFrame(filas_1).to_csv(SALIDA / "nivel1-variantes.csv", index=False)
    pd.DataFrame(dif_1).to_csv(SALIDA / "nivel1-diferencias.csv", index=False)
    cols_1 = [("Variables del nivel 1", lambda f: f["variante"]), ("Cantidad", lambda f: str(f["variables"])), ("R²", lambda f: ic(f, "r2", 3)),
              ("El real supera el mínimo del 90% (%)", lambda f: ic(f, "cobertura90")), ("El real supera el mínimo del 85% (%)", lambda f: ic(f, "cobertura85")),
              ("Mediana del mínimo del 90%", lambda f: coma(f["mediana_min90"], 0)), ("Tramo exacto (%)", lambda f: coma(f["tramo_exacto"])),
              ("Certifica «al menos 2.000» (% del total y precisión)", lambda f: f"{coma(f['cert2000_pct'])}% y {coma(f['cert2000_precision'])}%")]
    for etiqueta, ss in (("validación cruzada", sub), ("por fecha", subf)):
        for s in ss:
            informe.append(f"### Nivel 1 del 2026-10-29 contra el anterior, {etiqueta}, {s} (n = {coma(ss[s].size, 0)})\n\n"
                           + tabla_md([f for f in filas_1 if f["validacion"] == etiqueta and f["subconjunto"] == s], cols_1))
    informe.append(f"### Diferencia de R² con «{NIVEL_1_VIGENTE}» (intervalo del 95%)\n\n" + tabla_md(dif_1, [
        ("Validación", lambda f: f["validacion"]), ("Variante", lambda f: f["a"]), ("Casos", lambda f: f["subconjunto"]),
        ("Diferencia", lambda f: f"{coma(f['dif'], 3)} ({coma(f['bajo'], 3)} a {coma(f['alto'], 3)})")]))

    # ============ 3) cobertura por grupo y por respuesta (validación cruzada y por fecha)
    for etiqueta, tabla, MM, nom in (("validación cruzada", t, M | M1, "grupos-validacion-cruzada"), ("validación por fecha", te, Mf | Mf1, "grupos-por-fecha")):
        g, filas_g = grupos(tabla), []
        for nombre_g, mask in g.items():
            idx = np.where(mask)[0]
            if len(idx) < 100:
                continue
            f = {"grupo": nombre_g, "n": len(idx), "mediana_ingreso": float(np.median(tabla.unver.values[idx]))}
            for k, v in (("n1", NIVEL_1), ("n2", NIVEL_2), ("n1v", NIVEL_1_VIGENTE)):
                r = MM[v].con_intervalos(idx, B=500)
                f |= {f"{k}_cobertura90": r["cobertura90"], f"{k}_ic_bajo": r["cobertura90_ic_bajo"], f"{k}_ic_alto": r["cobertura90_ic_alto"],
                      f"{k}_cobertura85": r["cobertura85"], f"{k}_mediana_min90": r["mediana_min90"]}
            filas_g.append(f)
        pd.DataFrame(filas_g).to_csv(SALIDA / f"{nom}.csv", index=False)
        informe.append(f"### Cobertura del mínimo del 90% por grupo, {etiqueta}\n\n" + tabla_md(filas_g, [
            ("Grupo", lambda f: f["grupo"]), ("Casos", lambda f: coma(f["n"], 0)), ("Mediana del ingreso", lambda f: coma(f["mediana_ingreso"], 0)),
            ("Nivel 1 anterior: el real supera el mínimo del 90%", lambda f: f"{coma(f['n1_cobertura90'])} ({coma(f['n1_ic_bajo'])} a {coma(f['n1_ic_alto'])})"),
            ("Nivel 2", lambda f: f"{coma(f['n2_cobertura90'])} ({coma(f['n2_ic_bajo'])} a {coma(f['n2_ic_alto'])})"),
            ("Nivel 1 vigente", lambda f: f"{coma(f['n1v_cobertura90'])} ({coma(f['n1v_ic_bajo'])} a {coma(f['n1v_ic_alto'])})")]))
        if etiqueta == "validación cruzada" and (VIEJOS / "r4_11_cobertura_por_grupo.csv").exists() and "--sin-cotejo" not in sys.argv:
            v = pd.read_csv(VIEJOS / "r4_11_cobertura_por_grupo.csv").set_index("grupo")
            mapa = {"antigüedad de menos de 2 años": "antiguedad < 2 anos", "antigüedad de 2 a 5": "antiguedad 2 a 5", "antigüedad de 5 a 10": "antiguedad 5 a 10", "antigüedad de 10 o más": "antiguedad 10 o mas",
                    "solo cuentas o IVA, sin marca de predictor": "cuentas o IVA sin predictor", "respuesta: OK FACTURAR y condicionado": "OK FACTURAR y condicionado",
                    "respuesta: Rechazado": "RECHAZADO", "respuesta: sin respuesta": "sin respuesta"}
            viejo = {mapa.get(f["grupo"], f["grupo"]): v.loc[mapa.get(f["grupo"], f["grupo"])].to_dict() for f in filas_g if mapa.get(f["grupo"], f["grupo"]) in v.index}
            n_, d_ = cotejar(filas_g, viejo, None, lambda f: mapa.get(f["grupo"], f["grupo"]), "r4_11",
                             [("n1_cobertura90", "N1_cobertura90", .05), ("n1_cobertura85", "N1_cobertura85", .05), ("n1_mediana_min90", "N1_mediana_min90", 1),
                              ("n2_cobertura90", "N2_cobertura90", .05), ("n2_cobertura85", "N2_cobertura85", .05), ("n2_mediana_min90", "N2_mediana_min90", 1)])
            comparadas += n_
            distintas += d_

    # ============ 4) cotejo de las tablas contra los guiones viejos
    if "--sin-cotejo" not in sys.argv:
        tol = [("r2", "r2_log", .0015), ("tramo_exacto", "tramo_exacto", .05), ("dentro_10", "dentro_10", .05), ("cobertura90", "min90_real_lo_supera", .05),
               ("mediana_min90", "mediana_min90", 1), ("cert2000_pct", "cert2000_pct", .05)]
        for archivo, filas_n, etiqueta in (("r4_7_sri_proveedor_info_1.csv", filas, "r4_7 (validación cruzada)"), ("r4_8_sri_por_fecha.csv", filas_f, "r4_8 (por fecha)")):
            if not (VIEJOS / archivo).exists():
                print(f"  sin {archivo}: no se coteja")
                continue
            v = pd.read_csv(VIEJOS / archivo)
            viejo = {(r.modelo, r.subconjunto): r._asdict() for r in v.itertuples(index=False)}
            for f in filas_n:
                f["_clave"] = (NOMBRE_VIEJO[f["variante"]], "todas" if f["subconjunto"] == "todas" else "OK FACTURAR")
            n_, d_ = cotejar(filas_n, viejo, None, lambda f: f["_clave"], etiqueta, tol + [("cert2000_precision", "cert2000_prec" if "fecha" in etiqueta else "cert2000_precision", .05)])
            comparadas += n_
            distintas += d_
        informe.append(f"### Cotejo con los guiones viejos\n\nNúmeros comparados: {comparadas}. Distintos: {len(distintas)}." + ("" if not distintas else "\n\n" + tabla_md(
            [dict(zip(("guion", "fila", "medida", "nuevo", "viejo"), d)) for d in distintas[:60]], [(k, (lambda k: lambda f: str(f[k]))(k)) for k in ("guion", "fila", "medida", "nuevo", "viejo")])))
        print(f"cotejo con los guiones viejos: {comparadas} números comparados, {len(distintas)} distintos")
        for d in distintas[:30]:
            print("   ", d)

    (SALIDA / "medir.md").write_text("\n\n".join(informe) + "\n", encoding="utf-8")
    c.escribir_json(SALIDA / "medir.json", {"versiones": c.versiones(), "huella_tabla": c.huella(c.TABLA), "n": len(t), "comparados": comparadas, "distintos": len(distintas)})
    print(f"listo en {time.time() - t0:.0f} s -> {SALIDA / 'medir.md'}")


if __name__ == "__main__":
    main()
