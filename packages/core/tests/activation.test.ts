import { asCompanyId, asUserId } from '@sfos/contracts';
import { createAdminClient, createTenantClient } from '@sfos/db/client';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ModuleActivationService } from '../src/activation/service.js';
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

const logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  child: () => logger
};

suite('tenant module activation', () => {
  const companyId = '10000000-0000-4000-8000-000000000001';
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
      VALUES (${companyId}, 'Activation Test', 'activation-test')
    `;
    await admin.sql`
      INSERT INTO core.users (id, email, name)
      VALUES (${userId}, 'activation@test.invalid', 'Activation Owner')
    `;
    await admin.sql`
      INSERT INTO core.memberships (user_id, company_id, role)
      VALUES (${userId}, ${companyId}, 'owner')
    `;
  });

  it('activates a registered module and writes registry, audit, and outbox truth', async () => {
    const registry = new InMemoryModuleRegistry();
    const lifecycle = recordingLifecycle({ activate: 'ok' });
    registry.register({
      manifest: fakeManifest({
        id: 'sfos.iam',
        schema: {
          namespace: 'module_iam',
          owns_tables: ['credentials'],
          published_views: []
        },
        capabilities: {
          provides: [{ key: 'iam.authentication@1' }],
          provides_optional: []
        }
      }),
      lifecycle
    });

    const service = new ModuleActivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });
    const result = await service.activate({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId),
      moduleId: 'sfos.iam',
      correlationId: 'activation-success'
    });

    expect(result.ok).toBe(true);
    expect(lifecycle.calls).toEqual(['activate']);
    expect(await registry.isActive('sfos.iam', asCompanyId(companyId))).toBe(true);

    const [activation] = await admin.sql<
      { module_id: string; status: string; enabled: boolean; failure_reason: string | null }[]
    >`
      SELECT module_id, status, enabled, failure_reason
      FROM core.company_modules
      WHERE company_id = ${companyId}
    `;
    expect(activation).toEqual({
      module_id: 'sfos.iam',
      status: 'active',
      enabled: true,
      failure_reason: null
    });

    const [audit] = await admin.sql<{ action: string; entity_id: string }[]>`
      SELECT action, entity_id FROM core.audit_logs WHERE company_id = ${companyId}
    `;
    expect(audit).toEqual({ action: 'core.module.activated', entity_id: 'sfos.iam' });

    const [event] = await admin.sql<{ type: string; source_module: string }[]>`
      SELECT type, source_module FROM core.outbox_events WHERE company_id = ${companyId}
    `;
    expect(event).toEqual({ type: 'core.module.activated', source_module: 'sfos.core' });
  });

  it('rejects activation when module is not registered', async () => {
    const service = new ModuleActivationService({
      db: tenant.db,
      registry: new InMemoryModuleRegistry(),
      loggerFor: () => logger
    });

    const result = await service.activate({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId),
      moduleId: 'sfos.missing',
      correlationId: 'activation-missing'
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'module_not_registered', moduleId: 'sfos.missing' }
    });
    const rows = await admin.sql`SELECT id FROM core.company_modules`;
    expect(rows).toHaveLength(0);
  });

  it('rejects activation when a required capability provider is inactive', async () => {
    const registry = new InMemoryModuleRegistry();
    registry.register({
      manifest: fakeManifest({
        id: 'sfos.provider',
        capabilities: {
          provides: [{ key: 'demo.provider@1' }],
          provides_optional: []
        }
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
      lifecycle: recordingLifecycle({ activate: 'ok' })
    });

    const service = new ModuleActivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });
    const result = await service.activate({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId),
      moduleId: 'sfos.consumer',
      correlationId: 'activation-dependency'
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'required_capability_inactive',
        moduleId: 'sfos.consumer',
        capability: 'demo.provider@1'
      }
    });
  });

  it('records failed status when module activation hook returns an error', async () => {
    const registry = new InMemoryModuleRegistry();
    registry.register({
      manifest: fakeManifest({ id: 'sfos.iam' }),
      lifecycle: recordingLifecycle({ activate: 'err' })
    });
    const service = new ModuleActivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });

    const result = await service.activate({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId),
      moduleId: 'sfos.iam',
      correlationId: 'activation-failed'
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'activation_hook_failed',
        moduleId: 'sfos.iam',
        message: 'activate returned err'
      }
    });
    expect(await registry.isActive('sfos.iam', asCompanyId(companyId))).toBe(false);

    const [activation] = await admin.sql<
      { status: string; enabled: boolean; failure_reason: string | null }[]
    >`
      SELECT status, enabled, failure_reason
      FROM core.company_modules
      WHERE company_id = ${companyId}
    `;
    expect(activation).toEqual({
      status: 'failed',
      enabled: false,
      failure_reason: 'activate returned err'
    });
    const [event] = await admin.sql<{ type: string }[]>`
      SELECT type FROM core.outbox_events WHERE company_id = ${companyId}
    `;
    expect(event?.type).toBe('core.module.activation_failed');
  });
});
