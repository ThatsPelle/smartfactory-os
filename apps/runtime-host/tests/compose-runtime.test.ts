import type { Manifest } from '@sfos/contracts/manifest';
import { asCompanyId } from '@sfos/contracts';
import { createAdminClient } from '@sfos/db/client';
import type { ModuleLifecycle } from '@sfos/module-sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { composeRuntime, defaultModules } from '../src/index.js';

const adminUrl = process.env['TEST_DATABASE_URL'];
const dbSuite = adminUrl ? describe : describe.skip;

const fakeManifest = (overrides: Partial<Manifest> & { id?: string } = {}): Manifest => {
  const id = overrides.id ?? 'sfos.runtime-test';
  const base: Manifest = {
    identity: {
      id,
      name: id,
      version: '0.1.0',
      vendor: 'Test',
      license: 'MIT'
    },
    platform: {
      manifest_schema_version: '1',
      platform_version_range: '>=0.0.1',
      runtime_modes_supported: ['cloud', 'self_hosted', 'workstation']
    },
    capabilities: { provides: [], provides_optional: [] },
    dependencies: { requires: [], requires_optional: [], platform_capabilities_required: [] },
    schema: { namespace: 'test', owns_tables: [], published_views: [] },
    migrations: { directory: 'db/migrations', ordering: 'sequential' },
    permissions: [],
    events_produced: [],
    events_consumed: [],
    metadata: { description: 'runtime host test module' }
  };
  const { id: _id, ...rest } = overrides;
  void _id;
  return { ...base, ...rest } as Manifest;
};

const recordingLifecycle = (): ModuleLifecycle & { calls: string[] } => {
  const calls: string[] = [];
  return {
    calls,
    activate: async () => {
      calls.push('activate');
      return { ok: true as const, value: undefined };
    },
    deactivate: async () => {
      calls.push('deactivate');
      return { ok: true as const, value: undefined };
    }
  } as ModuleLifecycle & { calls: string[] };
};

describe('runtime host composition', () => {
  it('composes core with IAM by default', async () => {
    process.env['DATABASE_IAM_URL'] = 'postgres://runtime-host.invalid/iam';
    const runtime = await composeRuntime({
      platformVersion: '0.1.0',
      runtimeMode: 'self_hosted'
    });

    expect(defaultModules.map((module) => module.manifest.identity.id)).toEqual(['sfos.iam']);
    expect(runtime.registry.find('sfos.iam')?.manifest.identity.id).toBe('sfos.iam');
    expect(runtime.hydration).toBeUndefined();
  });

  it('does not produce hydration output when hydration is disabled', async () => {
    process.env['DATABASE_IAM_URL'] = 'postgres://runtime-host.invalid/iam';
    const runtime = await composeRuntime({
      platformVersion: '0.1.0',
      runtimeMode: 'self_hosted'
    });

    expect(runtime.hydration).toBeUndefined();
  });

  it('runs hydration orchestration only when explicit hydration is configured', async () => {
    process.env['DATABASE_IAM_URL'] = 'postgres://runtime-host.invalid/iam';
    let enumerateCalls = 0;
    const runtime = await composeRuntime({
      platformVersion: '0.1.0',
      runtimeMode: 'self_hosted',
      hydration: {
        db: {} as never,
        enumerateCompanies: async () => {
          enumerateCalls += 1;
          return [];
        },
        listCompanyActivations: async () => []
      }
    });

    expect(enumerateCalls).toBe(1);
    expect(runtime.hydration).toEqual({
      ready: true,
      enumeratedCompanies: 0,
      results: []
    });
  });

  it('returns enumeration diagnostics when startup company listing fails', async () => {
    process.env['DATABASE_IAM_URL'] = 'postgres://runtime-host.invalid/iam';
    const runtime = await composeRuntime({
      platformVersion: '0.1.0',
      runtimeMode: 'self_hosted',
      hydration: {
        db: {} as never,
        enumerateCompanies: async () => {
          throw new Error('companies unavailable');
        },
        listCompanyActivations: async () => []
      }
    });

    expect(runtime.hydration).toEqual({
      ready: false,
      enumeratedCompanies: 0,
      results: [],
      enumerationError: {
        code: 'company_enumeration_failed',
        message: 'companies unavailable'
      }
    });
  });
});

dbSuite('runtime host hydration orchestration', () => {
  let admin: ReturnType<typeof createAdminClient>;

  beforeAll(() => {
    admin = createAdminClient(adminUrl!, { max: 2 });
    process.env['DATABASE_IAM_URL'] = 'postgres://runtime-host.invalid/iam';
  });

  afterAll(async () => {
    await admin.close();
  });

  beforeEach(async () => {
    await admin.sql`
      TRUNCATE
        core.outbox_events,
        core.audit_logs,
        core.company_modules,
        core.memberships,
        core.users,
        core.companies
      RESTART IDENTITY CASCADE
    `;
  });

  it('handles zero companies with empty hydration diagnostics', async () => {
    const runtime = await composeRuntime({
      platformVersion: '0.1.0',
      runtimeMode: 'self_hosted',
      hydration: { db: admin.db }
    });

    expect(runtime.hydration).toEqual({
      ready: true,
      enumeratedCompanies: 0,
      results: []
    });
  });

  it('hydrates active company module rows through host path without hooks, events, or writes', async () => {
    const companyId = '10000000-0000-4000-8000-000000000001';
    const lifecycle = recordingLifecycle();
    const modules = [{ manifest: fakeManifest({ id: 'sfos.runtime-test' }), lifecycle }];
    await admin.sql`
      INSERT INTO core.companies (id, name, slug)
      VALUES (${companyId}, 'Runtime Co', 'runtime-co')
    `;
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES (${companyId}, 'sfos.runtime-test', true, 'active')
    `;
    const beforeRows = await admin.sql`
      SELECT company_id, module_id, status, enabled, updated_at
      FROM core.company_modules
      ORDER BY company_id, module_id
    `;

    const runtime = await composeRuntime({
      platformVersion: '0.1.0',
      runtimeMode: 'self_hosted',
      modules,
      hydration: { db: admin.db }
    });

    expect(runtime.hydration).toEqual({
      ready: true,
      enumeratedCompanies: 1,
      results: [
        {
          companyId: asCompanyId(companyId),
          companyName: 'Runtime Co',
          companySlug: 'runtime-co',
          ready: true,
          activeModuleIds: ['sfos.runtime-test'],
          diagnostics: []
        }
      ]
    });
    expect(await runtime.registry.isActive('sfos.runtime-test', asCompanyId(companyId))).toBe(true);
    expect(lifecycle.calls).toEqual([]);
    expect(await admin.sql`SELECT id FROM core.outbox_events`).toHaveLength(0);
    expect(await admin.sql`SELECT id FROM core.audit_logs`).toHaveLength(0);
    const afterRows = await admin.sql`
      SELECT company_id, module_id, status, enabled, updated_at
      FROM core.company_modules
      ORDER BY company_id, module_id
    `;
    expect(afterRows).toEqual(beforeRows);
  });

  it('reports invalid persisted activation state without outbox writes', async () => {
    const companyId = '10000000-0000-4000-8000-000000000001';
    await admin.sql`
      INSERT INTO core.companies (id, name, slug)
      VALUES (${companyId}, 'Broken Co', 'broken-co')
    `;
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES (${companyId}, 'sfos.iam', false, 'active')
    `;

    const runtime = await composeRuntime({
      platformVersion: '0.1.0',
      runtimeMode: 'self_hosted',
      hydration: { db: admin.db }
    });

    expect(runtime.hydration?.ready).toBe(false);
    expect(runtime.hydration?.results[0]?.diagnostics).toEqual([
      {
        code: 'activation_state_inconsistent',
        moduleId: 'sfos.iam',
        status: 'active',
        enabled: false
      }
    ]);
    expect(await admin.sql`SELECT id FROM core.outbox_events`).toHaveLength(0);
    expect(await admin.sql`SELECT id FROM core.audit_logs`).toHaveLength(0);
  });
});
