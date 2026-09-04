-- framework-v2 (ver supabase/functions/_shared/interpretive-framework.ts):
-- PEP (persona expuesta políticamente) deja de ser guardrail duro —
-- decisión explícita del usuario: ser PEP es un dato de compliance/AML,
-- no una señal de mal comportamiento de pago, y no debe descalificar al
-- cliente. Ver guardrails.ts (GuardrailFinding.blocking) y
-- compliance.esPersonaExpuestaPoliticamente en StandardClientProfile.

insert into scoring_rules_versions (version, description, weights, is_active) values
  ('framework-v2', 'PEP deja de ser guardrail duro — es dato de compliance/AML, no señal de riesgo crediticio', '{}'::jsonb, true);

update scoring_rules_versions set is_active = false where version in ('framework-v0', 'framework-v1');
