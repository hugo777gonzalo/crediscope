# Lo que comparten los guiones del predictor de ingresos: rutas, variables de cada nivel, parámetros del modelo y las medidas.
# Un solo lugar para las definiciones, porque los guiones viejos (C:\datos\ingresos\scripts) las repetían con `exec` de un guion dentro de otro
# y un cambio en uno no llegaba a los demás. Sin datos ni identificaciones: todo lo que se lee y se escribe vive fuera del repositorio.
import hashlib
import json
import os
import re
import subprocess
import sys
from importlib import metadata
from pathlib import Path

import numpy as np
import pandas as pd

# ---------------------------------------------------------------- rutas
# Las entradas (research/ingresos-aws/) son de la carpeta principal del repositorio: un worktree no las tiene (scripts/CLAUDE.md).
def _carpeta_principal():
    r = subprocess.run(["git", "rev-parse", "--git-common-dir"], capture_output=True, text=True, cwd=Path(__file__).parent)
    if r.returncode == 0:
        return Path(r.stdout.strip()).resolve().parent
    return Path(__file__).resolve().parents[2]


ENTRADAS = Path(os.environ.get("PREDICTOR_ENTRADAS", _carpeta_principal() / "research" / "ingresos-aws"))
RAIZ_DATOS = Path(os.environ.get("PREDICTOR_DATOS", "C:/datos/ingresos"))
RESULTADOS = Path(os.environ.get("PREDICTOR_RESULTADOS", RAIZ_DATOS / "resultados" / "predictor-ingresos"))
MODELOS = Path(os.environ.get("PREDICTOR_MODELOS", RAIZ_DATOS / "modelos"))
TABLA = RESULTADOS / "personas.parquet"

# ---------------------------------------------------------------- variables
# Los nombres son los de la especificación (4.1 y 4.2); lo que no está en estas listas no entra a ningún modelo.
PERSONA = ["edad", "genero", "estado_civil"]
ZONA = ["prov_trab", "cant_trab", "prov_dom", "cant_dom"]
IESS = ["aporte", "meses_aporte", "n_empleos"]
BASE = PERSONA + ZONA + IESS + ["anio_mes"]
# El SRI que Novadata puede dar (datosContribuyente) y lo que solo trae Equifax: no se trae el CIIU ni la clase (4.1).
SRI_NOVADATA = ["sri_ruc", "sri_estado", "sri_obligado", "sri_antig", "sri_susp"]
SRI_EQUIFAX = ["sri_clase", "sri_ciiu_secc", "sri_ciiu_div"]
BURO = ["cred_mayor", "cred_12m", "cred_24m", "deuda_total", "n_inst", "n_creditos", "valor_creditos", "saldos_vig", "deuda_actual", "deuda_3m", "max_mora", "saldo", "n_oper"]
CUOTA = ["cuota_fin", "h12", "h6", "hact", "g6", "g12", "c_consumo", "c_tarjeta", "c_micro", "c_vivienda", "c_comercial", "c_educativo",
         "s_consumo", "s_tarjeta", "s_micro", "s_vivienda", "n_consumo", "n_tarjeta", "n_micro", "n_vivienda", "c_codeudor", "max_dias_t"]
CATEGORICAS = ["genero", "estado_civil", "prov_trab", "cant_trab", "prov_dom", "cant_dom", "sri_estado", "sri_clase", "sri_ciiu_secc", "sri_ciiu_div"]

# El nivel 1 es la edad, el sexo y el SRI de Novadata (decisión del negocio del 2026-10-29). Reconsultados 542 independientes de AWS (12.29), la edad
# y el sexo de Novadata coinciden con los del extracto en el 99,6%; el estado civil (92,4%), el domicilio (Novadata lo trae en el 37%), el lugar de
# trabajo (no lo trae) y el IESS (los meses con aporte no coinciden en ninguno de 99) no son el dato con que el modelo aprendió. `anio_mes` no sale de
# una fuente sino del reloj del servidor, y se queda: es lo que hace que el modelo no extrapole más allá del último mes entrenado (especificación, 7).
NIVEL_1_PERSONA = ["edad", "genero"]
NIVEL_1_CANDIDATO = NIVEL_1_PERSONA + ["anio_mes"] + SRI_NOVADATA
# El nivel 1 hasta el 2026-10-28, con el estado civil, la zona y el IESS del extracto de AWS: se mide para comparar (12.30) y reproduce 12.24 a 12.26.
NIVEL_1_ANTERIOR = BASE + SRI_NOVADATA

NIVELES = {
    1: NIVEL_1_CANDIDATO,
    2: BASE + BURO + CUOTA + SRI_NOVADATA + SRI_EQUIFAX,
}
# El nivel 1 contra el anterior, y lo que pesa cada variable que se discutió al decidirlo (12.30).
VARIANTES_NIVEL_1 = {
    "anterior: con estado civil, zona e IESS de AWS": NIVEL_1_ANTERIOR,
    "edad, sexo, fecha y SRI de Novadata": NIVEL_1_CANDIDATO,
    "sin el obligado a llevar contabilidad": [x for x in NIVEL_1_CANDIDATO if x != "sri_obligado"],
    "sin la fecha de la consulta": [x for x in NIVEL_1_CANDIDATO if x != "anio_mes"],
}
# Para reproducir las filas de 12.24 (con y sin SRI) sobre el mismo subconjunto: el nivel 1 de entonces.
VARIANTES_SRI = {
    "1 Novadata, sin SRI": BASE,
    "1 con el SRI de Novadata": NIVEL_1_ANTERIOR,
    "1 con el SRI, la clase y el CIIU": NIVEL_1_ANTERIOR + SRI_EQUIFAX,
    "2 Novadata y buró, sin SRI": BASE + BURO + CUOTA,
    "2 con el SRI de Novadata": BASE + BURO + CUOTA + SRI_NOVADATA,
    "2 con el SRI, la clase y el CIIU": NIVELES[2],
}

# Lo que nunca entra: el patrimonio y los gastos declarados se pidieron fuera de la entrada inicial (decisión del negocio, 2026-10-21),
# `incumplimiento_*` es la conducta con la propia institución (CrediScope no la tiene), el predictor de Equifax es solo contraste y la
# respuesta comercial solo sirve para medir. Se verifica al armar cada matriz, para que una variable nueva no entre sin que alguien lo note.
PROHIBIDAS = re.compile(r"^(activo_|egreso_|pasivo_|incumplimiento_|pred$|ind_ingreso|resp$|med_|tot|unver|ver_|income)")


def verificar_entradas(columnas):
    malas = [c for c in columnas if PROHIBIDAS.match(c)]
    if malas:
        raise ValueError(f"Variables que no pueden ser entrada del predictor: {malas}")


for _n, _c in {**{f"nivel {k}": v for k, v in NIVELES.items()}, **VARIANTES_SRI, **VARIANTES_NIVEL_1}.items():
    verificar_entradas(_c)

# ---------------------------------------------------------------- modelo
LEV = [0.05, 0.10, 0.15, 0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90, 0.95]
UMB = [470, 940, 2000, 3000, 5000]  # tramos de las medidas de la especificación (salario básico de 2025); al responder siguen al del año
N_ARBOLES = 170
# Mismos parámetros que r2_5_modelo.py. Las semillas son las que LightGBM usa por omisión (bagging_seed=3, feature_fraction_seed=2,
# data_random_seed=1): fijarlas explícitas deja la corrida reproducible sin cambiar los números frente a los guiones viejos, que no las fijaban.
PAR = dict(learning_rate=0.07, num_leaves=15, min_child_samples=50, subsample=0.8, subsample_freq=1, colsample_bytree=0.8,
           min_data_per_group=30, cat_smooth=20, verbose=-1, n_jobs=16,
           bagging_seed=3, feature_fraction_seed=2, data_random_seed=1)
SEMILLA_PARTICION = 11  # KFold de 5 por persona, igual que los guiones viejos
CORTE_FECHA = pd.Timestamp("2026-07-01")  # se entrena hasta junio y se mide de julio a octubre: el SRI solo existe desde diciembre de 2025
OK_FACTURAR = ["OK FACTURAR", "OK FACTURAR CONDICIONADO"]


def huella(ruta):
    h = hashlib.sha256()
    with open(ruta, "rb") as f:
        for bloque in iter(lambda: f.read(1 << 22), b""):
            h.update(bloque)
    return h.hexdigest()


def versiones():
    return {p: metadata.version(p) for p in ["lightgbm", "scikit-learn", "numpy", "pandas", "scipy", "pyarrow", "duckdb"]} | {"python": sys.version.split()[0]}


def escribir_json(ruta, obj):
    Path(ruta).parent.mkdir(parents=True, exist_ok=True)
    Path(ruta).write_text(json.dumps(obj, indent=2, ensure_ascii=False, default=str), encoding="utf-8")


def cargar_tabla():
    """La tabla por persona de `preparar`, solo con quienes traen el bloque del SRI: los modelos son de 2026 (4.1)."""
    t = pd.read_parquet(TABLA)
    t = t[t.sri_bloque].reset_index(drop=True)
    t["y"] = np.log(t.unver)
    t["anio_mes"] = t.t.dt.year + (t.t.dt.month - 1) / 12
    return t


def categorias_de(df, columnas=CATEGORICAS):
    """Las categorías se fijan con lo que ve el entrenamiento y viajan con el modelo: una que no vio queda como dato faltante."""
    return {c: sorted(df[c].dropna().astype(str).unique().tolist()) for c in columnas if c in df.columns}


def matriz(df, columnas, categorias):
    verificar_entradas(columnas)
    X = pd.DataFrame(index=df.index)
    for c in columnas:
        if c in categorias:
            X[c] = pd.Categorical(df[c].astype("object").where(df[c].notna(), None).map(lambda v: None if v is None else str(v)), categories=categorias[c])
        else:
            X[c] = pd.to_numeric(df[c], errors="coerce").astype("float64")
    return X


def ajustar(X, y, q):
    import lightgbm as lgb
    return lgb.LGBMRegressor(objective="quantile", alpha=q, n_estimators=N_ARBOLES, **PAR).fit(
        X, y, categorical_feature=[c for c in X.columns if c in CATEGORICAS])


def entrenar_cuantiles(X, y):
    """Doce modelos, uno por cuantil, sobre el logaritmo del ingreso no verificado."""
    return [ajustar(X, y, q) for q in LEV]


def predecir(modelos, X):
    """Doce cuantiles en logaritmo, ordenados para que no se crucen (especificación, sección 5)."""
    q = np.column_stack([m.predict(X) for m in modelos])
    q.sort(axis=1)
    return q


# ---------------------------------------------------------------- de los cuantiles a la respuesta
def cdf(Q, t):
    """Función de distribución interpolada entre los cuantiles, en `t` dólares (misma regla que r2_5_modelo.py)."""
    L = np.array(LEV)
    lt = np.log(t)
    K = Q.shape[1]
    idx = (Q <= lt).sum(1)
    lo = np.clip(idx - 1, 0, K - 1)
    hi = np.clip(idx, 0, K - 1)
    ql = np.take_along_axis(Q, lo[:, None], 1)[:, 0]
    qh = np.take_along_axis(Q, hi[:, None], 1)[:, 0]
    fr = np.where(qh > ql, (lt - ql) / np.where(qh > ql, qh - ql, 1), 0.0)
    p = L[lo] + fr * (L[hi] - L[lo])
    return np.where(idx == 0, L[0] / 2, np.where(idx == K, (1 + L[-1]) / 2, p))


def probabilidades(Q):
    c = np.column_stack([cdf(Q, u) for u in UMB])
    P = np.diff(np.column_stack([np.zeros(len(Q)), c, np.ones(len(Q))]), axis=1)
    P = np.clip(P, 1e-4, None)
    return P / P.sum(1, keepdims=True)


def minimo(Q, nivel_de_seguridad=0.90):
    """Mínimo certificado en dólares: el cuantil que deja por encima al `nivel_de_seguridad` de los casos."""
    return np.exp(Q[:, LEV.index(round(1 - nivel_de_seguridad, 2))])


# ---------------------------------------------------------------- medidas
class Medidas:
    """Las medidas de la sección 3.1 de la especificación, calculadas una vez por fila para poder remuestrear sin repetir el modelo."""

    def __init__(self, Q, real, minimo90=None, minimo85=None):
        self.Q = Q
        self.real = np.asarray(real, float)
        self.y = np.log(self.real)
        self.q10 = np.exp(Q[:, LEV.index(0.10)]) if minimo90 is None else minimo90
        self.q15 = np.exp(Q[:, LEV.index(0.15)]) if minimo85 is None else minimo85
        med = np.exp(Q[:, LEV.index(0.50)])
        self.err2 = (self.y - np.log(med)) ** 2
        self.acierto_tramo = (probabilidades(Q).argmax(1) == np.digitize(self.real, UMB))
        self.dentro10 = np.abs(med - self.real) / self.real <= 0.10

    def calcular(self, ii):
        y = self.y[ii]
        tt = self.real[ii]
        q10 = self.q10[ii]
        q15 = self.q15[ii]
        r = {
            "n": len(ii),
            "r2": 1 - self.err2[ii].sum() / ((y - y.mean()) ** 2).sum(),
            "tramo_exacto": 100 * self.acierto_tramo[ii].mean(),
            "dentro_10": 100 * self.dentro10[ii].mean(),
            "cobertura90": 100 * (tt >= q10).mean(),
            "cobertura85": 100 * (tt >= q15).mean(),
            "mediana_min90": float(np.median(q10)),
            "mediana_min85": float(np.median(q15)),
            "min90_sobre_real": float(np.median(q10 / tt)),
        }
        for u in (940, 2000, 3000):
            c = q10 >= u
            r[f"cert{u}_pct"] = 100 * c.mean()
            r[f"cert{u}_precision"] = 100 * (tt[c] >= u).mean() if c.any() else np.nan
        return r

    def con_intervalos(self, idx, B=1000, semilla=5):
        """Cada medida con su intervalo del 95% por remuestreo de personas (B veces)."""
        idx = np.asarray(idx)
        punto = self.calcular(idx)
        rng = np.random.default_rng(semilla)
        rem = pd.DataFrame([self.calcular(rng.choice(idx, len(idx))) for _ in range(B)])
        out = {}
        for k, v in punto.items():
            out[k] = v
            if k != "n":
                # Una precisión sin ningún caso certificado es NaN en todos los remuestreos: se deja vacía, sin aviso.
                lleno = rem[k].notna().any()
                out[k + "_ic_bajo"] = float(np.nanpercentile(rem[k], 2.5)) if lleno else np.nan
                out[k + "_ic_alto"] = float(np.nanpercentile(rem[k], 97.5)) if lleno else np.nan
        return out


def diferencia_r2(m_a, m_b, idx, B=1000, semilla=5):
    """R² de A menos el de B sobre las mismas personas remuestreadas, con intervalo del 95%."""
    idx = np.asarray(idx)
    rng = np.random.default_rng(semilla)
    d = []
    for _ in range(B):
        ii = rng.choice(idx, len(idx))
        d.append(m_a.calcular(ii)["r2"] - m_b.calcular(ii)["r2"])
    return float(np.mean(d)), float(np.percentile(d, 2.5)), float(np.percentile(d, 97.5))


def particiones(n):
    from sklearn.model_selection import KFold
    return list(KFold(5, shuffle=True, random_state=SEMILLA_PARTICION).split(np.arange(n)))


def validacion_cruzada(t, columnas, categorias):
    """Cuantiles fuera de muestra por validación cruzada por persona. Las categorías son las de toda la tabla, como en los guiones viejos."""
    X = matriz(t, columnas, categorias)
    Q = np.zeros((len(t), len(LEV)))
    for tr, te in particiones(len(t)):
        Q[te] = predecir(entrenar_cuantiles(X.iloc[tr], t.y.iloc[tr]), X.iloc[te])
    return Q


def redondear(r, d=1):
    return {k: (round(v, d) if isinstance(v, float) else v) for k, v in r.items()}


# ---------------------------------------------------------------- modelos en disco
def guardar_modelo(carpeta, modelos, columnas, categorias, manifiesto):
    """Los doce modelos de LightGBM en su formato de texto, más un manifiesto con lo que hace falta para volver a armar la entrada."""
    carpeta = Path(carpeta)
    carpeta.mkdir(parents=True, exist_ok=True)
    for q, m in zip(LEV, modelos):
        m.booster_.save_model(str(carpeta / f"cuantil-{int(round(q * 100)):02d}.txt"))
    escribir_json(carpeta / "manifiesto.json", manifiesto | {"cuantiles": LEV, "columnas": columnas, "categorias": categorias, "versiones": versiones()})


class ModeloGuardado:
    """Lee lo que dejó `guardar_modelo` y predice los doce cuantiles en logaritmo, ordenados."""

    def __init__(self, carpeta):
        import lightgbm as lgb
        self.carpeta = Path(carpeta)
        self.manifiesto = json.loads((self.carpeta / "manifiesto.json").read_text(encoding="utf-8"))
        self.columnas = self.manifiesto["columnas"]
        self.categorias = self.manifiesto["categorias"]
        self.boosters = [lgb.Booster(model_file=str(self.carpeta / f"cuantil-{int(round(q * 100)):02d}.txt")) for q in LEV]

    def predecir(self, df):
        X = matriz(df, self.columnas, self.categorias)
        q = np.column_stack([b.predict(X) for b in self.boosters])
        q.sort(axis=1)
        return q


def miles(n):
    """Un entero con punto de miles, como se escribe en la pantalla (2.812)."""
    return f"{int(n):,}".replace(",", ".")
