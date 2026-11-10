# Guiones

Se carga al trabajar en `scripts/`. Un guion que escribe en la base abre su
registro con `abrirEjecucion()` y no corre sin constancia (regla dura 11 de
la raíz). Los guiones de Equifax están en `docs/equifax.md` y los del
Laboratorio en `docs/laboratorio-guia.md`, «Cómo está construido».

- `--funciones` puede fallar en una función distinta en cada corrida al subir los archivos, y
  entonces anota 11 de 12 en `despliegues` (2026-10-30, dos corridas seguidas). Se repite, y lo que
  manda es el sello de cada función (`auditar-seguridad.mjs`, u OPTIONS a cada una): si la que falló
  ya tenía ese commit de la corrida anterior, está bien.
- Desde un worktree, los guiones leen `.env.functions` y escriben en
  `research/` de la carpeta principal (`scripts/_comun/entorno.mjs`).
  `auditar-seguridad.mjs` no: lee `.env` del directorio donde se corre, así que va desde la carpeta principal.
- `db query` se arma sólo con `scripts/_comun/consulta-sql.mjs` (CLI 3, 2026-11-04): las lecturas van
  con `--read-only`, y lo que escribe corta antes de empezar sin `SUPABASE_YES` exportada en ese shell.

## Crudo y recálculo

- Respaldo local en `research/` (fuera del repo, datos personales):
  `proveedor-info-1-raw/` = muestra fija de 389, no se pisa;
  `proveedor-info-1-raw-2026-09-25/` = cartera completa (ya subida a Storage) en
  forma plana `{ cedula, capturadoEl, perfilId, raw }`;
  `proveedor-info-1-raw-2026-10-03/` = la reconsulta entera de ese día, el respaldo
  vigente (los recálculos, con `--carpeta=`). La del 25/09 es el t0 del
  ciclo simulado del Laboratorio: no se pisa. `casos-reales/` = el
  registro de los casos que cita el código (ver "Cómo se trabaja"). Sumar:
  `node scripts/consultar-lote.mjs <archivo> <uuid-responsable> 20 --crudo=research/<carpeta> --base-legal="<contrato>"`.
- Reproducir un perfil: `buildStandardProfile(raw, cedula, corte)` con el
  corte VIGENTE de ese día, no `fuente_corte`. El crudo se lee con `leerCrudo()`:
  traduce la clave de una fuente que el respaldo conserva con el nombre anterior.
- `scripts/recalcular-fuentes-ingreso.mjs`: sólo el último perfil, sólo
  si el crudo es de ese perfil (`perfilId`), reloj en la fecha de captura
  y claves ordenadas al comparar. Él y `recalcular-grupos.mjs` leen el crudo
  de `--carpeta=` y, lo que la carpeta no tiene, del depósito
  (`_comun/crudo-del-ultimo-perfil.mjs`): hasta el 2026-10-20 leían sólo la
  carpeta y un recálculo dejaba atrás a quien se consultó después del respaldo.
- `scripts/recalcular-grupos.mjs --grupos=a,b`. Si cambian estructura y
  fuentes de ingreso a la vez: primero `recalcular-grupos.mjs ...
  --ignorar=fuentesIngreso` (con `--bloqueo` si cambió el bloqueo),
  después `recalcular-fuentes-ingreso.mjs`.
- Las columnas copiadas del perfil se escriben sólo con
  `columnasDelPerfil()`. Si cambia la regla de una columna sin cambiar el
  perfil: `scripts/calcular-columnas-del-perfil.mjs` (`--seco` primero).
- Para validar un cambio, comparar `process.ts` viejo contra nuevo sobre
  `research/proveedor-info-1-raw/` con el perfil entero (`reprocess-sample.mjs`, la
  copia a mano, quedó atrás y se borró el 2026-10-13).
- Al cruzar dos consultas a Postgres en memoria, unificar las claves con `String()`:
  `node-pg` devuelve `integer` como número y `numeric` o `bigint` como texto, y un `Map`
  no calza sin error (seis columnas salieron 100% vacías el 2026-10-20). Medir el
  porcentaje de vacíos de cada columna antes de dar un archivo por bueno.

- `scripts/migrar-equifax-aws.mjs` lleva a `consultas_equifax` los JSON de AWS bajados a `research/` (`docs/equifax.md`,
  autorización de Equifax). Medir el espacio ANTES (plan Free: 500 MB): 15.700 crudos con sus tablas llenaron el disco el
  2026-10-31. Va con `--seco`, `--desde`, `--una-por-persona` y `--sin-tablas`; las tablas se derivan al evaluar a la persona,
  y `cargar-tablas-equifax.mjs` sin filtro las derivaría todas (`docs/pendientes.md`, punto 12).

## Revisión de datos

- `scripts/revisar-datos.mjs` corre el catálogo de `scripts/revision-de-datos/detectores.mjs`
  (habilidad `revision-de-datos`) en una sola consulta de sólo lectura y sale con 1 si vuelve un
  error corregido. Un error de datos que se encontró a mano entra ahí como detector, con su caso.
- `scripts/revisar-crudo.mjs` corre `DETECTORES_DEL_CRUDO` (mismo catálogo) sobre el crudo del último perfil de cada
  persona real (carpeta de `research/` y depósito, ~2 min, sólo lee). Es para lo que no deja rastro en el perfil guardado:
  la demanda penal de otro demandado (p1) o el hipotecario contado dos veces (p6) salieron a mano, persona por persona.
- Un detector que necesita una regla del código la importa del `.ts` (Node 24 lo lee), no la copia:
  el primero copiaba 5 fuentes del freno que ya eran 21 y contaba 671 consultas incompletas en vez de 770.
- `scripts/revision-del-analisis/` (habilidad `revision-del-analisis`): `medir-lote.mjs` mide un lote de análisis sin
  modelo, `elegir-casos.mjs` elige hasta 15 casos y `armar-carpetas.mjs` arma la carpeta a ciegas de cada uno en
  `research/revision-del-analisis/`. Los guiones sólo leen (`comun.mjs` es lo que comparten: la consulta, las ids de caso y la lectura del crudo),
  y el control `guiones` les pasa `node --check`. `armar-carpetas.mjs` sirve para cualquier marco: saca el texto del marco del análisis de git, y la base de
  prueba de AWS es opcional. `resultado-de-pago.mjs` arma, para esa base, si el crédito pedido ya figura en la cartera de la institución (plazo, cuota o
  saldo, y tiempo coherente) y cómo se pagó; va en la fase 3 de cada carpeta. La fase 1 nunca lleva el score del modelo, la
  decisión de la institución ni el resultado de pago: en el piloto `capacidad.json` los traía y contaminó 3 de 12 dictámenes, y el guion ahora corta si una
  clave de las fases 2 o 3 aparece en la 1.

## Predictor de ingresos

- `scripts/predictor-ingresos/` es Python (entrenamiento, calibración, exportación y medición), no Node,
  y la integración continua no lo corre: su `LEEME.md` dice cómo se ejecuta (con `-I`, en el entorno de
  `C:\datos\ingresos`). A git sólo van los casos de oro, con entradas inventadas, que lee la prueba de
  `_shared/predictor-ingresos.ts`; las extracciones de AWS, las tablas por persona y los modelos quedan
  fuera (son datos de personas).
- `scripts/publicar-modelo-de-ingreso.mjs` sube un modelo a una base, depósito y fila (141), de a una base
  y con `--seco` primero. Antes de tocar la base comprueba la huella, el formato, los casos de oro y que
  existan sus métricas agregadas (`predictor-ingresos/metricas/<version>-nivel<n>.json`, que sí van a git).
  `--vigente` lo activa; un modelo nuevo se compara antes con el vigente (especificación, 7).
- `scripts/predictor-ingresos/casos_de_estimacion.py` regenera los casos de oro de punta a punta
  (`casos-de-oro/estimaciones-nivel1.json`): correrlo después de exportar un nivel 1 nuevo.
- `scripts/sombra-predictor-ingresos.mjs` es la prueba en sombra del nivel 1: arma las variables desde el
  perfil guardado (sólo lectura) y evalúa con el modelo exportado; la mide
  `scripts/predictor-ingresos/medir_sombra.py`. Repetirla con cada modelo nuevo del nivel 1 y al completar
  el lote de paridad. La edad y el reloj van a la fecha de la consulta de AWS: el perfil guarda la edad del
  día en que se consultó a Proveedor_Info_1, y con ella la cobertura bajó dos puntos.
- `scripts/estimar-ingresos-en-lote.mjs` corre el estimador de la función `estimar-ingreso` sobre el último
  perfil de cada persona real, con el modelo vigente y SIN guardar: escribe en `research/estimaciones-en-lote/`. Sirve
  para medir el predictor mientras `estimaciones_de_ingreso` esté vacía. El 2026-11-05 mostró que 624 de 2.061
  estimaciones serían de consultas incompletas.
- `scripts/predictor-ingresos/matriz-desde-crudo.mjs` (Node, aunque la carpeta sea de Python) arma la matriz del nivel 2 desde los
  JSON crudos de Equifax bajados de AWS con `vectorDeNivel2` (desde el crudo, el mismo de producción) y la fecha de la consulta como reloj,
  sin copiar una regla: una sola implementación para entrenar y servir (especificación, 9.1). Cruza con `personas.parquet` por la id de
  consulta, mide la paridad contra el extracto y sale con 1 si una variable de Equifax baja del 100% (así está desde v2, 12.35). **Una
  fecha de AWS sin zona es hora de Ecuador**: se lee con `-05:00` y no con la zona de la máquina. Repetirlo al tocar
  `variables-de-ingreso.ts`; no entrena. El control `guiones` no revisa esa carpeta: `node --check` a mano. `ingreso_v2.py` lee su matriz.
- `scripts/probar-paridad-variables-de-ingreso.mjs` pasa las respuestas crudas de Equifax por
  `variables-de-ingreso.ts` y las compara con el extracto de AWS con que se entrenó, en total y por mes (necesita `research/`;
  sale con 1 si una paridad baja de su umbral). Desde febrero de 2026 las 19 de las operaciones coinciden al 100%; en diciembre y
  enero, no (AWS las armó distinto). Repetirlo al tocar `equifax-tablas.ts`, `variables-de-ingreso.ts` o la respuesta de Equifax.
- Un CSV con números que escribió Node se lee en pandas con `float_precision="round_trip"`: el lector por omisión los deja a un
  bit y un árbol cambia de rama (`docs/lecciones.md`, Guiones).
