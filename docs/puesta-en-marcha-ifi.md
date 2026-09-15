# Puesta en marcha en una institución financiera

Lista de lo que hay que **decidir con la IFI** antes de que CrediScope
analice a su primer cliente real, y de lo que hay que **acordar sobre el
servicio** antes de firmar.

No es una guía de instalación. Es el temario de una sesión de trabajo:
cada punto es una decisión de negocio que hoy vive escrita en el código
o en la base, y que alguien de la institución tiene que tomar y firmar.

## Cómo leer la columna "Cómo se cambia hoy"

| | |
|---|---|
| **Código** | Hay que editar un archivo y desplegar. Depende del equipo técnico. |
| **Pantalla** | Se cambia desde la aplicación, sin desplegar. |
| **Base** | Se cambia con una sentencia en la base. Rápido, pero no autoservicio. |

El plan es que todo lo de esta lista termine siendo **Pantalla**, en una
sección de administración. Mientras tanto, lo que sigue en **Código** hay
que dejarlo por escrito en el acta de la sesión: si no queda registrado
quién lo decidió, en seis meses nadie va a saber por qué está en ese
valor.

---

## 1. Accesos y credenciales

Se resuelve **antes** de la sesión: sin esto no hay nada que configurar.

| # | Qué | Quién decide | Cómo se cambia hoy |
|---|---|---|---|
| 1.1 | Credenciales de Novadata: URL, usuario y contraseña | TI de la IFI | Código (variables de entorno) |
| 1.2 | Clave del proveedor de IA y espacio de trabajo separado para la IFI | Nosotros | Código (variables de entorno) |
| 1.3 | **Tope de gasto mensual del proveedor de IA** | Nosotros + Finanzas | Consola del proveedor |
| 1.4 | Proyecto de base de datos propio de la IFI o compartido | Nosotros + TI | Decisión de arquitectura |
| 1.5 | Servidor de correo propio para el código de verificación del registro | TI de la IFI | Código (pendiente, hoy el registro va por enlace) |
| 1.6 | Buró de crédito (Equifax): credenciales de API | IFI | Pendiente, conector sin construir |

> **1.3 no es un detalle administrativo.** Es el parámetro que dejó el
> servicio caído el 2026-09-15. Tiene que quedar con un responsable, un
> monto y un aviso preventivo, no con un valor puesto de apuro.

---

## 2. Política de crédito

El corazón de la sesión. Nada de esto lo puede decidir el equipo
técnico: es criterio de riesgo de la institución.

| # | Qué | Valor hoy | Cómo se cambia hoy |
|---|---|---|---|
| 2.1 | **Qué hallazgos niegan automáticamente** y cuáles solo se informan | Ver tabla abajo | Código (`controles-bloqueo.ts`) |
| 2.2 | Rango del puntaje | 1 a 999 | Código |
| 2.3 | Qué significa cada recomendación: aprobar, observar, revisar, negar | Lo define el marco interpretativo en prosa, no un umbral numérico | Código (`marco-interpretativo.ts`) |
| 2.4 | Ajustes al criterio surgidos de la retroalimentación | Versión 1, sin ajustes | Pantalla (Retroalimentación › Versiones) |
| 2.5 | Qué bloques de información se consultan de la fuente | Todos habilitados | Pantalla (Configuración › Parámetros) |
| 2.6 | Qué campos del perfil entran al análisis | Todos habilitados | Pantalla |
| 2.7 | Qué segmentos ve el analista en el Perfil del Cliente | Todos visibles | Pantalla |

### 2.1 en detalle — la decisión más delicada

Un hallazgo **bloqueante** niega el crédito por regla, sin que el modelo
opine. Uno **informativo** aparece en el análisis y el modelo lo pondera
junto al resto. Hoy está así:

| Hallazgo | Hoy | Por qué |
|---|---|---|
| Lista negra interna de la fuente | **Niega** | |
| Listas de control internacionales | **Niega** | |
| Delitos graves de seguridad (delincuencia organizada, trata, armas, extorsión, asesinato) | **Niega** | |
| Persona expuesta políticamente (PEP) | Informa | Ser funcionario público no es un delito; exige debida diligencia reforzada, no negación |
| Homónimo (existe otra persona con el mismo nombre) | Informa | Negar por coincidencia de nombre castiga al homónimo inocente |
| Antecedentes penales en general | Informa | |

**Preguntar en la sesión:** ¿la IFI comparte estos cortes? ¿Su manual de
crédito o su área de cumplimiento exige algo distinto? Cualquier cambio
acá altera decisiones sobre personas reales y debe quedar firmado.

---

## 3. Parámetros del país y de la fuente

Cambian con el tiempo y no con el criterio. El riesgo acá no es
equivocarse: es **olvidarse de actualizarlos**.

| # | Qué | Valor hoy | Cada cuánto cambia | Cómo se cambia hoy |
|---|---|---|---|---|
| 3.1 | Corte del registro del IESS | `2026-07` | Cada 2 o 3 meses | Código (`fuentes-ingreso.ts`) |
| 3.2 | Salario básico unificado por año | 2019: 394 … 2026: 482 | Cada enero | Código |
| 3.3 | Códigos de tipo de empleador de la fuente | 8 naturalezas mapeadas | Cuando la fuente agrega uno | Código |
| 3.4 | Antigüedad máxima del perfil para reutilizarlo sin volver a consultar | 7 días | Decisión de negocio | Código (`AnalisisIA.jsx`) |
| 3.5 | Umbrales del SRI de "obligado a llevar contabilidad" | Sin confirmar | Cada año fiscal | Pendiente de confirmar |

> **3.1 se autodetecta viejo.** Si un cliente trae un mes posterior al
> configurado, la pantalla de Fuentes de Ingreso › Parámetros lo avisa.
> Aun así hay que actualizarlo: mientras tanto el módulo usa el corte del
> propio cliente, que no es lo mismo para todos.

> **3.4 tiene costo.** Bajarlo a 1 día da datos más frescos y multiplica
> las consultas a la fuente. Subirlo a 30 abarata y arriesga analizar
> sobre información vieja. Es una decisión de riesgo, no técnica.

---

## 4. Costo y tarifa

| # | Qué | Valor hoy | Cómo se cambia hoy |
|---|---|---|---|
| 4.1 | Modelo base y modelo de escalamiento | Haiku 4.5 / Sonnet 5 | Código (`llm-scoring.ts`) |
| 4.2 | Banda gris: en qué rango de puntaje se escala al modelo caro | 500 a 760 | Código |
| 4.3 | Techo de tokens de respuesta | 6.000 | Código |
| 4.4 | Razonamiento del modelo activo o desactivado | Activo | Código |
| 4.5 | Tarifas por modelo para valuar el consumo | Cargadas, **sin confirmar contra factura** | Base (`llm_precios`) |
| 4.6 | Presupuesto mensual y umbral de aviso preventivo | Sin definir | Pendiente |
| 4.7 | Tope de casos y tamaño de lote del backtesting | 10 incumplidos + 10 buenos, lotes de 10 | Código |

> **4.4 es el parámetro más caro de todos.** El razonamiento interno del
> modelo es hoy entre el 60% y el 70% de los tokens de salida, y la
> salida vale cinco veces la entrada. Apagarlo abarata mucho y degrada la
> calidad del análisis. Es una decisión de negocio explícita, no un
> ajuste técnico.

> **4.7 multiplica.** Un backtest hace **una llamada por caso**. Subir el
> tope a 100 casos convierte cada corrida en 100 consultas.

---

## 5. Seguridad y acceso

| # | Qué | Valor hoy | Cómo se cambia hoy |
|---|---|---|---|
| 5.1 | Cierre de sesión por inactividad | 60 minutos | Código (`caducidadSesion.js`) |
| 5.2 | Duración máxima de una sesión | 12 horas | Código |
| 5.3 | Quién es administrador y quién analista | Por usuario | Base (`profiles.rol`) |
| 5.4 | Quién ve los costos del servicio | Solo administración | Código + política de la base |
| 5.5 | Quién puede descargar la cartera completa en Excel | Cualquier analista | **Decisión pendiente** |
| 5.6 | Cuánto tiempo se conservan los análisis y los perfiles | Sin límite | Pendiente |
| 5.7 | Registro de quién consultó a qué persona | Activo, sin caducidad | Base (`audit_log`) |

> **5.5 hay que resolverlo antes de salir a producción.** Consultar un
> cliente a la vez y bajarse la cartera entera en una planilla son dos
> niveles de exposición distintos. Con datos de Función Judicial,
> Fiscalía y deudas bancarias, conviene que sea un permiso aparte.

> **5.6 lo define la normativa de la IFI**, no nosotros. Preguntar qué
> exige su política de tratamiento de datos personales.

---

## 6. Servicio y niveles de atención

Lo que se compromete por contrato. Requiere el sistema de alertas, que
todavía no está construido.

| # | Qué acordar | Estado |
|---|---|---|
| 6.1 | Horario de servicio y ventanas de mantenimiento | Sin definir |
| 6.2 | A quién se le avisa cuando el servicio falla, y por qué canal | Sin construir |
| 6.3 | Tiempo de resolución comprometido, **por causa** | Sin definir |
| 6.4 | Qué se promete cuando el proveedor de IA se cae | Modo reducido ya funciona: Perfil del Cliente, Fuentes de Ingreso y controles de bloqueo siguen disponibles |
| 6.5 | Disponibilidad mensual, separando lo propio de lo del proveedor | Medible desde Costos › Fallas e incidentes |
| 6.6 | Quién comunica a los usuarios finales durante un incidente | Sin definir |

> **6.3 se acuerda por causa, no en general.** Un tope de consumo
> alcanzado se corrige en minutos y es responsabilidad nuestra. Una caída
> del proveedor no se corrige: se comunica. Prometer un mismo tiempo para
> los dos es prometer algo que no se controla.

---

## Antes de cerrar la sesión

- [ ] Cada punto tiene un valor decidido y un responsable con nombre.
- [ ] Los puntos de la sección 2 están firmados por Riesgos o Crédito.
- [ ] Los puntos de la sección 5 están revisados por Cumplimiento o Seguridad.
- [ ] Los puntos en **Código** quedaron en el acta con su justificación.
- [ ] Hay fecha para los pendientes sin resolver.
- [ ] Hay una fecha de revisión: los parámetros de la sección 3 vencen solos.
