-- 0003_rls_policies.sql
--
-- Enable RLS and define tenant-scoped policies. The cardinal rules:
--
--   1. EVERY tenant-scoped table has RLS enabled. No exceptions.
--   2. Missing context (app.current_company_id() IS NULL) ⇒ zero rows.
--   3. Cross-tenant rows are unreachable both for SELECT and for write —
--      we add a WITH CHECK on every write policy so an INSERT/UPDATE
--      cannot smuggle a row into a foreign tenant.
--   4. The audit table is APPEND-ONLY. UPDATE and DELETE raise.
--   5. The companies table is its own RLS anchor: a session can see only
--      the company row identified by app.current_company_id().
--
-- Policy naming: <table>_<verb>_<scope>. Stable across migrations so policy
-- changes show up as drops + re-adds with the same identifiers.

BEGIN;

-- ============================================================================
-- core.companies
-- ============================================================================
ALTER TABLE core.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.companies FORCE ROW LEVEL SECURITY;

CREATE POLICY companies_select_self ON core.companies
  FOR SELECT TO app_tenant
  USING (id = app.current_company_id());

-- Tenant role cannot create or destroy company rows directly.
-- Provisioning goes through the admin role inside a vetted RPC.
CREATE POLICY companies_modify_none ON core.companies
  FOR ALL TO app_tenant
  USING (false)
  WITH CHECK (false);

-- ============================================================================
-- core.users
-- ============================================================================
-- Users are platform-scoped (one person, many companies). RLS exposes only:
--   - the caller's own user row
--   - peers in the caller's current company (via memberships)
-- A session with no current_company_id sees only itself.
ALTER TABLE core.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.users FORCE ROW LEVEL SECURITY;

CREATE POLICY users_select_self_or_peer ON core.users
  FOR SELECT TO app_tenant
  USING (
    id = app.current_user_id()
    OR EXISTS (
      SELECT 1 FROM core.memberships m
      WHERE m.user_id    = core.users.id
        AND m.company_id = app.current_company_id()
    )
  );

-- Profile self-update only. Email change goes through auth module + admin.
CREATE POLICY users_update_self ON core.users
  FOR UPDATE TO app_tenant
  USING      (id = app.current_user_id())
  WITH CHECK (id = app.current_user_id());

CREATE POLICY users_insert_none ON core.users
  FOR INSERT TO app_tenant
  WITH CHECK (false);

CREATE POLICY users_delete_none ON core.users
  FOR DELETE TO app_tenant
  USING (false);

-- ============================================================================
-- core.memberships
-- ============================================================================
ALTER TABLE core.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.memberships FORCE ROW LEVEL SECURITY;

CREATE POLICY memberships_select_in_company ON core.memberships
  FOR SELECT TO app_tenant
  USING (company_id = app.current_company_id());

CREATE POLICY memberships_insert_in_company ON core.memberships
  FOR INSERT TO app_tenant
  WITH CHECK (
    company_id = app.current_company_id()
    AND app.current_user_has('membership.invite')
  );

CREATE POLICY memberships_update_in_company ON core.memberships
  FOR UPDATE TO app_tenant
  USING      (company_id = app.current_company_id())
  WITH CHECK (
    company_id = app.current_company_id()
    AND app.current_user_has('membership.update')
  );

CREATE POLICY memberships_delete_in_company ON core.memberships
  FOR DELETE TO app_tenant
  USING (
    company_id = app.current_company_id()
    AND app.current_user_has('membership.remove')
  );

-- ============================================================================
-- core.company_modules
-- ============================================================================
ALTER TABLE core.company_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.company_modules FORCE ROW LEVEL SECURITY;

CREATE POLICY company_modules_select_in_company ON core.company_modules
  FOR SELECT TO app_tenant
  USING (company_id = app.current_company_id());

CREATE POLICY company_modules_insert_in_company ON core.company_modules
  FOR INSERT TO app_tenant
  WITH CHECK (
    company_id = app.current_company_id()
    AND app.current_user_has('module.install')
  );

CREATE POLICY company_modules_update_in_company ON core.company_modules
  FOR UPDATE TO app_tenant
  USING      (company_id = app.current_company_id())
  WITH CHECK (
    company_id = app.current_company_id()
    AND app.current_user_has('module.toggle')
  );

CREATE POLICY company_modules_delete_in_company ON core.company_modules
  FOR DELETE TO app_tenant
  USING (
    company_id = app.current_company_id()
    AND app.current_user_has('module.uninstall')
  );

-- ============================================================================
-- core.audit_logs   (APPEND-ONLY, tenant-scoped read)
-- ============================================================================
ALTER TABLE core.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.audit_logs FORCE ROW LEVEL SECURITY;

-- Tenant rows visible to that tenant. Platform-system rows (company_id IS
-- NULL) NEVER visible to a tenant role — that's the admin role's domain.
CREATE POLICY audit_logs_select_in_company ON core.audit_logs
  FOR SELECT TO app_tenant
  USING (company_id = app.current_company_id());

-- INSERTs allowed only when the row's company_id matches the session's.
-- The platform/admin role bypasses RLS and is the only writer of NULL rows.
CREATE POLICY audit_logs_insert_in_company ON core.audit_logs
  FOR INSERT TO app_tenant
  WITH CHECK (company_id = app.current_company_id());

-- Immutability: trigger raises on UPDATE/DELETE. We also deny via RLS so
-- a misconfigured GRANT cannot bypass.
CREATE POLICY audit_logs_update_none ON core.audit_logs
  FOR UPDATE TO app_tenant USING (false) WITH CHECK (false);
CREATE POLICY audit_logs_delete_none ON core.audit_logs
  FOR DELETE TO app_tenant USING (false);

CREATE OR REPLACE FUNCTION app.audit_logs_block_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'core.audit_logs is append-only (% on row id=%)', TG_OP, OLD.id
    USING ERRCODE = 'insufficient_privilege';
END $$;

COMMENT ON FUNCTION app.audit_logs_block_mutation() IS
  'Defense in depth: trigger that blocks UPDATE/DELETE on core.audit_logs even when called by a BYPASSRLS role.';

CREATE TRIGGER audit_logs_block_update
  BEFORE UPDATE ON core.audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.audit_logs_block_mutation();

CREATE TRIGGER audit_logs_block_delete
  BEFORE DELETE ON core.audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.audit_logs_block_mutation();

-- ============================================================================
-- core.outbox_events
-- ============================================================================
ALTER TABLE core.outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.outbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY outbox_events_select_in_company ON core.outbox_events
  FOR SELECT TO app_tenant
  USING (company_id = app.current_company_id());

CREATE POLICY outbox_events_insert_in_company ON core.outbox_events
  FOR INSERT TO app_tenant
  WITH CHECK (company_id = app.current_company_id());

-- A tenant cannot retry, advance status, or rewrite envelopes — that is the
-- publisher's job (admin role). Denied explicitly.
CREATE POLICY outbox_events_update_none ON core.outbox_events
  FOR UPDATE TO app_tenant USING (false) WITH CHECK (false);
CREATE POLICY outbox_events_delete_none ON core.outbox_events
  FOR DELETE TO app_tenant USING (false);

COMMIT;
