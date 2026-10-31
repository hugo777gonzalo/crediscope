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
  corte VIGENTE de ese día, no `fuente_corte`.
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
- `scripts/probar-paridad-variables-de-ingreso.mjs` pasa las respuestas crudas de Equifax por
  `variables-de-ingreso.ts` y las compara con el extracto de AWS con que se entrenó (necesita `research/`;
  sale con 1 si una paridad baja de su umbral). Repetirlo al tocar `equifax-tablas.ts`,
  `variables-de-ingreso.ts` o la respuesta de Equifax.
