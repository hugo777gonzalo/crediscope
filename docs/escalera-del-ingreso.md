# Escalera de evidencia del ingreso: diseño

Tarea F3 de la reestructuración del núcleo (ola 2). Es un diseño: no cambia código de
producto. Parte de las decisiones del negocio del 2026-11-11 y 13, de lo medido en la ola 1
sobre los ingresos validados de la originación, y del código de hoy
(`fuentes-ingreso.ts`, `capacidad-de-pago.ts`, `estimacion-de-ingreso.ts`,
`base-imponible-desde-renta.ts`).

**Qué es medido y qué es propuesta.** «Medido» quiere decir medido el 2026-11-12 y 13 sobre
28.906 ingresos validados de una originación automotriz, o leído del código de hoy. **Esa
población son sólo aprobados y ya pasó un filtro de ingreso mínimo**: todo umbral que sale de
ahí es provisional hasta medirlo con solicitantes sin filtrar (sección 5, paso 3). Lo que dice
«propuesta sin medir» es una elección con su porqué, no un resultado.

Dos diseños hermanos de la ola 2 se usan y no se repiten: el **estándar de la institución**
(`docs/estandar-de-la-institucion.md`, PR 162: cuánto se acepta de cada peldaño, la carga
máxima, las celdas) y la **capa de hechos** (`docs/capa-de-hechos.md`, PR 163: cada dato con
su fuente, su fecha y su calidad; el contrato neutro del buró). La escalera dice **qué monto
sostiene cada peldaño, de dónde sale y con qué regla**; el estándar dice cuánto de ese monto
acepta la institución; la capacidad, con qué peldaño alcanza.

---

## 0. Resumen

- **El problema.** Hoy la capacidad mide con un solo ingreso: el sueldo reportado al IESS,
  el aporte propio o, si lo hay, el Ingreso declarado, que **reemplaza** al del IESS
  (`conIngresoDeclarado()`). No dice con qué evidencia alcanza ni qué haría falta para que
  alcance. De 322 «revisar» de la ola 1, 195 mencionan un ingreso «Por confirmar».
- **La escalera.** Seis peldaños, del más fuerte al más débil (negocio, 2026-11-13):
  1. **Verificado por un tercero**: sueldo reportado al IESS por un empleador, neto del aporte
     personal.
  2. **Verificado con documento**: lo que la persona de la institución valida en un documento.
  3. **Cota por crédito otorgado**: lo que la persona ya demostró pagando (cuotas al día;
     propuesta: también el impuesto a la renta y el aporte propio, decisión D2).
  4. **Mínimo certificado**: el mínimo del predictor de ingresos.
  5. **Declarado**: lo que la persona dice que recibe.
  6. **Referencia del tipo de persona**: contexto, nunca ingreso.
- **Los peldaños no se suman.** La capacidad se calcula con cada peldaño por separado, y la
  respuesta dice cuál la sostiene: el más fuerte con el que alcanza. Si ninguno alcanza, dice
  el ingreso necesario y qué evidencia lo cubriría.
- **Los datos de la institución no entran al ingreso.** Su historial con la persona es
  referencia cualitativa (negocio, 2026-11-11).
- **Primero sin buró.** Sin buró, el peldaño 3 se arma sólo con las cuotas de cooperativas
  (y, propuesta, la del BIESS calculada); el 4 es el nivel 1 del predictor, débil.
- **Orden de construcción.** Una función pura con los peldaños 1, 3 y 5; la capacidad por
  peldaño; una medición en seco contra la base; después la renta, el predictor, la referencia,
  el modelo y la API; el documento al final (sección 5).

---

## 1. Los peldaños

Cada peldaño tiene: la fuente exacta, la regla que da su monto, el parámetro propuesto, si
**crea espacio** para una cuota nueva (o sólo prueba) y qué existe hoy en código.

Dentro de un peldaño, dos montos del mismo tipo que son ingresos distintos se suman (dos
empleadores que reportan al IESS). **Entre peldaños nunca**: cada uno es otra lectura del
mismo ingreso total, no una parte.

### Peldaño 1. Verificado por un tercero

| | |
|---|---|
| **Fuente** | `basesInternas` de Proveedor_Info_1 (aportes al IESS del último corte): `fuentesIngreso.fuentes[]` con `evidencia = "reportada_por_tercero"` y `vigenteAlCorte = true` |
| **Regla** | Suma de los sueldos vigentes al corte, menos el aporte personal (9,45%, `PARAMETROS_CAPACIDAD.aportePersonalIess`) |
| **Parámetro** | Ninguno nuevo. El corte vale si `corteDesactualizado = false`; si no, el peldaño queda con su monto y un aviso |
| **Crea espacio** | Sí |
| **Hoy** | Existe: `datosDeCapacidad()` arma los sueldos con tipo `sueldo` e `ingresoVerificado()` (`estimacion-de-ingreso.ts`) calcula el neto |

- **No entra acá**: el aporte propio (lo elige la persona: va al peldaño 3, decisión D3), la
  afiliación voluntaria y el empleador que es un posible negocio familiar (el estándar lo
  excluye; la regla se arma en la capa de hechos, grupo 4).
- **Pensiones.** La fuente confirma la jubilación (IESS, ISSFAC, ISSPOL) pero **no expone el
  monto** (`fuentes-ingreso.ts`: «La fuente no expone el monto de la pensión»). El peldaño
  queda `sin_monto` con motivo `pension_sin_monto`, y el documento del peldaño 2 es el
  comprobante de pensión (decisión D7).
- **El IESS puede quedarse corto** (un empleador que reporta menos): el peldaño es un monto
  verificado, no el ingreso total. Si la cota del peldaño 3 lo supera, la respuesta lo dice
  como diferencia (sección 2).

### Peldaño 2. Verificado con documento

| | |
|---|---|
| **Fuente** | La persona de la institución: rol de pagos, declaración de IVA o de renta, comprobante de pensión, certificado de ingresos |
| **Regla** | El monto mensual que la persona de la institución anota y marca como validado, con el tipo de documento, su fecha y quién lo validó |
| **Parámetro** | Vigencia del documento: 90 días desde su fecha (**propuesta sin medir**, la misma ventana de una consulta reciente, `DIAS_DE_UNA_CONSULTA_RECIENTE`) |
| **Crea espacio** | Sí |
| **Hoy** | No existe. Hay `solicitudes.ingreso_declarado`, que es otra cosa (peldaño 5) |

- Los documentos del titular no son prioridad (negocio, 2026-11-13) y el lector de documentos
  quedó para después (2026-11-11): el peldaño se construye al final, como un dato que anota
  una persona (sección 5, paso 8). Mientras no exista, la escalera lo usa igual **como
  hipótesis**: «con un documento que pruebe lo declarado, alcanzaría hasta USD X» (sección 3).
- Un documento que la institución recibió de la persona no es «dato de la institución»: es
  evidencia del titular, validada por alguien con nombre.

### Peldaño 3. Cota por crédito otorgado

Es un **mínimo demostrado**: el ingreso es al menos esto. Nunca es el ingreso.

**3a. Cuotas pagadas al día** (lo que el negocio nombró).

| | |
|---|---|
| **Fuente sin buró** | `buroCreditoCoop` (`val_cuota_credito` y `num_dias_morosidad` de cada operación; hoy `comportamientoCooperativas.cuotaMensualTotal`). Préstamos del BIESS (`creditoQuirografario`, `creditoHipotecario`): la fuente no trae la cuota; se calcula con `valorPrestamo`, `plazoOriginal` y la tasa del BIESS (**propuesta sin medir**: la tasa es un parámetro y la cuota calculada se rotula «calculada») |
| **Fuente con buró** | La cuota de cada operación del titular al día (`deudaActualTitular.<sistema>`, la que ya usa `datosDeCapacidad()`; en el contrato neutro, `buro.deuda.*` por operación). **No la cuota financiera estimada por el buró**: medida inestable, se descarta |
| **Regla** | Si el titular no tiene mora hoy en nada de lo que se ve (cooperativas, bancos con saldo en atraso, casas comerciales, BIESS): ingreso ≥ suma de cuotas al día / c. Con mora, la cota no se arma: la población medida era sin mora |
| **Parámetro** | c = 0,75 (`cargaParaLaCotaPorCuotas` del estándar). **Medido** en la originación: c = 0,61 cubre 88,6%; c = 0,75 cubre 94,5%. Dependientes e independientes parecido. **Provisional**: población filtrada (decisión D5) |
| **Crea espacio** | **No.** Con ingreso = cuotas / 0,75 la carga actual es 75% por construcción y ninguna cuota nueva entra con una carga máxima de 40%. Sirve para tres cosas: probar que el ingreso es mayor que el del peldaño 1 o el aporte propio, dar contra qué comparar lo declarado, y entregar al estándar la mayor cuota que ya paga al día (el reemplazo de cuota de su celda «inferido con historial probado») |
| **Hoy** | La cuota de cooperativas existe en el perfil (`estructura-v8`); la de bancos, sólo con buró. La regla de la cota no existe |

- **Sin buró la cota es parcial**: la cuota de bancos no consta (sólo el saldo) y la de casas
  comerciales tampoco. El 94,5% se midió con todas las cuotas; con sólo cooperativas y BIESS
  la cobertura es la misma o mayor (se divide menos), pero la cota es **más baja y para menos
  personas**. Cuántas la tienen es lo que mide el paso 3.
- **Contra el ingreso del hogar**: con el cónyuge validado, c = 0,52 cubre 90%. La escalera es
  de la persona; el hogar queda fuera (sección 6).

**3b. Impuesto a la renta causado** (propuesta, decisión D2).

| | |
|---|---|
| **Fuente** | `contribuyente` del SRI vía Proveedor_Info_1: `detalle.impuestoRentaPorAnio[]` (`causado`, `enRelacionDeDependencia`, `formulario`) |
| **Regla** | `baseImponibleDesdeRenta(causado, anio, regimen)` del último año fiscal con dato, dividido en 12. Sólo con impuesto mayor que USD 100 (`IMPUESTO_MINIMO_PARA_INDICIO`: debajo está la cuota fija del negocio popular) y año fiscal de hace dos años o menos |
| **Parámetro** | USD 100 y dos años (**propuesta sin medir**) |
| **Crea espacio** | Sí: es una cota del ingreso total, no de lo que ya paga |
| **Hoy** | La función existe y no está conectada (PR 158). `indicioPorImpuestoALaRenta` la reemplaza con la tarifa máxima, que subestima |

- **No medible todavía**: sólo 4 personas del lote tienen renta reciente.
- **Régimen.** La tabla vale para el régimen general. Razonamiento sin medir: para un RIMPE
  emprendedor la base despejada queda **por debajo** de su ingreso (su impuesto es 1% a 2%,
  menor que el de la tabla general para el mismo ingreso), así que sigue siendo cota; el
  problema real es el negocio popular, con cuota fija, que el umbral de USD 100 deja afuera.
  El encabezado de la función dice que en RIMPE la base sale «absurdamente alta»: vale para la
  cuota fija, no para el emprendedor. Se prueba en la prueba de la función antes de conectarla
  (paso 4). Sin buró no se sabe el régimen (la clase sólo la trae Equifax): se llama con
  `regimen` sin definir y el componente lleva `regimenVerificado: false`.
- Para un dependiente, la base incluye el sueldo: no se suma al peldaño 1, se compara. Si
  supera al sueldo neto, es la prueba de un ingreso extra.

**3c. Aporte propio al IESS** (propuesta, decisión D3).

| | |
|---|---|
| **Fuente** | `fuentesIngreso.fuentes[]` con `evidencia = "autodeclarada_sobre_minimo"` o `"autodeclarada_en_minimo"`, vigente |
| **Regla** | El monto de la base de aporte. En el Ingreso Mínimo SBU vale por el SBU del año (`sbuDelAnio()`) |
| **Crea espacio** | Sí. Sin descontar el aporte personal (la base la elige el afiliado: regla vigente) |
| **Hoy** | Existe: entra a la capacidad como `aporte_propio`, al lado del sueldo |

**3d. Cupo de tarjetas** (sólo con buró, sólo independientes).

| | |
|---|---|
| **Regla** | Ingreso ≥ cupo total / 19 (**medido** al 95%). La regla de 3 a 5 veces no aparece: la mediana del cupo es 5,7 veces el ingreso |
| **Crea espacio** | No: es de apoyo. Entra en la coherencia de lo declarado, no en el monto que sostiene |
| **Hoy** | No existe |

- **No entra como cota**: la cuota más el gasto básico del hogar. Su mejora viene del monto
  fijo y funciona sólo porque la población medida ya pasó un filtro de ingreso.

**El monto del peldaño 3.** Las cotas son mínimos del mismo ingreso: se combinan por
**máximo**, no por suma. **Medido**: las tres cotas al 95% combinadas por máximo cubren 91,1%
(la combinación pierde cobertura: cada una falla en personas distintas). El peldaño lleva dos
montos:

- `montoMensual`: el máximo de todas las cotas (es lo que se muestra y lo que compara lo
  declarado);
- `montoQueCreaEspacio`: el máximo de 3b y 3c, el único con que se calcula la capacidad.

### Peldaño 4. Mínimo certificado

| | |
|---|---|
| **Fuente** | El predictor de ingresos (`estimar-ingreso`, `armarEstimacion()`): `estimado.minimoCertificado`, el monto que el modelo certifica al 90% |
| **Regla** | Sólo para los segmentos que se estiman (`SEGMENTOS_QUE_SE_ESTIMAN`) y con la consulta completa (el freno de 2026-11-05). **Si el mínimo no pasa de USD 1.000** (`MINIMO_PARA_ROTULAR_COMO_ESTIMADO`) no distingue a la persona de los solicitantes: baja al peldaño 6 |
| **Parámetro** | El 90% y los USD 1.000 vigentes. Sin buró, el estándar acepta 0% (no sostiene); con buró, se decide al medir el nivel 2 |
| **Crea espacio** | Sí, cuando el estándar le acepte una fracción mayor que cero |
| **Hoy** | Existe y no se usa en la capacidad: la fila va a `estimaciones_de_ingreso`. El nivel 2 (`ingreso-v2`) está fusionado y sin activar |

- **Medido sin buró** (nivel 1: edad, sexo, RUC): R² 0,157; para la mitad el mínimo no pasa
  de USD 1.000. El lote de paridad (532 independientes, crudo posterior al ingreso) no alcanza
  para mejorarlo. La escala de formalidad ordena el ingreso, pero su percentil 10 ronda
  USD 900 salvo con nómina (USD 1.200). Mejorarlo depende de la base grande pedida al
  proveedor.
- Un mínimo calibrado es una cota con 10% de fallas, del mismo orden que la cota por cuotas
  (88,6% con c = 0,61). Lo que falta no es la forma sino la cobertura en solicitantes sin
  filtrar: la calibración (90,2% en OK FACTURAR) es de aprobados (decisión D6).
- Con mínimo, aunque no sostenga, el peldaño cuenta para la coherencia de lo declarado.

### Peldaño 5. Declarado

| | |
|---|---|
| **Fuente** | `solicitudes.ingreso_declarado`: lo que la persona dice que recibe por mes |
| **Regla** | **Coherente** si no pasa de 1,5 veces el mayor monto de los peldaños 1 a 4 (`declaradoCoherenteHastaVeces` del estándar); **sin respaldo** si no hay con qué compararlo o lo pasa. Se acepta 70% el coherente y 0% el sin respaldo (fracciones del estándar, **propuesta sin medir**) |
| **Sostiene** | **Sólo si no hay peldaño 1 ni 2 con monto.** Con un verificado, manda el verificado; un declarado mayor se anota como diferencia (estándar 3.1) |
| **Hoy** | Existe y **reemplaza** al ingreso del IESS (`conIngresoDeclarado()`). Con la escalera deja de reemplazarlo (decisión D4) |

- Un declarado **menor** que la cota del peldaño 3 no es incoherente: es prudente o declara
  sólo una parte. Se anota como diferencia y se usa tal cual.

### Peldaño 6. Referencia del tipo de persona

| | |
|---|---|
| **Fuente** | El valor central y el rango de ingreso del tipo de persona en los solicitantes medidos (investigación del predictor, 12.36: formal 8.201, semiformal 2.662, poco formal 2.471, RUC no activo 1.650, sin RUC 1.292, valores centrales medianos del nivel 1), y el mínimo del predictor cuando no pasa de USD 1.000 |
| **Regla** | Nunca entra a la capacidad, nunca sostiene y nunca cuenta para la coherencia. Se muestra rotulado «Referencia de solicitantes» (el rótulo vigente) |
| **Hoy** | El rótulo existe en `estimacion-de-ingreso.ts`; la tabla por tipo no |

- Son números de aprobados filtrados: describen a quien ya pasó, no a quien pide. Al modelo
  no llega en la primera versión (decisión D10).

### Equivalencia con el estándar (PR 162)

El estándar se escribió antes de que el negocio fijara los seis peldaños, con otros nombres y
con el predictor debajo de lo declarado. Esta es la equivalencia propuesta (decisión D1):

| Escalera (negocio, 2026-11-13) | Estándar, PR 162 | Diferencia |
|---|---|---|
| 1. Verificado por un tercero | `verificado_por_un_tercero` | Ninguna |
| 2. Verificado con documento | `documentado` | Sólo el nombre |
| 3. Cota por crédito otorgado | parte de `inferido_de_fuentes` | El estándar junta la cota por cuotas y la renta; acá son componentes del mismo peldaño |
| 4. Mínimo certificado | `estimado` (debajo de lo declarado) | **El orden**: el negocio lo puso arriba de lo declarado. Sin buró da igual (0%), con buró no |
| 5. Declarado | `declarado_coherente`, `declarado_sin_respaldo` | Un peldaño con dos estados |
| 6. Referencia del tipo de persona | no está | Nuevo |

---

## 2. El objeto `ingreso`

Dos objetos: el del **perfil** (de la persona, sin solicitud: qué evidencia hay) y el de la
**respuesta** (con la solicitud: con qué peldaño alcanza). Los nombres `sostieneElCalculo` y
`escalera` son los del contrato de la respuesta; el resto se ajusta a ese contrato al
construir. Los montos son mensuales, en dólares.

```ts
// supabase/functions/_shared/escalera-del-ingreso.ts (ejemplo del diseño)

export const ESCALERA_VERSION = "escalera-v1";

export type Peldano =
  | "verificado_por_un_tercero"      // 1
  | "verificado_con_documento"       // 2
  | "cota_por_credito_otorgado"      // 3
  | "minimo_certificado"             // 4
  | "declarado"                      // 5
  | "referencia_del_tipo_de_persona";// 6

export type EstadoDelPeldano =
  | "con_monto"
  | "sin_monto"      // la fuente confirma la fuente de ingreso pero no el monto (pensión)
  | "no_aplica"      // no corresponde a este tipo de persona (predictor para un dependiente)
  | "no_medido";     // la fuente no contestó o no está contratada: no es «no hay»

export type TipoDePersona =
  | "dependiente" | "dependiente_con_ingreso_extra"
  | "independiente_formal" | "independiente_semiformal" | "independiente_poco_formal"
  | "independiente_ruc_activo_no_obligado"   // sin buró no se separa semiformal de poco formal
  | "rentista" | "pensionista" | "informal" | "sin_clasificar";

export interface ComponenteDelPeldano {
  clave:
    | "sueldo_iess" | "documento"
    | "cuotas_al_dia" | "impuesto_a_la_renta" | "aporte_propio" | "cupo_de_tarjetas"
    | "predictor" | "declarado" | "referencia";
  montoMensual: number;
  regla: string;               // "cuotas_al_dia/0.75", "base_imponible/12", ...
  creaEspacio: boolean;
  aFecha: string | null;       // corte del IESS, año fiscal, fecha del documento
  hechos: string[];            // códigos de la capa de hechos que lo sostienen
  avisos: string[];            // "regimen_sin_verificar", "cuota_biess_calculada", ...
}

export interface PeldanoDelIngreso {
  numero: 1 | 2 | 3 | 4 | 5 | 6;
  peldano: Peldano;
  estado: EstadoDelPeldano;
  motivo: string | null;       // con estado distinto de con_monto
  esCota: boolean;             // 3 y 4: un mínimo, no el ingreso
  montoMensual: number | null; // lo que dice la evidencia (bruto; en 3, el máximo de las cotas)
  montoQueCreaEspacio: number | null; // en 3, el máximo de las cotas que crean espacio
  aportePersonal: number;      // sólo en 1
  ingresoNeto: number | null;  // montoQueCreaEspacio menos el aporte personal
  componentes: ComponenteDelPeldano[];
}

export interface DiferenciaDelIngreso {
  clave:
    | "declarado_supera_lo_verificado"
    | "declarado_incoherente"            // pasa de 1,5 veces el mayor de 1 a 4
    | "declarado_menor_que_la_cota"
    | "cota_supera_lo_verificado";       // la cota o la renta prueban más que el IESS
  detalle: string;
  montos: Record<string, number>;
}

/** En el perfil: la evidencia de la persona, sin solicitud ni estándar. */
export interface IngresoDelPerfil {
  version: typeof ESCALERA_VERSION;
  tipoDePersona: TipoDePersona;
  conBuro: boolean;
  peldanos: PeldanoDelIngreso[];       // siempre los seis, en orden
  mayorCuotaAlDia: number | null;      // para el reemplazo de cuota del estándar
  diferencias: DiferenciaDelIngreso[];
}

export interface CapacidadDelPeldano {
  numero: 1 | 2 | 3 | 4 | 5;
  peldano: Peldano;
  fraccionAceptada: number;            // del estándar
  ingresoAceptado: number | null;      // ingresoNeto × fracción
  veredicto: "alcanza" | "justo" | "extendida" | "no_alcanza" | "no_sostiene";
  cargaConElCredito: number | null;
  cuotaMaximaAdmisible: number | null;
  montoMaximoAlPlazo: number | null;   // montoMaximoParaCuota() al plazo pedido
  hipotetico: boolean;                 // el 2 calculado con lo declarado como si se documentara
}

/** En la respuesta: con la solicitud y el estándar de la institución. */
export interface IngresoDeLaRespuesta {
  version: typeof ESCALERA_VERSION;
  tipoDePersona: TipoDePersona;
  conBuro: boolean;
  sostieneElCalculo: {
    numero: 1 | 2 | 3 | 4 | 5;
    peldano: Peldano;
    ingresoAceptado: number;
    veredicto: "alcanza" | "justo" | "extendida";
  } | null;                            // null: ninguno alcanza o no hay con qué medir
  escalera: CapacidadDelPeldano[];     // los peldaños con monto, en orden
  ingresoNecesario: number | null;     // (cuotas actuales + nueva) / carga máxima
  mejora: {                            // lo que habilitaría un peldaño más fuerte
    peldano: Peldano;
    evidencia: string;                 // "declaracion_de_iva", "rol_de_pagos", ...
    montoMaximoAlPlazo: number;
  } | null;
  explicacion: string;                 // la frase de la sección 3
  referencia: { tipoDePersona: TipoDePersona; valorCentral: number; rotulo: string } | null;
  diferencias: DiferenciaDelIngreso[];
}
```

### Ejemplo sin buró

Persona independiente con RUC activo no obligado (sin buró no se sabe si es semiformal o poco
formal), aporte propio de USD 700, una operación en cooperativa al día con cuota de USD 180,
renta de cero el último año, mínimo certificado de USD 1.150 y un declarado de USD 1.600. Pide
USD 3.500 a 36 meses (cuota con desgravamen cerca de USD 124). Carga máxima 40%. Cifras del
ejemplo, inventadas y redondeadas.

```json
{
  "version": "escalera-v1",
  "tipoDePersona": "independiente_ruc_activo_no_obligado",
  "conBuro": false,
  "sostieneElCalculo": { "numero": 5, "peldano": "declarado", "ingresoAceptado": 1120, "veredicto": "alcanza" },
  "escalera": [
    { "numero": 3, "peldano": "cota_por_credito_otorgado", "fraccionAceptada": 1, "ingresoAceptado": 700,
      "veredicto": "no_alcanza", "cargaConElCredito": 0.434, "cuotaMaximaAdmisible": 100, "montoMaximoAlPlazo": 2800, "hipotetico": false },
    { "numero": 4, "peldano": "minimo_certificado", "fraccionAceptada": 0, "ingresoAceptado": 0,
      "veredicto": "no_sostiene", "cargaConElCredito": null, "cuotaMaximaAdmisible": null, "montoMaximoAlPlazo": null, "hipotetico": false },
    { "numero": 5, "peldano": "declarado", "fraccionAceptada": 0.7, "ingresoAceptado": 1120,
      "veredicto": "alcanza", "cargaConElCredito": 0.271, "cuotaMaximaAdmisible": 268, "montoMaximoAlPlazo": 7600, "hipotetico": false },
    { "numero": 2, "peldano": "verificado_con_documento", "fraccionAceptada": 1, "ingresoAceptado": 1600,
      "veredicto": "alcanza", "cargaConElCredito": 0.19, "cuotaMaximaAdmisible": 460, "montoMaximoAlPlazo": 13000, "hipotetico": true }
  ],
  "ingresoNecesario": 760,
  "mejora": { "peldano": "verificado_con_documento", "evidencia": "declaracion_de_iva", "montoMaximoAlPlazo": 13000 },
  "explicacion": "Alcanza con el ingreso declarado (USD 1.600; se toma el 70%). Con la declaración de IVA validada alcanzaría hasta USD 13.000.",
  "referencia": { "tipoDePersona": "independiente_ruc_activo_no_obligado", "valorCentral": 2600, "rotulo": "Referencia de solicitantes" },
  "diferencias": []
}
```

Lo que muestra: el peldaño 3 tiene la cota por cuotas (180 / 0,75 = 240, no crea espacio) y el
aporte propio (700, crea espacio); con 700 no alcanza (43%). El 4 tiene monto (1.150 pasa de
USD 1.000) pero sin buró no sostiene; sí cuenta para la coherencia: 1.600 no pasa de
1,5 × 1.150 = 1.725, así que lo declarado es coherente y se acepta 70%.

### Ejemplo con buró

La misma persona con el buró de la institución: aparecen una cuota de bancos de USD 350 al
día y un cupo de tarjetas de USD 9.500. Ahora las cuotas actuales son 530.

```json
{
  "version": "escalera-v1",
  "tipoDePersona": "independiente_semiformal",
  "conBuro": true,
  "sostieneElCalculo": null,
  "escalera": [
    { "numero": 3, "peldano": "cota_por_credito_otorgado", "fraccionAceptada": 1, "ingresoAceptado": 700,
      "veredicto": "no_alcanza", "cargaConElCredito": 0.934, "cuotaMaximaAdmisible": 0, "montoMaximoAlPlazo": 0, "hipotetico": false },
    { "numero": 4, "peldano": "minimo_certificado", "fraccionAceptada": 0, "ingresoAceptado": 0,
      "veredicto": "no_sostiene", "cargaConElCredito": null, "cuotaMaximaAdmisible": null, "montoMaximoAlPlazo": null, "hipotetico": false },
    { "numero": 5, "peldano": "declarado", "fraccionAceptada": 0.7, "ingresoAceptado": 1120,
      "veredicto": "no_alcanza", "cargaConElCredito": 0.584, "cuotaMaximaAdmisible": 0, "montoMaximoAlPlazo": 0, "hipotetico": false },
    { "numero": 2, "peldano": "verificado_con_documento", "fraccionAceptada": 1, "ingresoAceptado": 1600,
      "veredicto": "no_alcanza", "cargaConElCredito": 0.409, "cuotaMaximaAdmisible": 110, "montoMaximoAlPlazo": 3100, "hipotetico": true }
  ],
  "ingresoNecesario": 1635,
  "mejora": { "peldano": "verificado_con_documento", "evidencia": "declaracion_de_iva", "montoMaximoAlPlazo": 3100 },
  "explicacion": "No alcanza con ningún peldaño. Para lo pedido hace falta un ingreso neto de USD 1.635. Con la declaración de IVA validada por lo declarado (USD 1.600) alcanzaría hasta USD 3.100.",
  "referencia": { "tipoDePersona": "independiente_semiformal", "valorCentral": 2662, "rotulo": "Referencia de solicitantes" },
  "diferencias": [
    { "clave": "cota_supera_lo_verificado", "detalle": "Las cuotas al día prueban un ingreso de al menos USD 707, más que el aporte propio.",
      "montos": { "cotaPorCuotas": 707, "aportePropio": 700 } }
  ]
}
```

Lo que cambia con el buró: la cota por cuotas sube a (350 + 180) / 0,75 = 707, la cota por
cupo es 9.500 / 19 = 500 (de apoyo), la persona se separa como semiformal y, sobre todo, las
obligaciones conocidas pasan de 180 a 530 y lo pedido deja de entrar. El nivel 2 del predictor
seguiría sin sostener hasta que el estándar le dé una fracción.

---

## 3. Cómo elige la capacidad y cómo lo explica

### 3.1 La regla

1. Las **obligaciones** son las mismas para todos los peldaños (las de `datosDeCapacidad()`,
   con la cuota estimada de la deuda sin cuota que propone el estándar).
2. Se calcula la capacidad con cada peldaño 1 a 5 que tenga monto, **uno por vez**, con su
   `ingresoNeto × fraccionAceptada`. Es `evaluarCapacidad()` de hoy con un solo ingreso.
3. **Habilitados para sostener**:
   - 1, 2 y 3 (con `montoQueCreaEspacio`), siempre;
   - 4, cuando el estándar le acepta más que 0% (sin buró, nunca por ahora);
   - 5, sólo si no hay 1 ni 2 con monto;
   - 6, nunca.
4. **Sostiene el cálculo** el primer peldaño habilitado, en orden de 1 a 5, con veredicto
   `alcanza`, `justo` o `extendida` (la extendida sólo con lo que el estándar exige). Es la
   evidencia más fuerte con la que entra, no el monto más alto.
5. Si ninguno alcanza, `sostieneElCalculo` es null y el veredicto que entra a la matriz del
   estándar es el del peldaño habilitado más fuerte con monto (`no_alcanza`), o `sin_medir`
   si no hay ninguno. En los dos casos va el **ingreso necesario**:
   (cuotas actuales + cuota nueva) / carga máxima.
6. La **mejora**: si hay un declarado (o un mínimo certificado) mayor que el ingreso del
   peldaño que sostiene, se calcula el peldaño 2 **hipotético** con ese monto al 100% y se da
   el monto máximo al plazo pedido (`montoMaximoParaCuota()`). Es lo que la persona de la
   institución consigue si valida el documento.

**Por qué no el monto más alto.** Si sostuviera el monto mayor, un declarado alto ganaría
siempre y la capacidad volvería a medir con lo que la persona dice. El orden es el de la
evidencia: el más fuerte que alcanza es el que la institución puede defender.

**Por qué el 5 no sostiene si hay un 1.** Es la regla del estándar: con un verificado manda el
verificado. Un dependiente que declara un extra lo prueba con un documento (peldaño 2) o con
la renta (peldaño 3); la respuesta se lo dice con la mejora.

### 3.2 Las frases

Cada frase nombra el peldaño, su monto y, si existe, la mejora. Los textos son **propuesta**:
los nombres de pantalla los decide el negocio (habilidad `revision-ux`).

| Caso | Frase |
|---|---|
| Sostiene 1 | «Alcanza con el sueldo reportado al IESS (USD 905 netos).» |
| Sostiene 3 por la renta | «Alcanza con el impuesto a la renta de 2025: consta una base de al menos USD 2.100 al mes.» |
| Sostiene 3 por el aporte | «Alcanza con el aporte propio al IESS (USD 700).» |
| Sostiene 4 (cuando se habilite) | «Alcanza con el mínimo certificado (USD 1.150, estimado). Con la declaración de IVA validada alcanzaría hasta USD 13.000.» |
| Sostiene 5 | «Alcanza con el ingreso declarado (USD 1.600; se toma el 70%). Con la declaración de IVA validada alcanzaría hasta USD 13.000.» |
| Ninguno, hay mejora | «No alcanza. Para lo pedido hace falta un ingreso neto de USD 1.635. Con un documento que pruebe lo declarado alcanzaría hasta USD 3.100.» |
| Sin medir | «Sin ingreso con qué medir. Para lo pedido hace falta un ingreso neto de USD 760.» |
| Pensión sin monto | «Cobra una pensión del IESS; la fuente no da el monto. Con el comprobante de pensión se calcula.» |

El documento que nombra la mejora sale del tipo de persona: rol de pagos para un dependiente,
declaración de IVA para un independiente no obligado, declaración de renta o estados
financieros para un obligado a llevar contabilidad, comprobante de pensión para un
pensionista. Son los `DOCUMENTOS_DE_CONFIRMACION` de la pantalla, no nombres nuevos.

### 3.3 Qué cambia en `capacidad-de-pago.ts`

- `capacidad-v5`: `evaluarCapacidad()` no cambia; se agrega `evaluarEscalera()` que la llama
  una vez por peldaño.
- `conIngresoDeclarado()` deja de reemplazar (decisión D4): lo declarado pasa al peldaño 5.
- Hoy el sueldo y el aporte propio se suman en un solo cálculo. Con la escalera el aporte
  propio pasa al peldaño 3 y **ya no se suma al sueldo**: para un dependiente con aporte propio
  aparte (ingresos mixtos), la capacidad baja. Es el cambio que más hay que medir (paso 3) y,
  si el negocio quiere conservar la suma, la alternativa es dejar el aporte propio sobre el
  mínimo en el peldaño 1 cuando hay un empleador vigente (decisión D3).

---

## 4. Qué hace cada tipo de persona

Sin buró, el tipo se arma con lo que trae Proveedor_Info_1: el segmento de `fuentes-ingreso.ts`,
el RUC y si está obligado a llevar contabilidad. **Semiformal y poco formal no se separan sin
buró**: la clase del contribuyente (régimen general o RIMPE) sólo la trae Equifax
(investigación del predictor, 12.36). Falta verificar si `contribuyente` de Proveedor_Info_1
trae el régimen.

| Tipo | Cómo se reconoce (hoy) | Sin buró: qué peldaños tiene y cuál suele sostener | Con buró: qué cambia | El documento de la mejora |
|---|---|---|---|---|
| **Dependiente** | Segmentos `publico`, `diplomatico`, `dependiente_privado`, `empleo_domestico` | 1 (sueldo neto) sostiene. 3 con cuotas de cooperativas o BIESS, sólo prueba. 4 no aplica (`ingreso_verificado`). 5 no sostiene | Aparecen las cuotas de bancos: la carga sube y la cota por cuotas puede pasar al sueldo (diferencia `cota_supera_lo_verificado`, señal de un empleador que reporta menos o de otro ingreso) | Rol de pagos |
| **Dependiente con ingreso extra** | Sueldo vigente y además RUC activo, aporte propio o nómina; `ingresos_mixtos` si ninguna naturaleza pasa de dos tercios | 1 sostiene el sueldo; 3b (renta) puede sostener más si la base pasa al sueldo neto. El extra declarado no sostiene (5 con 1 presente) | La cota por cuotas completa ayuda a probar el extra; el cupo no (no es independiente) | Declaración de renta o de IVA del RUC |
| **Independiente formal** | RUC activo y obligado a llevar contabilidad | 3b (renta) sostiene si hay impuesto reciente; 3c si aporta. 4: nivel 1 cubre 89,1% en aprobados, no sostiene. 5 con 70% si es coherente | 4 con nivel 2: cubre 98,3% pero niega de más al 37,3% (subestima al formal). Cupo de apoyo | Declaración de renta o estados financieros |
| **Semiformal** | RUC activo, no obligado, régimen general (sin buró: «RUC activo no obligado») | 3c (aporte) o 3b (renta, régimen sin verificar); 5 coherente con el 4 | Se separa del poco formal; 3b con régimen verificado; cupo de apoyo | Declaración de IVA |
| **Poco formal** | RUC activo en RIMPE (sólo con buró) | Igual que el semiformal: sin buró no se distingue | 3b casi nunca sirve (negocio popular con cuota fija; emprendedor con impuesto mínimo). 4 nivel 1 casi no sabe más que la mediana (agudeza 2,2%) | Declaración de IVA o registro de ventas |
| **Rentista** | No se reconoce en producción: se definió por la composición del ingreso validado (arriendos la mitad o más) | Propuesta sin medir: RUC con actividad de arriendo (CIIU de actividades inmobiliarias). 3b es el peldaño natural: el arriendo grava renta. Se trata como semiformal | Igual | Declaración de renta |
| **Pensionista** | `jubilado`, `jubilado_con_ingreso_adicional` | 1 `sin_monto` (la fuente no da el monto de la pensión). Si además tiene un sueldo, 1 sostiene con el sueldo. 4 no aplica (no hay tabla de pensiones) | Sólo las cuotas: la carga sube | Comprobante de pensión |
| **Informal** | `informal_o_sin_actividad`, `trabajo_hogar`, `agricola` sin RUC | Casi siempre sin medir: a lo sumo 3a con cooperativas al día, y 5 sin respaldo si no hay 4. Va con el ingreso necesario y Condicionado (celda «sin evidencia» del estándar) | La cota por cuotas de bancos y tarjetas es la que más le cambia: muchos tienen crédito de consumo. 4 sigue sin medir (11 casos OK) | Certificado de ingresos o lo que la institución acepte |

Un segmento `sin_datos` (los aportes no contestaron) no tiene tipo: todos los peldaños que
dependen de esa fuente quedan `no_medido`, no vacíos. Es la regla del perfil incompleto.

---

## 5. Qué se construye, en qué orden y con qué prueba

Nada de esto cuesta modelo ni consultas: se prueba con `deno test`, con crudos inventados
y con lecturas de la base. El modelo entra sólo en el paso 7, con autorización.

| Paso | Qué | Prueba | Depende de |
|---|---|---|---|
| 0 | **Leer del perfil, no esperar a los hechos.** La escalera lee el perfil estandarizado (como `datosDeCapacidad()`) con un adaptador; cuando el grupo 4 de la capa de hechos emita `ing.*` y `lab.*` con paridad, el adaptador cambia y el resto no | La paridad del grupo 4 de la capa de hechos | Nada |
| 1 | `_shared/escalera-del-ingreso.ts`: tipos de la sección 2 y `armarIngresoDelPerfil()` con los peldaños 1, 3a (cooperativas; BIESS después), 3c y 5, la coherencia y las diferencias | `escalera-del-ingreso.test.ts`: un caso inventado por tipo de persona, sin y con buró; invariantes: nunca suma entre peldaños, el 6 nunca sostiene, el 5 no sostiene con un 1, la cota por cuotas nunca crea espacio, `sin_datos` da `no_medido` | 0 |
| 2 | `evaluarEscalera()` en `capacidad-de-pago.ts` (`capacidad-v5`): capacidad por peldaño, `sostieneElCalculo`, ingreso necesario, mejora con `montoMaximoParaCuota()`, frase | Los dos ejemplos de la sección 2 como prueba; paridad con `capacidad-v4` para un dependiente sin declarado | 1 |
| 3 | **Medición en seco**, `scripts/medir-escalera.mjs` (sólo lee): por tipo de persona, cuántos tienen cada peldaño; cuántos veredictos cambian contra `capacidad-v4` y por qué (el declarado que ya no reemplaza, el aporte que ya no se suma); **la cobertura de la cota por cuotas y del mínimo certificado contra el sueldo neto del IESS de los dependientes de la base**, que son solicitantes sin filtrar | El informe en el PR, con los conteos antes de encender nada | 2 |
| 4 | 3b: conectar `baseImponibleDesdeRenta()` | Prueba de la función con un RIMPE emprendedor (la base queda por debajo del ingreso) y con la cuota fija (no entra); conteo de personas con renta reciente en la base | 1 |
| 5 | 4: el mínimo certificado como peldaño, desde `armarEstimacion()`; con mínimo de USD 1.000 o menos baja al 6 | Prueba con los motivos de `decidirEstimacion()`; el peldaño no cambia la capacidad mientras su fracción sea 0 | 1 |
| 6 | 6: la tabla de referencia por tipo de persona, versionada, con su fuente | Prueba de que no entra a la capacidad ni a la coherencia | 1 |
| 7 | La escalera en el perfil del modelo (versión mayor del marco: lee `sostieneElCalculo`, no recalcula), en `api/openapi.yaml` (bloque `ingreso`) y en la pantalla | Redocly estricto; `revisar-textos.mjs`; revisión de UX; el modelo sólo con autorización y costo | 2 a 6 y el sí del negocio a los textos |
| 8 | 2: el documento validado (tipo, monto, fecha, quién), en la solicitud junto a `ingreso_declarado` | Migración con el corredor recién fusionada; prueba de la vigencia | La decisión D8 |
| — | Con buró: las cuotas de bancos en 3a y 3d (cupo), desde el contrato neutro del buró | Paridad con `datosDeCapacidad()` con Equifax | Contrato neutro de la capa de hechos (7.2) |

Los parámetros nuevos (c = 0,75, cupo / 19, USD 100 de renta, dos años fiscales, vigencia del
documento, USD 1.000 del predictor) viven en la subsección `ingreso` del estándar, que ya tiene
`cargaParaLaCotaPorCuotas`: una institución los ve y, donde el estándar lo permita, los mueve.

---

## 6. Lo que no resuelve

- **Los umbrales salen de aprobados filtrados.** c, el 1,5 de la coherencia, el 70% de lo
  declarado y la calibración del predictor se midieron (o se eligieron) sobre una población que
  ya pasó un ingreso mínimo. El paso 3 da una primera medida sin filtro con los dependientes de
  la base; para independientes no hay verdad sin documentos.
- **El ingreso del hogar.** La escalera es de la persona. Con el cónyuge validado la cota por
  cuotas cubre 90% con c = 0,52: hay hogares donde paga el otro. No entra.
- **El informal sin crédito.** Sin aportes, sin RUC y sin cooperativas no hay evidencia: la
  escalera dice el ingreso necesario y nada más.
- **El predictor sin buró** no mejora con lo que hay: depende de la base grande del proveedor.
- **La renta** no está medida (4 personas con renta reciente) y no se verificó qué casillero es
  `rentaCausadoRetenido`: si es el neto de la rebaja por gastos personales, la base queda más
  baja (sigue siendo cota).
- **El IESS que reporta menos.** El peldaño 1 es lo verificado, no el total: la escalera lo
  señala como diferencia, no lo corrige.
- **El proveedor caído** (ola 1: 7 de 52 fuentes en una consulta de prueba). Con los aportes
  caídos todo queda `no_medido`; la escalera no lo arregla, sólo no lo disfraza.

---

## 7. Decisiones para el negocio

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D1 | El orden y los nombres de los peldaños en el estándar (PR 162) | (a) El estándar adopta los seis peldaños del negocio, con el predictor arriba de lo declarado; (b) se queda con sus nombres y su orden | **(a)**. Sin buró no cambia nada (el predictor está en 0%); con buró, el orden decide si un mínimo certificado sostiene antes que lo declarado, y eso es lo que el negocio dijo |
| D2 | Qué entra al peldaño 3 | (a) Sólo las cuotas al día, como lo nombró el negocio; (b) también el impuesto a la renta, el aporte propio y, con buró, el cupo, como componentes; (c) cada uno en un peldaño propio | **(b)**, con el nombre «Cota demostrada» u otro que elija el negocio: son todos mínimos que la persona demostró pagando (cuotas, impuesto, aportes) y se combinan por máximo. (c) alarga la escalera sin ganar nada |
| D3 | El aporte propio | (a) Pasa al peldaño 3, no se suma al sueldo; (b) sobre el mínimo, queda junto al sueldo cuando hay un empleador vigente | **(a)**, si la medición en seco del paso 3 muestra pocos veredictos que cambian; si son muchos, (b). La base la elige la persona: no es un tercero |
| D4 | El declarado deja de reemplazar al sueldo del IESS | Sí / no | **Sí** (el estándar ya lo propone). Hoy un declarado alto borra el sueldo verificado del cálculo. Se mide en el paso 3 cuántas capacidades cambian |
| D5 | c de la cota por cuotas | 0,61 (88,6%), 0,75 (94,5%) | **0,75 provisional** y recalibrar con los dependientes de la base (paso 3). La cota no crea espacio, así que un c más alto sólo hace la prueba más prudente |
| D6 | El mínimo certificado sin buró | (a) No sostiene, sólo coherencia (el estándar: 0%); (b) sostiene ya | **(a)** hasta que su cobertura en solicitantes sin filtrar sea de 88% o más (el paso 3 la mide en dependientes; para independientes hace falta la base del proveedor) |
| D7 | Pensionista sin monto | (a) Condicionado al comprobante; (b) una pensión mínima legal por años de aporte como cota | **(a)** ahora. (b) necesita la tabla legal verificada y los años de aporte, que la fuente puede no traer |
| D8 | El documento (peldaño 2) | (a) Un campo en la solicitud que anota la persona de la institución; (b) esperar al lector de documentos | **(a)**, al final de la ola: es lo que vuelve verificable un Condicionado y el «alcanzaría hasta USD X» de la mejora |
| D9 | La renta como cota | (a) Conectarla con impuesto mayor que USD 100 y año fiscal de hace dos años o menos; (b) esperar a medirla | **(a)**: es una cota que sale de la ley, no de una estadística, y con el umbral deja afuera la cuota fija. Rotulada con régimen sin verificar mientras no haya buró |
| D10 | La referencia del tipo de persona en el modelo | (a) Sólo en pantalla, con ⓘ; (b) también al modelo | **(a)** en la primera versión: son ingresos de aprobados y el modelo podría tomarlos como el ingreso de la persona |
