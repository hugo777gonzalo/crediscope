-- marco-v36: la versión mínima que decidió el negocio el 2026-11-11, para
-- desplegar estructura-v21 (PR #153) con un marco que explique sus dos campos
-- nuevos, más la redacción aprobada el 2026-11-08 (revisión del análisis).
--
-- Sólo la fila de la versión: sin ella, el primer análisis falla por la clave
-- foránea de analysis_results.rules_version. Por eso ESQUEMA_MINIMO sube a este
-- número: primero se migra, después se despliega.
--
-- Desde v36 el interruptor del buró no tiene versión propia: con buró y sin él
-- el análisis es marco-v36, y lo que leyó lo dice su mensaje_al_modelo. Las
-- filas de marco-v34 y v35 se quedan, con sus análisis.
--
-- El número se toma al aplicarla (regla 1 de CLAUDE.md): si al fusionarla 150
-- ya está tomado, se renombra con el siguiente libre y se sube ESQUEMA_MINIMO
-- al mismo número.

insert into scoring_rules_versions (version, description) values
  ('marco-v36',
   'marco-v35 con estructura-v21 explicada y la redacción aprobada el 2026-11-08: las demandas de cobro con su año, sus años al día del análisis y quién demanda (p5: una de más de 2 años pesa menos); el Comportamiento Interno de una sola operación como referencia cualitativa, que se resalta y se contrasta con el buró, no pesa como él ni se suma a la deuda ni a las cuotas (p3, negocio 2026-11-11); «la persona» y no «el cliente», la primera frase dice la recomendación, la deuda contra el ingreso de un año (p9); el posible homónimo en una demanda penal como verificación de identidad (p1). Una sola versión con buró y sin él.')
on conflict (version) do nothing;
