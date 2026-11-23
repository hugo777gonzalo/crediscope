# El estándar de la institución (diseño)

Tarea C1 de la reestructuración del núcleo. **Es un diseño: no hay código,
migración ni marco nuevo en este documento.** Fecha: 2026-11-16.

CrediScope es un analista con IA. El código calcula tres veredictos (riesgo,
capacidad de pago y controles); **el estándar de la institución** los combina
en una recomendación base; la IA pondera el caso completo dentro del margen que
el estándar le da y lo explica; y decide una persona de la institución. Este
documento define el estándar: qué forma tiene como dato, cómo se calculan los
veredictos que combina, la matriz Base, sus variantes, qué hace con cada
caso conocido y cómo se mide antes de encenderlo.

Cómo leer los valores:

- **Decidido** quiere decir que lo decidió el negocio (2026-11-11 y siguientes).
- **Medido** lleva su fecha y su población. Las cifras del 2026-11-12 y 13 son
  de 444 personas con recomendación (96 aprobar, 322 revisar, 25 negar) y los
  conteos por motivo son por palabras clave: son cotas, no mediciones exactas.
- **Propuesta sin medir** es un valor elegido con un porqué, que la comparación
  en seco de la sección 7 tiene que confirmar o cambiar antes de encender nada.
  Son la mayoría de los umbrales: se dice en cada uno.

Dos diseños hermanos de la ola 2 le dan sus entradas y no se repiten acá: la
**capa de hechos** (cada señal con su fuente, su fecha y su estado: medido, la
fuente dice que no hay, no medido) y la **escalera del ingreso** (cómo se arma
cada peldaño). El estándar sólo dice qué hace con lo que ellas entregan.

---

## 0. El recorrido de un caso

1. **Controles.** Con un control de bloqueo, la salida es Negar, el score es 1
   y no hay margen para la IA. Fin.
2. **Completitud de la consulta** (regla vigente, `FUENTES`): con una
   obligatoria sin respuesta no se analiza; con una secundaria de peso sin
   respuesta la salida no pasa de Revisar. El estándar no la afloja.
3. **Riesgo**: nivel, banda del score, señales y, si hay mal comportamiento,
   los atenuantes calculados.
4. **Ingreso**: el peldaño de evidencia y el ingreso que el estándar acepta.
5. **Capacidad**: el veredicto, la oferta que sí entra (si lo pedido no entra)
   y el ingreso necesario (si no hay con qué medir).
6. **Celda**: evidencia del ingreso por profundidad del historial, con sus
   límites.
7. **Matriz**: riesgo por capacidad da la **salida base**, con su motivo y los
   requisitos que se piden.
8. **Límites**: la salida base no pasa de lo que permiten los controles, la
   completitud y la celda.
9. **La IA** lee el caso completo, mueve la base dentro de su margen (sección
   1.6), pone el score dentro de la banda y explica.
10. **Decide una persona de la institución.** Se guarda la versión del
    estándar, los tres veredictos, la salida base, el movimiento de la IA y su
    motivo.

Las seis salidas, ordenadas en cinco escalones:

| Escalón | Salida | Qué quiere decir |
|---|---|---|
| 4 | Aprobación Directa | Lo pedido se aprueba sin más revisión. Sólo la otorga el código. |
| 3 | Aprobar | Se recomienda aprobar lo pedido; lo confirma la persona de la institución. |
| 2 | Cambio de Condiciones | Lo pedido no entra; otro monto o plazo, calculado, sí. En la v1 **equivale a aprobar** (S3, negocio, 2026-11-18). |
| 2 | Aprobado con Requisitos | Se aprueba al cumplirse un requisito del catálogo. Nombre de pantalla decidido el 2026-11-18 (S5, antes «Condicionado»); la clave interna sigue siendo `condicionado`. |
| 1 | Revisar | El caso pide criterio: hay una tensión que ningún documento ni otro monto resuelve. |
| 0 | Negar | No se recomienda. |

Cambio de Condiciones y Aprobado con Requisitos comparten escalón porque los dos son «sí,
con algo pendiente»; cuál de los dos sale lo decide la causa (la capacidad o un
requisito). Pueden darse juntos: otro monto y además un requisito.

**Decisión S3 (negocio, 2026-11-18): en la versión 1, Cambio de Condiciones
equivale a aprobar** («Aprobado con Cambio de Condiciones»). Al riesgo le
alcanza; lo que no alcanza es la capacidad de pago, y la oferta calculada la
resuelve. Por eso, hacia la API y hacia el banco de casos de oro, la salida
`cambio_de_condiciones` se traduce a `aprobar` (no a `revisar` ni a `negar`).
La recomendación previa (un escalón propio por debajo de Aprobar) queda como
alternativa para una versión posterior.
**Decisión S5 (2026-11-18):** el nombre de pantalla del escalón «con algo
pendiente» es **Aprobado con Requisitos**, no «Condicionado». Es un nombre de
pantalla: la clave `condicionado` del estándar, del contrato y del banco de
casos no cambia.

**El principio que ordena todo el diseño**, y la palanca principal para bajar
«revisar»:

> Lo que se resuelve con un documento es **Aprobado con Requisitos**. Lo que se resuelve
> con otro monto o plazo es **Cambio de Condiciones**. **Revisar** queda sólo
> para lo que pide criterio.

Hoy «revisar» junta las tres cosas. De los 322 «revisar», 282 mencionan una
deuda sin cuota informada y 195 un ingreso «Por confirmar»: son documentos que
faltan, no dudas de criterio.

---

## 1. La forma del estándar como dato

### 1.1 Dónde vive

- Una fila por versión en una tabla de cada base (hay una base por
  institución): `version` (`estandar-v1`, `estandar-v2`...), `plantilla` de
  origen, `contenido` (el JSON de 1.3), `huella` del contenido, `vigente_desde`,
  quién lo pidió y quién lo aplicó. Una sola versión vigente; las anteriores no
  se modifican ni se borran.
- Cada análisis guarda la versión y la huella del estándar con que se calculó,
  igual que hoy guarda la versión del marco: el mismo caso con el mismo estándar
  da la misma salida base.
- **El estándar no lleva texto libre que lea la IA.** Son parámetros, listas
  cerradas y tablas. Lo que la IA lee es el resultado (los veredictos, la salida
  base, su margen, los requisitos disponibles), no el estándar entero. Así, un
  cambio de apetito de una institución no es una versión nueva del marco.
- El código valida el estándar al cargarlo y se niega a calcular con uno
  inválido (una fracción escrita como 40 en vez de 0,40 aprobaba todo en
  `capacidad-de-pago.ts`; la misma lección vale acá).
- **Construido (F14, 2026-11-22; sin conectar).** El código está en
  `supabase/functions/_shared/estandar/`: `estandar.ts` (la forma y las listas
  cerradas), `plantillas.ts` (las tres de la sección 5), `validar-estandar.ts` (el
  validador: devuelve todos los errores juntos y registra el estándar que pasa; la escalera
  se niega a leer uno que no pasó), `configurar-estandar.ts` (una institución nueva es una
  plantilla más cambios en datos, y su huella sha256 canónica) y
  `lectura-de-la-escalera.ts` (lo que lee `evaluarEscalera()`). La tabla es
  `estandares_de_institucion` (migración 155, escrita y probada, **sin aplicar**): una fila
  por versión que sólo se inserta (un disparador impide modificarla o borrarla), RLS de
  lectura para analistas y administradores, y **la vigente no es una marca**: es la de mayor
  `vigente_desde` que ya empezó (`estandar_vigente()`), porque una marca obligaría a
  modificar la fila anterior. Nada la lee todavía; falta que cada análisis guarde la versión y
  la huella (se hace con la versión mayor del marco).

### 1.2 Las subsecciones y qué puede mover la institución

| Subsección | Qué define | Lo mueve la institución | Fijo en CrediScope |
|---|---|---|---|
| `controles` | Qué bloquea, qué pide verificación de identidad, qué es advertencia | El efecto de los controles configurables (OFAC sin identificación, providencias, PEP) | Fallecido, fraude documental, delito de seguridad ciudadana y lista de control con identificación coincidente bloquean siempre |
| `riesgo` | Las señales, sus umbrales, los niveles y la banda del score de cada uno | Los umbrales (calificación, días, ventanas) y, dentro de un rango, las bandas | Que A1 es la única calificación sin atraso; que el Comportamiento Interno no entra |
| `malComportamiento` | La definición y los atenuantes que se calculan | La definición (por señal), la ventana de la demanda de cobro, hasta dónde puede subir la IA | Que la base es Negar; que no hay número mínimo de atenuantes; que un atenuante no medido no cuenta ni a favor ni en contra |
| `ingreso` | Qué fracción del ingreso se acepta por peldaño de evidencia | Las fracciones y el factor de coherencia de lo declarado | El orden de los peldaños; que el predictor sin buró no entra en la capacidad |
| `capacidad` | Carga máxima, margen, carga extendida, cuota estimada de una deuda sin cuota, crédito de referencia | Todos | El aporte personal al IESS; que una deuda sin cuota nunca vale cero |
| `celdas` | Los límites de cada celda (salida máxima, monto, plazo, colateral) | Todos | Las nueve celdas y cómo se entra a cada una |
| `matriz` | Riesgo por capacidad → salida base | Cada casilla, dentro de las salidas que su fila admite | La fila de mal comportamiento (Negar) y el efecto de un bloqueo |
| `aprobacionDirecta` | Los criterios exactos | Apagarla, o endurecer o aflojar cada criterio dentro de un rango | Que la IA no la otorga |
| `margenDeLaIA` | Cuánto puede mover la IA la base | Reducirlo (hasta cero) | Un escalón como máximo fuera del mal comportamiento; nunca sobre un bloqueo |
| `requisitos` | El catálogo de lo que se puede pedir | Qué documentos acepta para cada requisito, y agregar los suyos | Los códigos que usa la matriz Base |

### 1.3 Esquema de ejemplo (plantilla Base, institución sin buró)

Es un ejemplo de la forma, con los valores propuestos en este documento. Las
fracciones van como fracción (0,40 es 40%) y los montos en dólares.

```json
{
  "version": "estandar-v1",
  "plantilla": "base",
  "vigenteDesde": "2026-12-01",
  "conBuroDeLaInstitucion": false,

  "controles": {
    "fijos": [
      "fallecido",
      "fraude_documental",
      "delito_de_seguridad_ciudadana",
      "lista_de_control_con_identificacion"
    ],
    "configurables": {
      "ofac_sin_identificacion": "verificar_identidad",
      "posible_homonimo_en_demanda_penal": "verificar_identidad",
      "cedula_inconsistente": "verificar_identidad",
      "providencia_de_retencion": "bloquea",
      "providencia_de_certificacion": "bloquea",
      "pep": "advertencia",
      "homonimo_en_lista": "informa",
      "lista_de_mal_pagador": "dato_de_comportamiento"
    },
    "efectos": {
      "bloquea": { "salida": "negar", "score": 1 },
      "verificar_identidad": { "salidaMaxima": "condicionado", "requisito": "verificacion_de_identidad" },
      "advertencia": { "salidaMaxima": "aprobar", "requisito": "debida_diligencia_reforzada" },
      "informa": {},
      "dato_de_comportamiento": {}
    },
    "consultaParcial": { "salidaMaxima": "revisar" }
  },

  "riesgo": {
    "bandasDelScore": {
      "bajo": [750, 999],
      "con_observaciones": [600, 749],
      "deteriorado": [400, 599],
      "mal_comportamiento": [1, 399]
    },
    "scoreMaximoSinHistorial": 799,
    "senales": {
      "calificacionEnBancos": {
        "con_observaciones": ["A2", "A3"],
        "deteriorado": ["B1", "B2", "C1", "C2"],
        "mal_comportamiento": ["D", "E"]
      },
      "diasDeMoraEnCooperativas": {
        "con_observaciones": [1, 30],
        "deteriorado": [31, 90],
        "malComportamientoDesde": 91
      },
      "diasDeMoraCreditoIessBiess": {
        "con_observaciones": [1, 30],
        "deteriorado": [31, 90],
        "malComportamientoDesde": 91
      },
      "retailAlCorte": { "deterioradoDesdeDias": 31, "malComportamientoDesdeDias": 91, "valorVencidoMinimo": 50 },
      "operacionCastigadaOEnCobroJudicial": "mal_comportamiento",
      "listaDeMalPagador": "mal_comportamiento",
      "comoGaranteBajaUnNivel": true,
      "pensionAlimenticiaEnMora": "deteriorado",
      "multasDeTransito": { "conObservacionesDesdeSalariosBasicos": 1 },
      "impedimentoParaCargosPublicos": "con_observaciones",
      "rucSuspendidoNoDepurado": "con_observaciones"
    }
  },

  "malComportamiento": {
    "demandaDeCobro": {
      "ventanaAnios": 2,
      "pesaMenosHastaAnios": 5,
      "nivelMientrasPesaMenos": "deteriorado",
      "cuentaSiDemanda": ["institucion_financiera", "empresa"],
      "deUnaPersonaNatural": "deteriorado",
      "reiteradas": { "cantidad": 3, "enAnios": 5 }
    },
    "atenuantes": {
      "hoyAlDia": { "calificacionAdmitida": ["A1"], "diasDeMoraAdmitidos": 0 },
      "endeudamientoALaBaja": { "bajaMinima": 0.10, "enMeses": 12, "sinBuro": "no_medido" },
      "estabilidad": { "mesesMinimos": 12 },
      "ingresoAlAlza": { "alzaMinima": 0.05, "compara": "ultimos_6_meses_contra_los_6_anteriores" }
    },
    "minimoDeAtenuantes": 0,
    "salidasQueLaIAPuedeRecomendar": ["negar", "revisar", "aprobar"],
    "bandaDelScoreSiLaIASube": [250, 599]
  },

  "ingreso": {
    "aceptadoPorPeldano": {
      "verificado_por_un_tercero": 1.0,
      "documentado": 1.0,
      "inferido_de_fuentes": 1.0,
      "declarado_coherente": 0.7,
      "declarado_sin_respaldo": 0.0,
      "estimado": 0.0
    },
    "declaradoCoherenteHastaVeces": 1.5,
    "cargaParaLaCotaPorCuotas": 0.75
  },

  "capacidad": {
    "cargaMaxima": 0.40,
    "margenJusto": 0.05,
    "cargaExtendida": {
      "hasta": 0.50,
      "exigeRiesgo": "bajo",
      "exigeHistorial": "probado",
      "exigeEvidencia": "verificado"
    },
    "cuotaEstimadaDeDeudaSinCuota": { "fraccionMensualDelSaldo": 0.035, "paraLaAprobacionDirecta": 0.05 },
    "creditoDeReferencia": { "monto": 5000, "plazoMeses": 36 }
  },

  "celdas": {
    "verificado/probado": { "salidaMaxima": "aprobacion_directa", "montoMaximoSinColateral": 15000 },
    "verificado/corto": { "salidaMaxima": "aprobar", "montoMaximoEnIngresos": 8, "montoMaximoSinColateral": 10000 },
    "verificado/sin_historial": { "salidaMaxima": "aprobar", "montoMaximoEnIngresos": 6, "plazoMaximoMeses": 24, "montoMaximoSinColateral": 5000 },
    "inferido/probado": { "salidaMaxima": "aprobar", "cuotaMaxima": "la_mayor_cuota_pagada_al_dia", "montoMaximoSinColateral": 10000 },
    "inferido/corto": { "salidaMaxima": "aprobar", "montoMaximoEnIngresos": 4, "montoMaximoSinColateral": 5000 },
    "inferido/sin_historial": { "salidaMaxima": "condicionado", "montoMaximoEnIngresos": 3, "plazoMaximoMeses": 24 },
    "sin_evidencia/probado": { "salidaMaxima": "condicionado" },
    "sin_evidencia/corto": { "salidaMaxima": "condicionado" },
    "sin_evidencia/sin_historial": { "salidaMaxima": "condicionado", "montoMaximo": 3000 }
  },

  "matriz": {
    "bajo": {
      "alcanza": "aprobar",
      "justo": "aprobar",
      "extendida": "aprobar",
      "alcanza_con_cambio": "cambio_de_condiciones",
      "no_alcanza": "negar",
      "sin_medir": "condicionado"
    },
    "con_observaciones": {
      "alcanza": "aprobar",
      "justo": "revisar",
      "extendida": "cambio_de_condiciones",
      "alcanza_con_cambio": "cambio_de_condiciones",
      "no_alcanza": "negar",
      "sin_medir": "condicionado"
    },
    "deteriorado": {
      "alcanza": "condicionado",
      "justo": "revisar",
      "extendida": "revisar",
      "alcanza_con_cambio": "revisar",
      "no_alcanza": "negar",
      "sin_medir": "revisar"
    },
    "mal_comportamiento": {
      "alcanza": "negar",
      "justo": "negar",
      "extendida": "negar",
      "alcanza_con_cambio": "negar",
      "no_alcanza": "negar",
      "sin_medir": "negar"
    }
  },

  "aprobacionDirecta": {
    "habilitada": true,
    "exigeControles": "limpio",
    "exigeConsulta": "completa",
    "diasMaximosDeLaConsulta": 30,
    "exigeRiesgo": "bajo",
    "aniosSinDemandaDeCobro": 5,
    "exigeCapacidad": "alcanza",
    "exigePeldano": "verificado_por_un_tercero",
    "exigeHistorial": "probado",
    "mesesMinimosDeEstabilidad": 12,
    "montoMaximo": 5000,
    "montoMaximoEnIngresos": 6,
    "plazoMaximoMeses": 36,
    "scoreMinimo": 750
  },

  "margenDeLaIA": {
    "escalonesHaciaArriba": 1,
    "escalonesHaciaAbajo": 1,
    "puedeOtorgarLaAprobacionDirecta": false,
    "puedeQuitarLaAprobacionDirecta": true,
    "puedeSubirDesdeCambioDeCondiciones": false,
    "exigeMotivoConUnHecho": true
  },

  "requisitos": {
    "sustento_de_ingreso": { "momento": "antes_de_aprobar", "llevaIngresoNecesario": true },
    "detalle_de_la_deuda_sin_cuota": { "momento": "antes_de_aprobar" },
    "certificado_de_estar_al_dia": { "momento": "antes_de_aprobar" },
    "certificado_del_juicio": { "momento": "antes_de_aprobar" },
    "certificado_de_pension_alimenticia": { "momento": "antes_de_aprobar" },
    "certificado_laboral_vigente": { "momento": "antes_de_aprobar" },
    "ruc_activo_y_declaraciones": { "momento": "antes_de_aprobar" },
    "aclaracion_entre_fuentes": { "momento": "antes_de_aprobar" },
    "verificacion_de_identidad": { "momento": "antes_de_aprobar" },
    "debida_diligencia_reforzada": { "momento": "antes_de_aprobar" },
    "constitucion_de_colateral": { "momento": "antes_de_desembolsar" },
    "actualizacion_de_datos": { "momento": "antes_de_desembolsar" }
  }
}
```

**La forma que quedó en código** (`_shared/estandar/estandar.ts`) cambia el ejemplo en
esto (F14):

- Los peldaños de `ingreso.aceptadoPorPeldano` llevan los nombres de la escalera en el código
  (`verificado_por_un_tercero`, `verificado_con_documento`, `cota_por_credito_otorgado`,
  `minimo_certificado`, `declarado_coherente`, `declarado_sin_respaldo`).
- `capacidad.cargaMaximaPorRiesgo` (C2; **aceptada por el negocio el 2026-11-23**: 60/50/40 en la Base, 50/45/35 en la Conservadora y 60/55/45 en la Optimista): 60, 50 y 40% para riesgo bajo, con observaciones y
  deteriorado (el mal comportamiento no tiene carga), sobre el neto disponible. **Propuesta sin
  medir** (el negocio pidió validar los porcentajes) y **no la lee nada**: la escalera sigue con
  `cargaMaxima` (40%). La carga extendida queda apagada en las tres plantillas (C2 la reemplaza)
  para no cambiar lo que mide la escalera de hoy.
- `capacidad.cuotaEstimadaDeDeudaSinCuota` es el factor por tramo de saldo de C1 (2,5 a 6,5%) y
  el del hipotecario sin plazo, no el 3,5% parejo. Las tres plantillas lo comparten. **La prueba de
  estrés de la Aprobación Directa** (`fraccionParaLaAprobacionDirecta`) es el tramo más alto de C1, 6,5% del
  saldo, para lo que no es hipotecario (negocio, 2026-11-23); el hipotecario usa su factor propio de 1,07%.
  El validador exige que no sea menor que ningún tramo. El negocio pidió para el hipotecario un factor de 1% a
  1,5% por su plazo largo: el 1,07% ya cae ahí.
- `riesgo.moraVigente` reemplaza a los días de cooperativas e IESS: los umbrales en
  dólares de R2 por sector (`sbs`, `seps`, `comercial`), con `revisionDeLosUmbrales` (cada
  enero; `proximaRevision` tiene que caer en enero). IESS y BIESS siguen por días mientras el
  perfil no traiga lo vencido (decisión 7 de R2 a R4).
- `productos`: el catálogo (monto, plazo, tasas, desgravamen, `pideGarante`, y `colateral`:
  `no_lo_pide`, `lo_pide_siempre` o `lo_pide_segun_la_celda`), por C4.
- `siSeSuperaElMontoSinColateral`: lo que se hace por encima del límite sin colateral de la
  celda (`cambio_de_condiciones` o `condicionado`), que elige cada institución (3.3).
- `aprobacionDirecta.habilitada` (C3) y `historialesAdmitidos` en vez de `exigeHistorial`: la
  Optimista la abre también en el historial corto. Una celda sólo llega a la Aprobación
  Directa si la institución la habilita.
- Un control más, `limita_a_revisar` (R5: la providencia de certificación).
- **Lo que sumaron las 14 decisiones de R2, R3 y R4 (E10, 2026-11-22)**, en `riesgo.moraVigente` (`montoQueSeCompara`,
  `bancosSinBuro`, `variosSectores`, `retailDelProveedor`), en `riesgo.historial` (`decaimientoEnMeses`, `superado`,
  `demandaDeCobroSuperadoBajaUnTramo`, `atrasoLargoDesdeDias`) y en `malComportamiento` (`atenuantesEnOrden`,
  `agravantesEnOrden`, `paraSubirHaceFaltaUnoDeLosPrimeros`, `conMoraDeHoyLaIAPuedeSubirHasta`, y los atenuantes
  `deudaVigenteAlDia` y `mesesAlDiaDesdeElUltimoAtraso`; `ingresoAlAlza` ya no lleva el 5%: se mide contra el SBU). Las
  claves `diasDeMoraEnCooperativas` y `diasDeMoraCreditoIessBiess` del ejemplo quedaron en `diasDeMoraIessBiess` (las
  cooperativas van por dólares). Las dos opciones de cada decisión son valores del estándar: la recomendada es la de las
  plantillas y la otra se elige por institución. La sección 2.6 dice qué hace cada una.

Notas del ejemplo:

- Las dos providencias quedan en `bloquea` porque así están hoy y el negocio
  todavía no las reclasificó (decisión 8.7).
- `minimoDeAtenuantes` está en el esquema para que se vea que es 0 y que está
  decidido; no es un parámetro que una plantilla cambie.
- Las claves van sin tildes (son nombres de código) y los valores son códigos
  de listas cerradas: el validador rechaza uno que no conoce.

---

## 2. El veredicto de riesgo

Lo calcula el código desde las señales duras. La IA no lo cambia: lo recibe,
con las señales que lo causaron, y trabaja dentro de su banda.

### 2.1 Qué se ve sin buró y qué no

| Fuente | Qué trae | Qué no trae |
|---|---|---|
| Bancos (central de riesgo del proveedor) | Calificación A1 a E por operación, saldo, si la persona es titular o garante (`riesgo` T, G o C), operación castigada o en cobro judicial | Días de mora, cuota, tipo de crédito, historia |
| Cooperativas | Días de mora al corte, cuota mensual, saldo, castigada o en cobro judicial | Historia |
| Retail | Días de mora y valor vencido **a su corte** (julio de 2025): es un dato histórico | Lo posterior al corte |
| IESS y BIESS | Días de mora de los préstamos | — |
| Función Judicial | Demandas de cobro como demandado, con su año y quién demanda | Si el juicio terminó y cómo |
| Otras | Pensión alimenticia en mora y su monto, multas de tránsito, impedimento para cargos públicos, lista de mal pagador | — |

**El Comportamiento Interno no es una señal** (decidido): el historial con la
institución se resalta como referencia cualitativa y no mueve el nivel, la
banda ni las cuotas. Tiene además una razón medida: en 69 personas el saldo
interno es la misma deuda que una operación de banco, vista dos veces.

La calificación no se traduce a días: en el crédito comercial no sale sólo de
ellos y el buró del proveedor no dice el tipo de crédito. Los umbrales de
bancos son letras; los de cooperativas, días.

### 2.2 Los cuatro niveles

Manda la peor señal. Una operación en la que la persona es **garante** baja un
nivel de gravedad (una D como garante cuenta como deteriorado): el atraso es de
otro, pero la obligación es suya si el otro no paga.

| Nivel | Banda del score | Entra con cualquiera de estas señales |
|---|---|---|
| **Bajo** | 750 a 999 | Ninguna de las de abajo. Todas las operaciones en A1, cooperativas en 0 días, sin demanda de cobro en los últimos 5 años |
| **Con observaciones** | 600 a 749 | A2 o A3 en bancos; 1 a 30 días en cooperativas o en el IESS; multas de tránsito por más de un Salario Básico Unificado; impedimento para cargos públicos sin problema de pago; RUC suspendido que no es una depuración del SRI |
| **Deteriorado** | 400 a 599 | B1 a C2 en bancos; 31 a 90 días en cooperativas o en el IESS; retail con 31 a 90 días a su corte; demanda de cobro de entre 2 y 5 años; demanda de cobro reciente puesta por una persona natural; pensión alimenticia en mora; una D o E como garante |
| **Mal comportamiento** | 1 a 399 | La definición de 2.3 |

**Desde el 2026-11-22 los umbrales de atraso de 2.2 y 2.3 son los de R2 y R3 (sección 2.6):** por sector (SBS, SEPS,
comercial), en dólares sobre lo vencido de las operaciones con más de 30 días, y sin buró los bancos por la letra.

Por qué esas bandas: hoy «aprobar» empieza en 745 y «revisar» llega a 800; los
scores se pisan (O-1). Con la banda atada al nivel dejan de pisarse, y 750
conserva el corte que el modelo ya venía usando para aprobar. El ancho mínimo
de una banda es 150 puntos: el mismo perfil analizado dos veces mueve el score
unos 40, así que una banda más angosta mediría ruido. **Propuesta sin medir.**

**Sin historial de crédito** no hay señales en contra, así que el nivel es
Bajo, pero el score no pasa de 799: no hay atraso, y tampoco prueba de pago.
«Sin historial» no es un mal historial (regla vigente del marco).

Dos reglas de lectura que el cálculo aplica siempre:

- **La letra manda sobre el monto.** Una operación B1 a E sin monto en atraso
  (53 menciones en «revisar»; el caso de O-4) vale por su calificación: el
  monto en cero no la desmiente. Lo que la desmiente es un documento
  (`certificado_de_estar_al_dia`).
- **Un atraso mínimo no es un atraso** cuando la fuente trae el monto: un valor
  vencido de menos de USD 50 en retail no sube de nivel. Propuesta sin medir;
  hay que ver cuántas personas mueve.

### 2.3 Qué es «mal comportamiento de pago»: la definición de la plantilla Base

Lo medido marca los dos extremos: con la definición amplia, 166 de 435
personas (38%), de las cuales 116 sólo por una demanda de cobro sin mirar su
antigüedad; con la estricta, 48 (11%). La propuesta queda entre las dos y hay
que medirla (sección 7): la hipótesis es que, de esas 116, sigue contando una
parte menor, porque de las 107 demandas de cobro medidas el 2026-10-07 (son
demandas, no personas, y de otra población: 200 personas) el 70% tenía más de
5 años y sólo 14 tenían menos de 2.

**Vigente** (la persona está hoy en esa situación):

1. Una operación propia en bancos calificada **D o E**.
2. **Más de 90 días** de mora al corte en una cooperativa o en un préstamo del
   IESS o del BIESS.
3. Una operación **castigada o en cobro judicial**, en bancos o cooperativas.
4. Estar en la **lista de mal pagador** del proveedor en etapa prejudicial,
   judicial o extrajudicial (reclasificada desde bloqueo, O-2). Los pagos o
   abonos registrados no la sacan de la definición: van como evidencia para la
   IA.

**Histórico** (pasó y dejó rastro):

5. Una **demanda de cobro** como demandado, puesta por una institución
   financiera o una empresa, con **2 años o menos** de antigüedad.
6. **Tres o más demandas de cobro en los últimos 5 años**, sea quien sea que
   demande: el patrón pesa aunque cada una sea vieja.
7. Retail con **más de 90 días** de mora a su corte y un valor vencido de USD
   50 o más.

Por qué D y 90 días y no antes: es el corte que Monitoreo ya usa para
`calificacion_baja` (más de 90 días; D empieza a los 91), y es el corte
habitual de incumplimiento. Entre B1 y C2 hay un atraso que todavía se puede
regularizar, y el diseño lo trata con un requisito (ponerse al día) en vez de
negar. Una institución Conservadora lo adelanta a C1 y 60 días (sección 5).
**Propuesta sin medir.**

**La antigüedad de la demanda de cobro es un parámetro** con tres tramos
(decidido que después de 2 años pesa menos; los cortes exactos son propuesta):

| Antigüedad | Efecto en la Base | Parámetro |
|---|---|---|
| Hasta 2 años | Mal comportamiento | `ventanaAnios: 2` |
| Más de 2 y hasta 5 años | Pesa menos: nivel Deteriorado, y se pide el certificado del juicio | `pesaMenosHastaAnios: 5` |
| Más de 5 años | Se menciona como antecedente; no mueve el nivel (salvo la regla de las tres demandas) | — |

El perfil hoy lleva sólo el **año** de cada demanda de cobro. Con el año, «2
años» puede ser casi 3: se cuenta dentro de la ventana si el año de la demanda
es el del análisis menos 2 o posterior. La fecha completa está en el crudo
(`demanda.fecha`, completa en todas las medidas) y la capa de hechos tiene que
traerla; hasta entonces la ventana real es más larga que la nominal, y se dice.

Una demanda puesta por una **persona natural** (no una institución ni una
empresa) cuenta como Deteriorado aunque sea reciente: puede ser una deuda
comercial o un conflicto entre particulares. Propuesta sin medir.

### 2.4 Los atenuantes

**Desde el 2026-11-22 los atenuantes llevan un orden de peso y la IA sólo sube con uno de los tres primeros: ver 2.6.**
La lista de esta sección (los cuatro de 2026-11-11) queda como la recomendación previa.

Se calculan sólo cuando hay mal comportamiento, y se entregan a la IA como
evidencia con su valor y su estado. **No hay número mínimo** (decidido): la IA
evalúa todo y recomienda negar, revisar o aprobar.

| Atenuante | Cómo se calcula | Lo medido sobre los 166 |
|---|---|---|
| **Hoy al día** | Todas las operaciones en A1, 0 días en cooperativas e IESS, sin operación castigada ni en cobro judicial | 103 |
| **Endeudamiento a la baja** | Con buró: el saldo total baja 10% o más en 12 meses sin operaciones nuevas. **Sin buró: no medido** | No se mide sin buró |
| **Estabilidad** | 12 meses o más de continuidad: en el empleo (dependiente) o con RUC activo (por cuenta propia), con las reglas vigentes de `continuidadLaboral` | 103 |
| **Ingreso al alza** | El ingreso reportado al IESS de los últimos 6 meses supera en 5% o más al de los 6 anteriores | 27 de 104 medibles |

Reglas:

- **Un atenuante no medido no es falso.** Se entrega como «no medido» y la IA
  no lo cuenta en contra. Sin buró, el endeudamiento a la baja siempre llega
  así.
- Además de los cuatro, la IA recibe los hechos del evento: antigüedad, quién
  demanda, cuántas veces, si la lista de mal pagador registra pagos o abonos, y
  si la persona es titular o garante.
- Un mal comportamiento **vigente** es, por definición, no estar al día: en
  esos casos quedan tres atenuantes posibles. Qué puede recomendar la IA ahí es
  la decisión 8.3.
- Cuando la IA sube la salida, el score puede llegar hasta 599
  (`bandaDelScoreSiLaIASube`); si mantiene Negar, queda entre 1 y 399.

### 2.5 Con buró (para después)

Se diseña primero sin buró. Con el buró de la institución cambian las señales,
no la forma: los bancos pasan a medirse en días (1 a 30, 31 a 90, más de 90,
como las cooperativas), aparece la cuota de cada operación (desaparece la cuota
estimada de 4.2), el mal comportamiento histórico se puede medir con la mora
máxima de los últimos 24 meses, y el endeudamiento a la baja pasa a medirse. El
score de Equifax entra como contraste, no como señal que mande. Los niveles,
las bandas y la matriz son los mismos.

### 2.6 Las 14 decisiones de R2, R3 y R4 (negocio, 2026-11-22: todas como se recomendaron)

Construido en `supabase/functions/_shared/riesgo/` (E10; sin conectar): funciones puras sobre la capa de hechos
(`entradaDeRiesgoDesdeHechos()`) y el estándar. La tabla dice dónde vive cada decisión como dato y cómo se prueba (una
prueba por decisión en `riesgo.test.ts`).

| # | Decisión | Dato del estándar | Código |
|---|---|---|---|
| 1 | Se compara lo vencido de las operaciones con más de 30 días, no el saldo en atraso | `moraVigente.montoQueSeCompara` | `mora-vigente.ts` |
| 2 | Bancos sin buró: manda la letra (A2 y A3 Aceptar, B1 a C2 Revisar, D y E Negar); con buró, los dólares | `moraVigente.bancosSinBuro`, `senales.calificacionEnBancos` | `mora-vigente.ts` |
| 3 | Tramo Revisar = Aprobado con Requisitos con `certificado_de_estar_al_dia` si la capacidad alcanza; si no, Revisar | `moraVigente.tramoRevisarConCapacidadQueAlcanza` | `salidaPorLaMora()` |
| 4 | Manda el peor sector, sin sumar; la mora en varios sectores es un agravante | `moraVigente.variosSectores` | `mora-vigente.ts`, `atenuantes.ts` |
| 5 | Más de 90 días, o D o E, con un monto chico: tramo mínimo Revisar | `moraVigente.masDeNoventaDiasConMontoTolerable`, `historial.atrasoLargoDesdeDias` | `mora-vigente.ts` |
| 6 | El retail del proveedor (corte de julio de 2025) es historial, no mora de hoy | `moraVigente.retailDelProveedor` | `historial.ts` |
| 7 | IESS y BIESS en el sector SBS, por días mientras el perfil no traiga lo vencido | `senales.diasDeMoraIessBiess` | `mora-vigente.ts` |
| 8 | Umbrales en dólares, revisados cada enero | `moraVigente.sectores`, `revisionDeLosUmbrales` | `umbralesPorRevisar()` |
| 9 | Con un tramo Negar (mora de hoy), la IA sube como mucho hasta Revisar | `malComportamiento.conMoraDeHoyLaIAPuedeSubirHasta` | `techoDeLaIA()` |
| 10 | Superado = hoy al día y una deuda formal (SBS o SEPS) al día de USD 500 o más; con buró, 6 meses sin mora de más de 30 días | `historial.superado` | `estaSuperado()` |
| 11 | Decaimiento de 6, 12 y 24 meses (la Conservadora, 12, 24 y 48) | `historial.decaimientoEnMeses` | `filaDelDecaimiento()` |
| 12 | Demanda de cobro: superado, baja un tramo de R1, salvo reincidencia | `historial.demandaDeCobroSuperadoBajaUnTramo` | `demandaDeCobro()` |
| 13 | El orden de los atenuantes y los agravantes es el de la propuesta | `malComportamiento.atenuantesEnOrden`, `agravantesEnOrden` | `evaluarAtenuantes()`, `evaluarAgravantes()` |
| 14 | Para que la IA suba hace falta un atenuante de los tres primeros | `malComportamiento.paraSubirHaceFaltaUnoDeLosPrimeros` | `puedeSubirLaIA()` |

**De los tramos al nivel (R3).** Cada sector da un tramo: no cuenta, Aceptar, Revisar o Negar; manda el peor. Aceptar aporta el nivel
con observaciones (llega a Aprobar, sin Aprobación Directa); Revisar, deteriorado (Aprobado con Requisitos con el certificado de estar al
día si la capacidad alcanza; si no, Revisar); Negar, mal comportamiento **vigente**: la base es Negar y la IA sube como mucho hasta
Revisar. Un garante baja un tramo. De 1 a 30 días no es tramo de R2: es atraso corto, con observaciones.

**El historial (R4).** Un evento es un mes con más de 30 días de mora y lo vencido por encima de la tolerancia de Aceptar (con buró),
o el retail con más de 30 días a su corte (si lo vencido llega a USD 50). Según los meses desde el último mes malo:

| Desde el último mes con mora (Base) | Superado | No superado |
|---|---|---|
| 0 a 6 meses | Revisar | el tramo de R2 con lo vencido de entonces (puede ser Negar) |
| 7 a 12 | Aceptar | Revisar |
| 13 a 24 | antecedente: se menciona, no limita | Aceptar |
| más de 24 | no se menciona | antecedente |

Un atraso de más de 90 días empieza una fila más arriba. Un mal comportamiento que sólo viene del historial es **histórico**: con la
persona hoy al día, la IA puede llegar hasta lo más alto que el estándar le deja recomendar.

**Los atenuantes, de mayor a menor peso:** deuda vigente al día en un banco o el BIESS (USD 500 o más); deuda vigente al día en una
cooperativa; 12 meses o más al día desde el último atraso (con buró; sin él, no medido); el atraso pasado fue chico (dentro de la
tolerancia de Revisar de su sector); estabilidad de 12 meses; endeudamiento a la baja de 10% en 12 meses (con buró; sin él, no
medido); ingreso al alza (más que el SBU del año); al día con una casa comercial. **Los agravantes:** reincidencia (dos o más episodios
de más de 30 días en 24 meses, o tres o más demandas de cobro en 5 años); un atraso pasado de más de 90 días; lo vencido de entonces
por encima de la tolerancia de Negar; un atraso en los últimos 6 meses aunque hoy esté al día; garante de una operación en atraso; mora
en más de un sector; pensión alimenticia en mora hasta USD 300 (R6; por encima, Revisar); retail en mora a su corte. Un atenuante no
medido no cuenta ni a favor ni en contra.

**Lo que propuse al construirlo.** El negocio aceptó el 2026-11-23 cuatro: la lista de mal pagador es la lista negra interna del proveedor
(`cum.lista_negra.existe`); una operación en atraso sin monto informado cuenta como Revisar y nunca como Aceptar; con la Conservadora la IA
no sube nada aunque su lista de salidas diga Revisar (el margen hacia arriba es cero); y las multas de tránsito, que no están en la capa de
hechos, salen «sin medir». **Siguen abiertas cuatro** (están como datos o como comportamiento y se pueden cambiar): una demanda de cobro sin
año cuenta como reciente, y la de un demandante que no se pudo clasificar, como de una empresa; «sin demanda» en «hoy al día» se leyó como sin
operación en demanda judicial o castigada (no como sin demandas de cobro: la decisión 12 las deja existir con la persona superada); en
cooperativas el saldo vigente lo da el saldo total, porque las operaciones no lo interpretan; y el retail con menos de USD 50 vencidos no es
evento (regla de 2.2), mientras que sin el monto sí lo es.

---

## 3. El ingreso aceptado y las celdas

### 3.1 Los peldaños de evidencia del ingreso

La escalera se diseña en su propio documento; acá va lo que el estándar hace
con cada peldaño. Las fracciones son **propuesta sin medir**: se miden contra
los 28.906 ingresos validados de la originación si esa base trae lo declarado
junto a lo validado; si no lo trae, quedan como propuesta hasta tener casos.

| Peldaño | Qué es | Se acepta | Columna de la celda |
|---|---|---|---|
| **Verificado por un tercero** | Sueldo reportado al IESS por un empleador que no es la propia persona ni un posible negocio familiar, vigente al corte; pensión de jubilación | 100%, menos el aporte personal al IESS | Verificado |
| **Documentado** | Rol de pagos, declaraciones al SRI, certificado, que la persona de la institución marca como recibido (hasta que exista el lector de documentos) | 100% de lo documentado | Verificado |
| **Inferido de fuentes** | Un monto que sale de un cálculo sobre fuentes: la base imponible desde el impuesto a la renta causado; la cota por cuotas pagadas al día (suma de cuotas al día dividida por 0,75) | 100%, como mínimo demostrado y no como ingreso real | Inferido o declarado coherente |
| **Declarado coherente** | El Ingreso declarado, cuando no supera 1,5 veces el mayor monto de los peldaños anteriores | 70% | Inferido o declarado coherente |
| **Declarado sin respaldo** | El Ingreso declarado sin nada con qué compararlo, o por encima de 1,5 veces | 0% para la capacidad; se muestra | Sin evidencia |
| **Estimado** | El predictor de ingresos | 0% sin buró | Sin evidencia |

Notas:

- **Un aporte propio sobre el Ingreso Mínimo SBU no muestra lo que gana la
  persona** (regla vigente): no es «verificado por un tercero». Vale como
  mínimo demostrado (inferido) por el monto del Salario Básico Unificado.
- **La cota por cuotas sirve para probar, no para crear espacio.** Si el
  ingreso es la suma de cuotas dividida por 0,75, la carga actual es 75% por
  construcción y ninguna cuota nueva entra con una carga máxima de 40%. Se usa
  para tres cosas: decir que el ingreso real es mayor que el reportado al IESS
  (cubre el 94,5% de los ingresos validados), dar contra qué comparar lo
  declarado, y habilitar el **reemplazo de cuota** (3.3, celda inferido con
  historial probado).
- **El predictor no entra en la capacidad sin buró** (medido: es débil, con un
  mínimo cerca de USD 1.000, y no mejora con lo guardado). Con buró su fracción
  se decide cuando se mida el nivel 2.
- Con un Ingreso declarado y un ingreso verificado a la vez, manda el
  verificado; el declarado que lo supera se anota como diferencia (hoy
  `conIngresoDeclarado()` hace que el declarado reemplace al del IESS: con la
  escalera deja de reemplazarlo).

### 3.2 La profundidad del historial de crédito (sin buró)

Sin buró no hay historia en el tiempo: sólo la foto de hoy. La profundidad se
mide con lo que la foto prueba.

| Profundidad | Entra si | Porqué |
|---|---|---|
| **Probado** | Deuda vigente al día en bancos o cooperativas por USD 5.000 o más, o dos o más operaciones vigentes al día | Otra entidad ya evaluó su capacidad y le prestó (O-5). USD 5.000 es el umbral que el negocio eligió para el detector «capacidad ya probada» (74 casos) |
| **Corto** | Alguna operación de crédito (banco, cooperativa, retail, IESS o BIESS) sin llegar a lo anterior | Hay comportamiento, poco |
| **Sin historial** | Ninguna operación de crédito | No hay nada que leer |

Con buró, la profundidad pasa a medirse en meses de historia (propuesta: 24 o
más, 6 a 24, menos de 6).

### 3.3 Las nueve celdas y su estrategia

Los montos y múltiplos son **propuesta sin medir**: los fija cada institución
según su producto (el de la plantilla va de USD 1.000 a 120.000 y de 6 a 120
meses). «Ingresos» quiere decir veces el ingreso mensual aceptado.

| | **Verificado** | **Inferido o declarado coherente** | **Sin evidencia** |
|---|---|---|---|
| **Probado** | **Núcleo.** Única celda con Aprobación Directa. El monto lo da la capacidad. Sin colateral hasta USD 15.000 | **Paga, y no se ve de qué.** Aprobar si la cuota nueva no supera la mayor cuota que ya paga al día (reemplazo de cuota); para más, Aprobado con Requisitos: sustento de ingreso. Sin colateral hasta USD 10.000 | **Historial sin ingreso.** Aprobado con Requisitos: sustento de ingreso, con el ingreso necesario calculado. Nunca Revisar sólo por el ingreso |
| **Corto** | **Sueldo con poco historial.** Aprobar hasta 8 ingresos; sin Aprobación Directa. Sin colateral hasta USD 10.000 | Aprobar hasta 4 ingresos; para más, Aprobado con Requisitos. Sin colateral hasta USD 5.000 | Aprobado con Requisitos: sustento de ingreso |
| **Sin historial** | **Primer crédito con sueldo.** Aprobar hasta 6 ingresos y 24 meses. Sin colateral hasta USD 5.000 | Aprobado con Requisitos: sustento; hasta 3 ingresos y 24 meses | **Nada que leer.** Aprobado con Requisitos: sustento de ingreso, hasta USD 3.000. Es la celda donde la IA más va a bajar a Revisar |

Cómo actúan los límites de una celda:

- **Salida máxima**: la base no pasa de ahí.
- **Monto o plazo por encima del límite**: la salida es Cambio de Condiciones,
  con el monto y el plazo del límite (calculados con `simularCredito()` y
  `montoMaximoParaCuota()`, nunca escritos por la IA).
- **Monto por encima de lo que se presta sin colateral**: cada institución
  elige en su estándar si eso es Cambio de Condiciones (el monto sin colateral)
  o Aprobado con Requisitos (`constitucion_de_colateral`). **Decisión C4
  (2026-11-18): el garante y el colateral son requisitos de cada institución**,
  no del estándar de CrediScope. El modelo sólo menciona que la persona tiene
  patrimonio que podría apalancar (si un analista de la institución lo
  determina); no pone el garante ni el colateral como condición propia. «Sin colateral» deja de ser un
  motivo para revisar (94 menciones): es un límite con una salida definida. Una
  institución cuyo producto ya trae el colateral (la automotriz) apaga el
  límite.

---

## 4. La matriz Base

### 4.1 El veredicto de capacidad que entra a la matriz

Extiende el de hoy (`alcanza`, `justo`, `no_alcanza`, `sin_ingreso` de
`capacidad-de-pago.ts`) con lo que hace falta para las seis salidas. La carga
es la suma de las cuotas actuales y la nueva sobre el ingreso aceptado.

| Veredicto | Cuándo | Base |
|---|---|---|
| **Alcanza** | La carga con lo pedido no pasa de la carga máxima menos el margen | Hasta 35% |
| **Justo** | Pasa de ahí y no supera la carga máxima | 35% a 40% |
| **Extendida** | Supera la carga máxima y no la extendida, y la persona cumple lo que la extendida exige (riesgo Bajo, historial probado, ingreso verificado) | 40% a 50% (C2, 2026-11-18: la carga va del 40 al 60% según el riesgo; ver abajo) |
| **Alcanza con cambio** | Lo pedido no entra, pero un monto o plazo dentro del producto y de la celda sí | Se entrega la oferta calculada |
| **No alcanza** | Ni el monto mínimo del producto al plazo máximo entra | — |
| **Sin medir** | No hay ingreso aceptado (celdas sin evidencia) | Se entrega el **ingreso necesario** |

Tres piezas nuevas:

- **Cuota estimada de una deuda sin cuota informada.** Hoy esa deuda se lista
  aparte y el caso va a revisar (282 de 322). Propuesta: estimarla en **3,5%
  del saldo por mes**, que es la cuota de un crédito a 36 meses con la Tasa
  máxima del producto (15,6%), y rotularla «estimada». Una deuda sin cuota
  sigue sin valer cero. **Propuesta sin medir**: se mide con las personas que
  tienen las dos fuentes, comparando la cuota real de Equifax con el saldo de
  la misma operación en el proveedor, y se elige el factor que deje por debajo
  a no más de una de cada cuatro.
- **Dependencia de lo estimado.** Si el veredicto cambia al quitar las cuotas
  estimadas (alcanza sin ellas y no con ellas), la salida es Aprobado con Requisitos a
  `detalle_de_la_deuda_sin_cuota` (tabla de amortización o estado de cuenta),
  no Revisar. Si no cambia, la deuda sin cuota se menciona y no mueve nada.
- **Ingreso necesario.** Con «sin medir», el código calcula el ingreso mensual
  que haría entrar lo pedido: cuotas actuales más la nueva, dividido por la
  carga máxima. El requisito sale con el número: «Sustentar un ingreso neto
  mensual de al menos USD X». Así el Aprobado con Requisitos es verificable aunque hoy no
  se sepa nada del ingreso.

Por qué una carga extendida: la carga máxima vigente es 40% (negocio,
2026-10-17), pero una de cada diez personas aprobadas y sin mora paga más del
61% de su ingreso validado, con una mediana cerca de 29%. Un 40% parejo deja
afuera a gente que paga. La extendida no sube el límite para todos: lo sube a
50% sólo donde hay más evidencia (riesgo Bajo, historial probado, ingreso
verificado), y nunca con Aprobación Directa. **Propuesta sin medir** (decisión
8.5).

**Decisión C2 (negocio, 2026-11-18): la carga máxima es variable, del 40 al
60% según el riesgo de la persona** (más riesgo, menos capacidad), y se calcula
sobre el **neto disponible** tal como lo define el negocio: sueldo validado más
ingresos extras (RUC), menos el gasto del hogar, menos los gastos financieros
(las cuotas de todos sus créditos, tarjetas incluidas), menos las pensiones,
menos las cuotas de quirografarios e hipotecarios vigentes del IESS o BIESS,
menos otros gastos identificables en la data. La capacidad de pago es el
porcentaje del neto disponible. Reemplaza al 40% parejo y a la extendida de 50%
de arriba, que quedan como la recomendación previa. **Abierto:** validar que
esos porcentajes se calculan sobre ese neto y no sobre el ingreso bruto, y qué
porcentaje corresponde a cada nivel de riesgo (sin medir contra la cartera).

**Sin solicitud de crédito** (una consulta de la persona, sin monto ni plazo)
no hay cuota. El veredicto se calcula con el **crédito de referencia** de la
institución (en la Base, USD 5.000 a 36 meses con la Tasa máxima) y se rotula
así. Es también lo que permite medir el estándar sobre las 444 personas, que
no tienen solicitud.

### 4.2 Riesgo por capacidad → salida base

| Riesgo ↓ / Capacidad → | Alcanza | Justo | Extendida | Alcanza con cambio | No alcanza | Sin medir |
|---|---|---|---|---|---|---|
| **Bajo** | Aprobar (Aprobación Directa si cumple 4.4) | Aprobar | Aprobar | Cambio de Condiciones | Negar | Aprobado con Requisitos |
| **Con observaciones** | Aprobar | Revisar | Cambio de Condiciones | Cambio de Condiciones | Negar | Aprobado con Requisitos |
| **Deteriorado** | Aprobado con Requisitos | Revisar | Revisar | Revisar | Negar | Revisar |
| **Mal comportamiento** | Negar | Negar | Negar | Negar | Negar | Negar |

El motivo de cada casilla:

| Casilla | Motivo |
|---|---|
| Bajo, alcanza | No hay señales en contra y lo pedido entra con margen |
| Bajo, justo | Entra dentro de la carga máxima; el margen chico quita la Aprobación Directa, no la aprobación |
| Bajo, extendida | Supera el 40% pero es la población donde se midió que la gente paga con cargas mayores |
| Bajo o con observaciones, con cambio | El problema es el monto, no la persona: se ofrece lo que entra |
| Bajo o con observaciones, sin medir | Falta un documento, no criterio: sustento de ingreso con el ingreso necesario |
| Con observaciones, alcanza | Un atraso de pocos días o una multa no cambian una capacidad holgada |
| Con observaciones, justo | Atraso leve con capacidad apretada: es la tensión entre comportamiento y capacidad que sí pide criterio |
| Con observaciones, extendida | La extendida exige riesgo Bajo: se ofrece lo que entra al 40% |
| Deteriorado, alcanza | El atraso se puede regularizar: se aprueba al ponerse al día (`certificado_de_estar_al_dia`) o, si es una demanda de 2 a 5 años, con el `certificado_del_juicio` |
| Deteriorado, resto | Atraso real con capacidad dudosa o sin medir: criterio |
| Cualquiera, no alcanza | Ni el mínimo del producto entra. Se ajusta abajo según la evidencia del ingreso |
| Mal comportamiento | Decidido: la base es Negar. La IA evalúa los atenuantes |

**Ajuste de «no alcanza» por la evidencia del ingreso.** Negar por capacidad
sólo es honesto cuando el ingreso es de verdad el que se midió:

- Ingreso verificado y cuotas informadas: Negar (motivo: capacidad).
- El resultado depende de cuotas estimadas: Aprobado con Requisitos a
  `detalle_de_la_deuda_sin_cuota`.
- Ingreso inferido o declarado, o la cota por cuotas dice que el ingreso real
  es mayor que el medido: Aprobado con Requisitos: `sustento_de_ingreso`, con el ingreso
  necesario.

### 4.3 Los controles y los límites, por encima de la matriz

Los controles no son una tercera dimensión que multiplique casillas: son un
límite sobre lo que la matriz dio. Se aplica el más restrictivo.

| Veredicto de controles | De dónde sale | Efecto |
|---|---|---|
| **Bloqueo** | Fallecido; fraude documental; delito de seguridad ciudadana (acusada, con su cédula, o demandada con el nombre cotejado); lista de control con identificación coincidente; providencias (hasta la decisión 8.7) | Negar, score 1, sin margen para la IA |
| **Verificación de identidad** | OFAC sin identificación (la coincidencia es sólo por nombre); posible homónimo en una demanda penal; la cédula de la fuente no coincide con la consultada | La salida no pasa de Aprobado con Requisitos, con `verificacion_de_identidad` |
| **Advertencia** | PEP | La salida no pasa de Aprobar (sin Aprobación Directa), con `debida_diligencia_reforzada` |
| **Informa** | Homónimo en una lista (la cédula del registro es otra) | Se muestra; no cambia la salida |
| **Limpio** | Nada de lo anterior | — |

La **lista de mal pagador** deja de ser un control: es una señal de riesgo
(2.3). El **fraude documental** de esa misma lista sigue bloqueando; se
distinguen por el texto de las observaciones, y esa regla se mide sobre el
crudo antes de entrar (son 39 y 1 en lo medido el 2026-10-07).

Otros límites:

- **Consulta parcial** (faltó una secundaria de peso): no pasa de Revisar.
  Regla vigente.
- **La celda**: su salida máxima y sus límites de monto, plazo y colateral.
- **Dos fuentes que no coinciden** (72 menciones): la capa de hechos dice cuál
  vale. Si la diferencia cambia un veredicto, la salida no pasa de Aprobado con Requisitos
  a `aclaracion_entre_fuentes`; si no lo cambia, se anota.

Con un bloqueo se guardan igual los veredictos de riesgo y capacidad (O-2,
opción 3): hoy lo que el modelo habría dicho se pierde y no se puede medir
cuánto cambia cada regla de bloqueo.

### 4.4 Los criterios exactos de la Aprobación Directa

La otorga sólo el código, cuando se cumplen **todos**. La IA puede quitarla
(pasa a Aprobar) y nunca otorgarla (decidido).

1. **Controles**: limpio. Ni bloqueo, ni verificación de identidad, ni PEP.
2. **Consulta**: completa (las 21 obligatorias y las 8 secundarias de peso
   contestaron) y con 30 días o menos.
3. **Riesgo**: Bajo, sin ninguna demanda de cobro como demandado en los
   últimos 5 años y sin operaciones como garante en atraso.
4. **Ingreso**: verificado por un tercero, vigente al corte del IESS, con 12
   meses o más de estabilidad. No vale un aporte propio ni un Ingreso declarado.
5. **Historial**: probado.
6. **Capacidad**: alcanza (carga de 35% o menos con lo pedido), **y sigue
   alcanzando** si cada deuda sin cuota informada que no es hipotecaria se estima en 6,5% del
   saldo (el tramo más alto de C1; negocio, 2026-11-23) en vez de su tramo; el hipotecario, con su factor propio. Sin buró la cuota de los bancos no consta: la Aprobación
   Directa sólo sale donde esa incertidumbre no cambia el resultado.
7. **Monto y plazo**: hasta USD 5.000 o 6 ingresos (lo menor) y hasta 36 meses.
8. **Fuentes**: ninguna diferencia entre fuentes que toque el ingreso, el
   empleo o la deuda.
9. **Score**: la IA lo puso en 750 o más y no quitó la Aprobación Directa.
10. **Solicitud**: hay una, con monto y plazo. Con el crédito de referencia no
    hay Aprobación Directa.

Todos los valores son **propuesta sin medir**. Lo que se espera de la medición
en seco es saber cuántas personas llegan (la hipótesis es que pocas: es a
propósito angosta sin buró) y que ninguna de las que llegan tenga hoy una
recomendación de negar.

### 4.5 El margen de la IA, exacto

| Base | La IA puede | La IA no puede |
|---|---|---|
| Aprobación Directa | Quitarla (queda Aprobar), nombrando el hecho | — |
| Aprobar | Bajar a Aprobado con Requisitos, eligiendo un requisito del catálogo | Otorgar la Aprobación Directa; bajar a Revisar o a Negar de un salto |
| Aprobado con Requisitos | Bajar a Revisar; subir a Aprobar sólo si el hecho que el requisito pedía ya está en el caso | Inventar un requisito fuera del catálogo |
| Cambio de Condiciones | Bajar a Revisar | Cambiar el monto o el plazo de la oferta. Subir a Aprobar ya no hace falta: en la v1 equivale a aprobar (S3) |
| Revisar | Subir a Aprobado con Requisitos, nombrando el requisito que resuelve la duda; bajar a Negar | Subir a Aprobar de un salto |
| Negar por capacidad | Subir a Revisar | — |
| Negar por mal comportamiento | Mantener Negar, o recomendar Revisar o Aprobar según los atenuantes y el caso completo | Otorgar la Aprobación Directa |
| Negar por un control de bloqueo | Explicarlo en términos de política de crédito | Moverlo |

En todos los casos:

- La salida final no pasa de los límites de 4.3, tampoco cuando la IA sube
  desde un mal comportamiento: si lo pedido no entra, lo más que sale es Cambio
  de Condiciones.
- Cada movimiento lleva un motivo atado a un hecho de la capa de hechos. Un
  movimiento sin hecho se descarta y queda la base.
- El score que la IA pone fuera de la banda se recorta a la banda y se anota.
- Se mide por institución qué porcentaje de casos mueve la IA y en qué
  dirección: si mueve casi todos hacia el mismo lado, lo que está mal es la
  matriz y se corrige ahí.

---

## 5. La plantilla Base y dos variantes de apetito

**Nombres decididos por el negocio (2026-11-23):** la plantilla «por defecto» se llama **Base**, la «expansiva» se llama **Optimista** y la «Conservadora» se queda. Las claves de código son `base`, `conservadora` y `optimista`.

Las tres comparten la forma, las reglas fijas y el catálogo de requisitos.
Cambian estos parámetros (todos **propuesta sin medir**):

| Parámetro | Conservadora | Base | Optimista |
|---|---|---|---|
| Mal comportamiento en bancos, desde | C1 | D | D |
| Mal comportamiento en cooperativas e IESS, desde | Más de 60 días | Más de 90 días | Más de 90 días |
| Deteriorado en bancos | B1 y B2 | B1 a C2 | C1 y C2 (B1 y B2 pasan a con observaciones) |
| Demanda de cobro: ventana de mal comportamiento | 3 años | 2 años | 2 años |
| Demanda de cobro: pesa menos hasta | 7 años | 5 años | 3 años |
| Demanda puesta por una persona natural | Cuenta como las demás | Deteriorado | Con observaciones |
| Pensión alimenticia en mora | Mal comportamiento | Tolerancia USD 300; por encima, Revisar; agravante menor (R6, 2026-11-18) | Igual que la Base |
| Con mal comportamiento, la IA puede recomendar | Negar o Revisar | Negar, Revisar o Aprobar | Negar, Revisar o Aprobar |
| Carga máxima | 35% | 40% | 45% |
| Carga extendida | No hay | Hasta 50% | Hasta 60% |
| Cuota estimada de una deuda sin cuota | 5% del saldo | 3,5% | 3% |
| Ingreso declarado coherente: se acepta | 50% | 70% | 85% |
| Declarado coherente: hasta cuántas veces | 1,25 | 1,5 | 2 |
| Historial probado: deuda al día desde | USD 8.000 | USD 5.000 | USD 3.000 |
| Con observaciones y capacidad justa | Revisar | Revisar | Aprobar |
| Deteriorado y alcanza | Revisar | Aprobado con Requisitos | Aprobado con Requisitos |
| Aprobación Directa | Apagada sin buró | Sin buró, activable por institución (C3, 2026-11-18); monto hasta USD 5.000, 36 meses | Monto hasta USD 10.000, 48 meses; también en verificado con historial corto |
| Primer crédito con sueldo (verificado, sin historial) | Hasta 4 ingresos, 18 meses | Hasta 6 ingresos, 24 meses | Hasta 8 ingresos, 36 meses |
| Sin evidencia y sin historial | Revisar | Aprobado con Requisitos, hasta USD 3.000 | Aprobado con Requisitos, hasta USD 5.000 |
| Monto sin colateral (celda núcleo) | USD 10.000 | USD 15.000 | USD 20.000 |
| Margen de la IA | Sólo hacia abajo | Un escalón, en las dos direcciones | Un escalón, en las dos direcciones |
| Bandas del score | Las mismas | Las mismas | Las mismas |

En código (F14, `_shared/estandar/plantillas.ts`) la tabla quedó así: los umbrales en dólares
y los bancos sin buró por la letra son los de la tabla de R2 (los demás valores de mora de esta tabla,
los días de cooperativas, los reemplaza R2); la carga máxima por riesgo es C2 (60, 50 y 40% en la Base; 50, 45 y 35% en la Conservadora; 60, 55 y 45% en la Optimista; aceptados por el negocio el 2026-11-23); la carga
extendida queda apagada en las tres, y la cuota estimada de una deuda sin cuota es la de C1 en las tres
(la fila de 5%, 3,5% y 3% quedó vieja).

Las variantes de R2 a R4 (2026-11-22): la tabla de decaimiento de la Conservadora dura el doble (12, 24 y 48 meses; la Base y
la Optimista, 6, 12 y 24); más de 90 días con un monto tolerable es Revisar en la Base y la Optimista y Negar en la Conservadora;
el resto de los valores de R2 de las tres están en `plantillas.ts`.

Qué cambia en la práctica:

- **Conservadora**: más gente en mal comportamiento (el corte se adelanta y la
  ventana de la demanda se alarga), la IA no sube nada, y lo que la plantilla
  Base resuelve con un requisito (deteriorado que alcanza, sin
  evidencia) vuelve a Revisar. Se espera más Negar y más Revisar.
- **Optimista**: mismo corte de mal comportamiento (no se relaja lo grave),
  pero el atraso leve pesa menos, la capacidad admite más carga y más ingreso
  declarado, y la Aprobación Directa se abre. Se espera más Aprobar y menos
  Revisar, con más riesgo en capacidad: es la variante que más necesita el
  contraste con lo que pasó (7.4).
- **Las bandas del score no cambian entre variantes**: el score mide el riesgo
  y tiene que querer decir lo mismo en todas las instituciones; lo que cambia
  con el apetito es qué se hace con ese riesgo.

---

## 6. Inventario de casos

Salida base con la plantilla Base. «Menciones» son las de los 322
«revisar» (cotas por palabras clave, 2026-11-12 y 13); una persona puede estar
en varias filas, y entonces manda la salida más restrictiva.

### 6.1 Los motivos medidos en «revisar»

| Caso | Menciones | Salida base | Qué se pide |
|---|---|---|---|
| Deuda sin cuota informada | 282 | La que dé la matriz con la cuota estimada. Aprobado con Requisitos sólo si el veredicto depende de la estimación | `detalle_de_la_deuda_sin_cuota`: tabla de amortización o estado de cuenta de esa deuda |
| Ingreso «Por confirmar» | 195 | Aprobado con Requisitos. Con historial probado y cuota nueva dentro del reemplazo de cuota: Aprobar | `sustento_de_ingreso`, con el ingreso necesario en dólares |
| Demanda de cobro | 108 | Hasta 2 años: Negar (mal comportamiento). De 2 a 5: Aprobado con Requisitos si alcanza, Revisar si no. Más de 5: no mueve | `certificado_del_juicio`: estado del proceso, o constancia de pago de la obligación |
| Dejó de aparecer en el IESS | 97 | El ingreso deja de ser verificado (no está vigente): Aprobado con Requisitos | `certificado_laboral_vigente`, o `sustento_de_ingreso` de la actividad actual |
| Sin colateral | 94 | No es un motivo. Monto dentro del límite sin colateral: sin efecto. Por encima: Cambio de Condiciones o Aprobado con Requisitos, según eligió la institución | `constitucion_de_colateral` |
| Dos fuentes no coinciden | 72 | Si la diferencia cambia un veredicto: Aprobado con Requisitos. Si no: se anota | `aclaracion_entre_fuentes`: el documento que dice cuál vale |
| Capacidad que no entra | 60 | Cambio de Condiciones si hay una oferta que entra; Aprobar si cae en la carga extendida; si no, el ajuste de 4.2 | La oferta calculada, o `sustento_de_ingreso` |
| Calificación en atraso sin monto | 53 | Manda la letra. A2 y A3: Aprobar si alcanza. B1 a C2: Aprobado con Requisitos. D y E: Negar | `certificado_de_estar_al_dia` de esa entidad |

### 6.2 Los motivos nuevos

| Caso | Menciones | Salida base | Qué se pide |
|---|---|---|---|
| Negocio propio con RUC activo, sin monto de ingreso | 148 | Aprobado con Requisitos. Con base imponible calculable desde el impuesto causado, pasa a inferido y sigue la matriz | `sustento_de_ingreso`: declaraciones del IVA de 6 meses o la de renta |
| Dirección o teléfono sin actualizar | 100 | No cambia la salida | `actualizacion_de_datos`, antes de desembolsar |
| Multas de tránsito | 84 | Hasta un Salario Básico Unificado: no mueve. Por encima: con observaciones | Nada |
| RUC suspendido o reactivado | 53 | Depurado por el SRI: neutro (regla vigente). Suspendido y es la única fuente de ingreso: Aprobado con Requisitos. Reactivado hace menos de 12 meses: no hay estabilidad; no mueve la salida | `ruc_activo_y_declaraciones` |
| Pensión alimenticia en mora | 47 | R6 (2026-11-18): tolerancia de USD 300, por encima Revisar; agravante menor si la persona está al día, estable y con capacidad aceptable (ni Deteriorado ni mal comportamiento directo); casos del banco `c-0ec2827c` y `c-659ed9c8` por revisar | `certificado_de_pension_alimenticia` al día |

### 6.3 Las observaciones del negocio

| Caso | Referencia | Salida base | Qué se pide |
|---|---|---|---|
| Riesgo bajo e historial excelente que hoy va a revisar (52; 63 sólo por el ingreso) | O-1 | Aprobar, o Aprobado con Requisitos si el ingreso no está evidenciado. Nunca Revisar sólo por el ingreso | `sustento_de_ingreso` |
| Por cuenta propia con créditos pagados al día (74 con deuda al día de USD 5.000 o más) | O-1, O-5 | Historial probado. Aprobar dentro del reemplazo de cuota; para más, Aprobado con Requisitos | `sustento_de_ingreso` |
| Afiliación voluntaria con el Ingreso Mínimo SBU | O-5 | El aporte no muestra lo que gana: ingreso inferido por el SBU o por la cota por cuotas. Igual que la fila anterior | `sustento_de_ingreso` |
| OFAC sin identificación (10 personas) | O-2 | Aprobado con Requisitos como máximo | `verificacion_de_identidad` contra el registro de la lista |
| Lista de mal pagador (39) | O-2 | Negar (mal comportamiento vigente). Los pagos o abonos van como evidencia para la IA | — |
| Fraude documental (1) | O-2 | Negar por bloqueo | — |
| Delito de seguridad ciudadana (24); fallecido (4) | O-2 | Negar por bloqueo | — |
| Providencias (5; 4 serían sólo certificación) | O-2 | Negar por bloqueo, hasta la decisión 8.7 | — |
| PEP (39) | O-2 | La de la matriz, sin Aprobación Directa | `debida_diligencia_reforzada` |
| Homónimo en una lista (49) | O-2 | No cambia | Nada; se muestra |
| Demanda vieja que pesa como nueva (56 de más de 2 años) | O-3 | La fila de la demanda de cobro de 6.1 | `certificado_del_juicio` |
| B2 leída como «sin atraso» | O-4 | La fila de la calificación sin monto de 6.1: Deteriorado | `certificado_de_estar_al_dia` |
| Saldo interno igual a una operación de banco (69) | Detectores | El Comportamiento Interno no entra en la deuda ni en las cuotas: no se cuenta dos veces | Nada |

### 6.4 Otros casos que la matriz tiene que contestar

| Caso | Salida base | Qué se pide |
|---|---|---|
| Dependiente con sueldo verificado y sin historial de crédito | Aprobar hasta 6 ingresos y 24 meses; por encima, Cambio de Condiciones | Nada |
| Garante de una operación en atraso | El atraso baja un nivel de gravedad; sin Aprobación Directa | `certificado_de_estar_al_dia` de la operación garantizada |
| Retail en mora a su corte (julio de 2025) | 31 a 90 días: Deteriorado. Más de 90 con USD 50 o más vencidos: Negar (mal comportamiento histórico) | `certificado_de_estar_al_dia` de la casa comercial, como evidencia de hoy al día |
| Impedimento para cargos públicos por deuda con el Estado, sin problemas de pago | Con observaciones (regla vigente del marco: no alcanza para negar) | Constancia de la deuda, dentro de `certificado_de_estar_al_dia` |
| Mal comportamiento histórico, hoy al día, con estabilidad | Negar de base; es el caso donde la IA tiene más evidencia para subir | Lo que la IA nombre del catálogo |
| Consulta parcial | Revisar como máximo (regla vigente) | Repetir la consulta |
| Consulta incompleta | No se analiza (regla vigente) | — |
| Sin ingreso evidenciado y sin historial | Aprobado con Requisitos, hasta USD 3.000 | `sustento_de_ingreso` |

---

## 7. Cómo se mide antes de encenderlo

Nada de esto se enciende sin medir. El orden va de lo que no cuesta a lo que
cuesta, y cada etapa tiene una condición para pasar a la siguiente.

### 7.1 Las etapas

| Etapa | Qué se hace | Costo | Condición para seguir |
|---|---|---|---|
| **0. Detectores sobre el crudo** | Cada regla que une, elige o descarta registros (antigüedad de la demanda, quién demanda, mal pagador contra fraude documental, titular contra garante, la cuota estimada) se mide con un detector sobre el crudo antes de entrar, y se cuenta cuántas filas trae cada persona | Ninguno | Ningún detector marca más de lo esperado sin explicación |
| **1. Seco sin modelo** | Un guion de sólo lectura calcula, para las 444 personas con recomendación y con el crédito de referencia, los tres veredictos, la celda y la salida base. Se corre con las tres plantillas | Ninguno | Las condiciones de 7.3 |
| **2. Casos de oro** | El banco de 25 casos de oro (PR #159) con su salida esperada por el negocio, contra la salida base | Ninguno | Coinciden, o cada diferencia tiene dueño: la matriz o el caso |
| **3. Muestra con la IA** | Sobre una muestra elegida por celda y por nivel de riesgo, la IA recibe los veredictos y su margen. Se mide cuánto y hacia dónde mueve | **Con autorización explícita y el costo estimado antes** (el lote de 200 costó USD 3,55) | La IA mueve una minoría de casos y no siempre hacia el mismo lado |
| **4. Revisión a ciegas** | La habilidad `revision-del-analisis` (el jefe de crédito) dictamina a ciegas los casos que cambian de salida y los que salen con Aprobación Directa | El de la revisión | Ningún error de criterio grave sin corregir |
| **5. En sombra** | El estándar corre junto a la recomendación vigente y se guarda sin mostrarse | Ninguno adicional sin la IA | Dos semanas sin sorpresas en las cifras de 7.2 |

### 7.2 Qué se compara

1. **Contra la recomendación vigente**: una tabla de la recomendación de hoy
   (aprobar, revisar, negar) por la salida base nueva (las seis), con el motivo
   de cada salto. Las casillas que importan:
   - de **negar** a Aprobar o Aprobación Directa: tiene que ser cero, o cada
     caso explicado (por ejemplo, un bloqueo reclasificado);
   - de **aprobar** a Negar o Revisar: cada caso, a la revisión a ciegas;
   - de **revisar** a cada salida: es la cifra que se busca mover.
2. **Contra la referencia 61 / 36 / 2** de la originación automotriz. Con seis
   salidas hay dos lecturas, y se informan las dos:
   - **estricta**: «aprobar» es Aprobación Directa más Aprobar;
   - **amplia**: se suman Cambio de Condiciones y Aprobado con Requisitos, que la persona
     de la institución cierra sin tener que formarse un criterio.

   Hoy CrediScope está en 21,6 / 72,5 / 5,6. La referencia es un norte, no una
   meta a forzar: es de una institución con buró y con el vehículo como
   colateral, y de otra población. Lo que sí se exige es que **Revisar baje**,
   y que lo que salga de Revisar vaya a una salida con una acción concreta.
3. **Por celda y por nivel de riesgo**: cuántas personas hay en cada una. Una
   celda vacía o una con la mitad de la cartera dicen que los cortes están mal
   puestos.

### 7.3 Condiciones del seco (etapa 1)

- Ninguna persona con un control de bloqueo vigente sale con otra cosa que
  Negar.
- Ninguna de las 25 que hoy son negar llega a Aprobar o Aprobación Directa sin
  explicación caso por caso.
- Las personas que salen con Aprobación Directa se revisan todas a mano: se
  esperan pocas, y es la única salida que nadie más mira.
- Revisar queda por debajo del 72,5% de hoy en las tres plantillas, y por
  debajo de 50% en la Base. **El 50% es una propuesta de umbral, sin
  medir**: si no se llega, se mira qué motivo retiene más casos y se discute
  ese parámetro, no se fuerza la cifra.
- Cada salida Aprobado con Requisitos tiene al menos un requisito del catálogo, y cada
  Cambio de Condiciones, una oferta calculada.
- Lo que no se pudo medir se informa como no medido, no como cero: sin crudo,
  sin año de la demanda, sin cuota, atenuante no medido.

### 7.4 Contraste con lo que pasó

Donde se conoce el resultado (la decisión real de la institución sobre la
solicitud; la cartera con Comportamiento Interno), se compara la salida base
con lo que pasó: la proporción de «Mal pagador» interno por salida tiene que
crecer de Aprobación Directa a Negar. Es indicativo y se dice: el perfil es
posterior a parte de ese comportamiento, y el Comportamiento Interno no entra
en el cálculo justamente para que este contraste no se conteste solo. Las 240
personas sintéticas quedan afuera.

### 7.5 Qué cifra debería mover cada parámetro

Las cifras de partida son las medidas; el efecto es la hipótesis que el seco
confirma o desmiente.

| Parámetro | Cifra que mueve | Partida | Efecto esperado |
|---|---|---|---|
| Ventana de la demanda de cobro (2 años) y tramo que pesa menos (5) | Personas en mal comportamiento | 166 de 435 (amplia), 116 sólo por demanda; 48 (estricta) | Baja hacia la estricta; las de 2 a 5 años pasan a Deteriorado |
| Corte de mal comportamiento vigente (D, 90 días) | Personas en mal comportamiento y en Deteriorado | Sin medir con este corte (entre 48 y 166) | Con C1 y 60 días, suben los Negar |
| Cuota estimada de la deuda sin cuota (3,5%) | «Revisar» por deuda sin cuota | 282 menciones | Pasan a tener un veredicto de capacidad; a Aprobado con Requisitos sólo las que dependen de la estimación |
| Aprobado con Requisitos: sustento con ingreso necesario | «Revisar» por ingreso «Por confirmar» y por negocio propio sin monto | 195 y 148 menciones | Pasan de Revisar a Aprobado con Requisitos |
| Reemplazo de cuota y celda de historial probado | Por cuenta propia aprobados | 1 de cada 55 independientes (2026-10-07); 74 con capacidad ya probada | Una parte pasa a Aprobar |
| Monto que se presta sin colateral | «Revisar» por falta de colateral | 94 menciones | Sale de Revisar: sin efecto, Cambio de Condiciones o Aprobado con Requisitos |
| Carga máxima y carga extendida | «Revisar» por capacidad que no entra | 60 menciones | Parte a Cambio de Condiciones, parte a Aprobar por la extendida |
| La letra manda sobre el monto | Calificación en atraso sin monto | 53 menciones | A2 y A3 salen de Revisar; B1 a C2 van a Aprobado con Requisitos |
| Certificado laboral vigente | Dejó de aparecer en el IESS | 97 menciones | A Aprobado con Requisitos |
| Aclaración entre fuentes | Dos fuentes no coinciden | 72 menciones | A Aprobado con Requisitos sólo las que cambian un veredicto |
| Pensión alimenticia en mora (R6: tolerancia USD 300) | Pensión en mora | 47 menciones | Hasta USD 300, agravante menor; por encima, Revisar |
| OFAC sin identificación a verificación; lista de mal pagador a comportamiento | Bloqueos | 10 y 39 personas (2026-10-07) | 10 salen de Negar a Aprobado con Requisitos; 39 siguen en Negar, ahora con atenuantes y con su análisis guardado |
| Criterios de la Aprobación Directa | Personas con Aprobación Directa | 0 hoy | Pocas; se cuenta cuántas quita cada criterio |
| Margen de la IA | Casos movidos y dirección | Sin medir | Una minoría, en las dos direcciones |

### 7.6 Lo que este diseño no resuelve

- **El proveedor sigue caído** (7 de 52 fuentes en la prueba del 2026-11-12):
  con consultas incompletas ningún estándar baja «revisar».
- **Sin buró, el endeudamiento a la baja no se mide** y la cuota de los bancos
  es una estimación: la capacidad sin buró es menos firme que con él, y por eso
  la Aprobación Directa es angosta.
- **Los umbrales son propuestas.** Con 444 personas, varias celdas van a tener
  pocas decenas de casos: lo que se mida ahí es una señal, no una calibración.
- **Las seis salidas cambian lo que se entrega.** La especificación de la API
  (`api/openapi.yaml`), la bandeja, el estado de la persona y el esquema de la
  respuesta del modelo hablan hoy de aprobar, revisar y negar: adaptarlos es
  trabajo aparte, y este documento no lo diseña.

---

## 8. Decisiones que quedan para el negocio

Cada una con la recomendación de este diseño y, en **Decisión**, lo que
respondió el negocio el 2026-11-18 (las de la capa de hechos y las de la
escalera del ingreso están en sus propios documentos).

1. **Los tramos de la demanda de cobro**: hasta 2 años es mal comportamiento;
   de 2 a 5 pesa menos (Deteriorado, con certificado del juicio); más de 5 sólo
   se menciona, salvo tres o más en 5 años. **Recomendación: sí**, y medir con
   la fecha completa del crudo, no con el año.
2. **El corte del mal comportamiento vigente**: D o más de 90 días, contra C1
   o más de 60. **Recomendación: D y 90 días** en la plantilla Base,
   que es el corte de Monitoreo; C1 y 60 queda para la Conservadora.
3. **Con un mal comportamiento que sigue vigente, ¿la IA puede llegar a
   Aprobar?** Lo decidido dice que puede recomendar negar, revisar o aprobar, y
   así está la plantilla. **Recomendación: que con la mora todavía vigente lo
   más que pueda recomendar sea Revisar**, y que Aprobar quede para el
   histórico con la persona hoy al día. Aprobar a quien hoy no paga es difícil
   de sostener ante la institución, y «hoy al día» es el atenuante que más
   pesa.
4. **Estimar la cuota de una deuda sin cuota informada** (3,5% del saldo) en
   vez de mandar el caso a revisar. **Recomendación: sí**, después de medir el
   factor contra las cuotas de Equifax de quienes tienen las dos fuentes. Es el
   parámetro que más «revisar» toca (282 menciones).
5. **Carga extendida hasta 50%** para riesgo Bajo con historial probado e
   ingreso verificado. **Recomendación: sí**, sin Aprobación Directa: lo
   medido dice que el 40% parejo deja afuera a gente que paga.
6. **Aprobación Directa sin buró**: permitirla o no. **Recomendación:
   permitirla angosta** (los diez criterios de 4.4, hasta USD 5.000 y 36
   meses) y abrirla con datos; apagada en la Conservadora.
7. **Providencias**: hoy bloquean todas. **Recomendación: la de certificación
   (un pedido de información) pasa a advertencia con la salida en Revisar como
   máximo; la de retención sigue bloqueando.** Pide distinguirlas por el texto
   y confirmar que la persona es la implicada, medido sobre el crudo.
8. **Pensión alimenticia en mora**: Deteriorado (se aprueba al presentar el
   certificado al día) o mal comportamiento. **Recomendación: Deteriorado**: es
   una obligación familiar con su propio apremio, no un crédito impago; la
   Conservadora la sube.
9. **Quién cambia el estándar de una institución.** **Recomendación: en la
   primera versión lo cambia CrediScope a pedido escrito de la institución**,
   con versión nueva y la comparación en seco de ese cambio como constancia;
   la pantalla para que la institución lo edite, después.

### Lo que decidió el negocio (2026-11-22): R2, R3 y R4

Aceptó como se recomendaron las 14 decisiones de la propuesta «R2, R3 y R4» (sección 2.6). **Cierra el punto 3 de esta lista**: con un tramo
Negar (mora de hoy), la IA sube como mucho hasta Revisar, nunca a Aprobar; Aprobar queda para el mal comportamiento histórico con la persona
hoy al día. Cierra también R2, R3 y R4 de «Abiertas». Queda abierto de R4 lo que no se midió: los días de bancos sin buró y lo vencido de
una B o C (el proveedor no los trae), lo vencido de los préstamos del IESS y el BIESS, el tiempo al día sin buró y más de 24 meses de historia.

### Lo que decidió el negocio (2026-11-18)

Aceptadas como se recomendaron: la 4 (estimar la cuota, 3,5% del saldo, tras medir
el factor; C1), la 7 (providencias; R5: la de certificación pasa a advertencia con
salida máxima Revisar, la de retención bloquea) y la 9 (el estándar lo cambia
CrediScope a pedido escrito, con versión nueva y comparación en seco; O1). También
S1 (un escalón; la Aprobación Directa queda fuera del alcance de la IA), S2 (el
score con banda), S4 (Básico sin capacidad ni oferta; Pro y Plus completos) y S6
(la salida que ya figura se deja; una salida aceptable cuenta como pasada).

Decididas distinto de lo recomendado:

- **S3**: en la v1, Cambio de Condiciones equivale a aprobar (ver el escalón 2).
- **S5**: «Aprobado con Requisitos» en lugar de «Condicionado» como nombre de pantalla.
- **C2** (punto 5): carga del 40 al 60% según el riesgo, sobre el neto disponible
  del negocio (ver 4.1).
- **C3** (punto 6): Aprobación Directa sin buró **permitida**, y activable por
  institución según su apetito al riesgo (la variante angosta es un parámetro).
- **C4**: garante y colateral son requisitos de cada institución; el modelo sólo
  menciona el patrimonio que podría apalancar (ver 3.3).
- **R6** (punto 8): pensión alimenticia en mora con tolerancia de USD 300; por
  encima, Revisar; agravante menor si la persona está al día, estable y con
  capacidad aceptable. Ni Deteriorado ni mal comportamiento directo.

Abiertas, el negocio pidió una propuesta (no se inventa la respuesta):

- **R1** (punto 1, demanda de cobro): combinar la antigüedad con si el proceso
  terminó, con una lista de términos de cierre (créditos: abandono, archivo de la
  causa, extinción de la obligación, desistimiento, retiro de la demanda; penales:
  sobreseimiento, archivo de la investigación). Validar si sale del crudo o si hay
  que consultar la página pública de la Función Judicial (autorizado a consultar a
  la persona analizada; sin evadir barreras contra robots).
- **R2 y R3** (puntos 2 y 3, mora vigente): umbrales de tolerancia en dólares por
  sector que reporta, desde calificación B y más de 30 días (SBS: hasta USD 30
  aceptar, hasta 150 revisar, más de 150 negar; SEPS: 30 y 200; comercial: 100 y
  300), **parametrizados por institución según su apetito al riesgo, como tarea
  adicional**, y R3 define Aprobar, Revisar o Negar a partir de ellos. Falta la
  propuesta de cómo organizarlos y cómo los lee el modelo.
- **R4** (atenuantes y agravantes): propuesta parecida a R2, con umbrales de monto
  y de tiempo; un mal comportamiento pierde relevancia si el vigente lo superó;
  los atenuantes y agravantes se ordenan por importancia. Los umbrales de la
  recomendación previa (30 días, 10%, SBU) quedan sin decidir hasta esa propuesta.
- **I5** (la c de la cota por cuotas): 0,75 provisional, pero el negocio pidió una
  explicación más larga, en otra sesión, para entender la decisión.
- **D4** (bancos sin buró): decidido, con ese alcance, el 2026-11-18: cuando el modelo
  responde, nombra el atraso como «en atraso», sin los días de cada operación.
  Es lo recomendado. El negocio dijo además que «los días son importantes» (25
  días no es 300); no pidió leer la calificación como un rango de días. Se
  mantiene la regla de hoy.
- **I2** (qué entra al peldaño 3): el negocio escribió «A y B»; se lee como la
  opción (b), que ya incluye las cuotas al día. Falta confirmarlo.
