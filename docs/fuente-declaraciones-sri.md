# Fuente de las declaraciones del SRI: diseño

Pedido del negocio del 2026-11-27, después de la sesión 3 del adicional del dependiente: ir a la fuente del monto real.
Sus palabras: «procede, tenemos la autorización de las personas».
Es investigación y diseño, sin código y sin conectar nada. No se consultó a Equifax ni a Proveedor_Info_1, no se usó el modelo de
lenguaje y no se escribió en la base. Lo medido sale de los CSV de AWS que ya estaban bajados (sección 1.2) y lo legal, de los textos
de las normas (sección 4). Las fuentes están al final, con la fecha en que se leyeron.

## 0. Resumen

- **No hay una vía oficial para que un tercero reciba las declaraciones de una persona.** El art. 99 del Código Tributario y el art.
  101 de la Ley de Régimen Tributario Interno las hacen reservadas, sólo «para los fines propios de la administración tributaria».
  - El SRI tiene un trámite para que una persona jurídica privada pida un convenio de intercambio automatizado (SRI-027-01-01). No dice
    qué información entrega, y nada en la norma leída habilita a entregar declaraciones a una institución financiera.
  - Ningún proveedor conocido trae las declaraciones de una persona natural:
    - Proveedor_Info_1 trae el impuesto a la renta causado por año, que es casi siempre vacío en la cartera;
    - Equifax trae el RUC y, en sus productos de empresas, una «tendencia de ventas» del SRI que no se sabe si cubre a personas naturales.
- **La vía que existe hoy es que la persona baje sus declaraciones del SRI en línea y se las entregue a la institución.** La reserva
  obliga al SRI, no al contribuyente: la persona puede mostrar lo suyo. Es la vía que ya previó D8: la institución anota las cifras,
  el código calcula y se guarda la huella, nunca el archivo.
  - Cuesta cero y tarda minutos si la persona tiene su clave, que es obligatoria para declarar.
  - Lo firma la persona: la autorización. CrediScope nunca entra al SRI ni toca la clave de nadie.
  - El SRI publica una página para validar declaraciones y certificados por su código QR. Con ella, la institución comprueba que el
    PDF es auténtico, a mano y sin evadir nada.
- **En la escalera ya tiene lugar**: es el peldaño 2 («verificado con documento»), con `cubre = otro_ingreso`, y se suma al sueldo.
  Las reglas de monto ya las decidió el negocio el 2026-11-22: A8 para el IVA y 2.4 para la renta. Este diseño agrega tres cosas:
  - qué parte de la renta es la actividad y no el sueldo;
  - la vigencia de quien declara el IVA cada semestre, que hoy quedaría vencido casi todo el año;
  - qué hacer con una declaración en cero.
- **Recomendación**:
  1. Pedir la declaración como requisito (Aprobado con Requisitos, decisión A10) al dependiente con RUC activo cuando el sueldo no
     alcanza.
  2. Construir el registro de D8 (tareas C1 a C5 de `docs/ingreso-adicional-por-corroborar.md`).
  3. Hacer un piloto de 400 personas con una institución, para medir por fin el adicional real.
  4. En paralelo, y sin esperar la respuesta, preguntar por escrito al SRI, a Proveedor_Info_1 y a Equifax.
  5. Lo que tiene que conseguir el negocio es un texto de autorización ampliado y una cláusula en el contrato de encargo (sección 4.4).
     La autorización de hoy no alcanza para usar las declaraciones para medir.

## 1. Por qué la declaración

### 1.1 Lo que falta

Tres sesiones de modelado (PR #218, #219 y #225; `docs/propuesta-adicional-del-dependiente.md`, secciones 6 a 8) mostraron lo mismo:
- **El monto del adicional se aprende**: R² de 0,35 en logaritmo.
- **Quién lo tiene no se aprende**: con el RUC reconstruido del catastro, el AUC con RUC activo llega a 0,69 y lo mostrado no pasa
  de 12% comprobable, contra una meta de 70%.

El negativo mezcla a quien no tiene adicional con quien no lo documentó, y eso no se arregla con más datos de AWS: en AWS casi nadie
documentó el adicional (1.2). La declaración contesta las dos preguntas a la vez, si hay actividad y cuánto vende, y la contesta una
fuente oficial y no la persona.

### 1.2 La población y lo que hizo AWS (medido el 2026-11-28)

**Dependientes con sueldo recuperado del IESS y RUC activo** (la tabla de la sesión 1 cruzada con el bloque SRI de Equifax; 2026):

| | |
|---|---|
| Con bloque SRI | 12.986 |
| Con RUC activo | 3.874 (29,8%) |
| Clase RIMPE / otras (régimen general) | 1.236 (31,9%) / 2.638 (68,1%) |
| Obligados a llevar contabilidad | 25 (0,6%) |
| Sección del CIIU | M profesionales y técnicas 1.183 (30,5%), S otros servicios 663, G comercio 533, Q salud 452, P enseñanza 292 |
| Con adicional material (cualquier origen) | 42,7% en RIMPE, 37,7% en el resto |
| Origen del adicional material | declarado 1.051, cuentas o IVA 262, IESS no recuperado 119, predictor 84 |

- Casi todos son **no obligados**: declaran el IVA en el 104 y la renta como persona natural no obligada.
- **Uno de cada tres es RIMPE.** El negocio popular no declara IVA y paga la renta con una cuota fija, así que su declaración no dice
  el monto. Para él la vía es otra: los estados de cuenta, como ya dice 2.3 del adicional.
- **Uno de cada tres es un profesional** (sección M). Sus ventas son honorarios, casi sin compras.

**Cómo usó AWS la declaración de IVA** (`ingresos_por_actividad.csv`, 306.080 flujos activos):
- **Casi nunca para el extra de un dependiente.** De 99.072 dependientes y públicos (actividad principal), 25.030 tienen un flujo
  secundario activo. Se apoyan en:
  - sólo lo declarado: 10.763;
  - movimientos bancarios: 1.450;
  - una declaración de IVA: **77**, el 0,3%.
- **IVA mensual** (1.863 flujos): el ingreso es el promedio de las ventas por la rentabilidad de la macroactividad.
  - Coincide exacto en el 61,4%.
  - Usa 3 meses en el 84%.
  - Las rentabilidades más usadas son 0,30 (1.097), 0,70 (403) y 0,40 (297).
- **IVA semestral** (652 flujos): el ingreso es las ventas del semestre por la rentabilidad, divididas por 6.
  - Coincide exacto en el 54,9%. Es la «razón de 0,05 a 0,07» que `docs/base-aws-originacion.md` dejó sin explicar.
  - Usa un semestre en el 70%.
- AWS no guarda las compras, así que la regla decidida en A8 ((ventas − compras) al 70%) no se puede comparar contra AWS. Se mide con
  los primeros documentos (sección 6).

Guiones: `medir_iva.py` y `medir_regimen.py`, en la carpeta temporal de la sesión, fuera del repositorio. Leen los CSV de
`research/ingresos-aws/` y la tabla de la sesión 1, y sólo imprimen agregados.

## 2. Qué dice cada declaración

| Documento | Quién lo presenta | Cada cuánto | Qué trae que sirva |
|---|---|---|---|
| IVA (formulario 104) | Quien tiene RUC y vende con IVA o tarifa 0%, salvo el RIMPE negocio popular | Mensual. Semestral para el RIMPE emprendedor, quien sólo vende con tarifa 0%, a quien le retienen el 100% del IVA y los artesanos calificados | Ventas y compras del período por tarifa: la actividad aparte del sueldo, porque el sueldo no pasa por el 104 |
| Impuesto a la renta, persona natural | Toda persona natural con ingresos sobre la fracción básica | Anual, en marzo, según el noveno dígito | Ingresos por fuente (relación de dependencia, actividad, arriendos), costos y gastos, base imponible e impuesto causado |
| Renta del RIMPE emprendedor | El emprendedor | Anual | Ingresos brutos de la actividad: la tarifa va sobre ellos |
| Renta del RIMPE negocio popular | El negocio popular | Anual | Una cuota fija: no da el monto |
| Comprobantes electrónicos emitidos (XML) | Quien factura | Cada venta | El detalle de cada factura; sumados, las ventas |
| Certificado de historial del RUC | Cualquier contribuyente, en SRI en línea | Cuando se pide | Estado, actividades, suspensiones y reinicios: lo que el catastro no muestra (sección 8.2 de la propuesta) |

**Desde junio de 2026 la declaración del IVA y el pago son simultáneos**: una declaración sin pago no tiene validez (El Comercio).
Para este diseño, una declaración presentada ya está pagada.

**Sin verificar**, porque las páginas públicas no lo dicen y no se entró al SRI en línea:
- **El número del formulario de renta.** El trámite de gob.ec adjunta un «Formulario 101» de 2018; se los conoce como 102 y 102A.
- **Qué casilleros separan la actividad del sueldo.**
- **Cómo se baja una declaración ya presentada.** La ruta y el PDF con QR no aparecen en la ayuda pública.
- **Si un RIMPE con sueldo declara el sueldo aparte.**

Se confirma con una persona voluntaria que baje sus propias declaraciones, sin que nadie más entre a su cuenta (sección 7, D-SRI-9).

## 3. Las vías

### 3.1 Resumen

| Vía | Qué trae | Frecuencia | Costo | Tarda | Quién firma qué | Automatizable sin evadir barreras | Veredicto |
|---|---|---|---|---|---|---|---|
| **A. Convenio con el SRI** (trámite SRI-027-01-01) | No se sabe: el trámite no dice qué información se intercambia | La del convenio | El trámite es gratis | Meses, y sin plazo publicado | El representante de la institución o de CrediScope firma la solicitud; el SRI decide | Sí, si existe | **Improbable** para declaraciones, por la reserva (4.1). Preguntar igual |
| **B. Proveedores** | Proveedor_Info_1: el impuesto causado por año. Equifax: el RUC, y en empresas la «tendencia de ventas» | Por consulta | El de cada contrato | Días, si ya lo tienen | La autorización de siempre | Sí (es una API) | **No trae ventas ni ingresos de personas naturales** hasta donde se sabe. Preguntar por escrito |
| **C. La persona entrega los PDF** (104 de 6 meses o 2 semestres y la renta del último año) | Todo lo de la sección 2 | Cada solicitud | Cero | Minutos con la clave; sin clave, recuperarla tarda | La persona: la autorización y la entrega | La entrega y la lectura de las cifras, sí; la validación del QR, a mano mientras el SRI no diga otra cosa | **La vía de hoy** |
| **D. La persona entrega los XML de sus facturas** | Las ventas factura por factura | Cada solicitud | Cero | Depende de su sistema de facturación | La persona | La lectura, sí | Complemento de C para quien declara cada semestre (3.5) |
| **E. Lo público** | Catastro del RUC (mensual) e impuesto causado vía Proveedor_Info_1 | Mensual o por consulta | Cero o el de Proveedor_Info_1 | Ya está | Nadie: es de acceso público (LOPDP, art. 7.7) | Sí | **No trae ventas.** Sirve para comprobar C |
| Descartadas (3.6) | | | | | | No | |

### 3.2 A. Convenio con el SRI

- **El trámite existe**: «Acuerdos, convenios o instrumentos legales, en el ámbito nacional, para habilitar el intercambio de
  información de forma automatizada» (SRI-027-01-01).
  - Va dirigido a personas jurídicas públicas y privadas y no tiene costo.
  - Se pide en ventanilla, por Quipux o por SRI en línea, con una «solicitud de nuevos acuerdos… en base a la normativa vigente».
  - Su base legal es la LOTAIP (art. 6) y la Constitución (art. 226). No menciona la reserva, el sistema financiero ni la autorización
    del titular.
  - Su ficha registra unos pocos pedidos cada mes desde 2020.
- **Por qué es improbable que entregue declaraciones.** La reserva de las declaraciones (art. 101 de la LRTI) sólo tiene tres
  excepciones:
  - lo relacionado con paraísos fiscales;
  - la planificación fiscal agresiva;
  - las actas de determinación.

  Ninguna cubre la evaluación de un crédito. La autorización del titular tampoco figura como excepción. Un convenio así necesitaría
  una base que el SRI tendría que encontrar en otra norma: es una pregunta para el SRI y para el abogado, no algo que se pueda
  suponer.
- **El derecho a la portabilidad** (LOPDP, art. 17) no parece aplicar. Exige que el tratamiento se base en el consentimiento o en un
  contrato, y el SRI trata las declaraciones por obligación legal. Queda como pregunta para el abogado.
- **Lo que sí vale la pena pedir**: una respuesta escrita del SRI a dos preguntas, por el mismo trámite. Si llega un sí, se reemplaza
  la vía C sin cambiar la escalera.
  1. ¿Hay un instrumento para que una institución financiera, o su encargado, reciba con la autorización expresa del titular sus
     declaraciones de IVA y de renta?
  2. ¿Se puede usar en forma automatizada la página de validación por código QR?

### 3.3 B. Proveedores

- **Proveedor_Info_1** ya trae del SRI el contribuyente, sus establecimientos y el impuesto a la renta por año: `causado`, la parte en
  relación de dependencia y el formulario (`fuentes-ingreso.ts`, `impuestoRentaPorAnio`). Es el peldaño 3b, que despeja una base del
  impuesto.
  - En el lote medido, **sólo 4 personas tienen una renta reciente** (`docs/escalera-del-ingreso.md`, 3b).
  - No trae ventas ni ingresos.
  - Parece salir de lo que el SRI tiene que difundir cada año (art. 99: «los nombres de los sujetos pasivos y los valores que hayan
    pagado o no»), que no son las declaraciones.
- **Equifax** trae el bloque SRI: RUC, estado, clase, obligado, inicio y CIIU.
  - Su folleto del reporte de empresas nombra «Información SRI y comportamiento de impuestos».
  - El monitor de portafolio nombra una «tendencia de ventas» con fuente SRI.
  - No se sabe si eso existe para personas naturales, ni con qué base lo recibe. El folleto se vio en el buscador y no se abrió.
- **La reforma de los burós** (COMF, vigente desde el 14 de octubre de 2025) les deja usar datos de impuestos, servicios básicos y
  mercado de valores. Se refiere a obligaciones (pagar o no un impuesto), no a lo declarado. Según la prensa:
  - la regulación de la Junta todavía tenía que definir qué se reporta;
  - no está claro «si se reportará la información de la declaración de todo tipo de impuestos».
- **Lo que se pide**, por escrito y con la persona de contacto comercial de cada uno: si pueden entregar las ventas declaradas en el
  104 y los ingresos de la declaración de renta de una persona natural con su autorización, con qué base legal, a qué costo y con qué
  retraso.
  - No se consulta ninguna persona para probarlo.
  - Con Proveedor_Info_1 hay un canal abierto (pedido de la base del IESS y las deudas, 12.33).

### 3.4 C. La persona entrega sus declaraciones (la vía de hoy)

**El flujo propuesto**:
1. La institución pide el documento como requisito cuando el dependiente tiene RUC activo y el sueldo solo no alcanza (A10).
   - Qué se pide: los 104 de los últimos 6 meses, o los 2 últimos semestres si declara cada semestre, y la renta del último año
     exigible.
   - El RIMPE negocio popular no tiene 104: se le piden los estados de cuenta (2.3 del adicional).
2. **La persona baja los PDF del SRI en línea con su clave, en su dispositivo**, y los entrega a la institución.
   - Nadie más usa su clave.
   - Si no la tiene, la recupera en el SRI: es un trámite de la persona.
3. La institución **valida cada PDF en la página pública de validación por código QR del SRI**, a mano. Comprueba también que sea de
   la persona y del período.
   - Si la página tiene un captcha, se resuelve como cualquier usuario, a mano: nunca se automatiza ni se evade.
   - Si el SRI no responde que su uso automatizado está permitido (3.2), queda a mano.
4. La institución **anota las cifras** en el registro de D8 (`documentos_de_ingreso`, A11): el tipo, los períodos, las ventas y
   compras por mes o los ingresos, costos y gastos del año, y `cubre = otro_ingreso`. Se guarda la huella SHA-256 del archivo, nunca
   el archivo.
5. **El código calcula** el monto con la regla del documento (sección 5) y hace las comprobaciones automáticas:
   - el impuesto causado anotado contra el de Proveedor_Info_1, cuando existe (deben coincidir);
   - el RUC activo en los meses declarados, contra el catastro y el bloque de Equifax;
   - que los períodos sean seguidos y estén vigentes.

   Lo que no coincide sale como diferencia para revisar, no como rechazo.

- **Qué trae**: lo de la sección 2.
- **Frecuencia**: una vez por solicitud.
- **Costo**: cero.
- **Cuánto tarda**: minutos para quien tiene la clave. Antes de construir se mide en el piloto cuánta gente la tiene.
- **Quién firma qué**: la persona firma la autorización ampliada (4.4) y entrega los archivos; quien valida en la institución queda en
  `validado_por`.
- **Automatizable sin evadir barreras**: la entrega (un archivo en la solicitud), el cálculo y las comprobaciones, sí. La validación
  del QR, a mano por ahora. **CrediScope no entra nunca al SRI.**

**Leer el PDF en vez de anotarlo** (una opción para después). Que CrediScope lea las cifras del PDF y la institución sólo las
confirme ahorra trabajo. Pero cambia A11: el archivo pasa por CrediScope, aunque no se guarde. Se propone empezar anotando y decidirlo
con el piloto (D-SRI-2).

### 3.5 D. Los comprobantes electrónicos

- Para quien declara cada semestre, el último 104 puede tener hasta siete meses. Las facturas emitidas desde entonces actualizan las
  ventas.
- Los XML firmados son de la persona, que los tiene en su sistema de facturación o en el del SRI.
- Que cada factura esté autorizada se puede comprobar con su clave de acceso de 49 dígitos, en la consulta pública del SRI.
  - No se encontró la ficha técnica de un servicio web de consulta, así que no se propone usar ninguno.
  - Primero, preguntar al SRI (3.2).
- Es un complemento, no un reemplazo: las facturas dan ventas, no compras ni gastos.

### 3.6 Descartadas

- **Entrar al SRI en línea con la clave de la persona**, a mano o con un programa, y los agregadores que piden la clave del
  contribuyente para bajar sus datos. Lo prohíbe la regla de este trabajo y lo desaconseja el propio SRI, que alerta de fraudes con
  claves.
- **La autorización a terceros del SRI**: sirve para que un tercero haga trámites en ventanilla en nombre del contribuyente, no para
  consultar. Tampoco los «usuarios adicionales» de SRI en línea, que dan acceso al perfil de la persona: sería entrar a su cuenta con
  otra puerta.
- **Copias certificadas** (trámite de copias del SRI): las pide el titular, con su firma, y no hay plazo publicado. Si la persona quiere
  hacerlo, el resultado entra por la vía C; no es una vía para la institución.
- **La página de consulta del RUC del SRI con un programa**: tiene barreras contra robots. Para el RUC ya está el catastro de datos
  abiertos (sección 8.2 de la propuesta), que se baja una vez por mes.

## 4. El marco legal

Esto lo tiene que revisar el abogado del negocio. Es una lectura de los textos, no un dictamen.

### 4.1 La reserva tributaria

- **Código Tributario, art. 99** (texto vigente con la última reforma del 10-III-2022 en la edición leída; no se verificaron reformas
  posteriores):
  > «Las declaraciones e informaciones de los contribuyentes, responsables o terceros, relacionadas con las obligaciones tributarias,
  > serán utilizadas para los fines propios de la administración tributaria.»

  El mismo artículo manda difundir cada año los nombres de los contribuyentes y lo que pagaron o no.
- **LRTI, art. 101**, en su inciso sobre la reserva: las declaraciones «son de carácter reservado». Exceptúa sólo lo de paraísos fiscales, la
  planificación fiscal agresiva y las actas de determinación.
- **Lo que se lee**: la reserva es una obligación del SRI y de sus servidores. No hay en estos artículos una prohibición para que el
  contribuyente muestre sus propias declaraciones, y las instituciones ya las piden como requisito (por eso están en el catálogo de
  D8). Por eso la vía C no choca con el
  sigilo y la A sí.

### 4.2 La LOPDP

- **No es un dato sensible.** El art. 4 enumera los sensibles: etnia, identidad de género, identidad cultural, religión, ideología,
  filiación política, pasado judicial, condición migratoria, orientación sexual, salud, biométricos, genéticos, y los que puedan dar
  origen a discriminación. Lo tributario no está en la lista. No hace falta el consentimiento explícito del art. 26, pero sí uno
  válido.
- **La base legal**:
  - para evaluar la solicitud, la ejecución de medidas precontractuales a petición del titular (art. 7.5) o su consentimiento (art. 7.1);
  - para el catastro y lo que el SRI difunde, el tratamiento de datos de bases de acceso público (art. 7.7).
  - El art. 28 (datos crediticios) presume lícito el dato de solvencia que viene «de fuentes de acceso público» o del acreedor. Una
    declaración que entrega la persona no es ninguno de los dos: queda en la base del art. 7.
- **El consentimiento** (art. 8) tiene que ser libre, específico en medios y fines, informado e inequívoco. Si se pide para varias
  finalidades, «será preciso que conste que dicho consentimiento se otorga para todas ellas».
- **CrediScope es el encargado** (art. 34): trata los datos sólo según las instrucciones de la institución y «no los utilizará para
  finalidades diferentes a las señaladas en el contrato».

### 4.3 ¿Alcanza la autorización de hoy?

El texto modelo de autorización (`docs/cumplimiento/texto-de-autorizacion-del-titular.md`, fuera de git) autoriza a «consultar mi
información… tributaria (SRI y RUC)… en las fuentes de información que la Institución tiene contratadas, con la única finalidad de
evaluar mi solicitud de crédito».

- **Para evaluar la solicitud con la declaración que entrega la persona: casi.** No es una consulta en una fuente contratada, sino un
  documento que la persona entrega, y conviene decirlo. Hace falta una frase que nombre los documentos, los períodos, qué se guarda
  (las cifras y la huella) y quién los procesa.
- **Para medir el adicional real, que es lo que pidió el negocio: no.** Usar las cifras de muchas personas para calibrar las reglas
  de CrediScope es una finalidad distinta de evaluar la solicitud. Por el art. 34, un encargado no puede tenerla sin que conste en el
  contrato. Y por el art. 8, la persona tiene que consentirla por separado. Las salidas, en orden:
  1. una cláusula en el contrato de encargo que instruya a CrediScope a usar las cifras, sin identificadores, para mejorar las reglas
     de ingreso de la institución, más una casilla separada en la autorización;
  2. que la institución mida, sobre sus propios datos, y entregue sólo agregados;
  3. medir sólo con lo que ya existe, que es lo que no alcanzó.
- **La declaración del negocio** («tenemos la autorización de las personas») vale para la evaluación, si la autorización firmada se
  parece al texto modelo. Para la medición, hay que ver el texto que firmaron: no se vio.

### 4.4 Texto propuesto para la autorización (borrador para el abogado)

Se agrega al texto modelo, después del punto 1:

> **Documentos tributarios.** Entregar, para evaluar mi solicitud, mis declaraciones del impuesto al valor agregado de [los últimos
> seis meses / los dos últimos semestres] y del impuesto a la renta del año [año], que yo mismo obtengo del Servicio de Rentas Internas.
> La Institución comprobará su autenticidad en el sitio del SRI y registrará sus cifras. Ni la Institución ni su encargado conservarán
> los archivos: conservarán las cifras y una huella que permite reconocerlos. Nadie más que yo usará mi clave del SRI.
>
> ☐ **Mejora de las reglas de evaluación** (opcional, no condiciona mi solicitud). Autorizo además que esas cifras, sin mi nombre ni mi
> identificación, se usen para medir y mejorar las reglas con que se estima el ingreso en las evaluaciones de crédito.

Y en el contrato de encargo, una instrucción de la institución a CrediScope con esa misma finalidad, limitada a quienes marcaron la
casilla.

## 5. Cómo entra a la escalera

### 5.1 Dónde

- Es el **peldaño 2, «verificado con documento»** (`docs/ingreso-adicional-por-corroborar.md`, 1.1), con `cubre = otro_ingreso`.
  - Se suma al peldaño 1, el sueldo neto: la declaración cubre una actividad aparte.
  - Sostiene el cálculo y quita el «por corroborar» de ese adicional.
- **No es un peldaño nuevo.** El nombre de pantalla puede ser «Adicional con declaración» (lo decide el negocio, D-SRI-8), pero en el
  código es un documento más de D8: `declaracion_de_iva` y `declaracion_de_renta` ya están en el catálogo (2.1).
- **El adicional que da** es el monto del documento al porcentaje aceptado. La señal sin monto de A14 («tiene RUC activo: puede tener
  ingresos que no constan») cambia:
  - deja de mostrarse si la declaración está vigente;
  - con la declaración en cero, cambia por otra (5.4).

### 5.2 La regla de cálculo

**IVA** (A8, decidida el 2026-11-22):
- El ingreso mensual es el promedio de (ventas netas − compras netas), al 70%.
- Se usan los meses que cubren los últimos 6. Quien declara cada semestre: los 2 últimos semestres, cada uno dividido por 6.
- Los meses en cero entran al promedio: son meses reales sin ventas.
- Si las compras pasan a las ventas en un mes, ese mes da 0, no negativo: una compra grande de inventario no es una pérdida del
  ingreso.

**Renta** (2.4, decidida el 2026-11-22): (ingresos − costos y gastos) / 12, al 100%. Para el dependiente hay que quitar el sueldo:
- Si la declaración separa los ingresos por fuente: sólo la actividad (y los arriendos, si los hay) menos sus costos y gastos.
- Si no se pueden separar: (base imponible − sueldo anual neto de la declaración) / 12, con el sueldo de la sección de relación de
  dependencia. Nunca con el del IESS de hoy, que es de otro período.
- El impuesto causado anotado se compara con el de Proveedor_Info_1 cuando existe.

**Cuando están las dos:**
- **Manda la renta**, que es neta y del año entero.
- **El IVA la actualiza hacia abajo**: si el monto del IVA de los últimos 6 meses queda por debajo del 70% del de la renta, manda el
  IVA, con un aviso «la actividad bajó desde la última declaración de renta».
- Nunca hacia arriba: un semestre bueno no reemplaza un año medido.

Es propuesta sin medir (D-SRI-6).

**Por qué no la regla de AWS** (ventas por la rentabilidad de la macroactividad: 0,30, 0,40, 0,70 o 1,00):
- El negocio dijo el 2026-10-26 que esas rentabilidades son genéricas y no nacen de una metodología (12.27).
- A8 eligió restar las compras.
- **En un profesional las dos dan casi lo mismo**: sin compras, A8 da ventas × 0,70, igual que la rentabilidad de servicios
  profesionales.
- **En el comercio pueden diferir.** Se mide con los primeros documentos: el seco de la sección 6 calcula las dos.

### 5.3 Cuando la declaración es vieja

- **IVA mensual**: el último mes declarado tiene que ser de 60 días o menos (2.4).
- **IVA semestral: la vigencia de 2.4 lo dejaría vencido casi todo el año.** Un semestre se declara en julio o enero y su último mes
  ya tiene 30 días. Propuesta: vigente mientras sea el último semestre exigible, más 60 días.
  - Primer semestre (enero a junio): vale hasta fines de marzo.
  - Segundo semestre: vale hasta fines de septiembre.
  - Con las facturas (3.5) se puede ver si la actividad sigue.
- **Renta**: el último año exigible, el anterior al año en curso; hasta mayo vale también el de antes (2.4).
- **Vencida**: no es peldaño 2. Si es una renta con impuesto mayor que USD 100 y de hace dos años o menos, sigue siendo indicio por el
  peldaño 3b, como hoy. La pantalla pide la declaración nueva.

### 5.4 Cuando la declaración está en cero

- **Los 6 meses del IVA (o los 2 semestres) en cero, y la renta sin ingresos de la actividad**: el adicional con documento es 0.
  - La señal de A14 cambia a «declara sin ventas en el SRI» (nombre a decidir, D-SRI-7).
  - Es información: un RUC activo sin ventas es frecuente (quien lo abrió para facturar alguna vez).
  - No resta del sueldo y no es una alerta de riesgo.
- **Algunos meses en cero**: entran al promedio (5.2). Si el último trimestre está en cero y antes no, sale un aviso «sin ventas en
  los últimos tres meses».
- **IVA en cero y renta con ingresos de la actividad**: manda la renta, pero con el aviso. Puede ser una actividad sin IVA, por
  ejemplo con tarifa 0% declarada aparte, o un error de la persona: lo mira el analista.
- **RIMPE negocio popular**: no tiene 104 y su renta es una cuota fija. Sin estados de cuenta, se queda la señal de A14.

## 6. Cómo sirve para medir (el piloto)

- **Lo que se mide.**
  1. Qué parte de los dependientes con RUC activo tiene una actividad con ventas.
  2. Cuánto da, sobre el sueldo.
  3. Cuánto se parece a lo que hoy dice la persona (lo declarado) y a lo que estimó el modelo de las sesiones 2 y 3.
  4. A8 contra la regla de AWS, en seco.
  5. Cuántos tienen la clave y cuánto tarda la entrega.
- **El tamaño.** Con 400 dependientes con RUC activo, la proporción con adicional queda con ±4,8 puntos al 95% (con p = 0,4).
  - En la institución de AWS, la tabla de la sesión 1 tiene 3.865 en lo que va de 2026, del orden de 350 a 400 por mes: un mes de
    solicitudes.
  - **El piloto no puede pedir la declaración sólo cuando el sueldo no alcanza**: esa población elige la respuesta (sección 8.1 de la
    propuesta). Se pide a todos los dependientes con RUC activo del período, con la casilla de medición marcada.
- **Lo que no hace falta.** Volver al modelo. Si el piloto confirma que la declaración llega en minutos, el producto pide el
  documento cuando sirve y no necesita adivinar quién tiene el adicional.
  - Con el piloto se puede medir de nuevo R3 con una etiqueta limpia. La decisión de A14 no depende de eso.
- **Lo que guarda el piloto**: las cifras y las huellas en `documentos_de_ingreso` y el agregado en `docs/`. Ninguna cédula en nada
  escrito: un caso se cita como `c-xxxxxxxx`.

## 7. Recomendación y decisiones del negocio

**La recomendación.** La vía C ahora, con la autorización ampliada y la cláusula del contrato de encargo, y un piloto de 400 en una
institución. En paralelo, cartas al SRI, a Proveedor_Info_1 y a Equifax, sin esperarlas. Lo que hay que construir ya estaba diseñado y
decidido (D8, A8, A10 y A11, tareas C1 a C5). Lo nuevo es la sección 5 y la casilla de medición.

| # | Decisión | Opciones | Recomendación |
|---|---|---|---|
| D-SRI-1 | La vía | (a) La persona entrega sus declaraciones (C); (b) esperar un convenio o un proveedor | **(a)**: es la única que existe hoy y no choca con la reserva; (b) se pregunta en paralelo |
| D-SRI-2 | Quién pasa las cifras | (a) La institución las anota (A11, como está); (b) CrediScope las lee del PDF y la institución confirma | **(a)** en el piloto; (b) se decide con lo que tarde anotar, porque el archivo pasaría por CrediScope |
| D-SRI-3 | La validación del PDF | (a) A mano, con la página de validación por código QR del SRI; (b) automática | **(a)**; (b) sólo si el SRI responde por escrito que se permite y sin evadir un captcha |
| D-SRI-4 | La autorización | (a) El texto de 4.4 con la casilla de medición, revisado por el abogado; (b) la de hoy | **(a)**: la de hoy no cubre la medición (4.3) |
| D-SRI-5 | El contrato de encargo | (a) Una instrucción de la institución para medir con las cifras sin identificadores; (b) que mida la institución | **(a)**, limitada a quien marcó la casilla |
| D-SRI-6 | Renta e IVA juntas | (a) Manda la renta y el IVA sólo la baja (5.2); (b) el mayor; (c) el menor siempre | **(a)**: la renta es neta y anual, el IVA es más reciente |
| D-SRI-7 | Declaración en cero | (a) Adicional 0 y la señal «declara sin ventas en el SRI» (5.4); (b) sigue la señal de A14 | **(a)**; el nombre lo decide el negocio |
| D-SRI-8 | El nombre de pantalla | «Adicional con declaración» u otro | Lo decide el negocio |
| D-SRI-9 | Confirmar lo no verificado (sección 2) | Una persona voluntaria baja sus propias declaraciones y las muestra, con los datos tapados en lo que se escriba | Antes de construir C5: dice qué casilleros anotar |
| D-SRI-10 | Las cartas | Al SRI (trámite SRI-027-01-01: convenio y uso automatizado del QR), a Proveedor_Info_1 y a Equifax (ventas e ingresos declarados con autorización) | Mandarlas; las firma el negocio. CrediScope no contacta a nadie |
| D-SRI-11 | El IVA semestral | (a) Vigente mientras sea el último semestre exigible, más 60 días (5.3); (b) la regla de 2.4 | **(a)**: con (b) un emprendedor nunca tendría una declaración vigente |

## 8. Lo que no se verificó

- El texto del art. 99 es el de la edición con reformas hasta el 10-III-2022. No se buscaron reformas posteriores en el Registro
  Oficial.
- Qué dice el trámite SRI-027-01-01 sobre el contenido del intercambio: su ficha no lo dice.
- La ruta para bajar una declaración presentada y si su PDF trae el código QR. La página de validación existe, pero no se abrió.
- Los casilleros de los formularios y el número del de renta (sección 2).
- Si la «tendencia de ventas» de Equifax cubre a personas naturales.
- Qué traen las autorizaciones que de verdad firmaron las personas de la cartera.
- Cuántos dependientes con RUC activo tienen su clave del SRI.

## Fuentes

Leídas el 2026-11-27 y el 2026-11-28.

- Código Tributario, codificación 2005-09, Suplemento del RO 38 del 14-VI-2005, edición con reformas hasta el 10-III-2022, art. 99:
  https://www.emov.gob.ec/wp-content/uploads/2022/09/C%C3%93DIGO%20TRIBUTARIO.pdf
- Ley de Régimen Tributario Interno, edición con reformas hasta el 20-VI-2023, art. 101:
  https://www.dspace.espol.edu.ec/bitstream/123456789/57699/1/4.-%20Ley%20de%20Re%cc%81gimen%20Tributario%20Interno.pdf
- Ley Orgánica de Protección de Datos Personales, Quinto Suplemento del RO 459 del 26-V-2021, arts. 4, 7, 8, 17, 26, 28, 34 y 35:
  https://usgn.espe.edu.ec/wp-content/uploads/2025/06/LEY-ORGANICA-DE-PROTECCION-DE-DATOS-PERSONALES.pdf
- SRI, trámite SRI-027-01-01 (convenios de intercambio de información), ficha actualizada al 20-I-2026:
  https://www.gob.ec/sri/tramites/acuerdos-convenios-instrumentos-legales-ambito-nacional-habilitar-intercambio-informacion-forma-automatizada
- SRI, autorización a terceros: https://www.gob.ec/sri/tramites/certificado-autorizacion-terceros-0
- SRI, copias certificadas: https://www.gob.ec/sri/tramites/copias-certificadas-simples-desglose-documentos-expedientes
- SRI, declaración del IVA: https://www.gob.ec/sri/tramites/formulario-declaracion-impuesto-al-valor-agregado
- SRI, renta de personas naturales: https://www.gob.ec/sri/tramites/formulario-declaracion-impuesto-renta-personas-naturales
- SRI, certificado histórico de actividades (historial del RUC): https://www.gob.ec/sri/tramites/certificado-historico-actividades
- SRI, servicios en línea (autorización a terceros, usuarios adicionales, validación de certificados y declaraciones por código QR):
  https://www.sri.gob.ec/web/intersri/servicios-automaticos
- SRI, RIMPE: https://www.sri.gob.ec/rimpe
- SRI, datos abiertos (catastro del RUC, ventas y compras del 104 agregadas): https://www.sri.gob.ec/datasets
- El Comercio, IVA semestral y declaración con pago simultáneo (julio de 2026):
  https://www.elcomercio.com/actualidad/negocios/iva-ecuador-requisitos-declaracion-semestral/
- Primicias, recategorización del RIMPE (enero de 2026):
  https://www.primicias.ec/economia/sri-recategorizacion-contribuyentes-rimpe-emprendedores-impuestos-iva-113225/
- Primicias, la reforma del COMF y los burós (octubre de 2025):
  https://www.primicias.ec/economia/nueva-ley-cambios-buro-credito-informacion-impuestos-servicios-basicos-107301/
- Lexis, la misma reforma:
  https://www.lexis.com.ec/noticias/la-reforma-al-codigo-monetario-introduce-condonacion-de-deudas-cambios-en-buros-de-credito-y-transformacion-de-cooperativas
- Equifax Ecuador, folleto del reporte de empresas (visto en el buscador, no abierto):
  https://assets.equifax.com/marketing/ecuador/assets/brochure-reporte-de-credito-empresarial.pdf
