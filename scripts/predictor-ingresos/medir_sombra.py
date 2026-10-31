# Mide la prueba en sombra del nivel 1 (docs/investigacion-predictor-de-ingresos.md, 12.30): lo que evaluó scripts/sombra-predictor-ingresos.mjs
# con el perfil de CrediScope de cada persona, contra su ingreso validado de AWS. Son las medidas de la sección 3.1 de la especificación
# (comun.Medidas, las mismas de medir.py), con intervalos del 95% por remuestreo de personas, por manera de servir y por grupo.
#
# Lee research/medida-persona/ de la carpeta principal (muestra.parquet y sombra-nivel1.jsonl, fuera de git). Escribe ahí mismo el resultado por
# persona (sombra-nivel1-por-persona.csv, con identificaciones) y el informe (sombra-nivel1.md), que tiene solo tasas y conteos.
#
#   python -I scripts/predictor-ingresos/medir_sombra.py
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c
from medir import coma, ic, tabla_md

DATOS = Path(c.ENTRADAS).parent / "medida-persona"
MANERAS = {"hoy": "el perfil guardado, hoy", "a_la_consulta": "a la fecha de la consulta de AWS", "con_obligado": "a la consulta, con el obligado del crudo"}
TRAMOS = ["menos de 470", "470 a 939", "940 a 1.999", "2.000 a 2.999", "3.000 a 4.999", "5.000 o más"]


def main():
    aws = pd.read_parquet(DATOS / "muestra.parquet").set_index("identificacion")
    filas = [json.loads(linea) for linea in open(DATOS / "sombra-nivel1.jsonl", encoding="utf-8") if linea.strip()]
    # La misma población que el entrenamiento (preparar.py): ingreso no verificado mayor que 0 y menor que 60.000. Con un 0 el logaritmo no existe.
    evaluadas = len(filas)
    filas = [f for f in filas if 0 < aws.loc[f["cedula"], "unver"] < 60000]
    ced = [f["cedula"] for f in filas]
    a = aws.loc[ced]
    real = a.unver.values.astype(float)
    v = pd.DataFrame([f["maneras"]["a_la_consulta"]["variables"] for f in filas])
    obligado = pd.Series([f["maneras"]["con_obligado"]["variables"]["sri_obligado"] for f in filas])
    print(f"{evaluadas} evaluadas, {len(filas)} con el ingreso no verificado entre 0 y 60.000 (como el entrenamiento); consultas de AWS de {a.t.min():%Y-%m} a {a.t.max():%Y-%m}")

    # Los grupos se arman con lo que el modelo ve a la fecha de la consulta. Proveedor_Info_1 contesta con el RUC de hoy: un RUC que empezó después de la
    # consulta llega con antigüedad 0, y una suspensión posterior llega con 0 años de suspendido; en AWS, a esa fecha, no existían.
    ruc, antig, susp, estado = v.sri_ruc, v.sri_antig, v.sri_susp, v.sri_estado
    sin_cambio = (ruc == 1) & (antig > 0) & ~((estado == "SUSPENDIDO") & (susp == 0))
    grupos = {
        "todas": np.ones(len(a), bool),
        "OK FACTURAR y condicionado": a.resp.isin(c.OK_FACTURAR).values,
        "rechazado": (a.resp == "RECHAZADO").values,
        "las demás respuestas (aprobado, pendiente, sin respuesta)": ~a.resp.isin(c.OK_FACTURAR + ["RECHAZADO"]).values,
        "con RUC en Proveedor_Info_1": (ruc == 1).values,
        "con RUC que ya existía a la consulta y no cambió después": sin_cambio.values,
        "RUC que empezó después de la consulta": ((ruc == 1) & (antig == 0)).values,
        "suspendido después de la consulta": ((estado == "SUSPENDIDO") & (susp == 0)).values,
        "sin RUC en Proveedor_Info_1": (ruc == 0).values,
        "RUC activo": (estado == "ACTIVO").values,
        "RUC suspendido": (estado == "SUSPENDIDO").values,
        "obligado a llevar contabilidad": (obligado == 1).values,
    }
    for anio in sorted(a.t.dt.year.unique()):
        grupos[f"consulta de {anio}"] = (a.t.dt.year == anio).values

    informe = [f"# Prueba en sombra del nivel 1 ({len(filas)} personas de {evaluadas} evaluadas)\n"]
    medidas, por_persona = {}, a[["t", "resp", "unver"]].reset_index()
    for clave, nombre in MANERAS.items():
        Q = np.array([f["maneras"][clave]["cuantilesLog"] for f in filas])
        m = c.Medidas(Q, real)
        medidas[clave] = m
        med = np.exp(Q[:, c.LEV.index(0.50)])
        por_persona[f"{clave}_minimo90"] = np.exp(Q[:, c.LEV.index(0.10)])
        por_persona[f"{clave}_minimo85"] = np.exp(Q[:, c.LEV.index(0.15)])
        por_persona[f"{clave}_central"] = med
        por_persona[f"{clave}_tramo"] = c.probabilidades(Q).argmax(1)
        por_persona[f"{clave}_minimo_respondido"] = [f["maneras"][clave]["minimo90"] for f in filas]
        # La respuesta redondea el mínimo hacia abajo y no lo deja bajar de medio salario básico: se cuenta cuántas veces cambia algo.
        resp_cubre = (real >= por_persona[f"{clave}_minimo_respondido"].values).mean() * 100
        limite = sum(f["maneras"][clave]["limiteDeMedioSbu"] for f in filas)
        informe.append(f"- {nombre}: el real supera el mínimo **respondido** (redondeado y con el límite de medio salario básico) el {coma(resp_cubre)}%; "
                       f"el límite se aplicó en {limite}.")
    por_persona["tramo_real"] = np.digitize(real, c.UMB)

    filas_t = []
    for g, mask in grupos.items():
        idx = np.where(mask)[0]
        if len(idx) == 0:
            continue
        for clave, nombre in MANERAS.items():
            m = medidas[clave]
            r = m.con_intervalos(idx) if len(idx) >= 20 else m.calcular(idx)
            med = np.exp(m.Q[idx, c.LEV.index(0.50)])
            r |= {"grupo": g, "manera": nombre, "error_central": float(np.median(np.abs(np.log(med / real[idx])))),
                  "central_sobre_real": float(np.median(med / real[idx])), "mediana_real": float(np.median(real[idx]))}
            filas_t.append(r)
    t = pd.DataFrame(filas_t)

    def con_ic(f, k, d=1):
        return ic(f, k, d) if f"{k}_ic_bajo" in f and pd.notna(f.get(f"{k}_ic_bajo")) else coma(f[k], d)

    columnas = [("Manera", lambda f: f["manera"]), ("Casos", lambda f: coma(f["n"], 0)), ("R²", lambda f: con_ic(f, "r2", 3)),
                ("El real supera el mínimo del 90% (%)", lambda f: con_ic(f, "cobertura90")), ("Del 85% (%)", lambda f: con_ic(f, "cobertura85")),
                ("Tramo exacto (%)", lambda f: con_ic(f, "tramo_exacto")), ("Central a ±10% (%)", lambda f: coma(f["dentro_10"])),
                ("Error del central (mediana de \\|log\\|)", lambda f: coma(f["error_central"], 3)), ("Central sobre real (mediana)", lambda f: coma(f["central_sobre_real"], 2)),
                ("Mediana del mínimo del 90%", lambda f: coma(f["mediana_min90"], 0)), ("Mediana del real", lambda f: coma(f["mediana_real"], 0)),
                ("Certifica 2.000: % y precisión", lambda f: f"{coma(f['cert2000_pct'])}% y {coma(f['cert2000_precision'])}%")]
    for g in grupos:
        sub = [f for f in filas_t if f["grupo"] == g]
        if sub:
            informe.append(f"\n## {g}\n\n" + tabla_md(sub, columnas))

    # Los tramos: cuántas personas de cada tramo real caen en cada tramo predicho (el de mayor probabilidad), a la consulta con el obligado.
    cruce = pd.crosstab(pd.Categorical(por_persona.tramo_real.map(dict(enumerate(TRAMOS))), TRAMOS),
                        pd.Categorical(por_persona.con_obligado_tramo.map(dict(enumerate(TRAMOS))), TRAMOS), dropna=False)
    informe.append("\n## Tramo real (filas) contra tramo predicho (columnas), a la consulta con el obligado\n\n"
                   + "| Real | " + " | ".join(TRAMOS) + " |\n|" + "---|" * (len(TRAMOS) + 1) + "\n"
                   + "\n".join(f"| {r} | " + " | ".join(str(int(x)) for x in cruce.loc[r]) + " |" for r in TRAMOS))

    # Lo que entra al modelo, contra el entrenamiento: una población distinta explica una cobertura distinta.
    tr = c.cargar_tabla()
    def resumen(df, ob):
        return {"edad (mediana)": coma(df.edad.median(), 0), "masculino (%)": coma(100 * (df.genero == "MASCULINO").mean()),
                "con RUC (%)": coma(100 * (df.sri_ruc == 1).mean()), "RUC activo (%)": coma(100 * (df.sri_estado == "ACTIVO").mean()),
                "con años de suspendido (%)": coma(100 * df.sri_susp.notna().mean()), "antigüedad del RUC (mediana, años)": coma(df.sri_antig.median()),
                "obligado (%)": coma(100 * (ob == 1).mean()), "ingreso validado (mediana)": coma(df.unver.median(), 0)}
    v2 = v.assign(unver=real)
    filas_r = [{"variable": k, "entrenamiento": x, "sombra": y} for (k, x), y in zip(resumen(tr, tr.sri_obligado).items(), resumen(v2, obligado).values())]
    informe.append(f"\n## Las entradas, contra el entrenamiento ({c.miles(len(tr))} independientes de 2026)\n\n"
                   + tabla_md(filas_r, [("Variable", lambda f: f["variable"]), ("Entrenamiento", lambda f: f["entrenamiento"]), ("Sombra (a la consulta)", lambda f: f["sombra"])]))

    por_persona.to_csv(DATOS / "sombra-nivel1-por-persona.csv", index=False)
    t.to_csv(DATOS / "sombra-nivel1-medidas.csv", index=False)
    (DATOS / "sombra-nivel1.md").write_text("\n".join(informe) + "\n", encoding="utf-8")
    print("\n".join(informe))


if __name__ == "__main__":
    main()
