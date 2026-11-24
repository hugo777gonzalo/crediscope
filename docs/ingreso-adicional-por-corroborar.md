# Ingreso adicional por corroborar: diseño

Pedido del negocio del 2026-11-22: «saber si hay ingresos adicionales que son estimación, que
vienen del predictor de ingresos. Ejemplo: 905 de ingresos validados (IESS), pero la diferencia
es algo que la persona debe corroborar, con declaraciones de IVA, renta actualizada, movimientos
de cuenta, etc.».

Es un diseño: no cambia código de producto. Se construye **sobre la escalera del ingreso**
(`docs/escalera-del-ingreso.md`; F10, #205, y F11, #207, en `main` y sin conectar) y sobre el
estándar de la institución (`docs/estandar-de-la-institucion.md`). No repite lo que ellas
resuelven: los seis peldaños, que nunca se suman, qué peldaño sostiene el cálculo, la mejora,
la oferta y la capacidad máxima informativa. Agrega una sola lectura nueva: **cuánto del ingreso
está validado y cuánto es un adicional que la persona tiene que corroborar, con qué fuerza y
con qué documento**.

**Qué es medido y qué es propuesta.** «Medido» quiere decir medido el 2026-11-22 sobre el último
perfil de las 3.766 personas reales de la base, sin buró, con `scripts/medir-ingreso-adicional.mjs`
(sólo lee), o leído del código de `main` (919c27c). Todo umbral nuevo (materialidad, coincidencia,
fracciones de cada documento) es **propuesta sin medir**: hasta que la institución anote
documentos (D8) no hay contra qué medirlo. Los textos de pantalla son propuesta: los nombres los
decide el negocio.

---

## 0. Resumen

- **La regla.** Lo **validado** es el peldaño 1 (sueldo reportado al IESS, neto del aporte
  personal) y el 2 (el documento que anota la institución). El **adicional por corroborar** es la
  diferencia entre lo validado y el **indicio más alto**: la cota por cuotas al día (3a), la renta
  (3b), el aporte propio (3c), el mínimo certificado del predictor (4) o lo declarado (5). Los
  indicios no se suman: cada uno es otra lectura del mismo ingreso.
- **La fuerza** del adicional es la de su indicio: fuerte (la renta corroborada por sus cuotas),
  media (cuotas al día, renta, aporte propio), débil (predictor, declarado coherente) o sin
  respaldo (declarado que pasa 1,5 veces la evidencia). Sube un grado si otra fuente coincide.
  Además se dice la **parte respaldada**: hasta dónde llega el adicional con indicios de fuerza
  media o fuerte.
- **El documento** sale del indicio y del tipo de persona, de un catálogo único que une los
  «Documentos de Confirmación de Ingresos» de hoy (`paraConfirmar`) con los de la mejora de la
  escalera (`DOCUMENTO_POR_TIPO`). Se suman los **estados de cuenta** con una regla para llevarlos
  a un ingreso mensual.
- **Medido sin buró**: 1.607 de 3.766 personas (42,7%) tienen un adicional material, mediana
  USD 1.247 y p90 USD 3.259. Sale del predictor en 792, de las cuotas al día en 412, de la renta
  en 297 y del aporte propio en 106. **Pero el ejemplo del negocio casi no ocurre hoy**: el
  predictor no estima a quien tiene sueldo verificado, así que a un dependiente el adicional le
  sale de la renta o de las cuotas, y el del predictor es de independientes sin nada validado
  (sección 5).
- **Cambia pocos veredictos y mucho el monto.** Con el crédito de referencia, validar el adicional
  entero haría alcanzar a 66 personas más que la escalera, y las 66 ya las daba su mejora; la parte
  respaldada no cambia ninguno, por construcción (sección 5.3). Contra lo validado solo, alcanzarían
  117 con el adicional entero y 51 con la parte respaldada: son los Aprobado con Requisitos que el
  adicional vuelve verificables. El monto máximo sube en 124 personas (mediana USD 7.219).
- **Política.** El adicional es el contenido del requisito `sustento_de_ingreso` del Aprobado con
  Requisitos: monto, origen y documento, en vez de un «sustentar el ingreso» genérico.
- **14 decisiones** para el negocio (sección 6): A1 a A13 aceptadas como se recomendaron el 2026-11-22; A14 decidida el 2026-11-23 (6.1). 9 tareas de construcción (sección 7).

---

## 1. La regla

### 1.1 Lo validado

| Peldaño | Qué entra | Monto |
|---|---|---|
| 1. Verificado por un tercero | Los sueldos vigentes al corte reportados al IESS por un empleador | `ingresoNeto` del peldaño (bruto menos 9,45%) |
| 2. Verificado con documento | Lo que la institución anota y valida (D8, sección 2.5) | El monto mensual que da la regla del documento (sección 2.4) |

- **Se compara en neto.** Todos los montos de la escalera que sostienen ya son comparables con el
  neto: el 1 se descuenta, la cota por cuotas se divide por la carga (que se mide sobre el neto), la
  renta es base imponible (ya sin el aporte personal), el predictor entra como `ingresoNeto` y lo
  declarado es lo que la persona dice recibir.
- **El 1 y el 2 no se suman, salvo que cubran ingresos distintos.** Es la regla de la escalera
  («dentro de un peldaño, dos montos que son ingresos distintos se suman»): un rol de pagos del
  mismo empleador vuelve a leer el sueldo (manda el mayor); una declaración de IVA de un negocio
  aparte es otro ingreso (se suma al sueldo). Por eso la institución anota qué cubre el documento
  (sección 2.5, decisión A11).
- **El aporte propio y la renta no son validados** (D3 y D9 del 2026-11-18 los dejaron en el
  peldaño 3): la base de aporte la elige la persona y la renta se despeja de un impuesto. Sí
  **sostienen el cálculo** cuando crean espacio. El adicional los cuenta como indicios y la
  respuesta dice que ya sostienen (decisión A1).

### 1.2 Los indicios

Un indicio es un monto que dice que el ingreso puede ser mayor que lo validado. Todos existen ya en
la escalera; acá sólo se les pone fuerza y documento.

| Indicio | Peldaño | Monto (mensual) | Fuerza | Por qué |
|---|---|---|---|---|
| Renta corroborada por sus cuotas | 3b | Base imponible del último año fiscal / 12 | **Fuerte** | Dos fuentes independientes, un impuesto pagado y cuotas pagadas al día, dicen lo mismo: el ingreso pasa lo validado |
| Renta | 3b | Ídem | Media | Sale de la ley, no de una estadística; pero puede ser de hace dos años y, sin buró, el régimen no se verifica |
| Cuotas al día | 3a | Cuotas al día / 0,75 | Media | Lo demostró pagando; es un mínimo con 5,5% de fallas en aprobados (c = 0,75, D5 abierta) |
| Aporte propio | 3c | Base de aporte (en el Ingreso Mínimo SBU, el SBU del año) | Media | Lo paga cada mes, pero la base la elige la persona |
| Mínimo certificado | 4 | El mínimo al 90% del predictor, sólo si pasa de USD 1.000 | Débil | Es una estimación: sin buró R² 0,157 y calibrado en aprobados (D6) |
| Declarado coherente | 5 | Lo que dice recibir, si no pasa de 1,5 veces el mayor de 1 a 4 | Débil | Lo dice la persona; la evidencia no lo contradice |
| Declarado sin respaldo | 5 | Ídem, sin con qué compararlo o por encima de 1,5 veces | Sin respaldo | Lo dice la persona y nada lo acompaña |

- **«Corroborada por sus cuotas»** es la regla que el negocio ya decidió para la renta de un
  dependiente: la base de la renta pasa al sueldo neto **y** las cuotas al día prueban, por su lado,
  un ingreso mayor que el sueldo neto. **Medido**: de 146 personas con sueldo y una base de la renta
  mayor que el sueldo neto, 19 quedan corroboradas, las mismas cifras de la decisión. Sin sueldo
  (un independiente), la renta queda corroborada si las cuotas al día pasan a lo validado, que es 0:
  basta con tener cuotas al día (decisión A12).
- **No son indicios**: la estimación central del predictor (sólo la capacidad máxima informativa,
  negocio, 2026-11-22; decisión A2), la referencia del tipo de persona (peldaño 6: nunca entra), el
  cupo de tarjetas (con buró, sólo apoyo: cuenta para la coincidencia, no da monto) y el historial
  con la institución (negocio, 2026-11-11).

### 1.3 El cálculo

```
validado      = peldaño 1 neto (+ peldaño 2 según qué cubra)
indicios      = los de 1.2 con monto mayor que validado
adicional     = max(indicios) − validado
respaldado    = max(indicios de fuerza media o fuerte) − validado   (0 si no hay)
material      = adicional ≥ USD 100 y adicional ≥ 10% de validado
```

- **Materialidad** (propuesta, decisión A5): un adicional menor no se muestra. Evita que un corte
  del IESS de hace un mes o un redondeo aparezcan como «ingreso por corroborar». Medido: de 1.655
  personas con algún indicio por encima, 1.607 pasan la materialidad.
- **Sin nada validado** (un independiente), el adicional es el indicio entero. Es lo que pasa en
  1.414 de los 1.607 (sección 5.1): para ellos la frase no es «además de lo validado» sino «sin
  ingreso validado».
- El adicional es **por persona**, sin solicitud: va en el perfil (`IngresoDelPerfil`). Lo que
  depende del crédito pedido (si alcanza con él, cuánto haría falta) va en la respuesta (sección 3).

### 1.4 La fuerza, cuando hay más de un indicio

- **La fuerza del adicional es la de su indicio más alto.** Si otro indicio de **otra fuente** llega
  al menos al 80% del más alto (y no es un declarado sin respaldo), sube un grado: débil a media,
  media a fuerte. Dos lecturas independientes que coinciden valen más que una (propuesta,
  decisión A4). Medido: 122 suben un grado.
- La escala, con su nombre de pantalla propuesto, de la más fuerte a la más débil: **Fuerte**,
  **Media**, **Débil** y **Sin respaldo**. Los nombres los decide el negocio (decisión A13).

### 1.5 Cuando los indicios no coinciden

Es lo común: de 1.607 adicionales materiales, 760 tienen dos o más indicios por encima de lo
validado, y el más alto es, en la mediana, 2,6 veces el más bajo (p90: 7,1 veces). La regla:

1. **Nunca se promedian ni se suman.** El adicional va hasta el más alto, para que la persona sepa
   qué tiene que probar para que se le reconozca todo.
2. **Se dice la parte respaldada.** Si el más alto es débil y hay uno medio más bajo, la respuesta
   da los dos: «hasta USD 900 con lo que ya pagó; hasta USD 1.250 si se prueba lo estimado».
   Medido: 423 personas están en ese caso.
3. **Un declarado menor que una cota** no es una contradicción: ya es la diferencia
   `declarado_menor_que_la_cota` de la escalera, y no baja el adicional.
4. **Un declarado sin respaldo** cuenta como indicio (la persona lo dijo y hay que pedirle que lo
   pruebe), pero nunca como parte respaldada y nunca sube la fuerza de otro (decisión A3).
5. Cada indicio sale en la lista con su monto, su fecha y su fuerza: la institución ve el
   desacuerdo, no sólo el resultado.

### 1.6 Qué cambia en la escalera

- **Nada de lo que sostiene el cálculo.** El adicional es una lectura de la escalera, no un
  peldaño. El veredicto, la oferta, la sensibilidad y la capacidad máxima siguen igual.
- **La mejora se generaliza** (decisión A6). Hoy `evaluarEscalera()` calcula el peldaño 2
  hipotético sólo con el mayor de lo declarado y el mínimo certificado (4 y 5). Con el adicional se
  calcula con `validado + adicional`, que incluye también la renta, las cuotas y el aporte, y con el
  documento que corresponde a ese indicio, no sólo al tipo de persona. Un solo concepto para «con
  el documento validado alcanzaría hasta USD Y», no dos.

---

## 2. Qué documento corrobora qué

### 2.1 El catálogo

Hoy hay dos listas que no se hablan. Las dos se conservan y pasan a leer de un catálogo único
(`_shared/documentos-de-ingreso.ts`, tarea C1), con una clave por documento:

| Clave | Hoy está en | Texto de hoy (pantalla) |
|---|---|---|
| `estados_de_cuenta` | `paraConfirmar` (`fuentes-ingreso.ts`) | «Movimientos bancarios de los últimos 6 meses, para contrastar los depósitos contra la base de aporte que la persona eligió.» |
| `declaracion_de_iva` | `paraConfirmar` y `DOCUMENTO_POR_TIPO` | «Declaraciones de IVA de los últimos 6 meses o facturación emitida, para dimensionar la actividad registrada en el SRI.» |
| `comprobante_de_pension` | `paraConfirmar` y `DOCUMENTO_POR_TIPO` | «Comprobante de pensión: la fuente confirma la jubilación pero no expone el monto.» |
| `rol_de_pagos` | `paraConfirmar` (FF. AA. y Policía) y `DOCUMENTO_POR_TIPO` | «Rol de pagos de las Fuerzas Armadas…» |
| `certificado_de_afiliacion` | `paraConfirmar` | «Certificado de afiliación actualizado del IESS…» (no es de ingreso: prueba que sigue el empleo) |
| `declaracion_de_renta` | `DOCUMENTO_POR_TIPO` | «la declaración de renta» |
| `estados_financieros` | `DOCUMENTO_POR_TIPO` | «los estados financieros» |
| `certificado_de_ingresos` | `DOCUMENTO_POR_TIPO` | «un certificado de ingresos» |
| `comprobante_de_retenciones` | **nuevo** | El formulario 107 que entrega el empleador: la renta del año de un dependiente |

- **Se amplía sólo donde hace falta**: el 107 (la renta actualizada de un dependiente sin
  declaración propia) y, dentro de `estados_de_cuenta`, la regla para llevarlo a un ingreso (2.4).
  Los estados de cuenta ya estaban en la lista para el aporte propio; ahora sirven para cualquier
  indicio.
- `DOCUMENTO_POR_TIPO` junta hoy dos documentos en una clave (`declaracion_de_renta_o_de_iva`,
  `declaracion_de_renta_o_estados_financieros`): con el catálogo pasa a ser una lista ordenada de
  claves.
- El título de la sección en pantalla sigue siendo `DOCUMENTOS_DE_CONFIRMACION` («Documentos de
  Confirmación de Ingresos»).

### 2.2 Qué documento corrobora cada indicio

El primero de la lista es el que se pide; los demás, alternativas que la institución acepta.

| Indicio | Documento que lo corrobora | Por qué ese |
|---|---|---|
| 3a Cuotas al día | Estados de cuenta; el del tipo de persona | Las cuotas dicen que hay más ingreso, no de dónde: la cuenta muestra lo que entra |
| 3b Renta | Declaración de renta del último año exigible (dependiente: el 107 del empleador); estados de cuenta | Es el mismo dato, actualizado y con la base exacta en vez de despejada del impuesto |
| 3c Aporte propio | Estados de cuenta; con RUC, declaración de IVA | Ya es lo que pide hoy `paraConfirmar` |
| 4 Mínimo certificado | El del tipo de persona; estados de cuenta | El predictor estima el ingreso total de su tipo |
| 5 Declarado | El del tipo de persona; estados de cuenta | Ídem |

### 2.3 Por tipo de persona

| Tipo | Documento principal | Alternativas | Nota |
|---|---|---|---|
| Dependiente | Rol de pagos (3 meses) | Estados de cuenta (3 meses, con la acreditación del sueldo); 107 | Si el rol pasa al IESS, es la diferencia «el empleador reporta menos» |
| Dependiente con ingreso extra | Para el extra: declaración de IVA (6 meses) o de renta | Estados de cuenta (6 meses) | El documento del extra cubre «otro ingreso»: se suma al sueldo (1.1) |
| Independiente formal (obligado a llevar contabilidad) | Declaración de renta | Estados financieros; estados de cuenta | |
| Independiente con RUC activo no obligado (sin buró) | Declaración de IVA (6 meses) | Estados de cuenta (6 meses) | Sin buró no se sabe si es RIMPE |
| Semiformal (régimen general, con buró) | Declaración de IVA (6 meses) | Estados de cuenta | |
| Poco formal (RIMPE, con buró) | Estados de cuenta (6 meses) | Declaración de IVA (semestral) | El negocio popular declara poco: la cuenta dice más |
| Rentista | Declaración de renta | Contratos de arriendo con estados de cuenta | |
| Pensionista | Comprobante de pensión | Estados de cuenta (acreditación de la pensión) | Es el requisito de D7 |
| Informal | Estados de cuenta (6 meses) | Certificado de ingresos | Sin RUC ni aportes, la cuenta es lo único que se puede leer |

### 2.4 Cómo se lleva cada documento a un ingreso mensual y cuánto se acepta

La institución anota los números del documento y **el código calcula** el ingreso mensual con la
regla de su tipo: así el monto es el mismo en toda institución y se puede revisar. Todo es
**propuesta sin medir**: los parámetros van al estándar (subsección `ingreso`), donde una
institución los ve y, donde el estándar lo permita, los mueve.

| Documento | Qué anota la institución | Ingreso mensual | Se acepta | Vigencia |
|---|---|---|---|---|
| Rol de pagos | Por mes: total de ingresos y aporte personal al IESS | Promedio de los meses de (ingresos − aporte personal). No el «líquido a recibir»: descuenta préstamos y anticipos que ya están en las obligaciones | 100% | El último rol, de 60 días o menos; 3 meses seguidos |
| Comprobante de pensión | Pensión líquida del mes | El monto | 100% | 60 días |
| Declaración de renta | Año fiscal, total de ingresos, costos y gastos, base imponible | (Ingresos − costos y gastos) / 12; si no vienen, base imponible / 12 | 100% | El último año exigible (el anterior al año en curso; hasta mayo, también el anterior a ese) |
| Comprobante de retenciones (107) | Año, ingresos gravados con el empleador, aporte personal | (Ingresos − aporte) / 12 | 100% | Ídem |
| Declaración de IVA | Por mes (o semestre): ventas netas y compras netas | Promedio mensual de (ventas − compras) | 70% (decisión A8) | Los últimos 6 meses declarados; el último, de 60 días o menos |
| Estados de cuenta | Por mes: total acreditado y lo que se excluye (abajo) | Mediana de los meses de (acreditado − excluido); con movimiento de un negocio, por la fracción del negocio | 100% si lo que entra es sueldo o pensión; 50% si es un negocio (decisión A7) | Meses seguidos; el último cerrado, de 45 días o menos |
| Estados financieros | Año, utilidad antes de impuestos | Utilidad / 12 | 100% | Ídem que la renta |
| Certificado de ingresos | Monto mensual que certifica y quién firma | El monto | 50%, y nunca más que lo que muestran los estados de cuenta si los hay (decisión A9) | 90 días |

**Estados de cuenta, en detalle** (el documento nuevo de la lista de ingreso):

- **Cuántos meses.** 6 para independientes, informales y el extra de un dependiente: un negocio
  tiene meses buenos y malos, y con 3 un mes de temporada pesa un tercio. 3 para quien cobra un
  sueldo o una pensión: es una acreditación fija y lo que se mira es que llegue cada mes.
- **De quién.** La cuenta a nombre de la persona (la institución lo marca), emitido por el banco o
  la cooperativa, no una captura. Una cuenta conjunta se anota como tal y cuenta la mitad
  (propuesta).
- **Qué se excluye** de lo acreditado: transferencias entre cuentas de la misma persona,
  desembolsos de préstamos y avances de tarjeta, reversos y devoluciones, y depósitos que salen
  el mismo día por el mismo monto. La institución anota cada mes el total y lo excluido; no se
  transcribe movimiento por movimiento.
- **Por qué la mediana y no el promedio.** Un mes con un depósito extraordinario (una venta de un
  vehículo, una liquidación) mueve el promedio y no la mediana. Si un mes pasa 2 veces la mediana,
  sale un aviso.
- **Por qué la mitad en un negocio.** Lo que entra a la cuenta de un negocio son ventas, no
  ganancia: los proveedores, el arriendo y los sueldos salen de ahí. Sin un estado de resultados, la
  fracción es la forma de no tomar las ventas por ingreso. Es el parámetro más incierto del diseño y
  el primero que hay que medir cuando haya documentos anotados.
- **Qué no se mira**: el saldo promedio (habla de ahorro, no de ingreso) ni los débitos uno por
  uno (las obligaciones ya salen de las fuentes).

### 2.5 Qué anota la institución (D8)

D8 (2026-11-18) decidió que el documento validado es un campo que anota la institución. Este diseño
propone su forma: una tabla `documentos_de_ingreso`, una fila por documento, ligada a la solicitud.

| Campo | Qué es |
|---|---|
| `solicitud_id` | La solicitud a la que sostiene (la persona sale de ahí) |
| `tipo` | Una clave del catálogo (2.1) |
| `periodo_desde`, `periodo_hasta` | Los meses o el año fiscal que cubre |
| `cifras` | Los números de la tabla de 2.4, por mes o por año (jsonb con forma fija por tipo) |
| `cubre` | `ingreso_total` (vuelve a leer el ingreso que ya consta: manda el mayor) u `otro_ingreso` (una actividad aparte: se suma a lo validado) |
| `corrobora` | Qué indicio corrobora: `cuotas_al_dia`, `impuesto_a_la_renta`, `aporte_propio`, `predictor`, `declarado` o ninguno |
| `a_nombre_de_la_persona` | Marcado por quien valida |
| `fecha_del_documento` | Para la vigencia |
| `huella_sha256` | La huella del archivo, **nunca el archivo** (como la autorización de la solicitud) |
| `validado_por`, `validado_el` | Quién y cuándo; la fila no se edita: se anula y se anota otra |
| `observacion` | Texto libre corto |

- El monto mensual y el aceptado **no se anotan**: los calcula el código (2.4) cada vez, con la
  versión de la regla. Así un cambio de fracción se ve en todas las solicitudes.
- Es una tabla con datos de la persona: RLS por rol, en `suprimir_titular()`,
  `derechos-del-titular.mjs` y `auditar-seguridad.mjs` (regla de siempre).
- La migración va por el corredor, recién fusionada en `main` (regla dura 1).

---

## 3. Cómo sale en la respuesta y en la política

### 3.1 El objeto

En el perfil (sin solicitud), al lado de `peldanos` en `IngresoDelPerfil`:

```ts
// supabase/functions/_shared/escalera-del-ingreso.ts (propuesta)

export type FuerzaDelIndicio = "fuerte" | "media" | "debil" | "sin_respaldo";

export interface IndicioDeIngreso {
  clave: "cuotas_al_dia" | "impuesto_a_la_renta" | "aporte_propio" | "predictor" | "declarado";
  peldano: "3a" | "3b" | "3c" | "4" | "5";
  montoMensual: number;
  fuerza: FuerzaDelIndicio;
  aFecha: string | null;                 // año fiscal, corte del IESS, fecha de la estimación
  avisos: string[];                      // "corroborada_por_sus_cuotas", "regimen_sin_verificar", "estimado", ...
  documentos: ClaveDeDocumento[];        // 2.2 y 2.3, en orden
}

export interface IngresoAdicional {
  validado: number;                      // neto, USD por mes
  peldanosValidados: Array<1 | 2>;
  adicional: {
    montoMensual: number;                // indicio más alto − validado
    hasta: number;                       // validado + adicional
    origen: IndicioDeIngreso["clave"];
    fuerza: FuerzaDelIndicio;            // la del origen, subida un grado si otra fuente coincide
    respaldado: number;                  // la parte con indicios de fuerza media o fuerte (0 si no hay)
    yaSostieneElCalculo: boolean;        // el origen es la renta o el aporte propio y crea espacio
    documentos: ClaveDeDocumento[];      // los del origen, y los del respaldado si es otro
  } | null;                              // null: sin indicio por encima, o no material
  indicios: IndicioDeIngreso[];          // todos los que pasan lo validado, del más alto al más bajo
}
```

En la respuesta (con solicitud), al lado de `mejora` en `IngresoDeLaRespuesta`:

```ts
export interface AdicionalEnLaRespuesta {
  /** Lo que falta para lo pedido, sobre lo validado: max(0, ingresoNecesario − validado). */
  faltaParaLoPedido: number | null;
  /** Si el adicional entero, validado, haría alcanzar lo pedido. */
  conElAdicional: { veredicto: VeredictoDelPeldano; cuotaMaximaAdmisible: number; montoMaximoAlPlazo: number | null };
  /** Lo mismo, sólo con la parte respaldada. null si no hay. */
  conLoRespaldado: { veredicto: VeredictoDelPeldano; cuotaMaximaAdmisible: number; montoMaximoAlPlazo: number | null } | null;
  /** El requisito para el Aprobado con Requisitos, si corresponde (3.4). */
  requisito: { codigo: "sustento_de_ingreso"; ingresoAProbar: number; documentos: ClaveDeDocumento[] } | null;
}
```

`mejora` se calcula desde `conElAdicional` (decisión A6) y deja de mirar sólo el 4 y el 5.

### 3.2 Ejemplo

Cifras inventadas y redondeadas. Dependiente con sueldo reportado al IESS de USD 1.000 (USD 905
netos), cuotas en cooperativas de USD 750 al día (cota 1.000) y renta del último año con una base
de USD 2.100 al mes. Pide USD 15.000 a 48 meses; la cuota con desgravamen es cerca de USD 420 y ya
paga USD 750. Carga máxima 40%.

```json
{
  "validado": 905,
  "peldanosValidados": [1],
  "adicional": {
    "montoMensual": 1195,
    "hasta": 2100,
    "origen": "impuesto_a_la_renta",
    "fuerza": "fuerte",
    "respaldado": 1195,
    "yaSostieneElCalculo": true,
    "documentos": ["declaracion_de_renta", "comprobante_de_retenciones", "estados_de_cuenta"]
  },
  "indicios": [
    { "clave": "impuesto_a_la_renta", "peldano": "3b", "montoMensual": 2100, "fuerza": "fuerte",
      "aFecha": "2025", "avisos": ["corroborada_por_sus_cuotas", "regimen_sin_verificar"],
      "documentos": ["declaracion_de_renta", "comprobante_de_retenciones", "estados_de_cuenta"] },
    { "clave": "cuotas_al_dia", "peldano": "3a", "montoMensual": 1000, "fuerza": "media",
      "aFecha": null, "avisos": [], "documentos": ["estados_de_cuenta", "rol_de_pagos"] }
  ]
}
```

Lo que muestra: la renta pasa al sueldo neto y las cuotas también (1.000 > 905), así que la renta
está corroborada y es fuerte. Ya sostiene el cálculo (la renta crea espacio): la escalera alcanza
con el peldaño 3 y el adicional no cambia el veredicto. Lo que agrega es decir que esos USD 1.195
están por corroborar y con qué. Si la institución anota la declaración de renta, el 2 queda con
USD 2.100 y la salida puede subir de la columna «inferido» a «verificado» de la matriz del estándar.

### 3.3 Las frases (propuesta)

| Caso | Frase |
|---|---|
| Con validado y adicional | «Validado: USD 905 (IESS). Adicional por corroborar: USD 1.195, de su impuesto a la renta de 2025 (fuerte). Se corrobora con la declaración de renta.» |
| El adicional ya sostiene | «… Ya sostiene el cálculo; con la declaración validada pasa a ingreso verificado.» |
| Con parte respaldada distinta | «Adicional por corroborar: hasta USD 1.250, estimado (débil); USD 900 de eso, con lo que ya paga al día (media).» |
| Sin nada validado | «Sin ingreso validado. Por corroborar: USD 1.150, estimado por el predictor (débil). Se corrobora con la declaración de IVA de 6 meses o los estados de cuenta.» |
| Con solicitud, alcanzaría | «No alcanza con lo validado. Con USD 380 más corroborados alcanza: con la declaración de renta validada alcanzaría hasta USD 18.000.» |
| Con solicitud, ni con el adicional | «No alcanza ni con el adicional corroborado (hacen falta USD 1.635 netos).» |

Rótulos cortos propuestos para la tarjeta: «Validado», «Por corroborar», «Fuerte», «Media»,
«Débil», «Sin respaldo». «Estimado» ya existe para el predictor. Los nombres los decide el negocio
(decisión A13) y pasan por la revisión de UX.

### 3.4 La política: su relación con Aprobado con Requisitos

El estándar ya dice (4.2) que un «no alcanza» con un ingreso inferido o declarado, o con la cota
por cuotas por encima de lo medido, va a **Aprobado con Requisitos: `sustento_de_ingreso`, con el
ingreso necesario**. El adicional le da contenido a ese requisito:

| Situación (contra lo validado, con lo pedido) | Salida que propone | Requisito |
|---|---|---|
| Alcanza con lo validado | La de la matriz; el adicional sólo informa («con X validado alcanzaría hasta USD Y») | Ninguno |
| No alcanza con lo validado; alcanza con la parte respaldada | **Aprobado con Requisitos** | `sustento_de_ingreso`: probar `faltaParaLoPedido`, con los documentos del indicio respaldado |
| No alcanza con lo validado; alcanza sólo con el adicional débil o sin respaldo | Aprobado con Requisitos con el tope de la celda «sin evidencia» del estándar (hasta USD 3.000 sin historial), o Revisar (decisión A10) | Ídem, con los documentos del origen |
| No alcanza ni con el adicional entero | Lo que dé la matriz con el ingreso que sostiene (Cambio de Condiciones con la oferta, si hay) | El adicional no se pide: no cambiaría la salida |
| Sin validado y sin indicios | Lo de hoy: `sustento_de_ingreso` con el ingreso necesario | Sin documento sugerido más que el del tipo |

- **El requisito lleva tres números**: lo validado, lo que falta (`faltaParaLoPedido`) y el
  adicional. Así un analista sabe que con USD 380 más corroborados alcanza, aunque el adicional sea
  de USD 1.195: no hace falta probar todo.
- **Al cumplirse**, el documento anotado entra como peldaño 2 y la evaluación se recalcula; subir de
  Aprobado con Requisitos a Aprobar «sólo si el hecho que el requisito pedía ya está en el caso»
  (estándar, 4.6) queda verificable: el hecho es la fila de `documentos_de_ingreso`.
- No hay un requisito nuevo en el catálogo: `sustento_de_ingreso` ya tiene `llevaIngresoNecesario`;
  se le suma `llevaAdicional`.

---

## 4. Sin buró y con buró

| | Sin buró (sólo Proveedor_Info_1) | Con el buró de la institución |
|---|---|---|
| 3a Cuotas al día | Sólo cooperativas y BIESS calculado: la cota es más baja y para menos personas | Se suman bancos y casas comerciales: más personas con la cota y más alta. Es el indicio que más cambia |
| 3b Renta | Régimen sin verificar: la renta no pasa de media salvo corroborada | Con la clase de contribuyente: el RIMPE se reconoce; la renta del régimen general puede subir a fuerte con las cuotas de bancos |
| 3d Cupo de tarjetas | No existe | Cuenta para la coincidencia (sube un grado), nunca da monto |
| 4 Predictor | Nivel 1: débil siempre; la mitad no pasa de USD 1.000 y no es indicio | Nivel 2 (sin activar): sigue débil hasta que el estándar le dé una fracción mayor que 0 (D6); si se la da, la decisión A2 se revisa |
| Tipo de persona | Semiformal y poco formal juntos: el documento es IVA o estados de cuenta | Se separan: al poco formal se le piden primero estados de cuenta |
| Obligaciones | Sólo lo que trae la fuente | Más cuotas: el ingreso necesario sube y el adicional decide más salidas |

El seco de este documento es sin buró. Con buró no se midió: la escalera tampoco lo hizo y su
contrato neutro del buró (capa de hechos, 7.2) todavía no alimenta el 3a.

---

## 5. Medición en seco

`node scripts/medir-ingreso-adicional.mjs` (sólo lee; ~4 min). Último perfil de cada persona
real, sin las sintéticas de Aval, sin buró, con el predictor vigente del nivel 1 (`ingreso-v1`) y
el crédito de referencia del estándar (USD 5.000 a 36 meses, Tasa máxima). **Sólo 1 persona tiene
un Ingreso declarado** en una solicitud: el peldaño 5 queda casi sin medir.

### 5.1 A cuántas les aparece y de qué tamaño

| | Personas |
|---|---|
| Medidas | 3.766 |
| Con ingreso validado (peldaño 1) | 1.350 |
| Con algún indicio por encima de lo validado | 1.655 |
| **Con un adicional material** | **1.607 (42,7%)** |
| … con algo validado | 193 (mediana USD 1.043, p90 USD 3.998) |
| … sin nada validado | 1.414 (mediana USD 1.254, p90 USD 3.203) |

Tamaño del adicional material: **mediana USD 1.247, p90 USD 3.259**.

| De qué indicio sale | Personas | | Fuerza | Personas |
|---|---|---|---|---|
| Predictor (mínimo certificado) | 792 | | Fuerte | 82 |
| Cuotas al día | 412 | | Media | 788 |
| Renta | 297 | | Débil | 737 |
| Aporte propio | 106 | | Sin respaldo | 0 |

122 subieron un grado por coincidir con otra fuente. 1.238 tienen parte respaldada (mediana
USD 898, p90 USD 3.793).

### 5.2 Por tipo de persona

| Tipo | Personas | Con validado | Adicional material | Mediana | p90 | Sale de |
|---|---|---|---|---|---|---|
| RUC activo no obligado | 1.209 | 10 | 1.058 (87,5%) | 1.248 | 2.816 | predictor 687, cuotas 164, renta 138, aporte 69 |
| Dependiente con ingreso extra | 749 | 742 | 151 (20,2%) | 1.044 | 4.307 | renta 93, cuotas 51, predictor 6, aporte 1 |
| Sin clasificar | 701 | 7 | 17 (2,4%) | 1.189 | 2.285 | predictor 13, cuotas 3, renta 1 |
| Dependiente | 605 | 579 | 49 (8,1%) | 998 | 3.172 | renta 26, cuotas 23 |
| Pensionista | 261 | 5 | 155 (59,4%) | 892 | 3.183 | cuotas 139, renta 14, aporte 2 |
| Informal | 133 | 3 | 69 (51,9%) | 666 | 2.200 | aporte 31, cuotas 28, renta 6, predictor 4 |
| Independiente formal | 108 | 4 | 108 (100%) | 3.050 | 4.561 | predictor 82, renta 19, cuotas 4, aporte 3 |

Lo que dicen:

- **El ejemplo del negocio (905 del IESS y el resto estimado) casi no ocurre.** El predictor no
  estima a quien tiene sueldo verificado (`ingreso_verificado`, sólo estima independientes, mixtos,
  agrícolas, trabajo del hogar e informales): de 742 dependientes con ingreso extra con sueldo, el
  adicional sale del predictor en 6. A un dependiente el adicional le sale de la **renta** (119) y
  de las **cuotas** (74). Si el negocio quiere el adicional estimado sobre un sueldo, el predictor
  tiene que estimar también a quien tiene uno (decisión A14).
- **Para los independientes el adicional es casi todo su ingreso**: 1.414 no tienen nada validado.
  Para ellos la palabra útil no es «adicional» sino «por corroborar» a secas.
- **Los pensionistas** tienen el peldaño 1 sin monto (la fuente no da la pensión): su adicional es
  la cota por cuotas (139). Es la misma persona que va a Aprobado con Requisitos al comprobante de
  pensión (D7): el adicional le pone un número mínimo a lo que el comprobante tiene que mostrar.
- **Sin clasificar** (701, los aportes no contestaron) casi no tiene adicional: con la fuente caída
  no hay con qué medir, y eso se dice como «sin medir», no como «no tiene».

### 5.3 A cuántas les cambiaría el veredicto

Con el crédito de referencia, la escalera de hoy alcanza en 191 personas (alcanza 149, justo 42),
no alcanza en 1.860 y queda sin medir en 1.715.

| Si el adicional se validara (peldaño 2 hipotético) | Pasan a alcanzar |
|---|---|
| El adicional entero, contra la escalera de hoy | 66 (57 RUC no obligado, 5 formal, 4 sin clasificar) |
| … de esos, ya los daba la mejora de la escalera (4 y 5) | 66 |
| Sólo la parte respaldada, contra la escalera de hoy | 0 |
| El adicional entero, contra lo validado solo (sin cotas, predictor ni declarado; no alcanzan 1.603 de los 1.607) | 117 (RUC no obligado 89, dependiente con ingreso extra 8, formal 6, informal 5, sin clasificar 4, dependiente 3, pensionista 2) |
| Sólo la parte respaldada, contra lo validado solo | 51 (RUC no obligado 32, dependiente con ingreso extra 8, informal 5, dependiente 3, pensionista 2, formal 1) |

El monto máximo al plazo pedido sube en 124 personas: mediana USD 7.219, p90 USD 13.717.

Por qué cambia tan poco el veredicto, y por qué no es una mala noticia:

- **La parte respaldada no cambia ninguno, por construcción.** La renta y el aporte propio ya
  sostienen el cálculo (crean espacio): validarlos no mueve el veredicto. La cota por cuotas no
  puede: con un ingreso igual a cuotas / 0,75, la carga actual ya es 75%. Validar el **monto de la
  cota** no sirve; lo que sirve es que el documento muestre el ingreso **real**, que la cota sólo
  acota por abajo. Por eso la respuesta pide el documento, no «validar USD X».
- **Los 66 que cambian son todos del predictor** y la mejora de la escalera ya los veía: el adicional
  no agrega veredictos nuevos, agrega el porqué y el documento.
- **El valor está en la salida, no en el veredicto**: contra lo validado solo (lo que la institución
  puede defender sin un documento), el adicional haría alcanzar a 117, y a 51 con la parte
  respaldada. Son los «no alcanza» que el adicional convierte en un Aprobado con Requisitos con un
  número y un documento (3.4). Y en 124 personas sube el monto que se puede ofrecer.
- **El crédito de referencia pesa**: USD 5.000 a 36 meses con la Tasa máxima es una cuota cerca de
  USD 177 y la mayoría de la base tiene obligaciones altas. Con montos menores cambiarían más; el
  seco no lo barre.

### 5.4 Cuando los indicios no coinciden

760 adicionales materiales tienen dos o más indicios por encima de lo validado; el más alto es 2,6
veces el más bajo en la mediana y 7,1 en el p90. En 737 el más alto es débil (el predictor), y en
423 hay una parte respaldada más baja que el adicional. Es la razón de dar las dos cifras (1.5).

### 5.5 Desde lo que sostiene, en vez de desde lo validado (decisión A1)

Si el adicional se midiera desde lo que ya sostiene el cálculo (el sueldo neto, o la renta o el
aporte propio del peldaño 3), quedarían 1.186 adicionales materiales en vez de 1.607 (mediana
USD 1.075, p90 USD 2.364; predictor 781, cuotas 405). Los 403 de diferencia son personas cuyo
indicio más alto es la renta o el aporte propio: el adicional desaparecería aunque ninguna de las
dos esté validada.

---

## 6. Decisiones del negocio

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| A1 | Desde dónde se mide el adicional | (a) Desde lo validado (1 y 2), como lo pidió el negocio; (b) desde lo que sostiene el cálculo (1, o la renta o el aporte propio) | **(a)**, y decir «ya sostiene el cálculo» cuando el origen es la renta o el aporte. Ni la renta (despejada de un impuesto, a veces de hace dos años) ni el aporte (base elegida) están validados; con (b) desaparecen 403 adicionales que sí habría que corroborar **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A2 | Qué monto del predictor es indicio | (a) El mínimo certificado al 90%; (b) la estimación central | **(a)**. La central ya está en la capacidad máxima informativa (2026-11-22); como indicio daría adicionales más grandes con la evidencia más débil **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A3 | Lo declarado sin respaldo | (a) Indicio sin respaldo: se pide probarlo, nunca es parte respaldada; (b) no cuenta | **(a)**: la persona lo dijo y el analista tiene que saber qué pedir **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A4 | La escala de fuerza y la coincidencia | (a) Cuatro grados (1.2) y sube uno si otra fuente llega al 80% del más alto; (b) cuatro grados sin coincidencia; (c) sólo «con respaldo / sin respaldo» | **(a)**. 122 suben; dos fuentes independientes que coinciden son la mejor señal que hay sin documentos **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A5 | Materialidad | (a) USD 100 y 10% de lo validado; (b) cualquier diferencia; (c) otro umbral | **(a)**: deja afuera 48 de 1.655, ruido de corte y de redondeo **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A6 | La mejora de la escalera | (a) Se calcula desde el adicional (todos los indicios y el documento del origen); (b) dos conceptos separados | **(a)**: un solo «con el documento validado alcanzaría hasta USD Y» **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A7 | Estados de cuenta | Meses (6 independientes, 3 sueldo o pensión), mediana de lo acreditado menos lo excluido, 100% si es sueldo o pensión y 50% si es un negocio; o (b) promedio y 100% | **La propuesta de 2.4**, provisional: la fracción del negocio es lo más incierto y se mide con los primeros documentos anotados **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A8 | Declaración de IVA | (a) (Ventas − compras) al 70%; (b) ventas por un margen por actividad; (c) 100% | **(a)**: las compras con IVA no son todo el costo (arriendo, sueldos, lo comprado sin factura) **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A9 | Certificado de ingresos | (a) 50% y nunca más que los estados de cuenta; (b) 0%, sólo de apoyo; (c) 70%, como lo declarado coherente | **(a)**: lo firma alguien, pero es la persona o su contador **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A10 | Salida cuando sólo el adicional débil haría alcanzar | (a) Aprobado con Requisitos con el tope de la celda «sin evidencia»; (b) Revisar | **(a)**: el requisito lo vuelve verificable, que es lo que pide el estándar para no mandar a Revisar sólo por el ingreso **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A11 | La forma del documento anotado (D8) | (a) La tabla de 2.5: la institución anota las cifras, el código calcula, se guarda la huella y nunca el archivo; (b) un monto mensual y el tipo, en la solicitud | **(a)**: el monto sale igual en toda institución y una fracción nueva se aplica a todo **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A12 | «Corroborada por sus cuotas» | (a) Las cuotas al día prueban más que lo validado (medido: 19 de 146, la cifra de la decisión); (b) las cuotas llegan a la mitad de la base de la renta (13 de 146) | **(a)**: es la regla con que se midió la decisión y no depende de un segundo umbral **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A13 | Los nombres de pantalla | «Validado», «Por corroborar», «Fuerte», «Media», «Débil», «Sin respaldo» (3.3) u otros | Los decide el negocio; la recomendación es la propuesta, que no choca con «Estimado» ni con «Referencia de solicitudes» **Decisión del negocio (2026-11-22):** aceptada la recomendación. |
| A14 | El predictor sobre un sueldo | (a) Como hoy: no estima a quien tiene sueldo verificado; (b) estimar también a los dependientes con ingreso extra, para el adicional | **(a) por ahora**: el predictor se entrenó con el ingreso total de aprobados y, sobre un sueldo, estimaría el sueldo otra vez. (b) pide medirlo antes en esa población (especificación del predictor) **Abierta (2026-11-22):** el negocio pide medir el predictor sobre dependientes con ingreso extra antes de decidir. **Decisión del negocio (2026-11-23):** (a), medido (6.1). No se estima al dependiente con sueldo verificado (`SEGMENTOS_QUE_SE_ESTIMAN` no cambia) y se suma una señal sin monto, «tiene RUC activo: puede tener ingresos que no constan»; el monto lo ponen la renta, el IVA y las cuotas. |

### 6.1 A14 medida (2026-11-23)

Medición en seco sobre la originación de AWS ya bajada: sin el modelo de lenguaje, sin consultar fuentes ni escribir en la base. Se corrió `ingreso-v2`
(niveles 1 y 2, calibrados como se sirven) sobre 12.986 dependientes y públicos con sueldo recuperado del IESS y el bloque del SRI de Equifax. El
modelo se entrenó sólo con independientes, así que ninguno estuvo en el entrenamiento. Con RUC activo hay 3.874 (1.235 en OK FACTURAR y
condicionado); el control son 4.271 sin RUC. «Adicional material» es el que supera los USD 100 y el 10% del sueldo.

| Con RUC activo, todas las respuestas | Nivel 1 | Nivel 2 |
|---|---|---|
| El mínimo certificado cae entre el sueldo y lo validado (le sirve al adicional) | 12,9% | 19,4% |
| El mínimo sobrepasa lo validado | 35,4% | 32,5% |
| Lo validado alcanza al mínimo (la promesa es 90%) | 64,6% | 67,5% |
| La estimación central queda dentro de ±20% de lo validado | 20,6% | 29,6% |

- **El sueldo solo le gana al predictor**: queda dentro de ±20% de lo validado en el 65,0%. En OK FACTURAR el mínimo cubre 81,7% y 83,4%,
  también bajo la meta.
- **El nivel 1 casi es un número fijo** (mediana USD 1.274) y no separa a quien tiene adicional material (AUC 0,498). Su acierto sale de los
  sueldos bajos, que el mínimo pasa siempre.
- **Lo que separa el nivel 2 es el buró**: AUC 0,549 (0,655 en OK), pero la cuota, la deuda y el crédito mayor solos dan 0,619 (0,786 en OK), y
  juntos no suman nada. Es la cota por cuotas, que ya es el peldaño 3.
- **Sumar el mínimo al sueldo** sobrepasa lo validado en el 91,7% al 94,7%: se descarta.
- **La cifra de Equifax tampoco le gana al sueldo.** Queda dentro de ±20% en el 35,5% (sueldo solo, 63,3%; el mayor de los dos, 46,6%) y
  sobreestima en más de 20% al 40,4% (2.802 casos, sin el tramo del 16 de enero al 12 de abril de 2026, que el negocio descartó).
- **La señal sin monto existe**: con RUC activo, el 39,3% tiene un adicional material, contra el 20,8% sin RUC (33,2% y 20,5% en OK). Lo validado
  supera al sueldo en el 41,5% (mediana USD 653, cuartiles 400 a 1.100).

Límites:
- Lo validado es lo que documentó el analista: en el 58,5% de los dependientes con RUC activo es exactamente el sueldo, así que «sobrepasa» es un
  techo del riesgo.
- La población es de crédito automotriz y de 2026: el bloque del SRI casi no existe antes.

Un modelo propio del extra del dependiente, con el sueldo como entrada, ya se probó con la etiqueta «total menos sueldo» y no pasó (12.14 y 12.36:
AUC 0,687, R² 0,01). **El 2026-11-23 el negocio pidió intentarlo con la etiqueta por componente** (el check de AWS y el origen de cada ítem):
`docs/propuesta-adicional-del-dependiente.md`, con sus reglas y sus sesiones. Hasta que pase, rige (a).

---

## 7. Construcción

Nada cuesta modelo ni consultas, salvo C9. Se prueba con `deno test`, crudos inventados y lecturas
de la base.

| Tarea | Qué | Prueba | Depende de | Modelo |
|---|---|---|---|---|
| C1 | `_shared/documentos-de-ingreso.ts`: el catálogo de 2.1 (clave, texto, qué indicio corrobora, por tipo de persona). `paraConfirmar` y `DOCUMENTO_POR_TIPO` pasan a leerlo sin cambiar un texto de pantalla | Paridad: los textos de `paraConfirmar` en las 3.766 personas, iguales antes y después | A13 | Haiku |
| C2 | `armarIngresoAdicional()` en `escalera-del-ingreso.ts`: validado, indicios, fuerza, coincidencia, materialidad, parte respaldada (1.3 a 1.5), en `IngresoDelPerfil` | Un caso inventado por tipo de persona; invariantes: nunca suma indicios, el declarado sin respaldo nunca es respaldado, la renta corroborada es fuerte, sin validado el adicional es el indicio entero | A1 a A5, A12 | Sonnet |
| C3 | En `evaluarEscalera()`: `faltaParaLoPedido`, `conElAdicional`, `conLoRespaldado`, la mejora desde el adicional y las frases de 3.3 | El ejemplo de 3.2 como prueba; paridad del veredicto, la oferta y la capacidad máxima con `capacidad-v6` en las 3.766 | C2, A6 | Sonnet |
| C4 | `medir-ingreso-adicional.mjs` llama a C2 en vez de su copia de la regla | Las cifras de la sección 5, iguales | C2 | Haiku |
| C5 | `_shared/monto-del-documento.ts`: de las cifras anotadas al ingreso mensual y al aceptado, por tipo (2.4), con la vigencia | Un caso por documento; los estados de cuenta con un mes extraordinario, una cuenta conjunta y un negocio | A7 a A9 | Opus |
| C6 | D8: la tabla `documentos_de_ingreso` (2.5) y el peldaño 2 que lee de ahí con C5; `cubre` suma o reemplaza | Migración por el corredor recién fusionada; RLS; `suprimir_titular()`, `derechos-del-titular.mjs`, `auditar-seguridad.mjs` | C5, A11 | Sonnet |
| C7 | La política: `sustento_de_ingreso` con `llevaAdicional` y la tabla de 3.4 en la matriz del estándar | Un caso por fila de 3.4 | C3, A10 y la matriz del estándar en código | Sonnet |
| C8 | La especificación de la API (`api/openapi.yaml`, bloque `ingreso`), la pantalla de la solicitud (tarjeta «Validado / Por corroborar») y la carga del documento | Redocly estricto; `revisar-textos.mjs`; revisión de UX con captura a 1280, 768 y 414 | C3, C6, A13 | Sonnet |
| C9 | El adicional en el perfil del modelo, con la versión mayor del marco | El banco de casos de oro; el modelo sólo con autorización y costo | C3 y la versión mayor del marco | Opus |

C1 y C5 no dependen de nada construido y pueden correr a la vez; C2 y C3 van seguidas. La escalera
sigue sin conectar: C3 tampoco cambia lo que hoy ve la institución hasta que el negocio la encienda.

---

## 8. Lo que no resuelve

- **No sabe si el adicional es verdad.** Es lo que las fuentes sugieren; lo prueba un documento.
  Hasta que haya documentos anotados no se puede medir qué tan seguido el documento confirma el
  adicional, ni calibrar la fuerza.
- **Las fracciones de los documentos** (70% del IVA, 50% del negocio en la cuenta, 50% del
  certificado) son elecciones, no mediciones.
- **Lo declarado está casi sin medir** (1 persona con Ingreso declarado en la base).
- **El predictor sobre un sueldo** no existe, y medido no conviene (A14, 6.1): el ejemplo literal del
  negocio no tiene hoy de dónde salir. El intento con la etiqueta por componente está en
  `docs/propuesta-adicional-del-dependiente.md`; si no pasa, hacen falta documentos anotados (D8).
- **Con buró no se midió** (sección 4).
- **El ingreso del hogar** sigue fuera, como en la escalera.
