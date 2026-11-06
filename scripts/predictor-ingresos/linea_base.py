# Fase 0 de la revisión del predictor de ingresos (2026-11-06): mide el nivel 1 vigente y el nivel 2 contra una línea base sin variables, con los datos
# locales y sin consultar a nadie. Hasta acá sólo se medía la cobertura del mínimo al 90%; faltaban la agudeza contra una línea base, las curvas de
# aprendizaje, la cobertura por grupo, el costo del sexo, qué etiquetas conviene usar, el efecto de las versiones del predictor de Equifax sobre la
# etiqueta, el efecto en la capacidad de pago y las colas de la distribución. Sus números fijan las metas de asertividad de las fases siguientes.
# No cambia nada en producción: no toca `predictor-ingresos.ts` ni `comun.py`, y lo que mide de la regla de las colas es una recomendación.
#
# Siempre hacia adelante, como `medir.py`: se entrena con las consultas anteriores a julio de 2026 y se mide de julio a octubre (8.656 casos).
#
#   1  línea base sin variables (cuantiles marginales) contra los dos niveles
#   2  curvas de aprendizaje (10, 25, 50, 75 y 100% de las personas)
#   3  cobertura y mínimo mediano por grupo, sin calibrar y con el corrimiento conforme de `calibrar.py`
#   4  el costo del sexo en el nivel 1
#   5  qué etiquetas usar para entrenar y para calibrar
#   6  las versiones del predictor de Equifax: la etiqueta por mes de consulta
#   7  la decisión de la capacidad de pago con el ingreso real contra la que daría cada estimación
#   8  las colas de la distribución: la regla de `cdf` contra dos alternativas
#
#   python -I scripts/predictor-ingresos/linea_base.py [--solo=1,2,...] [--recalcular] [--rapido]
#
# Sale a git sólo `metricas/linea-base-2026-11.json` (agregados). Lo intermedio queda en C:\datos\ingresos\resultados\predictor-ingresos\linea-base\.
import json
import math
import re
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
from calibrar import SBU_MEDIO, aplicar, corrimiento
from medir import coma, ic, tabla_md

SALIDA = c.RESULTADOS / "linea-base"
COPIAS = SALIDA / "copias"
METRICAS = Path(__file__).resolve().parent / "metricas" / "linea-base-2026-11.json"
RAIZ_REPO = Path(__file__).resolve().parents[2]
CAPACIDAD_TS = RAIZ_REPO / "supabase" / "functions" / "_shared" / "capacidad-de-pago.ts"
SIMULADOR_TS = RAIZ_REPO / "supabase" / "functions" / "_shared" / "simulador-credito.ts"
INICIO_ULTIMOS_3_MESES = pd.Timestamp("2026-04-01")  # los tres últimos meses del entrenamiento: abril, mayo y junio
MIN_CASOS = 300  # un grupo con menos casos se marca: su intervalo es ancho
RAPIDO = "--rapido" in sys.argv  # para probar el guion: pocos remuestreos
B = 50 if RAPIDO else 1000
B_GRUPO = 50 if RAPIDO else 500
I10, I15, I20, I30, I50 = (c.LEV.index(x) for x in (0.10, 0.15, 0.20, 0.30, 0.50))
NOMBRES_TRAMOS = ["menos de 470", "470 a 939", "940 a 1.999", "2.000 a 2.999", "3.000 a 4.999", "5.000 o más"]


# ---------------------------------------------------------------- utilidades
def limpiar(x):
    """Para el JSON: NaN y tipos de numpy a lo que json entiende (un NaN suelto no es JSON válido)."""
    if isinstance(x, dict):
        return {str(k): limpiar(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [limpiar(v) for v in x]
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.floating, float)):
        return None if not np.isfinite(x) else float(x)
    if isinstance(x, (np.bool_,)):
        return bool(x)
    return x


def pct(x, d=1):
    return f"{coma(x, d)}%"


class Datos:
    """La tabla por persona partida en entrenamiento (antes de julio) y prueba (julio a octubre), más lo que se usa en todas las secciones."""

    def __init__(self):
        self.t = c.cargar_tabla()
        self.antes = self.t[self.t.t < c.CORTE_FECHA].reset_index(drop=True)
        self.te = self.t[self.t.t >= c.CORTE_FECHA].reset_index(drop=True)
        self.cat_antes = c.categorias_de(self.antes)
        self.cat_t = c.categorias_de(self.t)
        self.real = self.te.unver.values
        self.todas = np.arange(len(self.te))
        self.ok = np.where(self.te.med_resp.isin(c.OK_FACTURAR))[0]
        self.subs = {"todas": self.todas, "OK FACTURAR y condicionado": self.ok}
        self.huella = c.huella(c.TABLA)
        self._adelante = {}


def con_copia(d, nombre, calcular):
    """Lo caro (una validación cruzada, un entrenamiento) se guarda en disco con la huella de la tabla; `--recalcular` lo rehace."""
    COPIAS.mkdir(parents=True, exist_ok=True)
    ruta = COPIAS / f"{nombre}-{d.huella[:10]}.npy"
    if ruta.exists() and "--recalcular" not in sys.argv:
        return np.load(ruta)
    r = calcular()
    np.save(ruta, r)
    return r


def clave(cols):
    import hashlib
    return hashlib.sha1("|".join(cols).encode()).hexdigest()[:10]


def cuantiles_adelante(d, cols, tr=None):
    """Entrena con `tr` (por omisión, todo lo anterior a julio) y predice los doce cuantiles de la prueba. Las categorías salen del entrenamiento."""
    tr = d.antes if tr is None else tr
    cat = c.categorias_de(tr)
    modelos = c.entrenar_cuantiles(c.matriz(tr, cols, cat), tr.y)
    return c.predecir(modelos, c.matriz(d.te, cols, cat))


def adelante(d, nivel):
    """Los cuantiles hacia adelante del nivel vigente. Se compara con los que dejó `medir.py` (deben ser idénticos: mismas semillas)."""
    if nivel not in d._adelante:
        d._adelante[nivel] = con_copia(d, f"adelante-nivel{nivel}-{clave(c.NIVELES[nivel])}", lambda: cuantiles_adelante(d, c.NIVELES[nivel]))
        ruta = c.RESULTADOS / "medir" / f"fecha-nivel{nivel}-cuantiles.npy"
        if ruta.exists():
            dif = float(np.abs(np.load(ruta) - d._adelante[nivel]).max())
            print(f"  nivel {nivel} hacia adelante contra el de medir.py: diferencia máxima {dif:.2e} en logaritmo", flush=True)
    return d._adelante[nivel]


def fuera_de_muestra(d, cols, tr=None, nombre=None):
    """Validación cruzada por persona sobre `tr` (por omisión, lo anterior a julio): las predicciones con que se calibra, como en `calibrar.py`."""
    tr = d.antes if tr is None else tr
    cat = c.categorias_de(tr)
    return con_copia(d, f"oof-{nombre or 'antes'}-{clave(cols)}-{len(tr)}", lambda: c.validacion_cruzada(tr, cols, cat))


class MedidasLB(c.Medidas):
    """`Medidas` con lo que esta fase agrega: la pérdida de cuantiles (promedio de los doce, en logaritmo) y acertar el tramo o uno vecino."""

    def __init__(self, Q, real, minimo90=None, minimo85=None):
        super().__init__(Q, real, minimo90, minimo85)
        L = np.array(c.LEV)
        e = self.y[:, None] - Q
        self.perdida = np.maximum(L * e, (L - 1) * e).mean(1)
        self.vecino = np.abs(c.probabilidades(Q).argmax(1) - np.digitize(self.real, c.UMB)) <= 1

    def calcular(self, ii):
        r = super().calcular(ii)
        r["perdida"] = float(self.perdida[ii].mean())
        r["tramo_o_vecino"] = 100 * self.vecino[ii].mean()
        return r


def mejora_relativa(m_a, m_b, idx, B=B, semilla=5):
    """Cuánto baja la pérdida de A frente a la de B, en %, con intervalo del 95% por remuestreo de personas (los mismos remuestreos para las dos)."""
    idx = np.asarray(idx)
    rng = np.random.default_rng(semilla)
    punto = 100 * (1 - m_a.perdida[idx].mean() / m_b.perdida[idx].mean())
    r = []
    for _ in range(B):
        ii = rng.choice(idx, len(idx))
        r.append(100 * (1 - m_a.perdida[ii].mean() / m_b.perdida[ii].mean()))
    return float(punto), float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))


def ic_proporcion(aciertos, idx, B=B_GRUPO, semilla=5):
    """Porcentaje de aciertos con su intervalo del 95% por remuestreo de personas, vectorizado."""
    a = np.asarray(aciertos, float)[idx]
    rng = np.random.default_rng(semilla)
    medias = a[rng.integers(0, len(a), size=(B, len(a)))].mean(1)
    return 100 * float(a.mean()), 100 * float(np.percentile(medias, 2.5)), 100 * float(np.percentile(medias, 97.5))


def ic_mediana(v, idx, B=B_GRUPO, semilla=5):
    v = np.asarray(v, float)[idx]
    rng = np.random.default_rng(semilla)
    med = np.median(v[rng.integers(0, len(v), size=(B, len(v)))], axis=1)
    return float(np.median(v)), float(np.percentile(med, 2.5)), float(np.percentile(med, 97.5))


# ================================================================ 1) línea base sin variables
def seccion_1(d):
    n = len(d.te)
    q_todo = np.quantile(d.antes.y.values, c.LEV)
    ultimos = d.antes[d.antes.t >= INICIO_ULTIMOS_3_MESES]
    q_3m = np.quantile(ultimos.y.values, c.LEV)
    base1, base2 = "Línea base: cuantiles de todo el entrenamiento", f"Línea base: cuantiles de abril a junio ({c.miles(len(ultimos))} personas)"
    M = {
        "Nivel 1 (vigente)": MedidasLB(adelante(d, 1), d.real),
        "Nivel 2": MedidasLB(adelante(d, 2), d.real),
        base1: MedidasLB(np.tile(q_todo, (n, 1)), d.real),
        base2: MedidasLB(np.tile(q_3m, (n, 1)), d.real),
    }
    filas = []
    for nombre, m in M.items():
        for s, idx in d.subs.items():
            filas.append({"sistema": nombre, "subconjunto": s, **m.con_intervalos(idx, B=B)})
    mejoras = []
    for nivel in ("Nivel 1 (vigente)", "Nivel 2"):
        for base in (base1, base2):
            for s, idx in d.subs.items():
                p, lo, hi = mejora_relativa(M[nivel], M[base], idx)
                mejoras.append({"sistema": nivel, "contra": base, "subconjunto": s, "mejora": p, "ic_bajo": lo, "ic_alto": hi})
    for s, idx in d.subs.items():
        p, lo, hi = mejora_relativa(M["Nivel 2"], M["Nivel 1 (vigente)"], idx)
        mejoras.append({"sistema": "Nivel 2", "contra": "Nivel 1 (vigente)", "subconjunto": s, "mejora": p, "ic_bajo": lo, "ic_alto": hi})
    cols = [("Sistema", lambda f: f["sistema"]), ("Pérdida de cuantiles (IC 95%)", lambda f: ic(f, "perdida", 3)), ("R²", lambda f: coma(f["r2"], 3)),
            ("El real supera el mínimo del 90% (%)", lambda f: ic(f, "cobertura90")), ("Del 85% (%)", lambda f: coma(f["cobertura85"])),
            ("Mediana del mínimo del 90%", lambda f: coma(f["mediana_min90"], 0)), ("Mediana de mínimo sobre real", lambda f: coma(f["min90_sobre_real"], 2)),
            ("Tramo exacto (%)", lambda f: coma(f["tramo_exacto"])), ("Tramo exacto o vecino (%)", lambda f: ic(f, "tramo_o_vecino"))]
    md = []
    for s, idx in d.subs.items():
        md.append(f"#### Hacia adelante, {s} (n = {c.miles(len(idx))})\n\n" + tabla_md([f for f in filas if f["subconjunto"] == s], cols))
    md.append("#### Mejora relativa de la pérdida de cuantiles (intervalo del 95%)\n\n" + tabla_md(mejoras, [
        ("Sistema", lambda f: f["sistema"]), ("Contra", lambda f: f["contra"]), ("Casos", lambda f: f["subconjunto"]),
        ("Mejora", lambda f: f"{coma(f['mejora'])}% ({coma(f['ic_bajo'])} a {coma(f['ic_alto'])})")]))
    base = {"todo el entrenamiento": [round(float(np.exp(x))) for x in q_todo], "abril a junio": [round(float(np.exp(x))) for x in q_3m]}
    md.append("Cuantiles de las líneas base en dólares (0,05 a 0,95): todo el entrenamiento " + ", ".join(coma(x, 0) for x in base["todo el entrenamiento"])
              + "; abril a junio " + ", ".join(coma(x, 0) for x in base["abril a junio"]) + ".")
    return {"filas": filas, "mejoras": mejoras, "cuantiles_linea_base_dolares": base}, "\n\n".join(md)


# ================================================================ 2) curvas de aprendizaje
FRACCIONES = [0.10, 0.25, 0.50, 0.75, 1.0]
SORTEOS = 3


def seccion_2(d):
    filas = []
    for nivel in (1, 2):
        cols = c.NIVELES[nivel]
        for f in FRACCIONES:
            # Con todas las personas el sorteo es el mismo cada vez: se hace una sola.
            for k in range(1 if f == 1.0 else SORTEOS):
                rng = np.random.default_rng([nivel, int(round(f * 100)), k])
                sel = np.sort(rng.choice(len(d.antes), int(round(f * len(d.antes))), replace=False))
                tr = d.antes.iloc[sel].reset_index(drop=True)
                Q = adelante(d, nivel) if f == 1.0 else cuantiles_adelante(d, cols, tr)
                m = MedidasLB(Q, d.real)
                for s, idx in d.subs.items():
                    r = m.calcular(idx)
                    filas.append({"nivel": nivel, "fraccion": f, "sorteo": k, "personas": len(tr), "subconjunto": s,
                                  "r2": r["r2"], "perdida": r["perdida"], "cobertura90": r["cobertura90"]})
        print(f"  curva del nivel {nivel} lista", flush=True)
    df = pd.DataFrame(filas)
    agr = df.groupby(["nivel", "subconjunto", "fraccion", "personas"]).agg(
        r2=("r2", "mean"), r2_min=("r2", "min"), r2_max=("r2", "max"), perdida=("perdida", "mean"), perdida_min=("perdida", "min"), perdida_max=("perdida", "max"),
        cobertura90=("cobertura90", "mean"), cobertura90_min=("cobertura90", "min"), cobertura90_max=("cobertura90", "max"), sorteos=("sorteo", "count")).reset_index()
    md = []
    for nivel in (1, 2):
        for s in d.subs:
            sub = agr[(agr.nivel == nivel) & (agr.subconjunto == s)].to_dict("records")
            md.append(f"#### Nivel {nivel}, {s}\n\n" + tabla_md(sub, [
                ("Fracción", lambda f: f"{coma(100 * f['fraccion'], 0)}%"), ("Personas", lambda f: coma(f["personas"], 0)), ("Sorteos", lambda f: str(int(f["sorteos"]))),
                ("R² (mínimo a máximo)", lambda f: f"{coma(f['r2'], 3)} ({coma(f['r2_min'], 3)} a {coma(f['r2_max'], 3)})"),
                ("Pérdida de cuantiles (mínimo a máximo)", lambda f: f"{coma(f['perdida'], 4)} ({coma(f['perdida_min'], 4)} a {coma(f['perdida_max'], 4)})"),
                ("El real supera el mínimo del 90% (%)", lambda f: f"{coma(f['cobertura90'])} ({coma(f['cobertura90_min'])} a {coma(f['cobertura90_max'])})")]))
    # Cuánto de la mejora total (del 10% al 100%) llega con cada duplicación: si la última casi no aporta, se estanca.
    resumen = []
    for nivel in (1, 2):
        for s in d.subs:
            sub = agr[(agr.nivel == nivel) & (agr.subconjunto == s)].set_index("fraccion")
            p = sub.perdida
            total = p[0.10] - p[1.0]
            resumen.append({"nivel": nivel, "subconjunto": s, "perdida_10": float(p[0.10]), "perdida_50": float(p[0.50]), "perdida_100": float(p[1.0]),
                            "mejora_total_10_a_100": float(100 * total / p[0.10]), "parte_25_a_50": float(100 * (p[0.25] - p[0.50]) / total),
                            "parte_50_a_100": float(100 * (p[0.50] - p[1.0]) / total), "parte_75_a_100": float(100 * (p[0.75] - p[1.0]) / total)})
    md.append("#### De dónde viene la mejora de la pérdida (del 10% al 100% de las personas = 100%)\n\n" + tabla_md(resumen, [
        ("Nivel", lambda f: str(f["nivel"])), ("Casos", lambda f: f["subconjunto"]), ("Pérdida con el 10% y con el 100%", lambda f: f"{coma(f['perdida_10'], 4)} y {coma(f['perdida_100'], 4)}"),
        ("Baja total", lambda f: pct(f["mejora_total_10_a_100"])), ("Del 25% al 50%", lambda f: pct(f["parte_25_a_50"], 0)), ("Del 50% al 100%", lambda f: pct(f["parte_50_a_100"], 0)),
        ("Del 75% al 100%", lambda f: pct(f["parte_75_a_100"], 0))]))
    return {"curvas": agr.to_dict("records"), "resumen": resumen}, "\n\n".join(md)


# ================================================================ 3) cobertura y mínimo por grupo
def grupos_prueba(te):
    def rango_edad(lo, hi):
        return ((te.edad >= lo) & (te.edad <= hi)).values
    resp = te.med_resp
    g = {
        "Todas": np.ones(len(te), bool),
        "Sexo: masculino": (te.genero == "MASCULINO").values, "Sexo: femenino": (te.genero == "FEMENINO").values,
        "Edad: hasta 30": rango_edad(0, 30), "Edad: 31 a 45": rango_edad(31, 45), "Edad: 46 a 60": rango_edad(46, 60), "Edad: más de 60": rango_edad(61, 200),
        "Con RUC": (te.sri_ruc == 1).values, "Sin RUC": (te.sri_ruc == 0).values,
        "Obligado a llevar contabilidad: sí": (te.sri_obligado == 1).values, "Obligado a llevar contabilidad: no": (te.sri_obligado == 0).values,
        "Obligado a llevar contabilidad: sin dato": te.sri_obligado.isna().values,
        "Estado del RUC: activo": (te.sri_estado == "ACTIVO").values, "Estado del RUC: suspendido": (te.sri_estado == "SUSPENDIDO").values,
        "Estado del RUC: sin dato": te.sri_estado.isna().values,
        "Respuesta: OK FACTURAR y condicionado": resp.isin(c.OK_FACTURAR).values, "Respuesta: rechazado": (resp == "RECHAZADO").values,
        "Respuesta: las demás (sin respuesta, aprobado, pendiente)": (~resp.isin(c.OK_FACTURAR) & (resp != "RECHAZADO")).values,
    }
    mes = te.t.dt.to_period("M").astype(str)
    for m in sorted(mes.unique()):
        g[f"Mes de la consulta: {m}"] = (mes == m).values
    return g


def calibrado_cruzado(d, nivel):
    """Lo que se haría en producción (`calibrar.py`, la «cruzada» en logaritmo): el modelo con todo lo anterior a julio y el corrimiento sacado de sus
    predicciones fuera de muestra. Devuelve el mínimo del 90% y del 85% calibrados y los dos corrimientos."""
    Q = adelante(d, nivel)
    oof = fuera_de_muestra(d, c.NIVELES[nivel])
    c90, c85 = (corrimiento(oof, d.antes.unver.values, q, q, "logaritmo") for q in (0.10, 0.15))
    return aplicar(Q, 0.10, c90, "logaritmo"), aplicar(Q, 0.15, c85, "logaritmo"), float(c90), float(c85)


def seccion_3(d):
    grupos = grupos_prueba(d.te)
    salida, md, resumen_cal = {}, [], {}
    for nivel in (1, 2):
        Q = adelante(d, nivel)
        m90_sc = np.exp(Q[:, I10])
        m90_cal, m85_cal, c90, c85 = calibrado_cruzado(d, nivel)
        resumen_cal[f"nivel{nivel}"] = {"corrimiento90": c90, "corrimiento85": c85}
        sistemas = {"sin_calibrar": m90_sc, "calibrado": m90_cal}
        filas = []
        for nombre, mask in grupos.items():
            idx = np.where(mask)[0]
            if len(idx) < 30:
                continue  # sin casos suficientes no se informa ni una mediana
            f = {"grupo": nombre, "casos": len(idx), "pocos_casos": bool(len(idx) < MIN_CASOS), "mediana_ingreso": round(float(np.median(d.real[idx])))}
            for s, m90 in sistemas.items():
                p, lo, hi = ic_proporcion(d.real >= m90, idx)
                f |= {f"{s}_cobertura90": p, f"{s}_ic_bajo": lo, f"{s}_ic_alto": hi, f"{s}_mediana_min90": float(np.median(m90[idx]))}
            filas.append(f)
        salida[f"nivel{nivel}"] = filas
        md.append(f"#### Nivel {nivel}: el real supera el mínimo del 90%, sin calibrar y calibrado (corrimiento {coma(c90, 3)} en logaritmo). «Pocos casos» = menos de {MIN_CASOS}\n\n" + tabla_md(filas, [
            ("Grupo", lambda f: f["grupo"] + (" (pocos casos)" if f["pocos_casos"] else "")), ("Casos", lambda f: coma(f["casos"], 0)), ("Mediana del ingreso", lambda f: coma(f["mediana_ingreso"], 0)),
            ("Sin calibrar: cobertura (IC 95%)", lambda f: f"{coma(f['sin_calibrar_cobertura90'])} ({coma(f['sin_calibrar_ic_bajo'])} a {coma(f['sin_calibrar_ic_alto'])})"),
            ("Sin calibrar: mediana del mínimo", lambda f: coma(f["sin_calibrar_mediana_min90"], 0)),
            ("Calibrado: cobertura (IC 95%)", lambda f: f"{coma(f['calibrado_cobertura90'])} ({coma(f['calibrado_ic_bajo'])} a {coma(f['calibrado_ic_alto'])})"),
            ("Calibrado: mediana del mínimo", lambda f: coma(f["calibrado_mediana_min90"], 0))]))
    return {"grupos": salida, "calibracion": resumen_cal, "minimo_de_casos": MIN_CASOS}, "\n\n".join(md)


# ================================================================ 4) el costo del sexo en el nivel 1
def seccion_4(d):
    cols = c.NIVELES[1]
    sin = [x for x in cols if x != "genero"]
    m_con, m_sin = MedidasLB(adelante(d, 1), d.real), MedidasLB(cuantiles_adelante(d, sin), d.real)
    filas, difs = [], []
    for nombre, m in (("Nivel 1 vigente (con el sexo)", m_con), ("Nivel 1 sin el sexo", m_sin)):
        for s, idx in d.subs.items():
            filas.append({"sistema": nombre, "subconjunto": s, **m.con_intervalos(idx, B=B)})
    for s, idx in d.subs.items():
        dif, lo, hi = c.diferencia_r2(m_con, m_sin, idx, B=B)
        mejora, mlo, mhi = mejora_relativa(m_con, m_sin, idx)
        difs.append({"subconjunto": s, "dif_r2": dif, "dif_r2_bajo": lo, "dif_r2_alto": hi, "mejora_perdida": mejora, "mejora_bajo": mlo, "mejora_alto": mhi})
    # Todo lo demás igual: el mismo modelo vigente, cada caso de la prueba una vez como hombre y otra como mujer.
    cat = d.cat_antes
    modelos = c.entrenar_cuantiles(c.matriz(d.antes, cols, cat), d.antes.y)
    Qs = {}
    for sexo in ("MASCULINO", "FEMENINO"):
        x = d.te.copy()
        x["genero"] = sexo
        Qs[sexo] = c.predecir(modelos, c.matriz(x, cols, cat))
    reproduce = float(np.abs(c.predecir(modelos, c.matriz(d.te, cols, cat)) - adelante(d, 1)).max())
    contrafactual = []
    for nombre, mask in (("Todos los casos de la prueba", np.ones(len(d.te), bool)), ("Los que son hombres", (d.te.genero == "MASCULINO").values),
                         ("Las que son mujeres", (d.te.genero == "FEMENINO").values), ("OK FACTURAR y condicionado", d.te.med_resp.isin(c.OK_FACTURAR).values)):
        i = np.where(mask)[0]
        fila = {"grupo": nombre, "casos": len(i)}
        for etiqueta, k in (("minimo90", I10), ("central", I50)):
            h, m = np.exp(Qs["MASCULINO"][i, k]), np.exp(Qs["FEMENINO"][i, k])
            razon = h / m
            fila |= {f"{etiqueta}_mediana_hombre": float(np.median(h)), f"{etiqueta}_mediana_mujer": float(np.median(m)), f"{etiqueta}_mediana_razon": float(np.median(razon)),
                     f"{etiqueta}_razon_p10": float(np.percentile(razon, 10)), f"{etiqueta}_razon_p90": float(np.percentile(razon, 90)),
                     f"{etiqueta}_dolares_mediana": float(np.median(h - m)), f"{etiqueta}_sobre_5": 100 * float((razon > 1.05).mean()), f"{etiqueta}_bajo_5": 100 * float((razon < 0.95).mean())}
        for sexo, etiqueta in (("MASCULINO", "hombre"), ("FEMENINO", "mujer")):
            fila[f"cert2000_{etiqueta}"] = 100 * float((np.exp(Qs[sexo][i, I10]) >= 2000).mean())
        contrafactual.append(fila)
    ingreso = {s: round(float(np.median(d.real[(d.te.genero == g).values]))) for s, g in (("hombre", "MASCULINO"), ("mujer", "FEMENINO"))}
    # ¿La brecha de cobertura entre mujeres y hombres (sección 3) viene de tener el sexo como variable? Se mide también sin él.
    por_sexo, rng = [], np.random.default_rng(5)
    for nombre, m in (("con el sexo (vigente)", m_con), ("sin el sexo", m_sin)):
        aciertos, grupos = d.real >= m.q10, {}
        for etiqueta, g in (("masculino", "MASCULINO"), ("femenino", "FEMENINO")):
            idx = np.where((d.te.genero == g).values)[0]
            p, lo, hi = ic_proporcion(aciertos, idx)
            grupos[etiqueta] = idx
            por_sexo.append({"modelo": nombre, "sexo": etiqueta, "casos": len(idx), "cobertura90": p, "ic_bajo": lo, "ic_alto": hi, "mediana_min90": float(np.median(m.q10[idx]))})
        brecha = [100 * (aciertos[rng.choice(grupos["masculino"], len(grupos["masculino"]))].mean() - aciertos[rng.choice(grupos["femenino"], len(grupos["femenino"]))].mean()) for _ in range(B)]
        por_sexo.append({"modelo": nombre, "sexo": "brecha: masculino menos femenino", "casos": len(d.te), "cobertura90": 100 * float(aciertos[grupos["masculino"]].mean() - aciertos[grupos["femenino"]].mean()),
                         "ic_bajo": float(np.percentile(brecha, 2.5)), "ic_alto": float(np.percentile(brecha, 97.5)), "mediana_min90": float("nan")})
    cols_tabla = [("Nivel 1", lambda f: f["sistema"]), ("Casos", lambda f: f["subconjunto"]), ("R²", lambda f: ic(f, "r2", 3)), ("Pérdida de cuantiles", lambda f: coma(f["perdida"], 4)),
                  ("El real supera el mínimo del 90% (%)", lambda f: ic(f, "cobertura90")), ("Del 85% (%)", lambda f: coma(f["cobertura85"])),
                  ("Mediana del mínimo", lambda f: coma(f["mediana_min90"], 0)), ("Certifica «al menos 2.000» (% y precisión)", lambda f: f"{coma(f['cert2000_pct'])}% y {coma(f['cert2000_precision'])}%")]
    md = ["#### Con y sin el sexo, hacia adelante\n\n" + tabla_md(filas, cols_tabla),
          "#### Diferencia del nivel vigente con el nivel sin el sexo (intervalo del 95%)\n\n" + tabla_md(difs, [
              ("Casos", lambda f: f["subconjunto"]), ("Diferencia de R²", lambda f: f"{coma(f['dif_r2'], 3)} ({coma(f['dif_r2_bajo'], 3)} a {coma(f['dif_r2_alto'], 3)})"),
              ("Baja de la pérdida de cuantiles", lambda f: f"{coma(f['mejora_perdida'], 2)}% ({coma(f['mejora_bajo'], 2)} a {coma(f['mejora_alto'], 2)})")]),
          "#### Cobertura del mínimo del 90% por sexo, con y sin el sexo como variable (brecha en puntos; intervalo del 95%)\n\n" + tabla_md(por_sexo, [
              ("Modelo", lambda f: f["modelo"]), ("Sexo", lambda f: f["sexo"]), ("Casos", lambda f: coma(f["casos"], 0)),
              ("Cobertura (IC 95%)", lambda f: f"{coma(f['cobertura90'])} ({coma(f['ic_bajo'])} a {coma(f['ic_alto'])})"), ("Mediana del mínimo", lambda f: coma(f["mediana_min90"], 0))]),
          "#### Todo lo demás igual: el mismo caso como hombre y como mujer (modelo vigente)\n\n" + tabla_md(contrafactual, [
              ("Casos", lambda f: f"{f['grupo']} ({c.miles(f['casos'])})"),
              ("Mínimo mediano: hombre / mujer", lambda f: f"{coma(f['minimo90_mediana_hombre'], 0)} / {coma(f['minimo90_mediana_mujer'], 0)}"),
              ("Mediana de hombre sobre mujer (p10 a p90)", lambda f: f"{coma(f['minimo90_mediana_razon'], 3)} ({coma(f['minimo90_razon_p10'], 3)} a {coma(f['minimo90_razon_p90'], 3)})"),
              ("Diferencia mediana en dólares", lambda f: coma(f["minimo90_dolares_mediana"], 0)),
              ("Hombre más de 5% arriba / abajo (%)", lambda f: f"{coma(f['minimo90_sobre_5'])} / {coma(f['minimo90_bajo_5'])}"),
              ("Certifica «al menos 2.000»: hombre / mujer (%)", lambda f: f"{coma(f['cert2000_hombre'])} / {coma(f['cert2000_mujer'])}"),
              ("Valor central: hombre sobre mujer (mediana)", lambda f: coma(f["central_mediana_razon"], 3))]),
          f"Ingreso real mediano de la prueba: hombres {coma(ingreso['hombre'], 0)}, mujeres {coma(ingreso['mujer'], 0)}. El modelo reentrenado reproduce el hacia adelante vigente con diferencia máxima {reproduce:.1e}."]
    return {"con_y_sin_sexo": filas, "diferencias": difs, "cobertura_por_sexo": por_sexo, "contrafactual": contrafactual, "ingreso_mediano_por_sexo": ingreso}, "\n\n".join(md)


# ================================================================ 5) qué etiquetas usar
ENTRENAMIENTOS = {
    "Todas las respuestas (como hoy)": lambda df: np.ones(len(df), bool),
    "Sin rechazados": lambda df: (df.med_resp != "RECHAZADO").values,
    "Sólo OK FACTURAR y condicionado": lambda df: df.med_resp.isin(c.OK_FACTURAR).values,
}


def seccion_5(d):
    prueba = d.te.iloc[d.ok].reset_index(drop=True)
    real = prueba.unver.values
    todos = np.arange(len(prueba))
    filas = []
    for nivel in (1, 2):
        cols = c.NIVELES[nivel]
        for nombre, regla in ENTRENAMIENTOS.items():
            tr = d.antes[regla(d.antes)].reset_index(drop=True)
            cat = c.categorias_de(tr)
            modelos = c.entrenar_cuantiles(c.matriz(tr, cols, cat), tr.y)
            Q = c.predecir(modelos, c.matriz(prueba, cols, cat))
            base = {"nivel": nivel, "entrenamiento": nombre, "personas": len(tr)}
            filas.append(base | {"calibracion": "sin calibrar", "casos_de_calibracion": 0, "corrimiento90": 0.0} | MedidasLB(Q, real).con_intervalos(todos, B=B))
            # Entrenar con todas las respuestas es lo mismo que la calibración de la sección 3: la validación cruzada se aprovecha, no se repite.
            oof = fuera_de_muestra(d, cols) if len(tr) == len(d.antes) else fuera_de_muestra(d, cols, tr, nombre=re.sub(r"\W+", "-", nombre.lower())[:30])
            es_ok = tr.med_resp.isin(c.OK_FACTURAR).values
            opciones = [("con todos los casos del entrenamiento", np.ones(len(tr), bool)), ("sólo con OK FACTURAR y condicionado", es_ok)]
            for etiqueta, sel in opciones:
                if etiqueta.startswith("sólo") and sel.all():
                    continue  # el entrenamiento ya es sólo OK FACTURAR: sería la misma fila
                y_cal = tr.unver.values[sel]
                c90, c85 = (corrimiento(oof[sel], y_cal, q, q, "logaritmo") for q in (0.10, 0.15))
                m = MedidasLB(Q, real, minimo90=aplicar(Q, 0.10, c90, "logaritmo"), minimo85=aplicar(Q, 0.15, c85, "logaritmo"))
                filas.append(base | {"calibracion": "calibrado " + etiqueta, "casos_de_calibracion": int(sel.sum()), "corrimiento90": float(c90)} | m.con_intervalos(todos, B=B))
        print(f"  etiquetas del nivel {nivel} listas", flush=True)
    md = []
    for nivel in (1, 2):
        md.append(f"#### Nivel {nivel}, medido sobre OK FACTURAR y condicionado de julio a octubre (n = {c.miles(len(prueba))})\n\n" + tabla_md([f for f in filas if f["nivel"] == nivel], [
            ("Entrenado con", lambda f: f"{f['entrenamiento']} ({c.miles(f['personas'])})"), ("Calibración", lambda f: f["calibracion"] + (f" ({c.miles(f['casos_de_calibracion'])})" if f["casos_de_calibracion"] else "")),
            ("Corrimiento del 90%", lambda f: coma(f["corrimiento90"], 3) if f["casos_de_calibracion"] else "—"),
            ("R²", lambda f: coma(f["r2"], 3)), ("Pérdida de cuantiles", lambda f: coma(f["perdida"], 4)),
            ("El real supera el mínimo del 90% (IC 95%)", lambda f: ic(f, "cobertura90")), ("Del 85% (%)", lambda f: coma(f["cobertura85"])),
            ("Mediana del mínimo", lambda f: coma(f["mediana_min90"], 0)), ("Tramo exacto (%)", lambda f: coma(f["tramo_exacto"])),
            ("Certifica «al menos 2.000» (% y precisión)", lambda f: f"{coma(f['cert2000_pct'])}% y {coma(f['cert2000_precision'])}%")]))
    return {"filas": filas}, "\n\n".join(md)


# ================================================================ 6) las versiones del predictor de Equifax y la etiqueta
# Cortes medidos en 12.x (docs/investigacion-predictor-de-ingresos.md, «Cuatro regímenes en 2026»). El negocio nombra V0 al de tope 20.000, V1 al cambio de modelo con
# tope 10.000 desde febrero o marzo, V2 a la corrección que dio los repetidos 1.051, 2.051 y 1.501, y V3 a la suya desde abril: los cortes de fecha son los medidos, el
# nombre es del negocio y no se cruzan uno a uno.
REGIMENES = [
    ("hasta el 13 de enero (tope 20.000, valores continuos)", None, "2026-01-14"),
    ("14 de enero al 1 de marzo (valores discretos, aún tope 20.000)", "2026-01-14", "2026-03-02"),
    ("2 de marzo al 12 de abril (tope 10.000)", "2026-03-02", "2026-04-13"),
    ("desde el 13 de abril (corrección del negocio, V3)", "2026-04-13", None),
]


def fuera_de_muestra_total(d, cols):
    """La validación cruzada de toda la tabla: la de `medir.py` si está y es de esta misma tabla, y si no, se calcula."""
    ruta = c.RESULTADOS / "medir" / f"oof-{clave(cols)}.npy"
    medir_json = c.RESULTADOS / "medir" / "medir.json"
    if ruta.exists() and medir_json.exists() and json.loads(medir_json.read_text(encoding="utf-8")).get("huella_tabla") == d.huella:
        q = np.load(ruta)
        if q.shape == (len(d.t), len(c.LEV)):
            return q
    return con_copia(d, f"oof-total-{clave(cols)}", lambda: c.validacion_cruzada(d.t, cols, d.cat_t))


def seccion_6(d):
    t = d.t
    variantes = {"Nivel 1": c.NIVELES[1], "Nivel 1 sin la fecha de la consulta": c.VARIANTES_NIVEL_1["sin la fecha de la consulta"], "Nivel 2": c.NIVELES[2]}
    M = {n: c.Medidas(fuera_de_muestra_total(d, cols), t.unver.values) for n, cols in variantes.items()}
    razon = {n: np.log(t.unver.values / np.exp(m.Q[:, I50])) for n, m in M.items()}  # log de real sobre valor central
    mes = t.t.dt.to_period("M").astype(str).values
    ok = t.med_resp.isin(c.OK_FACTURAR).values
    periodos = {f"Mes {m}": mes == m for m in sorted(set(mes))}
    for nombre, desde, hasta in REGIMENES:
        mask = np.ones(len(t), bool)
        if desde:
            mask &= (t.t >= pd.Timestamp(desde)).values
        if hasta:
            mask &= (t.t < pd.Timestamp(hasta)).values
        periodos[f"Régimen: {nombre}"] = mask
    filas = []
    for p, mask in periodos.items():
        for s, sel in (("todas", mask), ("OK FACTURAR y condicionado", mask & ok)):
            idx = np.where(sel)[0]
            if len(idx) < 30:
                continue
            f = {"periodo": p, "subconjunto": s, "casos": len(idx), "pocos_casos": bool(len(idx) < MIN_CASOS), "mediana_ingreso": round(float(np.median(t.unver.values[idx])))}
            for n in variantes:
                med, lo, hi = ic_mediana(np.exp(razon[n]), idx)
                cob, clo, chi = ic_proporcion(t.unver.values >= M[n].q10, idx)
                f |= {f"{n}|razon": med, f"{n}|razon_bajo": lo, f"{n}|razon_alto": hi, f"{n}|cobertura90": cob, f"{n}|cob_bajo": clo, f"{n}|cob_alto": chi}
            filas.append(f)
    # ¿Hay saltos? La diferencia de la mediana de log(real / central) entre regímenes seguidos, con remuestreo independiente de cada uno.
    saltos = []
    nombres_reg = [f"Régimen: {r[0]}" for r in REGIMENES]
    rng = np.random.default_rng(11)
    for s, extra in (("todas", np.ones(len(t), bool)), ("OK FACTURAR y condicionado", ok)):
        for a, b in zip(nombres_reg[:-1], nombres_reg[1:]):
            ia, ib = np.where(periodos[a] & extra)[0], np.where(periodos[b] & extra)[0]
            for n in variantes:
                va, vb = razon[n][ia], razon[n][ib]
                dif = np.median(vb) - np.median(va)
                boot = np.median(vb[rng.integers(0, len(vb), (B_GRUPO, len(vb)))], axis=1) - np.median(va[rng.integers(0, len(va), (B_GRUPO, len(va)))], axis=1)
                saltos.append({"subconjunto": s, "modelo": n, "de": a, "a": b, "dif_log": float(dif), "factor": float(np.exp(dif)), "bajo": float(np.percentile(boot, 2.5)), "alto": float(np.percentile(boot, 97.5))})
    md = []
    for s in ("todas", "OK FACTURAR y condicionado"):
        md.append(f"#### Validación cruzada por persona, {s}: mediana de real sobre valor central y cobertura del mínimo del 90%\n\n" + tabla_md([f for f in filas if f["subconjunto"] == s], [
            ("Período", lambda f: f["periodo"] + (" (pocos casos)" if f["pocos_casos"] else "")), ("Casos", lambda f: coma(f["casos"], 0)), ("Ingreso mediano", lambda f: coma(f["mediana_ingreso"], 0)),
            *[(f"{n}: real sobre central", (lambda n: lambda f: f"{coma(f[n + '|razon'], 2)} ({coma(f[n + '|razon_bajo'], 2)} a {coma(f[n + '|razon_alto'], 2)})")(n)) for n in variantes],
            *[(f"{n}: cobertura (%)", (lambda n: lambda f: coma(f[n + "|cobertura90"]))(n)) for n in variantes]]))
    md.append("#### Salto de un régimen al siguiente: cambio de la mediana de real sobre valor central (factor; intervalo del 95%)\n\n" + tabla_md(saltos, [
        ("Casos", lambda f: f["subconjunto"]), ("Modelo", lambda f: f["modelo"]), ("De", lambda f: f["de"].replace("Régimen: ", "")), ("A", lambda f: f["a"].replace("Régimen: ", "")),
        ("Factor", lambda f: f"{coma(f['factor'], 3)} ({coma(np.exp(f['bajo']), 3)} a {coma(np.exp(f['alto']), 3)})")]))
    return {"periodos": filas, "saltos": saltos}, "\n\n".join(md)


# ================================================================ 7) la decisión de la capacidad de pago
def leer_parametros_ts():
    """Los parámetros salen de los `.ts` (no se copian): si cambian allá, esta medida los toma. Sólo entiende el sistema francés con desgravamen anual sobre saldo."""
    cap = CAPACIDAD_TS.read_text(encoding="utf-8")
    sim = SIMULADOR_TS.read_text(encoding="utf-8")
    bloque_cap = re.search(r"PARAMETROS_CAPACIDAD: ParametrosCapacidad = \{(.*?)\};", cap, re.S).group(1)
    bloque_prod = re.search(r"PRODUCTO_CONSUMO: ParametrosProducto = \{(.*?)\n\};", sim, re.S).group(1)
    par = {
        "cargaMaxima": float(re.search(r"cargaMaxima:\s*([0-9.]+)", bloque_cap).group(1)),
        "margenJusto": float(re.search(r"margenJusto:\s*([0-9.]+)", bloque_cap).group(1)),
        "aportePersonalIess": float(re.search(r"aportePersonalIess:\s*([0-9.]+)", bloque_cap).group(1)),
        "tasaNominalMaximaPorcentaje": float(re.search(r"tasaNominalMaximaPorcentaje:\s*([0-9.]+)", bloque_prod).group(1)),
        "desgravamenPorcentaje": float(re.search(r"tasaPorcentaje:\s*([0-9.]+)", bloque_prod).group(1)),
        "desgravamenPeriodicidad": re.search(r'periodicidad:\s*"(\w+)"', bloque_prod).group(1),
        "desgravamenBase": re.search(r'base:\s*"(\w+)"', bloque_prod).group(1),
        "sistema": re.search(r'sistema:\s*"(\w+)"', bloque_prod).group(1),
    }
    if (par["sistema"], par["desgravamenPeriodicidad"], par["desgravamenBase"]) != ("frances", "anual", "saldo"):
        raise ValueError(f"El producto cambió y esta medida sólo reproduce el francés con desgravamen anual sobre saldo: {par}")
    return par


def redondeo_js(x):
    """`Math.round` de JavaScript: la mitad va hacia arriba (el `round` de Python la lleva al par)."""
    return np.floor(np.asarray(x, float) + 0.5)


def cuota_primer_mes(monto, plazo, par):
    """La cuota del primer mes de `simularCredito`, con la Tasa máxima y el desgravamen del producto, en centavos enteros como allá."""
    i = par["tasaNominalMaximaPorcentaje"] / 100 / 12
    seguro_mensual = par["desgravamenPorcentaje"] / 100 / 12
    saldo = int(redondeo_js(monto * 100))
    interes = int(redondeo_js(saldo * i))
    capital = int(redondeo_js((saldo * i) / (1 - (1 + i) ** (-plazo)))) - interes
    if plazo == 1 or capital > saldo:
        capital = saldo
    seguro = int(redondeo_js(saldo * seguro_mensual)) if saldo > 0 else 0
    return capital + interes + seguro


def alcanza(ingreso, obligaciones_c, cuota_c, carga_maxima):
    """`evaluarCapacidad`: la cuota entra si las obligaciones más la cuota no pasan del tope de carga sobre el ingreso neto, todo en centavos enteros.
    `cumple` es «alcanza» o «justo»; sólo «no alcanza» es que no. Un ingreso estimado no lleva descuento del aporte personal (no es un sueldo)."""
    neto_c = redondeo_js(np.asarray(ingreso) * 100)
    tope_c = np.floor(neto_c * round(carga_maxima * 1e9) / 1e9 + 1e-6)
    return (obligaciones_c + cuota_c) <= tope_c


MONTOS = [3000, 5000, 10000, 20000]
PLAZOS = [36, 60]


def seccion_7(d):
    par = leer_parametros_ts()
    prueba = d.te.iloc[d.ok].reset_index(drop=True)
    real = prueba.unver.values
    obligaciones_c = redondeo_js(prueba.cuota_fin.values * 100)
    estimadores = {}
    for nivel in (1, 2):
        Q = adelante(d, nivel)[d.ok]
        estimadores[f"Nivel {nivel}: mínimo al 90%"] = np.maximum(np.exp(Q[:, I10]), SBU_MEDIO)  # con el límite de medio salario básico (especificación, 5)
        estimadores[f"Nivel {nivel}: cuantil 0,25"] = np.exp((Q[:, I20] + Q[:, I30]) / 2)  # el 0,25 no es uno de los doce: promedio en logaritmo del 0,20 y el 0,30
        estimadores[f"Nivel {nivel}: valor central"] = np.exp(Q[:, I50])
    escenarios = [(m, p) for p in PLAZOS for m in MONTOS]
    cuotas = {e: cuota_primer_mes(e[0], e[1], par) for e in escenarios}
    decide = lambda ingreso: np.column_stack([alcanza(ingreso, obligaciones_c, cuotas[e], par["cargaMaxima"]) for e in escenarios])
    dec_real = decide(real)
    rng = np.random.default_rng(5)
    boot = rng.integers(0, len(real), size=(B, len(real)))

    def con_ic(por_persona):
        """Promedio de una medida por persona sobre los escenarios, con intervalo por remuestreo de personas."""
        m = 100 * por_persona.mean()
        r = 100 * por_persona[boot].mean(1)
        return float(m), float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))

    filas, por_escenario = [], []
    for nombre, ingreso in estimadores.items():
        est = decide(ingreso)
        conc, error, niega = est == dec_real, est & ~dec_real, ~est & dec_real
        f = {"estimador": nombre, "mediana_estimado": float(np.median(ingreso)), "estimado_alcanza": 100 * float(est.mean())}
        for clave_m, v in (("concordancia", conc), ("alcanza_por_error", error), ("niega_de_mas", niega)):
            f[clave_m], f[clave_m + "_bajo"], f[clave_m + "_alto"] = con_ic(v.mean(1))
        f["error_entre_los_que_alcanzan"] = 100 * float(error.sum() / max(est.sum(), 1))
        filas.append(f)
        for j, (m, p) in enumerate(escenarios):
            por_escenario.append({"estimador": nombre, "monto": m, "plazo": p, "cuota": cuotas[(m, p)] / 100, "real_alcanza": 100 * float(dec_real[:, j].mean()),
                                  "estimado_alcanza": 100 * float(est[:, j].mean()), "concordancia": 100 * float(conc[:, j].mean()),
                                  "alcanza_por_error": 100 * float(error[:, j].mean()), "niega_de_mas": 100 * float(niega[:, j].mean())})
    real_alcanza = [{"monto": m, "plazo": p, "cuota": cuotas[(m, p)] / 100, "real_alcanza": 100 * float(dec_real[:, j].mean())} for j, (m, p) in enumerate(escenarios)]
    md = [f"Parámetros leídos de los `.ts`: carga máxima {coma(100 * par['cargaMaxima'], 0)}%, Tasa máxima {coma(par['tasaNominalMaximaPorcentaje'])}%, desgravamen {coma(par['desgravamenPorcentaje'])}% anual sobre saldo, sistema francés. "
          f"Casos: {c.miles(len(real))} de OK FACTURAR y condicionado de julio a octubre; ya paga la cuota financiera de Equifax (mediana {coma(float(np.median(prueba.cuota_fin)), 0)}).",
          "#### Con el ingreso real, ¿cuántos alcanzan?\n\n" + tabla_md(real_alcanza, [("Crédito", lambda f: f"{coma(f['monto'], 0)} a {f['plazo']} meses"), ("Cuota del primer mes", lambda f: coma(f["cuota"], 2)),
                                                                                  ("Alcanza con el ingreso real (%)", lambda f: coma(f["real_alcanza"]))]),
          "#### Los ocho créditos juntos (promedio por persona; intervalo del 95% por remuestreo de personas)\n\n" + tabla_md(filas, [
              ("Con qué se decide", lambda f: f["estimador"]), ("Mediana del ingreso estimado", lambda f: coma(f["mediana_estimado"], 0)), ("Dice «alcanza» (%)", lambda f: coma(f["estimado_alcanza"])),
              ("Concordancia (%)", lambda f: f"{coma(f['concordancia'])} ({coma(f['concordancia_bajo'])} a {coma(f['concordancia_alto'])})"),
              ("«Alcanza» por error (%)", lambda f: f"{coma(f['alcanza_por_error'])} ({coma(f['alcanza_por_error_bajo'])} a {coma(f['alcanza_por_error_alto'])})"),
              ("Niega de más (%)", lambda f: f"{coma(f['niega_de_mas'])} ({coma(f['niega_de_mas_bajo'])} a {coma(f['niega_de_mas_alto'])})"),
              ("Error entre los que dicen «alcanza» (%)", lambda f: coma(f["error_entre_los_que_alcanzan"]))]),
          "#### Por crédito\n\n" + tabla_md(por_escenario, [("Con qué se decide", lambda f: f["estimador"]), ("Crédito", lambda f: f"{coma(f['monto'], 0)} a {f['plazo']}"),
                                                           ("Real alcanza (%)", lambda f: coma(f["real_alcanza"])), ("Estimado alcanza (%)", lambda f: coma(f["estimado_alcanza"])),
                                                           ("Concordancia (%)", lambda f: coma(f["concordancia"])), ("«Alcanza» por error (%)", lambda f: coma(f["alcanza_por_error"])),
                                                           ("Niega de más (%)", lambda f: coma(f["niega_de_mas"]))])]
    return {"parametros_leidos": par, "casos": len(real), "resumen": filas, "por_credito": por_escenario, "real_alcanza": real_alcanza,
            "cuota_financiera_mediana": round(float(np.median(prueba.cuota_fin)))}, "\n\n".join(md)


# ================================================================ 8) las colas de la distribución
def cdf_con_colas(Q, t, forma, dmin, dmax, cota=0.005):
    """Como `c.cdf` entre el primer y el último cuantil; fuera de ellos, en vez de poner la mitad del nivel (0,025 y 0,975 de golpe), sigue el tramo de los dos
    cuantiles extremos en logaritmo, con el espaciado entre ellos acotado a [dmin, dmax] para que dos cuantiles casi iguales no den una cola infinitamente fina.
      lineal        la probabilidad baja (o sube) con la pendiente de los dos cuantiles extremos y no baja de una cota mínima: la masa de la cola termina a un espaciado de distancia.
      exponencial   la cola decae como un exponencial en el logaritmo del ingreso (una Pareto arriba) con la razón entre los dos cuantiles extremos: nunca llega a cero."""
    L = np.array(c.LEV)
    K = len(L)
    lt = math.log(t)
    idx = (Q <= lt).sum(1)
    d_abajo = np.clip(Q[:, 1] - Q[:, 0], dmin, dmax)
    d_arriba = np.clip(Q[:, -1] - Q[:, -2], dmin, dmax)
    dist_abajo = np.maximum(Q[:, 0] - lt, 0)
    dist_arriba = np.maximum(lt - Q[:, -1], 0)
    if forma == "lineal":
        abajo = np.maximum(L[0] - (L[1] - L[0]) / d_abajo * dist_abajo, cota)
        encima = np.maximum((1 - L[-1]) - (L[-1] - L[-2]) / d_arriba * dist_arriba, cota)
    else:
        abajo = L[0] * np.exp(-math.log(L[1] / L[0]) / d_abajo * dist_abajo)
        encima = (1 - L[-1]) * np.exp(-math.log((1 - L[-2]) / (1 - L[-1])) / d_arriba * dist_arriba)
    return np.where(idx == 0, abajo, np.where(idx == K, 1 - encima, c.cdf(Q, t)))


def probabilidades_con(Q, funcion_cdf):
    """Igual que `c.probabilidades`, con la función de distribución que se le pase."""
    cu = np.column_stack([funcion_cdf(Q, u) for u in c.UMB])
    P = np.diff(np.column_stack([np.zeros(len(Q)), cu, np.ones(len(Q))]), axis=1)
    P = np.clip(P, 1e-4, None)
    return P / P.sum(1, keepdims=True)


def reglas(dmin=0.10, dmax=1.0):
    return {
        "Actual (la mitad del nivel por fuera de los extremos)": c.cdf,
        "Lineal en logaritmo, acotada": lambda Q, t: cdf_con_colas(Q, t, "lineal", dmin, dmax),
        "Exponencial en logaritmo, acotada": lambda Q, t: cdf_con_colas(Q, t, "exponencial", dmin, dmax),
    }


def brier(P, real):
    Y = np.eye(len(c.UMB) + 1)[np.digitize(real, c.UMB)]
    return Y, (P - Y) ** 2


def seccion_8(d):
    md, salida = [], {}
    # 1) La regla actual tiene que reproducir `c.probabilidades` exacto; si no, esta medida no mide lo que dice.
    verificacion = float(np.abs(probabilidades_con(adelante(d, 1), c.cdf) - c.probabilidades(adelante(d, 1))).max())
    # 2) Los límites del espaciado se eligen con lo anterior a julio (predicciones fuera de muestra) y no con la prueba.
    rejilla = []
    for nivel in (1, 2):
        oof = fuera_de_muestra(d, c.NIVELES[nivel])
        for forma in ("lineal", "exponencial"):
            # El espaciado máximo casi nunca manda (con 0,5, 1 y 2 el Brier no cambia a la sexta cifra): se fija en 1 y se informa cuánto varía. El mínimo sí manda.
            for dmin in (0.05, 0.10, 0.20, 0.30, 0.50):
                for dmax in (0.5, 1.0, 2.0):
                    P = probabilidades_con(oof, lambda Q, t: cdf_con_colas(Q, t, forma, dmin, dmax))
                    rejilla.append({"nivel": nivel, "forma": forma, "dmin": dmin, "dmax": dmax, "brier": float(brier(P, d.antes.unver.values)[1].sum(1).mean())})
        rejilla.append({"nivel": nivel, "forma": "actual", "dmin": None, "dmax": None, "brier": float(brier(probabilidades_con(oof, c.cdf), d.antes.unver.values)[1].sum(1).mean())})
    gr = pd.DataFrame(rejilla)
    elegidas = {}
    for forma in ("lineal", "exponencial"):
        s = gr[(gr.forma == forma) & (gr.dmax == 1.0)].groupby("dmin").brier.sum().sort_values()
        elegidas[forma] = (float(s.index[0]), 1.0)
    variacion = gr[gr.forma != "actual"].groupby(["nivel", "forma", "dmin"]).brier.agg(lambda x: x.max() - x.min())
    tabla_rejilla = [f | {"variacion_por_dmax": None if f["forma"] == "actual" else float(variacion[(f["nivel"], f["forma"], f["dmin"])])}
                     for f in gr[(gr.dmax == 1.0) | gr.dmax.isna()].to_dict("records")]
    md.append("#### Cómo se eligió el espaciado mínimo: Brier total con lo anterior a julio (predicciones fuera de muestra; menor es mejor)\n\n"
              + tabla_md(tabla_rejilla, [("Nivel", lambda f: str(f["nivel"])), ("Forma", lambda f: f["forma"]), ("Espaciado mínimo", lambda f: "—" if f["dmin"] is None or pd.isna(f["dmin"]) else coma(f["dmin"], 2)),
                                         ("Brier total", lambda f: coma(f["brier"], 5)), ("Cambio por el espaciado máximo (0,5 a 2)", lambda f: "—" if f["variacion_por_dmax"] is None else coma(f["variacion_por_dmax"], 5))])
              + f"\n\nElegidos (la suma de los dos niveles): lineal con espaciado mínimo {coma(elegidas['lineal'][0], 2)}, exponencial con {coma(elegidas['exponencial'][0], 2)}; el máximo, en 1.")
    nombres = list(reglas())
    reg = {nombres[0]: c.cdf, nombres[1]: (lambda dm, dx: lambda Q, t: cdf_con_colas(Q, t, "lineal", dm, dx))(*elegidas["lineal"]),
           nombres[2]: (lambda dm, dx: lambda Q, t: cdf_con_colas(Q, t, "exponencial", dm, dx))(*elegidas["exponencial"])}
    for nivel in (1, 2):
        Q = adelante(d, nivel)
        P = {n: probabilidades_con(Q, f) for n, f in reg.items()}
        salida[f"nivel{nivel}"] = {}
        for s, idx in d.subs.items():
            real = d.real[idx]
            filas, totales = [], []
            B_ = {}
            for n in nombres:
                Y, bk = brier(P[n][idx], real)
                B_[n] = bk.sum(1)
                totales.append({"regla": n, "brier_total": float(bk.sum(1).mean()), "tramo_exacto": 100 * float((P[n][idx].argmax(1) == Y.argmax(1)).mean()),
                                "tramo_o_vecino": 100 * float((np.abs(P[n][idx].argmax(1) - Y.argmax(1)) <= 1).mean())})
                for k in range(Y.shape[1]):
                    filas.append({"regla": n, "tramo": NOMBRES_TRAMOS[k], "observada": 100 * float(Y[:, k].mean()), "predicha": 100 * float(P[n][idx][:, k].mean()), "brier": float(bk[:, k].mean())})
            rng = np.random.default_rng(5)
            for t_ in totales[1:]:
                dif = B_[t_["regla"]] - B_[nombres[0]]
                bo = [dif[rng.integers(0, len(dif), len(dif))].mean() for _ in range(B)]
                t_["dif_brier"], t_["dif_bajo"], t_["dif_alto"] = float(dif.mean()), float(np.percentile(bo, 2.5)), float(np.percentile(bo, 97.5))
            salida[f"nivel{nivel}"][s] = {"por_tramo": filas, "totales": totales}
            filas_tabla = []
            for k, nom in enumerate(NOMBRES_TRAMOS):
                a = [f for f in filas if f["tramo"] == nom]
                filas_tabla.append({"tramo": nom, "observada": a[0]["observada"], **{f"p{j}": a[j]["predicha"] for j in range(3)}, **{f"b{j}": a[j]["brier"] for j in range(3)}})
            md.append(f"#### Nivel {nivel}, {s} (n = {c.miles(len(idx))}): probabilidad predicha media contra frecuencia observada, y Brier por tramo\n\n" + tabla_md(filas_tabla, [
                ("Tramo", lambda f: f["tramo"]), ("Observada (%)", lambda f: coma(f["observada"], 2)),
                ("Predicha: actual / lineal / exponencial (%)", lambda f: f"{coma(f['p0'], 2)} / {coma(f['p1'], 2)} / {coma(f['p2'], 2)}"),
                ("Brier por tramo: actual / lineal / exponencial", lambda f: f"{coma(f['b0'], 5)} / {coma(f['b1'], 5)} / {coma(f['b2'], 5)}")])
                      + "\n\n" + tabla_md(totales, [("Regla", lambda f: f["regla"]), ("Brier total", lambda f: coma(f["brier_total"], 5)),
                                                    ("Diferencia con la actual (IC 95%)", lambda f: "—" if "dif_brier" not in f else f"{coma(f['dif_brier'], 5)} ({coma(f['dif_bajo'], 5)} a {coma(f['dif_alto'], 5)})"),
                                                    ("Tramo exacto (%)", lambda f: coma(f["tramo_exacto"])), ("Exacto o vecino (%)", lambda f: coma(f["tramo_o_vecino"]))]))
    return {"verificacion_regla_actual": verificacion, "rejilla": rejilla, "elegidas": elegidas, "resultado": salida}, "\n\n".join(md)


# ================================================================ armado
SECCIONES = {
    1: ("Línea base sin variables", seccion_1), 2: ("Curvas de aprendizaje", seccion_2), 3: ("Cobertura y mínimo por grupo", seccion_3), 4: ("El costo del sexo en el nivel 1", seccion_4),
    5: ("Qué etiquetas usar", seccion_5), 6: ("Versiones del predictor de Equifax y la etiqueta", seccion_6), 7: ("La decisión de la capacidad de pago", seccion_7), 8: ("Las colas de la distribución", seccion_8),
}


def main():
    t0 = time.time()
    solo = next((a.split("=")[1] for a in sys.argv if a.startswith("--solo=")), None)
    pedidas = [int(x) for x in solo.split(",")] if solo else list(SECCIONES)
    d = Datos()
    SALIDA.mkdir(parents=True, exist_ok=True)
    print(f"{c.miles(len(d.antes))} personas para entrenar (antes de julio), {c.miles(len(d.te))} para probar ({c.miles(len(d.ok))} en OK FACTURAR y condicionado)", flush=True)
    for n in pedidas:
        titulo, funcion = SECCIONES[n]
        t1 = time.time()
        datos, md = funcion(d)
        (SALIDA / f"seccion-{n}.json").write_text(json.dumps(limpiar(datos), ensure_ascii=False, indent=1), encoding="utf-8")
        (SALIDA / f"seccion-{n}.md").write_text(f"### {n}. {titulo}\n\n{md}\n", encoding="utf-8")
        print(f"sección {n} «{titulo}» lista en {time.time() - t1:.0f} s", flush=True)
    # Lo agregado de todas las secciones que ya están en disco, para git; el informe en texto queda en la carpeta de resultados.
    todas = {}
    informe = []
    for n, (titulo, _) in SECCIONES.items():
        ruta = SALIDA / f"seccion-{n}.json"
        if ruta.exists():
            todas[f"seccion_{n}"] = {"titulo": titulo, **json.loads(ruta.read_text(encoding="utf-8"))}
            informe.append((SALIDA / f"seccion-{n}.md").read_text(encoding="utf-8"))
    meta = {"descripcion": "Fase 0 de la revisión del predictor de ingresos: línea base, curvas de aprendizaje, grupos, sexo, etiquetas, versiones de Equifax, capacidad de pago y colas. Sólo agregados.",
            "entrenamiento": f"{len(d.antes)} personas con consulta anterior al {c.CORTE_FECHA.date()}", "prueba": f"{len(d.te)} personas de julio a octubre de 2026, {len(d.ok)} en OK FACTURAR y condicionado",
            "remuestreos": B, "versiones": c.versiones(), "huella_tabla": d.huella, "corrida": time.strftime("%Y-%m-%d %H:%M"), "modo_rapido": RAPIDO}
    if not RAPIDO:
        METRICAS.parent.mkdir(parents=True, exist_ok=True)
        METRICAS.write_text(json.dumps(limpiar({"meta": meta, **todas}), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"métricas -> {METRICAS}")
    (SALIDA / "linea-base.md").write_text("\n\n".join(informe), encoding="utf-8")
    print(f"listo en {time.time() - t0:.0f} s -> {SALIDA / 'linea-base.md'}")


if __name__ == "__main__":
    main()
