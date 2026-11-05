---
name: revision-de-datos
description: Revisión de los DATOS de CrediScope a lo largo de la cadena — la fuente (Proveedor_Info_1, Equifax), la estructura estandarizada, el perfil de ingresos, el predictor, el cruce entre fuentes y la respuesta del modelo — para encontrar datos atípicos, inconsistencias y errores, ubicar en qué capa nacen, medirlos en la cartera y proponer la corrección. Corre `scripts/revisar-datos.mjs` (sólo lee, no cuesta) y crece con cada error nuevo. Usala cuando el negocio traiga un dato raro de un caso, cuando pidan «revisar los datos», «contrastar Equifax con Proveedor_Info_1», «buscar atípicos o inconsistencias», «validar la información», y después de un recálculo, de un cambio en process.ts, fuentes-ingreso.ts o el marco, o de una carga de Equifax. No es la QA de pantallas (qa-crediscope) ni la de textos (revision-ux).
---

# Revisión de datos

Entre el 2026-10-31 y el 2026-11-05 el negocio encontró a mano, mirando casos, errores
de todas las capas: un retail con corte de 2025, una pasantía de 2019 leída como cargo
vigente, préstamos del BIESS sin marcar, un «salario más alto» de 2018, un análisis
hecho con 41 fuentes caídas, un A2 leído como «sin atraso» y un RUC suspendido que la
pantalla de Equifax no mostraba. Cada uno costó una sesión. Esta habilidad hace que el
próximo lo encuentre el control, no el negocio, y que cada error encontrado a mano se
vuelva un detector para que no vuelva.

**Qué no mira.** Cómo se ve o se entiende una pantalla (`revision-ux`) ni los recorridos
de un usuario nuevo (`qa-crediscope`). Si un dato está bien en la base y mal en la
pantalla, el hallazgo es de pantalla: anotalo y pasalo a esas habilidades.

## Reglas

- **Sólo lee.** Nada de esta habilidad escribe en la base, llama al modelo ni consulta a
  Equifax. Una corrección es un PR aparte, con el circuito de siempre.
- **Equifax cobra.** Antes de pedir una consulta, mirar si ya hay una en
  `consultas_equifax` (también las migradas de AWS) y pedir el sí del negocio.
  Proveedor_Info_1 no cuesta, pero una reconsulta reemplaza el perfil.
- **El modelo, sólo con un sí y la cifra** (pruebas masivas, comparaciones de marcos). El
  2026-11-04 el negocio frenó toda prueba de marcos «mientras no depuremos todo».
- **Verificar contra la base.** Un conteo sin consultar es una suposición. Lo que no se
  pudo medir se dice «no medido», nunca cero.
- **Un caso se cita como `c-xxxxxxxx`** fuera de la base (commits, docs, código, el
  catálogo). En el chat los datos van completos (CLAUDE.md, «Cómo se trabaja»).

## Modo 1: revisar la cartera

```bash
node scripts/revisar-datos.mjs
```

Una sola consulta de sólo lectura con todos los detectores (`--capa=`, `--solo=`,
`--listar`, `--sql`). Por consola salen conteos «x de N», ejemplos y lo que cambió desde
la corrida anterior. El detalle, con montos y fechas, queda en
`research/revision-de-datos/` (fuera de git). Sale con 1 si una regresión volvió.

Cómo leer la salida, en este orden:

1. **`VOLVIÓ`**, una regresión: un error ya corregido apareció otra vez. Parar y buscar
   qué lo trajo de vuelta (un despliegue, un recálculo, un cambio de la fuente) antes de
   cualquier otra cosa.
2. **`revisar` sin `conocido`**: un hallazgo abierto. Ir al modo 2 con dos o tres
   ejemplos.
3. **`confirmar`**: el detector busca frases o umbrales y tiene falsos positivos. Mirar
   cinco casos en el JSON. Si sobran, afinar el detector (ver «Auto-mejora»).
4. **`conocido`**: ya está decidido qué hacer. Sólo importa si el número se movió mucho.
5. **«no medido»**: la población está vacía (no hay análisis de ese marco, no hay
   estimaciones). Decirlo así en el informe.

Después correr los controles que miden lo que este guion no repite (`--listar` los
nombra): `validar-perfil-del-modelo.mjs` sobre lo que lee el modelo,
`medir-solapamiento-equifax.mjs` sobre bancos y cooperativas por sistema, y
`conciliar-equifax.mjs` sobre Equifax contra sí mismo. Mientras
`estimaciones_de_ingreso` esté vacía, el predictor se mide con
`estimar-ingresos-en-lote.mjs`: corre el estimador sobre el último perfil de cada persona
sin guardar nada.

Después de un cambio en `process.ts`, `perfil-con-estructura-atrasada` marca a todos
hasta el recálculo, y la regresión que el cambio corrige sigue marcada hasta entonces.
Es lo esperado: se vuelve a correr después de recalcular.

## Modo 2: un dato raro de un caso

El negocio trae una persona y algo que no le cierra. El error nace en una capa y se ve
en todas las de abajo: **bajar por la cadena hasta la primera capa donde el dato ya está
mal**. Esa es la causa. Cómo mirar cada capa, en [cadena.md](cadena.md).

1. **Anotar lo que vio el negocio, tal cual**: qué dato, en qué pantalla o análisis,
   contra qué lo compara (otra fuente, otro dato del mismo perfil, el sentido común).
2. **Bajar la cadena**: la respuesta del modelo → lo que leyó (`mensaje_al_modelo`) → el
   perfil guardado (`standard_profile`) → el crudo de Proveedor_Info_1 (`leerCrudo()`) o
   la respuesta de Equifax (`respuesta_cruda`). Si el crudo ya trae el dato mal, es de
   la fuente.
3. **Antes de llamarlo error, descartar una diferencia legítima** entre fuentes (corte,
   rol, agrupación, fuente distinta del mismo dato). La lista de las que ya se vieron
   está en [cadena.md](cadena.md#diferencias-legítimas-entre-proveedor_info_1-y-equifax).
4. **Medir en la cartera.** Escribir el patrón como detector en
   `scripts/revision-de-datos/detectores.mjs` y correrlo con `--solo=<id>`. Un caso es
   una anécdota; «1.222 de 2.429» es una decisión.
5. **Clasificar la causa**:
   - de la fuente: no se corrige, se documenta y se compensa (otra fuente, una marca, un
     texto al modelo);
   - nuestra: en `process.ts`, `fuentes-ingreso.ts`, el predictor, el marco o la
     pantalla;
   - diferencia legítima: se explica donde se muestra el dato, para que no vuelva a
     parecer un error.
6. **Proponer la corrección con opciones**, sin decidir por el negocio: qué cambia, a
   cuántas personas alcanza, si sube la versión (estructura-vN, marco-vN, con su fila en
   `scoring_rules_versions`) y si tiene costo (modelo, Equifax).
7. **Registrar**: el detector queda en el catálogo con su `caso`. Si es una lección, va a
   `docs/lecciones.md`. Si se cita un caso nuevo, correr `registrar-casos-reales.mjs`.
8. **Después del arreglo**: correr el detector. Cuando da 0 en producción, pasa a
   `regresion`, y desde ahí cada corrida lo vigila. La integración continua no lo corre:
   necesita la base.

## El informe al negocio

Por capa y con los hallazgos abiertos primero:
- el número «x de N», y el cambio desde la corrida anterior;
- dos o tres casos `c-xxxxxxxx`, con el dato de cada fuente lado a lado;
- la capa donde nace, la causa, y la decisión que le toca al negocio, con opciones.

Lo «conocido» va en una línea al final. Nada de «todo bien» si hubo detectores no medidos.

## Auto-mejora

La habilidad mejora sola si cada corrida deja algo:

- **Error nuevo encontrado a mano** (por el negocio, por otra sesión, por vos): un
  detector nuevo, con su `caso` y la fecha. Un error que se encontró dos veces a mano es
  una falla de esta habilidad.
- **Falsos positivos en un `confirmar`**: afinar la consulta y dejar en un comentario por
  qué. La primera versión de `salario-mas-alto` comparaba contra la suma de los empleos y
  marcaba a quien tiene dos (60 casos); contra el empleo vigente más alto dio 0.
- **Un detector que copia una regla del código está mal**: importarla. La primera versión
  de `consulta-incompleta` copiaba 5 fuentes del freno, que el 2026-11-04 eran 21, y
  contaba 671 en vez de 770.
- **Un hallazgo que el negocio decidió**: `conocido` con lo decidido, para que el próximo
  no lo investigue otra vez.
- **Un arreglo en producción**: el detector pasa a `regresion`.
- **Un paso de esta guía que faltó o estaba mal**: corregirlo acá mismo.

Cada corrida que cambie algo de la habilidad deja una línea en
[bitacora.md](bitacora.md): fecha, qué se corrió, qué se encontró y qué cambió.
