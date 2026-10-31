-- marco-v32 y marco-v33: las correcciones de la revisión de casos reales del
-- 2026-10-31 y, sobre ellas, el buró de la institución.
--
-- Sólo las filas de las versiones: sin ellas, el primer análisis falla por la
-- clave foránea de analysis_results.rules_version. Por eso ESQUEMA_MINIMO sube
-- a este número: primero se migra, después se despliega.
--
-- marco-v32 entra con el despliegue, sin interruptor. marco-v33 sigue apagada:
-- la enciende CONFIG_LLM.buroDeLaInstitucion. La fila de marco-v31 se queda,
-- sin ningún análisis: el texto que describía ya no lo arma el código.
--
-- El número se toma al aplicarla (regla 1 de CLAUDE.md): si al fusionarla 144
-- ya está tomado, se renombra con el siguiente libre. Se escribió como 142 y
-- pasó a 144 porque el cambio de nombre del proveedor tomó la 142 y la 143.

insert into scoring_rules_versions (version, description) values
  ('marco-v32',
   'Correcciones de la revisión de casos reales del negocio del 2026-10-31: A2 es atraso y A1 la única de la escala sin atraso; la calificación no se traduce a días (en el comercial no sale sólo de ellos); el retail vale a su fecha de corte (llega fechaCorteRetail) y llega saldoPrestamosIessBiess; un tema de una fuente caída se dice con «no se pudo obtener información», y en el mensaje la lista pasa a temasSinRespuesta; el empleador vigente en null no es un negativo; un RUC depurado en relación de dependencia es neutro (estructura-v17); el rótulo «Deuda como codeudor o garante» pasa al texto de todos.'),
  ('marco-v33',
   'marco-v32 más el buró de la institución, con el armado de marco-v31: cuando la persona tiene una consulta vigente de Equifax, el perfil del modelo lleva buroEquifax en lugar del buró de bancos y de cooperativas de Proveedor_Info_1, y el marco su sección en lugar de los grupos 3 y 4. Sin buró, el texto y el perfil son los de marco-v32. Apagada hasta que el negocio la encienda (CONFIG_LLM.buroDeLaInstitucion).')
on conflict (version) do nothing;
