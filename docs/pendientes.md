# Pendientes

Lo que quedó abierto al 2026-10-03. Las versiones vigentes son
marco-v28 con Claude Sonnet 5.5 (desde el 2026-10-03), estructura-v12,
fuentes-v9 y perfil-laboral-v3. Cada punto dice qué falta, por qué importa
y cómo se verifica.

Los números son de la base o del crudo local, medidos ese día. Antes de
actuar sobre uno, volver a medirlo: este archivo envejece.

Al cerrar un punto, se borra de acá y queda en el commit que lo cerró.

**Regla del negocio (2026-10-03):** toda prueba masiva con el modelo
(comparaciones, lotes) se corre sólo con su autorización explícita, con el
costo estimado. Una llamada suelta para comprobar un despliegue está
aceptada.

## 1. Para retomar primero

0. **Ver las pantallas del Laboratorio con sesión de admin.** Las fases 1 a
   5 están hechas (094-097, `docs/laboratorio-de-riesgo.md`), pero ninguna
   pantalla se vio en el navegador: la sesión de QA había caducado. Las
   consultas de cada pantalla se probaron contra la base
   (`research/probar-consultas-laboratorio.mjs`). Recorrido: iniciar sesión
   en `localhost:5184` (el usuario; nunca escribir contraseñas) y abrir
   Laboratorio › la carga sintética (conciliación) › el corte "Sintética a
   24 meses" (Desempeño, Variables, Simulación, Casos; calcular cada uno) ›
   Propuestas (crear una desde el corte: no tiene que poder presentarse por
   ser sintética) › Criterio vigente. Probar también subir la plantilla con
   un archivo chico de prueba y anular esa carga después.

1. **Marco y modelo: dónde quedó** (2026-10-03).
   - **En producción: marco-v28 con Sonnet 5.5**, con el respaldo
     automático de Anthropic ante rechazos (`fallbacks: "default"`; sólo
     cubre "cyber" y "frontier_llm", un "general_harms" vuelve como fallo
     con su categoría). Verificado con una llamada real del código
     desplegado (1715532469: completa, USD 0,10).
   - **Comparación que lo decidió** (56 llamadas, USD 5,32; Excel en
     `research/comparacion-marco-v28-2026-10-03/`):

     | Corrida | USD | Seg. | Razonamiento | Misma recomendación que "hoy" |
     |---|---|---|---|---|
     | Hoy (v27, Sonnet 5) | 0,101 | 55 | 4.475 | — (1 cortada) |
     | Hoy otra vez (ruido) | 0,105 | 60 | 4.864 | 12 de 13, score ±39 |
     | v28, Sonnet 5 | 0,107 | 66 | 5.679 | 12 de 13, ±50 (1 cortada) |
     | v28, Sonnet 5.5 | 0,067 | 22 | 1.358 | 12 de 13, ±42 |

     **El ruido es el piso:** el mismo perfil dos veces mueve el score ~40
     y cambia 1 de 13 recomendaciones. 0502937675 (ingreso "Por
     confirmar") pasó de aprobar a revisar con v28: el negocio confirmó
     que es lo correcto.
   - **Marco por cliente (v29), hecho y apagado**: ver la sección 3.
     Encenderlo necesita la comparación `--configs=hoy,porCliente` (~USD 2,
     con autorización).
   - **Lote de análisis reales: postergado** (no hay presupuesto, y el
     Laboratorio no lo necesita para desarrollar). Listo:
     `node scripts/analizar-en-lote.mjs enviar --carpeta=research/lote-analisis-2026-10-03 --responsable=<uuid>`
     y después `recoger` (200 clientes, 280 pedidos, ~USD 4-6 por la API
     de lotes con caché). Antes: subir el límite de la consola de
     Anthropic (cortó cerca de USD 6 en septiembre) y
     `config_operativa.presupuesto_llm_mensual_usd` (USD 10; en octubre
     van ~5,4).

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
- **Adelgazar el marco: hecho en parte.** v28 lo bajó de 39.195 a 33.380
  caracteres sólo con forma; el siguiente paso es el marco por cliente
  (abajo). Con Sonnet 5.5 el razonamiento bajó a ~1.400 tokens y el marco
  (~12.000) es ~36% del costo de cada análisis. Recortar redacción de las
  secciones que van siempre (cómo escribir, recomendación, acciones:
  ~3.300 tokens) cambia lo que el modelo lee en todos los casos: necesita
  comparación y autorización.
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
  Medido el 2026-10-03 sobre 2.567 perfiles reales: bancos y cooperativas
  se consultaron siempre; con un mínimo de seis temas (identidad, buró de
  bancos, cooperativas, aportes al IESS, demandas en su contra, listas de
  control) quedan 40 (1,6%) por debajo. Propuesto: aplicarlo en el código
  antes de llamar al modelo (no cambia lo que lee: sin versión nueva del
  marco). Esperan respuesta del negocio: ¿esos seis temas?, y ¿un caso no
  evaluable sólo se avisa, o se guarda como análisis sin puntaje (exige
  puntaje nulo en la base y en las pantallas)?
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
  - un análisis cuesta ~USD 0,067 con Sonnet 5.5 (~0,10 con Sonnet 5); una
    configuración de la comparación de 14 casos, ~USD 1; un análisis por la
    API de lotes, la mitad.

  Confirmar que el monto es el que el negocio quiere. **El límite de la
  consola de Anthropic es otro, y en septiembre saltó primero:** cortó el
  2026-09-28 con USD 6,00 medidos por nosotros (y 31 llamadas sin medir),
  antes de nuestro aviso del 70%. Nuestro presupuesto tiene que ser el de
  la consola, o menor: si no, el primer aviso es la caída.

## 5. Decisiones de fondo e insumos de terceros

- **Validar con el negocio los criterios dentro de cada grupo del
  marco** (qué campo pesa cuánto). El orden de los grupos sí lo definió
  el usuario.
- **Preguntas abiertas del Laboratorio** (`docs/laboratorio-de-riesgo.md`,
  sección 13): ¿una instalación para varias IFI o una por IFI? (define cómo
  se separan los datos; hoy `institucion` es texto y sólo admin ve todo);
  ¿cuánto tiempo se conserva el crudo de Novadata (LOPDP)?; ¿con qué base
  legal y a qué costo se reconsulta a un negado (fase 6)?
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
- Ramas locales ya contenidas en `main` o superadas:
  `aval-corredor-local-y-ambiente`, `claude/xenodochial-albattani-950de3`,
  `claude/fervent-swirles-6ceaac` (marco-v27, integrada) y
  `claude/cool-jemison-2a674d` (el parche 720f31b de Retroalimentación, que
  ya no existe; su 082 está en `main`). Se pueden borrar.
- La cartera sintética del Laboratorio (carga "Cartera sintética (semilla
  1)") se queda: es la que prueba los cálculos. Si se regenera, anular la
  anterior desde la pantalla.
- En la base quedan 5 lotes de prueba terminados: 3 del 2026-09-15
  ("Prueba de…") y 2 del 2026-09-23 ("prueba 078…"). Se pueden borrar
  los lotes. Antes, mirar si los perfiles que dejaron son de personas de
  la cartera.
