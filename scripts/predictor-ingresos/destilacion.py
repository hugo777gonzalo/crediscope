# Fase 4 de la revisión del predictor de ingresos (2026-11-06): «destilación con propósito». Tres hipótesis, cada una con su regla para seguir
# o descartarse, medidas con el marco de la fase 0 (`linea_base.py`): pérdida de cuantiles, tramo exacto o vecino, cobertura del mínimo y la
# decisión de la capacidad de pago. Siempre hacia adelante: se entrena con lo anterior a julio de 2026 y se mide de julio a octubre (8.656 casos).
#
#   D3  Quitar el ancla de la etiqueta. El analista arma el ingreso después de ver el predictor de Equifax (12.15) y en un tercio de OK FACTURAR lo deja
#       igual a esa cifra; en los rechazados lo baja como consecuencia de la decisión (12.21). Se entrena con pesos por la calidad de la etiqueta y se
#       calibra el mínimo con OK FACTURAR y condicionado. Sigue si la cobertura en OK FACTURAR y condicionado queda entre 90% y 94% con un mínimo
#       más alto que el de hoy, sin empeorar la agudeza general.
#   D2  Una alerta para pedir documentos: la distancia entre nuestra estimación y la de un alumno que imita al predictor de Equifax (12.28), y la
#       de la cifra misma (el techo). Sigue si separa los casos en que el ingreso validado queda bajo nuestro mínimo con un AUC de 0,65 o más.
#   D1  El maestro (el predictor de Equifax) etiqueta las consultas sin ingreso validado. Sigue si la pérdida baja 2% o más y la cobertura no baja.
#
#   python -I scripts/predictor-ingresos/destilacion.py [--solo=etiqueta,d3,d2,d1] [--recalcular] [--rapido]
#
# Lee la tabla por persona (`personas.parquet`) y, en memoria, el predictor de Equifax, los documentos y el historial de los flujos de las
# extracciones de AWS que ya están en disco (`research/ingresos-aws/`): no consulta a AWS, a Equifax, a Proveedor_Info_1 ni al modelo. La cifra del
# predictor de Equifax nunca entra como variable (`comun.verificar_entradas`): pesa una etiqueta, es la señal de la alerta o es la etiqueta de D1.
# A git sólo va `metricas/destilacion-2026-11.json` (agregados); lo demás queda en C:\datos\ingresos\resultados\predictor-ingresos\destilacion\.
import json
import sys
import time
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd
from scipy.stats import rankdata

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
import linea_base as lb
import preparar
from calibrar import SBU_MEDIO, aplicar, corrimiento
from medir import coma, ic, tabla_md

SALIDA = c.RESULTADOS / "destilacion"
METRICAS = Path(__file__).resolve().parent / "metricas" / "destilacion-2026-11.json"
B = lb.B
I10, I15, I50 = (c.LEV.index(x) for x in (0.10, 0.15, 0.50))
IGUAL_AL_PREDICTOR = 0.01  # la etiqueta está a 1% o menos de la cifra del predictor de Equifax: el analista la dejó como venía
pct = lb.pct


# ================================================================ datos
def leer_csv(nombre, columnas):
    return duckdb.sql(f"select {columnas} from read_csv('{(c.ENTRADAS / nombre).as_posix()}', header=true, all_varchar=true, sample_size=-1)").df()


class DatosD(lb.Datos):
    """`linea_base.Datos` con lo que esta fase necesita de cada persona, en memoria: la cifra del predictor de Equifax de su consulta, si tiene
    documento de ingresos cargado, si el monto de sus flujos cambió y su grupo de calidad. Nada de esto entra al modelo."""

    def __init__(self):
        super().__init__()
        p = leer_csv("predictor_equifax_por_consulta.csv", "try_cast(id_consulta_equifax as bigint) id_consulta_equifax, identificacion, "
                     "try_cast(id_persona_requerimiento as bigint) ipr, try_cast(income_predictor_equifax as double) pred")
        self.consultas = p  # para separar personas de entrenamiento, de prueba y del resto (la identificación no sale de la memoria)
        doc = pd.read_csv(c.ENTRADAS / "documentos_por_persona.csv", encoding="utf-8-sig", usecols=["id_persona_requerimiento", "n_docs_ingresos_con_archivo"])
        fl = pd.read_csv(c.ENTRADAS / "flujos_historial.csv", encoding="utf-8-sig", usecols=["id_persona_requerimiento", "n_cambios_de_monto"])
        fl = fl.groupby("id_persona_requerimiento").n_cambios_de_monto.sum()
        for nombre in ("antes", "te", "t"):
            df = getattr(self, nombre).merge(p[["id_consulta_equifax", "identificacion", "ipr", "pred"]], on="id_consulta_equifax", how="left", validate="one_to_one")
            df["con_documento"] = df.ipr.map(doc.set_index("id_persona_requerimiento").n_docs_ingresos_con_archivo).fillna(0).values > 0
            cambios = df.ipr.map(fl)
            df["flujo_auditado"] = cambios.notna().values
            df["monto_cambio"] = (cambios > 0).values
            df["igual_pred"] = (np.abs(df.unver / df.pred.where(df.pred > 0) - 1) <= IGUAL_AL_PREDICTOR).values
            df["calidad"] = calidad(df)
            setattr(self, nombre, df)
        self.okm = self.te.med_resp.isin(c.OK_FACTURAR).values
        self.editadas = np.where(self.okm & ~self.te.igual_pred.values)[0]
        self.subs = {"todas": self.todas, "OK FACTURAR y condicionado": self.ok, "OK FACTURAR y condicionado, editadas": self.editadas}


GRUPOS = ["OK FACTURAR con documento de ingresos", "OK FACTURAR sin documento", "OK FACTURAR CONDICIONADO",
          "Aprobado, aprobado condicionado o pendiente", "Sin respuesta", "RECHAZADO"]


def calidad(df):
    r = df.med_resp
    return np.select([(r == "OK FACTURAR") & df.con_documento, r == "OK FACTURAR", r == "OK FACTURAR CONDICIONADO",
                      r.isin(["APROBADO", "APROBADO CONDICIONADO", "PENDIENTE"]), r.isna(), r == "RECHAZADO"], GRUPOS, "otra")


# ================================================================ 0) la calidad de la etiqueta
def seccion_etiqueta(d):
    filas = []
    for parte, df in (("entrenamiento (antes de julio)", d.antes), ("prueba (julio a octubre)", d.te)):
        for g in GRUPOS + ["Todas"]:
            s = df if g == "Todas" else df[df.calidad == g]
            con_pred = s[s.pred > 0]
            filas.append({"parte": parte, "grupo": g, "casos": len(s), "igual_al_predictor": 100 * float(s.igual_pred.mean()),
                          "con_documento": 100 * float(s.con_documento.mean()), "flujo_auditado": 100 * float(s.flujo_auditado.mean()),
                          "monto_cambio_si_auditado": 100 * float(s.monto_cambio[s.flujo_auditado].mean()) if s.flujo_auditado.any() else np.nan,
                          "mediana_ingreso": float(np.median(s.unver)), "mediana_etiqueta_sobre_predictor": float(np.median(con_pred.unver / con_pred.pred)),
                          "mediana_editadas_sobre_predictor": float(np.median((con_pred.unver / con_pred.pred)[~con_pred.igual_pred]))})
    md = "#### La etiqueta por grupo de calidad\n\n" + tabla_md(filas, [
        ("Parte", lambda f: f["parte"]), ("Grupo", lambda f: f["grupo"]), ("Casos", lambda f: coma(f["casos"], 0)),
        ("Igual al predictor de Equifax (±1%)", lambda f: pct(f["igual_al_predictor"])), ("Con documento de ingresos", lambda f: pct(f["con_documento"])),
        ("Flujo con historial / el monto cambió", lambda f: f"{pct(f['flujo_auditado'], 0)} / {pct(f['monto_cambio_si_auditado'], 0)}"),
        ("Ingreso mediano", lambda f: coma(f["mediana_ingreso"], 0)), ("Mediana de etiqueta sobre predictor (todas / editadas)",
                                                                     lambda f: f"{coma(f['mediana_etiqueta_sobre_predictor'], 2)} / {coma(f['mediana_editadas_sobre_predictor'], 2)}")])
    return {"grupos": filas, "umbral_igual_al_predictor": IGUAL_AL_PREDICTOR}, md


# ================================================================ entrenar con pesos
def entrenar_con_pesos(X, y, w):
    """Los doce cuantiles de `comun.entrenar_cuantiles` con un peso por caso (la pérdida de cada caso se multiplica por su peso)."""
    import lightgbm as lgb
    return [lgb.LGBMRegressor(objective="quantile", alpha=q, n_estimators=c.N_ARBOLES, **c.PAR).fit(
        X, y, sample_weight=w, categorical_feature=[k for k in X.columns if k in c.CATEGORICAS]) for q in c.LEV]


def cruzada_con_pesos(tr, cols, w):
    """Como `comun.validacion_cruzada` (mismas particiones por persona), con pesos: las predicciones fuera de muestra para calibrar."""
    cat = c.categorias_de(tr)
    X = c.matriz(tr, cols, cat)
    Q = np.zeros((len(tr), len(c.LEV)))
    for a, b in c.particiones(len(tr)):
        Q[b] = c.predecir(entrenar_con_pesos(X.iloc[a], tr.y.iloc[a], w[a]), X.iloc[b])
    return Q


# ================================================================ D3: quitar el ancla
# Los pesos se fijaron antes de medir, con lo que dicen 12.15 y 12.21 de cada grupo, y no se ajustaron con la prueba:
#   OK FACTURAR con documento 1 (lo más cercano a un ingreso contrastado); sin documento y condicionado 0,8 (moderado) o 0,7 (fuerte); aprobado, pendiente y sin
#   respuesta 0,6 o 0,4 (montos declarados que casi nadie tocó: 97% sin cambio en los sin respuesta); rechazado 0,3 o 0 (el analista baja el monto: razón 0,46
#   cuando cambia). La etiqueta igual a la cifra del predictor de Equifax se multiplica por 0,6 o 0,3: es el predictor, no un ingreso validado.
PESOS = {
    "moderado": ({"OK FACTURAR con documento de ingresos": 1.0, "OK FACTURAR sin documento": 0.8, "OK FACTURAR CONDICIONADO": 0.8,
                  "Aprobado, aprobado condicionado o pendiente": 0.6, "Sin respuesta": 0.6, "RECHAZADO": 0.3, "otra": 0.6}, 0.6),
    "fuerte": ({"OK FACTURAR con documento de ingresos": 1.0, "OK FACTURAR sin documento": 0.7, "OK FACTURAR CONDICIONADO": 0.7,
                "Aprobado, aprobado condicionado o pendiente": 0.4, "Sin respuesta": 0.4, "RECHAZADO": 0.0, "otra": 0.4}, 0.3),
}


def pesos_de(df, esquema):
    por_grupo, ancla = PESOS[esquema]
    return pd.Series(df.calidad).map(por_grupo).values * np.where(df.igual_pred.values, ancla, 1.0)


ENTRENAMIENTOS = {
    "Todas las respuestas (como hoy)": lambda df: None,
    "Sin rechazados": lambda df: np.where(df.med_resp == "RECHAZADO", 0.0, 1.0),
    "Sin el ancla: la etiqueta igual al predictor con peso 0,3": lambda df: np.where(df.igual_pred, 0.3, 1.0),
    "Pesos por calidad, moderado": lambda df: pesos_de(df, "moderado"),
    "Pesos por calidad, fuerte (sin rechazados)": lambda df: pesos_de(df, "fuerte"),
}
CALIBRACIONES = {
    "sin calibrar": None,
    "con todos los casos que entrenan": lambda tr: np.ones(len(tr), bool),
    "con OK FACTURAR y condicionado": lambda tr: tr.med_resp.isin(c.OK_FACTURAR).values,
    "con OK FACTURAR y condicionado editados": lambda tr: (tr.med_resp.isin(c.OK_FACTURAR) & ~tr.igual_pred).values,
}


def modelo_de(d, nivel, nombre):
    """Cuantiles hacia adelante y fuera de muestra (de los casos que entrenan) de un entrenamiento. Un peso 0 saca al caso del entrenamiento: así
    «sin rechazados» es el de la fase 0 (sección 5) y comparte su validación cruzada guardada."""
    cols = c.NIVELES[nivel]
    w = ENTRENAMIENTOS[nombre](d.antes)
    if w is None:
        return d.antes, lb.adelante(d, nivel), lb.fuera_de_muestra(d, cols)
    entra = w > 0
    tr = d.antes[entra].reset_index(drop=True)
    w = w[entra]
    if (w == 1).all():  # sólo saca casos: sin pesos, igual que la fase 0
        Q = lb.con_copia(d, f"d3-adelante-{lb.clave(cols)}-{len(tr)}", lambda: lb.cuantiles_adelante(d, cols, tr))
        return tr, Q, lb.fuera_de_muestra(d, cols, tr, nombre="sin-rechazados")
    clave_w = lb.clave([nombre]) + f"-{len(tr)}"
    cat = c.categorias_de(tr)
    Q = lb.con_copia(d, f"d3-adelante-{lb.clave(cols)}-{clave_w}", lambda: c.predecir(entrenar_con_pesos(c.matriz(tr, cols, cat), tr.y, w), c.matriz(d.te, cols, cat)))
    oof = lb.con_copia(d, f"d3-oof-{lb.clave(cols)}-{clave_w}", lambda: cruzada_con_pesos(tr, cols, w))
    return tr, Q, oof


def cobertura_por_estado(d, m90):
    r = d.te.med_resp
    grupos = {"OK FACTURAR": r == "OK FACTURAR", "OK FACTURAR CONDICIONADO": r == "OK FACTURAR CONDICIONADO",
              "Aprobado, aprobado condicionado o pendiente": r.isin(["APROBADO", "APROBADO CONDICIONADO", "PENDIENTE"]), "Sin respuesta": r.isna(),
              "RECHAZADO": r == "RECHAZADO"}
    return {g: 100 * float((d.real[m.values] >= m90[m.values]).mean()) for g, m in grupos.items()}


# ---------------------------------------------------------------- la decisión de la capacidad de pago (la de `linea_base.seccion_7`)
class Capacidad:
    def __init__(self, d, idx):
        self.par = lb.leer_parametros_ts()
        prueba = d.te.iloc[idx]
        self.idx = idx
        self.obligaciones_c = lb.redondeo_js(prueba.cuota_fin.values * 100)
        self.escenarios = [(m, p) for p in lb.PLAZOS for m in lb.MONTOS]
        self.cuotas = {e: lb.cuota_primer_mes(e[0], e[1], self.par) for e in self.escenarios}
        self.dec_real = self.decide(d.real[idx])
        self.boot = np.random.default_rng(5).integers(0, len(idx), size=(B, len(idx)))

    def decide(self, ingreso):
        return np.column_stack([lb.alcanza(ingreso, self.obligaciones_c, self.cuotas[e], self.par["cargaMaxima"]) for e in self.escenarios])

    def medir(self, minimo90):
        est = self.decide(np.maximum(minimo90[self.idx], SBU_MEDIO))  # con el límite de medio salario básico, como `linea_base`
        f = {}
        for k, v in (("concordancia", est == self.dec_real), ("alcanza_por_error", est & ~self.dec_real), ("niega_de_mas", ~est & self.dec_real)):
            por_persona = v.mean(1)
            r = 100 * por_persona[self.boot].mean(1)
            f[k], f[k + "_bajo"], f[k + "_alto"] = 100 * float(por_persona.mean()), float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))
        return f


def regla_d3(f, hoy):
    """La regla de D3, fijada antes de medir. «Sin empeorar la agudeza general»: en todas (8.656) la pérdida de cuantiles no sube más de 1% y el
    tramo exacto o vecino no baja más de un punto contra el modelo de hoy."""
    return {"cobertura_ok_entre_90_y_94": 90 <= f["ok_cobertura90"] <= 94,
            "minimo_mas_alto": f["ok_mediana_min90"] > hoy["ok_mediana_min90"],
            "perdida_no_sube_mas_de_1": f["mejora_todas"] >= -1.0,
            "tramo_o_vecino_no_baja_mas_de_1": f["todas_tramo_o_vecino"] >= hoy["todas_tramo_o_vecino"] - 1.0}


def seccion_d3(d):
    filas, md = [], []
    capacidad = Capacidad(d, d.ok)
    for nivel in (1, 2):
        base = lb.MedidasLB(lb.adelante(d, nivel), d.real)
        filas_nivel = []
        for nombre in ENTRENAMIENTOS:
            tr, Q, oof = modelo_de(d, nivel, nombre)
            sin_cal = lb.MedidasLB(Q, d.real)
            mej = {s: lb.mejora_relativa(sin_cal, base, idx) for s, idx in d.subs.items()}
            for cal, regla in CALIBRACIONES.items():
                if regla is None:
                    m, c90 = sin_cal, None
                else:
                    sel = regla(tr)
                    c90, c85 = (corrimiento(oof[sel], tr.unver.values[sel], q, q, "logaritmo") for q in (0.10, 0.15))
                    m = lb.MedidasLB(Q, d.real, minimo90=aplicar(Q, 0.10, c90, "logaritmo"), minimo85=aplicar(Q, 0.15, c85, "logaritmo"))
                f = {"nivel": nivel, "entrenamiento": nombre, "calibracion": cal, "personas": len(tr),
                     "corrimiento90": c90, "casos_de_calibracion": int(regla(tr).sum()) if regla else 0}
                for s, idx in d.subs.items():
                    r = m.con_intervalos(idx, B=B) if s != "OK FACTURAR y condicionado, editadas" else m.calcular(idx)
                    pre = {"todas": "todas_", "OK FACTURAR y condicionado": "ok_", "OK FACTURAR y condicionado, editadas": "editadas_"}[s]
                    f |= {pre + k: v for k, v in r.items()}
                    f[f"mejora_{pre[:-1]}"], f[f"mejora_{pre[:-1]}_bajo"], f[f"mejora_{pre[:-1]}_alto"] = mej[s]
                f["cobertura_por_estado"] = cobertura_por_estado(d, m.q10)
                f["capacidad"] = capacidad.medir(m.q10)
                filas_nivel.append(f)
            print(f"  D3 nivel {nivel}: {nombre} listo", flush=True)
        hoy = filas_nivel[0]
        for f in filas_nivel:
            f["regla"] = regla_d3(f, hoy)
            f["sigue"] = all(f["regla"].values())
        filas += filas_nivel
        md.append(f"#### Nivel {nivel}: hacia adelante (pérdida y tramo en todas, n = {c.miles(len(d.te))}; cobertura y mínimo en OK FACTURAR y condicionado, n = {c.miles(len(d.ok))})\n\n" + tabla_md(filas_nivel, [
            ("Entrenado con", lambda f: f"{f['entrenamiento']} ({c.miles(f['personas'])})"), ("Calibrado", lambda f: f["calibracion"]),
            ("Pérdida en todas: baja (IC 95%)", lambda f: f"{coma(f['mejora_todas'])}% ({coma(f['mejora_todas_bajo'])} a {coma(f['mejora_todas_alto'])})"),
            ("Pérdida en OK: baja", lambda f: f"{coma(f['mejora_ok'])}% ({coma(f['mejora_ok_bajo'])} a {coma(f['mejora_ok_alto'])})"),
            ("Tramo exacto o vecino, todas", lambda f: pct(f["todas_tramo_o_vecino"])),
            ("Cobertura en OK (IC 95%)", lambda f: ic(f, "ok_cobertura90")), ("Mínimo mediano en OK", lambda f: coma(f["ok_mediana_min90"], 0)),
            ("Cobertura en OK editadas", lambda f: pct(f["editadas_cobertura90"])), ("Cobertura en todas", lambda f: pct(f["todas_cobertura90"])),
            ("Cobertura en rechazados", lambda f: pct(f["cobertura_por_estado"]["RECHAZADO"])),
            ("«Alcanza» por error / niega de más (OK)", lambda f: f"{coma(f['capacidad']['alcanza_por_error'])} / {coma(f['capacidad']['niega_de_mas'])}"),
            ("Sigue", lambda f: "sí" if f["sigue"] else "no: " + ", ".join(k.replace("_", " ") for k, v in f["regla"].items() if not v))]))
    return {"pesos": {k: {"por_grupo": v[0], "ancla": v[1]} for k, v in PESOS.items()}, "filas": filas}, "\n\n".join(md)


# ================================================================ D2: la alerta para pedir documentos
# El alumno: el de 12.28 (`r5_7_destilacion_viabilidad.py`, R² 0,79 contra el predictor), con las variables de cada nivel y los mismos parámetros, entrenado con
# todas las consultas de titulares anteriores a julio con predictor (una por persona, la más reciente) y sin ninguna persona de la prueba.
PAR_ALUMNO = dict(objective="regression", n_estimators=300, learning_rate=0.06, num_leaves=63, min_child_samples=40, subsample=0.8, subsample_freq=1,
                  colsample_bytree=0.8, verbose=-1, n_jobs=16, bagging_seed=3, feature_fraction_seed=2, data_random_seed=1)


def consultas_anteriores(d):
    """Todas las consultas de titulares con solicitud anteriores a julio, una por persona, con las variables de los dos niveles y la cifra del predictor."""
    if not hasattr(d, "_amplia"):
        a = preparar.armar_consultas(duckdb.connect(), solo_con_ingreso_validado=False, antes_de=c.CORTE_FECHA)
        a = a.merge(d.consultas[["id_consulta_equifax", "pred"]], on="id_consulta_equifax", how="left", validate="one_to_one")
        a["anio_mes"] = a.t.dt.year + (a.t.dt.month - 1) / 12
        de_prueba = set(d.te.identificacion)
        d._amplia = a[~a.identificacion.isin(de_prueba)].reset_index(drop=True)
        print(f"  consultas de titulares anteriores a julio (una por persona, sin las personas de la prueba): {c.miles(len(d._amplia))}", flush=True)
    return d._amplia


def alumno(d, nivel):
    import lightgbm as lgb
    cols = c.NIVELES[nivel]

    def calcular():
        a = consultas_anteriores(d)
        a = a[a.pred > 0].reset_index(drop=True)
        cat = c.categorias_de(a)
        m = lgb.LGBMRegressor(**PAR_ALUMNO).fit(c.matriz(a, cols, cat), np.log(a.pred), categorical_feature=[k for k in cols if k in c.CATEGORICAS])
        return np.column_stack([m.predict(c.matriz(d.te, cols, cat)), np.full(len(d.te), len(a))])
    r = lb.con_copia(d, f"d2-alumno-{lb.clave(cols)}", calcular)
    return r[:, 0], int(r[0, 1])


def auc(puntaje, evento):
    """Área bajo la curva ROC con rangos (Mann-Whitney): la probabilidad de que un caso con el evento tenga un puntaje mayor que uno sin él."""
    n1 = evento.sum()
    n0 = len(evento) - n1
    if n1 == 0 or n0 == 0:
        return np.nan
    return float((rankdata(puntaje)[evento].sum() - n1 * (n1 + 1) / 2) / (n1 * n0))


def auc_con_ic(puntaje, evento, semilla=5):
    rng = np.random.default_rng(semilla)
    r = [auc(puntaje[ii], evento[ii]) for ii in (rng.integers(0, len(evento), len(evento)) for _ in range(B))]
    return auc(puntaje, evento), float(np.nanpercentile(r, 2.5)), float(np.nanpercentile(r, 97.5))


def captura(puntaje, evento, fraccion):
    """Si se piden documentos al `fraccion` de casos con el puntaje más alto: qué parte de los eventos se atrapa y qué parte de los pedidos es un evento."""
    corte = np.quantile(puntaje, 1 - fraccion)
    alerta = puntaje >= corte
    return 100 * float(evento[alerta].sum() / max(evento.sum(), 1)), 100 * float(evento[alerta].mean())


def seccion_d2(d):
    filas, alumnos = [], {}
    for nivel in (1, 2):
        Q = lb.adelante(d, nivel)
        oof = lb.fuera_de_muestra(d, c.NIVELES[nivel])
        sel = d.antes.med_resp.isin(c.OK_FACTURAR).values
        c90 = corrimiento(oof[sel], d.antes.unver.values[sel], 0.10, 0.10, "logaritmo")
        minimos = {"mínimo de hoy (sin calibrar)": np.exp(Q[:, I10]), "mínimo calibrado con OK FACTURAR y condicionado": aplicar(Q, 0.10, c90, "logaritmo")}
        la, n_alumno = alumno(d, nivel)
        lp = np.log(d.te.pred.where(d.te.pred > 0).values)
        con_pred = np.isfinite(lp)
        r2_al = 1 - ((lp[con_pred] - la[con_pred]) ** 2).sum() / ((lp[con_pred] - lp[con_pred].mean()) ** 2).sum()
        alumnos[f"nivel{nivel}"] = {"personas_que_entrenan": n_alumno, "r2_contra_el_predictor_hacia_adelante": float(r2_al),
                                    "dentro_25": 100 * float((np.abs(np.exp(la - lp)[con_pred] - 1) <= 0.25).mean())}
        senales = {
            "alumno: nuestra mediana sobre la del alumno": Q[:, I50] - la,
            "alumno: nuestro mínimo sobre la del alumno": Q[:, I10] - la,
            "techo, la cifra de Equifax: nuestra mediana sobre ella": Q[:, I50] - lp,
            "techo, la cifra de Equifax: nuestro mínimo sobre ella": Q[:, I10] - lp,
            "referencia sin Equifax: sólo nuestro mínimo": Q[:, I10],
        }
        for nombre_min, m90 in minimos.items():
            evento_todo = d.real < m90
            for s, idx in d.subs.items():
                ii = np.intersect1d(idx, np.where(con_pred)[0])  # las mismas personas para todas las señales: las que tienen la cifra
                ev = evento_todo[ii]
                for nombre_s, sen in senales.items():
                    a, lo, hi = auc_con_ic(sen[ii], ev)
                    cap20, prec20 = captura(sen[ii], ev, 0.20)
                    filas.append({"nivel": nivel, "minimo": nombre_min, "subconjunto": s, "senal": nombre_s, "casos": len(ii), "eventos": int(ev.sum()),
                                  "tasa_de_eventos": 100 * float(ev.mean()), "auc": a, "auc_bajo": lo, "auc_alto": hi, "captura_20": cap20, "precision_20": prec20})
        print(f"  D2 nivel {nivel} listo (alumno: R² {r2_al:.3f} contra el predictor hacia adelante)", flush=True)
    for f in filas:
        f["sigue"] = bool(f["senal"].startswith("alumno") and f["auc"] >= 0.65)
    md = [f"El alumno contra la cifra de Equifax, hacia adelante (personas de la prueba con la cifra): " + "; ".join(
        f"{k.replace('nivel', 'nivel ')}: R² {coma(v['r2_contra_el_predictor_hacia_adelante'], 3)}, dentro de ±25% {pct(v['dentro_25'])}, entrenado con {c.miles(v['personas_que_entrenan'])}" for k, v in alumnos.items()) + "."]
    for nivel in (1, 2):
        for nombre_min in ("mínimo calibrado con OK FACTURAR y condicionado", "mínimo de hoy (sin calibrar)"):
            sub = [f for f in filas if f["nivel"] == nivel and f["minimo"] == nombre_min]
            md.append(f"#### Nivel {nivel}, {nombre_min}: ¿la señal anticipa que el ingreso validado quede bajo el mínimo?\n\n" + tabla_md(sub, [
                ("Casos", lambda f: f"{f['subconjunto']} ({c.miles(f['casos'])}; {c.miles(f['eventos'])} bajo el mínimo, {pct(f['tasa_de_eventos'])})"),
                ("Señal", lambda f: f["senal"]), ("AUC (IC 95%)", lambda f: f"{coma(f['auc'], 3)} ({coma(f['auc_bajo'], 3)} a {coma(f['auc_alto'], 3)})"),
                ("Pidiendo documentos al 20%: atrapa / acierta", lambda f: f"{pct(f['captura_20'])} / {pct(f['precision_20'])}")]))
    return {"alumnos": alumnos, "filas": filas}, "\n\n".join(md)


# ================================================================ D1: el maestro etiqueta las consultas sin ingreso validado
# Las consultas de titulares anteriores a julio, con el bloque del SRI y la cifra del predictor de Equifax, que no tienen ingreso validado (ni total validado
# ni flujos). No se puede pedir «independientes»: la relación de dependencia de AWS sale de la misma validación y viene vacía en todas ellas (la primera
# corrida filtró por independiente y no encontró ninguna). Dos poblaciones: todas, y sólo las que tienen RUC (como el 85% de los independientes que
# entrenan; el aporte al IESS no los separa: 40% de los que entrenan aporta). Dos etiquetas: la cifra tal cual, y la cifra recalibrada (log ingreso = a +
# b·log cifra, ajustado con los que sí tienen etiqueta) más un desvío sorteado de los de ellos, para que la etiqueta tenga la dispersión de un ingreso y no
# la de un predictor. Peso 0,5: son etiquetas de segunda.
PESO_D1 = 0.5


def seccion_d1(d):
    a = consultas_anteriores(d)
    entrenan = set(d.antes.identificacion)
    sin_validar = a[a.sri_bloque & (a.pred > 0) & ~(a.med_ivt > 0) & ~(a.unver > 0) & ~a.identificacion.isin(entrenan)].reset_index(drop=True)
    poblaciones = {"todas": sin_validar, "con RUC": sin_validar[sin_validar.sri_ruc == 1].reset_index(drop=True)}
    ok_tr = d.antes.pred > 0
    lx, ly = np.log(d.antes.pred[ok_tr].values), d.antes.y[ok_tr].values
    b, a0 = np.polyfit(lx, ly, 1)
    desvios = ly - (a0 + b * lx)
    filas = []
    for nivel in (1, 2):
        cols = c.NIVELES[nivel]
        base = lb.MedidasLB(lb.adelante(d, nivel), d.real)
        f0 = {"nivel": nivel, "poblacion": "ninguna", "etiqueta": "sólo las que tienen ingreso validado (como hoy)", "agregadas": 0}
        for s, idx in d.subs.items():
            r = base.calcular(idx)
            f0 |= {f"{s}|perdida": r["perdida"], f"{s}|cobertura90": r["cobertura90"], f"{s}|tramo_o_vecino": r["tramo_o_vecino"], f"{s}|mejora": (0.0, 0.0, 0.0)}
        filas.append(f0)
        for pob, sin in poblaciones.items():
            rng = np.random.default_rng(13)
            etiquetas = {
                "la cifra del predictor tal cual": np.log(sin.pred.values),
                "la cifra recalibrada más un desvío sorteado": a0 + b * np.log(sin.pred.values) + rng.choice(desvios, len(sin)),
            }
            for nombre, y in etiquetas.items():
                tr = pd.concat([d.antes.assign(peso=1.0), sin.assign(y=y, peso=PESO_D1)], ignore_index=True)
                cat = c.categorias_de(tr)
                Q = lb.con_copia(d, f"d1-{lb.clave(cols)}-{lb.clave([pob, nombre])}-{len(sin)}",
                                 lambda: c.predecir(entrenar_con_pesos(c.matriz(tr, cols, cat), tr.y, tr.peso.values), c.matriz(d.te, cols, cat)))
                m = lb.MedidasLB(Q, d.real)
                f = {"nivel": nivel, "poblacion": pob, "etiqueta": nombre, "agregadas": len(sin)}
                for s, idx in d.subs.items():
                    r = m.calcular(idx)
                    f |= {f"{s}|perdida": r["perdida"], f"{s}|cobertura90": r["cobertura90"], f"{s}|tramo_o_vecino": r["tramo_o_vecino"], f"{s}|mejora": lb.mejora_relativa(m, base, idx)}
                f["sigue"] = bool(f["todas|mejora"][0] >= 2.0 and f["todas|cobertura90"] >= f0["todas|cobertura90"])
                filas.append(f)
        print(f"  D1 nivel {nivel} listo", flush=True)
    sin = poblaciones["todas"]
    md = [f"Consultas sin ingreso validado que se agregan: {c.miles(len(sin))} (anteriores a julio, con el bloque del SRI y la cifra de Equifax, que no entrenan hoy; "
          f"{c.miles(len(poblaciones['con RUC']))} con RUC; {pct(100 * float((sin.aporte > 0).mean()))} aporta al IESS; respuesta vacía en {pct(100 * float(sin.med_resp.isna().mean()))}). "
          f"Recalibración con los {c.miles(int(ok_tr.sum()))} que entrenan: log ingreso = {coma(a0, 3)} + {coma(b, 3)} × log cifra."]
    for nivel in (1, 2):
        md.append(f"#### Nivel {nivel}, hacia adelante\n\n" + tabla_md([f for f in filas if f["nivel"] == nivel], [
            ("Agregadas", lambda f: f"{f['poblacion']} ({c.miles(f['agregadas'])})"), ("Etiqueta de las agregadas", lambda f: f["etiqueta"]),
            ("Pérdida en todas: baja (IC 95%)", lambda f: f"{coma(f['todas|mejora'][0])}% ({coma(f['todas|mejora'][1])} a {coma(f['todas|mejora'][2])})"),
            ("Pérdida en OK: baja", lambda f: f"{coma(f['OK FACTURAR y condicionado|mejora'][0])}%"),
            ("Cobertura en todas / en OK", lambda f: f"{coma(f['todas|cobertura90'])} / {coma(f['OK FACTURAR y condicionado|cobertura90'])}"),
            ("Tramo exacto o vecino, todas", lambda f: pct(f["todas|tramo_o_vecino"])),
            ("Sigue", lambda f: "—" if "sigue" not in f else ("sí" if f["sigue"] else "no"))]))
    return {"agregadas": {k: len(v) for k, v in poblaciones.items()}, "aportan_al_iess": 100 * float((sin.aporte > 0).mean()),
            "respuesta_vacia": 100 * float(sin.med_resp.isna().mean()), "recalibracion": {"a": float(a0), "b": float(b)}, "peso": PESO_D1, "filas": filas}, "\n\n".join(md)


# ================================================================ armado
SECCIONES = {"etiqueta": ("La calidad de la etiqueta", seccion_etiqueta), "d3": ("D3: quitar el ancla de la etiqueta", seccion_d3),
             "d2": ("D2: una alerta para pedir documentos", seccion_d2), "d1": ("D1: el maestro etiqueta las consultas sin ingreso validado", seccion_d1)}


def main():
    t0 = time.time()
    solo = next((a.split("=")[1] for a in sys.argv if a.startswith("--solo=")), None)
    pedidas = solo.split(",") if solo else list(SECCIONES)
    d = DatosD()
    SALIDA.mkdir(parents=True, exist_ok=True)
    print(f"{c.miles(len(d.antes))} para entrenar, {c.miles(len(d.te))} para probar ({c.miles(len(d.ok))} en OK FACTURAR y condicionado, {c.miles(len(d.editadas))} de ellos editados)", flush=True)
    for n in pedidas:
        titulo, funcion = SECCIONES[n]
        t1 = time.time()
        datos, md = funcion(d)
        (SALIDA / f"{n}.json").write_text(json.dumps(lb.limpiar(datos), ensure_ascii=False, indent=1), encoding="utf-8")
        (SALIDA / f"{n}.md").write_text(f"### {titulo}\n\n{md}\n", encoding="utf-8")
        print(f"{titulo} lista en {time.time() - t1:.0f} s", flush=True)
    todas, informe = {}, []
    for n, (titulo, _) in SECCIONES.items():
        ruta = SALIDA / f"{n}.json"
        if ruta.exists():
            todas[n] = {"titulo": titulo, **json.loads(ruta.read_text(encoding="utf-8"))}
            informe.append((SALIDA / f"{n}.md").read_text(encoding="utf-8"))
    meta = {"descripcion": "Fase 4 de la revisión del predictor de ingresos: destilación con propósito (D3, D2 y D1). Sólo agregados.",
            "entrenamiento": f"{len(d.antes)} personas con consulta anterior al {c.CORTE_FECHA.date()}",
            "prueba": f"{len(d.te)} personas de julio a octubre de 2026, {len(d.ok)} en OK FACTURAR y condicionado, {len(d.editadas)} de ellas con la etiqueta editada",
            "remuestreos": B, "versiones": c.versiones(), "huella_tabla": d.huella, "corrida": time.strftime("%Y-%m-%d %H:%M"), "modo_rapido": lb.RAPIDO}
    if not lb.RAPIDO:
        METRICAS.write_text(json.dumps(lb.limpiar({"meta": meta, **todas}), ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"métricas -> {METRICAS}")
    (SALIDA / "destilacion.md").write_text("\n\n".join(informe), encoding="utf-8")
    print(f"listo en {time.time() - t0:.0f} s -> {SALIDA / 'destilacion.md'}")


if __name__ == "__main__":
    main()
