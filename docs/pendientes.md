# Pendientes

Lo que quedó abierto al 2026-09-29. Las versiones vigentes son
marco-v26, estructura-v12, fuentes-v9 y perfil-laboral-v3. Cada punto
dice qué falta, por qué importa y cómo se verifica.

Los números son de la base o del crudo local, medidos ese día. Antes de
actuar sobre uno, volver a medirlo: este archivo envejece.

Al cerrar un punto, se borra de acá y queda en el commit que lo cerró.

## 1. Para retomar primero

1. **marco-v25 y marco-v26 nunca corrieron.** `analysis_results` no
   tiene ningún análisis con esas versiones; el último es marco-v24, del
   2026-09-27. Cambiaron cómo el modelo lee:
   - la disponibilidad (por tema, dos estados);
   - las demandas (por categoría);
   - los indicios de ingreso;
   - el impedimento por deuda pública;
   - militares, policías y jubilados.

   Hay que correr un análisis y leer la salida antes de darlas por
   buenas. **El modelo se corre sólo con autorización del usuario**,
   porque cuesta. El candidato natural es 1715532469: el caso que se
   cortó a medias, ya en estructura-v12 y con su crudo en el respaldo.

2. **0501418826 y 0918563750 quedaron en estructura-v11.** Se
   consultaron desde la pantalla el 2026-09-28 (17:51 y 18:40), después de
   armado el respaldo local: su crudo es de un perfil anterior y los
   recálculos no las alcanzan. v12 no les cambia las demandas (medido sobre
   el crudo). Reconsultarlas con
   `node scripts/consultar-lote.mjs <archivo> <uuid-responsable> 2 --crudo=research/novadata-raw-2026-09-25`
   las pone al día. Pasa cada vez que alguien consulta desde la pantalla:
   el respaldo sólo se actualiza desde el guion (así quedó también
   1308725470, reconsultada dos veces el 2026-09-28 y 29).

3. **Repetir la comparación de razonamiento (paso 4)** y decidir la
   configuración de producción. No antes del 1 de octubre (punto 1).
   - Hoy `CONFIG_LLM` en `llm-scoring.ts`: razonamiento activo, 10.000
     tokens de salida, sin caché del marco.
   - Comando: `node scripts/comparar-razonamiento.mjs`. Cuesta ~$3 (42
     llamadas). Usa las 14 cédulas de
     `research/cedulas_validacion_marco_v23.txt` y deja el Excel en
     `research/comparacion-razonamiento-<fecha>/`.
   - La corrida anterior (2026-09-27) fue con marco-v24, antes de los
     arreglos de datos, y dio:

     | Configuración | Costo | Tiempo | Misma recomendación que "hoy" |
     |---|---|---|---|
     | Hoy (activo) | $0,104 | 71 s | — |
     | Sin razonamiento | $0,054 | 19 s | 5 de 10 no bloqueados |
     | Esfuerzo medio | $0,067 | 33 s | 7 de 10 |

   - Hubo una sola corrida por configuración, así que el ruido entre
     corridas no se midió. Correr "hoy" dos veces lo mide, y sin eso no
     se sabe si 7 de 10 es poco o mucho.
   - El backtest ya arma su pedido con `armarPedidoScoring()`
     (2026-09-29): si cambia `CONFIG_LLM`, lo sigue.

4. **Panorama de Fuentes de ingreso: "Calidad de la evidencia" y
   "Clientes que necesitan respaldo".** El análisis y la propuesta están en
   `docs/propuesta-panorama-respaldo-y-evidencia.md` (2026-09-29).
   - Falta que el negocio conteste las 8 preguntas de su sección 3; no se
     implementa antes.
   - Hay dos arreglos de la regla que no dependen del diseño:
     - sacar a las 18 sintéticas de la lista;
     - los 13 sin confirmar que no tienen ningún documento sugerido.
   - "Declaraciones de IVA de los últimos 6 meses" no existe para los
     negocios populares del RIMPE y es semestral para los emprendedores
     (SRI). Se lo pide hoy a 956 personas.

## 2. Riesgos técnicos conocidos

- **El backtest puede pasarse de los 150 s.**
  - `correr-backtest` corre hasta 20 casos (10 incumplidos y 10 que
    pagaron) en 2 tandas de 10 en paralelo.
  - Cada tanda dura lo que su caso más lento, y un análisis con
    razonamiento activo tarda de 40 a 110 s.
  - Supabase corta la función a los 150 s: dos tandas lentas no
    entran.
  - Medirlo con un paquete real antes de usarlo. Si corta: tandas más
    chicas, una invocación por caso o la API de lotes (que además cuesta
    la mitad).
- **Tres lecturas de `src/lib/api.js` se cortan con volumen:**
  - `getClientesParaPlantilla` y `getUsoPorVersion` pasan las 1.000
    filas;
  - `vincularFilasConAnalisis` pasa el largo de la dirección con más de
    ~350 ids.

  Hoy no se cortan (hay 70 análisis). El arreglo existe: es el commit
  720f31b de la rama `claude/cool-jemison-2a674d`, sin mergear. Mergea
  sin conflictos contra `main` (probado el 2026-09-28), y la función 082
  que usa ya está en la base. Si Retroalimentación se rehace antes (ver
  abajo), no hace falta.
- **`analizar-feedback` no pasa `deno check`.** Son errores de tipos
  previos (`hubo_default`, líneas ~216-217). Despliega igual.
- **La cartera tiene 240 personas que no existen.** Son las cédulas
  sintéticas de prueba de Aval: 2.807 clientes = 2.567 reales + 240.
  - Tuercen todo total sobre la cartera (porcentajes, segmentos,
    "sin datos").
  - Decisión pendiente: marcarlas o borrarlas.
  - La lista está en `research/aval-pool-240.txt` y `pruebas/aval/`. Son
    exactamente las 240 cuyo último perfil está en estructura-v3
    (medido el 2026-09-29): se separan sin la lista.
- **Demandas que pueden ser de un homónimo.** Novadata asocia las
  demandas por nombre, y hay dos grupos sin resolver:
  - 31 de 4.602 (0,7%) no tienen el nombre de la persona entre los
    demandados;
  - 331 tienen ese campo vacío.

  Las denuncias ya se filtran por cédula (`_shared/denuncias.ts`); las
  demandas no traen cédula de las partes.

## 3. Propuestas sin decidir

- **La antigüedad de las demandas no llega al perfil** (mejora posterior,
  decidido por el negocio el 2026-09-29: no es urgente). El grupo de
  cobro dice cuántas y de qué tipo, no de cuándo. Las 8 personas que
  estructura-v12 pasó a "con demandas de cobro" lo son por demandas de
  1997 a 2010, y el modelo las lee igual que una de este año. La fecha
  está en el crudo (`demanda.fecha`).
- **Tipos que quedaron en "Otras" y parecen deuda, sin decidir:**
  expensas fijadas por la asamblea de copropietarios (2), pago de rubros
  (2) y pago de remuneraciones atrasadas (1, ¿laboral?). Se cambian en
  `_shared/demandas.ts`.
- **Adelgazar el marco.**
  - Crece con cada versión: 16.400 caracteres en v14, 35.000 en v24
    (15.100 tokens) y 39.100 en v26.
  - Si se apaga el razonamiento, el marco pasa a ser el grueso del
    costo: en v24 eran 15.100 de 19.200 tokens de entrada.
  - Cada versión nueva necesita su fila en `scoring_rules_versions`.
- **Declaración de disponibilidad completa.** Los dos estados por tema
  ya existen (marco-v25). Falta `cobertura` y `suficienteParaPuntaje`,
  que significa no emitir un puntaje cuando la consulta no alcanza el
  mínimo evaluable. El diseño está en `docs/declaracion-de-disponibilidad.md`.
- **El indicio por impuesto a la renta es conservador.** Supone la
  tarifa máxima (37%) sobre lo que excede la fracción básica, así que
  sólo ve los casos claros. Con la tabla progresiva completa del SRI
  vería más.
- **Sacar la recomendación "observar"** (decidido por el negocio el
  2026-10-03): toda la zona gris pasa a "revisar". Está en el marco
  (`marco-interpretativo.ts`, desde v14), en `RecomendacionAccion`
  (`types.ts`), en `RECOMENDACIONES_VALIDAS` (`llm-scoring.ts`), en
  `correr-backtest` y en las pantallas que la pintan (RecomendacionBadge,
  RecomendacionCard, ResultadoBacktest, Expediente, Reportes,
  Solicitudes). Es una versión nueva del marco con su fila en
  `scoring_rules_versions`. Hay 1 análisis guardado con "observar": las
  pantallas lo tienen que seguir mostrando. Va en otra sesión o rama, no
  junto con el Laboratorio.
- **Las cinco columnas `fuente_*` de `client_profiles` podrían ser
  columnas generadas por la base**
  (`generated always as (standard_profile->…) stored`). Así no podrían
  desalinearse, que es lo que pasó hasta d81591b. Primero las funciones
  tienen que dejar de escribirlas: regla 8 de CLAUDE.md.

## 4. Parámetros que vencen

- **2027:** agregar el año a `SBU_POR_ANIO` y a `FRACCION_BASICA_RENTA`
  en `fuentes-ingreso.ts` cuando se publiquen. Un año que falta en la
  tabla de renta no da indicio. Después correr
  `node scripts/calcular-columnas-del-perfil.mjs` (primero con
  `--seco`).
- **Presupuesto mensual del modelo:**
  - `config_operativa.presupuesto_llm_mensual_usd` está en 10;
  - los avisos saltan al 70, 85 y 100%;
  - un análisis cuesta ~$0,10 y una comparación de 14 casos ~$3.

  Confirmar que el monto es el que el negocio quiere. **El límite de la
  consola de Anthropic es otro, y en septiembre saltó primero:** cortó el
  2026-09-28 con USD 6,00 medidos por nosotros (y 31 llamadas sin medir),
  antes de nuestro aviso del 70%. Nuestro presupuesto tiene que ser el de
  la consola, o menor: si no, el primer aviso es la caída.

## 5. Decisiones de fondo e insumos de terceros

- **Validar con el negocio los criterios dentro de cada grupo del
  marco** (qué campo pesa cuánto). El orden de los grupos sí lo definió
  el usuario.
- **Retroalimentación se reemplaza por el Laboratorio de Inteligencia de
  Negocio › Riesgo de Crédito** (decidido el 2026-10-03). Diseño,
  decisiones y fases en `docs/laboratorio-de-riesgo.md`. La fase 0 (crudo
  de Novadata y mensaje al modelo guardados) está hecha; sigue la fase 1,
  sobre una cartera sintética. Hallazgos del módulo viejo que el nuevo no
  tiene que repetir:
  - la plantilla bajaba todos los análisis;
  - el nombre del cliente salía vacío;
  - guardar un paquete no es transaccional.
- **Lote de análisis para el Laboratorio** (~400 análisis, ~USD 17–20,
  detalle en `docs/laboratorio-de-riesgo.md`). Antes hay que subir el
  límite de la consola de Anthropic.
- **La fábrica de crédito está en pausa** por decisión del negocio. Ver
  `docs/arquitectura-fabrica-de-credito.md`.
- **Descarga masiva:** Reportes › Descargas la ve cualquier analista.
  Bajar la cartera entera es otro nivel de exposición que consultar de a
  uno.
- **Lotes grandes:** el Excel de un lote se arma en el navegador. Con
  ~5.000 personas son ~50 MB; conviene armarlo en el servidor al pasar
  de mil.
- **A la espera de terceros:**
  - Equifax: faltan credenciales de API. Se descartó automatizar el
    portal.
  - SMTP propio (Resend), para volver al código de 6 dígitos al crear
    cuenta.
  - Aval: el WAF rechaza la IP de Supabase. Hoy se consulta desde la IP
    ecuatoriana con `scripts/consultar-aval-local.mjs`.
  - Novadata:
    - ¿expone el régimen RIMPE?
    - ¿funciona el recurso `pensionista`? Devolvía `estado=false` en las
      389 de la muestra.
  - SRI: confirmar los umbrales de "obligado a llevar contabilidad",
    que hoy es un indicio de ingreso mayor.

## 6. Limpieza

- `scripts/reprocess-sample.mjs` quedó atrás de `process.ts`: lee la
  forma vieja de `empleoActual`. Hay que ponerlo al día o borrarlo; hoy
  se valida con `process.ts` directo bajo Node.
- Ramas locales ya contenidas en `main`: `aval-corredor-local-y-ambiente`
  y `claude/xenodochial-albattani-950de3`. Se pueden borrar.
- En la base quedan 5 lotes de prueba terminados: 3 del 2026-09-15
  ("Prueba de…") y 2 del 2026-09-23 ("prueba 078…"). Se pueden borrar
  los lotes. Antes, mirar si los perfiles que dejaron son de personas de
  la cartera.
