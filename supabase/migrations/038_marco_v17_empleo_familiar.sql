-- marco-v17: 3 hallazgos del usuario revisando análisis reales.
--
-- 1. VOLVIÓ LA DETECCIÓN DE EMPLEO EN NEGOCIO FAMILIAR.
--    El usuario recordaba que el modelo avisaba cuando el empleador era
--    un pariente, y que había dejado de hacerlo. Es cierto: aparece en
--    framework-v1, v3 y marco-v8 (comparaba por su cuenta el apellido
--    del cliente con el nombre del patrono) y después NO vuelve a
--    aparecer en 44 análisis seguidos.
--    No se perdió el dato -- se perdió la inferencia lateral: a medida
--    que el marco se volvió más prescriptivo, el modelo dejó de mirar
--    lo que el marco no le nombra. Ahora se calcula de forma
--    determinística en process.ts:
--      - empleadorConApellidoDelCliente
--      - clienteEsSuPropioEmpleador  (separado porque, validando sobre
--        los 41 clientes reales cacheados, 2 de los 7 positivos de la
--        primera versión eran gente que figura como su propio patrono:
--        trabajo por cuenta propia, no empleo familiar)
--    Validación cruzada Deno/Node: 41 perfiles, 0 diferencias.
--
-- 2. NO SE INFORMAN MÁS LAS AUSENCIAS QUE SON LA NORMA.
--    "Sin antecedentes penales" aparecía en 44 de los 59 análisis y en
--    el 100% de los de las últimas versiones, cuando los antecedentes
--    son ~2% de la población y bastante menos entre quienes piden
--    crédito. No distingue a nadie y entrena al analista a saltear esas
--    líneas, justo las que importan el día que sí hay un hallazgo.
--    Ahora solo se mencionan cuando están presentes, o cuando la fuente
--    falló y no se pudo verificar (eso va a missingInfo).
--
-- 3. COSTO POR ANÁLISIS (no requiere cambio de esquema, queda anotado).
--    El usuario notó que costaba el doble. Medido sobre llm_usage: la
--    entrada pasó de ~4.000 tokens promedio (framework-v1) a ~9.400
--    (marco-v14) y la salida de ~1.800 a ~2.900. No fue el experimento
--    del marco mínimo (fue un script aparte, nunca tocó producción):
--    fue el marco creciendo ronda tras ronda. Se activó caché de prompt
--    sobre el marco en llm-scoring.ts.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v17',
   'Detección de empleo en negocio familiar (determinística) y prohibición de informar ausencias que son la norma (antecedentes penales, listas de control)',
   '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version <> 'marco-v17';

insert into standard_profile_field_config (grupo, campo) values
  ('laboral', 'empleadorConApellidoDelCliente'),
  ('laboral', 'clienteEsSuPropioEmpleador');
