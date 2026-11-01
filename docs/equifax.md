# Equifax: cómo está construido y lo que se aprendió

Lo abierto está en `docs/pendientes.md`; el diseño y lo medido, en
`docs/propuesta-estructura-equifax.md`; lo que hay que pedirle a Equifax, en
`docs/equifax-pedido-de-diccionario.md`; y cómo entra al modelo, en
`docs/propuesta-marco-equifax.md`. Este texto vivía en CLAUDE.md hasta el
2026-10-20 y pasó acá para no cargarlo en cada sesión.

## Dónde está cada cosa

- **Equifax** (buró; en producción desde el 2026-10-12; credenciales y
  datos de la cuenta en `.env.functions`, claves `EQUIFAX_*`). **Empezar por
  `docs/pendientes.md`**; el diseño y lo medido, en
  `docs/propuesta-estructura-equifax.md`; lo que hay que pedirle a Equifax, en
  `docs/equifax-pedido-de-diccionario.md`; y cómo entraría al modelo, en
  `docs/propuesta-marco-equifax.md` (propuesta: no cambia nada de lo que lee el
  modelo):
  - **Un solo buró por IFI** (negocio, 2026-10-13: Equifax o Aval, no los dos
    ni en orden). Cuando la persona lo tiene, reemplaza a la deuda de bancos y
    cooperativas de Proveedor_Info_1: «un tema, una fuente», propuesto en
    `docs/propuesta-buro-de-la-institucion.md` (sin construir). Medido con
    `scripts/medir-solapamiento-equifax.mjs`: **el comercial de Equifax y las
    casas comerciales de Proveedor_Info_1 son otras empresas** (no se apagan) y **Equifax
    no trae la calificación A1 a E** (se lee en días de mora). **Proveedor_Info_1 se
    sigue consultando entera** (negocio, 2026-10-16): lo repetido sólo deja de
    ir al modelo.
  - **El buró de la base** es `proveedores.es_buro` (129, a lo sumo uno): lo
    elige el selector «Buró» de Configuración y decide la pestaña de cada
    persona; el menú dice «Buró» y `/buro/:cedula` lleva a la que corresponde.
    `activo` sigue diciendo sólo si se puede consultar.
  - **El buró en lo que lee el modelo es `marco-v33`, APAGADO**
    (`CONFIG_LLM.buroDeLaInstitucion`): `_shared/buro-de-la-institucion.ts` busca
    la consulta vigente y `armarPerfilDelModelo(perfil, campos, buro)` pone
    `buroEquifax` en lugar de bancos y cooperativas de Proveedor_Info_1;
    `marcoConElBuro()` arma el texto con buró sobre el de v32. Sin buró, el perfil
    es el de v32 byte a byte (`perfil-del-modelo-sin-buro.esperado.json`).
    Cómo encenderlo: `docs/propuesta-marco-equifax.md`, sección 8.
  - **Los tokens de un JSON se miden, no se estiman** (2026-10-16): con 3,2
    caracteres por token el bloque del buró salía en 1.050 y pesa 2.000 (1,63:
    casi todo números y nombres largos). El contador de tokens de la API no cobra
    ni corre el modelo; se le manda sólo el marco o datos inventados.
  - **La pestaña Equifax** (`PerfilEquifax.jsx`, `components/equifax/`) lee la
    estructura y las tablas, nunca el crudo; la franja de 24 meses y la deuda
    por sistema salen de `src/lib/equifaxPantalla.js`, que se prueba con
    `scripts/probar-formatos.mjs`. El PDF es la pantalla impresa
    (`@media print`) y queda en la auditoría (`exportacion.reporte_equifax`).
  - **El botón para consultar** (`ConsultarEquifax.jsx`, 2026-10-17) es sólo
    para administración (diseño aprobado el 16/10; la función `consultar-equifax`
    exige admin también desde ese día) y la llama sólo cuando la persona no tiene
    una consulta vigente, nunca de un clic: primero dice que se cobra y pide
    confirmar. Lo gastado se ve en Costos › Equifax (`costoEquifax.js`, USD 0,40
    por consulta, tarifa del negocio del 17/10). El
    tope, la base legal (`BASE_LEGAL_EQUIFAX` en `api.js`) y la auditoría los
    pone la función. No ofrece `forzar`. **Para probarlo sin pagar**: una cédula
    con el dígito verificador mal (la función la rechaza antes de llamar a
    Equifax) o una persona con consulta vigente (la función devuelve la guardada
    sin escribir nada). **No adelantar el reloj de la página para ver una
    consulta vencida**: la sesión supera las 12 horas y se cierra en todos los
    dispositivos (pasó el 2026-10-17).
  - `_shared/equifax-client.ts`: el token (en memoria, nunca guardado) y
    la consulta, que se cobra.
  - `_shared/equifax-persistencia.ts`: el recorrido completo (proveedor,
    reutilizar, tope diario, consultar, guardar, auditar). Lo usan la
    función `consultar-equifax` y `scripts/consultar-equifax-local.mjs`:
    una sola implementación.
  - `_shared/vigencia-mensual.ts`: una consulta vale hasta el 17 de cada
    mes; la comparte Aval (`aval-vigencia.ts`).
  - Tabla `consultas_equifax` (122): `respuesta_cruda` entera e inmutable.
    El proveedor `equifax` nace apagado en `proveedores`.
  - **Del crudo a las tablas y a la estructura** (126, 2026-10-13; el
    diseño y lo medido, en `docs/propuesta-estructura-equifax.md`):
    - `_shared/equifax-tablas.ts` → `derivarTablas()`: el crudo en 12 tablas
      `equifax_*` (operaciones, historia mensual, deuda por sistema y mes,
      vencimientos, tarjetas, créditos, consultas recibidas, scores,
      indicadores por período, `equifax_codeudor_garante`, `equifax_resumen` y,
      desde la v2 (138), `equifax_analisis_credito`: las diez variables de crédito
      del predictor de ingresos, que son una señal y NO un saldo).
      Pura, determinista y versionada (`EQUIFAX_TABLAS_VERSION`). Sin datos
      personales: se quedan sólo en el crudo.
    - `_shared/equifax-estructura.ts` → `calcularEstructura()`: la estructura
      estandarizada, calculada DESDE las tablas y guardada en
      `consultas_equifax.estructura` (`EQUIFAX_ESTRUCTURA_VERSION`).
    - `equifax_reemplazar_tablas()` (base): rehace las dos cosas de una
      consulta de una vez, atómica; sólo la clave de servicio.
      `guardarTablasDeLaConsulta()` la llama, y es la misma para una consulta
      recién pagada y para rehacer una guardada.
    - **Cambió una regla de `equifax-tablas.ts` o de `equifax-estructura.ts`:
      se sube su versión y se corre `node scripts/cargar-tablas-equifax.mjs`
      (`--seco` primero)**: rehace desde el crudo las consultas que quedaron
      con la versión anterior, sin volver a pagar.
    - `scripts/exportar-equifax-tablas.mjs`: un Excel con las 11 tablas de todas
      las personas consultadas (una hoja por tabla, la persona por su código), más
      «Consultas» y «Estructura». Sólo lee; va a `research/equifax/excel/`.
    - `scripts/medir-bloque-equifax.mjs`: cuánto pesaría el bloque de Equifax del
      perfil del modelo (`docs/propuesta-marco-equifax.md`), sin gasto.
    - `scripts/probar-equifax-tablas.mjs`: las mismas funciones contra las
      respuestas reales de `research/equifax/crudo/` (conciliación contra el
      resumen, titular + codeudor/garante, datos personales). Correrlo después de
      tocar cualquiera de los dos módulos. Las pruebas de Deno usan una
      respuesta inventada (`_shared/equifax-respuesta-de-prueba.ts`): el
      repositorio es público.
  - `scripts/exportar-equifax.mjs`: Excel con una hoja por cada tabla que
    trae la respuesta (`scripts/probar-hojas-de-json.mjs` lo prueba).
  - `scripts/inventariar-equifax.mjs` (campos, listas y datos personales de
    las respuestas guardadas) y `scripts/conciliar-equifax.mjs` (qué cifras
    cuadran entre sí): sólo leen `research/equifax/crudo/` y no vuelven a
    consultar.

## Lo que costó caro aprender

- **Cada consulta a Equifax se cobra y su proveedor no pone tope**
  (negocio, 2026-10-12). Por eso:
  - Lo que contestó se guarda entero y se reutiliza hasta el 17 de cada
    mes; `forzar` (volver a pagar) es sólo de admin.
  - El tope diario es nuestro: `EQUIFAX_TOPE_DIARIO` (30 por defecto). Si
    no se puede medir el consumo, no se consulta.
  - Un timeout **no se reintenta**: el pedido salió y pudo cobrarse. Sólo
    se repite lo que no llegó a procesarse (401 con token nuevo; 429, 502,
    503 y 504).
  - El guion local **simula por defecto**; para cobrar, `--ejecutar`. Más
    de 2 personas por corrida exige `--autorizo=<n>`. Sin responsable y
    sin base legal no corre.
  - No se envían datos del cónyuge (decisión del negocio): el pedido no
    tiene dónde ponerlos.
  - Una respuesta por **otra persona** no se guarda: se compara el
    documento que trae Equifax (`identificacion_consultada`) con el
    pedido (`documentoDeLaRespuesta()`). Se cobró, así que cuenta para el
    tope y queda en la auditoría sin el documento ajeno.
  - **La deuda sale de `reporteCrediticio`.** `interconnectResponse` trae la
    misma deuda en otra forma y **no cuadra** (bancos: coincide en 9 de 22
    personas; el «riesgo directo» de Equifax no coincide con ninguna suma).
    Nunca se suman dos bloques: es la «fila fantasma» de Aval otra vez.
    Evidencia: `scripts/conciliar-equifax.mjs`.
  - El rol viene como `TITULAR` y como `Titular`: se normaliza antes de
    separar al titular del codeudor o garante (15 de 22 personas tienen
    operaciones donde no son titulares).
  - **Un guion que imprime valores filtra por el contenido, no por el nombre
    del campo.** El inventario (`inventariar-equifax.mjs`) no lista números ni
    valores con 6 o más dígitos seguidos: el teléfono de la persona viene
    dentro de `sujeto_al_dia.institucion` y el filtro por nombre no lo veía.
  - El camino es JSON → tablas → estructura: la estructura se calcula desde
    las tablas, no desde el JSON (`docs/propuesta-estructura-equifax.md`).
  - **Lo medido al construir las tablas (2026-10-13), sobre las 22 respuestas:**
    - **El resumen por sistema, los impagos, las morosidades y la cuota
      estimada de Equifax cuentan también al codeudor y al garante.** La suma
      del detalle de todos los roles reproduce el resumen (bancos 22/22, y 62/62
      con el lote del 2026-10-16); la
      del titular solo, no. `conciliaConElResumen` compara todos los roles, y
      lo del titular sale de las operaciones.
    - **Los `CODEUDOR` de la lista de «garantías personales» de Equifax son la
      misma deuda que las operaciones de rol codeudor** (62/62): es una
      comprobación, nunca un sumando. **Los `GARANTE` no**: la lista y el detalle
      no coinciden en ninguna de las 6 personas con alguno (2026-10-17; pregunta
      en el pedido de diccionario, 3.8). Se compara por tipo, nunca la lista
      entera. **«Garantía» en Ecuador es el colateral** (auto, casa, pagaré):
      lo de codeudor y garante no se llama así (tabla `equifax_codeudor_garante`).
    - **Una operación no se puede seguir de un mes al siguiente**: las listas no
      traen su número y ninguna combinación de campos la identifica (788 pares
      de filas de un mismo mes comparten institución y apertura; el cupo cambia
      entre meses en 191 grupos). Una «huella» inventada contaba como varias a
      una misma operación. La conducta de pago se cuenta **por mes**.
    - **Un nombre de Equifax puede prometer lo que el dato no cumple**:
      `score_min`/`score_max` son la banda de la persona (no el rango del
      score); `porcentaje_uso_tarjeta` es el saldo promedio de 6 meses sobre el
      cupo, no el de hoy, y pasa de 100. Se mide antes de nombrar, y lo dudoso
      va a `docs/equifax-pedido-de-diccionario.md`.
    - Los tramos de mora se reparten por **días de mora** (hasta 30, 60, 90, 180,
      270, 360, 720 y 1.080): reproducen los de Equifax en bancos (20/22).
    - **La primera fila de `entidades_consultados` es el encabezado** con los
      doce meses; NovaCredit (dos grafías) no cuenta como entidad que evalúa a
      la persona. `protestos` viene siempre vacío: `null` (no medido), no cero.
    - `probar_conexion` desde las Edge Functions contesta ok (2026-10-13): el
      token se pide bien desde Supabase. Desde la pantalla (2026-10-17) la
      función rechaza una cédula inválida y reutiliza una vigente; una consulta
      PAGA desde las funciones todavía no se hizo (la primera, con una persona
      que autorice el negocio).
  - **La ventana de 24 meses sale del corte del reporte, no de la última fila** (2026-10-31):
    el detalle histórico sólo trae los meses con operaciones, así que quien ya no debe tenía la
    ventana corrida hacia atrás (con meses «sin deuda» que Equifax nunca cubrió) y sin los meses
    reales hasta hoy. El corte es el último mes de `evolucion_deuda_sb_seps_sicom` (24 meses
    contiguos en las 2.130 consultas que la traen) y de `deuda_historica`; esas listas sólo fijan
    el corte y **no se suman a la deuda**. Una sola regla (`_shared/equifax-ventana.ts`) para
    `conductaDePago` y `franjaDePagos`; los meses sin operaciones son «Sin deuda como titular»,
    y `mesesObservados` cuenta los meses de la ventana que el reporte cubrió. Sin evolución no hay
    corte que inferir (el de la consulta cae 1 o 2 meses atrás): la ventana termina en la última fila.
  - **En el detalle ACTUAL del sector comercial, `saldo_deuda` es lo por vencer y `total_vencer`
    no se lee** (2026-10-31): el total es por vencer + vencido + no devenga intereses. Sobre todas
    las consultas guardadas, esa suma reproduce el total del resumen en todas, y leer `saldo_deuda`
    como total sólo cuadraba en el 87%. `total_vencer` unas veces trae el total, otras sólo el
    vencido y otras el monto de demanda judicial o cartera castigada. **La historia mensual del
    comercial no cambia de significado** (ahí `saldo_deuda` es el total, como en bancos) y queda sin
    conciliar: pregunta en el pedido de diccionario. Una lectura de una lista de Equifax se mide
    contra el resumen con todas las consultas guardadas antes de darla por buena, no con unas pocas.
  - Los parámetros de la decisión (producto 1, monto, plazo) son de
    relleno: sólo interesa lo que el buró trae de la persona.
  - La clave y el token no salen en ningún mensaje (`sanitizar()`); el
    token vive en memoria. Las credenciales que se pegaron en un chat se
    rotan al terminar el desarrollo.
