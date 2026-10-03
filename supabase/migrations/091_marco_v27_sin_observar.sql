-- marco-v27: se retira la recomendación "observar" (decisión del negocio
-- del 2026-10-03). Toda la zona gris pasa a "revisar"; cuando lo que falta
-- es información, lo dicen missingInfo y accionesSugeridas.
--
-- 1. La fila de la versión. Se aplica ANTES de desplegar: sin ella el
--    primer análisis falla por clave foránea.
-- 2. El comentario de analysis_results.recomendacion.
--
-- El check de la columna sigue aceptando 'observar' a propósito: hay un
-- análisis guardado con ella (de marco-v14, medido el 2026-10-03) y las
-- pantallas lo siguen mostrando. Que no se produzcan más lo asegura
-- normalizarRecomendacion() en llm-scoring.ts, que la convierte en
-- "revisar". Un check que la rechazara, aplicado antes de desplegar,
-- dejaría fallar el insert de cualquier análisis de v26 que la devolviera
-- en esa ventana (regla 8 de CLAUDE.md).

-- ---------- 1. La versión ----------
insert into scoring_rules_versions (version, description) values
  ('marco-v27',
   'Se retira la recomendación "observar": toda la zona gris es "revisar". Si falta información, missingInfo dice qué dato falta y por qué cambia la decisión, y accionesSugeridas qué pedirle al cliente. Si el modelo igual devuelve "observar", se guarda "revisar". El perfil del modelo no cambia respecto de v26.')
on conflict (version) do nothing;

-- ---------- 2. El comentario de la columna ----------
comment on column analysis_results.recomendacion is
  'Acción sugerida al analista: aprobar, revisar o negar. null en análisis anteriores a marco-v14. observar sólo en análisis de marco-v14 a v26: se retiró en marco-v27 (toda la zona gris es revisar).';
