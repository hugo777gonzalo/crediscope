# Propuesta de reagrupación de las consultas de Novadata

> **v1 (aprobada, con ajustes del usuario)** — ver `Cambios Reagrupacion - Estructura_Estandarizada v1.xlsx`,
> hoja `Cambios_Reagrupacion`. Cambios aplicados: grupo 1 renombrado a
> "SocioDemográficas"; grupo 8 a "Comportamiento Bancos BIESS Diners";
> grupo 9 a "Comportamiento Cooperativas"; grupo 11 a "Riesgo Judicial /
> Civil"; nuevo grupo 14 "Comportamiento Interno" que separa
> `personasIncumplimientos` de comportamientoBancario; el antiguo grupo
> 14 "Salud y educación" pasa a ser el 15 "Otros". Tabla actualizada
> abajo. También se corrigió un bug encontrado al validar: `demanda.tipoDemanda.descripcion`
> es el ROL de la persona ("DEMANDADO", constante), no el tipo de caso —
> el tipo de caso real vive en `demanda.delito`.

Basada en los datos reales de 25 personas consultadas (ver [novadata-fields-catalog.md](novadata-fields-catalog.md)). Los 9 bloques originales (Información general, Sociodemográfica, Trabajo, Aportes IESS, Vehículos, Función Judicial, Fiscalía, Bancos, Cooperativas) eran una traducción directa de las pestañas de la interfaz web de Novadata — agrupan por **de dónde viene el dato en la UI**, no por **qué significa el dato para crédito**. Con datos reales en mano aparecieron 2 errores de categorización concretos y varios recursos que encajan mejor en otro lado.

## Errores de categorización encontrados y corregidos

1. **`pn_supa` / `pn_supa/novadata`** estaban en "Vehículos" — en realidad son juicios de **pensión alimenticia** (campos `tipoPension`, `obligadoPrincipal`, `valorMensual`, `totalPagado`, `totalDeuda`). Nada que ver con tránsito. Van a Riesgo judicial.
2. **`pn_deudas_ant`, `pn_deudas_amt`, `pn_deudas_emov`** estaban en "Bancos" — en realidad son **multas de tránsito** (ANT = Agencia Nacional de Tránsito, AMT/EMOV = agencias metropolitanas de tránsito de Quito): campos `multa`, `sancion`, `articulo`, `placa`, `citacion`, `infraccion`. No son deuda financiera. Van a Tránsito vehicular.
3. **`pn_retails`** estaba en "Trabajo" — trae `valorVencido`, `totalDeuda`, `diasMora` — es deuda de crédito comercial/retail. Va a Comportamiento de pago.

## Grupos (v1 — 15, en vez de 9)

| # | Grupo | Recursos que agrupa | Relevancia crediticia |
|---|---|---|---|
| 1 | **SocioDemográficas** | `pn_inf_basica` | Base — identidad, edad, estado civil, educación, profesión |
| 2 | **Contacto y domicilio** | direcciones, teléfonos, correos | Contexto/verificación, no scoring directo |
| 3 | **Núcleo familiar** | padres, hijos, cónyuge | Contexto (cargas familiares) |
| 4 | **Situación laboral e ingresos** | empleados, trabajoHistoricos(+mecanizado), cumplimientoPatronal, administraciones, `basesInternas.tiess` | **Alta** — capacidad de pago, estabilidad |
| 5 | **Situación tributaria (SRI)** | contribuyente (x2 variantes), sriImpuestoRenta, establecimientoActEconomica | Media — formalidad económica, ingresos declarados |
| 6 | **Seguridad social** | afiliación IESS/ISSPOL/ISSFA/salud, pensionista, jubilados | Media — formalidad de ingreso, estabilidad |
| 7 | **Patrimonio** | bienesInmueble, vehículos (detalle), inversiones | Media-alta — colateral implícito |
| 8 | **Comportamiento Bancos BIESS Diners** | centralRiesgo(Super+Diners), créditos hipotecario/quirografario, retails, deudasFirmes, deudores, créditos afiliados IESS/BIESS | **La más alta** — historial de pago directo |
| 9 | **Comportamiento Cooperativas** | centralRiesgoCoop | **Alta** — mismo peso que bancos, fuente separada |
| 10 | **Tránsito vehicular** | multas ANT/AMT/EMOV, siniestros, pólizas, licencia conducir | Baja-media — comportamiento de incumplimiento, pero no financiero directo |
| 11 | **Riesgo Judicial / Civil** | demandas (demandado vs. ofendido — **distinguir siempre**), pensión alimenticia | Alta si es demandado; casi nula si es ofendido |
| 12 | **Riesgo penal / Fiscalía** | denuncias, antecedentes penales | Alta si hay antecedentes reales (no "NO") |
| 13 | **Compliance y listas de control** | OFAC/homónimos/providencias/PEP, lista negra, SERCOP/Contraloría, impedimento cargos públicos, listas internas (`basesInternas.tpeps/tofac/tconsep...`) | **Crítica pero binaria** — no es "aproximable", son guardrails duros |
| 14 | **Comportamiento Interno ★ (nuevo)** | `basesInternas.personasIncumplimientos` (resultadoHabitoPago, perfilInterno, diasMora, saldoCapital) | **La más alta** — scoring propio de Novadata, separado del grupo 8 por su peso |
| 15 | **Otros** | vacunados, títulos | Muy baja — casi sin relación con crédito, mantener solo como metadata |

## El hallazgo más importante: `personasIncumplimientos`

Dentro de `nova_bases_internas` (que hoy vive escondido como un sub-campo de "Bancos") hay un recurso, `personasIncumplimientos`, que es **el scoring de comportamiento de pago propio de Novadata**: trae literalmente `resultadoHabitoPago` ("Mal pagador"/"Buen pagador"), `perfilInterno` ("MALO"/"BUENO"), días de mora máxima y vigente, cuotas vencidas/canceladas, saldo capital. Poblado en 19 de 25 personas de la muestra.

Esto debería ser la señal **más pesada** de todo el sistema — es literalmente el veredicto de otro motor de credit-scoring ya construido, no un dato crudo a interpretar. **v1: aplicado** — ahora vive en su propio grupo 14 "Comportamiento Interno" y su propia sección `comportamientoInterno` en la estructura estandarizada, en vez de enterrado dentro de `comportamientoBancario`.

## Qué implica esto para el código

- `novadata-client.ts`: mover `pensionAlimenticia`/`pensionAlimenticiaNovadata` de `vehiculos` a `funcion_judicial` (ya estaban ahí, correcto); mover `deudasAnt`/`deudasAmt`/`deudasEmov` de `bancos` a `vehiculos`; mover `retails` ya está en `bancos` (correcto, no moverlo — la corrección ya se había hecho antes de esta consulta).
- La estructura estandarizada (ver [estructura-estandarizada.md](estructura-estandarizada.md)) usa estos 14 grupos como base, pero los colapsa donde tiene sentido para el LLM (ver siguiente documento).
