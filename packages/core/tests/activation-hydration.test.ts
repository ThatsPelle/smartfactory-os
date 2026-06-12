import { asCompanyId, asUserId } from '@sfos/contracts';
import { createAdminClient, createTenantClient } from '@sfos/db/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ActivationRegistryHydrator } from '../src/activation/hydration.js';
import { InMemoryModuleRegistry } from '../src/registry/module-registry.js';
import { fakeManifest, recordingLifecycle } from './helpers.js';

const adminUrl = process.env['TEST_DATABASE_URL'];
const suite = adminUrl ? describe : describe.skip;

const tenantUrlFromAdmin = (url: string): string => {
  const parsed = new URL(url);
  parsed.username = 'app_tenant';
  parsed.password = 'app_tenant';
  return parsed.toString();
};

suite('activation registry hydration', () => {
  const companyId = '10000000-0000-4000-8000-000000000001';
  const otherCompanyId = '10000000-0000-4000-8000-000000000002';
  const userId = '20000000-0000-4000-8000-000000000001';
  let admin: ReturnType<typeof createAdminClient>;
  let tenant: ReturnType<typeof createTenantClient>;

  beforeAll(() => {
    admin = createAdminClient(adminUrl!, { max: 2 });
    tenant = createTenantClient(tenantUrlFromAdmin(adminUrl!), { max: 2 });
  });

  afterAll(async () => {
    await tenant.close();
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
    await admin.sql`
      INSERT INTO core.companies (id, name, slug)
      VALUES
        (${companyId}, 'Hydration Test', 'hydration-test'),
        (${otherCompanyId}, 'Other Hydration Test', 'other-hydration-test')
    `;
    await admin.sql`
      INSERT INTO core.users (id, email, name)
      VALUES (${userId}, 'hydration@test.invalid', 'Hydration Owner')
    `;
    await admin.sql`
      INSERT INTO core.memberships (user_id, company_id, role)
      VALUES
        (${userId}, ${companyId}, 'owner'),
        (${userId}, ${otherCompanyId}, 'owner')
    `;
  });

  it('hydrates only active rows for requested tenant without hooks, events, or writes', async () => {
    const registry = new InMemoryModuleRegistry();
    const activeLifecycle = recordingLifecycle({ activate: 'ok', deactivate: 'ok' });
    const disabledLifecycle = recordingLifecycle({ activate: 'ok' });
    registry.register({
      manifest: fakeManifest({ id: 'sfos.active' }),
      lifecycle: activeLifecycle
    });
    registry.register({
      manifest: fakeManifest({ id: 'sfos.disabled' }),
      lifecycle: disabledLifecycle
    });
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status, disabled_at)
      VALUES
        (${companyId}, 'sfos.active', true, 'active', null),
        (${companyId}, 'sfos.disabled', false, 'disabled', now()),
        (${otherCompanyId}, 'sfos.active', true, 'active', null)
    `;
    const beforeRows = await admin.sql`
      SELECT company_id, module_id, status, updated_at
      FROM core.company_modules
      ORDER BY company_id, module_id
    `;
    const hydrator = new ActivationRegistryHydrator({ db: tenant.db, registry });

    const result = await hydrator.hydrateCompany({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId)
    });

    expect(result).toEqual({
      companyId: asCompanyId(companyId),
      ready: true,
      activeModuleIds: ['sfos.active'],
      diagnostics: []
    });
    expect(await registry.isActive('sfos.active', asCompanyId(companyId))).toBe(true);
    expect(await registry.isActive('sfos.disabled', asCompanyId(companyId))).toBe(false);
    expect(await registry.isActive('sfos.active', asCompanyId(otherCompanyId))).toBe(false);
    expect(activeLifecycle.calls).toEqual([]);
    expect(disabledLifecycle.calls).toEqual([]);
    expect(await admin.sql`SELECT id FROM core.outbox_events`).toHaveLength(0);
    expect(await admin.sql`SELECT id FROM core.audit_logs`).toHaveLength(0);
    const afterRows = await admin.sql`
      SELECT company_id, module_id, status, updated_at
      FROM core.company_modules
      ORDER BY company_id, module_id
    `;
    expect(afterRows).toEqual(beforeRows);
  });

  it('returns deterministic diagnostic and clears tenant mirror for missing registered module', async () => {
    const registry = new InMemoryModuleRegistry();
    const company = asCompanyId(companyId);
    registry.markActive('stale.module', company);
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES (${companyId}, 'sfos.missing', true, 'active')
    `;
    const hydrator = new ActivationRegistryHydrator({ db: tenant.db, registry });

    const result = await hydrator.hydrateCompany({
      companyId: company,
      actorUserId: asUserId(userId)
    });

    expect(result).toEqual({
      companyId: company,
      ready: false,
      activeModuleIds: [],
      diagnostics: [{ code: 'module_not_registered', moduleId: 'sfos.missing' }]
    });
    expect(await registry.isActive('stale.module', company)).toBe(false);
    expect(await registry.isActive('sfos.missing', company)).toBe(false);
  });

  it('fails closed when required capability provider is not active in DB truth', async () => {
    const registry = new InMemoryModuleRegistry();
    registry.register({
      manifest: fakeManifest({
        id: 'sfos.provider',
        capabilities: { provides: [{ key: 'demo.provider@1' }], provides_optional: [] }
      }),
      lifecycle: recordingLifecycle()
    });
    registry.register({
      manifest: fakeManifest({
        id: 'sfos.consumer',
        dependencies: {
          requires: [{ capability: 'demo.provider@1', version_range: '*' }],
          requires_optional: [],
          platform_capabilities_required: []
        }
      }),
      lifecycle: recordingLifecycle()
    });
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES
        (${companyId}, 'sfos.provider', false, 'disabled'),
        (${companyId}, 'sfos.consumer', true, 'active')
    `;
    const hydrator = new ActivationRegistryHydrator({ db: tenant.db, registry });

    const result = await hydrator.hydrateCompany({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId)
    });

    expect(result).toEqual({
      companyId: asCompanyId(companyId),
      ready: false,
      activeModuleIds: [],
      diagnostics: [
        {
          code: 'required_capability_inactive',
          moduleId: 'sfos.consumer',
          capability: 'demo.provider@1'
        }
      ]
    });
    expect(await registry.isActive('sfos.consumer', asCompanyId(companyId))).toBe(false);
  });

  it('reports unavailable platform capability without mutating DB truth', async () => {
    const registry = new InMemoryModuleRegistry();
    registry.register({
      manifest: fakeManifest({
        id: 'sfos.consumer',
        dependencies: {
          requires: [],
          requires_optional: [],
          platform_capabilities_required: ['core.files@1']
        }
      }),
      lifecycle: recordingLifecycle()
    });
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES (${companyId}, 'sfos.consumer', true, 'active')
    `;
    const hydrator = new ActivationRegistryHydrator({ db: tenant.db, registry });

    const result = await hydrator.hydrateCompany({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId)
    });

    expect(result.diagnostics).toEqual([
      {
        code: 'platform_capability_unavailable',
        moduleId: 'sfos.consumer',
        capability: 'core.files@1'
      }
    ]);
    const [row] = await admin.sql<{ status: string; enabled: boolean }[]>`
      SELECT status, enabled FROM core.company_modules
      WHERE company_id = ${companyId} AND module_id = 'sfos.consumer'
    `;
    expect(row).toEqual({ status: 'active', enabled: true });
  });

  it('fails closed on inconsistent persisted activation flags', async () => {
    const registry = new InMemoryModuleRegistry();
    registry.register({
      manifest: fakeManifest({ id: 'sfos.iam' }),
      lifecycle: recordingLifecycle()
    });
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES (${companyId}, 'sfos.iam', false, 'active')
    `;
    const hydrator = new ActivationRegistryHydrator({ db: tenant.db, registry });

    const result = await hydrator.hydrateCompany({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId)
    });

    expect(result).toEqual({
      companyId: asCompanyId(companyId),
      ready: false,
      activeModuleIds: [],
      diagnostics: [
        {
          code: 'activation_state_inconsistent',
          moduleId: 'sfos.iam',
          status: 'active',
          enabled: false
        }
      ]
    });
  });
});
