---
name: qa-crediscope
description: QA de CrediScope con cinco usuarios de primera vez (el apurado, el escéptico, el del teléfono, el literal y el que rompe) que recorren la pantalla real en el navegador de vista previa, anotan dónde se confunden, se traban o se molestan, y terminan en una lista única ordenada por cuántos lo sufrieron, un arreglo en un PR y una segunda pasada que prueba que quedó. Usala cuando pidan «QA», «probar como un usuario nuevo», «los 5 usuarios», «antes de mostrarlo a una institución» o antes de una demo.
---

# QA con cinco usuarios de primera vez

La revisión de UX (`revision-ux`) mira pantalla por pantalla contra reglas. Esta
habilidad mira **recorridos**: alguien que nunca vio CrediScope quiere lograr algo
concreto y se lo deja de intentar en algún punto. Ese punto es el hallazgo.

Los cinco perfiles salen de una receta genérica de QA de lanzamiento, adaptada el
2026-11-04: CrediScope no tiene página de inicio, precios ni registro (las cuentas
las da de alta el admin), está en castellano y la usa **personal de crédito
capacitado**. Así que nadie se queja de que no se explique qué es una cuota (regla
de CLAUDE.md): se quejan de lo propio de CrediScope que no se entiende, de lo que
no anda y de lo que no se ve.

## Antes de empezar

1. **La sesión la abre el usuario.** Nunca se escribe una contraseña. Todo lo de
   `revision-ux/recorrido-qa.md` vale acá: puerto 5184, `resize_window`, el
   verificador, cómo entrar a un expediente sin escribir una cédula y sus trampas.
   Si el panel muestra el ingreso, pedirle que ingrese y esperar.
2. **Una sola sesión, uno tras otro** (decisión del 2026-11-04, por el límite de
   uso). Cinco agentes en paralelo comparten la misma sesión del navegador y gastan
   unas cinco veces más: sólo si el usuario lo pide con esas palabras.
3. **Tope por perfil: unas 25 acciones del navegador.** Si no llegó al objetivo en
   ese tope, eso ya es el hallazgo («no llegó»): se anota dónde quedó y se sigue
   con el próximo.
4. Las notas van a `<scratchpad>/qa-AAAA-MM-DD/notas.md`, **fuera del repositorio**:
   las capturas y las direcciones llevan cédulas. Ninguna captura se manda con
   `SendUserFile` ni se describe con la cédula.

## Lo que ningún perfil hace

Cada uno se cobra, consulta a una persona real o cambia datos de producción.

| No se aprieta | Por qué |
|---|---|
| Consultar / Reconsultar (Perfil, Expediente) | Consulta a una persona real en Proveedor_Info_1: una prueba en producción no consulta a personas |
| Analizar / Reconsultar y analizar | Llama al modelo: se cobra (`feedback-llm-solo-con-si-explicito`) |
| Consultar a Equifax | Se cobra USD 0,40 cada una |
| Crear una solicitud con una identificación válida, o Reintentar un paso | Corre el perfil y el modelo, y en Plus el buró |
| Nuevo lote, Configuración, Segmentos, Decisión de la institución, Laboratorio (cargas, cortes) | Cambian datos o lo que ven todos |
| Explorar (`/explorar`) | Pide usuario y contraseña de la fuente |
| Salir | Cierra la sesión del usuario y no la puedo reabrir |

Para probar **qué pasa** con esos botones (doble clic, error, botón trabado) se usa
el **cerrojo** (`cerrojo.js`, en esta carpeta): frena en la página todo lo que se
cobra, consulta o escribe, y cuenta cuántos envíos salieron. Con el cerrojo puesto
**y comprobado en la misma llamada**, un botón se aprieta sólo con
`__cerrojoQa.dobleClic('texto del botón')`, nunca con un clic de `computer`: una
recarga en el medio lo borra sin aviso.

```js
// javascript_tool, después de cada navigate o recarga
const r = await fetch('/.claude/skills/qa-crediscope/cerrojo.js'); (0, eval)(await r.text());
await __cerrojoQa.probar()            // "frena"
// cambiar de pantalla con pushState y después:
__cerrojoQa.leer().pasaron > 0        // las lecturas de la app pasan por el cerrojo
```

Si `pasaron` da 0, el cerrojo no protege nada: no se aprieta ningún botón de la tabla.
Una identificación para probar formularios es siempre **inválida** (provincia 99,
dígito verificador malo, letras): la función la rechaza antes de la fuente.

## Los cinco perfiles

Cada uno tiene **un objetivo** (su «primer éxito») y una forma de mirar. Se juega
el papel de verdad: el apurado no lee la ayuda ⓘ aunque yo sepa que está ahí.

**1. El apurado.** Analista con la fila de gente esperando. Hace clic en lo primero
que parece servir, no lee ayudas ni textos plegados y abandona al primer error o si
en dos pantallas no ve lo que busca.
Objetivo: desde Inicio, abrir el expediente de una persona ya consultada y decir su
score y su recomendación; después, la cuota de $5.000 a 36 meses en el Simulador.
Anota: clics hasta el dato, dónde dudó, dónde se fue.

**2. El escéptico.** Oficial de cumplimiento o jefe de riesgos que no confía hasta
ver de dónde sale todo. Lee cada ⓘ, cada «sin verificar», cada fecha.
Objetivo: en un expediente, decir de dónde sale el score, el ingreso y la deuda, de
qué fecha es cada uno, qué se le cobró a la institución por esa persona y qué queda
registrado en auditoría.
Anota: una cifra sin origen ni fecha, algo que se cobra sin decirlo, dos pantallas
que dicen distinto lo mismo (la tabla «Lo que tiene que decir lo mismo» de
`revision-ux/mapa-de-pantallas.md`), un dato de la persona tapado (va completo:
CLAUDE.md).

**3. El del teléfono.** Lo mismo que el apurado, en un teléfono de 375 px con una
red mala: `resize_window {width: 375, height: 812}`, recargar, poner el cerrojo y
`__cerrojoQa.lento(1500)`. Sigue hasta el formulario de Nueva solicitud, sin enviarlo.
Anota: desborde horizontal, un botón que no se puede tocar (menos de 44 px), una
tabla sin desplazamiento, una espera sin «Cargando...», un menú que no se encuentra.
Al terminar, `lento(0)` y `resize_window {preset: "desktop"}`.

**4. El literal.** Analista nuevo que hace sólo lo que la pantalla dice, palabra por
palabra: no adivina rutas, no conoce los nombres internos, no infiere lo que un
botón «seguramente» hace.
Objetivo: saber si a una persona le alcanza para $5.000 a 36 meses, partiendo de
Inicio y sin saber que existe «Capacidad de pago».
Anota: un botón cuyo nombre no dice lo que hace, un rótulo que no coincide con lo
que abre, un nombre de CrediScope que no se entiende sin haber estado en el diseño
(los nombres los decide el negocio: se proponen con opciones, `revision-ux/terminologia.md`),
un paso que la pantalla no indica.

**5. El que rompe.** Con el cerrojo puesto todo el tiempo.
Objetivo: dejar una pantalla trabada, en blanco o mostrando algo falso.
Prueba, en Inicio, Nueva solicitud, Simulador, Capacidad de pago y los filtros de
la Bandeja: cédula con letras, 9 y 11 dígitos, espacios y guiones, provincia 99,
dígito verificador malo; 5.000 caracteres pegados; emojis; montos negativos, 0,
1e9, «1.000,50» y «1,000.50»; plazo 0 y 999. El botón atrás a mitad de un
formulario. `dobleClic()` en cada botón que envía. Filtros absurdos en la URL
(`/solicitudes?segmento=xxx`), rutas que no existen (`/solicitud/no-existe`,
`/solicitudes/9900000000`). Recargar en el medio de una espera.
Anota: `repetidas()` con algo (el botón no se deshabilitó), una pantalla en blanco,
un `error.message` crudo, un filtro inválido que se muestra como «sin resultados»
en lugar de avisar, un valor absurdo que se acepta.

## Cada hallazgo

Una línea por hallazgo en las notas, con:
- el perfil y la pantalla (la ruta con la cédula tapada: `/perfil/#######`);
- qué intentaba, qué vio y qué esperaba;
- **confundido**, **trabado** o **molesto**;
- la captura (sólo para mí: queda en la conversación).

Antes de anotarlo como defecto, la tabla «Lo que el verificador marca y no es un
defecto» de `recorrido-qa.md` y las decisiones del negocio de `terminologia.md`: lo
que ya se decidió no se vuelve a proponer.

## La lista única

Al terminar los cinco, un hallazgo que dos perfiles vieron con palabras distintas
es uno solo. Se ordena por **cuántos perfiles lo sufrieron**, y a igual cantidad,
trabado antes que confundido antes que molesto. Cada fila dice además si es:

- **arreglo seguro**: un texto, un estado vacío, un botón que no se deshabilita, un
  desborde (se arregla en esta pasada);
- **para el negocio**: un nombre, un orden del menú, qué se muestra (se propone con
  opciones y no se toca);
- **de la base o de otra sesión**: se anota en `docs/pendientes.md` o se avisa.

La lista va al usuario en el chat, sin cédulas ni montos de personas.

## El arreglo y la segunda pasada

1. Una rama y **un PR** con los arreglos seguros (regla 10 de CLAUDE.md). Cada
   pantalla tocada pasa por `revision-ux` (control de textos, `probar-formatos.mjs`,
   verificador, capturas a 1280 y, si tiene tablas, 768 y 414), y `npm run lint` y
   `npm run build`.
2. **Segunda pasada**: los perfiles que tuvieron hallazgos repiten su objetivo,
   sólo sobre las pantallas tocadas. Cada hallazgo queda «arreglado», «sigue» o
   «no se pudo ver» (y por qué). Lo que sigue vuelve al paso 1 o se dice.
3. Nada se fusiona sin el sí del usuario (`feedback-cierre-de-sesion`).

## Al terminar

Decir qué perfiles corrieron y a qué ancho; cuántos hallazgos, cuántos se
arreglaron, cuántos son del negocio y cuántos de la base; qué quedó sin ver (una
pantalla que dio `statement timeout`, un perfil que agotó su tope) y el PR.
Lo que esta corrida enseñó sobre el procedimiento se corrige acá mismo.
