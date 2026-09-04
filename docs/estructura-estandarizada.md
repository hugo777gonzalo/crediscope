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
