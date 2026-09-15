-- marco-v18: distingue "no tiene pensión alimenticia" de "tiene y está
-- al día".
--
-- Bug reportado por el usuario sobre su propia cédula (0502937675): el
-- análisis decía "no se cuenta con el monto de la pensión alimenticia
-- comprometida (solo se sabe que está al día)". No tiene ninguna.
--
-- El dato de la fuente estaba bien -- pn_supa devolvía cero registros --
-- y el perfil también: pensionAlimenticiaEnMora=false. El problema era
-- el DISEÑO del campo: ese false significaba dos cosas opuestas, "no
-- tiene ninguna" y "tiene una y la paga al día", sin forma de
-- distinguirlas. El modelo leyó la segunda.
--
-- Es el mismo tipo de error que numeroEmpleadoresUltimos24Meses en v9
-- (un 0 que significaba "empleo estable" o "sin empleo hace 2 años").
-- Un valor que representa dos situaciones opuestas siempre termina
-- interpretado mal, y no es culpa de quien lo lee.
--
-- Magnitud, medida sobre 388 clientes reales: 351 NO tienen pensión
-- alimenticia a su cargo y hasta ahora se veían idénticos a los 18 que
-- la tienen y están al día. 19 la tienen en mora.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('marco-v18',
   'Nuevo campo tienePensionAlimenticia: separa "no tiene" de "tiene y está al día", que antes compartían el mismo valor',
   '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version <> 'marco-v18';

insert into standard_profile_field_config (grupo, campo) values
  ('riesgoJudicialCivil', 'tienePensionAlimenticia');
