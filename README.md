# CrediScope

Análisis crediticio asistido por IA. Consulta la información de una
persona en Novadata (52 fuentes), la procesa a una
**Estructura Estandarizada** de 17 grupos, y un LLM (Claude) la evalúa
guiado por un **marco interpretativo** en lenguaje natural para producir
un **score aproximado** (1-999), una **recomendación de acción**
(aprobar / revisar / negar), indicadores de riesgo e
historial de pago, puntos a favor y en contra, y qué quedó sin
confirmar.

Todo queda persistido en Supabase y se expone tanto en la interfaz web
para analistas como vía API para otros sistemas.

## Estado (2026-09)

En uso interno, sobre un proyecto Supabase real y con clientes reales.
La ingesta de Novadata está cableada contra producción (confirmada con
HAR reales y ~25 consultas de muestra, ver `docs/novadata-fields-catalog.md`).
El frontend se despliega solo a GitHub Pages en cada push a `main`.

- **Marco interpretativo:** `marco-v26` (`MARCO_VERSION` en
  `supabase/functions/_shared/marco-interpretativo.ts`). Cada versión
  tiene su fila en `scoring_rules_versions` — subir la constante sin
  crear la fila rompe la FK al guardar un análisis.
- **Estructura Estandarizada:** `estructura-v11` (`PROCESS_VERSION` en
  `process.ts`); clasificación de ingresos `fuentes-v9`
  (`FUENTES_INGRESO_VERSION` en `fuentes-ingreso.ts`). Qué cambió en
  cada versión y por qué: `docs/estructura-estandarizada.md`.
- **Sin ajustes del criterio** desde el 2026-10-07 (112): todo cambio a lo
  que lee el modelo es una versión nueva del marco. `criterio_versiones` y
  `analysis_results.criterio_version_id` quedan como historia.

Lo que **sigue pendiente de validación del negocio**: los criterios
*dentro* de cada grupo del marco (qué campo pesa cuánto, qué se
considera grave). El *orden de importancia* de los grupos sí lo definió
el usuario. El marco es texto plano: se ajusta sin tocar lógica.

Los pendientes abiertos, con sus números y cómo se verifican, están en
`docs/pendientes.md`.

## Arquitectura

```
Frontend (Vite/React, estático, GitHub Pages)
   |  supabase.functions.invoke(...)
   v
Edge Functions (Deno, en Supabase)
   |
   |-- structure-client    Novadata -> Estructura Estandarizada -> client_profiles (Perfil del Cliente)
   |-- analyze-client      (lo anterior, o un perfil ya guardado) -> controles de bloqueo -> LLM -> analysis_results
   |                       (si consulta en fresco, guarda también el perfil: ningún análisis queda sin su data)
   |-- explore-novadata    inspección cruda de la ingesta (solo admin)
   v
Supabase Postgres (ver "Base de datos")
```

El pedido al modelo se arma en un solo lugar, `armarPedidoScoring()`
(`llm-scoring.ts`), para el análisis, el lote
(`scripts/analizar-en-lote.mjs`) y la comparación de razonamiento. En un
análisis suelto el marco va **sin caché de prompt**: la caché dura 5
minutos y entre dos análisis pasan 26 de mediana, así que se escribió 12
veces y no se leyó nunca (medido el 2026-09-27). En lote sí va cacheado. Lo
que más pesa en el costo es el razonamiento del modelo, no el marco ni
la respuesta: `scripts/comparar-razonamiento.mjs` compara
configuraciones sobre casos reales y arma un Excel.

Las credenciales de Novadata, la API key de Anthropic y la
`service_role key` viven **solo** en las secrets de las Edge Functions —
nunca llegan al navegador. El frontend solo tiene la `anon key`,
limitada por RLS.

### El pipeline de evaluación

1. **Ingesta** — `novadata-client.ts`. Las 52 fuentes en paralelo, sin
   agrupar. Cada una reporta `ok` / `faltante` / `error` /
   `deshabilitado` por separado: eso es lo que permite después
   interpretar "información faltante" como señal de negocio y no como
   falla del sistema.

   Hasta la migración 078 las fuentes pasaban por nueve "bloques" de
   negocio que agregaban su estado, y ahí se perdía justamente esa
   distinción: un bloque figuraba `ok` con UNA de sus catorce fuentes
   respondiendo. La relación real entre fuentes y grupos del perfil es
   muchos a muchos y vive en la tabla `fuente_grupo`.
2. **Estructura Estandarizada** — `process.ts` (`buildStandardProfile`).
   Convierte el crudo en 17 grupos de campos normalizados (booleanos,
   conteos, montos) en vez de arrays completos. La fuente de verdad del
   contrato es `StandardClientProfile` en `types.ts`.
3. **Perfil del Cliente** — lo que ve el analista: esos mismos 17 grupos
   en tarjetas, con los campos que tienen dato real
   (`perfilClienteCampos.js` + `SegmentosPerfil.jsx`, y qué segmentos se
   muestran lo decide `standard_profile_segment_config`). Es
   **puramente informativo: no marca positivo ni negativo** — qué juega
   a favor y qué en contra lo determina el Análisis con IA (paso 5).
4. **Controles de bloqueo** — `controles-bloqueo.ts`. Determinísticos, a
   propósito fuera del criterio del LLM: persona fallecida, listas de
   sanciones/lista negra, y delitos graves de seguridad ciudadana en los
   que la persona figura con su cédula como sospechosa, procesada o
   aprehendida (`_shared/denuncias.ts`: quien denunció o fue víctima no
   queda bloqueado). Si se
   activa uno, el score se fuerza a 1 y la recomendación a "negar", sin
   importar lo que devuelva el LLM. **PEP no es bloqueante** — es un
   dato de cumplimiento (PLA-FT, debida diligencia reforzada), no una
   señal de mal comportamiento de pago.
5. **Scoring** — `llm-scoring.ts` + `marco-interpretativo.ts`. El
   modelo no lee el perfil entero: lee el **perfil del modelo**
   (`perfil-del-modelo.ts`), con los nombres de la pantalla y sin los
   datos que no le corresponden (aportes mes a mes, renta por año). Todo lo
   demás (laboral, judicial, financiero, patrimonio) queda a criterio
   del LLM, que devuelve score, recomendación de acción con 2-4 pasos
   concretos de qué validar o pedirle al cliente, dos indicadores de
   lectura rápida (riesgo e historial de pago), la evidencia a favor y
   en contra, y lo que no se pudo confirmar. Cada campo contesta una
   pregunta distinta: el resumen el porqué, las acciones el qué hago,
   las observaciones lo que no se pudo confirmar.

   El modelo tiene prohibido proponer **condiciones comerciales**
   (montos, plazos, cuotas, tasas, garantías): eso lo resuelve el
   análisis económico de la entidad, que simula la cuota contra la
   capacidad de pago. Misma frontera que separa criterio del modelo de
   política de crédito en el ciclo de calibración.

   El tercer indicador del diseño, **capacidad de pago, queda pendiente**:
   no hay todavía una fuente de ingresos confiable con qué estimarla, y
   calcularla igual sería inventar un criterio. La pantalla lo muestra
   como "sin fuente" en vez de ocultarlo.

**Por qué el score no es una fórmula:** fue un cambio deliberado
respecto del primer andamiaje, que sí calculaba con pesos fijos. Hay
demasiada señal cualitativa (tipo de demanda, severidad de una mora,
patrón de estabilidad laboral) para reducir a un scorecard numérico.

## Laboratorio de Inteligencia de Negocio › Riesgo de Crédito

Reemplazó a Retroalimentación el 2026-10-03. Mide si el motor acertó contra
lo que realmente pasó con los créditos, busca qué datos anticipaban el
impago y lo convierte en una propuesta de ajuste con evidencia. Lo opera
nuestro equipo (sólo admin); la institución recibe un informe exportado.
Diseño completo, decisiones y criterios de aceptación en
`docs/laboratorio-de-riesgo.md`.

1. **Carga** del archivo de la institución, con fechas y días de mora a 12
   y 24 meses, y **vínculo** de cada operación con el análisis y el perfil
   anteriores al desembolso, en la base (`lab_cerrar_carga`). Lo
   consultado después del desembolso es fuga y queda afuera.
2. **Corte**: la población congelada (cargas, definición de impago,
   ventana), que copia puntajes y valores para dar siempre el mismo número.
3. **Desempeño, variables y simulación de política**, sin llamar al
   modelo: AUC, KS, tasa por recomendación y por tramo, valor de
   información por variable, y qué pasaría con una regla. La base cuenta y
   la estadística vive sólo en `src/lib/estadistica.js` (111); todo lo
   calculado se guarda en `lab_resultados` con su huella.
4. **Propuestas** con su evidencia. Un cambio de marco, de dato o de
   política se aplica con una versión nueva (el ajuste del criterio, texto
   sumado al marco sin versión, se retiró el 2026-10-07).

Sin una institución real todavía, se desarrolla y se prueba con una
**cartera sintética con señal plantada** (`scripts/generar-cartera-sintetica.mjs`),
marcada como tal en toda pantalla y excluida de todo informe.

## Reportes: Inteligencia de Negocios y Descargas

Son dos cosas distintas y por eso viven en pantallas separadas.
**Inteligencia de Negocios** (`Reportes.jsx`) es un tablero EN VIVO
sobre toda la cartera consultada — volumen, tendencia, distribución de
score, riesgo y cumplimiento, actividad por analista, tiempos — pensado
para mirarse en pantalla con una jefatura. **Descargas**
(`Descargas.jsx`) son los reportes planos, para bajar y trabajar afuera.

### Descargas › Información de Solicitudes

El exportable (`src/lib/exportAnalitico.js`) trae
una fila por solicitud en el rango de fechas que se elija: los ~145
campos de la Estructura Estandarizada con los que se evaluó a esa
persona, el score, la recomendación, la versión del criterio (vacía desde
el 2026-10-07) y — cuando
hay una carga real en el Laboratorio — el resultado del crédito (estado y
días de mora por ventana; nunca el de una carga sintética). Los Sí/No salen como
1/0 porque es una tabla para calcular. El total se cuenta en el servidor
antes de descargar: cada perfil son ~10 KB.

Es lo que permite hacer el análisis estadístico (correlación contra el
incumplimiento, tasas por variable) en Power BI o Excel, sin programar
cada consulta. El archivo lleva una hoja con las reservas del caso: solo
los créditos desembolsados tienen resultado, así que toda tasa está
condicionada a haber aprobado; y con pocos incumplimientos, revisar
muchas variables a la vez produce correlaciones por puro azar.

La columna `perfil_vinculo` dice de dónde salió la información de cada
fila — `exacto` (lo registró el sistema al correr la solicitud),
`inferido_anterior` / `inferido_posterior` (deducido por fecha en el
histórico previo a la 032) o `sin_perfil`. **`inferido_posterior` hay
que excluirlo** de cualquier análisis sobre qué se podía saber de
antemano: el perfil es posterior a la solicitud y puede traer
información que entonces no existía.

### El criterio, retirado

Hasta el 2026-10-07 el área podía sumar "ajustes del criterio" al marco:
texto libre que entraba en lo que lee el modelo sin versión nueva, con su
historial en `criterio_versiones` y reversión. Se retiró (decisión del
negocio del 2026-10-06, migración 112) porque su efecto no se podía medir
antes de ponerlo. Nunca hubo uno en vigencia: la única versión no tiene
ajustes. La tabla y `analysis_results.criterio_version_id` quedan como
historia.

## Secciones de la app y acceso por rol

El rol vive en `profiles.rol` (`analista` / `admin`) y se aplica en RLS,
no solo ocultando enlaces del menú.

| Sección | Ruta | Acceso |
| --- | --- | --- |
| Evaluación Crediticia (Buscar Cliente, Perfil del Cliente, Análisis con IA) | `/`, `/perfil/:cedula`, `/analisis/:cedula` | analista |
| Solicitudes (historial de consultas y análisis) | `/historial` | analista |
| Reportes › Inteligencia de Negocios (tablero en vivo) | `/reportes` | analista |
| Reportes › Descargas (reportes planos) | `/reportes/descargas` | analista |
| Fuentes de Ingreso (Panorama, Clientes por segmento, Reglas) | `/fuentes` | analista |
| Fuentes de Ingreso › Parámetros | `/fuentes/parametros` | admin |
| Costos (Panorama, Costo por consulta, Corridas masivas, Detalle de llamadas, Fallas e incidentes, Tarifas) | `/costos` | admin |
| Laboratorio › Riesgo de Crédito | `/laboratorio` | admin |
| Explorador de Fuentes | `/explorar` | admin |
| Configuración | `/admin/configuracion` | admin |

Costos es admin en la ruta **y** en la política de la base: no es un dato
operativo, es el margen del negocio.

Autenticación por correo y contraseña (Supabase Auth). Cualquiera puede
crear su cuenta desde `/crear-cuenta`; el rol se fuerza a `analista` en
el trigger — el auto-registro nunca puede crear un admin.

## Base de datos

`supabase/schema.sql` es el esquema **inicial**; todo lo posterior está
en `supabase/migrations/`, numeradas y en orden. Se aplican a mano (SQL
editor del dashboard, o `supabase db query --linked --file <archivo>`) —
el historial de migraciones del proyecto remoto está vacío a propósito,
así que **`supabase db push` volvería a aplicar todas desde la 001**.

Tablas principales:

- `clients`, `ingestion_runs`, `analysis_results`, `audit_log`,
  `scoring_rules_versions` — el núcleo (schema.sql).
- `client_profiles` — la Estructura Estandarizada calculada y el control
  de bloqueo, congelados con su fecha. Todo análisis apunta al suyo
  (`analysis_results.client_profile_id`, y `client_profile_vinculo` dice
  si ese vínculo es exacto o deducido por fecha): es lo que permite
  reutilizar un perfil reciente, auditar con qué información se evaluó a
  alguien, y analizar después contra el resultado real del crédito.
- `profiles` — nombre corto, entidad financiera y rol de cada usuario.
- `novadata_resource_config`, `standard_profile_field_config`,
  `standard_profile_segment_config` — qué recursos/campos están activos,
  configurables desde la app sin desplegar.
- `lab_*` (cargas, operaciones, cortes, resultados, propuestas, catálogo
  de variables, definiciones de impago) — el Laboratorio.
  `criterio_versiones` queda como historia del criterio retirado.

El crudo de Novadata se guarda comprimido en el depósito privado
`crudo-novadata` de Storage (desde la 090), y lo que leyó el modelo en
`analysis_results.mensaje_al_modelo`. Toda consulta queda
auditada en `audit_log`, y solo las Edge Functions (con `service_role
key`) escriben resultados — el navegador nunca escribe directo.

Las fuentes incluyen Fiscalía, Función Judicial y buró de crédito:
información muy sensible. Revisar cumplimiento con la LOPDP (Ecuador) —
consentimiento, retención, y quién puede consultar qué.

## Desarrollo local

```bash
npm install
cp .env.example .env         # credenciales del proyecto Supabase
npm run dev
```

Sin `.env`, el frontend arranca igual y muestra un aviso de "Supabase no
configurado" en vez de fallar.

### Edge Functions (requiere Supabase CLI)

```bash
supabase login
supabase link --project-ref <project-ref>
cp .env.functions.example .env.functions
supabase secrets set --env-file .env.functions
supabase functions deploy analyze-client
```

Para probar antes de desplegar (requiere Docker corriendo):

```bash
supabase functions serve analyze-client --env-file .env.functions
```

Sin `NOVADATA_USERNAME`/`NOVADATA_PASSWORD`, cada fuente devuelve
`status: "error"` sin romper el pipeline — sirve para probar el flujo
completo de punta a punta.

### Explorador de Fuentes

`src/pages/NovadataExplorer.jsx` (`/explorar`, **solo admin**) consulta
las 52 fuentes de una cédula y muestra el estado y el crudo de cada
una, sin persistir nada. La contraseña que se ingresa
ahí nunca se guarda: viaja en el body del POST, se usa una vez para
pedir el token de Novadata y se descarta.

**Nota de seguridad:** la contraseña de Novadata es una credencial de
Active Directory. Si en algún momento se escribió o pegó en un chat, una
terminal compartida, o cualquier lugar fuera de las secrets de la Edge
Function, rotarla. Nunca debe quedar en el código ni en un `.env`
versionado (`.gitignore` ya excluye `.env` y `.env.functions`).

## Hacia dónde va

`docs/arquitectura-fabrica-de-credito.md` es la definición estratégica:
CrediScope hoy evalúa personas, y una fábrica de crédito procesa
solicitudes. Ahí está qué falta para cerrar esa brecha (la solicitud
como entidad, la capacidad de pago, el registro de la decisión y la
política separada del criterio), y cómo se reorganiza lo ya construido
alrededor del ciclo del crédito en vez del orden en que se fue
haciendo.

Está en pausa por decisión del negocio, no descartada.

## Puesta en marcha en una institución

`docs/puesta-en-marcha-ifi.md` es el temario de la sesión de trabajo con
la IFI: los ~35 parámetros que hay que decidir juntos antes del primer
cliente real, agrupados por quién los decide (política de crédito,
datos del país, costo, seguridad, servicio), cada uno con su valor
actual y si se cambia por código, por pantalla o por base.

Buena parte sigue en código a propósito — el primer despliegue se afina
así. El destino es que todo eso viva en una pantalla de administración.

## Pendientes

La lista está en `docs/pendientes.md`: qué quedó abierto, por qué
importa y cómo se verifica, ordenado por urgencia.
