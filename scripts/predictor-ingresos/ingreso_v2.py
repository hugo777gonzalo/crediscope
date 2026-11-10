# ingreso-v2 del predictor de ingresos (fase 2 de la revisión, 2026-11-06; investigación, 12.35). Qué cambia contra ingreso-v1:
#   1. El nivel 2 se sirve igual que se entrena. Las 19 variables de las operaciones salen de las listas de interconnectResponse
#      (variables-de-ingreso-v2, que reproduce el extracto de AWS) y el nivel ya no lleva lo que Proveedor_Info_1 no da: estado civil, zona e IESS
#      (comun.NO_SERVIBLES). Entrenado con ellos, en producción llegarían vacíos en todos los casos.
#   2. Los dos niveles se calibran con OK FACTURAR y condicionado (decisión del negocio del 2026-11-06, 12.34): el corrimiento conforme en logaritmo
#      sale de las predicciones fuera de muestra de esos casos y viaja dentro del modelo exportado (`calibracion`, FORMATO.md).
#
# Mide siempre hacia adelante (entrenado hasta junio, probado de julio a octubre) con el marco de la fase 0 (linea_base.py): la baja de la pérdida
# de cuantiles contra el mínimo fijo (la línea base sin variables), el tramo exacto o vecino, la cobertura en OK FACTURAR y condicionado y la
# decisión de la capacidad de pago. Y la misma prueba en las 3.935 consultas de septiembre y octubre que tienen el crudo, con el nivel 2 armado
# por `variables-de-ingreso.ts` desde el crudo (matriz-desde-crudo.mjs) y lo que no se puede servir, vacío: lo que vería producción.
# El sexo se mide con y sin él en los dos niveles y lo decide el negocio: el modelo que se entrena lo lleva salvo `--sin-sexo`.
#
# Reglas fijadas ANTES de medir:
#   desde febrero  Las listas reproducen el extracto desde febrero de 2026, no en diciembre ni enero (12.35). El nivel 2 se entrena sin diciembre
#                  ni enero si eso no sube la pérdida hacia adelante más de 0,5% (en todas) y la cobertura calibrada en OK FACTURAR y
#                  condicionado queda entre 88% y 95%: a igualdad, gana lo que se sirve igual que se entrena.
#   aceptación     Las metas y los pisos propuestos en la fase 0 (12.32): agudeza 13% y 30% (piso 10% y 26%), tramo exacto o vecino 70% y 84%
#                  (piso 66% y 81%), «alcanza» por error de 1% o menos (el negocio aceptó 1,2% en el nivel 1) y negadas de más de 21% y 20% o menos.
#
#   python -I scripts/predictor-ingresos/ingreso_v2.py [--solo=medir|entrenar] [--sin-sexo] [--rapido] [--recalcular]
#
#   medir     las tablas (C:\datos\ingresos\resultados\predictor-ingresos\ingreso-v2\) y metricas/ingreso-v2-2026-11.json, sólo agregados
#   entrenar  los modelos con todo 2026 en MODELOS/ingreso-v2/completo/nivelN, con la calibración en el manifiesto, y metricas/ingreso-v2-nivelN.json;
#             después, `exportar.py --version=ingreso-v2`
#
# Lee la tabla por persona (preparar.py) y la matriz del crudo (matriz-desde-crudo.mjs), las dos fuera de git. No consulta a nadie.
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
import linea_base as lb
from calibrar import SBU_MEDIO, aplicar, corrimiento
from destilacion import Capacidad, cobertura_por_estado
from medir import coma, ic, tabla_md

VERSION = "ingreso-v2"
SALIDA = c.RESULTADOS / "ingreso-v2"
COPIAS = SALIDA / "copias"
MATRIZ_CRUDO = c.RAIZ_DATOS / "resultados" / "matriz-crudo" / "matriz-nivel2.csv"
METRICAS = Path(__file__).resolve().parent / "metricas"
B = lb.B
I10 = c.LEV.index(0.10)
pct = lb.pct
CALIBRACION_PARA = "OK FACTURAR y condicionado (AWS, 2026)"
SUBE_COMO_MUCHO = 0.5  # regla «desde febrero»: % de pérdida
BANDA_OK = (88.0, 95.0)
METAS = {1: {"agudeza": (13, 10), "tramo_o_vecino": (70, 66), "niega_de_mas": 21}, 2: {"agudeza": (30, 26), "tramo_o_vecino": (84, 81), "niega_de_mas": 20}}
ALCANZA_POR_ERROR_MAXIMO = {1: 1.2, 2: 1.0}  # el 1,2% del nivel 1 lo aceptó el negocio el 2026-11-06 (12.34)

sin_sexo = lambda cols: [x for x in cols if x != "genero"]
FILTROS = {"todo": lambda df: df, "desde febrero": lambda df: df[df.t >= c.INICIO_DE_LA_PARIDAD]}
# clave: (nivel, nombre, variables, filtro del entrenamiento)
VARIANTES = {
    "n1": (1, "Nivel 1 con el sexo (las variables de ingreso-v1)", c.NIVELES_V2[1], "todo"),
    "n1_sin_sexo": (1, "Nivel 1 sin el sexo", sin_sexo(c.NIVELES_V2[1]), "todo"),
    "n2_v1": (2, "Nivel 2 de ingreso-v1: con estado civil, zona e IESS", c.NIVELES[2], "todo"),
    "n2": (2, "Nivel 2 sin lo que no se puede servir, con el sexo", c.NIVELES_V2[2], "todo"),
    "n2_sin_sexo": (2, "Nivel 2 sin lo que no se puede servir, sin el sexo", sin_sexo(c.NIVELES_V2[2]), "todo"),
    "n2_feb": (2, "Nivel 2 sin lo que no se puede servir, con el sexo, entrenado desde febrero", c.NIVELES_V2[2], "desde febrero"),
    "n2_feb_sin_sexo": (2, "Nivel 2 sin lo que no se puede servir, sin el sexo, entrenado desde febrero", sin_sexo(c.NIVELES_V2[2]), "desde febrero"),
}


# ================================================================ datos
class DatosV2(lb.Datos):
    """La tabla de la fase 0 (entrenamiento hasta junio, prueba de julio a octubre) más las 3.935 de la prueba con el nivel 2 armado desde el crudo."""

    def __init__(self):
        super().__init__()
        self.base = np.quantile(self.antes.y.values, c.LEV)  # el mínimo fijo: los cuantiles de todo el entrenamiento, sin variables
        self.huella_matriz = c.huella(MATRIZ_CRUDO)
        # «round_trip»: el lector por omisión de pandas no relee exacto el decimal que escribió JavaScript, y un valor a un bit del umbral de
        # una división cambia de rama. Con él, la antigüedad del SRI y los cocientes salían distintos del extracto en 634 y 722 de las 3.935.
        m = pd.read_csv(MATRIZ_CRUDO, low_memory=False, float_precision="round_trip")
        m["id_consulta_equifax"] = m.id_consulta_equifax.astype("int64")
        ids = self.te.id_consulta_equifax.astype("int64")
        self.idx_crudo = np.where(ids.isin(m.id_consulta_equifax).values)[0]
        sub = self.te.iloc[self.idx_crudo].reset_index(drop=True)
        mm = m.set_index("id_consulta_equifax").loc[ids.iloc[self.idx_crudo].values].reset_index(drop=True)
        # Lo que arma variables-de-ingreso.ts desde el crudo reemplaza al extracto; la edad y el sexo siguen siendo los de AWS (en producción salen de
        # Proveedor_Info_1: coinciden en 99,6%, 12.29) y lo que no se puede servir queda vacío.
        de_equifax = [x for x in c.NIVELES[2] if x not in c.PERSONA + c.ZONA + c.IESS]
        faltan = [x for x in de_equifax if x not in mm.columns]
        if faltan:
            raise SystemExit(f"La matriz del crudo no trae {faltan}: ¿cambió matriz-desde-crudo.mjs?")
        distintas = {}
        for x in de_equifax:
            a, e = mm[x], sub[x]
            if x in c.CATEGORICAS:
                iguales = (a.isna() & e.isna()) | (a.astype("string").str.upper() == e.astype("string").str.upper()).fillna(False)
            else:
                an, en = pd.to_numeric(a, errors="coerce"), pd.to_numeric(e, errors="coerce")
                iguales = (an.isna() & en.isna()) | ((an - en).abs() <= 0.02).fillna(False)
            if (~iguales).sum():
                distintas[x] = int((~iguales).sum())
            sub[x] = mm[x].values
        self.distintas_del_extracto = distintas
        for x in c.NO_SERVIBLES:
            sub[x] = np.nan
        self.te_crudo = sub
        self.real_crudo = sub.unver.values
        self.ok_crudo = np.where(sub.med_resp.isin(c.OK_FACTURAR).values)[0]
        # La prueba «como se sirve» del nivel 2 de ingreso-v1 en todas: el extracto con lo que no se puede servir vacío.
        self.te_servido = self.te.copy()
        for x in c.NO_SERVIBLES:
            self.te_servido[x] = np.nan
        self.capacidad = Capacidad(self, self.ok)
        self.capacidad_crudo = Capacidad(self, self.idx_crudo[self.ok_crudo])


def clave(*partes):
    return hashlib.sha1("|".join(map(str, partes)).encode()).hexdigest()[:12]


def correr(d, k):
    """Entrena una variante con lo anterior a julio y devuelve sus cuantiles hacia adelante (en el extracto, en el extracto servido y en las 3.935 del
    crudo) y fuera de muestra (validación cruzada de cinco particiones por persona, con que se calibra), guardados en disco con las huellas."""
    nivel, _, cols, filtro = VARIANTES[k]
    tr = FILTROS[filtro](d.antes).reset_index(drop=True)
    COPIAS.mkdir(parents=True, exist_ok=True)
    ruta = COPIAS / f"{k}-{clave(cols, filtro, len(tr), d.huella[:12], d.huella_matriz[:12], 'round_trip')}.npz"
    if ruta.exists() and "--recalcular" not in sys.argv:
        z = np.load(ruta)
        return tr, {n: z[n] for n in z.files}
    cat = c.categorias_de(tr)
    t0 = time.time()
    modelos = c.entrenar_cuantiles(c.matriz(tr, cols, cat), tr.y)
    r = {"adelante": c.predecir(modelos, c.matriz(d.te, cols, cat)), "servido": c.predecir(modelos, c.matriz(d.te_servido, cols, cat)),
         "crudo": c.predecir(modelos, c.matriz(d.te_crudo, cols, cat)), "fuera": c.validacion_cruzada(tr, cols, cat)}
    np.savez(ruta, **r)
    print(f"  {k}: {c.miles(len(tr))} personas, {len(cols)} variables, {time.time() - t0:.0f} s", flush=True)
    return tr, r


def calibracion_de(tr, fuera):
    sel = tr.med_resp.isin(c.OK_FACTURAR).values
    return {"casos": int(sel.sum()), "c90": corrimiento(fuera[sel], tr.unver.values[sel], 0.10, 0.10, "logaritmo"),
            "c85": corrimiento(fuera[sel], tr.unver.values[sel], 0.15, 0.15, "logaritmo")}


def medidas(Q, real, cal=None):
    if cal is None:
        return lb.MedidasLB(Q, real)
    return lb.MedidasLB(Q, real, minimo90=aplicar(Q, 0.10, cal["c90"], "logaritmo"), minimo85=aplicar(Q, 0.15, cal["c85"], "logaritmo"))


def bloque(m, base, idx, capacidad=None, minimo_completo=None):
    """Las medidas de un subconjunto con intervalos, la baja de la pérdida contra el mínimo fijo y, si se pide, la decisión de la capacidad."""
    r = m.con_intervalos(idx, B=B)
    r["agudeza"], r["agudeza_bajo"], r["agudeza_alto"] = lb.mejora_relativa(m, base, idx)
    if capacidad is not None:
        r["capacidad"] = capacidad.medir(minimo_completo)
    return r


# ================================================================ medir
def medir(d):
    filas, Qs = [], {}
    n_te = len(d.te)
    base_te = lb.MedidasLB(np.tile(d.base, (n_te, 1)), d.real)
    base_crudo = lb.MedidasLB(np.tile(d.base, (len(d.te_crudo), 1)), d.real_crudo)
    for k, (nivel, nombre, cols, filtro) in VARIANTES.items():
        tr, r = correr(d, k)
        cal = calibracion_de(tr, r["fuera"])
        Qs[k] = (tr, r, cal)
        f = {"clave": k, "nivel": nivel, "nombre": nombre, "variables": len(cols), "entrenamiento": filtro, "personas": len(tr),
             "calibracion": {"casos": cal["casos"], "corrimiento_log_90": cal["c90"], "corrimiento_log_85": cal["c85"]}}
        for etiqueta, cc in (("sin_calibrar", None), ("calibrado", cal)):
            m = medidas(r["adelante"], d.real, cc)
            f[etiqueta] = {"todas": bloque(m, base_te, d.todas), "ok": bloque(m, base_te, d.ok, d.capacidad, m.q10),
                           "cobertura_por_estado": cobertura_por_estado(d, m.q10)}
            mc = medidas(r["crudo"], d.real_crudo, cc)
            completo = np.full(n_te, np.nan)
            completo[d.idx_crudo] = mc.q10
            f[etiqueta]["crudo"] = {"todas": bloque(mc, base_crudo, np.arange(len(d.te_crudo))), "ok": bloque(mc, base_crudo, d.ok_crudo, d.capacidad_crudo, completo)}
            if k == "n2_v1":
                ms = medidas(r["servido"], d.real, cc)
                f[etiqueta]["como_se_sirve"] = {"todas": bloque(ms, base_te, d.todas), "ok": bloque(ms, base_te, d.ok, d.capacidad, ms.q10)}
        # ¿El crudo da los mismos cuantiles que el extracto en las 3.935? Sólo cambia lo que no se puede servir (vacío en el crudo).
        f["crudo_contra_extracto_max_log"] = float(np.abs(r["crudo"] - r["adelante"][d.idx_crudo]).max())
        filas.append(f)
        print(f"  {k} medido", flush=True)
    por = {f["clave"]: f for f in filas}

    # ---- comparaciones con intervalos (los mismos remuestreos de personas para las dos)
    def mejora(a, b, idx, origen="adelante", real=None):
        real = d.real if real is None else real
        return lb.mejora_relativa(lb.MedidasLB(Qs[a][1][origen], real), lb.MedidasLB(Qs[b][1][origen], real), idx)

    comparaciones = []
    for a, b, que in (("n2", "n2_v1", "sin lo que no se puede servir, contra el nivel 2 de ingreso-v1"),
                      ("n2_feb", "n2", "entrenado desde febrero, contra con todo (regla «desde febrero»)"),
                      ("n2_feb_sin_sexo", "n2_sin_sexo", "sin el sexo: desde febrero contra con todo"),
                      ("n1", "n1_sin_sexo", "nivel 1: con el sexo contra sin el sexo"),
                      ("n2", "n2_sin_sexo", "nivel 2: con el sexo contra sin el sexo"),
                      ("n2_feb", "n2_feb_sin_sexo", "nivel 2 desde febrero: con el sexo contra sin el sexo")):
        for s, idx in d.subs.items():
            p, lo, hi = mejora(a, b, idx)
            comparaciones.append({"a": a, "b": b, "que": que, "subconjunto": s, "mejora": p, "bajo": lo, "alto": hi})
        p, lo, hi = mejora(a, b, np.arange(len(d.te_crudo)), "crudo", d.real_crudo)
        comparaciones.append({"a": a, "b": b, "que": que, "subconjunto": "las 3.935 del crudo", "mejora": p, "bajo": lo, "alto": hi})
    # El nivel 2 de ingreso-v1 entrenado con lo que no se puede servir, y servido con eso vacío.
    for s, idx in d.subs.items():
        p, lo, hi = lb.mejora_relativa(lb.MedidasLB(Qs["n2_v1"][1]["servido"], d.real), lb.MedidasLB(Qs["n2_v1"][1]["adelante"], d.real), idx)
        comparaciones.append({"a": "n2_v1 servido", "b": "n2_v1", "que": "el nivel 2 de ingreso-v1 como se sirve (estado civil, zona e IESS vacíos) contra como se entrenó",
                              "subconjunto": s, "mejora": p, "bajo": lo, "alto": hi})

    # ---- la regla «desde febrero», fijada antes de medir
    feb = next(x for x in comparaciones if x["a"] == "n2_feb" and x["b"] == "n2" and x["subconjunto"] == "todas")
    cob_feb = por["n2_feb"]["calibrado"]["ok"]["cobertura90"]
    desde_febrero = {"regla": f"la pérdida en todas no sube más de {coma(SUBE_COMO_MUCHO)}% y la cobertura calibrada en OK queda entre {coma(BANDA_OK[0], 0)}% y {coma(BANDA_OK[1], 0)}%",
                     "mejora_todas": feb["mejora"], "mejora_bajo": feb["bajo"], "mejora_alto": feb["alto"], "cobertura_ok_calibrada": cob_feb,
                     "adoptada": bool(feb["mejora"] >= -SUBE_COMO_MUCHO and BANDA_OK[0] <= cob_feb <= BANDA_OK[1])}
    elegido2 = "n2_feb" if desde_febrero["adoptada"] else "n2"

    # ---- el sexo: cada nivel con y sin él, calibrado como se exportaría
    sexo = {}
    for nivel, (con, sin) in ((1, ("n1", "n1_sin_sexo")), (2, (elegido2, elegido2 + "_sin_sexo"))):
        mc, ms = (medidas(Qs[k][1]["adelante"], d.real, Qs[k][2]) for k in (con, sin))
        filas_sexo = []
        for s, idx in d.subs.items():
            dr, dlo, dhi = c.diferencia_r2(mc, ms, idx, B=B)
            p, lo, hi = lb.mejora_relativa(mc, ms, idx)
            filas_sexo.append({"subconjunto": s, "dif_r2": dr, "dif_r2_bajo": dlo, "dif_r2_alto": dhi, "mejora_perdida": p, "mejora_bajo": lo, "mejora_alto": hi})
        cobertura = []
        rng = np.random.default_rng(5)
        for nombre, m in (("con el sexo", mc), ("sin el sexo", ms)):
            aciertos, grupos = d.real >= m.q10, {}
            for etiqueta, g in (("masculino", "MASCULINO"), ("femenino", "FEMENINO")):
                for s, base_idx in d.subs.items():
                    idx = np.intersect1d(base_idx, np.where((d.te.genero == g).values)[0])
                    pp, lo, hi = lb.ic_proporcion(aciertos, idx)
                    cobertura.append({"modelo": nombre, "sexo": etiqueta, "subconjunto": s, "casos": len(idx), "cobertura90": pp, "ic_bajo": lo, "ic_alto": hi,
                                      "mediana_min90": float(np.median(m.q10[idx]))})
                grupos[etiqueta] = np.where((d.te.genero == g).values)[0]
            brecha = [100 * (aciertos[rng.choice(grupos["masculino"], len(grupos["masculino"]))].mean() - aciertos[rng.choice(grupos["femenino"], len(grupos["femenino"]))].mean()) for _ in range(B)]
            cobertura.append({"modelo": nombre, "sexo": "brecha: masculino menos femenino", "subconjunto": "todas", "casos": len(d.te),
                              "cobertura90": 100 * float(aciertos[grupos["masculino"]].mean() - aciertos[grupos["femenino"]].mean()),
                              "ic_bajo": float(np.percentile(brecha, 2.5)), "ic_alto": float(np.percentile(brecha, 97.5)), "mediana_min90": None})
        sexo[nivel] = {"con": con, "sin": sin, "diferencias": filas_sexo, "cobertura_por_sexo": cobertura,
                       "capacidad": {"con el sexo": por[con]["calibrado"]["ok"]["capacidad"], "sin el sexo": por[sin]["calibrado"]["ok"]["capacidad"]}}

    # ---- aceptación de lo que se exportaría (con el sexo), contra las metas de la fase 0
    aceptacion = {}
    for nivel, k in ((1, "n1"), (2, elegido2)):
        f = por[k]["calibrado"]
        meta = METAS[nivel]
        cap = f["ok"]["capacidad"]
        aceptacion[nivel] = {
            "variante": k,
            "agudeza": {"valor": f["todas"]["agudeza"], "meta": meta["agudeza"][0], "piso": meta["agudeza"][1]},
            "tramo_o_vecino": {"valor": f["todas"]["tramo_o_vecino"], "meta": meta["tramo_o_vecino"][0], "piso": meta["tramo_o_vecino"][1]},
            "cobertura_ok": {"valor": f["ok"]["cobertura90"], "banda": [88, 95]},
            "alcanza_por_error": {"valor": cap["alcanza_por_error"], "maximo": ALCANZA_POR_ERROR_MAXIMO[nivel]},
            "niega_de_mas": {"valor": cap["niega_de_mas"], "meta": meta["niega_de_mas"]},
        }
        for v in aceptacion[nivel].values():
            if isinstance(v, dict) and "valor" in v:
                if "piso" in v:
                    v["cumple_piso"], v["cumple_meta"] = bool(v["valor"] >= v["piso"]), bool(v["valor"] >= v["meta"])
                elif "banda" in v:
                    v["cumple"] = bool(v["banda"][0] <= v["valor"] <= v["banda"][1])
                elif "maximo" in v:
                    # A un decimal, como se aceptó: el 1,2% del nivel 1 es el 1,20% medido (0,9 a 1,5), no un 1,2004 contra 1,2.
                    v["cumple"] = bool(round(v["valor"], 1) <= v["maximo"])
                else:
                    v["cumple_meta"] = bool(v["valor"] <= v["meta"])
    return {"variantes": filas, "comparaciones": comparaciones, "desde_febrero": desde_febrero, "elegido_nivel2": elegido2, "sexo": sexo, "aceptacion": aceptacion,
            "crudo": {"consultas": len(d.te_crudo), "ok_facturar_y_condicionado": len(d.ok_crudo), "variables_distintas_del_extracto": d.distintas_del_extracto}}


# ================================================================ el informe
def informe(d, r):
    md = [f"Hacia adelante: {c.miles(len(d.antes))} personas hasta junio para entrenar, {c.miles(len(d.te))} de julio a octubre para probar "
          f"({c.miles(len(d.ok))} en OK FACTURAR y condicionado). Con el crudo: {c.miles(r['crudo']['consultas'])} consultas ({c.miles(r['crudo']['ok_facturar_y_condicionado'])} en OK FACTURAR y condicionado); "
          f"variables de Equifax de la matriz distintas del extracto: {r['crudo']['variables_distintas_del_extracto'] or 'ninguna'}. Remuestreos: {B}."]
    filas = []
    for f in r["variantes"]:
        for etiqueta in ("sin_calibrar", "calibrado"):
            g = f[etiqueta]
            filas.append({"nombre": f["nombre"], "personas": f["personas"], "cal": "calibrado" if etiqueta == "calibrado" else "sin calibrar",
                          "c90": f["calibracion"]["corrimiento_log_90"] if etiqueta == "calibrado" else None, **{f"t_{k}": v for k, v in g["todas"].items()},
                          **{f"o_{k}": v for k, v in g["ok"].items()}, "rech": g["cobertura_por_estado"]["RECHAZADO"],
                          "cr_agudeza": g["crudo"]["todas"]["agudeza"], "cr_tramo": g["crudo"]["todas"]["tramo_o_vecino"], "cr_cob_ok": g["crudo"]["ok"]["cobertura90"],
                          "cr_cap": g["crudo"]["ok"]["capacidad"]})
    md.append("#### Hacia adelante: todas (8.656) y OK FACTURAR y condicionado (1.613)\n\n" + tabla_md(filas, [
        ("Variante", lambda f: f"{f['nombre']} ({c.miles(f['personas'])})"), ("Mínimo", lambda f: f["cal"] + ("" if f["c90"] is None else f" ({coma(f['c90'], 3)})")),
        ("Agudeza en todas (IC 95%)", lambda f: f"{coma(f['t_agudeza'])}% ({coma(f['t_agudeza_bajo'])} a {coma(f['t_agudeza_alto'])})"),
        ("En OK", lambda f: f"{coma(f['o_agudeza'])}%"), ("R² en todas", lambda f: coma(f["t_r2"], 3)),
        ("Tramo exacto o vecino", lambda f: pct(f["t_tramo_o_vecino"])),
        ("Cobertura en OK (IC 95%)", lambda f: f"{coma(f['o_cobertura90'])} ({coma(f['o_cobertura90_ic_bajo'])} a {coma(f['o_cobertura90_ic_alto'])})"),
        ("Mínimo mediano en OK", lambda f: coma(f["o_mediana_min90"], 0)), ("Cobertura en todas / rechazados", lambda f: f"{coma(f['t_cobertura90'])} / {coma(f['rech'])}"),
        ("«Alcanza» por error / niega de más (OK)", lambda f: f"{coma(f['o_capacidad']['alcanza_por_error'], 2)} ({coma(f['o_capacidad']['alcanza_por_error_bajo'], 2)} a {coma(f['o_capacidad']['alcanza_por_error_alto'], 2)}) / {coma(f['o_capacidad']['niega_de_mas'])}"),
        ("Concordancia", lambda f: coma(f["o_capacidad"]["concordancia"]))]))
    md.append("#### Las 3.935 de septiembre y octubre con el nivel 2 armado desde el crudo (lo no servible, vacío)\n\n" + tabla_md(filas, [
        ("Variante", lambda f: f["nombre"]), ("Mínimo", lambda f: f["cal"]), ("Agudeza", lambda f: f"{coma(f['cr_agudeza'])}%"), ("Tramo exacto o vecino", lambda f: pct(f["cr_tramo"])),
        ("Cobertura en OK (775)", lambda f: pct(f["cr_cob_ok"])),
        ("«Alcanza» por error / niega de más (OK)", lambda f: f"{coma(f['cr_cap']['alcanza_por_error'], 2)} / {coma(f['cr_cap']['niega_de_mas'])}")]))
    sv = [f for f in r["variantes"] if f["clave"] == "n2_v1"][0]
    md.append("#### El nivel 2 de ingreso-v1 como se sirve (estado civil, zona e IESS vacíos)\n\n" + tabla_md(
        [{"cal": e, **sv[e]["como_se_sirve"]} for e in ("sin_calibrar", "calibrado")], [
            ("Mínimo", lambda f: f["cal"].replace("_", " ")), ("Agudeza en todas", lambda f: f"{coma(f['todas']['agudeza'])}% ({coma(f['todas']['agudeza_bajo'])} a {coma(f['todas']['agudeza_alto'])})"),
            ("Tramo exacto o vecino", lambda f: pct(f["todas"]["tramo_o_vecino"])), ("Cobertura en OK", lambda f: pct(f["ok"]["cobertura90"])),
            ("«Alcanza» por error / niega de más", lambda f: f"{coma(f['ok']['capacidad']['alcanza_por_error'], 2)} / {coma(f['ok']['capacidad']['niega_de_mas'])}")]))
    md.append("#### Comparaciones: baja de la pérdida de cuantiles de A contra B (positivo = A mejor; IC 95%)\n\n" + tabla_md(r["comparaciones"], [
        ("Qué", lambda f: f["que"]), ("Casos", lambda f: f["subconjunto"]), ("Baja", lambda f: f"{coma(f['mejora'], 2)}% ({coma(f['bajo'], 2)} a {coma(f['alto'], 2)})")]))
    df = r["desde_febrero"]
    md.append(f"**Regla «desde febrero»** ({df['regla']}): la pérdida {'baja' if df['mejora_todas'] >= 0 else 'sube'} {coma(abs(df['mejora_todas']), 2)}% "
              f"({coma(df['mejora_bajo'], 2)} a {coma(df['mejora_alto'], 2)}) y la cobertura calibrada en OK es {coma(df['cobertura_ok_calibrada'])}%: "
              f"{'se adopta' if df['adoptada'] else 'no se adopta'}. El nivel 2 que se entrena es `{r['elegido_nivel2']}`.")
    for nivel, s in r["sexo"].items():
        md.append(f"#### El sexo en el nivel {nivel} ({s['con']} contra {s['sin']}, calibrados)\n\n" + tabla_md(s["diferencias"], [
            ("Casos", lambda f: f["subconjunto"]), ("Diferencia de R² (con menos sin)", lambda f: f"{coma(f['dif_r2'], 3)} ({coma(f['dif_r2_bajo'], 3)} a {coma(f['dif_r2_alto'], 3)})"),
            ("Baja de la pérdida con el sexo", lambda f: f"{coma(f['mejora_perdida'], 2)}% ({coma(f['mejora_bajo'], 2)} a {coma(f['mejora_alto'], 2)})")])
            + "\n\n" + tabla_md(s["cobertura_por_sexo"], [
                ("Modelo", lambda f: f["modelo"]), ("Sexo", lambda f: f["sexo"]), ("Casos", lambda f: f"{f['subconjunto']} ({c.miles(f['casos'])})"),
                ("Cobertura del mínimo (IC 95%)", lambda f: f"{coma(f['cobertura90'])} ({coma(f['ic_bajo'])} a {coma(f['ic_alto'])})"),
                ("Mínimo mediano", lambda f: coma(f["mediana_min90"], 0))])
            + "\n\nCapacidad de pago en OK (con / sin el sexo): " + "; ".join(
                f"{k}: «alcanza» por error {coma(v['alcanza_por_error'], 2)}%, niega de más {coma(v['niega_de_mas'])}%, concordancia {coma(v['concordancia'])}%" for k, v in s["capacidad"].items()))
    filas_ac = []
    for nivel, a in r["aceptacion"].items():
        for k, v in a.items():
            if isinstance(v, dict):
                filas_ac.append({"nivel": nivel, "medida": k, **v})
    md.append("#### Aceptación de lo que se exporta (con el sexo, calibrado) contra las metas de la fase 0\n\n" + tabla_md(filas_ac, [
        ("Nivel", lambda f: str(f["nivel"])), ("Medida", lambda f: f["medida"].replace("_", " ")), ("Valor", lambda f: coma(f["valor"], 2)),
        ("Meta / piso", lambda f: f"{f.get('meta', '—')} / {f.get('piso', f.get('maximo', f.get('banda', '—')))}"),
        ("Cumple", lambda f: ", ".join(f"{k.replace('_', ' ')}: {'sí' if v else 'no'}" for k, v in f.items() if k.startswith("cumple")))]))
    return "\n\n".join(md)


# ================================================================ entrenar lo que se exporta
def entrenar(r):
    """Los modelos completos (todo 2026; el nivel 2, desde febrero si la regla lo adoptó), con la calibración de OK FACTURAR y condicionado calculada
    con sus predicciones fuera de muestra (validación cruzada de cinco particiones sobre esos mismos casos)."""
    t = c.cargar_tabla()
    huella = c.huella(c.TABLA)
    elegido2 = r["elegido_nivel2"]
    sexo = "--sin-sexo" not in sys.argv
    for nivel, k in ((1, "n1" if sexo else "n1_sin_sexo"), (2, elegido2 if sexo else elegido2 + "_sin_sexo")):
        _, _, cols, filtro = VARIANTES[k]
        tr = FILTROS[filtro](t).reset_index(drop=True)
        cat = c.categorias_de(tr)
        t0 = time.time()
        modelos = c.entrenar_cuantiles(c.matriz(tr, cols, cat), tr.y)
        fuera = c.validacion_cruzada(tr, cols, cat)
        cal = calibracion_de(tr, fuera)
        calibracion = {"para": CALIBRACION_PARA, "casos": cal["casos"], "corrimientoLog90": cal["c90"], "corrimientoLog85": cal["c85"]}
        carpeta = c.MODELOS / VERSION / "completo" / f"nivel{nivel}"
        c.guardar_modelo(carpeta, modelos, cols, {x: v for x, v in cat.items() if x in cols}, {
            "version": VERSION, "nivel": nivel, "variante": k, "motivo": "ingreso-v2: modelo para exportar", "n": len(tr), "consultas_desde": str(tr.t.min()),
            "consultas_hasta": str(tr.t.max()), "archivo_de_entrenamiento": c.TABLA.name, "huella_sha256": huella,
            "parametros": c.PAR | {"n_estimators": c.N_ARBOLES, "objective": "quantile"}, "objetivo": "logaritmo del ingreso no verificado (unver)",
            "calibracion": calibracion})
        # Las medidas fuera de muestra del modelo completo (todo 2026), con el mínimo calibrado: las que van a la fila del modelo.
        mf = medidas(fuera, tr.unver.values, cal)
        ok = np.where(tr.med_resp.isin(c.OK_FACTURAR).values)[0]
        todas = mf.con_intervalos(np.arange(len(tr)), B=B)
        en_ok = mf.calcular(ok)
        f = next(x for x in r["variantes"] if x["clave"] == k)
        cal_adelante = f["calibrado"]
        sx = r["sexo"][nivel]
        dif = next(x for x in sx["diferencias"] if x["subconjunto"] == "todas")
        metricas = {
            "poblacion": "solicitantes de crédito independientes (en AWS, el 96% automotriz)",
            "medido_el": time.strftime("%Y-%m-%d"),
            "fuente": "docs/investigacion-predictor-de-ingresos.md, 12.35; scripts/predictor-ingresos/ingreso_v2.py y metricas/ingreso-v2-2026-11.json",
            "variables": len(cols),
            "lleva_el_sexo": "genero" in cols,
            "entrenamiento": {"casos": len(tr), "desde": str(tr.t.min().date()), "hasta": str(tr.t.max().date()), "filtro": filtro},
            "calibracion": calibracion,
            "validacion_cruzada": {"casos": len(tr), "r2": round(todas["r2"], 3), "r2_intervalo": [round(todas["r2_ic_bajo"], 3), round(todas["r2_ic_alto"], 3)],
                                   "tramo_exacto": round(todas["tramo_exacto"] / 100, 3), "tramo_o_vecino": round(todas["tramo_o_vecino"] / 100, 3),
                                   "real_supera_minimo_90": round(todas["cobertura90"] / 100, 3), "mediana_minimo_90": round(todas["mediana_min90"])},
            "ok_facturar_y_condicionado": {"casos": len(ok), "real_supera_minimo_90": round(en_ok["cobertura90"] / 100, 3), "mediana_minimo_90": round(en_ok["mediana_min90"])},
            "hacia_adelante": {
                "descripcion": "Entrenado hasta junio, probado de julio a octubre de 2026, con el mínimo calibrado.",
                "casos": len(lb_d.te), "ok_facturar_y_condicionado": len(lb_d.ok),
                "baja_de_la_perdida_contra_el_minimo_fijo": round(cal_adelante["todas"]["agudeza"] / 100, 3),
                "baja_de_la_perdida_intervalo": [round(cal_adelante["todas"]["agudeza_bajo"] / 100, 3), round(cal_adelante["todas"]["agudeza_alto"] / 100, 3)],
                "tramo_exacto_o_vecino": round(cal_adelante["todas"]["tramo_o_vecino"] / 100, 3),
                "real_supera_minimo_90_en_ok": round(cal_adelante["ok"]["cobertura90"] / 100, 3),
                "real_supera_minimo_90_en_ok_intervalo": [round(cal_adelante["ok"]["cobertura90_ic_bajo"] / 100, 3), round(cal_adelante["ok"]["cobertura90_ic_alto"] / 100, 3)],
                "real_supera_minimo_90_en_todas": round(cal_adelante["todas"]["cobertura90"] / 100, 3),
                "mediana_minimo_90_en_ok": round(cal_adelante["ok"]["mediana_min90"]),
                "capacidad_de_pago_en_ok": {x: round(cal_adelante["ok"]["capacidad"][x] / 100, 4) for x in ("concordancia", "alcanza_por_error", "niega_de_mas")},
            },
            "sexo": {"diferencia_r2_con_menos_sin": round(dif["dif_r2"], 4), "intervalo": [round(dif["dif_r2_bajo"], 4), round(dif["dif_r2_alto"], 4)],
                     "baja_de_la_perdida_con_el_sexo": round(dif["mejora_perdida"] / 100, 4)},
        }
        if nivel == 2:
            cr = cal_adelante["crudo"]
            metricas["prueba_con_el_crudo"] = {
                "descripcion": "Las consultas de septiembre y octubre con el crudo de Equifax: el nivel 2 armado por variables-de-ingreso.ts, como en producción.",
                "casos": r["crudo"]["consultas"], "ok_facturar_y_condicionado": r["crudo"]["ok_facturar_y_condicionado"],
                "variables_distintas_del_extracto": r["crudo"]["variables_distintas_del_extracto"],
                "baja_de_la_perdida_contra_el_minimo_fijo": round(cr["todas"]["agudeza"] / 100, 3), "tramo_exacto_o_vecino": round(cr["todas"]["tramo_o_vecino"] / 100, 3),
                "real_supera_minimo_90_en_ok": round(cr["ok"]["cobertura90"] / 100, 3),
                "capacidad_de_pago_en_ok": {x: round(cr["ok"]["capacidad"][x] / 100, 4) for x in ("concordancia", "alcanza_por_error", "niega_de_mas")},
            }
        (METRICAS / f"{VERSION}-nivel{nivel}.json").write_text(json.dumps(lb.limpiar(metricas), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"nivel {nivel} ({k}): {c.miles(len(tr))} personas, {len(cols)} variables, corrimiento {cal['c90']:.4f} con {c.miles(cal['casos'])} casos, "
              f"{time.time() - t0:.0f} s -> {carpeta}", flush=True)


lb_d = None


def main():
    global lb_d
    t0 = time.time()
    solo = next((a.split("=")[1] for a in sys.argv if a.startswith("--solo=")), None)
    SALIDA.mkdir(parents=True, exist_ok=True)
    ruta_metricas = METRICAS / f"{VERSION}-2026-11.json"
    d = lb_d = DatosV2()
    print(f"{c.miles(len(d.antes))} para entrenar, {c.miles(len(d.te))} para probar, {c.miles(len(d.te_crudo))} con el crudo; "
          f"distintas del extracto: {d.distintas_del_extracto or 'ninguna'}", flush=True)
    if solo in (None, "medir"):
        r = medir(d)
        md = informe(d, r)
        (SALIDA / "ingreso-v2.md").write_text(md + "\n", encoding="utf-8")
        meta = {"descripcion": "ingreso-v2 del predictor de ingresos: el nivel 2 sin diferencia entre entrenar y servir y los dos niveles calibrados con OK FACTURAR y condicionado. Sólo agregados.",
                "entrenamiento": f"{len(d.antes)} personas con consulta anterior al {c.CORTE_FECHA.date()}", "prueba": f"{len(d.te)} de julio a octubre de 2026, {len(d.ok)} en OK FACTURAR y condicionado",
                "crudo": f"{len(d.te_crudo)} de ellas con el crudo de Equifax (septiembre y octubre)", "remuestreos": B, "versiones": c.versiones(),
                "huella_tabla": d.huella, "huella_matriz_del_crudo": d.huella_matriz, "corrida": time.strftime("%Y-%m-%d %H:%M"), "modo_rapido": lb.RAPIDO}
        if not lb.RAPIDO:
            ruta_metricas.write_text(json.dumps(lb.limpiar({"meta": meta, **r}), ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
            print(f"métricas -> {ruta_metricas}")
        print(md)
    else:
        r = json.loads(ruta_metricas.read_text(encoding="utf-8"))
        r["sexo"] = {int(k): v for k, v in r["sexo"].items()}
    if solo in (None, "entrenar"):
        if lb.RAPIDO:
            raise SystemExit("--rapido no entrena modelos para exportar.")
        entrenar(r)
    print(f"listo en {time.time() - t0:.0f} s -> {SALIDA}")


if __name__ == "__main__":
    main()
