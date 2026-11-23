# Propuesta: estimar el ingreso adicional del dependiente con sueldo verificado

Pedido del negocio del 2026-11-23, después de decidir A14 (`docs/ingreso-adicional-por-corroborar.md`, 6.1): estimar el adicional de los
dependientes que A14 dejó sin estimar. Hoy la decisión vigente es no estimarlo; esta propuesta es el estudio que podría cambiarla.
Nada está construido.

## 1. Qué ya se probó, y por qué esto es distinto

- **12.14 y 12.36** (`docs/investigacion-predictor-de-ingresos.md`) entrenaron un modelo propio del extra del dependiente, con el sueldo como
  entrada.
  - La etiqueta fue «todo lo no verificado»: el total validado menos el sueldo recuperado del IESS.
  - En 12.36, hacia adelante: AUC de 0,687 para «tiene extra» (0,624 con RUC activo) y R² del monto de 0,01.
  - Sumar el extra estimado empeoró el tramo del total. No pasó la regla (AUC de 0,75 y R² de 0,25).
- **A14** midió que tampoco sirven `ingreso-v2` (el modelo de independientes) ni la cifra de Equifax.
- **Lo que no se usó en ninguno: de qué está hecho el adicional.** En AWS cada ítem de ingreso del titular trae:
  - su fuente: IESS, cuentas, IVA, RUC, otros, arriendos, jubilación o giros;
  - sus montos por tipo: declarado, banco principal y secundario, IVA e IVA semestral;
  - la observación del analista, que marca el recuperado del IESS y el predictor;
  - `estado`, el check de la pantalla de AWS con que el analista elige qué ítems cuentan para el total.
- **Medido el 2026-11-23**: el total validado es el sueldo recuperado más los ítems con el check en el 99,99% de los dependientes y públicos.
  - El check es exactamente «lo que se usó».
  - Un ítem con el check no es un ítem validado: el analista autoriza a veces el predictor como ingreso sin haberlo comprobado (lo dijo el negocio).

**La hipótesis nueva**: el extra fracasó como etiqueta porque mezcla montos comprobados con declarados y con el predictor. Separando por
componente queda una etiqueta más chica pero más limpia, que tal vez sí se pueda aprender.

## 2. De qué está hecho el adicional (medido, sin modelo)

Dependientes y públicos con sueldo recuperado del IESS, una consulta por persona, de 2021 a 2026. «Material» es el adicional seleccionado que
supera los USD 100 y el 10% del sueldo. El origen es el componente de mayor monto.

| Origen del adicional material | Todos (39.017) | Mediana | Con el archivo del origen | Con RUC activo (3.874) |
|---|---|---|---|---|
| Declarado (RUC, otros, giros) | 5.881 | 600 | 3,4% | 1.051 |
| Cuentas o IVA (estados de cuenta, declaraciones) | 1.356 | 670 | 29,0% | 262 |
| IESS escrito a mano (no recuperado del proveedor) | 1.171 | 1.000 | 6,3% | 119 |
| Predictor | 477 | 900 | 5,9% | 84 |
| Arriendo | 152 | 600 | 0,7% | 3 |
| Jubilación | 69 | 1.400 | 8,7% | 4 |
| **Con adicional material** | **9.106 (23,3%)** | | | **1.523 (39,3%)** |

- **Dos de cada tres adicionales son declarados**, casi nunca con archivo. Lo que se puede tomar por comprobado (cuentas o IVA) es el 15%.
- **Con archivo hay 393 en cinco años** (los documentos se registran desde 2024: 42 en 2024, 167 en 2025 y 184 en 2026). Es la etiqueta más limpia
  que existe para el extra del dependiente, y es chica.
- **«IESS escrito a mano»** no es un segundo empleo visible: sólo el 22% tiene más de un empleo en el IESS, igual que el resto (24%). Falta
  saber qué es.
- **El 15,4% tiene ítems sin el check** (el 41% con RUC activo): son ingresos que el analista vio y no aceptó.

Guion: `componentes.py` en las notas de la sesión de A14 (fuera del repositorio; sólo agregados, sin identificaciones).

## 3. La propuesta

**Qué se entrega.** El total sigue siendo el sueldo (peldaño 1). El adicional se muestra aparte, como ingreso adicional por corroborar:
- la probabilidad de que la persona tenga un adicional comprobable;
- su mínimo, si el modelo pasa las reglas.
Nunca se suma al sueldo como validado. Si no pasa, queda la señal sin monto que ya decidió A14.

**La etiqueta, por calidad** (sólo los ítems con el check):

| Grado | Qué es | Cuántos | Uso |
|---|---|---|---|
| A | Cuentas o IVA, con el archivo del origen | 393 | Medir (la prueba) |
| B | Cuentas o IVA sin archivo | 963 | Entrenar |
| B? | IESS escrito a mano | 1.171 | Sólo si la sesión 1 aclara qué es |
| C | Declarado con el check | 5.881 | Sólo como «dijo tener», nunca como monto |
| — | Predictor con el check | 477 | Fuera: es una predicción |
| Negativo | Ningún ítem adicional con el check | 29.911 | «Sin adicional documentado», no «sin adicional» |
| Rechazado | Ítem sin el check | 15,4% de las personas | Lo declarado que el analista no aceptó |

**El modelo, en dos partes**:
1. **Si tiene un adicional comprobable** (A o B contra el negativo).
2. **Cuánto**, como cuantiles del logaritmo del adicional, sólo con A y B.

Entradas:
- el sueldo y la carga de cuotas sobre el sueldo;
- el buró (deuda, crédito mayor anterior a la consulta, operaciones);
- edad, sexo y fecha;
- el SRI, en la variante que lo tiene.

Nunca entran la cifra de Equifax (decisión del negocio del 2026-11-23) ni una variable que en producción llega vacía (`NO_SERVIBLES`). El sueldo de
AWS es lo recuperado, a veces ya neto del aporte (12.15): hay que medir la paridad con el peldaño 1 de producción antes de usarlo.

**Población y prueba.**
- Dos variantes:
  - todos los años sin SRI (39.017 personas);
  - 2026 con SRI (12.986; el bloque no existe antes).
- Siempre hacia adelante, como la fase 0 (12.32): entrenar con lo anterior a julio de 2026 y probar con lo posterior, con intervalos por remuestreo.
- La medida principal es en RUC activo y en la etiqueta A.

**Reglas fijadas antes de medir** (si una falla, se cierra la opción (b) de A14 hasta tener documentos anotados, D8):
- **Si tiene un adicional comprobable:** AUC de 0,75 o más con RUC activo. 12.36 dio 0,624 con la etiqueta vieja.
- **El mínimo del adicional:** cubre al 90% o más de los A de la prueba, y su mediana es al menos la mitad del adicional real.
- **Lo que vería el analista:** de los adicionales que se mostrarían, el 70% o más tiene uno comprobable.
  La tasa base con RUC activo es 6,8% (262 de 3.874 con cuentas o IVA).

**Lo que no se hace:**
- No se baja nada más de AWS.
- No se consulta Equifax ni Proveedor_Info_1.
- No se usa el modelo de lenguaje.
- No se escribe en la base.

## 4. Las sesiones

Cada una arranca limpia desde `main`, lee este documento y el punto 18 de `docs/pendientes.md`, y termina con un PR de documentos o de
`scripts/predictor-ingresos/`. Los datos y las tablas por persona quedan fuera del repositorio, en `C:\datos\ingresos`.

1. **Datos y etiquetas** (sin modelo):
   - armar la tabla por persona del adicional por componente: un guion nuevo en `scripts/predictor-ingresos/` que use `preparar.armar_consultas()`;
   - aclarar qué es «IESS escrito a mano» y qué son los ítems sin el check, con lo que dejó la sesión que extrajo AWS (`docs/base-aws-originacion.md`) o
     preguntándole al negocio;
   - medir la paridad del sueldo de AWS con el peldaño 1.
   - Sale con la tabla de grados de 3 confirmada o corregida, y con las preguntas al negocio.
2. **El modelo**, con las reglas de 3 tal cual. Sale con la decisión «sigue» o «se cierra», medida.
3. **Conectarlo** (sólo si pasa): el adicional estimado en la escalera y en el ingreso adicional por corroborar, con las decisiones del negocio sobre
   cómo se muestra.

## 5. Lo que no resuelve

- La etiqueta A es chica (393 en cinco años) y es crédito automotriz. Un acierto ahí puede no repetirse en una institución.
- «Sin adicional documentado» no es «sin adicional»: el analista no busca cuando el sueldo ya alcanza. El modelo aprende cuándo se documenta
  un adicional, que se parece a cuándo hace falta.
- La etiqueta sigue anclada en lo que el analista veía, incluida la cifra de Equifax (12.15).
