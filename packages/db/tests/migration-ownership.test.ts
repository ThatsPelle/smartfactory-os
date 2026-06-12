import { describe, expect, it } from 'vitest';

import { validateMigrationOwnership } from '../scripts/migration-ownership.js';

describe('migration SQL ownership', () => {
  it('allows core migrations to mutate core and app objects', () => {
    expect(
      validateMigrationOwnership(
        `
          CREATE TABLE core.companies (id uuid);
          CREATE FUNCTION app.current_company_id() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
          ALTER TABLE core.companies ENABLE ROW LEVEL SECURITY;
        `,
        { kind: 'core', id: 'core', schema: 'core' }
      )
    ).toEqual([]);
  });

  it('allows module migrations to mutate only their own schema', () => {
    expect(
      validateMigrationOwnership(
        `
          CREATE SCHEMA module_alpha;
          CREATE TABLE module_alpha.items (id uuid REFERENCES core.companies(id));
          CREATE INDEX items_id_idx ON module_alpha.items (id);
          CREATE TRIGGER items_touch BEFORE UPDATE ON module_alpha.items
            FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at();
        `,
        { kind: 'module', id: 'sfos.alpha', schema: 'module_alpha' }
      )
    ).toEqual([]);
  });

  it('rejects module DDL that targets core objects', () => {
    expect(
      validateMigrationOwnership(
        `
          CREATE TABLE core.stolen (id uuid);
          ALTER TABLE core.companies ADD COLUMN compromised boolean;
          DROP TABLE core.audit_logs;
        `,
        { kind: 'module', id: 'sfos.alpha', schema: 'module_alpha' }
      )
    ).toEqual([
      'sfos.alpha: ALTER TABLE targets foreign schema core',
      'sfos.alpha: CREATE TABLE targets foreign schema core',
      'sfos.alpha: DROP TABLE targets foreign schema core'
    ]);
  });

  it('rejects module DDL that targets another module schema', () => {
    expect(
      validateMigrationOwnership('ALTER TABLE module_beta.items ADD COLUMN compromised boolean;', {
        kind: 'module',
        id: 'sfos.alpha',
        schema: 'module_alpha'
      })
    ).toEqual(['sfos.alpha: ALTER TABLE targets foreign schema module_beta']);
  });

  it('rejects unqualified module schema objects', () => {
    expect(
      validateMigrationOwnership('CREATE TABLE items (id uuid);', {
        kind: 'module',
        id: 'sfos.alpha',
        schema: 'module_alpha'
      })
    ).toEqual(['sfos.alpha: CREATE TABLE target must be schema-qualified']);
  });

  it('rejects core DDL that targets a module schema', () => {
    expect(
      validateMigrationOwnership('DROP TABLE module_alpha.items;', {
        kind: 'core',
        id: 'core',
        schema: 'core'
      })
    ).toEqual(['core: DROP TABLE targets foreign schema module_alpha']);
  });
});
