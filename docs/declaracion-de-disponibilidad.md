# Declaración de disponibilidad

Documento de diseño para revisar. Todavía no está implementado.

## Qué problema resuelve

El modelo recibe una estructura estandarizada. Cuando una sección viene
vacía, hoy no puede distinguir entre dos cosas que significan lo
contrario:

1. Se miró y la persona **realmente no tiene nada ahí**.
2. **Nadie pudo mirar**. No sabemos nada.

Las dos llegan al modelo como el mismo silencio. El 15 de septiembre esa
confusión convirtió una caída de red de una hora en un juicio sobre 373
personas, clasificadas como "informal o sin actividad" —la rama por
defecto— cuando en realidad no se había podido medir nada.

La declaración de disponibilidad es un bloque fijo que va **antes** de
los datos y dice, por cada dimensión de análisis, en cuál de esos
estados está. No cambia el marco interpretativo: lo alimenta.

## Habla de dimensiones, no de fuentes ni de configuración

Esta es la decisión de fondo del diseño.

El modelo **no se entera** de qué fuentes existen, cuáles se
consultaron, cuáles están apagadas ni por qué. Nada de eso es asunto
suyo: son decisiones de negocio y de plomería. Si se apagan los bancos
de Novadata porque Aval trae información más profunda del sistema
financiero ecuatoriano, la dimensión *sigue cubierta* y el modelo solo
necesita saber eso. Contarle el detalle sería invitarlo a razonar sobre
una decisión comercial que no le compete.

Lo único que el modelo necesita saber es **epistémico**: de cada
dimensión, ¿qué sabemos y qué no?

Eso separa limpiamente dos registros:

- **Al modelo va el estado epistémico**: qué se sabe. Por dimensión.
- **Al expediente guardado y a la pantalla del analista va el estado
  causal**: por qué. Qué fuente contestó, cuál falló, cuál estaba
  apagada y por decisión de quién.

El segundo es indispensable para auditar y para operar. Simplemente no
viaja al modelo.

## Los tres estados

Por cada dimensión de análisis:

| Estado | Qué significa | ¿Es evidencia? |
|---|---|---|
| `con_datos` | Se midió y hay información. | Sí |
| `sin_datos` | Se midió y no hay nada. | **Sí** — "no tiene deudas" es un hecho |
| `no_medido` | Nadie pudo o nadie la cubre. | **No** — es un hueco |

La distinción entre las dos primeras es la que hoy no existe y la que
más cuesta cuando falta. `sin_datos` es información positiva y el modelo
la puede usar. `no_medido` es ausencia de medición y no autoriza
ninguna conclusión.

`no_medido` junta a propósito dos causas muy distintas —una fuente que
falló y una dimensión que nadie cubre—. Para el modelo significan lo
mismo: no concluyas nada. Para nosotros no: una es un incidente y la
otra una decisión. Por eso se distinguen en el expediente y en pantalla,
no en el envío.

## Las reglas que recibe el marco

Van en el marco interpretativo, fijas, una sola vez:

1. Una dimensión en `no_medido` **nunca** es evidencia de ausencia. No
   se concluye "no tiene deudas", "no tiene ingresos" ni "es informal"
   a partir de un hueco.
2. Una dimensión en `sin_datos` **sí** es evidencia y se puede usar
   como tal.
3. Una dimensión `no_medido` no se evaluó: el análisis lo declara y
   **no penaliza a la persona** por algo que nadie miró.
4. Si la cobertura queda por debajo del mínimo evaluable, no se emite
   puntaje: se emite un informe que dice qué faltó.

## Cómo se ve en el envío

Bloque previo a los datos, en el mismo pedido:

```json
{
  "declaracionDeDisponibilidad": {
    "dimensiones": {
      "comportamiento_crediticio": "con_datos",
      "ingresos":                  "con_datos",
      "identidad":                 "con_datos",
      "datos_alternativos":        "no_medido"
    },
    "cobertura": {
      "evaluadas":   ["comportamiento_crediticio", "ingresos", "identidad"],
      "noEvaluadas": ["datos_alternativos"],
      "suficienteParaPuntaje": true
    }
  }
}
```

Eso es todo lo que ve el modelo. Ni un nombre de fuente, ni una bandera
de configuración.

## Interacción con las banderas por campo

Hay que separar dos situaciones que se parecen y no son lo mismo.

**Campo fuera del alcance del análisis.** Contactabilidad al detalle
—teléfono, dirección exacta— no aporta al juicio de crédito. Se
configura como `nunca_se_envia` y simplemente no existe para el modelo.
No se declara nada: no es un hueco, es el alcance.

**Campo dentro del alcance que vino vacío.** Acá sí importa. Si se
configura como "solo si hay datos", desaparece del envío y se
reintroduce, campo por campo, la misma ambigüedad que este bloque vino a
eliminar.

**Recomendación: para la proyección hacia el modelo, "solo si hay datos"
no se usa.** Los campos dentro del alcance viajan siempre, con `null`
explícito cuando están vacíos.

Y esa es, concretamente, la diferencia entre la vista del analista y la
del modelo:

- **Al humano le sirve esconder los campos vacíos**: menos ruido en
  pantalla, lee más rápido.
- **Al modelo le sirve verlos como `null` explícito**: un `null` dice
  "se miró y no había", y cuesta unos pocos tokens.

Misma estructura madre, dos proyecciones, cada una optimizada para quien
la lee.

Los tres estados de la proyección hacia el modelo quedan entonces:
`siempre_se_envia` (con `null` si está vacío) y `nunca_se_envia`. El
estado "solo si hay datos" existe únicamente en la proyección hacia el
usuario.

## Comparabilidad: decidido, no se compara

No hay comparabilidad entre configuraciones distintas, y es deliberado.
Cada cliente tiene su propio repositorio, sus propias fuentes y su
propio marco interpretativo: comparar entre clientes sería peras con
manzanas.

Tampoco se comparan todos los análisis históricos de un mismo cliente.
Si el año 1 usó Perfil Cliente + Ingresos, el año 2 sumó AltScore y el
año 3 sumó Aval, son tres poblaciones distintas juzgadas con tres
criterios distintos.

**La consecuencia que hay que resolver:** si nada es comparable, nada es
calibrable. El backtest y la mejora del criterio viven de comparar lo
predicho contra lo ocurrido sobre una población estable. Sin una unidad
de comparación, ese ciclo se queda sin base.

La unidad no es el cliente: es la **cohorte**, la tupla

```
(cliente, conjunto de fuentes, versión del marco, versión de la estructura)
```

Dentro de una cohorte todo es comparable y calibrable. Al cambiar
cualquiera de los cuatro componentes empieza una cohorte nueva: los
años 1, 2 y 3 del ejemplo son exactamente tres cohortes.

Por eso **cada análisis tiene que registrar su cohorte**. Con eso, "no
comparable" deja de ser una advertencia que alguien puede ignorar y pasa
a ser una condición verificable: dos análisis de cohortes distintas no
se promedian, y el sistema lo puede impedir en vez de confiar en que
nadie lo intente.

También define cuándo hace falta recalibrar: no cada tanto, sino cada
vez que nace una cohorte.

## Consecuencia sobre dónde vive el marco

Un marco interpretativo por cliente invalida una recomendación anterior.

Cuando el marco era uno solo, tenerlo como constante de TypeScript era
una ventaja: cambiar un criterio de crédito exigía un despliegue, con
revisión de código e historial de git como control.

Con un marco por cliente eso no escala: cada ajuste de criterio de
cualquier cliente pasaría por un despliegue del producto entero, y el
código quedaría cargado de política comercial de terceros.

El marco tiene que volverse dato, como ya lo son los ajustes vigentes.
Lo que se pierde —el control del despliegue— hay que reponerlo con
versionado inmutable y un paso de aprobación explícito antes de que una
versión entre en vigencia. Es más trabajo que una constante, y es la
única forma de que "cada cliente tiene su marco" no termine siendo
"cualquiera edita el criterio de crédito sin dejar rastro".
