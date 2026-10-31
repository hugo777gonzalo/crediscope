# Laboratorio de Inteligencia de Negocio: la guía

El punto de partida del Laboratorio. **Cada sesión de trabajo empieza
leyendo esta guía y termina poniéndola al día** (dónde estamos, qué se
verificó y qué no). Si otro documento la contradice, manda esta guía; el
detalle técnico vive en los documentos del final.

Escrita el 2026-10-07, cuando el negocio pidió ordenar el módulo antes de
seguir: se venía construyendo sin una guía clara.

## Para qué sirve

Medir si el modelo acierta contra lo que pasó de verdad con cada solicitud,
y encontrar qué datos anticipaban el impago, para mejorar el modelo
(estructura y marco interpretativo). Lo opera nuestro equipo; la
institución recibe un informe.

## Los grupos

Nombres propuestos el 2026-10-07, a confirmar por el negocio.

| Grupo | Qué es | Cómo se sigue | Al 2026-10-07 |
|---|---|---|---|
| **Universo** | Toda solicitud registrada: una persona en una fecha. Si la misma persona vuelve a pedir, es otra solicitud (sus condiciones pueden haber cambiado). | Su consulta del día de la solicitud es el punto de partida (t0). | 2.572: 2.567 de la cartera de septiembre y 5 nuevas de octubre |
| **Universo analizado** | Las solicitudes del Universo con análisis IA (recomendación y puntaje). Sólo con ellas se prueba el modelo. | — | 205 personas con el marco vigente (marco-v28), 200 de ellas del lote del 2026-10-07; 215 con cualquier marco |
| **Con crédito** | Solicitudes que la institución desembolsó. | **Reporte mensual de la institución**: días de mora, saldo y estado de cada crédito al cierre de cada mes. | 0: no hay institución todavía; el negocio va a simular los reportes |
| **Sin crédito** | Solicitudes que no se desembolsaron (negadas, desistieron, en trámite). | **Reconsulta en Proveedor_Info_1 cada 3 meses**: el impago en todo el sistema financiero. | 0 reconsultas reales; la primera ronda, desde el 25/12/2026 |

Las palabras del tiempo: **t0** es el día de la solicitud; **mes 1, 2,
3...** son los cierres del reporte mensual después del desembolso; la
**ronda de 3, 6, 9 o 12 meses** es la reconsulta en Proveedor_Info_1 a ese tiempo
de la solicitud.

**Recomendación, a confirmar:** reconsultar cada 3 meses a todo el Universo,
no sólo a los sin crédito. Proveedor_Info_1 no cobra por ahora y es una sola lista.
A los con crédito no les cambia el resultado (lo da la institución), pero
muestra por qué cayeron (otra institución les prestó, perdieron el trabajo);
y a los que no tienen análisis los deja servir para buscar variables.

## Qué es impago

La definición vigente desde el 2026-10-06, que se cambia en Datos y cartera
› Configuración sin tocar código:

- Con crédito, por el reporte de la institución: más de 90 días de mora
  (Basilea), castigo, reestructuración o demanda judicial.
- Sin crédito, por Proveedor_Info_1: más de 90 días en cualquier entidad, bancos en
  D o E, retail con deuda de más de USD 500, castigo o demanda. «D o E» es para
  la operación que trae calificación. Si algún día el resultado viene del buró
  de la institución, que trae días y no calificación, la misma definición lo
  juzga por días y no hay que cambiarla. Traer ese resultado necesita una
  consulta paga por solicitud en el t1 (`docs/propuesta-dias-de-mora-con-buro.md`,
  sección 3), y se construye con la primera carga real.
- Lista de observación: llegar a 15 días de mora o más en el primer año,
  aunque después se ponga al día.
- La prueba del modelo: aprobar y revisar = "no impago"; negar = "impago".
  Los con crédito son casi todos aprobar o revisar (la institución casi no
  presta a un negado); la otra mitad de la prueba la dan los sin crédito.

## Dónde estamos (2026-10-07)

- Todo lo construido del Laboratorio (pantallas y cálculos, migraciones 094
  a 112) **corre sobre datos sintéticos**: las tres cargas son sintéticas y
  las solicitudes y reconsultas sólo las crea el simulador. El camino de los
  datos reales no existe todavía.
- Lo que sí está probado: los cálculos (contra la base y contra valores
  publicados), la definición de impago como parámetro, el detector de
  eventos entre dos consultas (sin inventar), y que lo calculado en las
  pantallas se guarda (verificado con sesión de admin el 2026-10-07).
- **El lote del 2026-10-07** analizó a los 200 candidatos de
  `research/lote-analisis-2026-10-03/` con marco-v28, por la API de lotes y
  con la caché del marco: USD 3,55 (estimado antes de enviar: 3,29 con caché,
  5,78 sin ella), 200 de 200 bien, la caché leída en casi todos los pedidos.
  Validado antes de gastar: se analizó el último perfil de cada persona (la
  consulta del 03/10, estructura-v13), no el de septiembre que tenía la
  selección (estructura-v12, con errores ya corregidos), y sin las 80
  repeticiones de ruido. Carpeta: `research/lote-analisis-2026-10-07/`.
- Lo que dijo el lote: revisar 143, aprobar 47, negar 10; puntaje mediano
  662. **Siete de cada diez a revisar es para mirar al calibrar**, antes de
  sacar conclusiones del Laboratorio con estos puntajes.
- **Para el paso 1:** el análisis de esas 200 se hizo sobre la consulta del
  03/10, no sobre la de septiembre. Hay que decidir cuál es su punto de
  partida (t0) y su fecha de solicitud: la del análisis es la coherente
  (lo que leyó el modelo), y corre las rondas a principios de enero.

## El plan

Una sesión por paso. Cada paso termina con algo que el negocio puede ver y
verificar, y con esta guía al día.

| Paso | Qué | Cómo se verifica | Estado |
|---|---|---|---|
| 0 | Esta guía y el Excel para simular a la institución (`research/laboratorio/simulacion-institucion-2026-10-v2.xlsx`, fuera de git: tiene cédulas; trae las 215 analizadas arriba, y la primera versión, sin "-v2", quedó superada) | El negocio confirma los nombres y llena el Excel | Hecho el 2026-10-07 |
| 1 | Registrar el Universo como solicitudes reales (cartera propia, sin institución) | Conteos por origen y por análisis, iguales a los de esta guía | — |
| 2 | Reporte mensual: el crédito único y una fila por cierre de mes; leer el Excel de la simulación con la carga que ya existe | Cargar la simulación del negocio; impago, observación y "sin reporte" revisados a mano en tres créditos | — |
| 3 | Reconsulta cada 3 meses atada a cada solicitud y su ronda; cortes a 3, 6, 9 y 12 meses | Una ronda de prueba con 20 personas | — |
| 4 | Revisar juntos los resultados del Laboratorio con la simulación | — | — |
| Antes del 25/12/2026 | Primera ronda real de la cartera (3 meses) | Conteos de la ronda | — |
| Aparte | Ampliar el Universo analizado con los 200 candidatos ya elegidos | 200 de 200 guardados, USD 3,55 | Hecho el 2026-10-07 (autorizado por el negocio) |
| Aparte | Llegar a ~300 analizados | Cuando el análisis esté calibrado, con autorización del gasto | — |

## Reglas de trabajo

- **Sin pantallas nuevas hasta terminar el paso 4** (decisión del negocio
  del 2026-10-07). Se usan las que existen; sólo se tocan si un paso lo
  necesita, y antes se propone el cambio.
- Lo simulado se marca como simulado, también lo que cargue el negocio
  "como si fuera la institución".
- El modelo de lenguaje: una llamada para comprobar un despliegue está
  aceptada; todo lo demás, con autorización y el costo estimado.
- Cédulas y montos no van al repositorio: los archivos con personas viven en
  `research/`.

## Decisiones del negocio del 2026-10-07

1. Mientras dure el desarrollo, todo es **cartera propia**: sin institución.
2. Una solicitud nueva de una persona **es otra solicitud**, no una
   actualización de la anterior.
3. No se analiza la cartera entera (~USD 83): unos 300 casos con caché. Ese
   mismo día autorizó analizar los 200 candidatos ya elegidos (hecho,
   USD 3,55).
4. Sin pantallas nuevas hasta organizarse.

## Dónde está el detalle

- `docs/laboratorio-de-riesgo.md`: el diseño completo y el método (sección
  15: cómo se calcula y se prueba).
- `docs/propuesta-revision-del-laboratorio.md`: la revisión del 04/10, las
  decisiones del 06/10 y lo hecho en las fases 1 y 2. Su plan (sección 11) y
  la propuesta de la fase 3 (sección 15) quedaron reemplazados por esta
  guía.
- `docs/laboratorio-pantallas.md`: el mapa de las pantallas que existen.
- `docs/pendientes.md`: lo abierto de todo el producto, no sólo del
  Laboratorio.

## Lo hecho antes de la guía y mejoras sin fecha

Se movió acá desde `docs/pendientes.md` (2026-10-20). El detalle de las fases está en
`docs/propuesta-revision-del-laboratorio.md`, secciones 13 y 14.

- **Fase 1, hecha el 2026-10-06** (110): detector con disponibilidad de las fuentes
  (`scripts/probar-detector.mjs`); impago parametrizable (más de 90 días, bancos D o E,
  retail con deuda de más de USD 500, observación desde 15 días; tabla de calificación
  versionada en Datos y cartera › Configuración); «revisar» = no impago en la Matriz, los
  motivos y la investigación; el resultado del buró para todos en la población de
  solicitudes; y el ciclo simulado otra vez (carga `746e5271…`). Las pantallas tocadas no se
  vieron con sesión de admin: Configuración, Matriz (columna de observación), Investigación
  de casos (lista de observación), Los que cayeron (aprobar o revisar) y Nuevo corte.
- **Fase 2, hecha el 2026-10-07** (111 y 112): la estadística vive sólo en
  `src/lib/estadistica.js` (la base cuenta; las funciones que calculaban se borraron después
  de comparar en los tres cortes: todo igual), todo lo calculado se guarda con su huella, y el
  ajuste de criterio se retiró (`analyze-client` desplegado sin él; el pedido al modelo quedó
  igual byte a byte). Verificado con sesión de admin el 2026-10-07: Discriminación y Segmentos
  guardaron solos (origen `navegador`, con el usuario y sin cédulas: los números de 10
  dígitos del resultado son todos decimales), y volver a abrir Discriminación después de
  recargar no sumó otra fila.
- La carga del primer ciclo (`1196978e…`) está anulada (confirmado por el negocio); la
  vigente es la del segundo (`746e5271…`). Resultados de la corrida del ciclo:
  `docs/laboratorio-de-riesgo.md`, 14.10, 14.11 y 15.4 (carga `1196978e-…`, corte `4e18ca83-…`).
- **El Universo analizado**: eran 14 solicitudes con análisis válido (no 33) y 3 con el marco
  vigente; con el lote del 2026-10-07 son 205 personas con marco-v28 (la base tiene 207
  análisis con marco-v28 al 2026-10-20).
- 2 personas quedaron afuera del ciclo porque su perfil de t0 no tiene crudo guardado
  (consultadas desde la pantalla antes de la 090).
- Lo pesado (bosque, SHAP, K-medias, PCA) se recalcula con
  `node scripts/analisis-pesado.mjs --corte=<id>` cuando cambia un corte; el explorador del
  crudo, con `node scripts/explorar-crudo.mjs`.

**Mejoras chicas que el plan no toca** (sin fecha; ninguna antes del paso 4):

- El ajuste por la recomendación para un valor numérico en el explorador del crudo.
- El origen de cada campo de la estructura como dato.
- «No consultado» contra «no tiene» en Faltantes (congelar la disponibilidad por tema con el
  corte).
- Registrar los informes exportados y la revisión manual de la conciliación.
- Un dato que falta: la provincia de residencia (está en el crudo, en direcciones).
- La comparación entre modelos necesita un marco candidato (fase 7, con costo).
- `n_malos` queda vacío cuando el resultado no trae un número de malos arriba
  (`tamanoDe()` en `resultadosDelCorte.js`; en Discriminación `malos` es la distribución):
  pasarlo explícito desde cada pestaña que guarda sola.

## Cómo está construido

Lo técnico: dónde vive cada cálculo, cómo se prueba y lo que costó caro
aprender. Vivía en CLAUDE.md hasta el 2026-10-20.

- `src/lib/laboratorio.js` y las funciones SQL `lab_*` — el Laboratorio
  de Inteligencia de Negocio, que reemplazó a Retroalimentación. Esta guía
  (los grupos, el plan por pasos y las reglas) se pone al día al terminar
  cada sesión. **Sin pantallas nuevas del
  Laboratorio hasta el paso 4 de la guía** (decisión del negocio del
  2026-10-07: se venía construyendo sin guía clara). El diseño completo, en
  `docs/laboratorio-de-riesgo.md`. Los "ajustes del criterio" (texto
  sumado al marco sin versión nueva) se retiraron el 2026-10-07 (112): todo
  cambio a lo que lee el modelo es una versión nueva del marco. La cartera
  sintética la arma `scripts/generar-cartera-sintetica.mjs` (señal
  plantada: un cálculo nuevo se valida contra ella). **La estadística vive
  sólo en `src/lib/estadistica.js`** (111): la base congela, vincula y cuenta
  (`lab_contar_*`); `resultadosDelCorte.js` arma con ella el desempeño, las
  variables, la estabilidad y los intervalos, y `calculosDelCorte.js` guarda.
  Todo lo calculado queda en `lab_resultados` con su huella (corte, tipo,
  población, parámetros y versión del cálculo: `VERSION_DEL_CALCULO`, que se
  sube al cambiar un cálculo); las pestañas guardan solas
  (`useGuardarResultado`) y sin filas ni cédulas (`RESUMEN`).
  - El **explorador del crudo** (14.11 del diseño) es un guion, no una
    función: `scripts/explorar-crudo.mjs --corte=<id>` (`--seco` primero,
    `--buscar=` para el puesto de un campo). Guarda en `lab_resultados`
    (tipo `crudo`) y la pestaña del corte sólo lo muestra.
  - El **ciclo de un año** (sección 14 del diseño, 098-104): solicitudes,
    reconsultas y eventos; la verdad plantada vive aparte
    (`lab_simulacion_verdad`) y sólo la lee `lab_contar_calificacion()`.
    Simular: `scripts/simular-un-anio.mjs` (`--seco` primero). Procesar
    (simulación y real): `scripts/procesar-reconsultas.mjs --carga=<id>`.
    El detector de eventos es `_shared/eventos-entre-consultas.ts`: una
    fuente cuenta sólo si contestó en t0 y en t1 (antes inventaba eventos);
    se prueba con `scripts/probar-detector.mjs`.
  - **El impago es un parámetro** (110), no código: la definición (más de N
    días, categorías de bancos, retail con deuda de más de USD X, lista de
    observación desde N días) y la tabla de calificación (categoría → días,
    versionada) se cambian en Datos y cartera › Configuración. Vigente desde
    el 2026-10-06: más de 90 días (Basilea), bancos D o E, retail con deuda de
    más de USD 500, observación desde 15 días; revisar = no impago. «D o E» se
    aplica sólo a la operación que trae calificación (Proveedor_Info_1); la que trae
    días se juzga por días, así que la del buró de la institución (Equifax no
    trae calificación) no pide cambiar la definición. Traer el resultado del
    buró en el t1 sí falta (`docs/propuesta-dias-de-mora-con-buro.md`,
    sección 3). Una
    solicitud tiene dos resultados: `malo` (archivo para lo desembolsado,
    buró para el resto: cuadrantes y motivos) y `malo_buro` (el buró para
    todos: lo usa todo cálculo que junta las dos poblaciones).
  - Las **pantallas pedidas por el negocio** están todas construidas
    (fases A-F y módulos 1-3, 100-109; mapa y estados en
    `docs/laboratorio-pantallas.md`, método en la sección 15 del diseño).
    Los módulos de análisis usan `ModuloDelCorte` (corte y pestaña en la
    dirección). La estadística del navegador es `src/lib/estadistica.js`
    (jStat sólo para las distribuciones) y los cálculos de cada pestaña,
    `src/lib/analisis{Retrospectivo,Estadistico,Profundo}.js`, sin React:
    **se prueban en Node** con `scripts/probar-estadistica.mjs` y
    `scripts/probar-pantallas-laboratorio.mjs` (correrlos después de tocar
    cualquiera). Lo pesado, `scripts/analisis-pesado.mjs` (bosque con
    SHAP, K-medias, PCA; Node porque no hay Python).
  - **Hallazgos** (decisión del negocio del 2026-10-06, reemplaza a la del
    04/10): los resultados de los análisis estadísticos, descriptivos,
    inferenciales y exploratorios sobre los que el modelo dio por buenos
    (aprobar o revisar) y cayeron; van al Informe de Desempeño del Modelo
    (`informeLaboratorio.js`). Las decisiones del 2026-10-06 y el plan en
    cuatro fases: `docs/propuesta-revision-del-laboratorio.md`, 10 a 12.
  - La forma de una fila del corte vive en `src/lib/filasDelCorte.js` (sin
    el cliente de Supabase, para que la importen los guiones). Las funciones
    de la base que calculaban estadística (`lab_auc`, `lab_calcular_*`,
    `lab_estabilidad`, `lab_calificar_simulacion`) se borraron en la 112: lo
    que guardaron (origen `base`) es la referencia de las pruebas.

### Lo que costó caro aprender

- Las variables salen siempre del perfil del día del análisis (t0,
  rearmado desde su crudo), nunca de la reconsulta: el buró de hoy ya trae
  la mora y cualquier variable "acierta".
- Dos consultas de la misma persona difieren aunque no le haya pasado nada:
  el buró cambia de corte, hay entidades que empiezan a reportar, el IESS
  completa el último mes después y el SRI corrige ceses viejos. Comparar dos
  fotos va por `eventos-entre-consultas.ts`, que lo separa.
- Con ~300 créditos hay ~20 malos: la prueba sólo con lo desembolsado es
  ruido (AUC 0,63 con intervalo 0,51-0,75 en la simulación). Lo que da
  poder es reconsultar a todas las solicitudes (211 malos).
- Una simulación puede fabricar su propio problema: antes de culpar al
  cálculo, mirar si lo plantado es realista.
- Reconsultar la cartera entera tarda ~2 h 10 min (concurrencia 20) y una
  tarea en segundo plano se corta a las 2 h: `consultar-lote.mjs` retoma.
- "¿El modelo ya lo tenía?" se decide por cuánto efecto sobrevive dentro de
  cada recomendación, no por una segunda prueba de significancia: esa
  segunda prueba, sin casos suficientes, borraba la señal plantada.
- Unos tramos por posición (ntile) parten los empates y fabrican IV: un
  valor nunca va en dos tramos (106).
- Una curva de cosechas sin la fecha del impago de una parte de los malos
  dibuja una caída falsa: sin fecha para más del 10%, no se dibuja.
