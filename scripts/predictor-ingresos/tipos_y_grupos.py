# Tipos de persona y agrupaciones en el predictor de ingresos (2026-11-10; investigación, 12.36). El negocio decidió el 2026-11-09 una estimación
# para todos, por tipo de persona y con la confiabilidad de cada tipo (especificación, 3.5), y el 2026-11-10 pidió buscar con k-medias y métodos
# parecidos agrupaciones que mejoren el predictor. Esto MIDE: no cambia `ingreso-v2`, el modelo exportado ni la función.
#
# Todo sobre `ingreso-v2` (12.35): el nivel 1 (`n1`) y el nivel 2 entrenado desde febrero (`n2_feb`), calibrados con OK FACTURAR y condicionado,
# y siempre hacia adelante con el marco de la fase 0 (linea_base.py): entrenado hasta junio, probado de julio a octubre.
#
#   A  Confiabilidad por tipo: los independientes formal, semiformal y poco formal con el SRI de Equifax, quien no tiene RUC o lo tiene
#      suspendido, los rentistas (flujos de arriendo) y el ingreso extra del dependiente, ahora con el SRI.
#   B  Agrupaciones: k-medias, mezcla de gaussianas y k-medoides con la distancia de Gower (datos mixtos) de 2 a 12 grupos, elegidos por estabilidad
#      y silueta; un árbol corto sobre el error del modelo y grupos por las hojas del modelo; y para qué sirve cada una.
#   C  Lo que leería el modelo de lenguaje: si la probabilidad de superar cada umbral está bien calibrada, y si «el declarado queda por encima de lo
#      que el predictor cree probable» anticipa que el validado termine por debajo del declarado.
#
# Reglas fijadas ANTES de medir (las de la tarea, más lo que hacía falta para que fueran una decisión):
#   variable        El grupo como variable del modelo sigue si la pérdida de cuantiles hacia adelante, en todas, baja 1% o más y su IC 95% no toca el 0.
#   por grupo       Un modelo por grupo (los grupos con menos de 1.000 casos de entrenamiento usan el único) contra el único: la misma regla.
#   conforme        La calibración por grupo sigue si la cobertura del mínimo del 90% en OK FACTURAR y condicionado queda entre 88% y 92% en cada grupo
#                   con 100 casos OK de prueba o más, sin perder agudeza general: el mínimo mediano en OK no baja más de 2% y el «alcanza» por error
#                   no supera el aceptado (1,2% en el nivel 1, 1% en el 2; 12.34). Y si la calibración única no lo lograba ya: si cada grupo
#                   ya quedaba en la banda con ella, calibrar por grupo no agrega nada.
#   grados          El grado por el ancho del rango sirve si el tramo exacto o vecino crece de grado en grado, del más ancho al más angosto, y los dos
#                   extremos se separan 10 puntos o más con intervalos que no se tocan.
#   tipos           Las reglas de tipo separan grupos que el modelo estima distinto si el valor central mediano de dos tipos vecinos difiere con
#                   intervalos que no se tocan. Un tipo con menos de 300 casos de prueba se informa junto con el más cercano (por el valor central).
#   extra           El ingreso extra del dependiente se estima con monto sólo si, en quienes tienen RUC activo, saber quién lo tiene da AUC de 0,75 o más,
#                   el monto R² de 0,25 o más y el tramo del total sube un punto o más. Si no, «sin indicios; se valida con documentos».
#   probabilidad    La probabilidad de superar un umbral está bien calibrada si el error de calibración esperado (ECE) es de 0,05 o menos en cada
#                   umbral, en todas.
#   declarado       La señal sirve de alerta si su AUC es de 0,65 o más (la regla de D2, 12.34) y supera en 0,03 o más al declarado solo.
#
#   python -I scripts/predictor-ingresos/tipos_y_grupos.py [--solo=A,B,C] [--rapido] [--recalcular]
#
# Lee la tabla por persona (preparar.py), las extracciones de AWS ya bajadas y las copias de `ingreso_v2.py`. No consulta a nadie. A git va sólo
# `metricas/tipos-y-grupos-2026-11.json`, con agregados de grupos de 50 personas o más; las tablas completas quedan en RESULTADOS/tipos-y-grupos/.
import hashlib
import json
import sys
import time
from pathlib import Path

import duckdb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
import ingreso_v2 as iv2
import linea_base as lb
import preparar
from calibrar import aplicar, corrimiento
from destilacion import auc
from medir import coma, tabla_md

SALIDA = c.RESULTADOS / "tipos-y-grupos"
COPIAS = SALIDA / ("copias-rapido" if lb.RAPIDO else "copias")  # con --rapido los grupos salen de menos remuestreos: no se mezclan
METRICAS = Path(__file__).resolve().parent / "metricas" / "tipos-y-grupos-2026-11.json"
B = lb.B
BG = lb.B_GRUPO
NIVELES = {1: "n1", 2: "n2_feb"}
MIN_PRUEBA = 300          # un tipo con menos casos de prueba se informa junto con el más cercano
MIN_OK_PRUEBA = 100       # un grupo con menos casos OK de prueba no se juzga en la regla de la calibración por grupo
MIN_OK_CALIBRAR = 100     # un grupo con menos casos OK de entrenamiento usa el corrimiento único
MIN_MODELO_PROPIO = 1000  # un grupo con menos casos de entrenamiento usa el modelo único
MIN_JSON = 50             # un grupo con menos personas no lleva medianas de montos al JSON
ALCANZA_MAXIMO = {1: 1.2, 2: 1.0}
K_RANGO = range(2, 13)
REMUESTREOS_K = 4 if lb.RAPIDO else 8
POZO = 1500 if lb.RAPIDO else 4000  # personas de entrenamiento sobre las que se mide la estabilidad y la silueta
I10, I50, I90 = (c.LEV.index(x) for x in (0.10, 0.50, 0.90))
pct = lb.pct


def h(*partes):
    return hashlib.sha1("|".join(map(str, partes)).encode()).hexdigest()[:12]


def copia(nombre, calcular):
    """Lo caro va a disco con la huella de lo que lo define; `--recalcular` lo rehace."""
    COPIAS.mkdir(parents=True, exist_ok=True)
    ruta = COPIAS / f"{nombre}.npz"
    if ruta.exists() and "--recalcular" not in sys.argv:
        z = np.load(ruta, allow_pickle=False)
        return {k: z[k] for k in z.files}
    r = calcular()
    np.savez(ruta, **r)
    return r


# ================================================================ datos
class Datos(iv2.DatosV2):
    """Los datos de `ingreso_v2.py` más lo que sólo sirve para medir: el ingreso verificado y el total, los arriendos, lo declarado y la tabla de
    dependientes. Las identificaciones se usan en memoria para cruzar y no se escriben."""

    def __init__(self):
        super().__init__()
        con = duckdb.connect()
        a = preparar.armar_consultas(con)
        leer = preparar.leer
        cat = preparar.CATEGORIA_RECUPERADO
        flujos = con.execute(f"""select id_persona_requerimiento,
            sum(case when estado and ingreso>0 and upper(coalesce(observacion_categoria,'')) not like 'RECUPERADO {cat}%'
                      and (fuente_ingreso='ARRIENDOS' or macroactividad='ARRIENDOS') then ingreso else 0 end) arr_f
            from {leer('ingresos_por_actividad')} where tipo_deudor='TITULAR' group by 1""").df()
        # Lo declarado: el ingreso que la persona declaró en la solicitud (`persona_ingreso_declarado`) y el primer monto de cada flujo no verificado
        # (el que entró antes de que el analista lo tocara, `flujos_historial`). El monto declarado del flujo no sirve: es el validado en el 96%.
        declarado = con.execute(f"""select id_persona_requerimiento, try_cast(persona_ingreso_declarado as double) decl
            from {leer('datos_por_persona_requerimiento')} where tipo_deudor='TITULAR'""").df().drop_duplicates("id_persona_requerimiento")
        primero = con.execute(f"""select f.id_persona_requerimiento, sum(try_cast(h.monto_primera as double)) prim
            from {leer('flujos_historial')} h join {leer('ingresos_por_actividad')} f on f.id_flujo_efectivo = h.id_flujo_efectivo
            where f.tipo_deudor='TITULAR' and upper(coalesce(f.observacion_categoria,'')) not like 'RECUPERADO {cat}%' group by 1""").df()
        a = a.merge(flujos, on="id_persona_requerimiento", how="left").merge(declarado, on="id_persona_requerimiento", how="left") \
             .merge(primero, on="id_persona_requerimiento", how="left")
        por_consulta = a.drop_duplicates("id_consulta_equifax").set_index("id_consulta_equifax")
        for df in (self.antes, self.te):
            for x, y in (("ver_f", "ingreso_verificado"), ("tot_f", "ingreso_total"), ("arr_f", "arriendos"), ("decl", "declarado"), ("prim", "primer_monto")):
                df[y] = df.id_consulta_equifax.map(por_consulta[x]).values
        # Dependientes con sueldo verificado del IESS y el bloque del SRI (12.14 con el SRI). El sueldo verificado entra como variable: en producción
        # se conoce. Se nombra `sueldo_iess` porque `ver_*` es un prefijo que `comun.verificar_entradas` corta.
        dep = a[a.sri_bloque & (a.rel == "DEPENDIENTE") & (a.ver_f > 0)].copy()
        dep["sueldo_iess"] = np.log(dep.ver_f)
        dep["anio_mes"] = dep.t.dt.year + (dep.t.dt.month - 1) / 12
        dep["con_extra"] = dep.unver > 0
        self.dep = dep.drop(columns=["identificacion", "id_persona_requerimiento"]).reset_index(drop=True)
        self.base_te = lb.MedidasLB(np.tile(self.base, (len(self.te), 1)), self.real)


def entrenar(tr, cols, extra_cat=()):
    """Los doce cuantiles con los parámetros de `comun.py`; `extra_cat` son columnas nuevas que van como categóricas (el grupo)."""
    import lightgbm as lgb
    cat = c.categorias_de(tr, list(c.CATEGORICAS) + list(extra_cat))
    X = c.matriz(tr, cols, cat)
    cats = [x for x in cols if x in c.CATEGORICAS or x in extra_cat]
    modelos = [lgb.LGBMRegressor(objective="quantile", alpha=q, n_estimators=c.N_ARBOLES, **c.PAR).fit(X, tr.y, categorical_feature=cats) for q in c.LEV]
    return modelos, cat


def predecir(modelos, cat, df, cols):
    return c.predecir(modelos, c.matriz(df, cols, cat))


def preparar_niveles(d):
    N = {}
    for nivel, k in NIVELES.items():
        tr, r = iv2.correr(d, k)
        cal = iv2.calibracion_de(tr, r["fuera"])
        cols = iv2.VARIANTES[k][2]
        N[nivel] = {"k": k, "tr": tr, "Q": r["adelante"], "oof": r["fuera"], "cal": cal, "cols": cols,
                    "m": iv2.medidas(r["adelante"], d.real, cal), "mo": iv2.medidas(r["fuera"], tr.unver.values, cal),
                    "ok_tr": tr.med_resp.isin(c.OK_FACTURAR).values}
    return N


def modelos_de(d, N, nivel):
    """Los modelos del nivel reentrenados (para aplicarlos a otra población). Deben dar los mismos cuantiles que la copia de `ingreso_v2.py`."""
    if "modelos" not in N[nivel]:
        mod, cat = entrenar(N[nivel]["tr"], N[nivel]["cols"])
        dif = float(np.abs(predecir(mod, cat, d.te, N[nivel]["cols"]) - N[nivel]["Q"]).max())
        print(f"  nivel {nivel} reentrenado: diferencia con la copia de ingreso_v2 {dif:.1e} en logaritmo", flush=True)
        N[nivel]["modelos"], N[nivel]["cat"], N[nivel]["dif_reentrenado"] = mod, cat, dif
    return N[nivel]["modelos"], N[nivel]["cat"]


# ================================================================ medidas de un grupo
def ic_media(v, B=BG, semilla=5):
    v = np.asarray(v, float)
    if len(v) == 0:
        return np.nan, np.nan, np.nan
    rng = np.random.default_rng(semilla)
    r = v[rng.integers(0, len(v), size=(B, len(v)))].mean(1)
    return float(v.mean()), float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))


def medir_grupo(d, m, idx, minimo90=None, capacidad=False):
    """Lo que dice la confiabilidad de un grupo: cobertura del mínimo (en OK y en todas), agudeza contra el mínimo fijo, tramo exacto o vecino,
    el sesgo del valor central y, si se pide, la decisión de la capacidad de pago en sus OK."""
    q10 = m.q10 if minimo90 is None else minimo90
    idx = np.asarray(idx)
    ok = np.intersect1d(idx, d.ok)
    cubre = d.real >= q10
    central = np.exp(m.Q[:, I50])
    r = {"casos": len(idx), "casos_ok": len(ok)}
    for k, ii in (("ok", ok), ("todas", idx)):
        r[f"cobertura_{k}"], r[f"cobertura_{k}_bajo"], r[f"cobertura_{k}_alto"] = (100 * x for x in ic_media(cubre[ii])) if len(ii) else (np.nan,) * 3
    if len(idx) >= 30:
        r["agudeza"], r["agudeza_bajo"], r["agudeza_alto"] = lb.mejora_relativa(m, d.base_te, idx, B=BG)
        r["tramo_o_vecino"], r["tramo_o_vecino_bajo"], r["tramo_o_vecino_alto"] = (100 * x for x in ic_media(m.vecino[idx]))
        r["tramo_exacto"] = 100 * float(m.acierto_tramo[idx].mean())
        s = np.log(d.real[idx] / central[idx])
        r["sesgo_log"], r["sesgo_log_bajo"], r["sesgo_log_alto"] = lb.ic_mediana(s, np.arange(len(s)))
        r["central_mediano"], r["central_mediano_bajo"], r["central_mediano_alto"] = lb.ic_mediana(central, idx)
        r["ancho_mediano_log"] = float(np.median(m.Q[idx, I90] - m.Q[idx, I10]))
    if len(ok):
        r["minimo_mediano_ok"] = float(np.median(q10[ok]))
    if capacidad and len(ok) >= 30:
        cap = iv2.Capacidad(d, ok).medir(q10)
        r["alcanza_por_error"], r["niega_de_mas"] = cap["alcanza_por_error"], cap["niega_de_mas"]
    return r


def sin_montos_chicos(r):
    """Un grupo chico no lleva medianas de montos al JSON: con pocas personas, una mediana es casi un monto individual."""
    if r.get("casos", 0) < MIN_JSON:
        return {k: v for k, v in r.items() if not k.startswith(("central_mediano", "minimo_mediano"))}
    return r


# ================================================================ A) tipos de persona
TIPOS = ["formal", "semiformal", "poco formal", "RUC no activo", "sin RUC", "rentista"]


def tipo_de(df, con_rentista=True):
    """Las reglas propuestas de 3.5 con lo que trae AWS. Del SRI de Equifax hay RUC, estado, obligado a llevar contabilidad, clase y CIIU; no hay
    nómina que paga, ISD, establecimientos ni renta causada. Por eso: formal = RUC activo y obligado; semiformal = RUC activo, no obligado, régimen
    general («OTROS» o especial); poco formal = RUC activo en RIMPE o RISE. El rentista (arriendos la mitad o más de lo no verificado) va primero."""
    ruc, act, obl = df.sri_ruc == 1, df.sri_estado == "ACTIVO", df.sri_obligado == 1
    # El rentista sale de los flujos (la composición de la etiqueta): sirve para medir cómo se lo estima, no como variable ni como grupo de
    # calibración, que verían la respuesta. En B3 va con su tipo del SRI.
    rentista = ((df.arriendos.fillna(0) / df.unver) >= 0.5) & con_rentista
    t = np.select([rentista, df.sri_ruc == 0, ruc & ~act, ruc & act & obl, ruc & act & df.sri_clase.isin(["RIMPE", "RISE"]), ruc & act],
                  ["rentista", "sin RUC", "RUC no activo", "formal", "poco formal", "semiformal"], "sin dato")
    return pd.Series(t, index=df.index)


def seccion_A(d, N):
    tipo_te = tipo_de(d.te).values
    conteos = {t: int((tipo_te == t).sum()) for t in TIPOS + ["sin dato"]}
    filas, separan, juntos = [], [], []
    for nivel in N:
        m = N[nivel]["m"]
        res = {t: medir_grupo(d, m, np.where(tipo_te == t)[0], capacidad=True) for t in TIPOS if (tipo_te == t).any()}
        res["todos los independientes"] = medir_grupo(d, m, d.todas, capacidad=True)
        # Los chicos, con el más cercano por el valor central mediano (del nivel 1, para que la juntura sea la misma en los dos niveles).
        for t in TIPOS:
            if 0 < conteos[t] < MIN_PRUEBA:
                grandes = [g for g in TIPOS if conteos[g] >= MIN_PRUEBA]
                ref = {g: medir_grupo(d, N[1]["m"], np.where(tipo_te == g)[0])["central_mediano"] for g in grandes + [t]}
                cerca = min(grandes, key=lambda g: abs(np.log(ref[g]) - np.log(ref[t])))
                idx = np.where(np.isin(tipo_te, [t, cerca]))[0]
                res[f"{t} junto con {cerca}"] = medir_grupo(d, m, idx, capacidad=True)
                if nivel == 1:
                    juntos.append({"tipo": t, "casos": conteos[t], "junto_con": cerca})
        for nombre, r in res.items():
            filas.append({"nivel": nivel, "tipo": nombre, **sin_montos_chicos(r)})
        # ¿Separan? El valor central mediano de cada par de tipos con 300 casos o más: intervalos que no se tocan.
        grandes = [t for t in TIPOS if conteos[t] >= MIN_PRUEBA]
        for i, a in enumerate(grandes):
            for b in grandes[i + 1:]:
                ra, rb = res[a], res[b]
                distinto = ra["central_mediano_alto"] < rb["central_mediano_bajo"] or rb["central_mediano_alto"] < ra["central_mediano_bajo"]
                cob = ra["cobertura_ok_alto"] < rb["cobertura_ok_bajo"] or rb["cobertura_ok_alto"] < ra["cobertura_ok_bajo"] if ra["casos_ok"] and rb["casos_ok"] else None
                separan.append({"nivel": nivel, "a": a, "b": b, "central_a": ra["central_mediano"], "central_b": rb["central_mediano"],
                                "estima_distinto": bool(distinto), "cobertura_ok_distinta": cob})
    # Los rentistas: cuántos son en la tabla y en cada nivel, y cuántos tienen algún arriendo aunque sea menos de la mitad.
    rent = {"con_algun_arriendo_entrenamiento": int((d.antes.arriendos.fillna(0) > 0).sum()), "con_algun_arriendo_prueba": int((d.te.arriendos.fillna(0) > 0).sum()),
            "rentistas_entrenamiento": int((tipo_de(d.antes) == "rentista").sum()), "rentistas_prueba": conteos["rentista"]}
    return {"conteos_prueba": conteos, "filas": filas, "separan": separan, "juntos": juntos, "rentistas": rent}, tipo_te


# ---------------------------------------------------------------- A) el ingreso extra del dependiente
DEP_D0 = ["edad", "genero", "anio_mes", "sueldo_iess"]
DEP_SETS = {
    "edad, sexo, fecha y sueldo del IESS": DEP_D0,
    "lo anterior y el buró, sin SRI (como 12.14)": DEP_D0 + c.BURO + c.CUOTA,
    "edad, sexo, fecha, sueldo y SRI de Proveedor_Info_1, sin buró (nivel 1)": DEP_D0 + c.SRI_PROVEEDOR_INFO_1,
    "todo: SRI de Proveedor_Info_1 y de Equifax y buró (nivel 2)": DEP_D0 + c.SRI_PROVEEDOR_INFO_1 + c.SRI_EQUIFAX + c.BURO + c.CUOTA,
}


def auc_ic(p, e, B=B, semilla=5):
    p, e = np.asarray(p, float), np.asarray(e, bool)
    rng = np.random.default_rng(semilla)
    r = [auc(p[ii], e[ii]) for ii in (rng.integers(0, len(e), len(e)) for _ in range(B))]
    return auc(p, e), float(np.nanpercentile(r, 2.5)), float(np.nanpercentile(r, 97.5))


def r2(y, f):
    return float(1 - ((y - f) ** 2).sum() / ((y - y.mean()) ** 2).sum())


def seccion_A_dependientes(d, N):
    import lightgbm as lgb
    dep = d.dep
    tr = dep[dep.t < c.CORTE_FECHA].reset_index(drop=True)
    te = dep[dep.t >= c.CORTE_FECHA].reset_index(drop=True)
    ruc_activo = ((te.sri_ruc == 1) & (te.sri_estado == "ACTIVO")).values
    subs = {"todos": np.ones(len(te), bool), "con RUC activo": ruc_activo}
    tramo_solo_iess = np.digitize(te.ver_f.values, c.UMB) == np.digitize(te.tot_f.values, c.UMB)
    filas = []
    for nombre, cols in DEP_SETS.items():
        c.verificar_entradas(cols)
        cat = c.categorias_de(tr)
        Xtr, Xte = c.matriz(tr, cols, cat), c.matriz(te, cols, cat)
        cats = [x for x in cols if x in c.CATEGORICAS]
        clf = lgb.LGBMClassifier(n_estimators=c.N_ARBOLES, **c.PAR).fit(Xtr, tr.con_extra, categorical_feature=cats)
        p = clf.predict_proba(Xte)[:, 1]
        con = tr.con_extra.values
        reg = lgb.LGBMRegressor(n_estimators=c.N_ARBOLES, **c.PAR).fit(Xtr[con], np.log(tr.unver.values[con]), categorical_feature=cats)
        monto = np.exp(reg.predict(Xte))
        total_est = te.ver_f.values + np.where(p >= 0.5, monto, 0)
        acierto_tramo = np.digitize(total_est, c.UMB) == np.digitize(te.tot_f.values, c.UMB)
        for s, sel in subs.items():
            e = te.con_extra.values[sel]
            a, lo, hi = auc_ic(p[sel], e)
            ce = sel & te.con_extra.values
            y = np.log(te.unver.values[ce])
            f = np.log(monto[ce])
            filas.append({"variables": nombre, "casos": int(sel.sum()), "con_extra": 100 * float(e.mean()), "auc": a, "auc_bajo": lo, "auc_alto": hi,
                          "r2_monto": r2(y, f) if len(y) > 30 else np.nan, "error_mediano_monto": 100 * float(np.median(np.abs(np.exp(f - y) - 1))) if len(y) else np.nan,
                          "tramo_total_solo_iess": 100 * float(tramo_solo_iess[sel].mean()), "tramo_total_con_extra": 100 * float(acierto_tramo[sel].mean())})
    # El modelo de independientes (lo que hoy recibiría el extra de un dependiente): cobertura del mínimo calibrado y agudeza sobre el extra.
    aplicado = []
    ce = te.con_extra.values
    yext = te.unver.values[ce]
    tr_ext = tr.unver.values[tr.con_extra.values]
    base = np.tile(np.quantile(np.log(tr_ext), c.LEV), (ce.sum(), 1))
    for nivel in N:
        mod, cat = modelos_de(d, N, nivel)
        Q = predecir(mod, cat, te[ce], N[nivel]["cols"])
        m = lb.MedidasLB(Q, yext, minimo90=aplicar(Q, 0.10, N[nivel]["cal"]["c90"], "logaritmo"))
        mb = lb.MedidasLB(base, yext)
        for s, sel in subs.items():
            ii = np.where(sel[ce])[0]
            if len(ii) < 30:
                continue
            ag = lb.mejora_relativa(m, mb, ii, B=BG)
            cub = ic_media(yext[ii] >= m.q10[ii])
            aplicado.append({"nivel": nivel, "casos": s, "n": len(ii), "cobertura": 100 * cub[0], "cobertura_bajo": 100 * cub[1], "cobertura_alto": 100 * cub[2],
                             "agudeza_contra_el_extra_sin_variables": ag[0], "agudeza_bajo": ag[1], "agudeza_alto": ag[2], "r2": m.calcular(ii)["r2"],
                             "minimo_sobre_extra_mediano": float(np.median(m.q10[ii] / yext[ii]))})
    ruc = next(f for f in filas if f["variables"].startswith("todo") and f["casos"] == int(ruc_activo.sum()))
    regla = {"auc_ruc_activo": ruc["auc"], "r2_ruc_activo": ruc["r2_monto"], "sube_tramo": ruc["tramo_total_con_extra"] - ruc["tramo_total_solo_iess"]}
    regla["sigue"] = bool(regla["auc_ruc_activo"] >= 0.75 and regla["r2_ruc_activo"] >= 0.25 and regla["sube_tramo"] >= 1)
    return {"entrenamiento": len(tr), "prueba": len(te), "con_extra_entrenamiento": 100 * float(tr.con_extra.mean()),
            "con_ruc_activo_prueba": int(ruc_activo.sum()), "filas": filas, "modelo_de_independientes": aplicado, "regla": regla}


# ================================================================ B) agrupaciones sin supervisión
MONTOS = ["cred_mayor", "cred_12m", "cred_24m", "deuda_total", "valor_creditos", "saldos_vig", "deuda_actual", "deuda_3m", "saldo", "cuota_fin", "h12", "h6", "hact",
          "c_consumo", "c_tarjeta", "c_micro", "c_vivienda", "c_comercial", "c_educativo", "s_consumo", "s_tarjeta", "s_micro", "s_vivienda", "c_codeudor"]
CONTEOS = ["n_inst", "n_creditos", "n_oper", "n_consumo", "n_tarjeta", "n_micro", "n_vivienda", "max_mora", "max_dias_t", "g6", "g12"]
ESPACIOS = {
    1: {"num": ["edad", "sri_antig", "sri_susp"], "bin": ["sri_ruc", "sri_obligado"], "cat": ["genero", "sri_estado"]},
    2: {"num": ["edad", "sri_antig", "sri_susp"] + MONTOS + CONTEOS, "bin": ["sri_ruc", "sri_obligado"], "cat": ["genero", "sri_estado", "sri_clase", "sri_ciiu_secc"]},
}
# Los vacíos son información (quien no tiene crédito no tiene operaciones): un indicador por bloque, no uno por columna, para que veinte columnas
# vacías a la vez no pesen veinte veces.
BLOQUES = {"sin_sri": "sri_estado", "sin_buro": "n_oper", "sin_cuota": "cuota_fin", "sin_credito_mayor": "cred_mayor"}


class Espacio:
    """Las variables de un nivel en números (para k-medias y la mezcla de gaussianas) y en forma mixta (para Gower). Se ajusta con el entrenamiento."""

    def __init__(self, tr, nivel):
        self.e = ESPACIOS[nivel]
        self.nivel = nivel
        self.bloques = {k: v for k, v in BLOQUES.items() if v in self.e["num"] + self.e["cat"]}
        n = self._num(tr)
        self.media, self.desvio = n.mean(), n.std().replace(0, 1)
        self.cats = {x: tr[x].astype("object").fillna("sin dato").value_counts().index[:8].tolist() for x in self.e["cat"]}
        self.rango_min, self.rango = n.min(), (n.max() - n.min()).replace(0, 1)

    def _num(self, df):
        # A float64: algunas columnas del extracto vienen como enteros con vacíos (pd.NA), que numpy no convierte.
        n = pd.DataFrame({x: pd.to_numeric(df[x], errors="coerce").astype("float64") for x in self.e["num"] + self.e["bin"]}, index=df.index)
        for x in self.e["num"]:
            if x in MONTOS:
                n[x] = np.log1p(n[x].clip(lower=0))
        return n

    def _cat(self, df, x):
        v = df[x].astype("object").fillna("sin dato")
        return v.where(v.isin(self.cats[x]), "otra")

    def numerico(self, df):
        n = ((self._num(df) - self.media) / self.desvio).fillna(0)
        partes = [n.values]
        partes.append(np.column_stack([df[col].isna().values.astype(float) for col in self.bloques.values()]) if self.bloques else np.zeros((len(df), 0)))
        for x in self.e["cat"]:
            v = self._cat(df, x)
            partes.append(np.column_stack([(v == k).values.astype(float) for k in self.cats[x] + ["otra"]]))
        return np.hstack(partes)

    def mixto(self, df):
        """Numéricas en [0, 1] por el rango del entrenamiento (vacías como NaN: Gower las saltea) más los indicadores y las categorías como códigos."""
        n = ((self._num(df) - self.rango_min) / self.rango).clip(0, 1)
        ind = np.column_stack([df[col].isna().values.astype(float) for col in self.bloques.values()]) if self.bloques else np.zeros((len(df), 0))
        cat = np.column_stack([pd.Categorical(self._cat(df, x), categories=self.cats[x] + ["otra"]).codes for x in self.e["cat"]])
        return np.hstack([n.values, ind]).astype("float32"), cat.astype("int16")


def gower(A, B):
    """Distancia de Gower entre las filas de A y de B (tuplas numéricas y categóricas de `Espacio.mixto`): promedio de las distancias por variable,
    salteando la numérica vacía en cualquiera de los dos."""
    (an, ac), (bn, bc) = A, B
    suma = np.zeros((len(an), len(bn)), "float32")
    cuenta = np.zeros((len(an), len(bn)), "float32")
    for j in range(an.shape[1]):
        dd = np.abs(an[:, j][:, None] - bn[:, j][None, :])
        valido = ~np.isnan(dd)
        suma += np.where(valido, dd, 0)
        cuenta += valido
    for j in range(ac.shape[1]):
        suma += (ac[:, j][:, None] != bc[:, j][None, :])
        cuenta += 1
    return suma / np.maximum(cuenta, 1)


def k_medoides(D, k, semilla, iteraciones=30):
    """k-medoides por alternancia sobre una matriz de distancias: siembra como k-medias++ y, en cada grupo, el medoide que minimiza la suma."""
    rng = np.random.default_rng(semilla)
    n = len(D)
    med = [int(rng.integers(n))]
    for _ in range(1, k):
        dmin = D[:, med].min(1) ** 2
        med.append(int(rng.choice(n, p=dmin / dmin.sum())) if dmin.sum() > 0 else int(rng.integers(n)))
    med = np.array(med)
    for _ in range(iteraciones):
        et = D[:, med].argmin(1)
        nuevo = med.copy()
        for g in range(k):
            miembros = np.where(et == g)[0]
            if len(miembros):
                nuevo[g] = miembros[D[np.ix_(miembros, miembros)].sum(1).argmin()]
        if (nuevo == med).all():
            break
        med = nuevo
    return med


class Metodo:
    """Ajusta con un subconjunto y asigna a cualquiera, para medir la estabilidad con remuestreos y para la agrupación final."""

    def __init__(self, nombre, esp):
        self.nombre, self.esp = nombre, esp

    def ajustar(self, df, k, semilla):
        from sklearn.cluster import KMeans
        from sklearn.mixture import GaussianMixture
        if self.nombre == "k-medias":
            self.m = KMeans(k, n_init=4, random_state=semilla).fit(self.esp.numerico(df))
        elif self.nombre == "mezcla de gaussianas":
            self.m = GaussianMixture(k, covariance_type="diag", reg_covar=1e-3, max_iter=300, random_state=semilla).fit(self.esp.numerico(df))
        else:
            X = self.esp.mixto(df)
            med = k_medoides(gower(X, X), k, semilla)
            self.medoides = (X[0][med], X[1][med])
        return self

    def asignar(self, df):
        if self.nombre == "k-medoides con Gower":
            X = self.esp.mixto(df)
            return np.concatenate([gower((X[0][i:i + 2000], X[1][i:i + 2000]), self.medoides).argmin(1) for i in range(0, len(df), 2000)])
        return self.m.predict(self.esp.numerico(df))


def elegir_k(metodo, pozo, D_pozo, Xnum_pozo):
    """Para cada k: estabilidad (índice de Rand ajustado medio entre remuestreos del 80% del pozo, asignando el pozo entero) y silueta en el pozo.
    Se elige el k con más silueta entre los que tienen estabilidad de 0,75 o más; si ninguno, el más estable."""
    from sklearn.metrics import adjusted_rand_score, silhouette_score
    rng = np.random.default_rng(13)
    filas = []
    for k in K_RANGO:
        et = []
        for s in range(REMUESTREOS_K):
            sub = pozo.iloc[rng.choice(len(pozo), int(0.8 * len(pozo)), replace=False)]
            et.append(metodo.ajustar(sub, k, s).asignar(pozo))
        ari = [adjusted_rand_score(et[i], et[j]) for i in range(len(et)) for j in range(i + 1, len(et))]
        final = metodo.ajustar(pozo, k, 0).asignar(pozo)
        if len(np.unique(final)) < 2:
            sil = np.nan
        elif metodo.nombre == "k-medoides con Gower":
            sil = float(silhouette_score(D_pozo, final, metric="precomputed"))
        else:
            sil = float(silhouette_score(Xnum_pozo, final))
        filas.append({"k": k, "estabilidad": float(np.mean(ari)), "estabilidad_min": float(np.min(ari)), "silueta": sil,
                      "grupo_mas_chico": float(np.bincount(final).min() / len(final))})
    estables = [f for f in filas if f["estabilidad"] >= 0.75 and np.isfinite(f["silueta"])]
    elegido = max(estables, key=lambda f: f["silueta"])["k"] if estables else max(filas, key=lambda f: f["estabilidad"])["k"]
    return filas, elegido


def describir(d, df, et, real, Q):
    """Cada grupo en lo que mira un analista: tamaño, RUC y régimen, obligado, buró, cuota, edad, actividad e ingreso. Sólo agregados."""
    filas = []
    for g in np.unique(et):
        s = df[et == g]
        n = len(s)
        cuota = s.cuota_fin[s.cuota_fin > 0] if "cuota_fin" in s else pd.Series(dtype=float)
        ciiu = s.sri_ciiu_secc.value_counts(normalize=True)
        f = {"grupo": int(g), "personas": n, "porcentaje": 100 * n / len(df), "edad_mediana": float(s.edad.median()),
             "mujeres": 100 * float((s.genero == "FEMENINO").mean()), "con_ruc_activo": 100 * float(((s.sri_ruc == 1) & (s.sri_estado == "ACTIVO")).mean()),
             "sin_ruc": 100 * float((s.sri_ruc == 0).mean()), "obligado": 100 * float((s.sri_obligado == 1).mean()), "rimpe": 100 * float((s.sri_clase == "RIMPE").mean()),
             "sin_buro": 100 * float(s.n_oper.isna().mean()), "sin_deuda_vigente": 100 * float((s.cuota_fin.fillna(0) <= 0).mean()),
             "con_hipotecario": 100 * float((s.c_vivienda.fillna(0) > 0).mean()), "con_microcredito": 100 * float((s.c_micro.fillna(0) > 0).mean()),
             "antiguedad_ruc_mediana": float(s.sri_antig.median()) if s.sri_antig.notna().any() else None,
             "actividad_mas_comun": f"{ciiu.index[0]} ({100 * ciiu.iloc[0]:.0f}%)" if len(ciiu) else None}
        if n >= MIN_JSON:
            f["cuota_mediana_con_deuda"] = float(cuota.median()) if len(cuota) else None
            f["ingreso_mediano"] = float(np.median(real[et == g]))
            f["central_mediano"] = float(np.median(np.exp(Q[et == g, I50])))
        filas.append(f)
    return filas


def seccion_B1(d, N):
    from sklearn.metrics import adjusted_rand_score
    salida, grupos = {}, {}
    for nivel in N:
        tr = N[nivel]["tr"]
        esp = Espacio(tr, nivel)
        rng = np.random.default_rng(7)
        pozo = tr.iloc[rng.choice(len(tr), min(POZO, len(tr)), replace=False)].reset_index(drop=True)
        D_pozo = gower(*[esp.mixto(pozo)] * 2)
        Xnum = esp.numerico(pozo)
        salida[nivel] = {}
        for nombre in ("k-medias", "mezcla de gaussianas", "k-medoides con Gower"):
            t0 = time.time()
            met = Metodo(nombre, esp)
            filas, k = elegir_k(met, pozo, D_pozo, Xnum)
            met.ajustar(pozo if nombre == "k-medoides con Gower" else tr, k, 0)
            et_tr, et_te = met.asignar(tr), met.asignar(d.te)
            grupos[(nivel, nombre)] = (et_tr, et_te)
            salida[nivel][nombre] = {"por_k": filas, "k_elegido": k, "grupos": describir(d, d.te, et_te, d.real, N[nivel]["Q"])}
            print(f"  B1 nivel {nivel} {nombre}: k={k} ({time.time() - t0:.0f} s)", flush=True)
        # ¿Se parecen entre sí las tres agrupaciones? Rand ajustado en la prueba.
        ms = list(salida[nivel])
        salida[nivel]["parecido_entre_metodos"] = [{"a": a, "b": b, "rand_ajustado": float(adjusted_rand_score(grupos[(nivel, a)][1], grupos[(nivel, b)][1]))}
                                                   for i, a in enumerate(ms) for b in ms[i + 1:]]
    return salida, grupos


# ================================================================ B) agrupaciones con supervisión
def a_tabla(df, cols):
    """Para los árboles de scikit-learn: numéricas con sus vacíos (los árboles los aceptan) y categóricas en indicadores."""
    partes = []
    for x in cols:
        if x == "anio_mes":
            continue
        if x in c.CATEGORICAS:
            v = df[x].astype("object").fillna("sin dato")
            for k in v.value_counts().index[:6]:
                partes.append(pd.Series((v == k).astype(float).values, name=f"{x}={k}"))
        else:
            partes.append(pd.Series(pd.to_numeric(df[x], errors="coerce").values, name=x))
    return pd.concat(partes, axis=1)


def seccion_B2(d, N):
    from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor, export_text
    from sklearn.decomposition import TruncatedSVD
    from sklearn.preprocessing import OneHotEncoder
    salida, grupos = {}, {}
    for nivel in N:
        n = N[nivel]
        tr, mo, m = n["tr"], n["mo"], n["m"]
        Xtr = a_tabla(tr, n["cols"])
        Xte = a_tabla(d.te, n["cols"]).reindex(columns=Xtr.columns, fill_value=0.0)
        salida[nivel] = {}
        fallo_tr = tr.unver.values < mo.q10
        fallo_te = d.real < m.q10
        for nombre, arbol, objetivo in (("árbol sobre la pérdida de cuantiles", DecisionTreeRegressor(max_depth=3, min_samples_leaf=300, random_state=0), mo.perdida),
                                        ("árbol sobre el fallo del mínimo", DecisionTreeClassifier(max_depth=3, min_samples_leaf=300, random_state=0), fallo_tr)):
            arbol.fit(Xtr, objetivo)
            h_tr, h_te = arbol.apply(Xtr), arbol.apply(Xte)
            hojas = np.unique(h_tr)
            mapa = {hh: i for i, hh in enumerate(hojas)}
            et_tr, et_te = np.array([mapa[x] for x in h_tr]), np.array([mapa.get(x, -1) for x in h_te])
            grupos[(nivel, nombre)] = (et_tr, et_te)
            filas = []
            for g in range(len(hojas)):
                a, b = et_tr == g, et_te == g
                filas.append({"hoja": g, "personas_entrenamiento": int(a.sum()), "personas_prueba": int(b.sum()),
                              "perdida_entrenamiento": float(mo.perdida[a].mean()), "perdida_prueba": float(m.perdida[b].mean()) if b.any() else None,
                              "fallo_entrenamiento": 100 * float(fallo_tr[a].mean()), "fallo_prueba": 100 * float(fallo_te[b].mean()) if b.any() else None,
                              "fallo_ok_prueba": 100 * float(fallo_te[np.intersect1d(np.where(b)[0], d.ok)].mean()) if np.intersect1d(np.where(b)[0], d.ok).size else None})
            # ¿Lo que encuentra en el entrenamiento se repite hacia adelante? Correlación de Spearman entre hojas.
            from scipy.stats import spearmanr
            col = "perdida" if "pérdida" in nombre else "fallo"
            pares = [(f[f"{col}_entrenamiento"], f[f"{col}_prueba"]) for f in filas if f[f"{col}_prueba"] is not None]
            salida[nivel][nombre] = {"reglas": export_text(arbol, feature_names=list(Xtr.columns), decimals=1), "hojas": filas,
                                     "se_repite_adelante_spearman": float(spearmanr(*zip(*pares))[0]) if len(pares) > 2 else None}
        # Las hojas del modelo: parecido «según el ingreso». El cuantil 0,50 reentrenado, la hoja de cada árbol en indicadores, 20 dimensiones y k-medias.
        mod, cat = modelos_de(d, N, nivel)
        L_tr = mod[I50].predict(c.matriz(tr, n["cols"], cat), pred_leaf=True)
        L_te = mod[I50].predict(c.matriz(d.te, n["cols"], cat), pred_leaf=True)
        oh = OneHotEncoder(handle_unknown="ignore").fit(L_tr)
        svd = TruncatedSVD(20, random_state=0).fit(oh.transform(L_tr))
        Z_tr, Z_te = svd.transform(oh.transform(L_tr)), svd.transform(oh.transform(L_te))
        from sklearn.cluster import KMeans
        from sklearn.metrics import adjusted_rand_score, silhouette_score
        rng = np.random.default_rng(13)
        pozo = rng.choice(len(Z_tr), min(POZO, len(Z_tr)), replace=False)
        filas = []
        for k in K_RANGO:
            et = []
            for s in range(REMUESTREOS_K):
                sub = rng.choice(pozo, int(0.8 * len(pozo)), replace=False)
                et.append(KMeans(k, n_init=4, random_state=s).fit(Z_tr[sub]).predict(Z_tr[pozo]))
            final = KMeans(k, n_init=4, random_state=0).fit(Z_tr[pozo]).predict(Z_tr[pozo])
            filas.append({"k": k, "estabilidad": float(np.mean([adjusted_rand_score(et[i], et[j]) for i in range(len(et)) for j in range(i + 1, len(et))])),
                          "silueta": float(silhouette_score(Z_tr[pozo], final)), "grupo_mas_chico": float(np.bincount(final).min() / len(final))})
        estables = [f for f in filas if f["estabilidad"] >= 0.75]
        k = max(estables, key=lambda f: f["silueta"])["k"] if estables else max(filas, key=lambda f: f["estabilidad"])["k"]
        km = KMeans(k, n_init=4, random_state=0).fit(Z_tr)
        grupos[(nivel, "hojas del modelo")] = (km.predict(Z_tr), km.predict(Z_te))
        salida[nivel]["hojas del modelo"] = {"por_k": filas, "k_elegido": k, "grupos": describir(d, d.te, km.predict(Z_te), d.real, n["Q"])}
        print(f"  B2 nivel {nivel}: hojas del modelo k={k}", flush=True)
    return salida, grupos


# ================================================================ B) para qué sirve cada agrupación
def grados_por_ancho(N, nivel, cortes=3):
    """El ancho entre los cuantiles 0,10 y 0,90 (en logaritmo); los cortes salen de las predicciones fuera de muestra del entrenamiento. Grado 1 =
    el más angosto (se responde con más seguridad)."""
    n = N[nivel]
    w_tr = n["oof"][:, I90] - n["oof"][:, I10]
    w_te = n["Q"][:, I90] - n["Q"][:, I10]
    lim = np.quantile(w_tr, np.linspace(0, 1, cortes + 1)[1:-1])
    return np.digitize(w_tr, lim), np.digitize(w_te, lim), lim


def con_grupo(df, et):
    df = df.copy()
    df["grupo"] = pd.Series(et, index=df.index).astype(str)
    return df


def usos(d, N, nivel, nombre, et_tr, et_te):
    """Las tres pruebas de uso de una agrupación en un nivel: como variable, un modelo por grupo y la calibración por grupo."""
    n = N[nivel]
    tr, cols, Q = n["tr"], n["cols"], n["Q"]
    m_unico = lb.MedidasLB(Q, d.real)
    r = {"agrupacion": nombre, "nivel": nivel, "grupos": int(len(np.unique(et_tr)))}
    clave = h(nivel, nombre, len(tr), d.huella[:12], np.bincount(et_tr + 1).tolist(), np.bincount(et_te + 1).tolist())
    if not nombre.startswith("grados"):
        # Como variable
        z = copia(f"variable-{clave}", lambda: {"Q": predecir(*entrenar(con_grupo(tr, et_tr), cols + ["grupo"], ["grupo"]), con_grupo(d.te, et_te), cols + ["grupo"])})
        r["variable"] = dict(zip(("baja", "bajo", "alto"), lb.mejora_relativa(lb.MedidasLB(z["Q"], d.real), m_unico, d.todas)))
        r["variable"]["sigue"] = bool(r["variable"]["baja"] >= 1 and r["variable"]["bajo"] > 0)

        # Un modelo por grupo
        def por_grupo():
            Qg = Q.copy()
            for g in np.unique(et_tr):
                a, b = et_tr == g, et_te == g
                if a.sum() >= MIN_MODELO_PROPIO and b.any():
                    mod, cat = entrenar(tr[a].reset_index(drop=True), cols)
                    Qg[b] = predecir(mod, cat, d.te[b], cols)
            return {"Q": Qg}
        z = copia(f"por-grupo-{clave}", por_grupo)
        r["por_grupo"] = dict(zip(("baja", "bajo", "alto"), lb.mejora_relativa(lb.MedidasLB(z["Q"], d.real), m_unico, d.todas)))
        r["por_grupo"]["sigue"] = bool(r["por_grupo"]["baja"] >= 1 and r["por_grupo"]["bajo"] > 0)
        r["por_grupo"]["grupos_con_modelo_propio"] = int(sum((et_tr == g).sum() >= MIN_MODELO_PROPIO for g in np.unique(et_tr)))
    # Calibración por grupo (conforme por grupos), contra la única
    m90 = np.empty(len(d.te))
    corr = {}
    for g in np.unique(et_te):
        sel = n["ok_tr"] & (et_tr == g)
        cg = corrimiento(n["oof"][sel], tr.unver.values[sel], 0.10, 0.10, "logaritmo") if sel.sum() >= MIN_OK_CALIBRAR else n["cal"]["c90"]
        corr[int(g)] = (float(cg), int(sel.sum()))
        m90[et_te == g] = aplicar(Q[et_te == g], 0.10, cg, "logaritmo")
    filas = []
    for g in np.unique(et_te):
        idx = np.where(et_te == g)[0]
        ok = np.intersect1d(idx, d.ok)
        f = {"grupo": int(g), "casos": len(idx), "casos_ok": len(ok), "corrimiento": corr[int(g)][0], "casos_ok_para_calibrar": corr[int(g)][1]}
        for etq, mm in (("unica", n["m"].q10), ("por_grupo", m90)):
            cub = ic_media(d.real[ok] >= mm[ok]) if len(ok) else (np.nan,) * 3
            f[f"cobertura_ok_{etq}"], f[f"cobertura_ok_{etq}_bajo"], f[f"cobertura_ok_{etq}_alto"] = (100 * x for x in cub)
            f[f"cobertura_todas_{etq}"] = 100 * float((d.real[idx] >= mm[idx]).mean())
        if nombre.startswith("grados"):
            mm = lb.MedidasLB(Q, d.real)
            f["porcentaje"] = 100 * len(idx) / len(d.te)
            f["tramo_exacto"] = 100 * float(mm.acierto_tramo[idx].mean())
            f["tramo_o_vecino"], f["tramo_o_vecino_bajo"], f["tramo_o_vecino_alto"] = (100 * x for x in ic_media(mm.vecino[idx]))
            f["dentro_25"] = 100 * float((np.abs(np.exp(Q[idx, I50]) - d.real[idx]) / d.real[idx] <= 0.25).mean())
            f["ancho_mediano_log"] = float(np.median(Q[idx, I90] - Q[idx, I10]))
            if len(idx) >= MIN_JSON:
                f["minimo_mediano_ok_unica"] = float(np.median(n["m"].q10[ok])) if len(ok) else None
        filas.append(f)
    juzgables = [f for f in filas if f["casos_ok"] >= MIN_OK_PRUEBA]
    cap_u = d.capacidad.medir(n["m"].q10)
    cap_g = d.capacidad.medir(m90)
    def dispersion(etq):
        w = np.array([f["casos_ok"] for f in juzgables], float)
        v = np.array([f[f"cobertura_ok_{etq}"] for f in juzgables])
        return float((w * np.abs(v - 90)).sum() / w.sum()) if len(w) else None
    cal = {"grupos_juzgables": len(juzgables),
           "en_banda_unica": sum(88 <= f["cobertura_ok_unica"] <= 92 for f in juzgables), "en_banda_por_grupo": sum(88 <= f["cobertura_ok_por_grupo"] <= 92 for f in juzgables),
           "ic_contiene_90_unica": sum(f["cobertura_ok_unica_bajo"] <= 90 <= f["cobertura_ok_unica_alto"] for f in juzgables),
           "ic_contiene_90_por_grupo": sum(f["cobertura_ok_por_grupo_bajo"] <= 90 <= f["cobertura_ok_por_grupo_alto"] for f in juzgables),
           "desvio_medio_de_90_unica": dispersion("unica"), "desvio_medio_de_90_por_grupo": dispersion("por_grupo"),
           "cobertura_ok_unica": 100 * float((d.real[d.ok] >= n["m"].q10[d.ok]).mean()), "cobertura_ok_por_grupo": 100 * float((d.real[d.ok] >= m90[d.ok]).mean()),
           "minimo_mediano_ok_unica": float(np.median(n["m"].q10[d.ok])), "minimo_mediano_ok_por_grupo": float(np.median(m90[d.ok])),
           "alcanza_por_error_unica": cap_u["alcanza_por_error"], "alcanza_por_error_por_grupo": cap_g["alcanza_por_error"],
           "niega_de_mas_unica": cap_u["niega_de_mas"], "niega_de_mas_por_grupo": cap_g["niega_de_mas"]}
    cal["cumple"] = bool(juzgables and cal["en_banda_por_grupo"] == len(juzgables)
                         and cal["minimo_mediano_ok_por_grupo"] >= 0.98 * cal["minimo_mediano_ok_unica"]
                         and round(cal["alcanza_por_error_por_grupo"], 1) <= ALCANZA_MAXIMO[nivel])
    # Si la calibración única ya deja cada grupo en la banda, calibrar por grupo no agrega nada: a igualdad, gana lo simple.
    cal["unica_ya_cumple"] = bool(juzgables and cal["en_banda_unica"] == len(juzgables))
    cal["sigue"] = bool(cal["cumple"] and not cal["unica_ya_cumple"])
    r["calibracion"] = cal
    r["por_grupo_detalle"] = [sin_montos_chicos({**f, "casos": f["casos"]}) for f in filas]
    if nombre.startswith("grados"):
        ext = sorted(filas, key=lambda f: f["grupo"])
        sube = all(ext[i]["tramo_o_vecino"] >= ext[i + 1]["tramo_o_vecino"] for i in range(len(ext) - 1))
        r["grados"] = {"monotono": bool(sube), "diferencia_extremos": ext[0]["tramo_o_vecino"] - ext[-1]["tramo_o_vecino"],
                       "intervalos_separados": bool(ext[0]["tramo_o_vecino_bajo"] > ext[-1]["tramo_o_vecino_alto"])}
        r["grados"]["sirve"] = bool(sube and r["grados"]["diferencia_extremos"] >= 10 and r["grados"]["intervalos_separados"])
    return r


def seccion_B3(d, N, tipo_te, grupos):
    filas = []
    for nivel in N:
        tipo_tr = tipo_de(N[nivel]["tr"], con_rentista=False).values
        tipo_te_sin = tipo_de(d.te, con_rentista=False).values
        cod = {t: i for i, t in enumerate(TIPOS + ["sin dato"])}
        lista = [("tipos de persona (A, sin rentista)", np.array([cod[x] for x in tipo_tr]), np.array([cod[x] for x in tipo_te_sin]))]
        lista += [(nombre, *et) for (nv, nombre), et in grupos.items() if nv == nivel]
        for k in (3, 4):
            a, b, lim = grados_por_ancho(N, nivel, k)
            lista.append((f"grados por el ancho del rango ({k})", a, b))
        for nombre, a, b in lista:
            t0 = time.time()
            filas.append(usos(d, N, nivel, nombre, a, b))
            print(f"  B3 nivel {nivel} {nombre}: {time.time() - t0:.0f} s", flush=True)
    return filas


# ================================================================ C) lo que leería el modelo de lenguaje
BORDES = np.linspace(0, 1, 11)


def cdf_por_fila(Q, t):
    """`comun.cdf` con un monto distinto por fila (la misma interpolación entre cuantiles y las mismas colas)."""
    L = np.array(c.LEV)
    lt = np.log(t)[:, None]
    K = Q.shape[1]
    idx = (Q <= lt).sum(1)
    lo, hi = np.clip(idx - 1, 0, K - 1), np.clip(idx, 0, K - 1)
    ql = np.take_along_axis(Q, lo[:, None], 1)[:, 0]
    qh = np.take_along_axis(Q, hi[:, None], 1)[:, 0]
    fr = np.where(qh > ql, (lt[:, 0] - ql) / np.where(qh > ql, qh - ql, 1), 0.0)
    p = L[lo] + fr * (L[hi] - L[lo])
    return np.where(idx == 0, L[0] / 2, np.where(idx == K, (1 + L[-1]) / 2, p))


def curva(p, o):
    b = np.clip(np.digitize(p, BORDES[1:-1]), 0, 9)
    filas = []
    ece = 0.0
    for i in range(10):
        s = b == i
        if s.any():
            filas.append({"desde": BORDES[i], "hasta": BORDES[i + 1], "casos": int(s.sum()), "dicha": float(p[s].mean()), "observada": float(o[s].mean())})
            ece += s.mean() * abs(p[s].mean() - o[s].mean())
    return filas, float(ece)


def ece_ic(p, o, B=200, semilla=5):
    rng = np.random.default_rng(semilla)
    r = [curva(p[ii], o[ii])[1] for ii in (rng.integers(0, len(p), len(p)) for _ in range(B))]
    return float(np.percentile(r, 2.5)), float(np.percentile(r, 97.5))


def seccion_C(d, N, tipo_te):
    from sklearn.isotonic import IsotonicRegression
    from sklearn.linear_model import LogisticRegression
    prob, alerta = [], []
    for nivel in N:
        n = N[nivel]
        tr = n["tr"]
        for u in c.UMB:
            p = 1 - c.cdf(n["Q"], u)
            o = d.real > u
            p_oof, o_tr = 1 - c.cdf(n["oof"], u), tr.unver.values > u
            iso = IsotonicRegression(out_of_bounds="clip", y_min=0, y_max=1).fit(p_oof, o_tr)
            p_iso = iso.predict(p)
            for s, idx in (("todas", d.todas), ("OK FACTURAR y condicionado", d.ok)):
                filas, ece = curva(p[idx], o[idx])
                lo, hi = ece_ic(p[idx], o[idx])
                _, ece_iso = curva(p_iso[idx], o[idx])
                prob.append({"nivel": nivel, "umbral": u, "casos": s, "n": len(idx), "frecuencia": 100 * float(o[idx].mean()), "dicha_media": 100 * float(p[idx].mean()),
                             "ece": ece, "ece_bajo": lo, "ece_alto": hi, "brier": float(((p[idx] - o[idx]) ** 2).mean()),
                             "brier_constante": float(((o_tr.mean() - o[idx]) ** 2).mean()), "ece_con_isotonica": ece_iso, "curva": filas})
            for t in TIPOS:
                idx = np.where(tipo_te == t)[0]
                if len(idx) >= MIN_PRUEBA:
                    prob.append({"nivel": nivel, "umbral": u, "casos": f"tipo: {t}", "n": len(idx), "frecuencia": 100 * float(o[idx].mean()),
                                 "dicha_media": 100 * float(p[idx].mean()), "ece": curva(p[idx], o[idx])[1]})
        # El declarado contra lo que el predictor cree probable.
        for que, monto, evento_de, nota in (
                ("ingreso declarado en la solicitud", "declarado", lambda df: df.ingreso_total.values < 0.95 * df.declarado.values,
                 "evento: el validado total queda 5% o más por debajo del declarado; puntaje: probabilidad de que lo no verificado quede por debajo del declarado menos lo verificado"),
                ("primer monto de los flujos no verificados", "primer_monto", lambda df: df.unver.values < 0.95 * df.primer_monto.values,
                 "evento: lo validado no verificado queda 5% o más por debajo del primer monto cargado; puntaje: probabilidad de quedar por debajo de ese monto")):
            def puntaje(df, Q):
                x = np.nan_to_num(df[monto].values - (df.ingreso_verificado.fillna(0).values if monto == "declarado" else 0))
                return np.where(x > 0, cdf_por_fila(Q, np.maximum(x, 1)), 0.0)
            con_te = (d.te[monto].fillna(0) > 0).values
            con_tr = (tr[monto].fillna(0) > 0).values
            p_te, p_tr = puntaje(d.te, n["Q"]), puntaje(tr, n["oof"])
            e_te, e_tr = evento_de(d.te), evento_de(tr)
            # El declarado solo, y el declarado con el puntaje en una logística entrenada con lo de antes de julio (fuera de muestra).
            X = lambda df, p: np.column_stack([np.log(df[monto].values), p])
            lr = LogisticRegression().fit(X(tr[con_tr], p_tr[con_tr]), e_tr[con_tr])
            p_comb = np.zeros(len(d.te))
            p_comb[con_te] = lr.predict_proba(X(d.te[con_te], p_te[con_te]))[:, 1]
            for s, idx in (("todas", d.todas), ("OK FACTURAR y condicionado", d.ok)):
                ii = np.intersect1d(idx, np.where(con_te)[0])
                ev = e_te[ii]
                a = auc_ic(p_te[ii], ev)
                b = auc_ic(d.te[monto].values[ii], ev)
                cb = auc_ic(p_comb[ii], ev)
                f = {"nivel": nivel, "que": que, "nota": nota, "casos": s, "n": len(ii), "evento": 100 * float(ev.mean()),
                     "auc_predictor": a[0], "auc_predictor_bajo": a[1], "auc_predictor_alto": a[2], "auc_declarado_solo": b[0], "auc_declarado_solo_bajo": b[1],
                     "auc_declarado_solo_alto": b[2], "auc_los_dos": cb[0], "auc_los_dos_bajo": cb[1], "auc_los_dos_alto": cb[2]}
                f["sirve"] = bool(f["auc_predictor"] >= 0.65 and f["auc_predictor"] - f["auc_declarado_solo"] >= 0.03)
                alerta.append(f)
    regla = {nivel: bool(all(f["ece"] <= 0.05 for f in prob if f["nivel"] == nivel and f["casos"] == "todas")) for nivel in N}
    return {"probabilidad": prob, "bien_calibrada_por_nivel": regla, "declarado": alerta}


# ================================================================ el informe
def informe(d, r):
    md = [f"Hacia adelante: {c.miles(len(d.antes))} para entrenar (el nivel 2, desde febrero), {c.miles(len(d.te))} de julio a octubre para probar "
          f"({c.miles(len(d.ok))} en OK FACTURAR y condicionado). Remuestreos: {B} (por grupo, {BG})."]
    if "A" in r:
        A = r["A"]
        md.append("## A. Confiabilidad por tipo de persona\n\nCasos de prueba por tipo: " + ", ".join(f"{k} {c.miles(v)}" for k, v in A["conteos_prueba"].items()))
        md.append(tabla_md(A["filas"], [
            ("Nivel", lambda f: str(f["nivel"])), ("Tipo", lambda f: f["tipo"]), ("Casos (OK)", lambda f: f"{c.miles(f['casos'])} ({c.miles(f['casos_ok'])})"),
            ("Cobertura en OK", lambda f: f"{coma(f.get('cobertura_ok'))} ({coma(f.get('cobertura_ok_bajo'))} a {coma(f.get('cobertura_ok_alto'))})"),
            ("Cobertura en todas", lambda f: f"{coma(f.get('cobertura_todas'))} ({coma(f.get('cobertura_todas_bajo'))} a {coma(f.get('cobertura_todas_alto'))})"),
            ("Agudeza", lambda f: f"{coma(f.get('agudeza'))}% ({coma(f.get('agudeza_bajo'))} a {coma(f.get('agudeza_alto'))})"),
            ("Tramo exacto o vecino", lambda f: f"{coma(f.get('tramo_o_vecino'))} ({coma(f.get('tramo_o_vecino_bajo'))} a {coma(f.get('tramo_o_vecino_alto'))})"),
            ("Valor central mediano", lambda f: f"{coma(f.get('central_mediano'), 0)} ({coma(f.get('central_mediano_bajo'), 0)} a {coma(f.get('central_mediano_alto'), 0)})"),
            ("Sesgo (log real/central)", lambda f: coma(f.get("sesgo_log"), 3)), ("Mínimo mediano OK", lambda f: coma(f.get("minimo_mediano_ok"), 0)),
            ("«Alcanza» por error / niega de más", lambda f: f"{coma(f.get('alcanza_por_error'), 2)} / {coma(f.get('niega_de_mas'))}")]))
        md.append("Pares de tipos: ¿el modelo los estima distinto?\n\n" + tabla_md(A["separan"], [
            ("Nivel", lambda f: str(f["nivel"])), ("Par", lambda f: f"{f['a']} / {f['b']}"), ("Centrales", lambda f: f"{coma(f['central_a'], 0)} / {coma(f['central_b'], 0)}"),
            ("Estima distinto", lambda f: "sí" if f["estima_distinto"] else "no"), ("Cobertura OK distinta", lambda f: "sí" if f["cobertura_ok_distinta"] else "no")]))
        md.append(f"Rentistas: {A['rentistas']}. Juntados: {A['juntos']}")
        D = r["A_dependientes"]
        md.append(f"### El ingreso extra del dependiente\n\n{c.miles(D['entrenamiento'])} para entrenar, {c.miles(D['prueba'])} para probar "
                  f"({c.miles(D['con_ruc_activo_prueba'])} con RUC activo); con extra en el entrenamiento: {coma(D['con_extra_entrenamiento'])}%.\n\n" + tabla_md(D["filas"], [
                      ("Variables", lambda f: f["variables"]), ("Casos", lambda f: c.miles(f["casos"])), ("Con extra", lambda f: pct(f["con_extra"])),
                      ("AUC", lambda f: f"{coma(f['auc'], 3)} ({coma(f['auc_bajo'], 3)} a {coma(f['auc_alto'], 3)})"), ("R² del monto", lambda f: coma(f["r2_monto"], 3)),
                      ("Error mediano del monto", lambda f: pct(f["error_mediano_monto"])),
                      ("Tramo del total: sólo IESS / con el extra", lambda f: f"{coma(f['tramo_total_solo_iess'])} / {coma(f['tramo_total_con_extra'])}")])
                  + "\n\nEl modelo de independientes sobre el extra:\n\n" + tabla_md(D["modelo_de_independientes"], [
                      ("Nivel", lambda f: str(f["nivel"])), ("Casos", lambda f: f"{f['casos']} ({c.miles(f['n'])})"),
                      ("Cobertura del mínimo", lambda f: f"{coma(f['cobertura'])} ({coma(f['cobertura_bajo'])} a {coma(f['cobertura_alto'])})"),
                      ("Agudeza contra el extra sin variables", lambda f: f"{coma(f['agudeza_contra_el_extra_sin_variables'])}% ({coma(f['agudeza_bajo'])} a {coma(f['agudeza_alto'])})"),
                      ("R²", lambda f: coma(f["r2"], 3)), ("Mínimo sobre extra (mediana)", lambda f: coma(f["minimo_sobre_extra_mediano"], 2))])
                  + f"\n\nRegla: {D['regla']}")
    if "B1" in r:
        for nombre_sec, sec in (("B1. Sin supervisión", r["B1"]), ("B2. Con supervisión", r["B2"])):
            md.append(f"## {nombre_sec}")
            for nivel, metodos in sec.items():
                for metodo, v in metodos.items():
                    if metodo == "parecido_entre_metodos":
                        md.append(f"Nivel {nivel}, parecido entre métodos: " + "; ".join(f"{x['a']} / {x['b']}: {coma(x['rand_ajustado'], 2)}" for x in v))
                        continue
                    if "por_k" in v:
                        md.append(f"### Nivel {nivel}, {metodo}: k elegido {v['k_elegido']}\n\n" + tabla_md(v["por_k"], [
                            ("k", lambda f: str(f["k"])), ("Estabilidad (Rand ajustado)", lambda f: coma(f["estabilidad"], 3)), ("Silueta", lambda f: coma(f["silueta"], 3)),
                            ("Grupo más chico", lambda f: pct(100 * f["grupo_mas_chico"]))]) + "\n\n" + tabla_md(v["grupos"], [
                            ("Grupo", lambda f: str(f["grupo"])), ("Personas", lambda f: f"{c.miles(f['personas'])} ({coma(f['porcentaje'])}%)"), ("Edad", lambda f: coma(f["edad_mediana"], 0)),
                            ("Mujeres", lambda f: pct(f["mujeres"])), ("RUC activo / sin RUC", lambda f: f"{coma(f['con_ruc_activo'])} / {coma(f['sin_ruc'])}"),
                            ("Obligado / RIMPE", lambda f: f"{coma(f['obligado'])} / {coma(f['rimpe'])}"), ("Sin buró / sin deuda", lambda f: f"{coma(f['sin_buro'])} / {coma(f['sin_deuda_vigente'])}"),
                            ("Hipotecario / micro", lambda f: f"{coma(f['con_hipotecario'])} / {coma(f['con_microcredito'])}"), ("Antigüedad del RUC", lambda f: coma(f["antiguedad_ruc_mediana"])),
                            ("Actividad", lambda f: str(f["actividad_mas_comun"])), ("Cuota mediana", lambda f: coma(f.get("cuota_mediana_con_deuda"), 0)),
                            ("Ingreso mediano / central", lambda f: f"{coma(f.get('ingreso_mediano'), 0)} / {coma(f.get('central_mediano'), 0)}")]))
                    else:
                        md.append(f"### Nivel {nivel}, {metodo} (se repite adelante, Spearman: {coma(v['se_repite_adelante_spearman'], 2)})\n\n```\n{v['reglas']}```\n\n" + tabla_md(v["hojas"], [
                            ("Hoja", lambda f: str(f["hoja"])), ("Personas (entr. / prueba)", lambda f: f"{c.miles(f['personas_entrenamiento'])} / {c.miles(f['personas_prueba'])}"),
                            ("Pérdida entr. / prueba", lambda f: f"{coma(f['perdida_entrenamiento'], 3)} / {coma(f['perdida_prueba'], 3)}"),
                            ("Fallo del mínimo entr. / prueba / OK", lambda f: f"{coma(f['fallo_entrenamiento'])} / {coma(f['fallo_prueba'])} / {coma(f['fallo_ok_prueba'])}")]))
    if "B3" in r:
        md.append("## B3. Para qué sirve cada agrupación\n\n" + tabla_md(r["B3"], [
            ("Nivel", lambda f: str(f["nivel"])), ("Agrupación", lambda f: f"{f['agrupacion']} ({f['grupos']})"),
            ("Como variable", lambda f: "—" if "variable" not in f else f"{coma(f['variable']['baja'], 2)}% ({coma(f['variable']['bajo'], 2)} a {coma(f['variable']['alto'], 2)}) {'sigue' if f['variable']['sigue'] else 'no'}"),
            ("Modelo por grupo", lambda f: "—" if "por_grupo" not in f else f"{coma(f['por_grupo']['baja'], 2)}% ({coma(f['por_grupo']['bajo'], 2)} a {coma(f['por_grupo']['alto'], 2)}) {'sigue' if f['por_grupo']['sigue'] else 'no'}"),
            ("Calibración: en banda única / por grupo (de)", lambda f: f"{f['calibracion']['en_banda_unica']} / {f['calibracion']['en_banda_por_grupo']} ({f['calibracion']['grupos_juzgables']})"),
            ("Desvío medio de 90", lambda f: f"{coma(f['calibracion']['desvio_medio_de_90_unica'], 2)} / {coma(f['calibracion']['desvio_medio_de_90_por_grupo'], 2)}"),
            ("Mínimo mediano OK", lambda f: f"{coma(f['calibracion']['minimo_mediano_ok_unica'], 0)} / {coma(f['calibracion']['minimo_mediano_ok_por_grupo'], 0)}"),
            ("«Alcanza» por error", lambda f: f"{coma(f['calibracion']['alcanza_por_error_unica'], 2)} / {coma(f['calibracion']['alcanza_por_error_por_grupo'], 2)}"),
            ("Cumple / la única ya cumplía / sigue", lambda f: " / ".join("sí" if f["calibracion"][k] else "no" for k in ("cumple", "unica_ya_cumple", "sigue")))]))
        for f in r["B3"]:
            md.append(f"#### Nivel {f['nivel']}, {f['agrupacion']}: por grupo\n\n" + tabla_md(f["por_grupo_detalle"], [
                ("Grupo", lambda g: str(g["grupo"])), ("Casos (OK)", lambda g: f"{c.miles(g['casos'])} ({c.miles(g['casos_ok'])})"),
                ("Corrimiento (casos)", lambda g: f"{coma(g['corrimiento'], 3)} ({c.miles(g['casos_ok_para_calibrar'])})"),
                ("Cobertura OK única", lambda g: f"{coma(g['cobertura_ok_unica'])} ({coma(g['cobertura_ok_unica_bajo'])} a {coma(g['cobertura_ok_unica_alto'])})"),
                ("Cobertura OK por grupo", lambda g: f"{coma(g['cobertura_ok_por_grupo'])} ({coma(g['cobertura_ok_por_grupo_bajo'])} a {coma(g['cobertura_ok_por_grupo_alto'])})"),
                ("Cobertura todas única / por grupo", lambda g: f"{coma(g['cobertura_todas_unica'])} / {coma(g['cobertura_todas_por_grupo'])}"),
                ("Porcentaje / tramo exacto / tramo o vecino / ±25%", lambda g: "—" if "porcentaje" not in g else
                 f"{coma(g['porcentaje'])} / {coma(g['tramo_exacto'])} / {coma(g['tramo_o_vecino'])} ({coma(g['tramo_o_vecino_bajo'])} a {coma(g['tramo_o_vecino_alto'])}) / {coma(g['dentro_25'])}")])
                + (f"\n\nGrados: {f['grados']}" if "grados" in f else ""))
    if "C" in r:
        C = r["C"]
        md.append("## C. Lo que leería el modelo de lenguaje\n\n" + tabla_md(C["probabilidad"], [
            ("Nivel", lambda f: str(f["nivel"])), ("Umbral", lambda f: c.miles(f["umbral"])), ("Casos", lambda f: f"{f['casos']} ({c.miles(f['n'])})"),
            ("Frecuencia / dicha media", lambda f: f"{coma(f['frecuencia'])} / {coma(f['dicha_media'])}"),
            ("ECE", lambda f: coma(f["ece"], 3) + (f" ({coma(f['ece_bajo'], 3)} a {coma(f['ece_alto'], 3)})" if "ece_bajo" in f else "")),
            ("Brier / constante", lambda f: f"{coma(f.get('brier'), 3)} / {coma(f.get('brier_constante'), 3)}" if "brier" in f else "—"),
            ("ECE con isotónica", lambda f: coma(f.get("ece_con_isotonica"), 3))]) + f"\n\nBien calibrada (ECE ≤ 0,05 en todas): {C['bien_calibrada_por_nivel']}")
        md.append(tabla_md(C["declarado"], [
            ("Nivel", lambda f: str(f["nivel"])), ("Qué", lambda f: f["que"]), ("Casos", lambda f: f"{f['casos']} ({c.miles(f['n'])})"), ("Evento", lambda f: pct(f["evento"])),
            ("AUC del predictor", lambda f: f"{coma(f['auc_predictor'], 3)} ({coma(f['auc_predictor_bajo'], 3)} a {coma(f['auc_predictor_alto'], 3)})"),
            ("AUC del declarado solo", lambda f: f"{coma(f['auc_declarado_solo'], 3)} ({coma(f['auc_declarado_solo_bajo'], 3)} a {coma(f['auc_declarado_solo_alto'], 3)})"),
            ("Los dos", lambda f: f"{coma(f['auc_los_dos'], 3)} ({coma(f['auc_los_dos_bajo'], 3)} a {coma(f['auc_los_dos_alto'], 3)})"), ("Sirve", lambda f: "sí" if f["sirve"] else "no")]))
    return "\n\n".join(md)


def main():
    t0 = time.time()
    solo = next((a.split("=")[1].split(",") for a in sys.argv if a.startswith("--solo=")), ["A", "B", "C"])
    SALIDA.mkdir(parents=True, exist_ok=True)
    d = Datos()
    N = preparar_niveles(d)
    print(f"{c.miles(len(d.antes))} para entrenar, {c.miles(len(d.te))} para probar; dependientes {c.miles(len(d.dep))} ({time.time() - t0:.0f} s)", flush=True)
    r = {}
    tipo_te = tipo_de(d.te).values
    if "A" in solo:
        r["A"], tipo_te = seccion_A(d, N)
        r["A_dependientes"] = seccion_A_dependientes(d, N)
        print(f"A listo ({time.time() - t0:.0f} s)", flush=True)
    if "B" in solo:
        r["B1"], g1 = seccion_B1(d, N)
        r["B2"], g2 = seccion_B2(d, N)
        r["B3"] = seccion_B3(d, N, tipo_te, {**g1, **g2})
        print(f"B listo ({time.time() - t0:.0f} s)", flush=True)
    if "C" in solo:
        r["C"] = seccion_C(d, N, tipo_te)
        print(f"C listo ({time.time() - t0:.0f} s)", flush=True)
    md = informe(d, r)
    (SALIDA / "tipos-y-grupos.md").write_text(md + "\n", encoding="utf-8")
    meta = {"descripcion": "Tipos de persona y agrupaciones en el predictor de ingresos (ingreso-v2, hacia adelante). Sólo agregados; grupos de menos de "
                           f"{MIN_JSON} personas sin medianas de montos.",
            "entrenamiento": {f"nivel {k}": len(N[k]["tr"]) for k in N}, "prueba": len(d.te), "ok_prueba": len(d.ok), "remuestreos": B, "remuestreos_por_grupo": BG,
            "corrimientos": {f"nivel {k}": N[k]["cal"]["c90"] for k in N}, "reentrenado_contra_copia_max_log": {f"nivel {k}": N[k].get("dif_reentrenado") for k in N},
            "huella_tabla": d.huella, "versiones": c.versiones(), "corrida": time.strftime("%Y-%m-%d %H:%M"), "modo_rapido": lb.RAPIDO, "secciones": solo}
    if not lb.RAPIDO:
        previo = json.loads(METRICAS.read_text(encoding="utf-8")) if METRICAS.exists() and solo != ["A", "B", "C"] else {}
        # Con --solo, las otras secciones quedan de la corrida anterior: la meta dice de cuándo es cada una.
        meta["corrida_por_seccion"] = {**previo.get("meta", {}).get("corrida_por_seccion", {}), **{x: meta["corrida"] for x in solo}}
        METRICAS.write_text(json.dumps(lb.limpiar({**previo, **r, "meta": meta}), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
        print(f"métricas -> {METRICAS}")
    print(f"listo en {time.time() - t0:.0f} s -> {SALIDA}")


if __name__ == "__main__":
    main()
