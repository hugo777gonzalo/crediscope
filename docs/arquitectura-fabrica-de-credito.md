# CrediScope como fábrica de crédito

Definición estratégica acordada el 2026-09-15. **Nada de esto está
construido todavía**: es el norte contra el cual ordenar lo que sigue.

Lo que ya existe se describe en el README; este documento dice dónde
encaja y qué falta para que sea un producto y no un conjunto de piezas.

## El diagnóstico

Una fábrica de crédito procesa **solicitudes**. CrediScope hoy evalúa
**personas**.

No existe la entidad solicitud: no hay monto, plazo, producto, destino
ni garantía. Eso significa que el puntaje responde *"¿qué tan riesgosa
es esta persona?"* cuando la pregunta de una fábrica es *"¿le doy estos
8.000 a 36 meses para capital de trabajo?"*.

Son preguntas distintas. La misma persona es aprobable para 2.000 y
negable para 20.000.

**La estrategia es correcta. Lo que se desvió es el orden.** La
instrumentación construida —costos, vigía, avisos, lotes, auditorías—
es real y va a hacer falta, pero es infraestructura *alrededor* del
producto. El núcleo sigue evaluando personas en abstracto.

## El hallazgo estructural: separar puntaje de política

La literatura de motores de decisión coincide en algo que hoy está
mezclado en el marco interpretativo: **el puntaje y la política son dos
capas distintas.**

- El **puntaje** dice cuánto riesgo hay.
- La **política** dice qué se hace con ese riesgo: montos máximos,
  plazos, garantías exigidas, quién puede autorizar una excepción.

Se separan porque cambian a ritmos distintos. Un modelo se recalibra
cada trimestre; una política cambia el martes porque Riesgos decidió no
prestar más de 5.000 a informales.

Hoy el marco hace las dos cosas: valora el riesgo **y** decide aprobar o
negar. Por eso cada cambio de política obliga a tocar el criterio del
modelo y recalibrar todo. Separarlo es más barato ahora, con 63
análisis, que con 63.000.

## La organización propuesta

El menú actual refleja **el orden en que se construyeron las cosas**.
Debería reflejar **el ciclo del crédito**. Todo lo construido encuentra
su lugar; no hay que descartar nada.

### 1. Originación — el corazón

Solicitudes *(falta)* → Perfil del Cliente → Fuentes de Ingreso →
Capacidad de pago *(falta)* → Análisis con IA → Decisión *(falta)*

### 2. Criterio — lo que decide, versionado y auditable

Marco interpretativo · Política de crédito *(falta)* · Controles de
bloqueo · Reglas de fuentes de ingreso · Retroalimentación y
backtesting

### 3. Insumos

Consultas por lote · Explorador de Fuentes · Configuración de fuentes y
campos

### 4. Analítica

Inteligencia de Negocios · Panorama de Fuentes de Ingreso · Descargas

### 5. Operación

Costos · Fallas e incidentes · Avisos

## Lo que falta, en orden

**1. La solicitud.** Monto, plazo, producto, destino, garantía, estado
(ingresada → en análisis → aprobada → desembolsada → vigente). Sin esto
no hay fábrica. Todo lo demás cuelga de acá.

**2. Capacidad de pago.** Cuota simulada contra el piso de ingreso que
el módulo ya calcula. Es donde las fuentes de ingreso dejan de ser
informativas y empiezan a decidir.

**3. El registro de la decisión.** Hoy el sistema recomienda y nadie
anota qué se hizo. Sin eso no se puede medir si el criterio sirve — y es
literalmente el insumo del módulo de retroalimentación, que está
construido y esperando datos que nadie genera.

**4. La política, separada del marco.** Montos máximos por segmento,
plazos, exigencia de garantía, quién autoriza excepciones.

Después —y recién después— vienen **seguimiento** (alertas tempranas
sobre la cartera viva) y **recuperación** (cobranza). Son módulos
enteros; no tocarlos hoy es correcto.

## Dos cambios de nombre que no son cosméticos

**"Solicitudes" hoy es un historial de consultas.** Cuando exista la
solicitud de verdad va a chocar. Ese menú debería llamarse Historial y
dejar el nombre libre.

**"Cliente" se usa para cualquier persona consultada.** Un consultado no
es un cliente hasta que hay una solicitud. Suena a detalle y no lo es:
define si se está construyendo un buró de información o una fábrica de
crédito.

## El próximo paso propuesto

La solicitud como entidad + la pantalla de ingreso + la capacidad de
pago + el registro de la decisión.

Es lo que convierte todo lo demás en un producto, y desbloquea el ciclo
de retroalimentación que ya está construido y ocioso.

## Señal a no ignorar

El tope de gasto del proveedor de IA lleva dos días sin subirse. El
motor de calificación —la parte medular— está apagado desde el
2026-09-14 y el desarrollo siguió igual, porque nada de lo que se
construyó después lo necesitaba. Eso es exactamente lo que pasa cuando
se trabaja al costado del núcleo.

## Fuentes consultadas

- [Loan Origination Software Architecture: Modules That Scale](https://lendfoundry.com/blog/loan-origination-software-architecture-modules-that-scale-lending/)
- [A Guide to Loan Origination System (LOS) — Newgen](https://newgensoft.com/resources/article/loan-origination-system-los-guide/)
- [Credit Decision Engine: Architecture Behind Smart Financial Decisions — LendAPI](https://www.lendapi.com/blog/credit-decision-engine-unveiled-exploring-the-architecture-behind-smart-financial-decisions)
- [Business Rule Engine in Banking — Nected](https://www.nected.ai/us/blog-us/business-rule-engine-in-banking)
- [Sistemas de Información para la Administración del Riesgo de Crédito — BCRA](https://www.bcra.gob.ar/Pdfs/Publicaciones/RC-Etapa1.pdf)
- [Cómo gestionar el Riesgo de Crédito — EALDE](https://www.ealde.es/gestion-de-riesgos-financieros-credito/)
