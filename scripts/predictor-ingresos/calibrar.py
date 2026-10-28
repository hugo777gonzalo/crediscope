# Calibración conforme de cuantiles (Romano, Patterson y Candès, 2019; especificación, sección 5) y cuánto lleva la cobertura hacia el 90%.
# Hacia adelante (entrenado hasta junio, probado de julio a octubre) el mínimo del 90% cubre el 88,1% en el nivel 1 y el 87,5% en el 2 (12.24):
# acá se mide si la calibración con casos recientes con ingreso conocido lo lleva a 90% más o menos un punto, y cuánto baja el mínimo mediano.
#
# El método. Con n casos de calibración (no usados para entrenar), el desvío de cada uno es «cuantil − ingreso real»; al mínimo se le resta el cuantil
# (1 − α)(1 + 1/n) de esos desvíos y queda un mínimo que cubre al menos 1 − α si calibración y prueba son intercambiables. Se mide en dos escalas:
#   dólares  la regla tal como está escrita en la especificación;
#   logaritmo  el mismo desvío sobre el logaritmo, que mueve el mínimo en proporción (un mínimo de 400 y uno de 4.000 no deberían bajar los mismos dólares).
# Y con tres maneras de juntar los casos de calibración, porque la intercambiabilidad es lo que se juega:
#   aleatoria  el 20% de lo anterior a julio, al azar (la deriva en el tiempo no está en la calibración);
#   reciente  los dos últimos meses anteriores a julio (mayo y junio): lo que haría una institución con sus casos más nuevos;
#   referencia  sin calibrar y con todo el entrenamiento.
#
#   python -I scripts/predictor-ingresos/calibrar.py
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
from medir import coma, tabla_md

SALIDA = c.RESULTADOS / "calibrar"
SBU_MEDIO = 482 / 2  # un mínimo no baja de medio salario básico (especificación, 2.2); 482 es el de 2026


def corrimiento(Q_cal, real_cal, nivel_q, alfa, escala):
    """Lo que hay que restar al cuantil `nivel_q` para que cubra 1 − α. Positivo = bajar el mínimo; negativo = subirlo."""
    lo = Q_cal[:, c.LEV.index(nivel_q)]
    e = (lo - np.log(real_cal)) if escala == "logaritmo" else (np.exp(lo) - real_cal)
    n = len(e)
    k = min(int(np.ceil((n + 1) * (1 - alfa))), n)  # el cuantil (1 − α)(1 + 1/n), como índice entre los n desvíos ordenados
    return float(np.sort(e)[k - 1])


def aplicar(Q, nivel_q, corr, escala):
    lo = Q[:, c.LEV.index(nivel_q)]
    m = np.exp(lo - corr) if escala == "logaritmo" else np.exp(lo) - corr
    return np.maximum(m, SBU_MEDIO)


def fila(nombre, Q, real, m90, m85, mask_ok):
    M = c.Medidas(Q, real, minimo90=m90, minimo85=m85)
    todas = M.con_intervalos(np.arange(len(real)), B=500)
    ok = M.con_intervalos(np.where(mask_ok)[0], B=500)
    return {"protocolo": nombre, "cobertura90": todas["cobertura90"], "ic90_bajo": todas["cobertura90_ic_bajo"], "ic90_alto": todas["cobertura90_ic_alto"],
            "cobertura85": todas["cobertura85"], "ic85_bajo": todas["cobertura85_ic_bajo"], "ic85_alto": todas["cobertura85_ic_alto"],
            "cobertura90_ok": ok["cobertura90"], "cobertura85_ok": ok["cobertura85"],
            "mediana_min90": todas["mediana_min90"], "mediana_min85": todas["mediana_min85"], "mediana_min90_ok": ok["mediana_min90"],
            "cert2000_pct": todas["cert2000_pct"], "cert2000_precision": todas["cert2000_precision"], "cert2000_pct_ok": ok["cert2000_pct"], "cert2000_precision_ok": ok["cert2000_precision"],
            "r2": todas["r2"]}


def main():
    t0 = time.time()
    t = c.cargar_tabla()
    antes = t[t.t < c.CORTE_FECHA].reset_index(drop=True)
    te = t[t.t >= c.CORTE_FECHA].reset_index(drop=True)
    real = te.unver.values
    ok = te.med_resp.isin(c.OK_FACTURAR).values
    mes = antes.t.dt.to_period("M").value_counts().sort_index()
    print("consultas de antes de julio por mes:", {str(k): int(v) for k, v in mes.items()}, "| prueba:", len(te), flush=True)
    reciente = (antes.t >= pd.Timestamp("2026-05-01")).values
    azar = np.random.default_rng(c.SEMILLA_PARTICION).random(len(antes)) < 0.20
    protocolos = {
        "aleatoria": (~azar, azar),
        "reciente": (~reciente, reciente),
    }
    informe, filas_todas, sens = [], [], []
    SALIDA.mkdir(parents=True, exist_ok=True)
    for nivel in (1, 2):
        cols = c.NIVELES[nivel]
        # referencia: todo el entrenamiento, sin calibrar (los números de 12.24)
        cat = c.categorias_de(antes)
        Xte = c.matriz(te, cols, cat)
        ref = c.predecir(c.entrenar_cuantiles(c.matriz(antes, cols, cat), antes.y), Xte)
        filas = [fila("referencia: todo el entrenamiento, sin calibrar", ref, real, np.exp(ref[:, 1]), np.exp(ref[:, 2]), ok)]
        for nombre, (mask_tr, mask_cal) in protocolos.items():
            tr, cal = antes[mask_tr].reset_index(drop=True), antes[mask_cal].reset_index(drop=True)
            cat_tr = c.categorias_de(tr)
            modelos = c.entrenar_cuantiles(c.matriz(tr, cols, cat_tr), tr.y)
            Qte = c.predecir(modelos, c.matriz(te, cols, cat_tr))
            Qcal = c.predecir(modelos, c.matriz(cal, cols, cat_tr))
            sin_calibrar = fila(f"{nombre}: entrenado con {c.miles(len(tr))}, sin calibrar", Qte, real, np.exp(Qte[:, 1]), np.exp(Qte[:, 2]), ok)
            filas.append(sin_calibrar)
            for escala in ("dólares", "logaritmo"):
                c90, c85 = corrimiento(Qcal, cal.unver.values, 0.10, 0.10, escala), corrimiento(Qcal, cal.unver.values, 0.15, 0.15, escala)
                f = fila(f"{nombre}: calibrado con {c.miles(len(cal))} casos, en {escala}", Qte, real, aplicar(Qte, 0.10, c90, escala), aplicar(Qte, 0.15, c85, escala), ok)
                f["corrimiento90"], f["corrimiento85"] = c90, c85
                f["cambio_mediana"] = f["mediana_min90"] / sin_calibrar["mediana_min90"] - 1
                filas.append(f)
            # ¿Y con pocos casos? La especificación pide 500 por institución: cuánto varía la cobertura según cuáles 500 le toquen.
            if nombre == "reciente":
                rng = np.random.default_rng(7)
                for n_cal in (500, 1000, 2000):
                    cob = []
                    for _ in range(200):
                        ii = rng.choice(len(cal), min(n_cal, len(cal)), replace=False)
                        cc = corrimiento(Qcal[ii], cal.unver.values[ii], 0.10, 0.10, "logaritmo")
                        cob.append(100 * (real >= aplicar(Qte, 0.10, cc, "logaritmo")).mean())
                    sens.append({"nivel": nivel, "casos_de_calibracion": n_cal, "cobertura90_media": float(np.mean(cob)), "p5": float(np.percentile(cob, 5)), "p95": float(np.percentile(cob, 95))})
        # Lo que se haría en producción: el modelo con todo lo anterior a julio (no se aparta nada) y la corrección calculada con sus predicciones fuera de muestra
        # (validación cruzada de cinco particiones sobre esos mismos casos). Cada caso de calibración fue predicho por un modelo que no lo vio.
        Qfuera = c.validacion_cruzada(antes, cols, cat)
        for escala in ("dólares", "logaritmo"):
            c90, c85 = corrimiento(Qfuera, antes.unver.values, 0.10, 0.10, escala), corrimiento(Qfuera, antes.unver.values, 0.15, 0.15, escala)
            f = fila(f"cruzada: modelo completo, corrección con {c.miles(len(antes))} predicciones fuera de muestra, en {escala}", ref, real, aplicar(ref, 0.10, c90, escala), aplicar(ref, 0.15, c85, escala), ok)
            f["corrimiento90"], f["corrimiento85"] = c90, c85
            f["cambio_mediana"] = f["mediana_min90"] / filas[0]["mediana_min90"] - 1
            filas.append(f)
        for f in filas:
            f["nivel"] = nivel
        filas_todas += filas
        informe.append(f"### Nivel {nivel}: calibración conforme, entrenado hasta junio y probado de julio a octubre (n = {c.miles(len(te))}; {c.miles(ok.sum())} en OK FACTURAR y condicionado)\n\n" + tabla_md(filas, [
            ("Protocolo", lambda f: f["protocolo"]),
            ("Cobertura del mínimo del 90% (IC 95%)", lambda f: f"{coma(f['cobertura90'])} ({coma(f['ic90_bajo'])} a {coma(f['ic90_alto'])})"),
            ("Del 85%", lambda f: f"{coma(f['cobertura85'])} ({coma(f['ic85_bajo'])} a {coma(f['ic85_alto'])})"),
            ("OK FACTURAR: 90% / 85%", lambda f: f"{coma(f['cobertura90_ok'])} / {coma(f['cobertura85_ok'])}"),
            ("Mediana del mínimo del 90% (OK FACTURAR)", lambda f: f"{coma(f['mediana_min90'], 0)} ({coma(f['mediana_min90_ok'], 0)})"),
            ("Certifica 2.000: % y precisión", lambda f: f"{coma(f['cert2000_pct'])}% y {coma(f['cert2000_precision'])}%"),
            ("Cambio de la mediana del mínimo", lambda f: f"{coma(100 * f['cambio_mediana'])}%" if "cambio_mediana" in f else "—"),
            ("Corrimiento del 90%", lambda f: coma(f["corrimiento90"], 3) if "corrimiento90" in f else "—")]))
    informe.append("### Cobertura del mínimo del 90% según cuántos casos de calibración (calibración reciente, en logaritmo; 200 sorteos de casos)\n\n" + tabla_md(sens, [
        ("Nivel", lambda f: str(f["nivel"])), ("Casos de calibración", lambda f: coma(f["casos_de_calibracion"], 0)),
        ("Cobertura media (%)", lambda f: coma(f["cobertura90_media"])), ("Entre el 5% y el 95% de los sorteos", lambda f: f"{coma(f['p5'])} a {coma(f['p95'])}")]))
    pd.DataFrame(filas_todas).to_csv(SALIDA / "calibracion.csv", index=False)
    pd.DataFrame(sens).to_csv(SALIDA / "sensibilidad.csv", index=False)
    (SALIDA / "calibrar.md").write_text("\n\n".join(informe) + "\n", encoding="utf-8")
    print("\n\n".join(informe))
    print(f"\nlisto en {time.time() - t0:.0f} s -> {SALIDA / 'calibrar.md'}")


if __name__ == "__main__":
    main()
