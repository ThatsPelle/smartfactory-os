-- 0000_init_schemas.sql
--
-- Bootstrap: schemas, roles, extensions.
--
-- Idempotent only for first-time bootstrap convenience. After the migration
-- ledger records this as applied, do NOT re-run.

BEGIN;

-- ---------- Schemas ----------
-- core: platform data tables. Modules MUST NOT create objects here.
-- app:  helper functions, triggers, RLS predicates. No data.
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS app;

-- ---------- Extensions ----------
-- gen_random_uuid() comes from pgcrypto; needed for default uuid PKs.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- Tenant role ----------
-- app_tenant: the role application connections use. NOBYPASSRLS so every
-- statement is subject to RLS. Connection comes via DATABASE_URL.
--
-- Password is stubbed for local dev (see .env.example). Real deployments
-- rotate this via the secrets manager and pass it through DATABASE_URL.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_tenant') THEN
    CREATE ROLE app_tenant LOGIN PASSWORD 'app_tenant' NOBYPASSRLS;
  END IF;
END $$;

GRANT USAGE ON SCHEMA core TO app_tenant;
GRANT USAGE ON SCHEMA app  TO app_tenant;

-- Future tables get default privileges — keep grants in one place.
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA core
  GRANT USAGE, SELECT ON SEQUENCES TO app_tenant;
ALTER DEFAULT PRIVILEGES IN SCHEMA app
  GRANT EXECUTE ON FUNCTIONS TO app_tenant;

COMMIT;
