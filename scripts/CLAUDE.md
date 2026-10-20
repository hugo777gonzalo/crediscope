# Guiones

Se carga al trabajar en `scripts/`. Un guion que escribe en la base abre su
registro con `abrirEjecucion()` y no corre sin constancia (regla dura 11 de
la raíz). Los guiones de Equifax están en `docs/equifax.md` y los del
Laboratorio en `docs/laboratorio-guia.md`, «Cómo está construido».

- Desde un worktree, los guiones leen `.env.functions` y escriben en
  `research/` de la carpeta principal (`scripts/_comun/entorno.mjs`).

## Crudo y recálculo

- Respaldo local en `research/` (fuera del repo, datos personales):
  `novadata-raw/` = muestra fija de 389, no se pisa;
  `novadata-raw-2026-09-25/` = cartera completa (ya subida a Storage) en
  forma plana `{ cedula, capturadoEl, perfilId, raw }`;
  `novadata-raw-2026-10-03/` = la reconsulta entera de ese día, el respaldo
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
  `research/novadata-raw/` con el perfil entero (`reprocess-sample.mjs`, la
  copia a mano, quedó atrás y se borró el 2026-10-13).
