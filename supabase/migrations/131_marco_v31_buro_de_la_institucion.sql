-- marco-v31: el buró de la institución en lugar del buró de bancos y de
-- cooperativas de Proveedor_Info_1 (2026-10-16).
--
-- Sólo la fila de la versión: sin ella, el primer análisis con v31 falla por
-- la clave foránea de analysis_results.rules_version. v31 NO está activa
-- (CONFIG_LLM.buroDeLaInstitucion, apagado): esta fila no cambia nada de lo
-- que lee el modelo. Encenderla pide esta migración aplicada y ESQUEMA_MINIMO
-- en su número; primero se migra, después se despliega.
--
-- El número se toma al aplicarla (regla 1 de CLAUDE.md): si al fusionarla
-- 131 ya está tomado, se renombra con el siguiente libre.

insert into scoring_rules_versions (version, description) values
  ('marco-v31',
   'Un tema, una fuente: cuando la persona tiene una consulta vigente del buró de la institución (Equifax, de producción, hasta el 17 del mes), el perfil del modelo lleva buroEquifax en lugar del buró de bancos y de cooperativas de Proveedor_Info_1, y el marco su sección en lugar de los grupos 3 y 4. La calificación A1 a E se lee en días de mora; las casas comerciales de Proveedor_Info_1 se suman al sector comercial de Equifax. Sin buró, el perfil es el de v30 y sólo cambia el rótulo «Garantías:» por «Deuda como codeudor o garante». Decisiones del negocio del 2026-10-13 y del 2026-10-16.')
on conflict (version) do nothing;
