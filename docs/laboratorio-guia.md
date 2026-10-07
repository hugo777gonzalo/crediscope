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
| **Sin crédito** | Solicitudes que no se desembolsaron (negadas, desistieron, en trámite). | **Reconsulta en Novadata cada 3 meses**: el impago en todo el sistema financiero. | 0 reconsultas reales; la primera ronda, desde el 25/12/2026 |

Las palabras del tiempo: **t0** es el día de la solicitud; **mes 1, 2,
3...** son los cierres del reporte mensual después del desembolso; la
**ronda de 3, 6, 9 o 12 meses** es la reconsulta en Novadata a ese tiempo
de la solicitud.

**Recomendación, a confirmar:** reconsultar cada 3 meses a todo el Universo,
no sólo a los sin crédito. Novadata no cobra por ahora y es una sola lista.
A los con crédito no les cambia el resultado (lo da la institución), pero
muestra por qué cayeron (otra institución les prestó, perdieron el trabajo);
y a los que no tienen análisis los deja servir para buscar variables.

## Qué es impago

La definición vigente desde el 2026-10-06, que se cambia en Datos y cartera
› Configuración sin tocar código:

- Con crédito, por el reporte de la institución: más de 90 días de mora
  (Basilea), castigo, reestructuración o demanda judicial.
- Sin crédito, por Novadata: más de 90 días en cualquier entidad, bancos en
  D o E, retail con deuda de más de USD 500, castigo o demanda.
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
