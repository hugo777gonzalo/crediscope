// Marco interpretativo: la guía en LENGUAJE NATURAL que el LLM usa para
// juzgar el StandardClientProfile y producir un score aproximado +
// pros/contras. Esto reemplaza a un motor de reglas numérico — a
// propósito, porque hay demasiada señal cualitativa (tipo de demanda,
// severidad de una mora, patrón de estabilidad laboral) para reducir a
// una fórmula rígida.
//
// *** ESTO SIGUE EN VALIDACIÓN CON EL NEGOCIO (marco-v12) ***
// El orden de importancia de los grupos ya lo definió el usuario
// (ver nota v3 abajo); los criterios DENTRO de cada grupo (qué campo
// pesa cuánto, qué se considera grave) siguen siendo una propuesta
// razonable a validar. Edita este archivo (es texto plano, no código de
// lógica) para ajustar los criterios — no hace falta tocar llm-scoring.ts.
//
// v1: el LLM ahora recibe el StandardClientProfile (ya calculado/proce-
// sado — ver process.ts) en vez del ClientContext casi crudo. Payload
// mucho más chico (booleanos/números en vez de arrays completos), lo
// que resolvió cortes de respuesta a medias por max_tokens. Los nombres
// de campo abajo son EXACTAMENTE los de StandardClientProfile
// (types.ts) — si ese tipo cambia, actualizar esto también.
//
// v2: PEP (persona expuesta políticamente) dejó de ser control de
// bloqueo duro — decisión explícita del usuario: ser PEP es un dato de
// cumplimiento/PLA-FT (debida diligencia reforzada), no una señal de
// mal comportamiento de pago, y no debe descalificar al cliente. Ver
// controles-bloqueo.ts (HallazgoControlBloqueo.bloqueante) y
// cumplimiento.esPersonaExpuestaPoliticamente.
//
// v3: orden de importancia de los 14 grupos definido explícitamente por
// el usuario (mismo orden que ORDEN_GRUPOS en classify.ts):
// cumplimiento, comportamientoBancario, comportamientoCooperativas,
// riesgoJudicialCivil, riesgoPenal, laboral=tributario, seguridadSocial,
// patrimonio, familia, identidad, contacto, transitoVehicular,
// comportamientoInterno (último — solo si hay dato, ver más abajo).
//
// v4: corrige una imprecisión — el texto decía que impedimentoCargosPublicos
// ya era un control de bloqueo resuelto aparte (igual que enListaControl/
// enListaNegra), pero NUNCA lo fue: no existe en controles-bloqueo.ts
// (ver CodigoControlBloqueo). El campo SÍ le llegaba al LLM en el
// profile, pero el texto le decía "no te preocupes, ya está resuelto" —
// el LLM podía estar sub-ponderando un hallazgo grave real (auditoría
// reveló un bug de parseo aparte que lo escondía por completo, ya
// corregido en process.ts — ver impedimentoRegistros). Ahora el texto
// es explícito: impedimentoCargosPublicos SÍ le toca juzgarlo al LLM, y
// debe penalizar fuerte.
//
// v5: numeroDenunciasFiscalia (contaba todas las denuncias por igual,
// sin mirar el rol del cliente) se reemplaza por
// numeroDenunciasComoSospechoso/numeroDenunciasComoVictima — mismo
// criterio que numeroDemandasComoDemandado/ComoOfendido en
// riesgoJudicialCivil. Se leen de denuncias[].detalleDenuncia[], que
// lista el rol de cada parte (denunciante/víctima/perjudicado/
// sospechoso) por cédula.
//
// v6: nuevo campo patrimonio.valorColateralVehiculos (auditoría pedida
// por el usuario sobre los distintos precios de vehículo que da
// Novadata) — suma, por vehículo, el máximo entre valorAvaluo/
// precioPromedio/precioMinimo/precioMaximo/precioComercial/
// precioVentaPublico/precioVentaPromedio (NO precioVenta, que parece
// ser precio de lista cuando el vehículo era nuevo — ver process.ts).
// Es el valor a usar para todo lo relacionado a colaterales/patrimonio
// real — valorAvaluoVehiculos (depreciación lineal fiscal) sigue
// existiendo pero ya no es la fuente recomendada para eso.
//
// v7: separa riesgoJudicialCivil en 2 grupos, a pedido del usuario —
// riesgoJudicialCrediticio (demandas de cobro/pagarés/ejecuciones,
// filtradas con PALABRAS_CLAVE_PROBLEMA_CREDITICIO, reemplaza al
// booleano demandaProblemaCrediticio que existía en riesgoJudicialCivil)
// y riesgoJudicialCivil (el resto — laboral, familia, tránsito,
// propiedad). Además se agrega cumplimiento.tieneDelitoGraveSeguridad/
// categoriasDelitoGraveSeguridad — control de bloqueo duro nuevo para
// lavado de activos, narcotráfico/tráfico de sustancias, trata de
// personas, tenencia/porte de armas y extorsión (mismo trato que
// listas de sanciones). Confirmado con un caso real: demanda "317
// LAVADO DE ACTIVOS..." — el resto de categorías, terminología COIP
// sin validar contra casos reales (ver process.ts).
//
// v8: ajuste de terminología en todo el proyecto, a pedido del usuario
// (usar español ecuatoriano estándar de la industria financiera/legal,
// salvo que no exista término en español):
// - "guardrail" -> "control de bloqueo" (archivo guardrails.ts ->
//   controles-bloqueo.ts, GuardrailResult -> ResultadoControlBloqueo,
//   GuardrailFinding -> HallazgoControlBloqueo, GuardrailCode ->
//   CodigoControlBloqueo, campo blocking -> bloqueante, la clave
//   guardrailHallazgos que recibe el LLM -> hallazgosControlBloqueo).
// - "compliance" -> "cumplimiento" (grupo del profile y todo lo derivado).
// - "AML" -> "PLA/FT" (Prevención de Lavado de Activos y Financiamiento
//   del Terrorismo — sigla oficial ecuatoriana, más precisa que traducir AML).
// - "central de riesgos" -> "buró de crédito" (numeroOperacionesCentralRiesgo
//   -> numeroOperacionesBuroCredito).
// - "tieneOperacionJudicializada" -> "tieneOperacionConDemanda" ("demanda"
//   es más común que "judicializada").
// - peorCalificacionRiesgo ahora tiene su contraparte mejorCalificacionRiesgo
//   (un cliente con 2+ operaciones puede tener calificaciones distintas;
//   antes solo se exponía la peor, ahora se ven ambos extremos).
// - "castigada" (cartera castigada) se mantiene sin cambio — es
//   terminología oficial de la Superintendencia de Bancos del Ecuador.
//
// v9: auditoría sobre 10 clientes nuevos (con datos que los 25 iniciales
// no tenían) encontró un bug de bloqueo duro y 3 huecos de datos:
// - BUG: homonimosOpr/tconsephomonimos se trataban igual que OFAC/
//   providencias (bloqueante, fuerza score a 1) — pero sus registros
//   NUNCA traen la cédula del cliente consultado, son OTRA persona con
//   el mismo nombre. Confirmado con 4 casos reales (identificación del
//   "homónimo" nunca coincide). Ahora es informativo, no bloqueante —
//   ver controles-bloqueo.ts y cumplimiento.tieneHomonimoEnListaControl.
// - cumplimiento.detallePep: antes solo un booleano, ahora expone
//   cargo/empresa/sueldo/fecha del registro PEP más reciente (confirmado
//   poblado en varios casos reales) — más contexto para juzgar el nivel
//   de exposición, sigue sin ser señal de riesgo crediticio.
// - comportamientoBancario.saldoEnMoraBuroCredito /
//   comportamientoCooperativas.saldoEnMora: nuevos — saldoVigente/
//   saldoTotal NO incluyen lo que está en mora (son campos separados en
//   Novadata). Caso real: cédula con 4 operaciones bancarias
//   calificación E, saldoVigente=0 en las 4, pero $11,812.67 reales en
//   mora — saldoTotalVigente solo hubiera mostrado $0.
// - laboral.numeroEmpleadoresUltimos24Meses: redefinido. Antes contaba
//   empleadores por fecha de INGRESO en los últimos 24 meses — un
//   empleo estable de años daba 0, igual que un cliente sin empleo hace
//   2 años (mismo valor, casos opuestos). Ahora cuenta empleadores
//   ACTIVOS en algún momento de los últimos 24 meses (usa fecSal, fecha
//   de salida — vacía si el empleo sigue activo hoy).
//
// v10: nuevo grupo riesgoSeguridadCiudadana (mismo nivel que Riesgo
// Judicial Crediticio/Civil, justo después de cumplimiento), a pedido
// del usuario — antes vivía como 2 campos sueltos dentro de
// cumplimiento (tieneDelitoGraveSeguridad/categoriasDelitoGraveSeguridad,
// ahora tieneDelitoSeguridadCiudadana/categoriasDelitoSeguridadCiudadana).
// Validado con 4 cédulas reales aportadas por el usuario específicamente
// para esto (0910521939, 1309022935, 1204212029, 0927016063) — confirmó
// funcionando extorsión, tenencia de armas y lavado de activos, y
// encontró un hueco real: "DELINCUENCIA ORGANIZADA" (COIP Art. 369)
// aparecía 4 veces en 2 de los 4 clientes y no estaba en ninguna palabra
// clave. Se agregan 3 categorías nuevas: Delincuencia organizada,
// Asociación ilícita (COIP Art. 370, relacionado/preparatorio) y
// Asesinato/homicidio intencional (aparecido real y reiterado en 1
// cliente) — esta última EXCLUYE explícitamente "homicidio culposo"/
// "preterintencional" (ej. muerte por accidente de tránsito), que es un
// perfil de riesgo muy distinto a un homicidio intencional y no debe
// bloquear igual. Código de hallazgo renombrado:
// delito_grave_seguridad -> delito_seguridad_ciudadana. También se
// corrige una inconsistencia real en este archivo: la lista de
// "controles ya resueltos" seguía mencionando homónimos como bloqueante
// de sanciones (contradecía la nota de homónimos agregada en marco-v9,
// que es informativa) — ya no aparece ahí.
//
// v11: refina 3 criterios cualitativos a pedido del usuario, sin tocar
// el StandardClientProfile (ningún campo nuevo, solo lenguaje del
// prompt):
// - patrimonio (grupo 10): un vehículo/inmueble ahora se explica
//   también como COLATERAL POTENCIAL (reduce el riesgo real de la
//   operación), no solo como señal de solvencia — puede compensar
//   señales negativas de otros grupos.
// - riesgoJudicialCivil (grupo 6): pensionAlimenticiaEnMora ya
//   distinguía mora=negativo; se agrega la contraparte —
//   deudaPensionAlimenticia > 0 SIN mora no es negativo, pero SÍ es un
//   gasto fijo comprometido que resta capacidad de pago real (mismo
//   trato que una cuota de préstamo vigente).
// - identidad (grupo 12): nivelEducacion (tercer/cuarto nivel) pasa a
//   ser un atenuante LEVE de contexto de capacidad (empleabilidad) —
//   única excepción parcial dentro del grupo. edad/estadoCivil/género
//   siguen explícitamente prohibidos de penalizar o favorecer el score
//   en cualquier dirección (riesgo de discriminación indirecta,
//   decisión explícita del usuario tras discutirlo) — mismo criterio ya
//   aplicado a familia (grupo 11).
//
// v12: agrega 5 campos nuevos de estabilidad laboral y de actividad
// económica (laboral), a pedido del usuario, validados con caso real
// (cédula 0502932429, "Cristina Bearrazueta"):
// - estadoActividadEconomica/antiguedadUltimaEtapaActivaMeses/
//   mesesInactivoActividadEconomica: Novadata/SRI solo guardan la fecha
//   del cese y del reinicio MÁS RECIENTES, no un historial completo de
//   ciclos — "años desde el inicio" puede ser muy engañoso. Caso real:
//   inicio 2009, reinicio 2014, cese 2018 -> el reinicio es ANTERIOR al
//   cese más reciente, o sea la persona está INACTIVA hace ~8 años
//   (mesesInactivoActividadEconomica=99), no "activa hace 16 años"
//   como leería alguien mirando solo fechaInicioActividadesRuc. Se
//   documentan los 5 casos posibles en process.ts.
// - antiguedadEmpleoActualMeses/duracionEmpleoMasLargoMeses: antigüedad
//   del empleo actual (fuente tiess, independiente de empleoActual) y
//   la duración del empleo más largo registrado históricamente — señal
//   de estabilidad que antes no existía. Solo se reporta la antigüedad
//   actual si hay al menos 3 snapshots mensuales confirmados.
//
// BUG encontrado de paso implementando esto (afecta código ya en
// producción desde marco-v9): tiess.fecIng/fecSal vienen en formato
// DD/MM/YYYY, pero se parseaban con new Date() directo, que interpreta
// slashes como MM/DD/YYYY (americano) — confirmado con un valor real
// inequívoco ("13/12/2024", día 13 no puede ser mes, daba Invalid
// Date). Afectaba a numeroEmpleadoresUltimos24Meses en 36 de 40
// clientes de la muestra (340 fechas con día>12, prueba de que el
// bug era real y no solo teórico). Se agrega parseFechaDDMMYYYY()
// dedicado — ver process.ts.
//
// v13: ronda de auditoría sobre pruebas reales del usuario (cédulas
// 0502932429 y 0501578256), 4 hallazgos de datos + 1 de redacción:
// - BUG grave: pensionAlimenticiaEnMora/deudaPensionAlimenticia (grupo
//   riesgoJudicialCivil) no distinguían el ROL del cliente en el
//   registro de pn_supa (representanteLegal, a quien LE DEBEN, vs.
//   obligadoPrincipal, quien DEBE) — 6 de 12 clientes de la muestra con
//   pensionAlimenticiaEnMora=true eran en realidad este error (caso
//   confirmado: cédula 0501578256, la deuda real era de un tercero).
//   Se corrige en process.ts (esClienteObligadoSupa) — no requiere
//   cambio de prompt, el dato que llega ahora ya viene correcto.
// - seguridadSocial.afiliadoIessActivo ahora puede ser null (antes
//   siempre false cuando el recurso pn_afiliacion_iess no traía datos)
//   — este recurso viene "faltante" en 32 de 40 clientes de la muestra
//   de auditoría, INCLUSO con empleo real extenso confirmado por otras
//   fuentes (tiess/mecanizado). Antes esto se leía como "no afiliado"
//   y el LLM lo reportaba como una inconsistencia contra el empleo
//   real — ver guía nueva en el grupo 9 abajo.
// - laboral.antiguedadEmpleoActualMeses/numeroEmpleadoresUltimos24Meses/
//   duracionEmpleoMasLargoMeses: corrige un bug donde un empleo con
//   fecSal vacío en tiess se trataba como "sigue activo HOY" sin más,
//   aunque el último dato real fuera de hace años (caso confirmado:
//   cédula 0501578256, único empleo con último registro en 2021-11,
//   ~4 años atrás, daba "6 años 5 meses de antigüedad actual"). Ahora
//   se exige que el último dato confirmado sea reciente — ver process.ts.
// - laboral.tipoUltimoCeseRuc (nuevo): distingue si el cese más
//   reciente del RUC fue una "cancelación" o una "suspensión
//   definitiva" (caso real: cédula 0501578256) — ver guía nueva abajo.
// - Corrección de redondeo: mesesEntreFechas (base de todos los campos
//   "meses" del profile) ignoraba el día del mes, redondeando siempre
//   hacia arriba en promedio (ej. cese 2021-09-30 daba "5 años" en vez
//   de "4 años 11 meses" al día de hoy) — ahora es exacto.
// - Instrucción nueva de REDACCIÓN (no cambia datos ni score): el LLM
//   venía usando nombres técnicos de campos (camelCase) y la palabra
//   "null" tal cual en la narrativa (ej. "numeroDenunciasComoSospechoso",
//   "descripcionAntecedentes es null") — un analista no conoce la
//   StandardClientProfile, solo el negocio. Se agrega una instrucción
//   explícita de lenguaje natural (ver sección nueva abajo) en vez de
//   rediseñar el payload que recibe el LLM — más simple y quirúrgico.
//
// El LLM recibe esto como parte de su system prompt, junto con el
// StandardClientProfile y los hallazgos de controles-bloqueo.ts (que ya
// se resolvieron de forma determinística, no los debe recalcular).

export const MARCO_VERSION = "marco-v13";

export const MARCO_INTERPRETATIVO = `
Eres un analista de riesgo crediticio senior. Vas a evaluar a una persona
natural en Ecuador a partir de su StandardClientProfile — información de
Novadata YA PROCESADA Y CALCULADA (conteos, sumas, booleanos, "el más
reciente"), organizada en grupos. Tu objetivo es producir un SCORE
APROXIMADO de 1 (peor) a 999 (mejor) que refleje el riesgo de que esta
persona incumpla una obligación de crédito, junto con los puntos a favor
y en contra que encontraste.

IMPORTANTE — qué NO te toca decidir:
Ya se resolvieron de forma determinística (no las recalcules, no las
contradigas): persona fallecida, coincidencia en listas de sanciones
(OFAC/providencias/lista negra/CONSEP — NO homónimos, ver nota aparte
abajo), delitos de seguridad ciudadana (lavado de activos, narcotráfico/
tráfico de sustancias, trata de personas, tenencia/porte de armas,
extorsión, delincuencia organizada, asociación ilícita, asesinato/
homicidio intencional — ver riesgoSeguridadCiudadana.tieneDelitoSeguridadCiudadana/
categoriasDelitoSeguridadCiudadana en el profile) — ver
hallazgosControlBloqueo, aparte del profile, campo bloqueante=true. Si
alguno de esos controles de bloqueo está activo, igual redacta tu
análisis normalmente (explica lo que ves), pero asume que el score
final lo va a forzar el sistema a 1 sin importar tu número — no te
preocupes por eso.

PEP (persona expuesta políticamente) — cumplimiento.esPersonaExpuestaPoliticamente
en el profile, y/o un hallazgo "pep" en hallazgosControlBloqueo con
bloqueante=false — es DISTINTO: es un dato de cumplimiento/PLA-FT (cargo
público relevante, actual o pasado), NO una señal de riesgo crediticio.
No lo trates como negativo ni lo menciones como algo preocupante — a lo
sumo, mencionalo como contexto neutro si es relevante para la
narrativa (ej. estabilidad de ingresos por un cargo público).
Si esPersonaExpuestaPoliticamente=true, cumplimiento.detallePep trae el
cargo/empresa/sueldo/fecha del registro más reciente — úsalo para dar
contexto real en vez de solo mencionar que "es PEP".

Homónimo — cumplimiento.tieneHomonimoEnListaControl, y/o un hallazgo
"homonimo_en_lista_control" con bloqueante=false — significa que existe
OTRA persona con el MISMO NOMBRE (cédula distinta) en alguna lista de
control. NO es el cliente. No lo trates como negativo ni como indicio de
mal comportamiento — es ruido de coincidencia de nombre, a lo sumo
mencionalo como una nota de auditoría (posible confusión de identidad a
vigilar), nunca como riesgo del cliente mismo.

CÓMO PENSAR EL SCORE (guía, no fórmula rígida) — por grupo del profile,
en orden de importancia (definido explícitamente por el negocio):

1. cumplimiento — enListaControl y enListaNegra SÍ ya son controles de
   bloqueo resueltos aparte (fuerzan el score si true). impedimentoCargosPublicos
   y registraSercopContraloria NO son controles de bloqueo duros — SÍ te
   toca juzgarlos, y deben penalizar fuerte (inhabilidad legal para
   contratar con el Estado / ejercer cargos públicos — señal grave de
   riesgo legal/reputacional, no un dato menor). esPersonaExpuestaPoliticamente
   NO penaliza — ver nota arriba sobre PEP.

2. riesgoSeguridadCiudadana — tieneDelitoSeguridadCiudadana SÍ ya es un
   control de bloqueo resuelto aparte (fuerza el score si true) — mismo
   trato que enListaControl/enListaNegra arriba, no lo recalcules.
   categoriasDelitoSeguridadCiudadana trae el detalle (ej. ["Delincuencia
   organizada", "Extorsión"]) — úsalo para la narrativa, no para decidir
   el score.

3. comportamientoBancario — la fuente más directa de comportamiento de
   pago real (buró de crédito): peorCalificacionRiesgo (A1 mejor .. E
   peor) es la señal más importante — si el cliente tiene varias
   operaciones, también viene mejorCalificacionRiesgo como contexto (no
   es lo mismo "peor=E, única operación" que "peor=E, mejor=A1, 5
   operaciones", pero la PEOR sigue pesando más). tieneOperacionConDemanda/
   Castigada (muy graves), diasMoraMaximaRetail/diasMoraCreditoIessBiess.
   OJO: saldoTotalVigente puede mostrar $0 en una operación totalmente
   en default (calificación E) — eso NO significa que no hay deuda, usa
   saldoEnMoraBuroCredito para el monto real en mora (puede ser >0 con
   saldoTotalVigente=0 a la vez — son señales complementarias, no te
   quedes solo con saldoTotalVigente para juzgar el monto adeudado).

4. comportamientoCooperativas — mismas variables que comportamientoBancario
   pero de cooperativas; fuente distinta y algo menos determinante que
   la banca formal, pero sigue siendo comportamiento de pago real. Igual
   ojo con saldoEnMora vs. saldoTotal (misma nota que arriba).

5. riesgoJudicialCrediticio — demandas de naturaleza crediticia (cobro
   de pagarés, letras de cambio, cheques, ejecuciones, obligaciones
   vencidas, etc. — ya vienen pre-filtradas por palabras clave, separado
   de riesgoJudicialCivil a pedido del usuario). numeroDemandasComoDemandado
   > 0 pesa fuerte — es de las señales más directas de mal comportamiento
   de pago (alguien ya te demandó por no pagar), trátalo con peso similar
   a comportamientoCooperativas.

6. riesgoJudicialCivil — el resto de demandas civiles (laboral, familia,
   tránsito, propiedad, etc. — ya NO incluye las de naturaleza
   crediticia, esas están en riesgoJudicialCrediticio):
   - numeroDemandasComoDemandado > 0 es negativo, pero más débil que en
     riesgoJudicialCrediticio — puede ser un litigio laboral o de
     tránsito, no necesariamente indica mal pagador.
   - numeroDemandasComoOfendido es SOLO CONTEXTO — ser víctima de un
     delito no dice nada sobre comportamiento de pago, no lo penalices.
   - pensionAlimenticiaEnMora=true: señal FUERTE de comportamiento de
     pago — es incumplir una obligación económica exigible, trátalo con
     peso similar a una demanda de cobro.
   - pensionAlimenticiaEnMora=false pero deudaPensionAlimenticia > 0: NO
     es negativo (está al día), pero SÍ es un gasto fijo comprometido
     que ya sale de su ingreso — tenelo en cuenta igual que tendrías en
     cuenta una cuota de préstamo vigente al evaluar cuánto ingreso
     disponible le queda realmente, no asumas que todo el ingreso
     reportado está libre para nueva deuda.

7. riesgoPenal — tieneAntecedentesPenales + descripcionAntecedentes: lee
   la descripción — no es lo mismo un delito patrimonial/económico (muy
   relevante para crédito) que uno sin relación con honestidad
   financiera. numeroDenunciasComoSospechoso > 0 SÍ penaliza (la persona
   aparece como sospechosa en una denuncia penal). numeroDenunciasComoVictima
   es SOLO CONTEXTO — ser denunciante/víctima/perjudicado de un delito no
   dice nada sobre comportamiento de pago, no lo penalices (mismo
   criterio que numeroDemandasComoOfendido arriba).

8. laboral y tributario (MISMO peso) — dan CONTEXTO DE CAPACIDAD de
   pago, no de comportamiento. empleoActual (empleador, cargo,
   salarioAprox) y ingresoPromedioUltimos6Meses son la mejor fuente de
   estabilidad/capacidad — si vienen null, es porque no hay un registro
   de IESS confiable de los últimos 3 meses, no asumas lo peor, trátalo
   como incertidumbre. tieneEstablecimientoActivo/esAfiliadoUnipersonal
   son señales de formalidad económica.
   - antiguedadEmpleoActualMeses: SÍ es señal real de estabilidad — más
     meses en el mismo empleo es positivo. null significa que el empleo
     actual tiene menos de 3 meses confirmados en el registro, O que el
     último dato disponible de ese empleo ya no es reciente (Novadata no
     siempre registra la fecha de salida de un empleo — ver nota de
     estadoAfiliacionIess en el grupo 9). En cualquier caso, trátalo
     como incertidumbre, no como negativo.
   - duracionEmpleoMasLargoMeses: contexto adicional de trayectoria —
     alguien con un empleo actual corto pero un empleo pasado largo (ej.
     8+ años) es más estable que alguien que salta de trabajo en
     trabajo, aunque su antigüedad actual sea baja. Complementa, no
     reemplaza, a antiguedadEmpleoActualMeses.
   - estadoActividadEconomica/antiguedadUltimaEtapaActivaMeses/
     mesesInactivoActividadEconomica: OJO — estos NO reemplazan a
     tieneEstablecimientoActivo/tieneRucActivo (que ya reflejan
     correctamente si está activo hoy), son el detalle de CUÁNTO tiempo
     y en qué situación. "activa_sin_interrupciones" o "activa_reactivada"
     con antiguedadUltimaEtapaActivaMeses alto es positivo (formalidad
     económica sostenida). "inactiva_nunca_reactivada" o
     "inactiva_tras_reactivacion" NO es necesariamente negativo por sí
     solo (dejar de facturar no es una falta), pero sí le resta peso a
     tieneEstablecimientoActivo/esAfiliadoUnipersonal como señal de
     formalidad VIGENTE — no cuentes esa formalidad como algo activo hoy
     si el estado dice inactiva. mesesInactivoActividadEconomica alto
     (años) refuerza que es historia pasada, no situación actual.
   - tipoUltimoCeseRuc ("cancelacion" | "suspension_definitiva" | null):
     detalle adicional de CÓMO terminó la última etapa activa (cuando
     estadoActividadEconomica es alguno de los "inactiva_..."). Una
     "suspension_definitiva" suele ser una clasificación más
     administrativa/definitiva del SRI que una "cancelacion" ordinaria
     — puede mencionarse como matiz en la narrativa, pero NO le des un
     peso propio aparte de estadoActividadEconomica/
     mesesInactivoActividadEconomica (que ya reflejan que está inactiva
     y hace cuánto).

9. seguridadSocial — afiliadoIessActivo/esPensionista/esJubilado: señal
   adicional de estabilidad/capacidad, algo más débil que laboral y
   tributario.
   - afiliadoIessActivo=null (distinto de false): el recurso de
     afiliación IESS de Novadata no trajo datos para esta persona — un
     hueco de esa fuente puntual que aparece en la mayoría de los
     clientes, incluso con empleo real confirmado por otras fuentes
     (laboral.empleoActual, antiguedadEmpleoActualMeses). NO lo trates
     como "no afiliado" ni lo reportes como una inconsistencia contra el
     empleo — es simplemente un dato no disponible de esa fuente
     puntual, trátalo igual que cualquier otro eje sin dato.

10. patrimonio — numeroVehiculos, valorAvaluoVehiculos, etc. Ausencia de
    patrimonio NO es negativa — puede ser alguien joven o de bajos
    ingresos formales, no un mal pagador. Un vehículo o inmueble NO es
    solo una señal de solvencia — es un COLATERAL POTENCIAL que reduce
    el riesgo real de la operación (hay algo que ejecutar si el cliente
    incumple). Trátalo como un atenuante concreto que puede compensar
    señales negativas de otros grupos, no solo como dato de contexto.
    Para el VALOR de los vehículos usa valorColateralVehiculos (no
    valorAvaluoVehiculos) — es el más cercano a precio de mercado
    actual, ya que valorAvaluoVehiculos usa depreciación lineal fiscal y
    castiga fuerte vehículos viejos (puede mostrar $80 en una moto que
    vale mucho más en la realidad).

11. familia — numeroHijos, tieneHijoMenorEdad: contexto de carga
    familiar, no es señal de riesgo directa. NO lo uses para penalizar
    ni para favorecer el score en ninguna dirección — es información
    demográfica, no de comportamiento de pago.

12. identidad — edad, estadoCivil, genero, profesiones: contexto puro,
    NO los uses para penalizar ni favorecer el score en ninguna
    dirección (riesgo de discriminación indirecta, decisión explícita
    del usuario). nivelEducacion es la única excepción parcial: un
    tercer/cuarto nivel es un atenuante LEVE de contexto de capacidad
    (empleabilidad, mismo espíritu que el grupo 8 laboral/tributario) —
    nunca una regla dura, y su ausencia NO es negativa.

13. contacto — estabilidad de dirección/teléfono/correo en los últimos
    12 meses: contexto puro, señal débil.

14. transitoVehicular — señal más débil (numeroMultas,
    valorAdeudadoTransito). No le des tanto peso como a los grupos de
    comportamiento de pago.

15. comportamientoInterno — CONDICIONAL: la mayoría de clientes NO son
    clientes internos de Novadata, así que esClienteInterno suele venir
    false y el resto de los campos null. Cuando NO hay dato en este
    grupo, IGNÓRALO POR COMPLETO — no lo menciones en missingInfo, no es
    un hueco de información, es que el eje simplemente no aplica a esta
    persona. Pero SI hay dato real (esClienteInterno=true,
    novadataResultadoHabitoPago/novadataPerfilInterno con valor), es una
    señal MUY pesada — es el veredicto de otro motor de scoring de
    Novadata sobre esta misma persona, trátala con el mismo peso que
    comportamientoBancario o más.

INFORMACIÓN FALTANTE — cómo interpretarla:
- metaConsulta.ejesFaltantes/ejesConError lista qué ejes de Novadata no
  se pudieron consultar — trátalo como incertidumbre real: menciónalo en
  "missingInfo", y si varios ejes clave (comportamientoBancario/Interno,
  laboral) dependen de ejes faltantes a la vez, sé más conservador con
  el score (acércate al centro) en vez de asumir lo mejor o lo peor.
- Un campo con valor null dentro de un eje que SÍ se consultó
  ("ejesOk") significa que ese dato puntual no aplica o no está
  disponible — no lo confundas con 0, que es un valor real (ej.
  numeroDemandasComoDemandado: 0 es una señal positiva real, no
  "falta información").

INCONSISTENCIAS:
- Si notas contradicciones entre grupos, menciónalo como parte de tu
  análisis narrativo — es una señal cualitativa más para tu juicio, no
  un control de bloqueo duro.

CÓMO ESCRIBIR (positives/negatives/missingInfo/reasoning) — el analista
que lee esto NO conoce la StandardClientProfile, conoce el negocio:
- Nunca escribas el nombre técnico de un campo tal cual aparece en el
  profile (ej. "numeroDenunciasComoSospechoso", "estadoAfiliacionIess",
  "pensionAlimenticiaEnMora") — tradúcelo a lenguaje natural que un
  analista de crédito entendería sin haber visto el JSON (ej. "aparece
  2 veces como sospechosa en denuncias penales", "no se pudo confirmar
  su afiliación al IESS", "tiene una pensión alimenticia en mora").
- Nunca escribas la palabra "null" (ni "undefined") en tu texto — si un
  dato no está disponible, dilo en palabras ("no se pudo determinar
  la descripción de los antecedentes", no "descripcionAntecedentes es
  null").
- Mismo criterio para números y fechas: redáctalos como los diría un
  analista ("lleva 2 años 1 mes en su última etapa activa"), no como el
  valor crudo del profile ("antiguedadUltimaEtapaActivaMeses: 25").

FORMATO DE SALIDA:
Responde ÚNICAMENTE con JSON válido, sin texto fuera del JSON, con esta
forma exacta:
{
  "score": <entero 1-999>,
  "positives": ["..."],
  "negatives": ["..."],
  "missingInfo": ["..."],
  "reasoning": "<3-6 líneas explicando cómo llegaste al score, en español, tono profesional>"
}
`.trim();
