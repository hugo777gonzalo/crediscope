# Propuesta de estructura estandarizada (capa de "procesamiento")

> **v2 (implementada, en validación)** — v1 agregó los 27 campos nuevos
> de `Cambios Reagrupacion - Estructura_Estandarizada v1.xlsx` (hoja
> `Nuevos_Campos`) más el grupo `comportamientoInterno`, y corrigió el
> bug de `tiposDemandasComoDemandado` (leía `tipoDemanda.descripcion` —
> el ROL, constante — en vez de `demanda.delito` — el tipo de caso
> real). v2 corrige 5 campos más señalados por el usuario tras revisar
> el Excel de validación:
> - `laboral.tieneEstablecimientoActivo` (y por lo tanto `esIndependiente`):
>   la fuente correcta es `contribuyente` (RUC: fecha_cancelacion /
>   fecha_suspension_definitiva / fecha_reinicio_actividades), no
>   `establecimientoActEconomica`.
> - `tributario.esAfiliadoUnipersonal`: misma fuente (`contribuyente`);
>   un registro "cascarón" con `estado.codigo=OK` pero todos los campos
>   `null` (Novadata lo hace cuando la persona nunca tuvo RUC — ver
>   cédula 1759544552) ahora da `false`, no `null`.
> - `laboral.empleoActual` (empleador/cargo/salarioAprox): la fuente
>   correcta es `trabajoHistoricosMecanizado` (trae `baseDate`
>   `"YYYY-MM"`, la fecha real de actualización mensual de IESS), no
>   `basesInternas.tiess` (que no tiene `baseDate`). Se descarta si el
>   registro más reciente tiene más de 3 meses (frecuencia máxima de
>   actualización).
> - `seguridadSocial.esPensionista`: hay que leer `.estado` (booleano
>   real) de cada registro de `pn_pensionista`, no solo si el recurso
>   trajo algún registro.
>
> **La interfaz de abajo quedó desactualizada por el volumen de
> cambios — la fuente de verdad ahora es `StandardClientProfile` en
> [supabase/functions/_shared/types.ts](../supabase/functions/_shared/types.ts),
> construida por [process.ts](../supabase/functions/_shared/process.ts)**
> (validada contra los 25 clientes reales — incluidos los casos
> específicos que reportó el usuario — ver
> `research/CrediScope_Estructura_Estandarizada_Validacion.xlsx`).
>
> **v3 — conectada a `analyze-client`/`llm-scoring` (`framework-v1`,
> ver [interpretive-framework.ts](../supabase/functions/_shared/interpretive-framework.ts)).**
> El LLM ahora recibe el `StandardClientProfile` en vez del
> `ClientContext` casi crudo — payload ~4-5x más chico, lo que resolvió
> cortes de respuesta a medias por `max_tokens` (`SyntaxError` al
> parsear el JSON de salida) en clientes con mucho historial judicial.
>
> **v4 — auditoría contra el SRI real (cédulas 0502937691 y
> 0502937675), corrigió `laboral.tieneRucActivo`:** leía `.obligado`
> ("obligado a llevar contabilidad" — casi siempre "NO" para personas
> naturales de régimen general, sin relación con el estado del RUC), lo
> que hacía que el campo diera `false` casi siempre sin importar el
> estado real. Ahora usa la misma fuente/lógica que
> `tieneEstablecimientoActivo` (`rucRegistroActivo()`). También se
> agregaron 3 campos de auditoría en `laboral`:
> `fechaInicioActividadesRuc`, `fechaCeseActividadesRuc`,
> `fechaReinicioActividadesRuc` (fechas crudas del registro RUC activo,
> o el primero disponible) — para poder validar estos booleanos contra
> el SRI sin ir a la data cruda de Novadata cada vez. Nota: el SRI
> también muestra una "fecha de actualización" que **Novadata no
> provee** en este recurso — no se puede exponer.
>
> El usuario señaló que el estado del RUC (a nivel de contribuyente) es
> DISTINTO del estado de cada establecimiento — una persona puede tener
> el RUC activo con un establecimiento abierto y otro cerrado.
> Confirmado con datos reales: la cédula 0502937675 tiene 2
> establecimientos (el SRI solo mostraba la matriz). El recurso
> `establecimientoActEconomica` (dejado de usar para
> `tieneEstablecimientoActivo` en v2 por ser la fuente equivocada para
> ESE campo) sí trae `estado_establecimiento` por establecimiento — se
> agregaron 3 campos nuevos en `laboral`: `numeroEstablecimientosActivos`,
> `numeroEstablecimientosInactivos`, `tieneEstablecimientosRegistrados`.
> No reemplazan a `tieneEstablecimientoActivo` (que sigue siendo a nivel
> de RUC, per spec original del usuario). Ojo: las fechas de este
> recurso vienen en formato DD/MM/YYYY, no se usaron para evitar el
> parseo ambiguo de `Date`.
>
> **v5 — auditoría de `transitoVehicular`, reportada por el usuario:
> "todos los clientes tienen una multa".** Confirmado como bug, no
> coincidencia: `deudasEmov` trae 1 registro RESUMEN por persona
> (`infraccion: []` en el 100% de la muestra de 25) — se estaba
> contando ese resumen como 1 multa real, sin importar si la persona
> tenía o no infracciones. Además `deudasAnt` (única fuente con datos
> reales confirmados, 4/25) usa el campo `.total`, no `.valorAdeudado`
> (que no existe en esos registros) — el monto se estaba perdiendo para
> esos clientes. `numeroMultas`/`valorAdeudadoTransito` ahora detectan
> automáticamente si un registro es "resumen con `.infraccion[]`
> anidado" (EMOV, y por prudencia AMT — nunca se ha visto poblado en la
> muestra) vs "registro plano" (ANT). Tras el fix: 21/25 clientes pasan
> de `numeroMultas=1` a `numeroMultas=0`; los 4 con datos reales de ANT
> quedan con el monto correcto (validado a mano contra la suma de
> `.total`).
>
> **v6 — auditoría de `compliance.impedimentoCargosPublicos`, bug más
> grave encontrado en esta ronda.** `impedimentoCargosPublicos.data` es
> un ARRAY (no un objeto como el resto de recursos "singleton" de
> fiscalía/judicial) — el helper `obj()` rechaza arrays por tipo y
> devolvía `null` siempre, así que este campo daba `false`/`null` **para
> absolutamente todos los clientes, sin importar la realidad**.
> Encontrado auditando cédula 0502937691 (la misma del caso RUC): SÍ
> tiene `registraImpedimento: true` real, con causal "DEUDORES A
> ENTIDADES DEL SECTOR PUBLICO" — se estaba mostrando como "sin
> impedimento" (clasificado "positivo") cuando en realidad tiene un
> impedimento legal vigente para contratar con el Estado. En la muestra
> de 25 solo 1 caso tiene esta condición (es infrecuente, la mayoría de
> consultas a este recurso vienen "faltante"), pero para ESE caso el
> dato mostrado era exactamente el opuesto de la realidad. De paso se
> corrigió el texto del marco interpretativo (`framework-v4`): decía que
> este campo ya era un guardrail resuelto aparte — nunca lo fue (no
> existe en `guardrails.ts`) — ahora es explícito que el LLM debe
> juzgarlo y penalizar fuerte.
>
> **v7 — `riesgoPenal.numeroDenunciasFiscalia` no distinguía el rol del
> cliente en la denuncia** (denunciante/víctima/perjudicado vs
> sospechoso), mismo criterio ya aplicado a
> `numeroDemandasComoDemandado`/`ComoOfendido` en `riesgoJudicialCivil`
> pero que no se había extendido a fiscalía. `denuncias[].detalleDenuncia[]`
> trae el rol de cada parte por cédula — se reemplaza por
> `numeroDenunciasComoSospechoso` (penaliza) y
> `numeroDenunciasComoVictima` (solo contexto). Confirmado con datos
> reales: cédula 0961413416 aparece como SOSPECHOSO en una denuncia por
> ABUSO DE CONFIANZA — antes se contaba igual que las denuncias donde
> otros clientes son solo denunciantes/víctimas. `framework-v5`.
>
> **v8 — auditoría de valuación de vehículos, pedida por el usuario
> ("para el tema de colaterales, es importante llegar al valor más
> aproximado").** Novadata trae hasta 8 campos de precio distintos por
> vehículo que NO coinciden entre sí: `valorAvaluo` (avalúo fiscal SRI,
> depreciación lineal — castiga fuerte vehículos viejos, ej. $82 en una
> moto 2016 o $1,200 en un camión 1984), `precioPromedio`/
> `precioComercial`/`precioVentaPublico` (casi siempre idénticos entre
> sí, precio de mercado actual), `precioMinimo`/`precioMaximo` (rango
> de mercado), `precioVentaPromedio` (promedio de comercial y promedio
> cuando difieren, confirmado con 2 casos reales) y `precioVenta`
> (sospechosamente alto en vehículos viejos — ej. Nissan X-Trail 2010:
> `precioVenta=$29,990` vs `precioMaximo=$20,500` de mercado actual —
> parece ser precio de lista cuando el vehículo era nuevo, se le
> consultó al usuario y confirmó excluirlo). Nuevo campo
> `patrimonio.valorColateralVehiculos`: suma, por vehículo, el MÁXIMO
> entre `valorAvaluo`/`precioPromedio`/`precioMinimo`/`precioMaximo`/
> `precioComercial`/`precioVentaPublico`/`precioVentaPromedio` (sin
> `precioVenta`) — `valorAvaluo` sirve de piso para vehículos donde los
> campos de mercado vienen todos en 0 (confirmado con un caso real,
> Suzuki Grand Vitara con `precioPromedio=0` pero `precioComercial`
> poblado). `framework-v6`.
>
> **v9 — separación de "Función Judicial" en 2 grupos, pedida por el
> usuario.** `riesgoJudicialCivil` mezclaba demandas de cobro/pagarés/
> ejecuciones (señal fuerte de comportamiento de pago) con demandas
> civiles genéricas (laboral, familia, tránsito, propiedad — contexto).
> Nuevo grupo `riesgoJudicialCrediticio` (`numeroDemandasComoDemandado`,
> `tiposDemandasComoDemandado`, filtradas con `KEYWORDS_PROBLEMA_CREDITICIO`)
> reemplaza al booleano `demandaProblemaCrediticio` que vivía dentro de
> `riesgoJudicialCivil`. Posición en el orden de prioridad: justo
> después de `comportamientoCooperativas`, antes de `riesgoJudicialCivil`.
>
> De paso, a pedido del usuario ("temas de seguridad que hoy son los
> principales problemas del Ecuador"), se agregó
> `compliance.tieneDelitoGraveSeguridad`/`categoriasDelitoGraveSeguridad`
> — guardrail duro nuevo (fuerza el score a 1, mismo trato que listas de
> sanciones) para lavado de activos, narcotráfico/tráfico de sustancias,
> trata de personas, tenencia/porte de armas y extorsión. Se revisan
> demandas, denuncias y descripción de antecedentes penales. **Ojo:**
> de estas categorías, solo lavado de activos tiene un caso real
> confirmado en la muestra (cédula 0704385103, demanda "317 LAVADO DE
> ACTIVOS...") — el resto de palabras clave son terminología del COIP
> por conocimiento general, sin validar contra casos reales; ajustar si
> aparece un caso real que no se detecta. `framework-v7`.
>
> **v10 — ajuste de terminología en todo el proyecto, a pedido del
> usuario** (usar español ecuatoriano estándar de la industria
> financiera/legal, salvo que no exista término en español):
> - `compliance` → **`cumplimiento`** (grupo del StandardClientProfile
>   y todo lo derivado: clasificación, prompt del LLM, frontend).
> - "guardrail" → **"control de bloqueo"** (`guardrails.ts` →
>   `controles-bloqueo.ts`; `GuardrailResult`/`GuardrailFinding`/`GuardrailCode`
>   → `ResultadoControlBloqueo`/`HallazgoControlBloqueo`/`CodigoControlBloqueo`;
>   campo `blocking` → `bloqueante`; la clave `guardrailHallazgos` que
>   recibe el LLM → `hallazgosControlBloqueo`).
> - "AML" → **"PLA/FT"** (Prevención de Lavado de Activos y
>   Financiamiento del Terrorismo — sigla oficial ecuatoriana).
> - "central de riesgos" → **"buró de crédito"**
>   (`numeroOperacionesCentralRiesgo` → `numeroOperacionesBuroCredito`;
>   recursos de ingesta `centralRiesgoSuper`/`Diners`/`Coop` →
>   `buroCreditoSuper`/`Diners`/`Coop`).
> - `tieneOperacionJudicializada` → **`tieneOperacionConDemanda`**
>   ("demanda" es más común que "judicializada").
> - `peorCalificacionRiesgo` ahora tiene su contraparte
>   **`mejorCalificacionRiesgo`** — un cliente con 2+ operaciones de
>   crédito puede tener calificaciones distintas; antes solo se exponía
>   la peor (la señal de riesgo más relevante, sigue pesando más), ahora
>   se ve también la mejor como contexto.
> - "`interpretive-framework.ts`" → **"`marco-interpretativo.ts`"**
>   (`FRAMEWORK_VERSION`/`INTERPRETIVE_FRAMEWORK` →
>   `MARCO_VERSION`/`MARCO_INTERPRETATIVO`).
> - Se mantienen sin cambio: "castigada" (cartera castigada — término
>   oficial de la Superintendencia de Bancos del Ecuador), OFAC/CONSEP/COIP
>   (nombres propios), PEP (ya es sigla en español), "score" y
>   "colateral" (confirmado con el usuario — de uso estándar en la
>   industria crediticia ecuatoriana).
> `marco-v8`.
>
> **v11 — auditoría sobre 10 clientes nuevos** (con datos que los 25
> iniciales no tenían: buró de crédito rico, IESS rico, listas negras,
> homónimos), a pedido del usuario. Encontró 1 bug de bloqueo duro y 3
> huecos de datos:
> - **BUG**: `homonimosOpr`/`tconsephomonimos` se trataban igual que
>   OFAC/providencias (bloqueante, fuerza score a 1) — pero sus
>   registros NUNCA traen la cédula del cliente consultado, son OTRA
>   persona con el mismo nombre. Confirmado con 4 casos reales
>   (identificación del "homónimo" nunca coincide con la del cliente:
>   cédulas 1713210456, 1714000419, y 2 casos en 0912771995). Ahora es
>   informativo, no bloqueante —
>   `cumplimiento.tieneHomonimoEnListaControl`, hallazgo
>   `homonimo_en_lista_control` con `bloqueante: false`.
> - `cumplimiento.detallePep` (nuevo) — antes PEP se colapsaba a un
>   booleano; ahora expone `cargo`/`empresa`/`sueldo`/`fecha` del
>   registro PEP más reciente (confirmado poblado en 5/35 clientes
>   reales, ej. cédula 0916036452: "Director Administrativo, GAD
>   Samborondón, $2,368, 2024-11-25").
> - `comportamientoBancario.saldoEnMoraBuroCredito` /
>   `comportamientoCooperativas.saldoEnMora` (nuevos) — `saldoVigente`/
>   `saldoTotal` NO incluyen lo que está en mora (campos separados en
>   Novadata). Caso real (cédula 0401592829): 4 operaciones bancarias
>   calificación E, `saldoVigente = 0` en las 4, pero **$11,812.67**
>   reales en mora (`saldomora`) — `saldoTotalVigente` solo hubiera
>   mostrado $0, ocultando un default severo.
> - `laboral.numeroEmpleadoresUltimos24Meses` (redefinido) — antes
>   contaba empleadores por fecha de INGRESO en los últimos 24 meses: un
>   empleo estable de años daba 0, igual que un cliente sin empleo hace
>   2 años (mismo valor, casos opuestos — bug de semántica, no de
>   cálculo). Ahora cuenta empleadores ACTIVOS en algún momento de los
>   últimos 24 meses, usando `fecSal` (fecha de salida, vacía si el
>   empleo sigue activo hoy) — caso real cédula 1717947368 (empleo
>   estable desde 2018): pasó de 0 a 1.
> - Se refrescó la caché local de los 25 clientes originales
>   (`research/novadata-raw/`, gitignored) con `--force`, porque
>   guardaban datos de buró de crédito con las claves de recurso viejas
>   (`centralRiesgo*`, previas al rename a `buroCredito*` de `marco-v8`)
>   — el refresco reveló el caso real de mora de arriba, que antes
>   quedaba oculto en la muestra local (no afectaba producción, que
>   siempre consulta Novadata en vivo).
> `marco-v9`.
>
> **v12 — nuevo grupo `riesgoSeguridadCiudadana`**, mismo nivel que
> Riesgo Judicial Crediticio/Civil (justo después de `cumplimiento`), a
> pedido del usuario. Antes vivía como 2 campos sueltos dentro de
> `cumplimiento` (`tieneDelitoGraveSeguridad`/`categoriasDelitoGraveSeguridad`,
> ahora `tieneDelitoSeguridadCiudadana`/`categoriasDelitoSeguridadCiudadana`).
> Validado con 4 cédulas reales aportadas específicamente para esto
> (0910521939, 1309022935, 1204212029, 0927016063):
> - Confirmó funcionando **extorsión**, **tenencia de armas** y **lavado
>   de activos** (2 casos reales más, sumados al original).
> - Encontró un hueco real: **"DELINCUENCIA ORGANIZADA"** (COIP Art.
>   369) aparecía 4 veces en 2 de los 4 clientes y no estaba en ninguna
>   palabra clave — se agrega como categoría nueva.
> - Se agregan también **"Asociación ilícita"** (COIP Art. 370,
>   preparatorio/relacionado, 2 casos reales) y **"Asesinato/homicidio
>   intencional"** (aparecido real y reiterado en 1 cliente) — esta
>   última excluye explícitamente "homicidio culposo"/"preterintencional"
>   (ej. muerte por accidente de tránsito), perfil de riesgo muy
>   distinto a un homicidio intencional.
> - Narcotráfico/tráfico de sustancias y trata de personas siguen sin
>   caso real que las confirme.
> - Código de hallazgo renombrado: `delito_grave_seguridad` ->
>   `delito_seguridad_ciudadana`.
> - De paso se corrigió una inconsistencia real en
>   `marco-interpretativo.ts`: la lista de "controles ya resueltos"
>   seguía mencionando homónimos como bloqueante de sanciones
>   (contradecía la nota de homónimos de `marco-v9`, que es
>   informativa).
> `marco-v10`.

Este es el objetivo del paso **3 (Creación de una estructura de información más estándar)** del flujo:

```
1. Ingesta Novadata → 2. Procesamiento → 3. Estructura estándar → 4. Scoring LLM → 5. Persistencia → 6. Web pública
```

## Principio de diseño

Hoy el LLM recibe el `ClientContext` casi crudo (~11-15K tokens de entrada en los casos ricos, con arrays completos de demandas, historial laboral mes a mes, etc.). Eso ya causó un bug real (la respuesta se cortaba por `max_tokens`) y es más caro/lento de lo necesario.

La estructura de abajo reemplaza eso por campos **ya calculados**: números, booleanos, y strings cortos en vez de arrays completos de objetos anidados. La regla que apliqué para decidir qué se calcula vs. qué se deja como texto:

- **Se calcula** (número/booleano) todo lo que es agregable sin perder matiz: conteos, máximos, sumas, "¿existe X?".
- **Se deja como texto corto** (lista de strings, no de objetos) lo que el LLM necesita para su juicio *cualitativo* — ej. el tipo de demanda o la descripción de un antecedente penal — porque ahí SÍ hace falta el matiz que un número no captura. Pero se recorta a lo esencial (no se manda `judicatura`, `numeroProceso`, `juez` — eso es ruido para el score, útil solo para auditoría, y ya vive en el `raw` guardado aparte si hace falta consultarlo).
- **Se corrige** antes de llegar al LLM: valores numéricos que Novadata entrega como string (`"360.00"` → `360`), certificados negativos que Novadata redacta como oración (`"No tiene afiliaciones registradas"` → `false`), y duplicados entre fuentes que dicen lo mismo (ej. `pensionAlimenticia` y `pensionAlimenticiaNovadata` se combinan en un solo resultado).

## Estructura propuesta (`StandardClientProfile`)

```ts
interface StandardClientProfile {
  cedula: string;
  consultadoEn: string; // ISO timestamp

  identidad: {
    nombreCompleto: string;
    edad: number | null;
    genero: string | null;
    estadoCivil: string | null;
    nivelEducacion: string | null;
    profesiones: string[];
    fallecido: boolean;       // guardrail, pero se incluye igual para contexto del LLM
    tieneConyuge: boolean;
  };

  contacto: {
    numeroDirecciones: number;
    numeroTelefonos: number;
    numeroCorreos: number;
  };

  familia: {
    numeroHijos: number;
    tieneHijoMenorEdad: boolean;
    padresFallecidos: number; // 0-2
  };

  laboral: {
    empleoActual: { empleador: string; cargo: string; salarioAprox: number } | null;
    numeroEmpleadoresUltimos24Meses: number;
    ingresoPromedioUltimos6Meses: number | null;
    esEmpleadorOAdministrador: boolean;
    tieneRucActivo: boolean;
    tieneEstablecimientoActivo: boolean;
  };

  seguridadSocial: {
    afiliadoIessActivo: boolean;
    esPensionista: boolean;
    esJubilado: boolean;
  };

  patrimonio: {
    numeroVehiculos: number;
    valorAvaluoVehiculos: number;
    numeroInmuebles: number;
    numeroInversiones: number;
  };

  // La sección más importante para el score — ver hallazgo de
  // personasIncumplimientos en reagrupacion-propuesta.md
  comportamientoPagoFormal: {
    novadataResultadoHabitoPago: "Mal pagador" | "Buen pagador" | null; // veredicto propio de Novadata
    novadataPerfilInterno: "MALO" | "BUENO" | null;
    novadataDiasMoraMaxima: number | null;
    novadataDiasMoraVigente: number | null;
    novadataSaldoCapitalVigente: number | null;

    numeroOperacionesCentralRiesgo: number;
    peorCalificacionRiesgo: string | null; // ej. "A1".."E", la peor entre todas las operaciones
    tieneOperacionJudicializada: boolean;
    tieneOperacionCastigada: boolean;
    saldoTotalVigente: number;

    numeroCreditosFormales: number; // hipotecarios + quirografarios
    numeroDeudasRetail: number;
    diasMoraMaximaRetail: number;
    totalDeudaRetail: number;

    tieneCreditoIessBiess: boolean;
    diasMoraCreditoIessBiess: number;
  };

  comportamientoPagoCooperativas: {
    numeroOperaciones: number;
    diasMoraMaxima: number;
    saldoTotal: number;
    tieneOperacionJudicializada: boolean;
    tieneOperacionCastigada: boolean;
  };

  transitoVehicular: {
    tieneLicenciaVigente: boolean;
    puntosLicencia: number | null;
    numeroMultas: number; // ANT + AMT + EMOV combinadas
    valorAdeudadoTransito: number;
  };

  riesgoJudicialCivil: {
    numeroDemandasComoDemandado: number;
    tiposDemandasComoDemandado: string[]; // ej. ["Cobro de pagaré a la orden"] — texto corto, no el objeto completo
    numeroDemandasComoOfendido: number;   // informativo, NO penaliza (ser víctima no es riesgo de pago)
    pensionAlimenticiaEnMora: boolean;
    deudaPensionAlimenticia: number;
  };

  riesgoPenal: {
    tieneAntecedentesPenales: boolean;      // descripcion !== "NO"
    descripcionAntecedentes: string | null; // solo si tiene, texto tal cual
    numeroDenunciasFiscalia: number;
  };

  // Guardrails — YA resueltos de forma determinística (ver guardrails.ts),
  // se incluyen como contexto informativo, el LLM no debe recalcularlos
  compliance: {
    enListaControl: boolean;   // OFAC/homónimos/providencias/PEP
    enListaNegra: boolean;
    impedimentoCargosPublicos: boolean;
    causalImpedimento: string | null;
    registraSercopContraloria: boolean;
  };

  metaConsulta: {
    ejesOk: string[];
    ejesFaltantes: string[];
    ejesConError: string[];
  };
}
```

## De dónde sale cada cálculo (trazabilidad)

| Campo calculado | Fuente(s) Novadata | Cómo se calcula/corrige |
|---|---|---|
| `laboral.empleoActual` | `basesInternas.tiess` (prioridad) o `trabajoHistoricos` | El registro más reciente sin `fechaSalida`, o el de fecha más reciente si todos tienen salida |
| `laboral.ingresoPromedioUltimos6Meses` | `basesInternas.tiess` | Promedio de `salario` (parseado a número) de los últimos 6 registros mensuales |
| `comportamientoPagoFormal.novadata*` | `basesInternas.personasIncumplimientos` | Lectura directa (ya viene calculado por Novadata), solo se parsean strings numéricos a number |
| `peorCalificacionRiesgo` | `centralRiesgoSuper` + `centralRiesgoDiners` | La calificación de peor letra entre todas las operaciones de ambas fuentes |
| `tieneOperacionJudicializada/Castigada` | mismos + `personasIncumplimientos` | `true` si algún registro tiene `judicial`/`castigo` ≠ "0"/vacío |
| `numeroMultas` / `valorAdeudadoTransito` | `deudasAnt` + `deudasAmt` + `deudasEmov` | Suma de registros y de `valorAdeudado` de las 3 fuentes (recategorizadas a tránsito) |
| `tiposDemandasComoDemandado` | `demandas` | `[...new Set(demandas.map(d => d.tipoDemanda.descripcion))]` — únicos, sin el resto del objeto |
| `pensionAlimenticiaEnMora` / `deudaPensionAlimenticia` | `pensionAlimenticia` + `pensionAlimenticiaNovadata` (combinadas) | `true` si `totalDeuda > 0` en cualquiera de las 2 fuentes; deuda = la mayor de las 2 si se solapan |
| `tieneAntecedentesPenales` | `antecedentesPenales` | `descripcion !== "NO"` (corrección: Novadata certifica "NO" en vez de campo vacío) |
| `enListaControl` | `listasControl` (4 sub-arrays) + `basesInternas` (tpeps/tofac/tofac2/tconsepvinculados/tconsephomonimos/tprovidencias) | `true` si algún array tiene longitud > 0 |

## Impacto esperado en tamaño

Con una persona "rica" en datos (como la del ejemplo de mora/demandas que probamos), el `ClientContext` crudo actual pesa ~15.7K caracteres. Esta estructura, al ser casi toda escalares, debería quedar en **2-3K caracteres** para el mismo caso — una reducción de ~80% en lo que se le manda al LLM, sin perder las señales que importan para el score.

## Siguiente paso

Si apruebas esta estructura, implemento:
1. `supabase/functions/_shared/process.ts` — nueva capa que toma `RawNovadataResponse` y produce `StandardClientProfile` (reemplaza/extiende `normalize.ts`, que hoy hace un mapeo mucho más liviano).
2. Actualizar `llm-scoring.ts` para recibir `StandardClientProfile` en vez de `ClientContext`.
3. Actualizar `analyze-client/index.ts` para el nuevo orden: ingesta → procesamiento → estructura estándar → guardrails → (scoring LLM, sin probarlo todavía) → persistencia.
4. Mover `deudasAnt/Amt/Emov` a `vehiculos` en `novadata-client.ts` (la única recategorización de recursos que falta aplicar en código).

No voy a llamar al LLM para probar nada de esto hasta que me confirmes, como pediste.
