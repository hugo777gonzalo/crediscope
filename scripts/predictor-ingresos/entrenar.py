# Entrena el predictor de ingresos de los niveles 1 y 2 y deja los modelos fuera del repositorio, cada uno con su manifiesto
# (versiones de las bibliotecas, huella del archivo de entrenamiento, semillas, categorías y variables).
#
# Dos juegos de modelos, porque sirven para cosas distintas:
#   validacion-hasta-2026-06/  entrenado con las consultas de antes de julio; lo que `medir` y `calibrar` prueban de julio a octubre
#                              (el SRI solo existe desde diciembre de 2025: partir por fecha es la prueba que se parece al uso real).
#   completo/                  entrenado con todo 2026; el que se exporta (`exportar.py`).
#
#   python -I scripts/predictor-ingresos/entrenar.py [--solo=validacion|completo]
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import comun as c


def entrenar(t, nivel, carpeta, motivo):
    # Las categorías salen del propio entrenamiento: una que el modelo no vio se sirve como dato faltante, igual que lo hará el evaluador.
    cat = c.categorias_de(t)
    cols = c.NIVELES[nivel]
    t0 = time.time()
    modelos = c.entrenar_cuantiles(c.matriz(t, cols, cat), t.y)
    c.guardar_modelo(carpeta, modelos, cols, {k: v for k, v in cat.items() if k in cols}, {
        "nivel": nivel, "motivo": motivo, "n": len(t), "consultas_desde": str(t.t.min()), "consultas_hasta": str(t.t.max()),
        "archivo_de_entrenamiento": c.TABLA.name, "huella_sha256": c.huella(c.TABLA),
        "parametros": c.PAR | {"n_estimators": c.N_ARBOLES, "objective": "quantile"}, "objetivo": "logaritmo del ingreso no verificado (unver)",
    })
    print(f"nivel {nivel} · {motivo}: {c.miles(len(t))} personas, {len(cols)} variables, {time.time() - t0:.0f} s -> {carpeta}", flush=True)


def main():
    solo = next((a.split("=")[1] for a in sys.argv[1:] if a.startswith("--solo=")), None)
    t = c.cargar_tabla()
    for nivel in (1, 2):
        if solo in (None, "validacion"):
            entrenar(t[t.t < c.CORTE_FECHA], nivel, c.MODELOS / "validacion-hasta-2026-06" / f"nivel{nivel}", "validación por fecha: entrenado hasta junio de 2026")
        if solo in (None, "completo"):
            entrenar(t, nivel, c.MODELOS / "completo" / f"nivel{nivel}", "modelo para exportar: todo 2026")


if __name__ == "__main__":
    main()
