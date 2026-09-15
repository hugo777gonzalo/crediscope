-- El canal de aviso es un componente más y se vigila como tal.
--
-- Un sistema de alertas sin canal configurado falla en silencio por
-- definición: justamente no puede avisar que no puede avisar. Tratándolo
-- como un componente que el vigía comprueba en cada corrida, su estado
-- aparece en la misma pantalla que el resto y deja de depender de que
-- alguien se acuerde de revisarlo.
insert into servicio_estado (componente, estado, ultimo_fallo_tipo, ultimo_error)
values (
  'canal_aviso',
  'desconocido',
  null,
  null
)
on conflict (componente) do nothing;

comment on column servicio_estado.componente is
  'llm, fuente_datos o canal_aviso. Los tres de los que depende que el servicio funcione y que alguien se entere cuando no.';

-- El presupuesto vuelve a "sin definir": el valor lo decide el negocio,
-- no la prueba que lo dejó en tres dólares.
update config_operativa set valor = '0'::jsonb where clave = 'presupuesto_llm_mensual_usd';
