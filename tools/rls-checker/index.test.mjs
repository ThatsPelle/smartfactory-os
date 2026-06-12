import assert from 'node:assert/strict';
import test from 'node:test';

import { validateRlsCorpus } from './index.mjs';

const validSql = `
CREATE TABLE core.companies (
  id uuid PRIMARY KEY,
  company_id uuid
);
CREATE TABLE module_iam.sessions (
  id text PRIMARY KEY,
  company_id uuid
);

CREATE FUNCTION app.current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION app.current_user_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION app.current_user_has(_permission text) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;

ALTER TABLE core.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE core.companies FORCE ROW LEVEL SECURITY;
CREATE POLICY companies_select_self ON core.companies
  USING (company_id = app.current_company_id());

ALTER TABLE module_iam.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE module_iam.sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY sessions_select_own ON module_iam.sessions
  USING (company_id = app.current_company_id());

CREATE POLICY audit_logs_update_none ON core.audit_logs FOR UPDATE USING (false);
CREATE POLICY audit_logs_delete_none ON core.audit_logs FOR DELETE USING (false);
CREATE FUNCTION app.audit_logs_block_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$;
CREATE TRIGGER audit_logs_block_update BEFORE UPDATE ON core.audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.audit_logs_block_mutation();
CREATE TRIGGER audit_logs_block_delete BEFORE DELETE ON core.audit_logs
  FOR EACH ROW EXECUTE FUNCTION app.audit_logs_block_mutation();
`;

test('accepts SQL with forced RLS, tenant helpers, and immutable audit', () => {
  assert.deepEqual(validateRlsCorpus([{ path: 'migrations.sql', content: validSql }]), []);
});

test('rejects missing ENABLE and FORCE RLS statements', () => {
  const errors = validateRlsCorpus([
    {
      path: 'migrations.sql',
      content: validSql
        .replace('ALTER TABLE core.companies ENABLE ROW LEVEL SECURITY;', '')
        .replace('ALTER TABLE module_iam.sessions FORCE ROW LEVEL SECURITY;', '')
    }
  ]).join('\n');

  assert.match(errors, /core\.companies.*ENABLE ROW LEVEL SECURITY/);
  assert.match(errors, /module_iam\.sessions.*FORCE ROW LEVEL SECURITY/);
});

test('rejects missing helpers, audit guards, and company-context policy', () => {
  const errors = validateRlsCorpus([
    {
      path: 'migrations.sql',
      content: validSql
        .replace('CREATE FUNCTION app.current_user_id()', 'CREATE FUNCTION app.other_user_id()')
        .replace('CREATE TRIGGER audit_logs_block_delete', 'CREATE TRIGGER other_delete')
        .replace('USING (company_id = app.current_company_id());', 'USING (true);')
    }
  ]).join('\n');

  assert.match(errors, /app\.current_user_id/);
  assert.match(errors, /audit_logs_block_delete/);
  assert.match(errors, /core\.companies.*tenant context/);
});

test('rejects an expected table missing from the migration corpus', () => {
  const errors = validateRlsCorpus([{ path: 'migrations.sql', content: validSql }], {
    requiredTables: ['module_iam.credentials']
  }).join('\n');

  assert.match(errors, /module_iam\.credentials: required table not found/);
});
