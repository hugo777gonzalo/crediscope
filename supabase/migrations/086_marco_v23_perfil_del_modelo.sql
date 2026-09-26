-- marco-v23: el modelo lee el PERFIL DEL MODELO, una única fuente
-- consolidada (supabase/functions/_shared/perfil-del-modelo.ts), y el marco
-- explica por primera vez las fuentes de ingreso.
--
-- POR QUÉ
--
-- Hasta marco-v22 el marco recorría 15 grupos del perfil y fuentesIngreso
-- no era uno de ellos. El modelo recibía la clasificación con los nombres
-- internos -- pisoIngresoMensualReportado, reportada_por_tercero,
-- autodeclarada_en_minimo, senalesDeEscala -- que el negocio sacó de la
-- pantalla, sin una sola instrucción sobre cómo leerlos. Y cada camino al
-- modelo armaba su mensaje distinto: el backtest no ocultaba los campos
-- deshabilitados ni sumaba los ajustes vigentes, y el informe de
-- retroalimentación no traía nada de ingresos.
--
-- Ahora los tres caminos pasan por armarPerfilDelModelo(), que entrega los
-- ingresos con los nombres de la pantalla (Segmento, Por confirmar,
-- Empresa propia, Ingreso Mínimo SBU...) y suma lo que el analista ya veía
-- y el modelo no: perfil laboral, indicios de ingreso mayor, estabilidad y
-- tamaño del negocio. La renta queda afuera (decisión del 2026-09-25).
--
-- Se aplica ANTES de desplegar las funciones: sin la fila de la versión,
-- el primer análisis falla por clave foránea contra scoring_rules_versions.

insert into scoring_rules_versions (version, description) values
  ('marco-v23',
   'El modelo lee el perfil del modelo (una única fuente consolidada, perfil-del-modelo.ts) y el marco explica las fuentes de ingreso con los nombres de la pantalla: ingreso reportado al IESS / Ingreso Mínimo SBU, quién declara (empleador, Empresa propia, Afiliación voluntaria), perfil laboral, indicios de ingreso mayor (única base para suponer más ingreso), estabilidad y tamaño del negocio. "Empresa propia" en el SBU sin indicios es neutro. Prohíbe "piso" y las generalidades de segmento.')
on conflict (version) do nothing;

-- Los campos de fuentesIngreso del perfil del modelo, para que un admin
-- pueda apagarlos en Configuración como cualquier otro campo. Son los
-- nombres de la vista, no los del perfil guardado: lo que se apaga es lo
-- que el modelo lee.
insert into standard_profile_field_config (grupo, campo) values
  ('fuentesIngreso', 'segmento'),
  ('fuentesIngreso', 'estado'),
  ('fuentesIngreso', 'condicionesDeLaSegmentacion'),
  ('fuentesIngreso', 'informacionIess'),
  ('fuentesIngreso', 'sinInformacionActualEnElIess'),
  ('fuentesIngreso', 'mesesSinAportar'),
  ('fuentesIngreso', 'ingresoReportadoIess'),
  ('fuentesIngreso', 'esIngresoMinimoSbu'),
  ('fuentesIngreso', 'aportes'),
  ('fuentesIngreso', 'otrasFuentesSinMonto'),
  ('fuentesIngreso', 'perfilLaboral'),
  ('fuentesIngreso', 'tamanoDelNegocio'),
  ('fuentesIngreso', 'indiciosIngresoMayor'),
  ('fuentesIngreso', 'estabilidad'),
  ('fuentesIngreso', 'documentosDeConfirmacion')
on conflict (grupo, campo) do nothing;
