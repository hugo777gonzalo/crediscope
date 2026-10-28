# Formato compacto del modelo de ingresos (`crediscope-arboles-1`)

Para quien escriba el evaluador de `supabase/functions/_shared/predictor-ingresos.ts` (especificación, 6.2). Lo escribe `exportar.py` y lo lee, en Python puro,
`evaluador_referencia.py`, que es la definición ejecutable: ante una duda, manda ese archivo. Los casos de oro (`casos-de-oro/nivel1.json` y `nivel2.json`) son la prueba.

**Por qué un formato propio.** El `dump_model` de LightGBM de un nivel pesa unos 13 MB (2,2 MB comprimido) y trae, por cada división, un objeto con quince campos. Acá cada
nivel son dos arreglos de números por nodo: 1,9 MB sin comprimir y 0,6 MB comprimido (`gzip`), y se evalúa recorriendo arreglos, sin armar objetos.

## Archivo

`ingreso-v1-nivel1.json.gz` y `ingreso-v1-nivel2.json.gz`: un JSON comprimido con gzip, sin espacios. Quedan fuera de git
(`C:\datos\ingresos\modelos\exportado\`), con su huella en `<archivo>.sha256`: el mismo modelo da los mismos bytes. En Deno se lee con
`new Response(blob.stream().pipeThrough(new DecompressionStream("gzip"))).json()`. Los números son JSON estándar de doble precisión: no hay `NaN` ni infinitos.

| Campo | Qué es |
|---|---|
| `formato` | `"crediscope-arboles-1"`. Un evaluador que no lo conoce se niega a evaluar. |
| `version`, `nivel`, `entrenado_el` | `"ingreso-v1"`, 1 o 2, fecha de entrenamiento. |
| `objetivo` | El modelo predice el **logaritmo natural** del ingreso mensual no verificado, en dólares. |
| `cuantiles` | Los doce niveles: 0,05; 0,10; 0,15; 0,20; 0,30; 0,40; 0,50; 0,60; 0,70; 0,80; 0,90; 0,95. |
| `arboles_por_cuantil` | 170. |
| `variables` | Lista ordenada de `{nombre, tipo}`; `tipo` es `"numerica"` o `"categorica"` (con `categorias`: la lista ordenada). La posición es el número de variable de los nodos. |
| `arboles` | 2.040 raíces (12 cuantiles × 170 árboles): primero los 170 del cuantil 0,05, luego los del 0,10, etc. |
| `nodos` | Siete arreglos paralelos, uno por división (28.560 por nivel); ver abajo. |
| `conjuntos` | Lista de listas de códigos de categoría; una división categórica apunta a una por su índice. |
| `hojas` | Valor de cada hoja, ya multiplicado por la tasa de aprendizaje y con el promedio inicial sumado en el primer árbol. |
| `origen` | Huella del archivo de entrenamiento, personas, fechas, parámetros y versiones de las bibliotecas. No se usa para evaluar. |

## Referencias a hijos

En `arboles`, `izquierda` y `derecha`: un número **mayor o igual que cero** es el índice de una división en los arreglos de `nodos`;
un número **negativo** es una hoja, en `hojas[-1 - referencia]`. Un árbol de una sola hoja tiene como raíz una referencia negativa.

## Las divisiones (`nodos`)

Para el nodo `i`: `variable[i]` (posición en `variables`), `umbral[i]`, `categorica[i]` (0 o 1), `falta[i]`, `falta_izquierda[i]`, `izquierda[i]`, `derecha[i]`.

**Numérica** (`categorica = 0`), con `v` el valor de la variable y `umbral[i]` el umbral:

1. Si `v` falta (`NaN`) y `falta[i]` no es 2, `v = 0`.
2. Si (`falta[i] = 1` y `|v| <= 1e-35`) o (`falta[i] = 2` y `v` falta): va a la izquierda si `falta_izquierda[i] = 1`, y a la derecha si no.
3. Si no: va a la izquierda si `v <= umbral[i]`, y a la derecha si no. **La igualdad va a la izquierda.**

`falta[i]` es 0, 1 o 2 según el modelo vio en el entrenamiento que la variable no tenía faltantes, tenía ceros, o tenía faltantes. En este modelo solo aparecen 0 y 2.

**Categórica** (`categorica = 1`): `umbral[i]` es el índice de un conjunto en `conjuntos`. La variable llega como el **código** de su categoría (la posición del texto en `categorias` de esa variable).
Va a la izquierda si el código está en el conjunto, y a la derecha en cualquier otro caso: **dato faltante, categoría que el modelo no conoció o conjunto que no la incluye.** `falta` y `falta_izquierda` no se usan.

## Entradas

Cada variable llega por nombre; `null` es dato faltante. Una categoría categórica que no está en `categorias` también es dato faltante. Los números llegan como están: el evaluador no redondea,
no recorta ni rellena. Quién arma las variables (`_shared/variables-de-ingreso.ts`) tiene que dar las mismas que `comun.py` (nombres en `NIVELES`; derivaciones en `preparar.py`
y en la especificación, 4.1 y 4.2); en particular, **sin RUC es 0 y sin respuesta de la fuente es dato faltante** (especificación, 4.1).

## Salida

Para cada cuantil `k` (0 a 11): la suma de `hojas` de las 170 hojas a las que llega la entrada, una por árbol `arboles[k*170 .. k*170+169]`, **en ese orden de suma**.
Después, **los doce valores se ordenan de menor a mayor** (los modelos de cada cuantil son independientes y pueden cruzarse un poco). El resultado son los doce cuantiles en logaritmo;
el dinero es `exp(...)`. De ahí salen el mínimo certificado (`exp` del cuantil 0,10 y del 0,15), el valor central (0,50) y los tramos (`cdf` y `probabilidades` de `comun.py`).

## Prueba de oro

`casos-de-oro/nivel1.json` y `nivel2.json`: 200 casos cada uno, con `entradas` **inventadas** (no salen de ninguna persona) y `cuantiles_log` tal como los da LightGBM, ordenados.
Los primeros 20 son casos de borde (todo faltante, todo cero, valores enormes y negativos, y valores **justo en el umbral** de una división y en el número siguiente); los otros 180 son entradas al azar con faltantes y categorías nunca vistas.
El evaluador pasa si en cada caso, para cada cuantil, `|salida − cuantiles_log| < tolerancia` (0,001; el evaluador de referencia en Python da 1e-13). Cada archivo trae la huella del archivo de entrenamiento del modelo del que salió:
si se vuelve a entrenar, los casos se regeneran con `exportar.py` y el cambio se ve en el diff.
