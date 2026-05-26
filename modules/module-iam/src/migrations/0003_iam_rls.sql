-- 0003_iam_rls.sql
-- RLS policies for module_iam tables.
-- Rules: fail-closed, no cross-tenant bleed, credentials/PRT unreachable by app_tenant.

BEGIN;

-- ============================================================================
-- module_iam.credentials — module_iam_role only; app_tenant blocked entirely
-- ============================================================================
ALTER TABLE module_iam.credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_iam.credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY credentials_all_none ON module_iam.credentials
  FOR ALL TO app_tenant USING (false) WITH CHECK (false);

-- ============================================================================
-- module_iam.sessions
-- ============================================================================
ALTER TABLE module_iam.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_iam.sessions FORCE ROW LEVEL SECURITY;

CREATE POLICY sessions_select_own ON module_iam.sessions
  FOR SELECT TO app_tenant
  USING (user_id = app.current_user_id() AND company_id = app.current_company_id());

CREATE POLICY sessions_update_revoke_own ON module_iam.sessions
  FOR UPDATE TO app_tenant
  USING      (user_id = app.current_user_id() AND company_id = app.current_company_id())
  WITH CHECK (user_id = app.current_user_id() AND company_id = app.current_company_id());

CREATE POLICY sessions_insert_none ON module_iam.sessions
  FOR INSERT TO app_tenant WITH CHECK (false);

CREATE POLICY sessions_delete_none ON module_iam.sessions
  FOR DELETE TO app_tenant USING (false);

-- ============================================================================
-- module_iam.invitations
-- ============================================================================
ALTER TABLE module_iam.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_iam.invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_select_in_company ON module_iam.invitations
  FOR SELECT TO app_tenant
  USING (company_id = app.current_company_id());

CREATE POLICY invitations_insert_in_company ON module_iam.invitations
  FOR INSERT TO app_tenant
  WITH CHECK (
    company_id = app.current_company_id()
    AND app.current_user_has('iam.invitation.create')
  );

CREATE POLICY invitations_update_in_company ON module_iam.invitations
  FOR UPDATE TO app_tenant
  USING      (company_id = app.current_company_id())
  WITH CHECK (
    company_id = app.current_company_id()
    AND app.current_user_has('iam.invitation.revoke')
  );

CREATE POLICY invitations_delete_none ON module_iam.invitations
  FOR DELETE TO app_tenant USING (false);

-- ============================================================================
-- module_iam.password_reset_tokens — module_iam_role only
-- ============================================================================
ALTER TABLE module_iam.password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_iam.password_reset_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY prt_all_none ON module_iam.password_reset_tokens
  FOR ALL TO app_tenant USING (false) WITH CHECK (false);

COMMIT;
