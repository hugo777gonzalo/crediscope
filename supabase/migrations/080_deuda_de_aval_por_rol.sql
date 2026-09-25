-- Ocho campos nuevos de la estructura de Aval (aval-estructura-v4): los
-- cuatro montos de la deuda -- por vencer, vencido, demanda judicial,
-- cartera castigada -- separados en lo que la persona debe como titular y
-- lo que respalda como codeudor/garante.
--
-- POR QUÉ SE PUEDEN SEPARAR
--
-- Hasta v3 esos cuatro montos existían solamente como agregado de Aval
-- (`deudaVigenteTotal`), sin rol, y además DUPLICADOS: el segmento trae una
-- fila `sistemaCrediticio = "TOTAL"` que se sumaba junto con las demás, en
-- 129 de 129 personas con deuda del pool de prueba. Sacando esa fila, el
-- agregado de Aval es exactamente titular + codeudor/garante sumados desde
-- las operaciones, en 128/128 para por vencer, vencido y demanda y en
-- 125/128 para castigada (medido el 2026-09-24 sobre las 240 respuestas de
-- pruebas/aval/respuestas-crudas.jsonl). Así que partirlo por rol no inventa
-- nada: es el mismo número, dicho de quién es.
--
-- Mismo criterio que la 076: el catálogo lo define ESPEC, no la app, y
-- apagar un campo no lo borra. `on conflict do nothing` para que correrla
-- dos veces no pise lo que un admin ya haya apagado.

insert into aval_field_config (grupo, campo) values
  ('Deuda actual', 'porVencerTitular'),
  ('Deuda actual', 'vencidoTitular'),
  ('Deuda actual', 'demandaJudicialTitular'),
  ('Deuda actual', 'castigadaTitular'),
  ('Deuda contingente (codeudor/garante)', 'porVencerComoCodeudorGarante'),
  ('Deuda contingente (codeudor/garante)', 'vencidoComoCodeudorGarante'),
  ('Deuda contingente (codeudor/garante)', 'demandaJudicialComoCodeudorGarante'),
  ('Deuda contingente (codeudor/garante)', 'castigadaComoCodeudorGarante')
on conflict (grupo, campo) do nothing;
