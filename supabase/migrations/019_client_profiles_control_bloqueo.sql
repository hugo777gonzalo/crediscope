-- Perfil del Cliente necesita saber si hay un control de bloqueo activo
-- (son hechos ya resueltos de forma determinística, no un juicio del
-- LLM) para mostrar un aviso propio, sin tener que esperar a correr el
-- Análisis con IA. structure-client ahora corre evaluarControlesBloqueo()
-- igual que analyze-client y lo persiste acá.

alter table client_profiles add column control_bloqueo jsonb;
