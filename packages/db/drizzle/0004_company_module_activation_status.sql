-- 0004_company_module_activation_status.sql
--
-- Explicit tenant module activation state. `enabled` remains for compatibility
-- with existing readers; `status` is the orchestration truth going forward.

BEGIN;

CREATE TYPE core.company_module_activation_status AS ENUM (
  'pending',
  'active',
  'disabled',
  'failed'
);

ALTER TABLE core.company_modules
  ADD COLUMN status core.company_module_activation_status;

UPDATE core.company_modules
SET status = CASE
  WHEN enabled THEN 'active'::core.company_module_activation_status
  ELSE 'disabled'::core.company_module_activation_status
END;

ALTER TABLE core.company_modules
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL,
  ADD COLUMN failure_reason text,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER company_modules_touch_updated_at
  BEFORE UPDATE ON core.company_modules
  FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();

COMMIT;
