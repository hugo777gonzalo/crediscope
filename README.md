# CrediScope

Análisis crediticio asistido por IA. Consulta la información de una
persona en Novadata (9 bloques, ~50 recursos), la procesa a una
**Estructura Estandarizada** de 16 grupos, y un LLM (Claude) la evalúa
guiado por un **marco interpretativo** en lenguaje natural para producir
un **score aproximado** (1-999), una **recomendación de acción**
(aprobar / revisar / observar / negar), puntos a favor y en contra, y
qué información falta.

Todo queda persistido en Supabase y se expone tanto en la interfaz web
para analistas como vía API para otros sistemas.

## Estado (2026-09)

En uso interno, sobre un proyecto Supabase real y con clientes reales.
La ingesta de Novadata está cableada contra producción (confirmada con
HAR reales y ~25 consultas de muestra, ver `docs/novadata-fields-catalog.md`).
El frontend se despliega solo a GitHub Pages en cada push a `main`.

- **Marco interpretativo:** `marco-v14` (`MARCO_VERSION` en
  `supabase/functions/_shared/marco-interpretativo.ts`). Cada versión
  tiene su fila en `scoring_rules_versions` — subir la constante sin
  crear la fila rompe la FK al guardar un análisis.
- **Criterio vigente:** marco base + ajustes aprobados por el área,
  versionado en `criterio_versiones`. Cada análisis guarda con qué
  versión se hizo (`analysis_results.criterio_version_id`).

Lo que **sigue pendiente de validación del negocio**: los criterios
*dentro* de cada grupo del marco (qué campo pesa cuánto, qué se
considera grave). El *orden de importancia* de los grupos sí lo definió
el usuario. El marco es texto plano: se ajusta sin tocar lógica.

Otros pendientes abiertos están al final de este archivo.

## Arquitectura

```
Frontend (Vite/React, estático, GitHub Pages)
   |  supabase.functions.invoke(...)
   v
Edge Functions (Deno, en Supabase)
   |
   |-- structure-client    Novadata -> Estructura Estandarizada -> clasificación -> client_profiles
   |-- analyze-client      (lo anterior, o un perfil ya guardado) -> controles de bloqueo -> LLM -> analysis_results
   |-- explore-novadata    inspección cruda de la ingesta (solo admin)
   |-- analizar-feedback   informe "Esto encontramos" sobre un paquete de resultados reales
   |-- proponer-ajustes    propuestas de ajuste al criterio, para aprobación humana
   |-- correr-backtest     re-corre casos reales con el criterio candidato y compara
   v
Supabase Postgres (ver "Base de datos")
```

Las credenciales de Novadata, la API key de Anthropic y la
`service_role key` viven **solo** en las secrets de las Edge Functions —
nunca llegan al navegador. El frontend solo tiene la `anon key`,
limitada por RLS.

### El pipeline de evaluación

1. **Ingesta** — `novadata-client.ts`. Los 9 bloques en paralelo
   (general, sociodemográfica, trabajo, IESS, vehículos, función
   judicial, fiscalía, bancos, cooperativas). Cada bloque reporta `ok` /
   `faltante` / `error` por separado: eso es lo que permite después
   interpretar "información faltante" como señal de negocio y no como
   falla del sistema.
2. **Estructura Estandarizada** — `process.ts` (`buildStandardProfile`).
   Convierte el crudo en 16 grupos de campos normalizados (booleanos,
   conteos, montos) en vez de arrays completos. La fuente de verdad del
   contrato es `StandardClientProfile` en `types.ts`.
3. **Clasificación** — `classify.ts`. Cada campo cae en positivo /
   negativo / complementario / sin información. Es lo que se muestra en
   Perfil del Cliente, y no depende del LLM.
4. **Controles de bloqueo** — `controles-bloqueo.ts`. Determinísticos, a
   propósito fuera del criterio del LLM: persona fallecida, listas de
   sanciones/lista negra, y delitos graves de seguridad ciudadana. Si se
   activa uno, el score se fuerza a 1 y la recomendación a "negar", sin
   importar lo que devuelva el LLM. **PEP no es bloqueante** — es un
   dato de cumplimiento (PLA-FT, debida diligencia reforzada), no una
   señal de mal comportamiento de pago.
5. **Scoring** — `llm-scoring.ts` + `marco-interpretativo.ts`. Todo lo
   demás (laboral, judicial, financiero, patrimonio) queda a criterio
   del LLM. Al marco base se le suman en tiempo de ejecución los ajustes
   vigentes (ver abajo), sin reescribirlo.

**Por qué el score no es una fórmula:** fue un cambio deliberado
respecto del primer andamiaje, que sí calculaba con pesos fijos. Hay
demasiada señal cualitativa (tipo de demanda, severidad de una mora,
patrón de estabilidad laboral) para reducir a un scorecard numérico.

## Ciclo de calibración (Retroalimentación)

El modelo mejora con resultados reales de crédito, en 5 etapas, con
aprobación humana en el medio. Pensado para que lo opere el área de
Crédito/Riesgos, no un perfil técnico.

1. **Cargar resultados reales** — plantilla de Excel (identificación,
   fecha, si incumplió, tipo, observaciones del área). `feedback_paquetes`
   / `feedback_creditos`.
2. **Cruce con lo que el modelo dijo** — se resuelve por fecha contra el
   análisis de entonces. Los casos "recomendamos negar pero se
   desembolsó" salen del propio dato, sin campos manuales extra.
3. **Informe "Esto encontramos"** — `analizar-feedback`. Las
   estadísticas se calculan en código (tienen que ser exactas y
   reproducibles); el LLM aporta solo lo cualitativo: sobre todo separar
   los incumplimientos que **eran previsibles** con la información
   disponible de los que fueron por causas externas.
4. **Propuestas de ajuste** — `proponer-ajustes`. Nacen en estado
   pendiente; una persona del área las aprueba, rechaza o pide cambios.
   Aprobar y poner en vigencia son dos pasos distintos.
5. **Prueba contra casos reales** — `correr-backtest`. Re-corre casos con
   el criterio candidato. Dos reglas sostienen su validez: usa el
   **perfil congelado** de la fecha original (nunca reconsulta la fuente,
   que hoy ya tiene registrada la mora que entonces no existía), y evalúa
   incumplimientos **y** créditos que pagaron bien, para que endurecer el
   criterio siempre muestre su costo.

### Versionado y reversión del criterio

Cada vez que cambia el conjunto de ajustes vigentes, un trigger congela
una versión en `criterio_versiones` con el **texto completo** de lo que
regía (no referencias: una versión histórica tiene que seguir diciendo
qué se aplicó aunque después se edite o borre la propuesta). Solo se
registra si el criterio *efectivo* cambió — aprobar algo sin ponerlo en
vigencia no ensucia el historial.

Desde `/retroalimentacion/versiones` se puede volver a una versión
anterior (`revertir_criterio`) o desactivar todos los ajustes de golpe
(`desactivar_todos_los_ajustes`), para el caso de un error no
identificado donde no se sabe cuál ajuste falló. Ninguna de las dos
borra historia: revertir crea una versión nueva.

## Secciones de la app y acceso por rol

El rol vive en `profiles.rol` (`analista` / `admin`) y se aplica en RLS,
no solo ocultando enlaces del menú.

| Sección | Ruta | Acceso |
| --- | --- | --- |
| Evaluación Crediticia (Buscar Cliente, Perfil del Cliente, Análisis con IA) | `/`, `/perfil/:cedula`, `/analisis/:cedula` | analista |
| Historial | `/historial` | analista |
| Reportes (Reporte Gerencial de Gestión) | `/reportes` | analista |
| Retroalimentación | `/retroalimentacion` | admin |
| Explorador de Fuentes | `/explorar` | admin |
| Configuración | `/admin/configuracion` | admin |

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
- `client_profiles` — la Estructura Estandarizada calculada, con su
  clasificación y el control de bloqueo. Es lo que permite reutilizar un
  perfil reciente, y lo que congela el pasado para las pruebas del ciclo
  de calibración.
- `profiles` — nombre corto, entidad financiera y rol de cada usuario.
- `novadata_resource_config`, `standard_profile_field_config`,
  `standard_profile_segment_config` — qué recursos/campos están activos,
  configurables desde la app sin desplegar.
- `feedback_paquetes`, `feedback_creditos`, `feedback_informes`,
  `feedback_propuestas`, `feedback_backtests`, `criterio_versiones` — el
  ciclo de calibración.

Se guardan **solo los resultados**, nunca el crudo de Novadata: se
consulta en vivo y se descarta tras procesarlo. Toda consulta queda
auditada en `audit_log`, y solo las Edge Functions (con `service_role
key`) escriben resultados — el navegador nunca escribe directo.

Los bloques incluyen Fiscalía, Función Judicial y Bancos: información
muy sensible. Revisar cumplimiento con la LOPDP (Ecuador) —
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

Sin `NOVADATA_USERNAME`/`NOVADATA_PASSWORD`, cada bloque devuelve
`status: "error"` sin romper el pipeline — sirve para probar el flujo
completo de punta a punta.

### Explorador de Fuentes

`src/pages/NovadataExplorer.jsx` (`/explorar`, **solo admin**) consulta
todos los recursos de una cédula y muestra el resumen curado más el
crudo de los 9 ejes, sin persistir nada. La contraseña que se ingresa
ahí nunca se guarda: viaja en el body del POST, se usa una vez para
pedir el token de Novadata y se descarta.

**Nota de seguridad:** la contraseña de Novadata es una credencial de
Active Directory. Si en algún momento se escribió o pegó en un chat, una
terminal compartida, o cualquier lugar fuera de las secrets de la Edge
Function, rotarla. Nunca debe quedar en el código ni en un `.env`
versionado (`.gitignore` ya excluye `.env` y `.env.functions`).

## Pendientes

- **Validar el marco interpretativo con el negocio** — lo más importante
  a afinar; ver arriba.
- **Confirmar campos internos** en `process.ts`/`normalize.ts` para los
  recursos que todavía no se vieron poblados en ningún caso real.
- **SMTP propio (ej. Resend)** para volver al código de 6 dígitos en
  Crear Cuenta. Hoy la verificación es por enlace: Supabase no deja
  editar el contenido de sus plantillas (para mostrar `{{ .Token }}`)
  salvo con SMTP propio. Ver la nota en `src/pages/Signup.jsx`.
- **Conector de buró de crédito (Equifax)** — a la espera de
  credenciales de API. Se descartó automatizar el portal web: es una
  fuente regulada y frágil. Cuando llegue la documentación de campos,
  armar `buro-equifax.ts` como conector tipado más la propuesta de mapeo
  a la Estructura Estandarizada.
