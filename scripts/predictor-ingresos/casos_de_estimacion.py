# Los casos de oro de la estimación de punta a punta (`_shared/estimacion-de-ingreso.test.ts`): de un perfil INVENTADO a las
# variables, los cuantiles y los montos que contesta `estimar-ingreso`. Los casos de `exportar.py` prueban los árboles con
# entradas sueltas; estos prueban además que el perfil llega bien a los árboles.
#
# Para que la prueba no se compare contra su propio código, acá las variables se calculan con las definiciones de la
# especificación (4.1 y 5), sin leer `variables-de-ingreso.ts`, y los cuantiles salen del evaluador de referencia.
# La integración continua comprueba las variables; los cuantiles y los montos, sólo donde esté el modelo real.
#
#   python -I scripts/predictor-ingresos/casos_de_estimacion.py [ruta del modelo del nivel 1]
#
# Se vuelve a correr después de exportar un modelo nuevo del nivel 1: el cambio se ve en el diff.
import datetime
import json
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import evaluador_referencia as ev

MODELO = Path(sys.argv[1] if len(sys.argv) > 1 else "C:/datos/ingresos/modelos/exportado/ingreso-v1-nivel1.json.gz")
DESTINO = Path(__file__).parent / "casos-de-oro" / "estimaciones-nivel1.json"
TOLERANCIA = 0.001  # en logaritmo, la de la especificación (6.2)
DIAS_POR_ANIO = 365.25
SBU_POR_ANIO = {2025: 470, 2026: 482}  # `SBU_POR_ANIO` de fuentes-ingreso.ts


def fecha_en_ecuador(momento):
    """Ecuador es UTC-5, sin horario de verano."""
    utc = datetime.datetime.fromisoformat(momento.replace("Z", "+00:00"))
    return (utc - datetime.timedelta(hours=5)).date()


def anio_mes(fecha):
    return fecha.year + (fecha.month - 1) / 12


def anios_desde(desde, hasta):
    return max(0, (hasta - datetime.date.fromisoformat(desde)).days) / DIAS_POR_ANIO


def laboral(estado, inicio=None, obligado=None, cese=None, tipo_cese=None):
    return {"estadoActividadEconomica": estado, "fechaInicioActividadesRuc": inicio, "fechaCeseActividadesRuc": cese,
            "tipoUltimoCeseRuc": tipo_cese, "obligadoALlevarContabilidadRuc": obligado}


CONTESTO = {"fuentesConDatos": ["contribuyente"], "fuentesSinDatos": [], "fuentesNoMedidas": []}

# Personas inventadas. `sin_clave_del_obligado` es un perfil anterior a estructura-v15: la clave no existe, no es nula.
CASOS = [
    dict(id="con-ruc-activo", consultado="2026-10-15T17:00:00Z", edad=41, genero="Femenino", laboral=laboral("activa_sin_interrupciones", "2015-03-10", False), meta=CONTESTO),
    dict(id="obligado-a-contabilidad", consultado="2026-08-03T15:30:00Z", edad=55, genero="MASCULINO", laboral=laboral("activa_reactivada", "2001-06-01", True), meta=CONTESTO),
    dict(id="sin-ruc", consultado="2026-09-20T20:00:00Z", edad=29, genero="MASCULINO", laboral=laboral("sin_ruc"),
         meta={"fuentesConDatos": [], "fuentesSinDatos": ["contribuyente"], "fuentesNoMedidas": []}),
    dict(id="el-contribuyente-no-contesto", consultado="2026-09-20T20:00:00Z", edad=36, genero="FEMENINO", laboral=laboral(None),
         meta={"fuentesConDatos": [], "fuentesSinDatos": [], "fuentesNoMedidas": ["contribuyente"]}),
    dict(id="ruc-suspendido", consultado="2026-07-07T14:00:00Z", edad=63, genero="MASCULINO",
         laboral=laboral("inactiva_nunca_reactivada", "1998-11-23", False, "2024-02-20", "suspension_definitiva"), meta=CONTESTO),
    dict(id="perfil-anterior-a-v15", consultado="2026-05-04T16:00:00Z", edad=47, genero="FEMENINO", sin_clave_del_obligado=True,
         laboral=laboral("activa_sin_interrupciones", "2019-01-15"), meta=CONTESTO),
    dict(id="fin-de-anio-en-ecuador", consultado="2026-01-01T03:00:00Z", edad=38, genero="MASCULINO", laboral=laboral("activa_sin_interrupciones", "2020-12-31", False), meta=CONTESTO),
    dict(id="sexo-que-el-modelo-no-conoce", consultado="2026-10-15T17:00:00Z", edad=33, genero="OTRO", laboral=laboral("activa_sin_interrupciones", "2022-08-01", False), meta=CONTESTO),
]


def variables(c):
    hoy = fecha_en_ecuador(c["consultado"])
    genero = c["genero"].upper()
    v = {"edad": c["edad"], "genero": genero if genero in ("FEMENINO", "MASCULINO") else None, "anio_mes": anio_mes(hoy),
         "sri_ruc": None, "sri_estado": None, "sri_obligado": None, "sri_antig": None, "sri_susp": None}
    lab = c["laboral"]
    estado = lab["estadoActividadEconomica"]
    if "contribuyente" in c["meta"]["fuentesNoMedidas"] or estado is None:
        return v
    if estado == "sin_ruc":
        v["sri_ruc"] = 0
        return v
    v["sri_ruc"] = 1
    v["sri_estado"] = "ACTIVO" if estado.startswith("activa") else "SUSPENDIDO"
    v["sri_antig"] = anios_desde(lab["fechaInicioActividadesRuc"], hoy)
    if lab["tipoUltimoCeseRuc"] == "suspension_definitiva":
        v["sri_susp"] = anios_desde(lab["fechaCeseActividadesRuc"], hoy)
    if not c.get("sin_clave_del_obligado"):
        obligado = lab["obligadoALlevarContabilidadRuc"]
        v["sri_obligado"] = None if obligado is None else int(obligado)
    return v


def centavos_hacia_abajo(valor):
    return math.floor(valor * 100 + 1e-6) / 100


def montos(cuantiles_log, niveles, anio):
    limite = SBU_POR_ANIO[anio] / 2
    minimo = lambda q: centavos_hacia_abajo(max(math.exp(cuantiles_log[niveles.index(q)]), limite))
    return {"minimo90": minimo(0.10), "minimo85": minimo(0.15), "valorCentral": round(math.exp(cuantiles_log[niveles.index(0.50)]), 2)}


def perfil(c):
    lab = dict(c["laboral"])
    if c.get("sin_clave_del_obligado"):
        del lab["obligadoALlevarContabilidadRuc"]
    return {"identidad": {"nombreCompleto": "PERSONA INVENTADA", "edad": c["edad"], "genero": c["genero"]}, "laboral": lab, "metaConsulta": c["meta"],
            "fuentesIngreso": {"segmento": "independiente", "corteIessUsado": None, "fuentes": []}}


modelo = ev.cargar(MODELO)
salida = []
for c in CASOS:
    v = variables(c)
    q = ev.evaluar(modelo, v)
    anio = fecha_en_ecuador(c["consultado"]).year
    salida.append({"id": c["id"], "consultadoEl": c["consultado"], "perfil": perfil(c), "variables": v, "cuantiles_log": q, **montos(q, modelo["cuantiles"], anio)})

DESTINO.write_text(json.dumps({
    "descripcion": "Casos de oro de la estimación de punta a punta: perfiles inventados (no salen de ninguna persona), las variables calculadas con las definiciones de la especificación y los cuantiles del evaluador de referencia.",
    "modelo": MODELO.name,
    "huella_entrenamiento_sha256": modelo["origen"]["huella_entrenamiento_sha256"],
    "tolerancia": TOLERANCIA,
    "casos": salida,
}, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
print(f"{len(salida)} casos en {DESTINO.name}")
