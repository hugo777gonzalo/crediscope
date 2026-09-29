# Panorama de Fuentes de ingreso: "Calidad de la evidencia" y "Clientes que necesitan respaldo"

Análisis y propuesta del 2026-09-29, pedidos por el negocio. **No hay nada
implementado**: la propuesta espera las respuestas de la sección 3, que salen
de la experiencia del negocio. Los números son de la base ese día; antes de
implementar, volver a medirlos.

"Reales" son los 2.567 clientes reales. Las 240 cédulas sintéticas de Aval
son las que tienen su último perfil en estructura-v3 (ver `docs/pendientes.md`).

## 1. "Calidad de la evidencia"

### Qué mide hoy

Cada fuente de ingreso que detecta `fuentes-ingreso.ts` lleva una marca de
quién declara el monto (`CalidadEvidencia`):

| Marca | Qué significa | Etiqueta en pantalla | Fuentes |
|---|---|---|---|
| `reportada_por_tercero` | Un empleador declara y paga aportes sobre ese monto | Empleador privado, público, diplomático, externo u otros | 1.273 |
| `autodeclarada_sobre_minimo` | La persona eligió su base de aporte, por encima del SBU | Empresa propia o afiliación voluntaria, más que el SBU | 139 |
| `autodeclarada_en_minimo` | La persona eligió su base, en el SBU | Empresa propia o afiliación voluntaria | 325 |
| `indirecta` | Consta que existe (RUC activo, nómina, jubilación, pensión), sin monto | Sin monto: consta que existe | 2.049 |

`resumen_fuentes_ingreso()` suma esas marcas sobre todas las fuentes del
último perfil de cada cliente, y la tabla muestra la suma. Son 3.786 fuentes
de 2.807 clientes.

### Por qué no se entiende

1. **La unidad es la fuente, no la persona.** Un empleado público con RUC y
   nómina suma tres filas. La nota "Cuenta fuentes, no personas" lo avisa,
   pero la pregunta de quien mira es por personas.
2. **"Sin monto" es la fila más grande (2.049) y no es evidencia mala.** Casi
   siempre es otra fuente además de la principal: la jubilación de un
   jubilado confirmado, o el RUC de alguien que ya tiene empleo.
3. **Repite, con otra unidad y sin enlaces, la pregunta de la barra de
   arriba** ("Qué tan firme es cada clasificación").
4. El título dice "calidad", pero desde el 2026-09-26 las etiquetas dicen
   **quién declara**. Y cuenta 13 fuentes de las sintéticas.

### La pregunta que sí sirve para crédito

¿De cuántos clientes el ingreso lo respalda alguien que no es la propia
persona? Por persona, con la mejor evidencia que tiene cada uno (reales):

| Mejor evidencia de la persona | Personas | % |
|---|---|---|
| Un empleador declara el monto | 1.201 | 46,8 |
| Aporta por su cuenta, más que el SBU | 129 | 5,0 |
| Aporta por su cuenta, en el SBU | 305 | 11,9 |
| Sólo consta que existe, sin monto | 878 | 34,2 |
| Ninguna fuente | 54 | 2,1 |

### Propuesta

- Reemplazar la tabla por esa escalera **por persona**, con un enlace a la
  lista de cada escalón y sin las sintéticas.
- Ubicarla junto a "Qué tan firme es cada clasificación". Si el negocio
  prefiere una sola vista, la escalera puede reemplazar a esa barra: dice lo
  mismo con más detalle.
- El nombre lo decide el negocio. Opciones: "Quién respalda el ingreso",
  "Respaldo del ingreso".
- Implementación: se cuenta en la base (`resumen_fuentes_ingreso()`,
  migración 090) y la lista de clientes necesita el filtro por escalón.

## 2. "Clientes que necesitan respaldo"

### Qué mide hoy

Cuenta a los clientes cuyo último perfil **no** está "Confirmado por un
tercero" y tiene al menos un documento en `paraConfirmar`. Hoy son 1.343:
1.325 reales y 18 sintéticas. Muestra los 50 más recientes con su segmento,
el motivo y la lista de documentos.

### Diagnóstico (reales)

- **Segmentos:**
  - independiente: 1.080 (82%);
  - jubilado con ingreso adicional: 134;
  - informal o sin actividad: 45;
  - dependiente privado: 22;
  - público (militares y policías en servicio activo): 17;
  - ingresos mixtos: 13;
  - agrícola: 9;
  - no clasificado: 4;
  - trabajo del hogar: 1.
- **Documentos que pide:**
  - declaraciones de IVA o facturación: 956;
  - movimientos bancarios: 449;
  - certificado de afiliación del IESS: 309;
  - comprobante de pensión del IESS: 121;
  - "preguntar de qué vive": 45;
  - rol de pagos de FF.AA. o Policía: 16;
  - pensión del ISSFAC o ISSPOL: 13.

  741 personas tienen un documento y 584 tienen dos.
- **No es una lista para trabajar.** Sólo 21 de los 1.325 tienen algún
  análisis: casi todos son la cartera consultada en lote, no gente que está
  pidiendo un crédito. Y como todos los perfiles son de la reconsulta de
  septiembre, "los 50 más recientes" no ordena por nada útil.
- **Dónde el respaldo rinde más:** 433 de los 1.325 tienen un indicio de
  ingreso mayor. Es donde pedir documentos tiene más probabilidad de mostrar
  más capacidad de pago que lo reportado.
- **Huecos de la regla:**
  - 13 personas sin confirmar no tienen ningún documento sugerido. 8 son
    dependientes privados con vínculo vigente pero sin monto: no se les pide
    rol de pagos ni historia laboral del IESS.
  - 670 confirmados tienen un documento sugerido y quedan fuera de la
    lista. Por ejemplo, el comprobante de pensión de un jubilado.
- **El documento de los independientes no siempre existe.** Según el SRI,
  los negocios populares del RIMPE (hasta USD 20.000 de ingresos al año)
  **no presentan declaraciones de IVA**: la cuota que pagan lo incluye.
  Los emprendedores (hasta USD 300.000) presentan **dos declaraciones
  semestrales**. "Declaraciones de IVA de los últimos 6 meses" sólo existe en
  el régimen general. Hoy no sabemos el régimen de cada cliente (pendiente
  con Novadata: ¿expone el RIMPE?).

### Marco oficial

- **SEPS / Junta:** la "Norma para la Gestión del Riesgo de Crédito en las
  Cooperativas de Ahorro y Crédito y Asociaciones Mutualistas de Ahorro y
  Crédito para la Vivienda" exige un proceso formal de otorgamiento,
  seguimiento y recuperación. Ver la resolución
  SEPS-IGT-IGS-INSESF-INR-INGINT-2023-0225 (agosto de 2023).
  **Pendiente de verificar:** los PDF oficiales no tienen texto que se pueda
  extraer, así que no se leyeron los artículos sobre expediente, capacidad
  de pago y verificación in situ. No citarlos hasta leerlos.
- **SRI:** la página del RIMPE y sus preguntas frecuentes (sri.gob.ec/rimpe).

### Prácticas del sector (a validar con el negocio, no son norma citada)

- **El respaldo depende del tipo de crédito.**
  - En consumo se respalda el ingreso de la persona: rol de pagos,
    certificado laboral, historia laboral del IESS.
  - En microcrédito se evalúa el negocio: visita in situ, levantamiento de
    ventas y costos, facturas o notas de venta, estados de cuenta.
- **Preferir lo verificable en línea**, con la autorización del cliente:
  certificado de aportes o historia laboral del IESS, RUC y comprobantes
  electrónicos en el SRI.
- **Los documentos se piden al solicitar el crédito**, con una vigencia
  máxima y en proporción al monto.

### Propuesta de pantalla

1. **La primera vista, por documento y no por persona:** "Qué pedir y a
   cuántos". Cada fila es un documento, con cuántos clientes lo necesitan y
   el enlace a quiénes son. Reemplaza la tabla de 50 filas con texto largo.
2. **Prioridad.** Arriba, quienes tienen una solicitud o un análisis
   reciente y quienes tienen un indicio de ingreso mayor. El resto de la
   cartera, plegado.
3. **El documento según el régimen tributario y el tipo de crédito.**
   Necesita saber si Novadata expone el RIMPE y las respuestas de la
   sección 3.
4. **Arreglos de la regla, que no dependen del diseño:**
   - sacar a las sintéticas;
   - tapar los 13 sin documento (dependiente con vínculo sin monto: historia
     laboral del IESS o rol de pagos);
   - decidir si los confirmados con documento entran.
5. **Más adelante**, con la fábrica de crédito (en pausa): seguimiento de
   cada documento (pedido, recibido, verificado).

El título y los nombres los decide el negocio.

## 3. Preguntas para el negocio

1. ¿Qué productos dan las cooperativas objetivo (consumo, microcrédito
   minorista o de acumulación) y en qué rangos de monto?
2. Hoy, ¿qué documentos piden para cada tipo de cliente: dependiente,
   independiente con RUC, negocio popular, informal, jubilado, militar o
   policía?
3. ¿Desde qué monto se exige respaldo de ingresos? ¿Un crédito chico se
   aprueba sólo con buró?
4. ¿Qué vigencia máxima aceptan para cada documento?
5. ¿Aceptan certificados en línea (IESS, SRI) en lugar de papel?
6. ¿Hacen visita in situ en microcrédito? ¿Quién la hace y qué se registra?
7. ¿Esta sección tiene que mostrar a toda la cartera, o sólo a quienes
   están solicitando un crédito?
8. ¿A un confirmado con documento sugerido (jubilado, con RUC además del
   empleo) se le pide respaldo?
