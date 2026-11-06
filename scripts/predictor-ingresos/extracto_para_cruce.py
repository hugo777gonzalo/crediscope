# Vuelca a JSON por línea las columnas de Equifax de la tabla de entrenamiento (personas.parquet), para que `matriz-desde-crudo.mjs` (Node,
# que no lee parquet) las cruce con la matriz armada desde el crudo. Los nombres salen de `comun.py` (NIVELES[2]): es la única definición.
# La tabla y su salida quedan fuera de git (son datos de personas); no se escribe la etiqueta (`unver`) porque el cruce no la usa.
#
#   C:/datos/ingresos/entorno/Scripts/python.exe -I scripts/predictor-ingresos/extracto_para_cruce.py <salida.jsonl>
#
# Imprime una línea de JSON con las variables, el orden de NIVELES[2] y la huella de la tabla; el guion de Node la verifica.
import json
import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).parent))
import comun as c


def main():
    if len(sys.argv) != 2:
        sys.exit("Uso: extracto_para_cruce.py <salida.jsonl>")
    t = pd.read_parquet(c.TABLA)
    # Lo que no sale del crudo de Equifax (la persona y el IESS vienen de otra fuente) ni está en la tabla (`anio_mes` se calcula de la fecha).
    de_equifax = [x for x in c.NIVELES[2] if x not in c.PERSONA + c.ZONA + c.IESS + ["anio_mes"]]
    columnas = ["id_consulta_equifax", "t", "sri_bloque", "med_resp"] + de_equifax
    faltan = [x for x in columnas if x not in t.columns]
    if faltan:
        sys.exit(f"La tabla no trae las columnas {faltan}: ¿cambió preparar.py?")
    t[columnas].to_json(sys.argv[1], orient="records", lines=True, date_format="iso", date_unit="s", force_ascii=False)
    print(json.dumps({"filas": len(t), "variables_de_equifax": de_equifax, "nivel2": c.NIVELES[2], "tabla_sha256": c.huella(c.TABLA)}))


if __name__ == "__main__":
    main()
