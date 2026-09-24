-- De qué ambiente de Aval salió cada consulta.
--
-- POR QUÉ HACE FALTA UNA COLUMNA PARA ESTO
--
-- Una respuesta del ambiente de prueba es INDISTINGUIBLE de una de producción
-- en esta tabla: las dos son un A200 con sus 34 segmentos, y el filtro
-- laConsultaAvalSirve las acepta a las dos porque las dos son legítimas como
-- respuesta. Lo que cambia es si el contenido sirve para calificar a una
-- persona, y eso no estaba escrito en ninguna parte.
--
-- MEDIDO EL 2026-09-23, con 9 consultas contra api-test.avalburo.com:
--
--   - 7 devolvieron el nombre CORRECTO de la persona y todo el archivo
--     financiero en cero: score 0, deuda 0, tarjetas 0, consultas 12m 0. Un
--     A200 hueco. Indistinguible de alguien real sin historial.
--   - 2 devolvieron OTRA PERSONA, y son justamente las dos únicas con datos
--     financieros verosímiles:
--       1103857452 -> "LINDSEY CONLEY JOSHUA STEVEN", score 707
--                     (en Novadata esa cédula es TORRES TORRES PABLO VICENTE)
--       0101154151 -> "DANIEL HUNT DEVIN JERRY", score 73, deuda 23.060,
--                     292 consultas en 12 meses
--
-- El ambiente de prueba tiene un puñado de accesorios con historial inventado
-- y, para el resto, contesta el nombre del registro civil con el archivo
-- vacío. Sin esta columna, esas filas quedan colgadas de un client_id real y
-- alguien las puede usar para calificar a una persona con el historial de un
-- desconocido. Es la misma familia de error del 2026-09-15 (perfiles en
-- blanco que parecían gente sin deudas), pero peor: no está en blanco, está
-- lleno con los datos de otro.
--
-- POR QUÉ EL DEFAULT ES 'prueba' Y NO 'produccion'
--
-- El valor sale del host de AVAL_BASE_URL, no se declara a mano. Pero si
-- algún camino se olvida de escribirlo, el default decide. Defaultear a
-- 'produccion' haría que un olvido ascienda datos de prueba a datos buenos en
-- silencio; defaultear a 'prueba' hace que un olvido los degrade. Equivocarse
-- para el lado de desconfiar del dato se nota y se arregla; equivocarse para
-- el otro lado se descubre cuando ya se aprobó un crédito.

alter table consultas_aval
  add column ambiente text not null default 'prueba';

alter table consultas_aval
  add constraint consultas_aval_ambiente_check
  check (ambiente in ('prueba', 'produccion'));

comment on column consultas_aval.ambiente is
  'De qué ambiente de Aval salió la consulta, derivado del host de AVAL_BASE_URL: prueba (api-test) o produccion. Una fila con ambiente=prueba NO sirve para calificar: el ambiente de prueba devuelve el archivo financiero vacío, y para algunas cédulas devuelve los datos de otra persona (medido el 2026-09-23). Quien consuma esta tabla para decidir sobre una persona tiene que filtrar por ambiente.';

-- Las 9 filas que ya existían salieron todas de api-test (es el único ambiente
-- que .env.functions tuvo configurado). El default ya las deja en 'prueba';
-- se deja escrito para que se vea que se verificó y no se asumió.
update consultas_aval set ambiente = 'prueba' where ambiente is distinct from 'prueba';
