-- Limpieza: riesgoPenal.numeroDenunciasFiscalia quedó huérfano desde
-- framework-v5 (migración 009), que separó ese campo por rol del
-- cliente en numeroDenunciasComoSospechoso/numeroDenunciasComoVictima
-- pero no borró la fila vieja de standard_profile_field_config —
-- notado auditando la sección B de Configuración operativa.

delete from standard_profile_field_config
  where grupo = 'riesgoPenal' and campo = 'numeroDenunciasFiscalia';
