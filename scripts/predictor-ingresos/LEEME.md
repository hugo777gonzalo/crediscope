# Predictor de ingresos: entrenamiento, medición y exportación

Reproduce lo que está en `docs/investigacion-predictor-de-ingresos.md` (12.24 a 12.26 y 12.30) y en `docs/especificacion-predictor-de-ingresos.md` (3.1, 5 y 6), solo con los niveles 1 y 2.
El nivel 1 es la edad, el sexo, la fecha de la consulta y el SRI de Proveedor_Info_1 desde el 2026-10-29 (`comun.NIVELES`); el anterior, con el estado civil, la zona y el IESS de AWS, sigue en `comun.NIVEL_1_ANTERIOR` para comparar y para reproducir 12.24 a 12.26.
Reemplaza a los guiones sueltos de `C:\datos\ingresos\scripts` (`r2_4`, `r2_5`, `r4_4`, `r4_5`, `r4_7`, `r4_8`, `r4_10` y `r4_11`), que se llamaban entre sí con `exec`.

**Nada de acá tiene datos ni identificaciones.** Las entradas están en `research/ingresos-aws/` (fuera de git, de la carpeta principal del repositorio); las tablas intermedias,
en `C:\datos\ingresos\resultados\predictor-ingresos\` y los modelos, en `C:\datos\ingresos\modelos\`. Se cambian con `PREDICTOR_ENTRADAS`, `PREDICTOR_RESULTADOS` y `PREDICTOR_MODELOS`.
Lo único que sale a git son los casos de oro (`casos-de-oro/`), con entradas inventadas, y las métricas agregadas de cada modelo (`metricas/`). Ningún guion consulta AWS: leen las extracciones que ya están en disco.

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
| `entrenar.py` | Los doce cuantiles de cada nivel, hasta junio (para validar) y con todo 2026 (para exportar), con manifiesto; `--nivel=1` reentrena uno solo | 15 s |
| `medir.py` | Las tablas de 3.1 y 12.24 con intervalos del 95%, el nivel 1 contra el anterior y sin cada variable discutida (12.30), la cobertura por grupo y por respuesta, y el cotejo número a número con los guiones viejos | 2 min |
| `calibrar.py` | Calibración conforme de cuantiles y cuánto baja el mínimo | 5 min |
| `robustez.py` | El nivel 1 anterior sin zona y con variables alteradas (12.26) | 5 min |
| `exportar.py` | El formato compacto (`FORMATO.md`), su prueba contra LightGBM y los 200 casos de oro por nivel; `--nivel=1` exporta uno solo. `--version=ingreso-v2` exporta los modelos de `ingreso_v2.py`, con su calibración adentro, y escribe `casos-de-oro/ingreso-v2-nivelN.json` (los de `ingreso-v1` son `nivelN.json` y no se tocan) | 1 min |
| `casos_de_estimacion.py` | Los casos de oro de la estimación de punta a punta: perfiles inventados, las variables calculadas aparte y los cuantiles del evaluador de referencia. Se corre después de exportar un nivel 1 nuevo | 1 s |
| `medir_sombra.py` | La prueba en sombra del nivel 1 (12.30) contra el ingreso validado, con las medidas de `medir.py`: lee lo que evaluó `scripts/sombra-predictor-ingresos.mjs` | 10 s |
| `matriz-desde-crudo.mjs` | **Node, no Python** (fase 2): pasa los JSON crudos de Equifax bajados de AWS (`research/ingresos-aws/crudo-equifax/`) por `vectorDeNivel2` (el mismo de producción, desde el crudo), con la fecha de la consulta como reloj, y escribe la matriz del nivel 2 en `C:/datos/ingresos/resultados/matriz-crudo/`. Cuenta lo que falló, los vacíos de cada variable, cuántas cruzan con `personas.parquet` (por la id de consulta) y la paridad de cada variable de Equifax contra el extracto; **sale con 1 si alguna baja del 100%** en las que cruzan (desde `variables-de-ingreso-v2`, 12.35). Llama a `extracto_para_cruce.py` (que vuelca la tabla leyendo los nombres de `comun.py`). No entrena ni consulta nada. `--limite=N --sin-cruce` para probar, `--resumen-git=` para guardar los agregados (`metricas/matriz-desde-crudo-v2-2026-11.json`) | 80 s |
| `destilacion.py` | La fase 4 de la revisión (12.34): D3 (pesos por la calidad de la etiqueta y calibración con OK FACTURAR), D2 (la distancia a un alumno del predictor de Equifax como alerta para pedir documentos, y a la cifra misma) y D1 (el predictor de Equifax etiqueta las consultas sin ingreso validado), cada una con su regla; lee en memoria la cifra de Equifax, los documentos y el historial de los flujos, que nunca entran como variable. Agregados en `metricas/destilacion-2026-11.json`; `--solo=etiqueta,d3,d2,d1`. `cifra-de-equifax-en-consultas.mjs` (Node, sólo lectura) cuenta qué consultas de `consultas_equifax` traen la cifra | 6 min con las copias de la fase 0 |
| `ingreso_v2.py` | `ingreso-v2` (12.35): el nivel 2 sin lo que Proveedor_Info_1 no da (`comun.NIVELES_V2`) y los dos niveles calibrados con OK FACTURAR y condicionado. Mide siete variantes hacia adelante con el marco de la fase 0 y en las 3.935 consultas con el crudo (lee la matriz de `matriz-desde-crudo.mjs`), aplica la regla «desde febrero», mide el sexo con y sin él y, con `--solo=entrenar`, deja los modelos completos en `MODELOS/ingreso-v2/` con la calibración en el manifiesto y `metricas/ingreso-v2-nivelN.json`. `--sin-sexo` entrena sin el sexo (lo decide el negocio). Después: `exportar.py --version=ingreso-v2` | 8 min la primera vez, 3 con las copias de `ingreso-v2/copias/` |
| `linea_base.py` | La fase 0 de la revisión (12.32): el nivel 1 y el 2 contra una línea base sin variables, las curvas de aprendizaje, la cobertura por grupo, el costo del sexo, qué etiquetas usar, las versiones del predictor de Equifax, la decisión de la capacidad de pago y las colas de la distribución; agregados en `metricas/linea-base-2026-11.json`. `--solo=1,2,...` corre algunas secciones, `--rapido` prueba con pocos remuestreos | 10 min la primera vez, 6 con las copias de `linea-base/copias/` |
| `tipos_y_grupos.py` | El paso 1 de 3.5 de la especificación y las agrupaciones (12.36), sobre `ingreso-v2` y hacia adelante: la confiabilidad por tipo de persona (formal, semiformal, poco formal, RUC no activo, sin RUC y rentista, con el SRI de Equifax), el ingreso extra del dependiente con el SRI, k-medias, mezcla de gaussianas y k-medoides con Gower (de 2 a 12 grupos, por estabilidad y silueta), un árbol sobre el error y las hojas del modelo; cada agrupación como variable, con un modelo por grupo y con su calibración, los grados por el ancho del rango, la calibración de la probabilidad de superar cada umbral y el declarado contra lo probable. Cada prueba con su regla en el encabezado. Lee las copias de `ingreso_v2.py`; agregados en `metricas/tipos-y-grupos-2026-11.json` (grupos de menos de 50 personas sin medianas de montos). `--solo=A,B,C`, `--rapido` | 10 min |

**La prueba en sombra** usa el modelo exportado con las entradas de producción: `node scripts/sombra-predictor-ingresos.mjs` arma las variables del nivel 1 con `variables-de-ingreso.ts` desde el perfil que guardó CrediScope (sólo lectura de `client_profiles`, con `.env.functions`) y evalúa con `predictor-ingresos.ts`;
después, `medir_sombra.py` lo compara con el ingreso validado de AWS. Lee y escribe `research/medida-persona/` (fuera de git): el resultado por persona queda ahí, y al repositorio solo van tasas y conteos.

`comun.py` tiene lo compartido (variables de cada nivel, parámetros, medidas) y `evaluador_referencia.py` es el evaluador del formato en Python puro.

## Reglas que el código hace cumplir

- Nunca entran `activo_*`, `egreso_*`, `pasivo_*`, `incumplimiento_*`, el predictor de Equifax ni la respuesta comercial: `comun.verificar_entradas()` corta si una columna así llega a una matriz, y `preparar.py` ni siquiera lee la tabla de datos internos.
- Una consulta por persona (la más reciente); la identificación se usa en memoria para eso y no se escribe.
- Semilla fija (las semillas por omisión de LightGBM, explícitas) y partición por persona igual a la de los guiones viejos: los números coinciden con ellos.
- Cada modelo lleva su manifiesto: versiones de las bibliotecas, huella SHA-256 del archivo de entrenamiento, parámetros, variables y categorías.
