-- 0001_iam_schema.sql
-- Bootstrap: module_iam schema, role, and grants.

BEGIN;

CREATE SCHEMA IF NOT EXISTS module_iam;

-- module_iam_role: owns module_iam tables. NOBYPASSRLS by default.
-- The application connects via DATABASE_IAM_URL with this role for credential
-- and session operations that must bypass app_tenant RLS restrictions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'module_iam_role') THEN
    CREATE ROLE module_iam_role LOGIN PASSWORD 'module_iam_role' NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA module_iam TO module_iam_role;
GRANT USAGE ON SCHEMA core       TO module_iam_role;
GRANT USAGE ON SCHEMA app        TO module_iam_role;

GRANT EXECUTE ON FUNCTION app.touch_updated_at()     TO module_iam_role;
GRANT EXECUTE ON FUNCTION app.current_user_id()      TO module_iam_role;
GRANT EXECUTE ON FUNCTION app.current_company_id()   TO module_iam_role;
GRANT EXECUTE ON FUNCTION app.current_user_has(text) TO module_iam_role;

-- module_iam_role owns all objects it creates in module_iam.
ALTER DEFAULT PRIVILEGES IN SCHEMA module_iam
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO module_iam_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA module_iam
  GRANT USAGE, SELECT ON SEQUENCES TO module_iam_role;

-- Cross-schema reads needed for login (user lookup) and membership writes.
GRANT SELECT ON core.users       TO module_iam_role;
GRANT SELECT ON core.companies   TO module_iam_role;
GRANT SELECT ON core.memberships TO module_iam_role;

-- Invitation acceptance creates memberships via app_tenant + withTenantContext.
-- module_iam_role does NOT write to core.memberships directly.

-- app_tenant needs read access to module_iam tables for session and invite views.
GRANT USAGE ON SCHEMA module_iam TO app_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA module_iam
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant;

COMMIT;
