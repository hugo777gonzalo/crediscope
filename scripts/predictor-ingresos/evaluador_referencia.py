# Evaluador de referencia del formato compacto (FORMATO.md): Python puro, sin LightGBM ni numpy, para que quien escriba el evaluador de
# `supabase/functions/_shared/` lo lea como la especificación ejecutable. `exportar.py` lo prueba contra LightGBM y contra los casos de oro.
import gzip
import json
import math

CERO = 1e-35  # kZeroThreshold de LightGBM: un valor con módulo menor o igual a esto cuenta como cero


def cargar(ruta):
    abrir = gzip.open if str(ruta).endswith(".gz") else open
    with abrir(ruta, "rt", encoding="utf-8") as f:
        m = json.load(f)
    if m["formato"] != "crediscope-arboles-1":
        raise ValueError(f"Formato desconocido: {m['formato']}")
    # Un conjunto de categorías se consulta mucho: se busca como conjunto, no como lista.
    m["_conjuntos"] = [set(c) for c in m["conjuntos"]]
    m["_indice"] = {v["nombre"]: i for i, v in enumerate(m["variables"])}
    m["_codigos"] = {i: {c: k for k, c in enumerate(v["categorias"])} for i, v in enumerate(m["variables"]) if v["tipo"] == "categorica"}
    return m


def vector(m, entradas):
    """De las entradas por nombre al vector que ven los árboles: número, o NaN si falta. Una categoría que el modelo no vio también es NaN."""
    x = [math.nan] * len(m["variables"])
    for nombre, valor in entradas.items():
        i = m["_indice"][nombre]
        if valor is None:
            continue
        if m["variables"][i]["tipo"] == "categorica":
            x[i] = float(m["_codigos"][i].get(str(valor), math.nan))
        else:
            x[i] = float(valor)
    return x


def _hoja(m, raiz, x):
    n = m["nodos"]
    ref = raiz
    while ref >= 0:
        v = x[n["variable"][ref]]
        if n["categorica"][ref]:
            # Una categoría que falta, o una que no está en el conjunto, va a la derecha.
            ir_izq = (not math.isnan(v)) and v >= 0 and int(v) in m["_conjuntos"][int(n["umbral"][ref])]
        else:
            falta = n["falta"][ref]  # 0 ninguno, 1 cero, 2 NaN
            if math.isnan(v) and falta != 2:
                v = 0.0  # LightGBM trata el NaN como cero salvo que el nodo lo haya visto como dato faltante
            if (falta == 1 and abs(v) <= CERO) or (falta == 2 and math.isnan(v)):
                ir_izq = bool(n["falta_izquierda"][ref])
            else:
                ir_izq = v <= n["umbral"][ref]
        ref = n["izquierda"][ref] if ir_izq else n["derecha"][ref]
    return m["hojas"][-1 - ref]


def evaluar(m, entradas):
    """Los doce cuantiles en logaritmo natural, ordenados de menor a mayor."""
    x = vector(m, entradas)
    por = m["arboles_por_cuantil"]
    q = [sum(_hoja(m, r, x) for r in m["arboles"][k * por:(k + 1) * por]) for k in range(len(m["cuantiles"]))]
    return sorted(q)
