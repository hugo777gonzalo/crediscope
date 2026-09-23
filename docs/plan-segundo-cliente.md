# Plan para cuando llegue el segundo cliente

Decidido el 2026-09-23. Todavía no hay nada de esto construido, **a
propósito**: hoy hay un cliente y cero clientes en producción, y armar
la maquinaria multi-cliente antes de vender es exactamente lo que haría
llegar tarde a vender.

Este documento existe para que la decisión no se pierda y para que quien
la implemente no tenga que volver a discutirla.

## La decisión

**Una base de datos por cliente.** No una base compartida con
`cliente_id` y RLS.

## Por qué

El motivo que decide no es el aislamiento en abstracto: es **cómo está
escrito este código**.

Todas las Edge Functions se conectan con `SUPABASE_SERVICE_ROLE_KEY`,
que saltea la RLS por completo. En una base compartida, lo único que
separaría a una cooperativa de otra sería que ningún desarrollador
olvide nunca un `.eq("cliente_id", ...)` en ninguna consulta. Un olvido
no da error: da una fuga silenciosa de datos de crédito entre clientes.

Con una base por cliente, la conexión **es** el límite. No hay filtro
que olvidar.

El objetivo declarado del proyecto es ganarse un nombre como proveedor
de servicios. Una fuga cruzada entre dos cooperativas no es un bug: es
el final de ese objetivo.

### Lo que se evaluó y se descartó

- **Base compartida con RLS bien hecha.** Exigiría agregar `cliente_id`
  a todas las tablas, auditar cada consulta y rehacer las políticas —
  semanas de trabajo sobre un producto todavía no vendido. Con base por
  cliente, el esquema actual **no necesita ningún cambio**: las tablas
  de hoy ya están escritas como el repositorio de un cliente.
- **Sostener los dos modelos a la vez** (base propia para quien la
  exija, compartida para los chicos). Dos rutas de datos, dos formas de
  bug, el doble de superficie que probar. Peor que cualquiera de las dos
  puras.

### Cuándo habría que revisar esta decisión

El costo y la operación de N bases pesan recién pasando las ~50 bases.
El mercado inicial son cooperativas de segmento 2 y 3, y en la etapa de
aprender a vender ese número es de 3 a 10. Si el conteo de clientes se
acerca a 50, vale reabrir la discusión — con datos de operación reales,
no con hipótesis.

## La forma

```
MOTOR  (uno solo, compartido, sin estado)
  código, estandarización, armado del expediente,
  orquestación del LLM, la API pública

DIRECTORIO  (una base chica compartida)
  qué clientes existen, a qué base apunta cada uno,
  versión de esquema de cada uno
  -- NUNCA una cédula ni un análisis acá dentro

REPOSITORIO POR CLIENTE  (una base por cliente)
  consultas, perfiles, análisis,
  su marco interpretativo, su configuración
```

No existe "cero base compartida": siempre hace falta el directorio. Lo
que sí se garantiza es que ahí no haya datos de crédito, para que
comprometerlo no exponga a nadie.

## Qué hay que construir, en orden

Ninguna de las tres es opcional. **El modo de falla de este modelo no es
la fuga: es la deriva de esquema** — que la base del cliente 7 se quede
en la migración 71 y nadie se entere hasta que algo rompe.

1. **Corredor de migraciones** que aplica a todas las bases. Nunca a
   mano, nunca una por una.
2. **Versión de esquema en cada base**, y el motor **se niega a atender**
   a un cliente cuya versión no coincida con la que el código espera.
   Falla ruidosa en vez de deriva silenciosa.
3. **Directorio** con el enrutamiento cliente → base.

La base de hoy pasa a ser la **plantilla**: el esquema de referencia
contra el que se validan las demás.

## Lo único que hay que cuidar desde ahora

Que nada asuma que existe una sola base: la URL y las credenciales
salen de configuración, nunca clavadas en el código.

Eso es todo. El resto se construye cuando aparezca el cliente dos.

## Pendiente aparte: el contrato de la API

Las cooperativas quieren simple — "te mando una identificación,
devolveme el resultado". Eso hace que el contrato de respuesta **sea**
el producto, y hay tres cosas sin resolver:

1. **Asíncrono con azúcar síncrono.** Consultar fuentes, estandarizar y
   llamar al modelo son decenas de segundos. Un POST que devuelve un
   identificador al instante, y el resultado por webhook o consulta. Un
   modo síncrono con tope de espera para quien lo pida.
2. **Idempotencia.** Si el banco reintenta por un corte de red, no puede
   dispararse una segunda consulta paga al buró. La reutilización por
   vigencia de Aval ya es media solución; falta la clave de idempotencia
   por solicitud.
3. **Versionado, y con razones.** El formato de factores +/- tiene que
   estar en la v1: agregarlo después rompe integraciones, y en crédito
   siempre preguntan por qué.

## Lo que quedó decidido y no se rediscute

- **No hay comparabilidad entre clientes ni entre configuraciones.** Es
  deliberado. La unidad comparable es la cohorte
  `(cliente, conjunto de fuentes, versión del marco, versión de la
  estructura)`, y cada análisis registra la suya.
- **El marco interpretativo pasa a ser dato, no código.** Con un marco
  por cliente, dejarlo como constante de TypeScript obligaría a
  desplegar el producto entero por cada ajuste de criterio de cualquier
  cliente. Lo que se pierde —el control del despliegue— se repone con
  versionado inmutable y aprobación explícita.
- **No se guarda el crudo de Novadata.** Se evaluó y se descartó el
  2026-09-23: la consulta es gratis, el `standard_profile` es lo que el
  modelo efectivamente vio, y no se van a reconstruir perfiles
  históricos — lo que se guardó es con lo que se calificó.
