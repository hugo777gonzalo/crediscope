# Robustez del nivel 1 frente a las variables de la persona que CrediScope arma con otra fuente que el entrenamiento.
# En AWS la edad, el sexo, el estado civil, la provincia y el cantón salen de la solicitud; en CrediScope, de Novadata. La paridad entre las dos fuentes no se midió
# (hacerlo exige cruzar identificaciones entre bases, y eso no se hace). Lo que sí se puede medir sin cruzar nada es cuánto pesa cada variable y qué pasa si
# al servir llegan distintas o faltan:
#   1) el nivel 1 (y el 2) sin la zona, sin el estado civil, etc., por validación cruzada y por fecha;
#   2) el modelo completo servido con una variable alterada: dato faltante, o cambiada por la de otra persona en una fracción de los casos.
#
#   python -I scripts/predictor-ingresos/robustez.py
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
from medir import coma, tabla_md

SALIDA = c.RESULTADOS / "robustez"


def sin(cols, *quitar):
    q = set(sum(([x] if isinstance(x, str) else list(x) for x in quitar), []))
    return [x for x in cols if x not in q]


# Lo que reproduce 12.26 es el nivel 1 de entonces: el vigente (2026-10-29) ya no tiene zona, estado civil ni IESS que quitar (12.30).
N1 = c.NIVEL_1_ANTERIOR
N2 = c.NIVELES[2]
SRI1 = c.SRI_NOVADATA
VARIANTES = {
    1: {
        "completo (con zona)": N1,
        "sin zona de trabajo": sin(N1, "prov_trab", "cant_trab"),
        "sin zona de domicilio": sin(N1, "prov_dom", "cant_dom"),
        "sin cantón (con provincia)": sin(N1, "cant_trab", "cant_dom"),
        "sin provincia ni cantón": sin(N1, c.ZONA),
        "sin zona ni estado civil (edad y sexo)": sin(N1, c.ZONA, "estado_civil"),
        "sin zona, estado civil ni sexo (solo la edad)": sin(N1, c.ZONA, "estado_civil", "genero"),
        "sin zona ni datos de la persona (solo IESS y SRI)": sin(N1, c.ZONA, c.PERSONA),
        "sin zona ni SRI (persona e IESS)": sin(N1, c.ZONA, SRI1),
    },
    2: {
        "completo (con zona)": N2,
        "sin provincia ni cantón": sin(N2, c.ZONA),
        "sin zona ni datos de la persona": sin(N2, c.ZONA, c.PERSONA),
    },
}


def main():
    t0 = time.time()
    t = c.cargar_tabla()
    cat = c.categorias_de(t)
    real = t.unver.values
    antes, te = t[t.t < c.CORTE_FECHA], t[t.t >= c.CORTE_FECHA].reset_index(drop=True)
    cat_tr = c.categorias_de(antes)
    SALIDA.mkdir(parents=True, exist_ok=True)
    informe, filas = [], []
    for nivel, variantes in VARIANTES.items():
        cv = {n: c.Medidas(c.validacion_cruzada(t, cols, cat), real) for n, cols in variantes.items()}
        fe = {n: c.Medidas(c.predecir(c.entrenar_cuantiles(c.matriz(antes, cols, cat_tr), antes.y), c.matriz(te, cols, cat_tr)), te.unver.values) for n, cols in variantes.items()}
        base = next(iter(variantes))
        idx, idxf = np.arange(len(t)), np.arange(len(te))
        ok, okf = np.where(t.med_resp.isin(c.OK_FACTURAR))[0], np.where(te.med_resp.isin(c.OK_FACTURAR))[0]
        fl = []
        for n in variantes:
            a, b = cv[n].con_intervalos(idx, B=500), fe[n].con_intervalos(idxf, B=500)
            f = {"nivel": nivel, "variante": n, "variables": len(variantes[n])}
            f |= {"cv_r2": a["r2"], "cv_cobertura90": a["cobertura90"], "cv_mediana_min90": a["mediana_min90"], "cv_cert2000": a["cert2000_pct"],
                  "cv_r2_ok": cv[n].con_intervalos(ok, B=200)["r2"],
                  "fecha_r2": b["r2"], "fecha_cobertura90": b["cobertura90"], "fecha_mediana_min90": b["mediana_min90"], "fecha_cert2000": b["cert2000_pct"]}
            if n != base:
                f["cv_dif_r2"], f["cv_dif_r2_bajo"], f["cv_dif_r2_alto"] = c.diferencia_r2(cv[n], cv[base], idx, B=500)
                f["fecha_dif_r2"], f["fecha_dif_r2_bajo"], f["fecha_dif_r2_alto"] = c.diferencia_r2(fe[n], fe[base], idxf, B=500)
            fl.append(f)
        filas += fl
        d = lambda f, k: "—" if k + "_bajo" not in f else f"{coma(f[k], 3)} ({coma(f[k + '_bajo'], 3)} a {coma(f[k + '_alto'], 3)})"
        informe.append(f"### Nivel {nivel}: qué pasa al quitar variables de la persona o de la zona\n\n" + tabla_md(fl, [
            ("Variables del modelo", lambda f: f["variante"]), ("Cantidad", lambda f: str(f["variables"])),
            ("R² (validación cruzada)", lambda f: coma(f["cv_r2"], 3)), ("Diferencia con el completo", lambda f: d(f, "cv_dif_r2")),
            ("R² por fecha", lambda f: coma(f["fecha_r2"], 3)), ("Diferencia con el completo", lambda f: d(f, "fecha_dif_r2")),
            ("Cobertura del 90%: cruzada / por fecha", lambda f: f"{coma(f['cv_cobertura90'])} / {coma(f['fecha_cobertura90'])}"),
            ("Mediana del mínimo del 90%: cruzada / por fecha", lambda f: f"{coma(f['cv_mediana_min90'], 0)} / {coma(f['fecha_mediana_min90'], 0)}"),
            ("Certifica 2.000 (%): cruzada / por fecha", lambda f: f"{coma(f['cv_cert2000'])} / {coma(f['fecha_cert2000'])}")]))
        print(f"nivel {nivel} listo, {time.time() - t0:.0f} s", flush=True)

    # ---- 2) el modelo completo servido con datos alterados
    rng = np.random.default_rng(3)
    sens = []
    for nivel in (1, 2):
        cols = N1 if nivel == 1 else N2
        modelos = c.entrenar_cuantiles(c.matriz(antes, cols, cat_tr), antes.y)
        rt = te.unver.values
        for variable, grupo in (("la zona (provincia y cantón de trabajo y de domicilio)", c.ZONA), ("la edad", ["edad"]), ("el sexo", ["genero"]), ("el estado civil", ["estado_civil"]), ("el SRI de Novadata", c.SRI_NOVADATA)):
            for modo, p in (("no llega", 1.0), ("otro valor en el 10% de los casos", 0.10), ("otro valor en el 30%", 0.30), ("otro valor en todos", 1.0)):
                x = te.copy()
                cols_g = [g for g in grupo if g in cols]
                if modo == "no llega":
                    for g in cols_g:
                        x[g] = np.nan
                else:
                    cambia = rng.random(len(x)) < p
                    otra = rng.permutation(len(x))  # el dato de otra persona de la prueba: conserva la distribución real y rompe la relación con esta persona
                    if variable == "la edad":
                        x.loc[cambia, "edad"] = x.edad.values[otra][cambia]
                    else:
                        # las columnas de un grupo se cambian juntas: una zona no mezcla la provincia de una persona con el cantón de otra
                        for g in cols_g:
                            x.loc[cambia, g] = x[g].values[otra][cambia]
                Q = c.predecir(modelos, c.matriz(x, cols, cat_tr))
                r = c.Medidas(Q, rt).calcular(np.arange(len(rt)))
                sens.append({"nivel": nivel, "variable": variable, "alteracion": modo, "r2": r["r2"], "cobertura90": r["cobertura90"], "mediana_min90": r["mediana_min90"], "cert2000_pct": r["cert2000_pct"], "cert2000_precision": r["cert2000_precision"]})
        r0 = c.Medidas(c.predecir(modelos, c.matriz(te, cols, cat_tr)), rt).calcular(np.arange(len(rt)))
        sens.append({"nivel": nivel, "variable": "ninguna (como entrenado)", "alteracion": "sin alterar", "r2": r0["r2"], "cobertura90": r0["cobertura90"], "mediana_min90": r0["mediana_min90"], "cert2000_pct": r0["cert2000_pct"], "cert2000_precision": r0["cert2000_precision"]})
    for nivel in (1, 2):
        informe.append(f"### Nivel {nivel}: el modelo completo servido con una variable alterada (entrenado hasta junio, probado de julio a octubre)\n\n" + tabla_md(
            [f for f in sens if f["nivel"] == nivel], [("Variable", lambda f: f["variable"]), ("Alteración al servir", lambda f: f["alteracion"]), ("R²", lambda f: coma(f["r2"], 3)),
                                                      ("El real supera el mínimo del 90% (%)", lambda f: coma(f["cobertura90"])), ("Mediana del mínimo", lambda f: coma(f["mediana_min90"], 0)),
                                                      ("Certifica 2.000: % y precisión", lambda f: f"{coma(f['cert2000_pct'])}% y {coma(f['cert2000_precision'])}%")]))
    pd.DataFrame(filas).to_csv(SALIDA / "variantes.csv", index=False)
    pd.DataFrame(sens).to_csv(SALIDA / "alteraciones.csv", index=False)
    (SALIDA / "robustez.md").write_text("\n\n".join(informe) + "\n", encoding="utf-8")
    print("\n\n".join(informe))
    print(f"\nlisto en {time.time() - t0:.0f} s -> {SALIDA / 'robustez.md'}")


if __name__ == "__main__":
    main()
