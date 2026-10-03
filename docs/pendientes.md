# Pendientes

Lo que quedó abierto al 2026-09-29. Las versiones vigentes son
marco-v27 (desde el 2026-10-03), estructura-v12, fuentes-v9 y
perfil-laboral-v3. Cada punto
dice qué falta, por qué importa y cómo se verifica.

Los números son de la base o del crudo local, medidos ese día. Antes de
actuar sobre uno, volver a medirlo: este archivo envejece.

Al cerrar un punto, se borra de acá y queda en el commit que lo cerró.

## 1. Para retomar primero

0. **Antes del lote: marco, modelo y costo** (revisado el 2026-10-03, con
   el negocio). El lote del Laboratorio es la primera corrida grande y
   junta los puntos 1 y 3 de esta lista. Medido: marco-v26 son 39.100
   caracteres (~16.000 tokens) de los 20.779 de entrada de un análisis;
   cuesta USD 0,084 y la salida (4.280 tokens) es más de la mitad.
   - **Caché del marco, sólo en lote.** Se retiró porque entre dos análisis
     sueltos pasan 26 min de mediana; en un lote salen cada pocos segundos
     y la de 5 minutos se mantiene sola. Ahorra ~USD 0,029 por análisis
     (~35%). Los análisis sueltos siguen sin caché.
   - **API de lotes de Anthropic (Message Batches):** 50% menos en todo,
     respuesta en menos de 24 h, y sin el corte de 150 s de Supabase (que
     ya cortó análisis a medias). Pero corre fuera de `analyze-client`: hay
     que sacar a una función compartida el armado de la fila de
     `analysis_results`, para no tener dos.
   - **Modelo:** hoy `claude-sonnet-5`. `claude-sonnet-5-5` cuesta lo mismo
     ($2/$10 por millón) pero rechaza `thinking: disabled` (rompe la
     configuración "sin" de `comparar-razonamiento.mjs`), recalibra el
     esfuerzo y suma clasificadores de seguridad que pueden devolver
     `stop_reason: refusal`, que hoy no se maneja (quedaría como fallo).
     `claude-opus-5-5` cuesta el doble. Cambiar de modelo necesita su fila
     en `llm_precios`.
   - **"Observar" ya salió en marco-v27** (otra sesión, el mismo día). La
     optimización del marco, sólo de forma y sin cambiar criterios, es la
     v28.
   - Orden decidido: marco v28 → comparación de los 14 casos → decidir
     `CONFIG_LLM` → lote.
   - **Comparación hecha** (2026-10-03, 56 llamadas, USD 5,32; Excel en
     `research/comparacion-marco-v28-2026-10-03/`):

     | Corrida | USD | Seg. | Razonamiento | Misma recomendación que "hoy" |
     |---|---|---|---|---|
     | Hoy (v27, Sonnet 5) | 0,101 | 55 | 4.475 | — (1 cortada) |
     | Hoy otra vez (ruido) | 0,105 | 60 | 4.864 | 12 de 13, score ±39 |
     | v28, Sonnet 5 | 0,107 | 66 | 5.679 | 12 de 13, ±50 (1 cortada) |
     | v28, Sonnet 5.5 | 0,067 | 22 | 1.358 | 12 de 13, ±42 |

     Sonnet 5.5 queda dentro del ruido, cuesta un tercio menos, tarda la
     mitad y no se cortó nunca; Sonnet 5 se cortó en 1715532469 dos de
     cuatro veces (10.000 tokens razonando). El único cambio que no es
     ruido: 0502937675 pasa de aprobar a revisar con v28 en los dos
     modelos, porque su ingreso está "Por confirmar" y el marco pide
     capacidad evidenciada para aprobar; v27 lo aprobaba igual.
     **Adoptado el 2026-10-03:** v28 y Sonnet 5.5 en producción (el
     negocio confirmó que 0502937675 va a revisar). Verificado con una
     llamada real del código desplegado (1715532469: completa, USD 0,10).
     **Falta el lote:** subir el límite de la consola de Anthropic y
     `config_operativa.presupuesto_llm_mensual_usd` (en octubre van USD
     5,4 de 10), y después
     `node scripts/analizar-en-lote.mjs enviar --carpeta=research/lote-analisis-2026-10-03 --responsable=<uuid>`
     y `recoger` (la muestra ya está elegida: 200 clientes, 280 pedidos).

1. **marco-v25 a v27 casi no corrieron.** Medido el 2026-10-03: v25
   ninguna vez; v26 una sola vez con éxito (2026-09-28, negar) y dos
   cortadas por el tope de gasto; v27 ninguna. Cambiaron cómo el modelo
   lee:
   - la disponibilidad (por tema, dos estados);
   - las demandas (por categoría);
   - los indicios de ingreso;
   - el impedimento por deuda pública;
   - militares, policías y jubilados;
   - la zona gris (v27): ya no existe "observar"; cuando falta
     información tiene que salir "revisar", con lo que falta en
     Observaciones y qué pedir en las acciones.

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

3. **Panorama de Fuentes de ingreso: "Calidad de la evidencia" y
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
- **Marco por cliente (v29), hecho y apagado** (2026-10-03,
  `_shared/marco-por-cliente.ts`). Omite las secciones de temas que el
  perfil del modelo no trae (PEP, pensión, demandas civiles, garantías,
  jubilados, etc.); con todo aplicable da el marco vigente byte a byte.
  Sobre los 2.567 perfiles reales el marco promedio baja de ~12.050 a
  ~9.100 tokens (25%, ~USD 0,006 por análisis). Se enciende con
  `marcoPorCliente` en `CONFIG_LLM`. Antes de encenderlo:
  - **validar** con `node scripts/comparar-razonamiento.mjs --configs=hoy,porCliente`
    (14 casos, ~USD 2, **sólo con autorización**): tiene que quedar dentro
    del ruido (±40 de score, 1 de 13 recomendaciones);
  - fila de marco-v29 en `scoring_rules_versions` y `MARCO_VERSION`;
  - guardar qué secciones se omitieron en cada análisis (columna nueva);
  - falta la segunda mitad: no mandar los grupos vacíos del perfil del
    modelo cuando el tema se consultó (~3-4% más), con una línea en el
    marco que diga que un tema consultado sin grupo es "no tiene nada".
- **Declaración de disponibilidad completa.** Los dos estados por tema
  ya existen (marco-v25). Falta `cobertura` y `suficienteParaPuntaje`,
  que significa no emitir un puntaje cuando la consulta no alcanza el
  mínimo evaluable. El diseño está en `docs/declaracion-de-disponibilidad.md`.
- **El indicio por impuesto a la renta es conservador.** Supone la
  tarifa máxima (37%) sobre lo que excede la fracción básica, así que
  sólo ve los casos claros. Con la tabla progresiva completa del SRI
  vería más.
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
- **Lote de análisis para el Laboratorio** (~300 análisis, ~USD 25 sin optimizar,
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
