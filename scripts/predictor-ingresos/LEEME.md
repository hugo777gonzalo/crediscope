# Predictor de ingresos: entrenamiento y medición

Reproduce lo que está en `docs/investigacion-predictor-de-ingresos.md` (12.24 y 12.26) y en `docs/especificacion-predictor-de-ingresos.md` (3.1), solo con los niveles 1 y 2.
Reemplaza a los guiones sueltos de `C:\datos\ingresos\scripts` (`r2_4`, `r2_5`, `r4_4`, `r4_5`, `r4_7`, `r4_8`, `r4_10` y `r4_11`), que se llamaban entre sí con `exec`.

**Nada de acá tiene datos ni identificaciones.** Las entradas están en `research/ingresos-aws/` (fuera de git, de la carpeta principal del repositorio); las tablas intermedias,
en `C:\datos\ingresos\resultados\predictor-ingresos\` y los modelos, en `C:\datos\ingresos\modelos\`. Se cambian con `PREDICTOR_ENTRADAS`, `PREDICTOR_RESULTADOS` y `PREDICTOR_MODELOS`.
Ningún guion consulta AWS: leen las extracciones que ya están en disco.

## Cómo se corre

Con el entorno de `C:\datos\ingresos\entorno` y la bandera `-I` (no carga código de la carpeta actual). Versiones en `requisitos.txt`. Desde la raíz del repositorio:

```bash
C:/datos/ingresos/entorno/Scripts/python.exe -I scripts/predictor-ingresos/preparar.py
C:/datos/ingresos/entorno/Scripts/python.exe -I scripts/predictor-ingresos/entrenar.py
C:/datos/ingresos/entorno/Scripts/python.exe -I scripts/predictor-ingresos/medir.py
```

| Guion | Qué hace | Tarda |
|---|---|---|
| `preparar.py` | La tabla por persona (`personas.parquet`) y `preparar.json` con el embudo y las huellas de las entradas | 10 s |
| `entrenar.py` | Los doce cuantiles de cada nivel, hasta junio (para validar) y con todo 2026 (para exportar), con manifiesto | 15 s |
| `medir.py` | Las tablas de 3.1 y 12.24 con intervalos del 95%, la cobertura por grupo y por respuesta, y el cotejo número a número con los guiones viejos | 3 min |

`comun.py` tiene lo compartido: variables de cada nivel, parámetros del modelo y medidas.

## Reglas que el código hace cumplir

- Nunca entran `activo_*`, `egreso_*`, `pasivo_*`, `incumplimiento_*`, el predictor de Equifax ni la respuesta comercial: `comun.verificar_entradas()` corta si una columna así llega a una matriz, y `preparar.py` ni siquiera lee la tabla de datos internos.
- Una consulta por persona (la más reciente); la identificación se usa en memoria para eso y no se escribe.
- Semilla fija (las semillas por omisión de LightGBM, explícitas) y partición por persona igual a la de los guiones viejos: los números coinciden con ellos.
- Cada modelo lleva su manifiesto: versiones de las bibliotecas, huella SHA-256 del archivo de entrenamiento, parámetros, variables y categorías.
