# CrediScope — Score de Información Interna

Agente interno de análisis crediticio: consulta la web Novadata (9
bloques de información de un cliente), y un LLM (Claude) evalúa toda la
información agregada para producir un **score aproximado** de riesgo
crediticio (1-999) junto con puntos a favor/en contra y qué información
falta — persiste el resultado en Supabase y lo expone tanto en una
interfaz web para analistas como vía API para otros sistemas.

## Estado de este scaffold

Este es el andamiaje inicial del proyecto. **No está conectado a un
proyecto Supabase real todavía**, pero la ingesta de Novadata sí — se
confirmó con 2 HAR reales capturados de la interfaz web (uno de una
persona sin historial, otro con demandas/mora/antecedentes reales) que
**los 9 bloques** ya están cableados contra producción (2026-09),
agrupando los recursos reales de Novadata que corresponden a cada uno
(ver `RECURSOS_POR_BLOQUE` en `novadata-client.ts`):

- ✅ **Información general** (`pn_inf_basica`) — forma rica confirmada.
- ✅ **Sociodemográfica, Trabajo, Aportes IESS, Vehículos, Función
  Judicial, Fiscalía, Bancos, Cooperativas** — cableados con los
  recursos reales confirmados por los 2 HAR, incluyendo casos con datos
  poblados (demandas, buró de crédito con mora, antecedentes penales
  con descripción) — `normalize.ts` ya extrae campos reales, no solo
  conteos.
- ❌ **BIESS eliminado** — no corresponde a ningún dato real de Novadata
  (confirmado por el usuario).
- ⚠️ Correcciones importantes encontradas en el camino: **vehículos SÍ
  se consulta directo por cédula** (`pn_vehiculos/general/{cedula}`, no
  por placa); **`pn_supa` es pensión alimenticia** (child support), no
  tránsito vehicular — se movió de Vehículos a Función Judicial;
  **`pn_retails`** trae datos financieros (mora/deuda), se movió de
  Trabajo a Bancos.

### Pivote de diseño: scoring por LLM, no por fórmula

La primera versión de este scaffold calculaba el score con un motor de
reglas numérico determinístico. Se cambió a pedido explícito: hay
demasiada señal cualitativa (tipo de demanda, severidad de una mora,
patrón de estabilidad laboral) para reducir a pesos fijos — un LLM que
pondera muchos puntos y da un resultado aproximado se ajusta mejor al
objetivo.

Con una excepción: **2-3 verificaciones se mantienen determinísticas
("controles de bloqueo"), fuera del criterio del LLM** — persona
fallecida y coincidencia en listas de sanciones/PEP/lista negra. Son
hechos binarios objetivos, no juicios de riesgo, así que no tiene
sentido dejarlos a una estimación aproximada. Si se activa un control
de bloqueo, el score se fuerza a 1 sin importar lo que diga el LLM. Todo lo demás
(laboral, judicial, financiero, patrimonio) queda enteramente a
criterio del LLM, guiado por el marco interpretativo.

Antes de usarlo en producción real hace falta:

1. **Validar el marco interpretativo** (`supabase/functions/_shared/marco-interpretativo.ts`)
   con el negocio — hoy es un `framework-v0` razonable pero ilustrativo,
   no la política real de riesgo de la empresa. Es texto plano, no
   requiere tocar código para ajustarlo.
2. **Confirmar la forma interna de los recursos que aún no se vieron
   poblados** en ningún caso de prueba (algunos siguen con campos
   parcialmente inferidos) → ajustar `normalize.ts`.
3. **Un proyecto Supabase nuevo** (dashboard de Supabase) → correr
   `supabase/schema.sql` en el editor SQL, y llenar `.env` /
   `.env.functions` con las credenciales.
4. **Una API key de Anthropic** para el scoring (`ANTHROPIC_API_KEY` en
   `.env.functions`).

## Arquitectura

```
Frontend (Vite/React, estático)
   |  supabase.functions.invoke("analyze-client")
   v
Edge Function analyze-client (Deno, en Supabase)
   |
   |-- 1. fetchAllBlocks()     -> novadata-client.ts         (9 bloques, ~40 recursos reales, en paralelo)
   |-- 2. buildClientContext() -> normalize.ts                (raw Novadata -> contexto curado por eje)
   |-- 3. evaluarControlesBloqueo() -> controles-bloqueo.ts    (DETERMINÍSTICO: fallecido, listas de control/PEP)
   |-- 4. scoreWithLlm()       -> llm-scoring.ts + marco-interpretativo.ts  (score APROXIMADO 1-999 + pros/contras)
   v
Supabase Postgres: clients, ingestion_runs, analysis_results,
                    scoring_rules_versions, audit_log
```

Las credenciales de Novadata y la `service_role key` de Supabase viven
**solo** en las secrets de la Edge Function — nunca se exponen al
navegador. El frontend solo tiene la `anon key` (de lectura, limitada
por RLS).

## Desarrollo local

```bash
npm install
cp .env.example .env         # llenar con las credenciales del proyecto Supabase
npm run dev
```

Sin `.env` configurado, el frontend arranca igual y muestra un aviso de
"Supabase no configurado" en vez de fallar.

### Edge Functions (requiere Supabase CLI)

```bash
supabase login
supabase link --project-ref <tu-project-ref>
cp .env.functions.example .env.functions   # llenar credenciales
supabase secrets set --env-file .env.functions
supabase functions deploy analyze-client
```

Para probar localmente antes de desplegar:

```bash
supabase functions serve analyze-client --env-file .env.functions
```

Sin `NOVADATA_USERNAME`/`NOVADATA_PASSWORD` configurados, cada bloque
devuelve `status: "error"` (no rompe el pipeline) — útil para probar el
flujo completo (buildClientContext -> controles-bloqueo -> llm-scoring ->
persistencia) antes de tener acceso real a Novadata.

### Explorador de Novadata (sin proyecto Supabase todavía)

`src/pages/NovadataExplorer.jsx` (ruta `/explorar`, sin login) deja
ingresar usuario/contraseña de Novadata y una cédula, y muestra el
resumen curado + los datos raw de los 9 ejes — sin persistir nada. Sirve
para inspeccionar la ingesta antes de tener el proyecto Supabase real.
Requiere **Docker corriendo** (lo usa `supabase functions serve` para el
runtime de Edge Functions):

```bash
supabase functions serve explore-novadata --no-verify-jwt
npm run dev
```

Y abrir `http://localhost:5173/explorar` (el frontend ya apunta por
defecto a `http://localhost:54321/functions/v1`; para cambiarlo, fijar
`VITE_FUNCTIONS_URL` en `.env`). La contraseña que se ingresa ahí nunca
se guarda — viaja en el body del POST, se usa una vez para pedir el
token de Novadata y se descarta.

**Nota de seguridad:** la contraseña de Novadata es una credencial de
Active Directory — si en algún momento se escribió o pegó en un chat,
una terminal compartida, o cualquier lugar fuera de las secrets de la
Edge Function, rotarla. Nunca debe quedar en el código ni en `.env`
versionado (`.gitignore` ya excluye `.env` y `.env.functions`).

## Base de datos

`supabase/schema.sql` — pegar directo en el editor SQL de Supabase (no
usa el sistema de migraciones del CLI, igual que el proyecto
`raton-perez`). Guarda **solo los resultados del análisis**, nunca los
datos crudos de Novadata (esos se consultan en vivo y se descartan tras
normalizarse).

Dado que los bloques incluyen Fiscalía, Función Judicial y Bancos
(información muy sensible), toda escritura queda auditada en
`audit_log` y solo la Edge Function (con `service_role key`) puede
escribir resultados — el cliente nunca escribe directo. Revisar
cumplimiento con la LOPDP (Ecuador) antes de manejar datos reales de
clientes: consentimiento, retención, y quién puede consultar qué.

## Próximos pasos sugeridos

- Validar/iterar el marco interpretativo (`marco-interpretativo.ts`)
  con el negocio — es el artefacto más importante a afinar ahora que la
  ingesta está cableada.
- Confirmar campos internos pendientes en `normalize.ts` con más casos
  de prueba reales.
- Definir roles de acceso (analista vs. admin) si se necesita más
  granularidad que "cualquier autenticado puede leer todo".
- Considerar registrar el `reasoning` completo del LLM junto con la
  versión exacta del prompt usado (ya se guarda `rules_version` =
  `framework-v0`) para poder auditar por qué un cliente obtuvo tal score
  incluso siendo un resultado aproximado.
