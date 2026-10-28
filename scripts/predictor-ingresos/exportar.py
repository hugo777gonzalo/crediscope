# Exporta cada nivel del modelo completo a un archivo compacto (formato en FORMATO.md) y escribe los casos de oro para la prueba del evaluador.
# Los archivos exportados quedan fuera de git (C:\datos\ingresos\modelos\exportado\); los casos de oro, que son entradas INVENTADAS con las salidas del modelo
# en Python, sí van al repositorio (casos-de-oro/): el evaluador de `_shared/` los tiene que reproducir con una diferencia menor que 0,001 en el logaritmo.
# Antes de escribir nada, el evaluador de referencia (Python puro) se prueba contra LightGBM: si no coinciden, no se exporta.
#
#   python -I scripts/predictor-ingresos/exportar.py
import datetime
import gzip
import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
import evaluador_referencia as ev

VERSION = "ingreso-v1"
CASOS = Path(__file__).parent / "casos-de-oro"
DESTINO = c.MODELOS / "exportado"
N_CASOS = 200
TOLERANCIA = 0.001  # en logaritmo, la de la especificación (6.2)


def convertir(carpeta, nivel):
    m = c.ModeloGuardado(carpeta)
    man = m.manifiesto
    variables = [{"nombre": v, "tipo": "categorica", "categorias": man["categorias"][v]} if v in man["categorias"] else {"nombre": v, "tipo": "numerica"} for v in m.columnas]
    pos = {v: i for i, v in enumerate(m.columnas)}
    nodos = {k: [] for k in ("variable", "umbral", "categorica", "falta", "falta_izquierda", "izquierda", "derecha")}
    conjuntos, hojas, raices = [], [], []
    for b in m.boosters:
        d = b.dump_model()
        assert d["feature_names"] == m.columnas
        for arbol in d["tree_info"]:
            raiz = arbol["tree_structure"]
            if "split_index" not in raiz:  # un árbol de una sola hoja
                hojas.append(raiz["leaf_value"])
                raices.append(-len(hojas))
                continue
            por_indice, hoja_de = {}, {}

            def recorrer(n):
                if "split_index" in n:
                    por_indice[n["split_index"]] = n
                    recorrer(n["left_child"])
                    recorrer(n["right_child"])
                else:
                    hoja_de[n["leaf_index"]] = n["leaf_value"]
            recorrer(raiz)
            n0, h0 = len(nodos["variable"]), len(hojas)
            hojas.extend(hoja_de[i] for i in range(len(hoja_de)))

            def ref(h):
                return n0 + h["split_index"] if "split_index" in h else -1 - (h0 + h["leaf_index"])
            for i in range(len(por_indice)):
                n = por_indice[i]
                cat = n["decision_type"] == "=="
                nodos["variable"].append(pos[d["feature_names"][n["split_feature"]]])
                if cat:
                    nodos["umbral"].append(len(conjuntos))
                    conjuntos.append([int(x) for x in str(n["threshold"]).split("||")])
                else:
                    assert n["decision_type"] == "<="
                    nodos["umbral"].append(float(n["threshold"]))
                nodos["categorica"].append(int(cat))
                nodos["falta"].append({"None": 0, "Zero": 1, "NaN": 2}[n["missing_type"]])
                nodos["falta_izquierda"].append(int(bool(n["default_left"])))
                nodos["izquierda"].append(ref(n["left_child"]))
                nodos["derecha"].append(ref(n["right_child"]))
            raices.append(ref(raiz))
    return {
        "formato": "crediscope-arboles-1", "version": VERSION, "nivel": nivel, "entrenado_el": datetime.date.today().isoformat(),
        "objetivo": "logaritmo natural del ingreso mensual no verificado, en dólares", "cuantiles": c.LEV, "arboles_por_cuantil": c.N_ARBOLES,
        "variables": variables, "arboles": raices, "nodos": nodos, "conjuntos": conjuntos, "hojas": hojas,
        "origen": {"huella_entrenamiento_sha256": man["huella_sha256"], "n": man["n"], "consultas_desde": man["consultas_desde"], "consultas_hasta": man["consultas_hasta"],
                   "parametros": man["parametros"], "versiones": man["versiones"]},
    }


# ---------------------------------------------------------------- entradas inventadas
CONTEOS = {"meses_aporte": 300, "n_empleos": 5, "n_inst": 8, "n_creditos": 40, "n_oper": 50, "n_consumo": 6, "n_tarjeta": 6, "n_micro": 6, "n_vivienda": 3}
MORA = {"max_mora", "max_dias_t"}
BINARIAS = {"sri_ruc", "sri_obligado"}


def inventar(m, n, rng):
    """`n` entradas que no salen de ninguna persona: cada variable de su propia distribución, con datos faltantes, categorías que el modelo nunca vio y valores extremos."""
    filas = []
    escala = {v["nombre"]: float(np.exp(rng.uniform(np.log(30), np.log(30000)))) for v in m["variables"] if v["tipo"] == "numerica"}
    for _ in range(n):
        f = {}
        for v in m["variables"]:
            nombre = v["nombre"]
            if nombre in ("sri_susp", "edad", "anio_mes"):
                falta = {"sri_susp": 0.8, "edad": 0.02, "anio_mes": 0.04}[nombre]
            else:
                falta = 0.15 if nombre in escala and nombre not in CONTEOS and nombre not in BINARIAS else 0.08
            if rng.random() < falta:
                f[nombre] = None
            elif v["tipo"] == "categorica":
                f[nombre] = "CATEGORÍA INVENTADA SIN VER" if rng.random() < 0.04 else v["categorias"][rng.integers(len(v["categorias"]))]
            elif nombre == "edad":
                f[nombre] = int(rng.integers(18, 81))
            elif nombre == "anio_mes":
                f[nombre] = round(float(rng.uniform(2025.9, 2027.2)), 4)  # más allá del último mes entrenado el modelo se comporta como en ese mes
            elif nombre in BINARIAS:
                f[nombre] = int(rng.integers(0, 2))
            elif nombre in ("sri_antig", "sri_susp"):
                f[nombre] = round(float(rng.uniform(0, 45)), 3)
            elif nombre in CONTEOS:
                f[nombre] = int(rng.integers(0, CONTEOS[nombre] + 1))
            elif nombre in MORA:
                f[nombre] = 0 if rng.random() < 0.6 else int(rng.integers(1, 1500))
            elif nombre in ("g6", "g12"):
                f[nombre] = round(float(rng.uniform(0, 20)), 3)
            else:
                f[nombre] = 0.0 if rng.random() < 0.12 else round(float(rng.lognormal(np.log(escala[nombre]), 0.9)), 2)
        filas.append(f)
    return filas


def casos_extremos(m, rng):
    """Casos que cada uno prueba una regla del formato: todo faltante, todo cero, valores enormes, y valores justo en el umbral de una división (`<=`)."""
    num = [v["nombre"] for v in m["variables"] if v["tipo"] == "numerica"]
    cat = [v["nombre"] for v in m["variables"] if v["tipo"] == "categorica"]
    casos = [{v["nombre"]: None for v in m["variables"]}, {v["nombre"]: (0 if v["tipo"] == "numerica" else v["categorias"][0]) for v in m["variables"]},
             {v["nombre"]: (1e9 if v["tipo"] == "numerica" else "NO EXISTE") for v in m["variables"]}, {v["nombre"]: (-5 if v["tipo"] == "numerica" else None) for v in m["variables"]}]
    n = m["nodos"]
    numericos = [i for i in range(len(n["variable"])) if not n["categorica"][i]]
    for i in rng.choice(numericos, 8, replace=False):
        base = inventar(m, 1, rng)[0]
        nombre = m["variables"][n["variable"][i]]["nombre"]
        base[nombre] = n["umbral"][i]  # exactamente en el umbral: va a la izquierda
        casos.append(base)
        sig = dict(base)
        sig[nombre] = float(np.nextafter(n["umbral"][i], np.inf))  # el siguiente número: va a la derecha
        casos.append(sig)
    return casos


def a_tabla(entradas, m):
    return pd.DataFrame([{v["nombre"]: e.get(v["nombre"]) for v in m["variables"]} for e in entradas])


def main():
    DESTINO.mkdir(parents=True, exist_ok=True)
    CASOS.mkdir(parents=True, exist_ok=True)
    for nivel in (1, 2):
        carpeta = c.MODELOS / "completo" / f"nivel{nivel}"
        lgb_modelo = c.ModeloGuardado(carpeta)
        compacto = convertir(carpeta, nivel)
        ruta = DESTINO / f"{VERSION}-nivel{nivel}.json.gz"
        crudo = json.dumps(compacto, separators=(",", ":"), allow_nan=False).encode("utf-8")
        # mtime=0: el mismo modelo da los mismos bytes, y la huella del archivo sirve para saber si cambió.
        with gzip.GzipFile(ruta, "wb", compresslevel=9, mtime=0) as f:
            f.write(crudo)
        m = ev.cargar(ruta)
        sin_comprimir = len(crudo)

        # 1) el evaluador de referencia contra LightGBM, con muchas entradas inventadas
        rng = np.random.default_rng(1000 + nivel)
        prueba = casos_extremos(m, rng) + inventar(m, 4000, rng)
        esperado = lgb_modelo.predecir(a_tabla(prueba, m))
        obtenido = np.array([ev.evaluar(m, e) for e in prueba])
        peor = float(np.abs(esperado - obtenido).max())
        print(f"nivel {nivel}: {c.miles(len(prueba))} entradas inventadas, diferencia máxima entre el evaluador de referencia y LightGBM: {peor:.2e}")
        if peor > 1e-9:
            raise SystemExit(f"El evaluador de referencia no reproduce a LightGBM (diferencia {peor:.2e}): no se escribe el archivo ni los casos de oro.")

        # 2) los casos de oro: 200 entradas inventadas, con las salidas de LightGBM
        rng = np.random.default_rng(2026_10_22 + nivel)
        oro = (casos_extremos(m, rng) + inventar(m, N_CASOS, rng))[:N_CASOS]
        salida = lgb_modelo.predecir(a_tabla(oro, m))
        casos = [{"id": f"n{nivel}-{i + 1:03d}", "entradas": e, "cuantiles_log": [float(x) for x in s]} for i, (e, s) in enumerate(zip(oro, salida))]
        cabecera = {
            "descripcion": f"Casos de oro del nivel {nivel} del predictor de ingresos: entradas inventadas (no salen de ninguna persona) y los doce cuantiles en logaritmo natural que da LightGBM, ordenados.",
            "modelo": f"{VERSION}-nivel{nivel}.json.gz", "huella_entrenamiento_sha256": compacto["origen"]["huella_entrenamiento_sha256"],
            "tolerancia": TOLERANCIA, "cuantiles": c.LEV}
        # Una línea por caso: el archivo se lee y se compara en un diff.
        lineas = ",\n".join("  " + json.dumps(k, ensure_ascii=False, allow_nan=False) for k in casos)
        texto = json.dumps(cabecera, ensure_ascii=False, indent=1)[:-2] + ',\n "casos": [\n' + lineas + "\n ]\n}\n"
        (CASOS / f"nivel{nivel}.json").write_text(texto, encoding="utf-8")
        dif = max(float(np.abs(np.array(ev.evaluar(m, k["entradas"])) - k["cuantiles_log"]).max()) for k in casos)
        sha = c.huella(ruta)
        (DESTINO / f"{VERSION}-nivel{nivel}.json.gz.sha256").write_text(sha + "\n", encoding="utf-8")
        print(f"nivel {nivel}: {ruta.name}: {ruta.stat().st_size / 1e6:.2f} MB comprimido, {sin_comprimir / 1e6:.2f} MB sin comprimir, {c.miles(len(m['nodos']['variable']))} divisiones, "
              f"{c.miles(len(m['hojas']))} hojas, {c.miles(len(m['conjuntos']))} conjuntos de categorías; casos de oro: {len(casos)}, diferencia máxima del evaluador de referencia {dif:.2e}; sha256 {sha[:16]}…")
    print("casos de oro en", CASOS)


if __name__ == "__main__":
    main()
