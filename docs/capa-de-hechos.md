# Capa de hechos: diseño

Tarea E1 de la reestructuración del núcleo (ola 2). Es un diseño: no cambia código de
producto. Parte del mapa de `process.ts` hecho en la ola 1 (campo por campo, sobre
estructura-v21) y de dos mediciones del 2026-11-16 que están en la sección 2.

**Qué es medido y qué es propuesta.** Lo que dice «medido» se midió el 2026-11-16 contra
la base (sólo lectura) o contra el respaldo local del crudo. Lo que dice «propuesta» o
«sin medir» no se probó: es lo que se propone construir y cómo se va a medir antes.

## 0. Resumen

- **El problema.** El perfil estandarizado guarda la mezcla ya hecha: 163 campos en 16
  grupos (175 con los de `fuentesIngreso` sin su detalle) armados desde 52 fuentes, y
  ninguno dice de qué registro salió ni con qué regla. Tres errores de mezcla llegaron a
  producción (`docs/lecciones.md`, «Crudo de Proveedor_Info_1») y cada uno costó una versión
  de la estructura y un recálculo de 3.766 perfiles.
- **Qué se propone.** Una función pura, `derivarHechos(crudo, contexto)`, que devuelve
  hechos (cada dato con su código, su fuente, sus fechas, los registros que usó, la regla
  y su calidad), entidades (operaciones, empleos, demandas y establecimientos con clave
  propia), diferencias (lo que dos fuentes dicen distinto de lo mismo) y señales (lo que
  se calcula sólo desde hechos).
- **Dónde viven.** En ningún lado: se derivan al vuelo del crudo que ya está en Storage.
  La base no crece. Lo citado por el modelo queda en `analysis_results.mensaje_al_modelo`,
  que ya se guarda.
- **Cómo se llega.** Grupo por grupo, sin reescribir `process.ts` de una vez: primero el
  grupo emite hechos en paralelo y se compara en seco contra el perfil; cuando da cero
  diferencias, el bloque de `process.ts` pasa a armarse desde los hechos.
- **Orden.** Paso 0 (cimientos), comportamiento bancario y BIESS, historial con la
  institución, riesgo judicial, laboral e ingresos.

## 1. La forma de un hecho, una entidad, una diferencia y una señal

### 1.1 Códigos estables

Un código nombra un dato, no un campo del perfil ni una fuente.

- Forma: `<dominio>.<objeto>.<medida>[.<calificador>]`, en minúsculas, sin tildes ni eñes
  (el modelo los copia letra por letra), con `_` dentro de un segmento.
  Expresión: `^[a-z]{2,5}(\.[a-z0-9_]+){1,3}$`.
- Dominios: `ide` identidad, `con` contacto, `fam` familia, `lab` empleo, `ruc` actividad
  con RUC, `ing` ingresos, `tri` tributario, `ss` seguridad social, `pat` patrimonio,
  `ban` bancos y Diners, `coop` cooperativas, `ret` casas comerciales, `biess` préstamos
  del IESS/BIESS, `inst` historial con la institución, `tra` tránsito, `jud` demandas,
  `pen` penal, `seg` seguridad ciudadana, `cum` cumplimiento, `buro` el contrato neutro
  del buró, `end` endeudamiento (lo que junta `ban`, `coop`, `ret` y `buro`), `dif`
  diferencias, `sen` señales, `lec` lecturas.
- **Un código no cambia de significado.** Si cambia la regla, sube la versión de la regla
  y el código queda. Si cambia lo que el dato quiere decir (de «todas las filas» a «sólo
  como titular»), es un código nuevo y el anterior se retira con su fecha; un código
  retirado no se reutiliza nunca. Es la misma lección que el `id` de un detector.
- El catálogo de cada grupo vive en el archivo del grupo (sección 3) y dice, por código:
  la unidad, una descripción en castellano para la pantalla, el campo del perfil al que
  equivale (si tiene), si llega al modelo y si es un identificador (nombre de un
  empleador, de quien demanda): un identificador no llega al modelo, igual que hoy
  (`IDENTIFICADORES_QUE_NO_LLEGAN`).
- Una entidad se nombra `<tipo>-<huella>`: `op-7c1e2a`, `emp-03b9d1`, `dem-a41f07`,
  `est-5e2c90`. La huella son los seis primeros caracteres hexadecimales de un resumen de
  lo que la identifica (ver 1.3). Un atributo de una entidad se cita `op-7c1e2a.saldo`.

### 1.2 Tipos

```ts
// supabase/functions/_shared/hechos/tipos.ts (ejemplo del diseño)

export type Calidad =
  | "confirmado_por_tercero" // lo informa alguien que no es la persona: el banco, el empleador, el juzgado
  | "declarado"              // lo dice la persona, o ella misma ante la fuente (su RUC, su aporte como propio patrono)
  | "calculado"              // no lo dice ninguna fuente: sale de una regla nuestra sobre otros hechos
  | "no_disponible";         // no se pudo saber; `valor` es null y `motivo` dice por qué

export type MotivoDeNoDisponible =
  | "fuente_sin_respuesta"    // error o faltante: no es «no hay»
  | "fuente_deshabilitada"
  | "la_fuente_no_lo_informa" // contestó, pero ese dato no viene (los días de mora de un banco)
  | "sin_buro_contratado"
  | "no_se_puede_atribuir"    // hay registros, pero no se pudo decir que son de la persona
  | "no_aplica";

// Un registro del crudo. `consulta` es el perfil de `client_profiles` cuyo crudo se leyó;
// con un buró, `equifax/<consulta>`. `lista` e `indice` faltan si el dato es de un objeto
// suelto (general.personaNatural).
export interface RefDeRegistro {
  consulta: string;
  fuente: string;          // clave de FUENTES (calidad-de-la-consulta.ts): "creditoHipotecario"
  lista?: string;          // "prestamos"
  indice?: number;
  campo?: string;          // el campo leído, cuando la regla lee uno solo: "valorPorVencer"
}

export interface Descarte {
  registro: RefDeRegistro;
  motivo: string;          // código corto: "terminado_en_la_base_interna", "rol_garante", "otro_demandado"
}

interface Base {
  codigo: string;
  regla: string;                   // "biess.union@2": id de la regla y su versión
  fechaDeLaConsulta: string;       // ISO; el reloj de toda regla (nunca `new Date()`)
}

export interface Hecho<V = string | number | boolean | null | string[]> extends Base {
  clase: "hecho";
  valor: V | null;                 // null sólo con calidad "no_disponible"
  unidad: "usd" | "dias" | "meses" | "anios" | "cantidad" | "fecha" | "si_no" | "texto" | "lista";
  calidad: Calidad;
  motivo?: MotivoDeNoDisponible;
  fuentes: string[];               // todas las que la regla leyó, hayan aportado o no
  fechaDelDato: string | null;     // el corte que dice la fuente; null = la fuente no lo dice
  registros: RefDeRegistro[];      // los que la regla USÓ para el valor
  descartados?: Descarte[];        // los que miró y dejó afuera, con el motivo
  entidades?: string[];            // claves de las entidades de las que sale
}

// Lo mismo visto por una fuente: una entidad junta las vistas.
export interface VistaDeFuente<A> {
  registro: RefDeRegistro;
  fechaDelDato: string | null;
  atributos: Partial<A>;           // tal como lo dice esa fuente, ya normalizado (número, fecha ISO)
}

export interface Entidad<T extends "operacion" | "empleo" | "demanda" | "establecimiento", A> {
  clave: `${"op" | "emp" | "dem" | "est"}-${string}`;
  tipo: T;
  atributos: A;                    // el valor conciliado de cada atributo (null = ninguna fuente lo dice)
  vistas: VistaDeFuente<A>[];      // una por fuente que la vio; con una sola, no hubo unión
  union: { regla: string; criterio: "numero" | "monto_y_fecha" | "ruc" | "nombre" | "proceso" } | null;
  // ¿Es de la persona? Lo decide una sola regla por tipo de entidad, y todo hecho filtra por acá.
  atribucion: {
    deLaPersona: "si" | "no" | "sin_cotejo";
    metodo: "identificacion" | "nombre" | "la_fuente_busca_por_identificacion";
    detalle?: string;              // "apellidos_invertidos", "sin_demandado"...
  };
}

export interface OperacionDeCredito {
  sistema: "bancos" | "tarjeta_diners" | "cooperativas" | "comercial" | "iess_biess" | "institucion";
  acreedor: string | null;         // identificador: no llega al modelo
  rol: "titular" | "codeudor" | "garante";
  estado: "vigente" | "cancelada" | "terminada_sin_cierre" | null;
  fechaDeConcesion: string | null;
  montoOriginal: number | null;
  saldoPorVencer: number | null;
  saldoVencido: number | null;
  saldoNoDevenga: number | null;
  saldoEnDemanda: number | null;
  saldoCastigado: number | null;
  diasDeMora: number | null;       // null en bancos sin buró: la fuente no los informa
  calificacion: string | null;     // A1 a E o "AL"; no se traduce a días
  cuotaMensual: number | null;     // sin buró, sólo en cooperativas
}

// La diferencia es un hecho más: se cita y se abre igual.
export interface Diferencia extends Base {
  clase: "diferencia";
  sobre: string;                   // el hecho o el atributo de la entidad: "op-7c1e2a.saldoPorVencer"
  manda: { fuente: string; valor: number | string | null; registro: RefDeRegistro };
  cede: Array<{ fuente: string; valor: number | string | null; registro: RefDeRegistro }>;
  magnitud: { absoluta: number | null; relativa: number | null };
  lectura: "esperada" | "revisar"; // esperada: una foto vieja contra el saldo de hoy; revisar: pasa el umbral de la regla
}

// Una señal sólo lee hechos: su procedencia son los códigos de los que sale.
export interface Senal extends Base {
  clase: "senal";
  tipo: "recencia" | "tendencia" | "razon" | "estabilidad" | "atenuante" | "lectura";
  valor: number | boolean | string | null;
  estado: "se_cumple" | "no_se_cumple" | "no_se_puede_medir";
  derivaDe: string[];              // códigos de hechos, diferencias u otras señales
  ventana?: { desde: string; hasta: string };
  texto?: string;                  // la lectura ya resuelta: "atraso corto (hasta 30 días)"
}

export interface Contexto {
  cedula: string;
  consulta: string;                // id del perfil
  fechaDeLaConsulta: string;       // `capturadoEl` del crudo; es el reloj
  corteIess: string;               // el corte vigente de ese día, el mismo argumento de buildStandardProfile
  persona: { nombre: string | null; fechaDeNacimiento: string | null }; // lo que cruza grupos
}

export interface HechosDeLaPersona {
  version: string;                 // "hechos-v1"
  contexto: Contexto;
  hechos: Hecho[];
  entidades: Array<Entidad<"operacion" | "empleo" | "demanda" | "establecimiento", unknown>>;
  diferencias: Diferencia[];
  senales: Senal[];
}
```

Reglas de la forma:

- **Un hecho con valor tiene al menos un registro.** Un hecho sin valor tiene su motivo.
  Una señal tiene al menos un código en `derivaDe`. Lo comprueba el emisor al armarlos y
  el control del PR (sección 5).
- **«La fuente dice que no hay» es un hecho con valor** (0, `false`, lista vacía), con
  calidad `confirmado_por_tercero` y el registro de la respuesta. «La fuente no contestó»
  es `no_disponible`. Es la distinción de `metaConsulta`, llevada a cada dato.
- **La calidad de un agregado es la más débil de sus insumos.** Sumar, contar, tomar el
  máximo o elegir un registro no la baja: la regla queda en `regla`. `calculado` es para lo
  que ninguna fuente afirma (una antigüedad, un estado derivado, una señal).
- **Dos fechas distintas.** `fechaDelDato` es el corte de la fuente (el retail trae julio
  de 2025 en las 490 personas que lo tienen); `fechaDeLaConsulta` es cuándo se preguntó.
  Un dato sin corte lleva `null`, no la fecha de la consulta.
- **`descartados` es tan importante como `registros`.** Los tres errores de mezcla fueron
  registros que una regla usó o dejó afuera sin que quedara dicho.

### 1.3 La clave de una entidad

| Entidad | Qué la identifica (en este orden) | Atribución |
|---|---|---|
| Operación | el número de operación sin ceros a la izquierda; si no hay, acreedor + fecha de concesión + monto original; si tampoco, fuente + posición | por identificación: la fuente se consulta con la cédula |
| Empleo | RUC del empleador + fecha de ingreso; sin RUC, nombre normalizado + fecha de ingreso | por identificación |
| Demanda | número de proceso; si no hay, delito + fecha + texto de las partes | **por nombre del demandado** (la fuente busca por nombre) |
| Establecimiento | RUC + número de establecimiento | por identificación (RUC = cédula + 001) |

La clave es estable dentro de una consulta. Entre dos consultas de la misma persona lo es
sólo cuando la fuente trae un número: una operación de bancos no trae uno que se pueda
seguir de un mes al siguiente (lo mismo se midió en Equifax el 2026-10-13). Queda dicho en
la sección 8.

### 1.4 Señales y lecturas

Todas viven en `hechos/senales/` y ninguna lee el crudo. Se diseñan primero para la
institución sin buró: lo que sin buró no se puede medir sale `no_se_puede_medir`, nunca
`no_se_cumple`.

| Código | Qué dice | Sin buró, de dónde sale | Estado |
|---|---|---|---|
| `sen.recencia.atraso` | meses desde el último atraso conocido | la fecha del dato de cada hecho en atraso | propuesta |
| `sen.recencia.demanda_de_cobro` | años desde la demanda de cobro más reciente | `dem-*.fecha` de las demandas de cobro de la persona | propuesta; hoy 116 de 166 personas con mal comportamiento lo son sólo por una demanda de cobro, sin distinguir su antigüedad |
| `sen.tendencia.endeudamiento` | deuda de hoy contra la de la consulta anterior de la persona | `end.deuda.total` de esta consulta y de la anterior (se deriva de su crudo) | propuesta; sin consulta anterior, no se puede medir |
| `sen.razon.atraso_sobre_deuda` | deuda en atraso sobre deuda total | `end.deuda.en_atraso`, `end.deuda.total` | propuesta |
| `sen.razon.cuota_sobre_ingreso` | cuota conocida sobre ingreso reportado | `end.cuota.conocida`, `ing.reportado.mensual` | propuesta; sin buró la cuota es sólo la de cooperativas |
| `sen.estabilidad.meses` | meses seguidos con trabajo | la continuidad laboral y la antigüedad del RUC activo | propuesta (grupo 4) |
| `sen.atenuante.hoy_al_dia` | hoy no tiene nada en atraso | `ban.saldo.en_atraso` = 0, `ban.operaciones.en_atraso_sin_monto` = 0, `coop.mora.dias_max` = 0, `biess.mora.dias_max` = 0, `inst.mora.dias_vigente` = 0; el retail sólo si su corte tiene 90 días o menos | propuesta |
| `sen.atenuante.endeudamiento_a_la_baja` | debe menos que antes | `sen.tendencia.endeudamiento` por debajo del umbral | propuesta; umbral a decidir |
| `sen.atenuante.estabilidad_12_meses` | 12 meses o más de estabilidad | `sen.estabilidad.meses` ≥ 12 | propuesta |
| `sen.atenuante.ingreso_al_alza` | el ingreso reportado sube más que el SBU | promedio de los últimos 6 meses de aportes contra los 6 anteriores, descontada la variación del SBU | propuesta; umbral a decidir |
| `lec.atraso.corto` | «atraso corto» | días de mora de hoy entre 1 y el umbral, donde la fuente los informa (cooperativas, retail, BIESS, institución) | propuesta; en bancos sin buró no se puede medir |
| `lec.atraso.sin_dias` | «en atraso, sin días informados» | operaciones de bancos con calificación en atraso | propuesta |
| `lec.deuda_vencida_sin_monto` | «deuda vencida sin monto informado» | `ban.operaciones.en_atraso_sin_monto` > 0 | paridad con el campo de hoy |
| `lec.deuda_sin_cuota_informada` | «deuda sin cuota informada» | operaciones con saldo y `cuotaMensual` null | propuesta; 282 de los 322 «revisar» la mencionan |

### 1.5 Cómo cita el modelo y cómo se verifica

Queda para la versión mayor del marco; acá sólo lo que la capa garantiza.

- El mensaje al modelo lleva cada dato con su código. El modelo escribe la cifra y el
  código entre corchetes: «debe USD 12.400 `[end.deuda.total]`».
- La cita se verifica sola, sin modelo: (1) el código existe en el mensaje que leyó ese
  análisis, (2) la cifra escrita es el valor del hecho con el formato de `formatos.js`,
  (3) un hecho `no_disponible` no se cita como cifra. El mensaje ya se guarda en
  `analysis_results.mensaje_al_modelo`: no hace falta guardar nada más.
- La verificación prueba que la cifra existe y es la del hecho. No prueba que el
  razonamiento sea bueno.

## 2. Dónde viven y cuánto pesan

### 2.1 Lo medido (2026-11-16)

Contra la base, en una consulta de sólo lectura:

| Qué | Valor |
|---|---|
| Tamaño de la base | 399 MB de 500 |
| `client_profiles` | 9.818 filas, 98 MB con índices y TOAST; `standard_profile` guardado ocupa 4.499 bytes en promedio |
| Perfiles con el crudo en Storage (`crudo_ruta`) | 6.367 de 9.818 |
| Último perfil de cada persona real sin crudo | 0 de 3.766 |
| Crudo en Storage | 6.367 objetos, 45,2 MB, 7.445 bytes en promedio |
| `storage.objects` dentro de la base | 55,5 MB para 32.115 objetos: **1,73 KB de base por cada objeto de Storage** |
| `analysis_results` | 538 filas, 9,1 MB (unos 17 KB por análisis, con el mensaje al modelo) |

Contra el respaldo local del crudo (`research/proveedor-info-1-raw-2026-10-03`, 642
personas, una de cada cuatro), armando el perfil con el código vigente y un documento de
hechos **con la forma de la sección 1 y contenido simulado**: un hecho por cada campo del
perfil, con hasta 40 referencias a los registros de las fuentes de su grupo, y una entidad
por cada operación, demanda, establecimiento y empleo.

| Por persona | Media | Mediana | p90 | p99 | Máximo |
|---|---|---|---|---|---|
| Crudo, JSON | 144 KB | 173 KB | 218 KB | 342 KB | 420 KB |
| Crudo, gzip | 8,5 KB | 8,6 KB | 11,6 KB | 16,3 KB | 29,5 KB |
| Perfil, JSON | 8,1 KB | 8,0 KB | 9,0 KB | 10,6 KB | 12,5 KB |
| **Hechos completos, JSON** | 133 KB | 145 KB | 158 KB | 179 KB | 201 KB |
| **Hechos completos, gzip** | **6,8 KB** | 6,9 KB | 8,0 KB | 9,3 KB | 12,2 KB |
| Sólo código, valor, calidad y fecha, gzip | 2,5 KB | 2,5 KB | 2,8 KB | 3,0 KB | 3,3 KB |
| Sólo bancos, cooperativas, BIESS e institución, gzip | 1,6 KB | 1,5 KB | 2,0 KB | 2,6 KB | 3,5 KB |
| Hechos | 175 | 175 | 175 | 178 | 178 |
| Entidades | 22 | 18 | 34 | 86 | 222 |
| Operaciones de crédito | 7 | 7 | 13 | 22 | 46 |
| Demandas, denuncias y pensiones | 6 | 2 | 14 | 60 | 205 |
| Registros en listas del crudo | 167 | 199 | 251 | 412 | 733 |

Lo que la simulación no mide: las referencias reales pueden ser más o menos que 40 por
hecho (un promedio de aportes cita hasta 655 filas), las diferencias y las señales no
están, y los `descartados` tampoco. Es una cota del orden de magnitud, no el número final.

### 2.2 La decisión: derivados al vuelo, sin guardar

`derivarHechos(crudo, contexto)` es una función pura y el crudo ya está guardado. Los
hechos no se guardan: se calculan cuando alguien los pide.

| Alternativa | Qué ocupa en la base | Qué ocupa en Storage | Por qué sí o por qué no |
|---|---|---|---|
| **A. Derivar al vuelo del crudo (elegida)** | 0 | 0 (el crudo ya está: 45 MB de 1 GB) | No hay nada que migrar, recalcular ni borrar en la supresión de un titular. Cuesta una bajada de ~7 KB y el cálculo cada vez que se abre un dato (sin medir; se mide en el paso 0). |
| B. Una columna `jsonb` en `client_profiles` | de 38 a 75 MB para los 3.766 últimos perfiles; de 98 a 196 MB para los 9.818 (estimación: el perfil se guarda en 4,5 KB contra 3,1 KB de su gzip, y los hechos pesarían entre 10 y 20 KB; sin medir) | 0 | No entra en los 101 MB que quedan, y cada versión de una regla obligaría a recalcular lo guardado. |
| C. Un objeto por perfil en Storage, al lado del crudo | 6,5 MB para 3.766 objetos (1,73 KB cada uno); 17 MB para 9.818 | 26 MB y 67 MB | Entra, pero guarda algo que se puede recalcular, y la base crece igual por los metadatos. Queda como caché si la apertura resulta lenta. |
| D. Dentro del perfil, sólo código, valor, calidad y fecha | unos 35 MB para los 9.818 (2,5 KB de gzip, más lo que pierde la compresión de la base) | 0 | Guarda lo que el perfil ya tiene (el valor) y deja afuera lo que falta (los registros). |
| E. Dentro del análisis, sólo lo citado | 0: ya está | 0 | No es una alternativa a A sino su complemento: el mensaje que leyó el modelo ya queda en `mensaje_al_modelo`, con cada hecho y su código. |

Lo que sí se guarda, y cuánto:

- Nada nuevo en tablas. El perfil sigue guardándose igual durante toda la transición
  (las pantallas, la bandeja, Monitoreo y `resumen_por_persona` leen de él).
- El contexto con que se derivó (reloj y corte del IESS, unos 80 bytes) dentro de
  `standard_profile.metaConsulta`, para poder repetir la derivación. Propuesta: antes hay
  que comprobar con `validar-perfil-del-modelo.mjs` que no le llega al modelo.
- La versión de los hechos va en cada respuesta, no en la base.

Consecuencias que hay que aceptar:

- **Un perfil sin crudo no se puede abrir hasta su registro.** Son 3.451 perfiles viejos
  (ninguno es el último de una persona real). Cuántos análisis guardados se hicieron sobre
  uno de ésos no se midió.
- **Un perfil nuevo que no pudo subir su crudo queda sin hechos.** Hoy `crudo_ruta` en
  null es «no se guardó» y la consulta sigue. Propuesta: que la subida fallida se
  reintente y que el perfil quede marcado.
- **Los hechos de un análisis viejo se derivan con el código de hoy.** Si una regla cambió
  desde entonces, el valor de hoy puede no ser el que leyó el modelo. La pantalla compara
  contra `mensaje_al_modelo` y lo dice («la regla cambió desde este análisis»); el valor
  exacto de entonces se reproduce con el commit del sello de ese despliegue.
- **No hay SQL sobre hechos.** Un total de cartera sigue saliendo del perfil y de
  `resumen_por_persona`. Medir una regla en toda la cartera sigue siendo un guion sobre el
  crudo, como `revisar-crudo.mjs` (unos 2 minutos para 3.766 personas).

### 2.3 Cómo se mide en seco antes de construir

1. **Paso 0, con el emisor de verdad y un solo grupo.** `scripts/comparar-hechos.mjs
   --medir` (sección 5) reporta por persona los bytes en JSON y en gzip de hechos,
   entidades, diferencias y señales, y el tiempo de derivar, con media, p90, p99 y máximo.
   Sólo lee el respaldo local y el depósito.
2. **Presupuesto.** p99 del documento completo por debajo de 16 KB en gzip y derivación
   por debajo de 50 ms por persona. Si un grupo se pasa, se discute antes de seguir. El
   número es una propuesta, puesta al doble de lo simulado.
3. **La apertura desde la pantalla.** Una función de prueba que baja un crudo del depósito
   y deriva, con una identificación del sandbox: se mide el tiempo de punta a punta antes
   de diseñar la pantalla. Si pasa de 1 segundo, se enciende la alternativa C para el
   último perfil de cada persona.
4. **Si alguna vez se guarda en la base (B o D),** el tamaño real se mide en una base
   local (`supabase start`) con 200 documentos, nunca en producción.

## 3. Organización del código

### 3.1 Archivos

```
supabase/functions/_shared/hechos/
  tipos.ts                      los tipos de la sección 1
  lectura-del-crudo.ts          arr, obj, estadoRecurso, num, redondear, textoDe, parseFecha y ref():
                                se MUEVEN de process.ts, que pasa a importarlos de acá
  reloj.ts                      mesesEntre(), edadEn(), dentroDe12Meses(): todas reciben el contexto
  emisor.ts                     crearEmisor(contexto): hecho(), entidad(), diferencia(), senal();
                                valida el código contra el catálogo y exige registros o derivaDe
  grupos/
    comportamiento-bancario.ts  ban, ret, biess y el registro de deudores   (grupo 1)
    cooperativas.ts             coop                                         (grupo 1)
    historial-con-la-institucion.ts  inst                                    (grupo 2)
    riesgo-judicial.ts          jud, seg y las pensiones                     (grupo 3)
    empleo.ts                   lab                                          (grupo 4)
    actividad-con-ruc.ts        ruc                                          (grupo 4)
    ingresos.ts                 ing                                          (grupo 4)
    identidad.ts, contacto.ts, familia.ts, tributario.ts, seguridad-social.ts,
    patrimonio.ts, transito.ts, penal.ts, cumplimiento.ts                   (después)
  senales/
    endeudamiento.ts            end.*: junta ban, coop, ret, biess y buro
    atenuantes.ts               los cuatro
    lecturas.ts                 lec.*
    recencia-y-tendencia.ts
  buro/
    contrato.ts                 BuroNeutro (sección 7)
    equifax.ts                  de EstructuraEquifax al contrato y a hechos buro.*
    sin-buro.ts                 los hechos buro.* como no_disponible
  controles.ts                  controlesDesdeHechos(): los hallazgos de bloqueo, cada uno con sus códigos
  perfil-desde-hechos.ts        arma un grupo del perfil desde los hechos, con el catálogo
  indice.ts                     derivarHechos(), HECHOS_VERSION, GRUPOS_EN_PARIDAD
  grupos/<grupo>.test.ts        una prueba de Deno por grupo
```

Cada archivo de `grupos/` exporta tres cosas: `CATALOGO` (sus códigos), `REGLAS_QUE_MEZCLAN`
(las reglas que unen, eligen o descartan registros; el control del PR exige un caso para
cada una) y `emitir(crudo, contexto, emisor)`.

### 3.2 Qué importa qué

- Un grupo importa `tipos`, `lectura-del-crudo`, `reloj`, `emisor` y los módulos de reglas
  que ya existen (`ruc.ts`, `patrono.ts`, `demandas.ts`, `denuncias.ts`,
  `delitos-seguridad.ts`, `fuerzas-armadas-policia.ts`). **Un grupo no importa otro
  grupo.** Lo que hoy cruza grupos por variables de `buildStandardProfile` (el nombre de
  la persona, el corte del IESS) va en el `contexto`, que arma `indice.ts`.
- Una señal importa `tipos` y lee hechos por código. No importa un grupo ni
  `lectura-del-crudo`.
- `indice.ts` es el único que conoce todos los grupos. **En el paso 0 se crea con los
  quince archivos de grupo ya nombrados, cada uno vacío**: así nadie vuelve a tocarlo al
  sumar su grupo, y dos personas en dos grupos no tocan nunca el mismo archivo. El
  catálogo no es un archivo aparte por la misma razón.
- Ningún archivo de `hechos/` llama a `new Date()` ni a `Date.now()`: una prueba lee los
  fuentes y corta si aparece. El reloj del perfil (edades y antigüedades con la hora de
  armado, punto 15 del mapa) desaparece grupo por grupo.
- Nada de `hechos/` escribe en la base ni llama a una fuente.

### 3.3 Cómo convive con `process.ts`

Cada grupo pasa por dos etapas, y `process.ts` no cambia de comportamiento en ninguna.

**Etapa A, en paralelo.** `grupos/<grupo>.ts` emite los hechos del grupo. `process.ts`
sigue armando el perfil como hoy. Los hechos corren sólo en guiones y en pruebas: nada de
producción los llama, así que un error ahí no llega a nadie.

- Una regla que ya es una función exportada se **mueve** a `hechos/` y `process.ts` la
  importa de ahí (`operacionesIessBiess`, `operacionDelComportamientoInterno`): una sola
  implementación.
- Una regla que hoy está escrita dentro de `buildStandardProfile` (las sumas de bancos,
  líneas 1284 a 1316) queda escrita dos veces mientras dure la etapa A. Es una copia, y
  `supabase/CLAUDE.md` dice que las copias es como aparecen las diferencias silenciosas:
  por eso la comparación en seco y la paridad sobre los crudos inventados corren en cada
  PR, y la etapa A de un grupo no se deja abierta: termina en la B o se saca.

**Etapa B, la inversión.** Cuando el grupo está «listo» (sección 5), su bloque en
`process.ts` se reemplaza por `perfilDesdeHechos(hechos, "<grupo>")`. El perfil guardado
no cambia (la comparación dio cero), así que no hay versión nueva de la estructura ni
recálculo; el seco de `recalcular-grupos.mjs --grupos=<grupo>` tiene que dar 0 cambios.
Desde ahí hay otra vez una sola implementación, y `process.ts` pierde las líneas de ese
grupo. Recién en esta etapa el camino de producción deriva hechos.

**Las correcciones van aparte.** Una regla que el diseño propone cambiar (sección 6) no
entra con la paridad: se declara como diferencia esperada, con su detector y su conteo, la
aprueba el negocio, y va con su versión de la estructura y su recálculo, como hoy. Mezclar
«reproduce el perfil» con «lo corrige» en un mismo PR es lo que no deja medir ninguna de
las dos cosas.

**Versiones.** `HECHOS_VERSION` cambia con la forma (sección 1). Cada regla lleva su
versión en `regla`. `PROCESS_VERSION` sigue siendo la del perfil guardado mientras el
perfil se guarde, y `FUENTES_INGRESO_VERSION` queda hasta el grupo 4.

## 4. Plan por grupo

### 4.0 Paso 0: cimientos (antes de cualquier grupo)

1. `tipos.ts`, `emisor.ts`, `reloj.ts`, e `indice.ts` con los grupos vacíos.
2. `lectura-del-crudo.ts`: mover los ayudantes de `process.ts` (29 a 199 y 270 a 280) sin
   cambiar una línea de su cuerpo.
3. `scripts/comparar-hechos.mjs` y la extensión de `probar-crudos-sinteticos.mjs`
   (sección 5), que con cero grupos pasan en verde.
4. La medición de tamaño y de tiempo (2.3).

Es un PR chico, de una persona, y es lo único que todos los grupos comparten.

### 4.1 Grupo 1: comportamiento bancario y BIESS (detalle)

Fuentes: `buroCreditoSuper` y `buroCreditoDiners` (`datosSuper`), `retails`, `deudores`,
`creditoQuirografario` y `creditoHipotecario` (`prestamos`), y `basesInternas`
(`tcredQuirografarios`, `tcredHipotecarios`). Con él va `cooperativas.ts`
(`buroCreditoCoop`, 7 campos, una sola fuente), porque comparte la entidad.

**Entidades.** Una `OperacionDeCredito` por fila de cada fuente. Las del IESS/BIESS se
unen entre los dos caminos con la regla de hoy (`biess.union`, sección 6): la entidad
unida tiene dos vistas. Desde estructura-v26 (D6), una fila de Diners que es la misma operación
que una de Super se une a ella (`ban.union@1`, sección 6, punto 1).

**Campo por campo.** «Propias» son las filas de Super y Diners con `riesgo` distinto de G
y C; «garantías», las de G o C.

| Campo del perfil | Código | Registros que cita | Regla | Lo que queda explícito |
|---|---|---|---|---|
| `figuraEnRegistroDeudores` | `ban.registro_deudores.figura` | las filas de `deudores` | `deu.figura@1`: hay al menos una | sin filas es `false` con la respuesta como registro; sin respuesta, `no_disponible` |
| `numeroOperacionesBuroCredito` | `ban.operaciones.cantidad` | las propias | `ban.propias@1`: Super ++ Diners, sin G ni C | las garantías van en `descartados` con `rol_garante_o_codeudor`; nuevo: `ban.operaciones.sin_rol.cantidad`, las filas sin la columna `riesgo` que se leen como titular |
| `peorCalificacionRiesgo` | `ban.calificacion.peor` | la operación con la peor | `ban.calificacion@1`: máximo en A1..E; «AL» no cuenta | cita UNA operación; si la única es «AL», el valor es «AL» |
| `mejorCalificacionRiesgo` | `ban.calificacion.mejor` | la operación con la mejor | igual, mínimo | |
| `tieneOperacionConDemanda` | `ban.operaciones.con_demanda` | las propias con `judicial` > 0 | `ban.con_demanda@1` | nuevo: `ban.saldo.en_demanda`, el monto, que hoy no sale |
| `tieneOperacionCastigada` | `ban.operaciones.castigadas` | las propias con `castigo` > 0 | `ban.castigadas@1` | nuevo: `ban.saldo.castigado` |
| `saldoTotalVigente` | `ban.saldo.por_vencer` | `saldoVigente` de cada propia | `ban.suma@1` | el nombre dice lo que es: lo por vencer, no la deuda total |
| `saldoEnMoraBuroCredito` | `ban.saldo.vencido` | `saldomora` si es mayor que 0; si no, `mora` | `ban.vencido@1` | cada registro dice qué campo se leyó (`campo`) |
| `saldoNoDevengaIntereses` | `ban.saldo.no_devenga` | `noDevengaInteres` de cada propia | `ban.suma@1` | |
| `deudaEnAtraso` | `ban.saldo.en_atraso` | no cita registros: sale de cuatro hechos | `ban.en_atraso@1`: vencido + no devenga + en demanda + castigado | es el único del grupo que es suma de hechos; `derivaDe` en vez de registros |
| `operacionesEnAtrasoSinMonto` | `ban.operaciones.en_atraso_sin_monto` | las propias con calificación en atraso y deuda 0 | `ban.sin_monto@1` | de acá sale `lec.deuda_vencida_sin_monto` |
| `numeroOperacionesComoGaranteOCodeudor` | `ban.garante.operaciones.cantidad` | las garantías | `ban.garantias@1` | |
| `deudaComoGaranteOCodeudor` | `ban.garante.deuda` | las garantías | `ban.suma@1` sobre por vencer + en atraso | |
| `peorCalificacionComoGaranteOCodeudor` | `ban.garante.calificacion.peor` | la garantía con la peor | `ban.calificacion@1` | |
| `numeroCreditosFormales` | `biess.prestamos.en_la_fuente.cantidad` | las filas de `creditoHipotecario` y `creditoQuirografario` | `biess.en_la_fuente@1`: conteo de las dos | **no es la cantidad de préstamos de la persona**: no mira la base interna. La cantidad conciliada es un hecho nuevo, `biess.operaciones.cantidad`, y la resta de los dos es `dif.biess.cantidad` |
| `numeroDeudasRetail` | `ret.deudas.cantidad` | las filas de `retails` | `ret.conteo@1` | |
| `diasMoraMaximaRetail` | `ret.mora.dias_max` | la fila con más días | `ret.max@1` | cita UNA fila; `fechaDelDato` es el corte de esa fila |
| `totalDeudaRetail` | `ret.deuda.total` | `totalDeuda` de cada fila | `ret.suma@1` | `fechaDelDato` es el corte más antiguo de las filas |
| `valorVencidoRetail` | `ret.deuda.vencida` | `valorVencido` de cada fila | `ret.suma@1` | |
| `fechaCorteRetail` | `ret.corte` | la fila con el corte más antiguo | `ret.corte@1`: mínimo | nuevo: `ret.corte.mas_reciente`, para saber si las filas traen cortes distintos |
| `tieneCreditoIessBiess` | `biess.tiene` | las operaciones que quedan después de unir y descartar | `biess.union@2` | `descartados` lleva cada préstamo terminado de la base interna (`terminado_en_la_base_interna`) |
| `diasMoraCreditoIessBiess` | `biess.mora.dias_max` | la operación con más días y, si está unida, la vista que los trae | `biess.mora@1`: máximo; en una unida, el mayor de las dos vistas | |
| `saldoPrestamosIessBiess` | `biess.saldo` | por operación: `valorPorVencer` + `valorVencido` de la fuente de préstamos, o `saldoTotalCredito` de la base interna si sólo está ahí | `biess.saldo@1` | por cada operación unida, `dif.biess.saldo` con el saldo de la base interna que no se usó |

Cooperativas (`coop.operaciones.cantidad`, `coop.mora.dias_max`, `coop.saldo.total`,
`coop.saldo.en_mora`, `coop.operaciones.con_demanda`, `coop.operaciones.castigadas`,
`coop.cuota.mensual`): una fuente, sumas y máximos, sin unión. `coop.saldo.en_mora` cita
los once campos `val_venc_1` a `val_venc_11` de cada operación.

**Fechas del dato.** El retail trae su corte. Los préstamos del IESS/BIESS traen
`fechaCorte` en la fuente de préstamos. Si las filas de bancos y de cooperativas traen un
corte no se comprobó: se mira en `docs/proveedor-info-1-fields-catalog.md` antes de
empezar, y si no lo traen el hecho lleva `fechaDelDato: null`.

**El reloj.** `operacionesIessBiess` decide «terminado» con `Date.now()`. Con hechos usa
la fecha de la consulta. En la comparación en seco las dos corren con el mismo reloj
(`recalcular-grupos.mjs` ya lo fija); contra el perfil guardado puede haber diferencias
en quien terminó de pagar entre la consulta y hoy, y se reportan aparte.

**Lo que el grupo habilita.** `end.deuda.total`, `end.deuda.en_atraso` y
`end.cuota.conocida` (sin buró), `sen.atenuante.hoy_al_dia` (la parte de deuda),
`lec.deuda_vencida_sin_monto` y `lec.deuda_sin_cuota_informada`.

**Casos inventados que hacen falta** (además de los seis del BIESS y del comportamiento
que ya están en `scripts/crudos-sinteticos/`): una operación como garante, una con el
atraso sólo en `noDevengaInteres`, una con `saldomora` en 0 y `mora` con monto, una «AL»
sola, una misma operación en Super y en Diners, y un retail con dos cortes.

**Riesgos del grupo.** (1) Super y Diners se concatenaban sin unir; medido el 2026-11-20, ninguna
operación viene en las dos, y desde la v26 se unen si llegara a pasar (sección 6, punto 1). (2)
`numeroCreditosFormales` y `tieneCreditoIessBiess` no cuadran entre sí por construcción:
la paridad los reproduce tal cual y la diferencia queda como hecho. (3) Con un buró, la
mitad de estos campos deja de llegar al modelo (`CAMPOS_DEL_BURO_DE_PROVEEDOR_INFO_1`):
los hechos se emiten igual, y lo que llega lo decide el catálogo (sección 7).

**Etapa B, hecha en estructura-v25 (2026-11-19, E4).** `process.ts` arma
`comportamientoBancario` y `comportamientoCooperativas` con `perfilDesdeHechos`; la unión del
BIESS (con el tipo y la fecha de fin de la v22) se mudó a `grupos/comportamiento-bancario.ts`
como `biess.operaciones.detalle`, y `process.ts` perdió sus copias. Con eso entró la única
diferencia que la inversión admite, el **«sin dato»**:

- **El hallazgo.** Con una fuente caída, el perfil escribía lo que trajeron las demás, o 0,
  como si fuera el total («0 operaciones en bancos» de alguien cuyo buró no respondió). Con
  el proveedor rechazando 41 de 52 fuentes, 740 de 3.766 personas estaban en consulta
  incompleta (2026-11-18).
- **La forma.** Un hecho cuya fuente no contestó (o está apagada) no tiene valor y lleva
  `parcial`: lo que dice la regla con las fuentes que sí contestaron (hechos-v2). En el perfil,
  el campo es `null` y el grupo lo lista en `camposSinDato` con ese parcial; sin fuentes
  caídas, la clave no está y el perfil es el mismo de la v24.
- **Quién lee qué.** El modelo y la capacidad de pago leen el valor de antes
  (`conLosValoresDeAntes()`, `_shared/campos-sin-dato.ts`): el mensaje al modelo es el mismo
  byte a byte hasta la versión mayor del marco. La pantalla muestra una fila por fuente sin
  respuesta. El predictor de ingresos no lee el grupo 1. Lo que lee el perfil en SQL lee el
  `null`: en la bandeja y Monitoreo (`refrescar_resumen_por_persona()`, 152) la marca de mora
  pasa por `coalesce` y queda en falso, y la de calificación baja queda en null; las variables
  del Laboratorio (095) y el promedio del Reporte Gerencial (070) lo cuentan como dato
  faltante y no como 0. Las marcas de la bandeja leen bancos y cooperativas, que en el seco
  no faltaron a nadie: no cambian.
- **El seco (2026-11-19, 3.766 personas reales, contra estructura-v24 con el mismo reloj;
  contra la v23 dio lo mismo).**
  Paridad 117.418 de 117.418 campos; 0 registros que no resuelven; 75.414 recuentos, 0 que no
  cuadran. Cambian **672 personas y 4.654 campos**, todos «sin dato» declarados (0 sin
  declarar); con los valores de antes, 0 campos distintos. Por fuente: el BIESS en 672
  (`numeroCreditosFormales`, `tieneCreditoIessBiess`, `operacionesIessBiess`; saldo y mora en
  3: antes ya eran null en las demás), el retail y el registro de
  deudores en 658; bancos, Diners y cooperativas, en nadie. En 3 personas el parcial traía un
  valor (préstamos del BIESS de una fuente, sin la otra); en las demás era 0, false o vacío.
  `recalcular-grupos.mjs --seco` da lo mismo: 3.766 reproducidos, 672 con cambios, todos sin
  dato. Y el detector, con su criterio (el contenido de la fuente), encuentra a las mismas
  672 personas en los perfiles guardados: el `status` y el contenido coinciden en todas.
  Hasta el recálculo, `revisar-crudo.mjs` lo informa como regresión que volvió. Presupuesto:
  p99 2,4 KB en gzip y 1,03 ms.
- **Para la versión mayor del marco.** Que el modelo lea el `null` y la marca en vez del
  valor de antes (sacar la llamada de `armarPerfilDelModelo()`), con su texto en el marco:
  «no se pudo obtener», nunca «no tiene». Y decidir si la capacidad de pago avisa también
  una fuente `faltante` (hoy `fuentesSinConsultar` sólo cuenta `error` y `deshabilitado`).
- **Cómo se mide.** `comparar-hechos.mjs --contra=origin/main` arma cada perfil con el
  `process.ts` anterior y con el de ahora, con el mismo reloj: con los valores de antes
  tiene que dar igual, y sin ellos la única diferencia admitida es la declarada en
  `DIFERENCIAS_ESPERADAS` (`cuando: "sin_dato"`). El detector del crudo
  `dato-de-fuente-sin-respuesta-escrito-como-total` mira el contenido de la fuente (si trae su
  lista), no su `status` como la regla.

### 4.2 Grupo 2: historial con la institución (resumen)

- **Qué es.** Los 7 campos de `comportamientoInterno`, de `basesInternas.personasIncumplimientos`,
  una fila por operación. Hoy se elige UNA (`operacionDelComportamientoInterno`) y las
  demás se pierden.
- **Con hechos.** Todas las operaciones son entidades (`sistema: "institucion"`). Los 7
  campos citan la elegida y llevan las otras en `descartados` con el motivo
  (`cancelada_con_una_vigente`, `vigente_de_menor_saldo`). Códigos: `inst.operacion.estado`,
  `inst.operacion.saldo`, `inst.mora.dias_vigente`, `inst.mora.dias_max`,
  `inst.habito_de_pago`, `inst.perfil_interno`, `inst.es_cliente`.
- **Hechos nuevos que salen solos:** `inst.operaciones.cantidad`, `inst.operaciones.vigentes`,
  `inst.mora.dias_max_entre_todas`.
- **Etapa A hecha (2026-11-20).** `grupos/historial-con-la-institucion.ts`: los 7 campos citan la
  operación elegida y llevan las otras en `descartados` (`cancelada_con_una_vigente`,
  `vigente_de_menor_saldo`, `cancelada_de_menor_tamano`, `empate_gana_el_numero_de_operacion_mas_alto`,
  `empate_total_gana_la_primera`). **D5 (negocio, 2026-11-18): se sigue con UNA sola operación.** Los tres
  hechos nuevos existen, pero no tienen campo del perfil, no llegan al modelo ni a pantalla, y nada los suma.
  Paridad completa contra el perfil sobre las 3.766 personas (26.362 campos, 0 diferencias).
- **Riesgos.** El negocio decidió el 2026-11-09 que estas operaciones son historia de pago
  y no deuda, y que se reporta una sola: los hechos nuevos no se suman a nada y no llegan
  al modelo sin su decisión (sección 8). 782 de 2.602 personas tienen más de una
  operación, así que la regla de elección se prueba con casos de dos vigentes, dos
  canceladas y empate. Si la institución también reporta esa operación al sistema, puede
  estar además en bancos: no se une ni se resta, se mide.

### 4.3 Grupo 3: riesgo judicial (resumen)

- **Qué es.** `riesgoJudicialCrediticio` (3), `riesgoJudicialCivil` (11),
  `riesgoSeguridadCiudadana` (2) y la parte de `controles-bloqueo.ts` que lee demandas y
  denuncias. Fuentes: `demandas`, `demandasOfendido`, `denuncias`, `antecedentesPenales`,
  `pensionAlimenticia` y `pensionAlimenticiaProveedorInfo1`.
- **Con hechos.** Cada demanda es una entidad con su `atribucion`, calculada UNA vez con
  el cotejo que hoy usa sólo `delitosDeSeguridadEnDemandas` (estructura-v20). Las
  demandas de cobro, las civiles y las de seguridad ciudadana filtran por ella. Hoy
  `esDemandaDeCobro` y `demandasPorCategoria` no cotejan: dan por propia toda demanda que
  trae la fuente, que busca por nombre.
- **Paridad primero, corrección después.** La etapa A reproduce el perfil de hoy (las de
  cobro sin cotejo) y emite además `jud.cobro.de_otro_demandado.cantidad` y
  `jud.cobro.sin_cotejo.cantidad`. La corrección (no contar las de otro demandado) es una
  diferencia esperada, con su detector del crudo, y la decide el negocio (sección 8).
- **El bloqueo.** `controlesDesdeHechos()` arma el hallazgo de seguridad ciudadana desde
  los mismos hechos, con sus códigos; se compara en seco contra
  `evaluarControlesBloqueo(raw, cedula)` y, cuando da cero, ése pasa a llamarlo. Así deja
  de haber dos lecturas del mismo crudo que coinciden por disciplina.
- **Pensiones.** Dos fuentes unidas por número de proceso; `mismoNombre` queda en un solo
  lugar (hoy está en `process.ts` y repetida en `fuentes-ingreso.ts`).
- **Etapa A hecha (2026-11-20, E6).** `grupos/riesgo-judicial.ts` y `controles.ts`. Reproduce la regla
  vigente, **estructura-v24 (D2)**, y no la de «las de cobro sin cotejo» que describe el punto de arriba, que
  ya se corrigió: una demanda de cobro o civil de otro demandado, o con los apellidos invertidos, no cuenta;
  sin demandado o sin nombre cuenta como «sin cotejo».
  - **Una atribución por demanda.** `atribuirDemandas()` (demandas.ts) devuelve ahora el cotejo de cada
    una (`cotejos`) y es lo único que lo calcula: cada demanda es una entidad `dem-*` con `atribucion`
    (`si`, `no` o `sin_cotejo`, con el cotejo en `detalle`), y las de cobro, las civiles y las de seguridad
    ciudadana filtran por ella. También son entidades las demandas que presentó la persona (`sin_cotejo`: el
    perfil las cuenta todas), las denuncias (por identificación: su cédula entre las partes) y las pensiones.
  - **Códigos.** 22 en `jud.*`, `seg.*` y `dif.jud.pension.deuda`: los 20 campos de los tres grupos del
    perfil más `seg.demandas.posible_homonimo.cantidad` y la diferencia. Los avisos de la v24
    (`jud.cobro|civil.de_otro_demandado.cantidad` y `.sin_cotejo.cantidad`) no llegan al modelo. Cada hecho
    cita las demandas que usó y descarta las otras con su motivo (`demandado_es_otra_persona`,
    `demandado_con_los_apellidos_invertidos`, `figura_con_otro_papel_que_el_de_acusada`,
    `su_cedula_no_figura_en_la_denuncia`...).
  - **Pensiones.** Las dos fuentes se unen por número de proceso y manda el registro de mayor deuda, como en
    process.ts; el que pierde queda en `descartados` y, si su deuda difiere, en `dif.jud.pension.deuda`
    (lectura «revisar»: no hay umbral medido). Medido sobre las 2.567 del respaldo: 209 personas con una
    pensión a su cargo, 190 con alguna que descarta por no ser la obligada, 1 con la misma pensión en las dos
    fuentes con deudas distintas. `pensionAlimenticia` nunca trae al obligado, así que ninguno de sus
    registros cuenta (es la regla de hoy). `mismoNombre()` quedó en un solo lugar, `_shared/mismo-nombre.ts`
    (la copia de `fuentes-ingreso.ts` se sacó; la de process.ts sale en la etapa B).
  - **Fuente caída.** Un hecho cuyas fuentes no contestaron todas no tiene valor y lleva el `parcial` (lo que
    dicen las filas que llegaron). En etapa A `perfilDesdeHechos()` escribe ese parcial, que es lo que process.ts
    escribe hoy; el «sin dato» llega con la etapa B (hechos-v3 lo deja listo). `antecedentesPenales` dice
    «no hay» con `faltante`: no es una falla.
  - **El bloqueo.** `controlesDesdeHechos()` arma los dos hallazgos de seguridad ciudadana
    (`delito_seguridad_ciudadana` y `posible_homonimo_en_demanda_penal`) desde `seg.delito.categorias` y las
    entidades, cada uno con sus códigos en `derivaDe`; los textos los arman los mismos
    `mensajeDelDelitoDeSeguridad()` y `mensajeDelPosibleHomonimo()` (delitos-seguridad.ts). **Nada lo llama
    todavía.** Una fuente caída no desbloquea a quien tiene un delito en otra: se lee el parcial.
  - **El seco (2026-11-20, 3.766 personas reales).** Paridad 75.320 de 75.320 campos; 0 campos sin procedencia;
    434.008 registros citados, 0 que no resuelven; 129.416 recuentos, 0 que no cuadran. Bloqueo: **las 3.766
    dan los mismos hallazgos de las dos maneras** (24 con delito propio, que bloquean, y 16 con aviso de posible
    homónimo). Contra lo guardado: 0 perfiles distintos. Peso y tiempo (todos los grupos): p99 5,3 KB en gzip y
    3,4 ms por persona; la que más tiene, 212 entidades, 11,8 KB en gzip y 11 ms.
  - **Falta (etapa B).** Cambiar la llamada: que `evaluarControlesBloqueo()` use `controlesDesdeHechos()` para
    esos dos hallazgos, y que process.ts arme los tres grupos con `perfilDesdeHechos`, con su `camposSinDato`.
- **Riesgos.** El cotejo por nombre tiene falsos negativos (apellidos invertidos, nombres
  abreviados): lo que no se puede atribuir va como `sin_cotejo`, nunca como «no es de
  ella». Hay personas con hasta 205 registros entre demandas y denuncias: la respuesta a
  la pantalla va paginada. Una demanda de cobro de hace quince años pesa hoy igual que una
  de este año: `sen.recencia.demanda_de_cobro` lo hace medible, pero qué se hace con eso
  es del marco.

### 4.4 Grupo 4: laboral e ingresos (resumen)

- **Qué es.** `laboral` (33 campos), `fuentesIngreso` (13 y su detalle) y lo que comparten
  con `tributario`. Es el grupo más acoplado: ocho fuentes, tres de ellas del IESS
  hablando de los mismos empleos, y `fuentes-ingreso.ts` (1.386 líneas) lee el crudo por
  rutas propias y tiene su versión.
- **Con hechos.** Tres archivos: `empleo.ts` (el empleo actual, la antigüedad, el
  historial), `actividad-con-ruc.ts` (el RUC, los establecimientos, el estado de la
  actividad) e `ingresos.ts`. Entidades: `empleo` (una por empleador y fecha de ingreso,
  con una vista por cada fuente que lo vio) y `establecimiento`.
- **Lo que queda dicho por primera vez.** De qué fuente salió el empleo actual
  (`lab.empleo_actual.fuente`: mecanizado o aportes); hoy el perfil no lo guarda y de eso
  dependen el cargo vigente y los datos del empleador. Cuál es el RUC de referencia cuando
  hay más de uno. Qué registros sostienen el salario más alto.
- **La calidad importa acá más que en ningún otro grupo.** Un aporte que paga un empleador
  es `confirmado_por_tercero`; el de quien es su propio patrono o afiliado voluntario es
  `declarado`; el ingreso de un RUC sale de lo que la persona declaró al SRI. Es la base de
  la escalera del ingreso, que tiene su propio diseño en la ola 2: `ingresos.ts` espera a
  ese diseño.
- **Riesgos.** (1) Los subcampos de `fuentesIngreso.detalle` no están mapeados línea por
  línea: hay que terminar el mapa antes de empezar. (2) El predictor de ingresos arma sus
  variables desde el perfil (`variables-de-ingreso.ts`): la paridad del perfil tiene que
  ser exacta, o el predictor cambia sin que nadie lo decida. (3) `obligado` se compara con
  «SI» en `fuentes-ingreso.ts` y con «S», «SI», «N» y «NO» en `ruc.ts`: unificarlo es un
  cambio de regla y se mide. (4) La antigüedad a propósito no cruza aportes con mecanizado;
  el diseño lo respeta y lo deja como regla con nombre. (5) Es el grupo donde más pesa el
  reloj.

#### 4.4.1 El mapa del grupo (2026-11-20, antes de escribir código)

El riesgo (1) está cerrado: abajo está cada campo de `laboral`, de `fuentesIngreso` con su
`detalle` y de `tributario`, con la fuente que lee, la regla y de dónde sale hoy. Se hizo
leyendo `process.ts` (532 a 1022) y `fuentes-ingreso.ts` línea por línea, sin medir nada nuevo.

**Cómo se parte.** El grupo no entra en un solo PR razonable: `laboral` son 33 campos y
`fuentesIngreso` otros 12 más nueve del `detalle`, con 1.386 líneas de reglas y textos que
arman un segmento. Etapa A en dos PR, en este orden:

1. **Empleo y actividad con RUC** (`empleo.ts` y `actividad-con-ruc.ts`): los 33 campos de
   `laboral`.
2. **Ingresos** (`ingresos.ts`): `fuentesIngreso` y su `detalle`. Va después porque lee las
   mismas filas del IESS con un lector propio (abajo, «Dos lectores del mismo crudo»), y su
   paridad es sobre textos (`motivoSegmento`, `paraConfirmar`) además de cifras.

**Las fuentes** (clave de `FUENTES`, lista, cuántas filas y qué dice «no hay»; en todas «no
hay» es la lista vacía con `status: "ok"`):

| Fuente | Lista | Qué es una fila | Quién la lee hoy |
|---|---|---|---|
| `basesInternas` | `tiess` | un aporte mensual al IESS por empleo (`anio`, `mes`, `rucEmp`, `nomEmp`, `tipEmp`, `salario`, `fecIng`, `fecSal`, `ocupacion`) | `laboral`, `fuentesIngreso` |
| `trabajoHistoricosMecanizado` | `mecanizadoEmpleados` | un registro por mes y empleo (`baseDate` «aaaa-mm», `rucEmpresa`, `nombreEmpresa`, `personaIngreso.valor`, `cargo.nombre`) | `laboral` |
| `trabajoHistoricos` | `trabajosHistoricos` | un empleo, casi siempre viejo (`personaTrabajo.fechaIngreso` en ms, `personaPatrono.identificacion`, `situacionLegal`, `tipoCompania`, `fechaConstitucion`) | `laboral` |
| `empleados` | `empleados` | la nómina que paga la persona (`ci`, `nomAfi`, `salario`, `anio`, `mes`) | `laboral`, `fuentesIngreso` |
| `contribuyente` | `datosContribuyente` | un registro de RUC (`ruc`, fechas de inicio, cese, reinicio, `obligado`, `observ_solicitud_suspension`) | `laboral`, `tributario`, `fuentesIngreso` |
| `establecimientoActEconomica` | `datosEstablecimientoActEco` | un establecimiento (`num_establecimiento`, `estado_establecimiento`, `fech_cierre`, `act_economica`) | `laboral`, `fuentesIngreso` |
| `cumplimientoPatronal` | `afiliaciones` | una afiliación patronal (`obligaciones`) | `laboral` |
| `administraciones` | `administraciones` | un cargo de administrador de una compañía | `laboral` (sólo `esEmpleadorOAdministrador`) |
| `sriImpuestoRenta` | `data[0].impuestosISD` y `.impuestosRenta` | un año fiscal | `tributario`, `fuentesIngreso.detalle` |
| `jubilados` y `servicioMilitarOPolicial` | `trabajos` y las afiliaciones ISSFAC/ISSPOL | una jubilación o una afiliación | sólo `fuentesIngreso` |
| `pensionAlimenticia` (y la del proveedor) | `supas` | un proceso | sólo `fuentesIngreso` (la que **percibe**) |
| `general` | `personaNatural.nombre` | el nombre, para el cotejo de apellidos y del propio patrono | `laboral`, `fuentesIngreso` |

**Dos lectores del mismo crudo** (medidos al leer; la paridad los reproduce tal cual y no se
unifican en esta etapa, cada uno es una diferencia que el negocio no ha decidido):

- Los aportes: `process.ts` lee `basesInternas.data.tiess`; `fuentes-ingreso.ts`, `basesInternas.data.data ?? basesInternas.data`.
- Los establecimientos: `process.ts` lee sólo `datosEstablecimientoActEco`; `fuentes-ingreso.ts`
  junta **todas** las listas de `data`. Como `reglaDeTrabajo()` (que usa la antigüedad en el empleo
  actual de `laboral`) es de `fuentes-ingreso.ts`, esa antigüedad depende del segundo lector.
- Los registros de RUC: `process.ts` mira todos y toma `[0]` de referencia aunque sea un cascarón
  (sin `ruc`); `fuentes-ingreso.ts` descarta los cascarones antes.
- Un «empleo» se agrupa de **tres maneras**: la antigüedad por `nomEmp|fecIng`, la continuidad por
  `rucEmp|fecIng|inicio posible` y los vínculos del detalle por `rucEmp ?? nomEmp|fecIng`. La entidad
  `empleo` (RUC comparable o nombre normalizado, más la fecha de ingreso) es una cuarta y no
  reemplaza a ninguna: las reglas conservan la suya, con nombre.
- «Obligado a llevar contabilidad»: `ruc.ts` entiende «SI», «S», «NO» y «N»; el indicio de ingreso mayor y el
  tamaño del negocio de `fuentes-ingreso.ts` sólo «SI» (riesgo 3: va con la versión mayor del marco, F16).

**El reloj.** En `laboral` mandan seis lugares: `ahoraActividad` (antigüedad de la actividad y del empleo),
`dentroUltimos3Meses` (el empleo actual confiable), `mesesDesdeUltimaEvidenciaActiva`, `aniosDesdeMs` (con
`Date.now()`) y dos más dentro de esos. Con hechos los seis toman `contexto.fechaDeLaConsulta`. `fuentes-ingreso.ts`
no usa reloj: su corte es un parámetro (`contexto.corteIess`, el argumento de `buildStandardProfile`; vacío, el
`CORTE_IESS_CONOCIDO`) y el último mes del propio cliente.

**La calidad.** Un aporte que paga un empleador (código de empleador público, privado, doméstico, agrícola o
diplomático, y el patrono distinto de la persona) es `confirmado_por_tercero`; el de quien es su propio patrono
(su RUC es su cédula más 001) o aporta por cuenta propia (códigos 3, 8, 24, 30, 31, 32, 34: afiliado voluntario,
artesano, RISE, sin relación de dependencia) es `declarado`. Un hecho que junta filas de las dos clases toma la más
débil (`declarado`). La nómina que paga la persona y su tipo de empleador son `declarado`: los reporta ella como
empleadora. El RUC, sus fechas, sus establecimientos y su obligación de contabilidad los informa el SRI
(`confirmado_por_tercero`); lo que sale de una regla nuestra (la antigüedad, si el RUC está activo, el estado de la
actividad, de qué fuente salió el empleo actual) es `calculado`.

##### `laboral` (33 campos), campo por campo

«Reloj» marca los que hoy leen `new Date()`. `r` es el registro que cita el hecho. Las fuentes que no
contestaron dejan el hecho sin valor, con el `parcial` que el perfil escribe hoy.

| Campo del perfil | Código | Fuentes | Regla de hoy | Qué cita (`r`) y qué queda dicho |
|---|---|---|---|---|
| `empleosActuales` | `lab.empleos_actuales` | mecanizado, `tiess` | los registros del último mes del mecanizado si es de los últimos 3 meses (reloj) y no anterior al corte del IESS; si no, los aportes de `tiess` de ese corte | `r`: las filas que dieron cada empleo. **Nuevo: `lab.empleo_actual.fuente`** (`mecanizado`, `aportes` o `ninguna`), que el perfil no guarda y de la que dependen el cargo y los datos del empleador. Calidad por fila |
| (nuevo) | `lab.empleo_actual.fuente` | mecanizado, `tiess` | la elección de arriba | `calculado`; regla `emp.actual@1` |
| `empleadorConApellidoDelCliente` | `lab.empleador_con_apellido_del_cliente` | las del empleo actual, `general` | `relacionConEmpleador()` sobre cada empleo actual; `true` si alguno comparte | `calculado`; sin empleo, `no_aplica` |
| `clienteEsSuPropioEmpleador` | `lab.cliente_es_su_propio_empleador` | ídem | ídem, sobre el RUC del patrono y, sin RUC, el nombre | `calculado`; es lo que hace `declarado` al aporte |
| `numeroEmpleadoresUltimos24Meses` | `lab.empleadores.ultimos_24_meses` | `tiess` | nombres de empleador distintos con `mesesDesdeUltimaEvidenciaActiva` ≤ 24 (reloj) | una fila por nombre distinto; recuento por conteo |
| `ingresoPromedioUltimos6Meses` | `lab.ingreso.promedio_6_meses` | mecanizado | se suma por mes y se promedian los 6 últimos meses | las filas de esos 6 meses (`personaIngreso`) |
| `esEmpleadorOAdministrador` | `lab.es_empleador_o_administrador` | `empleados`, `administraciones` | hay nómina (sin la propia persona) o un cargo de administrador | la primera fila que lo hace cierto; la propia persona en la nómina va en `descartados` (`es_la_propia_persona`) |
| `numeroEmpleadosRegistrados` | `lab.empleados.cantidad` | `empleados`, `general` | cédulas distintas de la nómina sin la propia persona | una fila por cédula; `declarado` |
| `tipoEmpleador` | `lab.tipo_empleador` | `empleados` | el `tipEmp` de la **primera** fila de la nómina, aunque sea la propia persona | esa fila; `declarado` |
| `obligacionesPatronalesEnMora` | `lab.obligaciones_patronales_en_mora` | `cumplimientoPatronal` | alguna afiliación cuyo texto de obligaciones no dice «NO REGISTRA» ni empieza con «NO » | las filas en mora, o todas |
| `historialEmpleosRegistrados` | `lab.empleadores.historial` | historial, mecanizado, `tiess` | empleadores distintos entre las tres: manda el RUC, un registro sin RUC se une al de igual nombre comparable | una fila por empleador (`emp.historial@1`); cada fila con su fuente. Las tres fuentes en una entidad `empleo` |
| `salarioMasAltoRegistrado` | `lab.salario.mas_alto` | historial, mecanizado, `tiess` | el máximo de los salarios positivos de las tres | **Nuevo: qué registros lo sostienen**, uno por fuente que llega a ese valor. Calidad: la más débil de los citados |
| `cargoVigente` | `lab.cargo.vigente` | las del empleo actual | el cargo del empleo actual de mayor `salarioAprox`, entre los que tienen cargo | la fila de ese empleo |
| `empleadorVigenteSituacionLegal` | `lab.empleador_vigente.situacion_legal` | historial, las del empleo actual | del registro del historial con más reciente `fechaIngreso` **cuyo RUC es el de un empleo actual** | esa fila; el criterio (un RUC de 10 dígitos es cédula + 001) queda en `emp.vigente@1` |
| `empleadorVigenteTipoCompania` | `lab.empleador_vigente.tipo_compania` | ídem | ídem | ídem |
| `empleadorVigenteAntiguedadAnios` | `lab.empleador_vigente.antiguedad_anios` | ídem | `aniosDesdeMs(fechaConstitucion)` (reloj, `Date.now()`) | ídem; `calculado` |
| `empleadoresJuridicos` | `lab.empleadores.juridicos` | ídem | RUC distintos de persona jurídica entre los del historial que son de un empleo actual; `null` si no hay ninguno | una fila por RUC |
| `antiguedadEmpleoActualMeses` | `lab.antiguedad.empleo_actual_meses` | `tiess`, contribuyente, establecimientos | de los empleos sin salida con ≥ 3 aportes, evidencia de los últimos 3 meses (reloj) y último mes entre los empleos que `reglaDeTrabajo()` acepta: el más largo, desde el ingreso (o el inicio del RUC) hasta el último aporte | la última fila del empleo que gana. **Regla con nombre `emp.antiguedad@1`: no cruza aportes con mecanizado, a propósito (riesgo 4)** |
| `duracionEmpleoMasLargoMeses` | `lab.duracion.empleo_mas_largo_meses` | `tiess` | el empleo (`nomEmp|fecIng|fecSal`) más largo, hasta la salida o el último aporte | la fila del último aporte de ese empleo |
| `tieneRucActivo` | `ruc.activo` | contribuyente, establecimientos | `rucActivo()` de `ruc.ts` sobre alguno de los registros | `calculado`; los registros activos, o todos |
| `tieneEstablecimientoActivo` | `ruc.establecimiento.activo` | ídem | el mismo valor | ídem |
| `esIndependiente` | `lab.es_independiente` | ídem | el mismo valor | ídem |
| `fechaInicioActividadesRuc` | `ruc.fecha.inicio_actividades` | contribuyente | del RUC de referencia | el registro de referencia |
| `fechaCeseActividadesRuc` | `ruc.fecha.cese` | ídem | el cese más reciente, incluido el temporal | ídem |
| `fechaReinicioActividadesRuc` | `ruc.fecha.reinicio` | ídem | | ídem |
| `numeroEstablecimientosActivos` | `ruc.establecimientos.activos` | establecimientos, contribuyente | los abiertos, y 0 si el RUC no está activo | los abiertos; con 0, la respuesta de la fuente |
| `numeroEstablecimientosInactivos` | `ruc.establecimientos.inactivos` | ídem | el resto | los demás |
| `tieneEstablecimientosRegistrados` | `ruc.establecimientos.registrados` | establecimientos | hay alguno | el primero |
| `estadoActividadEconomica` | `ruc.actividad.estado` | contribuyente | los 5 casos de la nota de `process.ts` | `calculado`; el RUC de referencia |
| `antiguedadUltimaEtapaActivaMeses` | `ruc.actividad.antiguedad_ultima_etapa_meses` | ídem | del inicio o reinicio hasta hoy (reloj) o hasta el cese | ídem |
| `mesesInactivoActividadEconomica` | `ruc.actividad.meses_inactivo` | ídem | desde el cese hasta hoy (reloj) | ídem |
| `tipoUltimoCeseRuc` | `ruc.cese.tipo` | ídem | cancelación, suspensión definitiva o temporal | ídem |
| `rucDepuradoPorElSri` | `ruc.depurado_por_el_sri` | ídem | `ruc.ts`: la baja de oficio por depuración | ídem |
| `obligadoALlevarContabilidadRuc` | `ruc.obligado_contabilidad` | ídem | `ruc.ts` (riesgo 3: «SI», «S», «NO», «N») | ídem |
| (nuevo) | `ruc.referencia.numero` | ídem | **Cuál es el RUC de referencia cuando hay más de uno**: el primero activo, y si ninguno, el `[0]` | identificador (no llega al modelo); los demás registros van en `descartados` con `no_es_el_de_referencia` |

**Entidades.** `empleo` (`emp-*`): una por empleador y fecha de ingreso, con una vista por cada fuente que la ve.
El empleador es su RUC comparable (un RUC de 10 dígitos es cédula + 001) o, sin RUC, su nombre normalizado
(`nombreComparable`); la fecha de ingreso es `fecIng` (aportes) o `fechaIngreso` en milisegundos (historial,
mecanizado). Sus atributos dicen el último salario, el último mes, si es su propio patrono y la calidad. La unión es
`emp.union@1` y **no cambia ningún campo**: cada campo conserva su agrupación (arriba). También `establecimiento`
(`est-*`): el RUC más el número de establecimiento, con su estado, sus fechas y si está abierto según `ruc.ts`.

**Diferencias.** `dif.lab.salario_del_mes`: el salario del último mes en que el mecanizado y los aportes ven el
mismo empleo. Manda la fuente de la que salió el empleo actual (`lab.empleo_actual.fuente`) y la otra cede; sale
`revisar` si difieren en un dólar o más (el 2026-09-24 coincidían en 272 de 272). `dif.ruc.estado`: RUC activo por
fechas sin ningún establecimiento abierto.

##### `fuentesIngreso` (la parte que va en el segundo PR)

Fuente única, `analizarFuentesIngreso()`; su versión es `FUENTES_INGRESO_VERSION` (`fuentes-v11`).

| Campo | Qué lee | Regla |
|---|---|---|
| `corteIessUsado`, `corteDesactualizado` | `tiess`, `contexto.corteIess` | el corte pasado; si el cliente trae un mes posterior, el del cliente |
| `apareceEnUltimoCorte`, `cortesDesdeLaDesvinculacion` | `tiess` | último mes del cliente contra el corte |
| `fuentes[]` | `tiess` del corte, `jubilados`, ISSFAC/ISSPOL, pensión percibida, RUC, nómina | una por aporte vigente (naturaleza por el código de `tipEmp`; **cuenta propia si el patrono es ella**), más jubilación, servicio activo o pensión del régimen especial, pensión percibida, actividad propia (RUC activo sin aporte propio) y actividad empresarial (nómina mayor que lo reportado). Cada una con su `evidencia`: `reportada_por_tercero`, `autodeclarada_en_minimo`, `autodeclarada_sobre_minimo` o `indirecta` |
| `pisoIngresoMensualReportado` | las anteriores | suma de los montos con naturaleza |
| `senalesDeEscala[]` | nómina, RUC, establecimientos | «nómina que paga» (mes más reciente), «obligado a llevar contabilidad» (**sólo «SI»**), «establecimientos activos» |
| `segmento`, `estadoSegmento`, `motivoSegmento` | todo lo anterior | árbol de 9 ramas; el motivo es texto |
| `paraConfirmar[]` | segmento y fuentes | texto |
| `detalle.aportesPorMes`, `mesesConAporteUltimos12/24`, `promedioUltimos6/12`, `totalHace12Meses` | `tiess` de los 24 meses al corte | suma por mes, `montoValido` (> 0), promedios a centavos |
| `detalle.vinculos[]` | `tiess` | un empleador por fecha de ingreso (`rucEmp ?? nomEmp|fecIng`) |
| `detalle.continuidadLaboral` | `tiess`, RUC | empleos con `reglaDeTrabajo()`, huecos tolerados de 2 meses, meses que el proveedor no publicó |
| `detalle.actividadesEconomicas[]` | **todas** las listas de `establecimientoActEconomica` | única por actividad y nombre comercial |
| `detalle.impuestoRentaPorAnio[]` | `sriImpuestoRenta` | año, formulario, causado y en relación de dependencia |

Lo que `ingresos.ts` tiene que decir por primera vez: el aporte de un empleador es `confirmado_por_tercero` y el de
quien es su propio patrono o aporta por cuenta propia es `declarado` (es la regla de `evidencia` de cada fuente); el
monto de un RUC viene de lo que la persona declaró al SRI (`declarado`); y cada `fuentes[]` cita las filas de las que
sale. Sus textos (`motivoSegmento`, `paraConfirmar`, `detalle` de cada fuente) no se reescriben: la paridad los
compara tal cual, y por eso se hace aparte.

##### `tributario` (grupo posterior; sólo lo que toca a este)

`pagaISD`, `montoMaximoISD`, `fechaMasRecienteISD`, `generaImpuestoRenta`, `montoMaximoImpuestoRenta` y
`fechaMasRecienteImpuestoRenta` salen de `sriImpuestoRenta` y quedan para el archivo `tributario.ts`.
`esAfiliadoUnipersonal` (algún registro de RUC cuyo número empieza con la cédula) lee el RUC como `ruc.ts` y se
mapea con `actividad-con-ruc.ts` cuando se haga ese grupo: hoy no está en ninguno de los dos PR.

##### Reglas que mezclan (cada una necesita un caso en que aplica y uno en que no)

`emp.actual@1` (mecanizado o aportes), `emp.union@1` (una entidad por empleador y fecha de ingreso), `emp.historial@1`
(empleadores distintos entre las tres fuentes), `emp.salario_mas_alto@1`, `emp.vigente@1` (el historial sólo si el RUC
es el de un empleo actual), `emp.antiguedad@1` (sin cruzar fuentes) y `ruc.referencia@1`.

##### Etapa A, primer PR: hecha (2026-11-20)

`grupos/empleo.ts` y `grupos/actividad-con-ruc.ts`: los 33 campos de `laboral`, con sus 35 hechos
(los 33 más `lab.empleo_actual.fuente` y `ruc.referencia.numero`), las dos diferencias (`dif.lab.salario_del_mes` y
`dif.ruc.estado`), las entidades `empleo` y `establecimiento` y los ayudantes de fecha de `process.ts` copiados a
`reloj.ts` con `ahoraDe(contexto)` como «hoy». `process.ts`, `fuentes-ingreso.ts` y el perfil no cambian.

- **Paridad (2026-11-20, 3.766 personas reales, el último perfil de cada una, con el reloj en su captura):**
  124.278 campos de `laboral` iguales de 124.278 (el seco los cuenta dos veces, 248.556 de 248.556, porque el perfil
  de los dos archivos es el mismo grupo); 0 campos sin procedencia; 605.663 registros citados, 0 que no resuelven;
  150.882 recuentos independientes, 0 que no cuadran. Sobre el respaldo del 2026-10-03 (2.567 personas), lo mismo:
  169.422 de 169.422. Contra `origin/main` (estructura-v26) 0 personas con un campo distinto: no hay versión nueva
  de la estructura ni recálculo.
- **Presupuesto.** El documento completo de hechos (todos los grupos): p99 7,6 KB en gzip y 3,86 ms por persona,
  contra 16 KB y 50 ms. Desde la etapa B del grupo 1 `process.ts` llama a `derivarHechos` en cada perfil, así que
  estos archivos corren ya en producción; la prueba de Deno corre una entrada con campos de tipo raro y no se cae, y
  un error en un grupo en etapa A no rompe el armado (abajo).
- **Lo que quedó dicho por primera vez** (respaldo, 2.567 personas): el empleo actual sale del mecanizado en 1.730,
  de ninguna fuente en 836 y de los aportes en 0 (con un corte del IESS de ese día los aportes sólo toman su lugar
  si el mecanizado es viejo o anterior al corte); 1 persona no tuvo respuesta del mecanizado. El empleo actual es
  `declarado` en 500 de esas 1.730 (el patrono es ella o aporta por cuenta propia). Hay 12.585 entidades `empleo`
  (2.198 vistas por las tres fuentes, 5.447 por dos) y 1.120 personas con algún empleo propio. El salario más alto
  lo sostienen el mecanizado y los aportes juntos en 1.709, el historial solo en 345 y las tres fuentes en 309.
- **Las diferencias.** `dif.lab.salario_del_mes` da 0 en 2.567: los aportes y el mecanizado coinciden en el mes
  que ven los dos (como el 272 de 272 del 2026-09-24). `dif.ruc.estado` sale 104 veces: 101 con un establecimiento
  abierto y el RUC cesado (el registro sin actualizar de la v7, `esperada`) y 3 con el RUC vigente y todos los
  establecimientos cerrados (`revisar`). Ninguna cambia un campo.
- **El resguardo de la etapa A.** `derivarHechos` envuelve en `try/catch` a cada grupo que todavía no alimenta el
  perfil (todos menos `GRUPOS_EN_ETAPA_B` de `indice.ts`: hoy el 1; el 3 se suma al fusionarse su etapa B): si falla,
  ese grupo no emite nada (`emisor.marca()` deshace lo que alcanzó a emitir, claves incluidas), el error queda en
  `console.error` con el grupo y el mensaje, sin datos de la persona, y el resto sigue. Un grupo en etapa B falla
  como hoy, porque el perfil depende de él. Con `{ estricto: true }` fallan todos: lo usan `comparar-hechos.mjs` y
  `probar-crudos-sinteticos.mjs`, para que un grupo caído no pase en silencio en un seco. Un grupo nuevo en etapa B se
  suma a `GRUPOS_EN_ETAPA_B` junto con su entrada en `GRUPOS_CON_SIN_DATO`.
- **Decisiones de esta etapa, revisables.** La nómina que paga la persona y su tipo de empleador son `declarado`;
  el cumplimiento patronal y el RUC, `confirmado_por_tercero`; el estado del RUC y las antigüedades, `calculado`.
  Los códigos de empleador 3, 8, 24, 30, 31, 32, 34 y 35 son afiliación propia (una prueba los compara con
  `fuentes-ingreso.ts`). La unión por RUC une un registro sin RUC con el empleador de igual nombre comparable
  (la regla de `empleadoresDistintos`).
- **Lo que no se hizo.** `ingresos.ts` (segundo PR), `tributario.ts` y `esAfiliadoUnipersonal`. El campo
  `lab.empleo_actual.fuente` todavía no llega a ninguna parte: no hay campo del perfil y el cargo vigente sigue
  saliendo de la regla de `process.ts`. La etapa B de este grupo espera a que `ingresos.ts` use los mismos hechos.

### 4.5 Los demás grupos

Identidad, contacto, familia, tributario, seguridad social, patrimonio, tránsito, penal y
cumplimiento son de una o dos fuentes y casi sin mezcla. Van después de los cuatro, en
cualquier orden y en paralelo. Cumplimiento arrastra el resto de `controles-bloqueo.ts`
(fallecido, listas de control, homónimos, PEP).

## 5. La comparación en seco y qué es «listo»

### 5.1 `scripts/comparar-hechos.mjs`

Sólo lee. Tiene el esqueleto de `revisar-crudo.mjs`: el último perfil de cada persona
real, con el crudo de `--carpeta=` y, lo que falte, del depósito.

```
node scripts/comparar-hechos.mjs --grupo=comportamientoBancario [--carpeta=...] [--medir]
```

Por cada persona, con el reloj fijado en `capturadoEl`:

1. Arma el perfil con `buildStandardProfile(raw, cedula, corte)`.
2. Deriva los hechos con `derivarHechos(raw, contexto)`.
3. **Paridad.** `perfilDesdeHechos(hechos, grupo)` contra el grupo del perfil del paso 1,
   campo por campo, con las claves ordenadas y los números al centavo.
4. **Procedencia.** Todo hecho con valor tiene registros; toda referencia existe en el
   crudo; todo código está en el catálogo; toda señal tiene `derivaDe`.
5. **Recuento independiente.** Para las reglas que se declaran como suma, conteo o máximo
   de un campo, el guion vuelve a calcular el valor desde los registros citados, con su
   propio código y no con el de la regla. Es la lección del 2026-11-06: una regla no se
   mide con su propio criterio.
6. **Contra lo guardado** (informativo): el grupo del `standard_profile` de la base contra
   el del paso 1, para ver perfiles que quedaron sin recalcular. No decide «listo».

Escribe el detalle en `research/comparar-hechos/` (fuera de git: lleva montos) y por
consola conteos y referencias `c-xxxxxxxx`. Sale con 1 si hay una diferencia de paridad
que no esté declarada, un hecho sin procedencia o un recuento que no cuadra.

### 5.2 «Listo», por grupo

Un grupo está listo cuando se cumplen las ocho, en este orden:

1. **Cero campos sin procedencia**: cada campo del grupo en `types.ts` tiene su código en
   el catálogo. Es una comprobación del código, sin datos.
2. **Cero hechos sin registros y cero referencias que no resuelven**, sobre las 3.766
   personas reales.
3. **Cero diferencias contra el perfil** rearmado con el mismo reloj, sobre las 3.766. Las
   únicas que se admiten están escritas en `DIFERENCIAS_ESPERADAS` del grupo, cada una
   con su detector del crudo, su conteo y la fecha en que el negocio la aprobó.
4. **Cero recuentos que no cuadran.**
5. **Cada regla de `REGLAS_QUE_MEZCLAN` tiene un caso inventado en que aplica y uno en que
   no**, y la prueba de Deno del grupo pasa.
6. **Los detectores del crudo del grupo dan 0 regresiones** (`revisar-crudo.mjs`).
7. **El tamaño y el tiempo están dentro del presupuesto** (2.3).
8. **La inversión está hecha**: `process.ts` arma el grupo desde los hechos y el seco de
   `recalcular-grupos.mjs --grupos=<grupo>` da 0 cambios.

Paridad no es verdad: un grupo listo reproduce el perfil de hoy con procedencia, y si el
perfil de hoy tiene una regla mal diseñada, la reproduce. Lo que la capa cambia es que
ahora se ve: los registros usados y los descartados quedan a la vista de un detector.

### 5.3 Cómo se extiende `probar-crudos-sinteticos.mjs`

Hoy arma, por cada crudo inventado, el perfil y el bloqueo, y corre `DETECTORES_DEL_CRUDO`
contra lo que el caso espera. Se le agregan cuatro cosas, sin tocar el flujo de la
integración continua (el control `guiones` ya lo corre):

1. **Invariantes sobre todos los casos.** Para cada crudo inventado corre
   `derivarHechos()` y comprueba la procedencia (5.1, punto 4) y la paridad de los grupos
   de `GRUPOS_EN_PARIDAD` (los que ya pasaron la etapa A). Un caso que ya existe prueba
   los hechos sin que nadie lo edite.
2. **Lo esperado en hechos.** Un caso puede traer `hechos`: por código, el valor, los
   registros que tiene que citar y los que tiene que descartar con su motivo. Ejemplo,
   para `biess-contado-dos-veces-dispara.json`:

   ```json
   "hechos": {
     "biess.saldo": {
       "valor": 15000,
       "registros": ["creditoHipotecario.prestamos#0"],
       "diferencias": ["dif.biess.saldo"]
     },
     "biess.operaciones.cantidad": { "valor": 1 }
   }
   ```

   Probar el valor no alcanza: el error del BIESS daba un saldo verosímil. Lo que el caso
   fija es **qué registros** sostienen el valor.
3. **Cobertura de las reglas.** Igual que hoy exige un caso que dispara y uno que no por
   detector, exige por cada regla de `REGLAS_QUE_MEZCLAN` un caso en que une, elige o
   descarta y uno en que no. Una regla nueva de mezcla sin su par de casos corta el
   control.
4. **Los hechos entran al contexto de los detectores.** `{ raw, cedula, capturadoEl,
   perfil, bloqueo, hechos }`: un detector nuevo puede escribirse sobre hechos («una
   operación con dos vistas cuyos saldos difieren más de 20%») en vez de volver a leer el
   crudo.

El reloj de cada caso es su `capturadoEl`. Hoy `buildStandardProfile` usa la hora real, y
un caso de «préstamo terminado» depende del día en que corre el control; con los hechos
deja de depender.

## 6. Reglas de conciliación propuestas

Para cada punto donde hoy dos o más fuentes hablan de lo mismo (los 16 del mapa): qué
fuente manda, qué diferencia queda como hecho y en qué estado está la regla. «Paridad»
quiere decir que la etapa A reproduce la regla de hoy; lo que dice «propuesta» es un
cambio, va aparte y con medición.

| # | Punto | Manda | Diferencia que se guarda | Estado |
|---|---|---|---|---|
| 1 | Bancos: Super y Diners | Super; la fila de Diners que es la misma operación se une a ella (`ban.union@1`: misma entidad, rol, calificación y corte, la deuda a un dólar y mayor que cero) | `dif.ban.posible_repetida`: la deuda según cada lista | estructura-v26 (D6). Medido el 2026-11-20 sobre las 3.766: 0 operaciones en las dos (Diners trae sólo a BP Diners, código 4624, que Super no trae); la misma deuda entre entidades distintas sale como al azar (a 1%, 23 pares contra 26 con el Super de otra persona). Detector `operacion-en-super-y-diners`, con la entidad por código o nombre y la deuda a 1% |
| 2 | Préstamos del IESS/BIESS por dos caminos | la fuente de préstamos (trae `fechaCorte` y el saldo de hoy); los días de mora, el mayor de las dos; la base interna sólo suma las operaciones que la otra no ve y que no están terminadas | `dif.biess.saldo` y `dif.biess.fecha_de_concesion` por operación unida; `dif.biess.cantidad` | paridad con estructura-v21, medida el 2026-11-09 (177 hipotecarios en 174 personas; 1.600 terminados) |
| 3 | Operaciones con la institución y deuda de bancos | no se suman ni se restan (negocio, 2026-11-09) | `dif.inst.posible_en_bancos`, sólo informativa | paridad. Sin medir |
| 4 | Empleo actual: mecanizado o aportes | el mecanizado si tiene 3 meses o menos y no es anterior al corte del IESS; si no, los aportes del corte | `lab.empleo_actual.fuente` (hecho) y `dif.lab.salario_del_mes` cuando las dos traen el mismo empleador y mes | paridad con estructura-v19 |
| 5 | Empleadores y salario más alto, de tres fuentes del IESS | la unión por RUC; sin RUC, por nombre normalizado. El salario, el máximo, citando su registro | `dif.lab.salario_del_mes` | paridad con estructura-v16 |
| 6 | Datos del empleador vigente | `trabajoHistoricos`, sólo si su RUC es el de un empleo actual | no aplica | paridad; el criterio (un RUC de 10 dígitos se lee como cédula + 001) queda en `union.criterio` |
| 7 | RUC activo: contribuyente y establecimientos | `ruc.ts`, la única implementación | `dif.ruc.estado`: el RUC activo sin establecimiento abierto, o al revés | paridad. Unificar `obligado` es una propuesta, con medición |
| 8 | Pensión alimenticia, dos fuentes | por proceso, el registro de mayor deuda (hoy) | `dif.jud.pension.deuda` | paridad. Propuesta: que mande el registro más reciente si la fuente trae una fecha. Sin medir |
| 9 | Demandas atribuidas por nombre | el cotejo del demandado, uno solo para todas | no aplica: la atribución va en la entidad | paridad para las penales (v20). Para las de cobro y las civiles, **propuesta**: decisión del negocio |
| 10 | PEP y homónimos, dos fuentes | se suman, sin unir | `dif.cum.pep.repetido` si el mismo cargo y fecha vienen en las dos | paridad. Propuesta: comparar la fecha como fecha y no como texto |
| 11 | Seguridad ciudadana, tres fuentes con tres criterios | cada una con el suyo (nombre, identificación y rol, texto) | no aplica: cada categoría cita su fuente y su método | paridad |
| 12 | Multas de tránsito, tres entidades | se suman, sin unir | `dif.tra.posible_repetida` | paridad. Sin medir si una multa viene en dos |
| 13 | Nivel de educación: registro civil y títulos | ninguna: hoy conviven | `dif.ide.nivel_de_educacion` cuando se contradicen | paridad. Propuesta: que mande el título registrado |
| 14 | El bloqueo relee el crudo | los hechos: `controlesDesdeHechos()` | no aplica | propuesta (grupos 3 y cumplimiento) |
| 15 | Edades y antigüedades con el reloj del armado | la fecha de la consulta | no aplica | propuesta: cambia el valor de un perfil recalculado otro día; se declara como diferencia esperada |
| 16 | Proveedor_Info_1 y el buró de la institución | el buró para bancos, Diners y cooperativas; el retail se suma al sector comercial (negocio, 2026-10-16); el BIESS queda en Proveedor_Info_1 y no se suma | `dif.end.bancos`: la deuda de bancos según cada uno | paridad con `perfil-del-modelo.ts` (sección 7) |

Dos reglas valen para todas:

- **La diferencia se guarda aunque sea esperada.** Que la base interna del BIESS sea una
  foto vieja es sabido; igual va, con `lectura: "esperada"`. Lo que no se guarda no se
  puede medir después.
- **Una regla nueva de unión entra con su detector del crudo y con un criterio distinto
  del de la regla** (`supabase/CLAUDE.md`, «Crudo de Proveedor_Info_1»). La capa de hechos
  no reemplaza esa regla: la hace más barata de cumplir.

### 6.1 El perfil incompleto

Lo que encontró el mapa: un perfil incompleto vuelve a pedir las 52 fuentes y guarda una
fila nueva sin unir nada, y el resumen de la persona toma el último perfil aunque sea peor
que el anterior. Con el proveedor contestando 7 de 52 fuentes, cada reintento puede dejar
a la persona peor de lo que estaba.

- **Lo que los hechos resuelven solos:** cada hecho dice de qué consulta salió y cuándo.
  Dos consultas de la misma persona se pueden comparar fuente por fuente.
- **Propuesta, en dos pasos y fuera del plan por grupo:**
  1. *El resumen no retrocede.* `refrescar_resumen_por_persona()` no reemplaza un perfil
     que se puede analizar por uno posterior que no, dentro de la validez del perfil (7
     días por defecto); muestra el anterior con la marca de que hay una consulta posterior
     incompleta. Es una migración chica y no depende de los hechos.
  2. *Consolidar por fuente.* Un reintento pide sólo las fuentes que no contestaron, y el
     crudo consolidado toma de cada fuente la respuesta más reciente que sirve, dentro de
     la misma ventana. Cada hecho lleva la consulta de la que salió su registro
     (`RefDeRegistro.consulta`). Una regla que cruza fuentes con corte mensual (aportes,
     mecanizado) no mezcla dos cortes: si no coinciden, la más vieja cuenta como faltante.
- **Riesgo:** juntar respuestas de días distintos es una mezcla nueva. Por eso va después
  de los cuatro grupos, con su detector y con la ventana decidida por el negocio.

## 7. El contrato del buró

### 7.1 Hoy

`BuroDeLaInstitucion` es `{ proveedor: "equifax"; estructura }`: la estructura de Equifax
entera. `buroEquifaxDelPerfilDelModelo()` la recorta para el modelo en un bloque que se
llama `buroEquifax`, `endeudamientoConBuroEquifax()` arma el endeudamiento, y dos listas
escritas a mano dicen qué campos de `comportamientoBancario` quedan y cuáles se van. Un
segundo buró obligaría a repetir las tres cosas.

### 7.2 El contrato neutro

```ts
// supabase/functions/_shared/hechos/buro/contrato.ts (ejemplo del diseño)

type Sistema = "bancos" | "cooperativas" | "comercial";

interface DeudaDelSistema {
  numeroDeOperaciones: number | null;
  saldoDeudaUsd: number | null;
  saldoPorVencerUsd: number | null;
  saldoEnAtrasoUsd: number | null;      // vencido + no devenga + en demanda + castigado
  maximoDiasDeMora: number | null;
  cuotaMensualUsd: number | null;
  conciliaConElResumen: "si" | "no" | "sin_resumen" | "sin_detalle";
}

export interface BuroNeutro {
  proveedor: string;                    // para la procedencia; el marco no lo nombra
  consulta: string;                     // id de la consulta: de ahí salen los registros
  fechaDelReporte: string;
  temasQueCubre: string[];              // lo declara cada buró; hoy TEMAS_QUE_CUBRE_EL_BURO

  deudaPorSistema: Record<Sistema | "total", DeudaDelSistema | null>;        // como titular
  deudaComoCodeudorOGarante: Record<Sistema | "total", Pick<DeudaDelSistema,
    "numeroDeOperaciones" | "saldoDeudaUsd" | "saldoEnAtrasoUsd" | "maximoDiasDeMora"> | null>;

  moraDeHoy: {
    saldoVencidoUsd: number | null;
    maximoDiasDeMora: number | null;
    numeroDeOperacionesVencidas: number | null;
    vencidoPorTramo: Record<string, number>;   // sólo los tramos con saldo
  } | null;

  historiaDePago: {
    mesesObservados: number | null;
    peorMoraEn12Meses: number | null;          // días
    peorMoraEn24Meses: number | null;
    mesesConAtrasoEn12: number | null;
    roles: "titular" | "todos_los_roles";      // Equifax la calcula con todos los roles
  } | null;

  cuota: {
    mensualUsd: number | null;
    sistemasIncluidos: Sistema[];
    estimadaPorElBuro: boolean;
  } | null;

  consultasRecibidas: {
    entidadesEn12Meses: number | null;
    consultasEn12Meses: number | null;
    entidadesEn3Meses: number | null;
    consultasEn3Meses: number | null;
    sinLaPropiaInstitucion: boolean;
  } | null;

  operaciones: OperacionDeCredito[] | null;    // si el buró las entrega una por una
  propioDelProveedor: Record<string, unknown>; // scores, estado de cartera, tarjetas: no son del contrato
}
```

Cada campo del contrato sale como un hecho `buro.*` (`buro.deuda.bancos.saldo`,
`buro.mora.hoy.dias_max`, `buro.historia.peor_mora_12m`, `buro.cuota.mensual`,
`buro.consultas.entidades_12m`), con sus registros en el crudo del buró. Lo propio de un
proveedor va como `buro.x.<proveedor>.*` y no entra en ninguna señal.

### 7.3 Primero, sin buró

Una institución sin buró tiene todos los `buro.*` en `no_disponible` con motivo
`sin_buro_contratado`. Las señales no leen `buro.*` ni `ban.*` directamente: leen `end.*`
(`senales/endeudamiento.ts`), que toma el buró si está y, si no, lo que Proveedor_Info_1
alcanza, y dice en `derivaDe` de cuál salió.

| Parte del contrato | Sin buró, qué hay | Qué no se puede medir |
|---|---|---|
| Deuda por sistema | bancos y Diners (saldo por vencer y en atraso), cooperativas, casas comerciales con su corte, y el IESS/BIESS aparte | la deuda comercial de hoy: el retail es de su corte |
| Mora de hoy | el monto en atraso de bancos; los días en cooperativas, retail, BIESS y con la institución | los días de mora en bancos: sólo hay calificación, y no se traduce a días |
| Historia de pago | la mora máxima con la institución; las consultas anteriores de CrediScope a la misma persona | la serie mes a mes |
| Cuota | la de cooperativas (693 de 747 operaciones la informan) | la de bancos, tarjetas y casas comerciales |
| Consultas recibidas | nada | todo |

### 7.4 Qué cambia y qué queda igual

| Queda igual | Cambia |
|---|---|
| `consultas_equifax`, el cobro, el tope diario y la vigencia del 17 | `BuroDeLaInstitucion` pasa a `{ proveedor, contrato: BuroNeutro }` |
| `equifax-tablas.ts`, `equifax-estructura.ts` y su versión | Aparece `buro/equifax.ts`: de `EstructuraEquifax` al contrato. Es el único archivo que conoce los nombres de Equifax |
| `ultimaConsultaDeEquifax()`, `consultaVigenteDeEquifax()` y su copia en SQL | `TEMAS_QUE_CUBRE_EL_BURO` lo declara cada adaptador |
| El predictor de ingresos, nivel 2 (lee la respuesta cruda) | Las listas `QUEDAN_DE_PROVEEDOR_INFO_1_CON_BURO` y `CAMPOS_DEL_BURO_DE_PROVEEDOR_INFO_1` salen del catálogo (`cubiertoPorElBuro` en cada código); la prueba que hoy obliga a decidir sobre un campo nuevo pasa a mirar el catálogo |
| La regla de la deuda: un solo bloque, nunca la suma de dos, y la marca de si concilia | `endeudamientoConBuroEquifax()` y `endeudamientoDelPerfilDelModelo()` se juntan en `senales/endeudamiento.ts` |
| Lo que hoy lee el modelo, hasta la versión mayor del marco | El bloque `buroEquifax` del modelo pasa a `buro`, con nombres neutros: es versión nueva del marco y entra con ella, no antes |

Lo que el contrato no arregla: Equifax calcula la evolución y la conducta de pago con
todos los roles, y eso queda dicho en `historiaDePago.roles`, no corregido. Aval no tiene
adaptador ni se diseña acá.

## 8. Riesgos, lo que no resuelve y decisiones para el negocio

### 8.1 Riesgos

1. **La copia de la etapa A.** Mientras un grupo está en paralelo, sus reglas están
   escritas dos veces. Mitigación: paridad en cada PR, y la etapa A de un grupo se cierra
   con la inversión o se saca.
2. **El crudo pasa a ser la única fuente de la procedencia.** Sin crudo no hay hechos:
   3.451 perfiles viejos no lo tienen, y un perfil nuevo cuya subida falle tampoco. Y la
   apertura de un dato depende de Storage.
3. **El código de hoy lee el crudo de ayer.** Los hechos de un análisis viejo se derivan
   con las reglas vigentes. Se muestra, no se esconde (2.2).
4. **La paridad no prueba que el perfil esté bien** (5.2). La capa hace visibles las
   mezclas; encontrarlas sigue siendo trabajo de los detectores y de la revisión del
   análisis.
5. **Los crudos inventados prueban la regla, no la fuente.** Los tres errores vinieron de
   suponer algo de la fuente que nadie midió. Un caso inventado se escribe con la forma
   que creemos que tiene; la medición sobre el crudo real sigue siendo obligatoria.
6. **Las claves de las entidades no son estables entre consultas** salvo que la fuente
   traiga un número. La tendencia del endeudamiento compara totales, no operación por
   operación.
7. **El mensaje al modelo crece.** Cada dato lleva su código. Cuántos tokens suma no se
   midió; se mide con el banco de casos de oro antes de la versión mayor del marco.
8. **El grupo 4 depende de otro diseño** (la escalera del ingreso) y de terminar el mapa
   del detalle de `fuentesIngreso`.
9. **Personas con cientos de registros** (hasta 205 entre demandas y denuncias, hasta 655
   aportes): la respuesta a la pantalla se pagina y el presupuesto de tiempo se mide en
   el p99, no en la media.

### 8.2 Lo que no resuelve

- La caída del proveedor: con 7 de 52 fuentes hay pocos hechos, todos bien documentados.
- La variación del modelo (el mismo perfil mueve el score unos 40 puntos).
- Los perfiles viejos sin crudo.
- Consultar hechos con SQL: la cartera se sigue leyendo del perfil.
- El estándar por institución y la escalera del ingreso, que tienen su diseño.
- Seguir una operación de un mes al siguiente.
- Que el razonamiento del modelo sea bueno: verifica la cifra citada, no la conclusión.
- La pantalla que abre una cifra hasta su registro: acá queda lo que necesita (códigos,
  registros, descartes); su diseño pasa por la habilidad `revision-ux`.

### 8.3 Decisiones para el negocio

| # | Decisión | Recomendación |
|---|---|---|
| 1 | **Dónde viven los hechos**: derivados al vuelo, sin ocupar la base, o guardados (pide pasar a Pro). | Derivados al vuelo. No cuesta espacio ni recálculos, y el paso a Pro se decide por otras razones. Si la apertura resulta lenta, un caché en Storage para el último perfil (6,5 MB de base). **Decisión del negocio (2026-11-18):** D1 aceptada: derivados al vuelo. |
| 2 | **Demandas de cobro y civiles en las que el demandado no es la persona**: seguir contándolas, o dejar de contarlas como se hizo con las penales en estructura-v20. | Dejar de contarlas y avisar «posible homónimo», después de medir cuántas son con un detector del crudo. Implica una versión de la estructura y un recálculo. **Decisión del negocio (2026-11-18):** D2, opción (b): dejar de contar las demandas donde el demandado no es la persona, después de medir; **validar cómo empata con R1** (demanda de cobro, abierta). **Hecho en estructura-v24 (PR de D2, 2026-11-19):** dejan de contar la «otra persona» y los apellidos invertidos (el negocio, 2026-11-19); sin demandado y sin nombre siguen contando y se avisan como sin cotejo. Es independiente de R1: el catalogador (PR 184) no lee demandas. |
| 3 | **El perfil incompleto**: que el resumen de la persona no retroceda a un perfil peor, y que un reintento pida sólo lo que faltó y se consolide con lo anterior. | Sí a lo primero ya, como arreglo chico. Lo segundo después de los cuatro grupos, con una ventana de 7 días (la validez del perfil) y sin mezclar dos cortes del IESS. **Decisión del negocio (2026-11-18):** D3, opción (b): que un reintento pida sólo lo que faltó y se consolide con lo anterior. Los «cuatro grupos» son los de la sección 9 de este documento (1 comportamiento bancario y BIESS, 2 historial con la institución, 3 riesgo judicial, 4 laboral e ingresos). El arreglo chico (que el resumen no retroceda a un perfil peor) sigue siendo «ya». |
| 4 | **Los umbrales de los atenuantes y de «atraso corto»**: cuántos días es corto, cuánto tiene que bajar la deuda y contra qué consulta, cuánto tiene que subir el ingreso. | Atraso corto hasta 30 días; deuda 10% menor que en una consulta de 90 días o más atrás; ingreso por encima de la variación del SBU. Son propuestas sin medir: fijarlas contra el banco de casos de oro. **Decisión del negocio (2026-11-18):** R4, **abierta**: el negocio pide una propuesta parecida a la de R2 (umbrales de monto y de tiempo; un mal comportamiento pierde relevancia si el vigente lo superó; atenuantes y agravantes ordenados por importancia). Estos umbrales quedan sin decidir hasta esa propuesta. |
| 5 | **Bancos sin buró**: si una calificación en atraso se lee como días. | No: se mantiene la regla de hoy y la lectura dice «en atraso, sin días informados». **Decisión del negocio (2026-11-18):** D4, decidido con alcance acotado: cuando el modelo responde, nombra el atraso como «en atraso», sin los días de cada operación (lo recomendado). El negocio dijo que «los días son importantes» (25 días no es 300), pero no pidió leer la calificación como un rango de días; se mantiene la regla de hoy. |
| 6 | **Las demás operaciones con la institución**: hoy se reporta una. Con hechos se ven todas (cuántas, cuántas vigentes, la peor mora entre todas). | Mostrarlas en pantalla como procedencia desde el grupo 2; al modelo, recién con la versión mayor del marco y sin sumar ningún saldo. **Decisión del negocio (2026-11-18):** D5, decidido distinto: seguir con **una sola operación** con la institución (no mostrar todas desde el grupo 2). |
| 7 | **Super y Diners**: unir una operación que venga en las dos. | No decidir todavía: medir primero. Mientras tanto queda como diferencia. **Decisión del negocio (2026-11-18):** D6, decidido distinto: **unir** una operación que venga en las dos (la recomendación era medir primero). **Hecho en estructura-v26 (E8, 2026-11-20)**, con la medición: hoy no le pasa a nadie de las 3.766 y ningún perfil cambia; la unión queda puesta por si la fuente cambia. |

## 9. Orden de trabajo

1. Paso 0: cimientos y medición (un PR).
2. Grupo 1, etapa A: `comportamiento-bancario.ts` y `cooperativas.ts`, con sus casos.
   Comparación en seco sobre las 3.766.
3. Grupo 1, etapa B: la inversión.
4. Grupos 2 y 3, en paralelo (archivos distintos).
5. Grupo 4, con el diseño de la escalera del ingreso cerrado.
6. Las correcciones de la sección 6 que el negocio apruebe, cada una con su versión de la
   estructura.
7. Los demás grupos, el contrato del buró en código y las señales, antes de la versión
   mayor del marco.

Ningún paso despliega nada por sí solo hasta la etapa B del grupo 1, y `main` sigue con la
restricción de `docs/pendientes.md`: no se despliega hasta que marco-v36 esté lista.
