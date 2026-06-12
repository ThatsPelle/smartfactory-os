import { asCompanyId, asUserId } from '@sfos/contracts';
import { OkVoid } from '@sfos/contracts/result';
import { createAdminClient, createTenantClient } from '@sfos/db/client';
import type { TenantContext } from '@sfos/module-sdk';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { ModuleDeactivationService } from '../src/activation/deactivation-service.js';
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

suite('tenant module deactivation', () => {
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
      VALUES (${companyId}, 'Deactivation Test', 'deactivation-test')
    `;
    await admin.sql`
      INSERT INTO core.users (id, email, name)
      VALUES (${userId}, 'deactivation@test.invalid', 'Deactivation Owner')
    `;
    await admin.sql`
      INSERT INTO core.memberships (user_id, company_id, role)
      VALUES (${userId}, ${companyId}, 'owner')
    `;
  });

  it('deactivates active module and persists disabled audit/outbox truth before mirror update', async () => {
    const registry = new InMemoryModuleRegistry();
    const company = asCompanyId(companyId);
    let activeDuringHook = false;
    let receivedContext: TenantContext | undefined;
    registry.register({
      manifest: fakeManifest({ id: 'sfos.iam' }),
      lifecycle: {
        deactivate: async (ctx) => {
          receivedContext = ctx;
          activeDuringHook = await registry.isActive('sfos.iam', company);
          return OkVoid();
        }
      }
    });
    registry.markActive('sfos.iam', company);
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES (${companyId}, 'sfos.iam', true, 'active')
    `;

    const service = new ModuleDeactivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });
    const result = await service.deactivate({
      companyId: company,
      actorUserId: asUserId(userId),
      moduleId: 'sfos.iam',
      correlationId: 'deactivation-success'
    });

    expect(result).toEqual({
      ok: true,
      value: {
        companyId: company,
        moduleId: 'sfos.iam',
        status: 'disabled',
        changed: true
      }
    });
    expect(activeDuringHook).toBe(true);
    expect(receivedContext).toMatchObject({
      companyId: company,
      actorUserId: asUserId(userId),
      moduleId: 'sfos.iam'
    });
    expect(receivedContext).not.toHaveProperty('db');
    expect(await registry.isActive('sfos.iam', company)).toBe(false);

    const [activation] = await admin.sql<
      { status: string; enabled: boolean; disabled_at: Date | null }[]
    >`
      SELECT status, enabled, disabled_at
      FROM core.company_modules
      WHERE company_id = ${companyId} AND module_id = 'sfos.iam'
    `;
    expect(activation?.status).toBe('disabled');
    expect(activation?.enabled).toBe(false);
    expect(activation?.disabled_at).not.toBeNull();

    const [audit] = await admin.sql<{ action: string; entity_id: string }[]>`
      SELECT action, entity_id FROM core.audit_logs WHERE company_id = ${companyId}
    `;
    expect(audit).toEqual({ action: 'core.module.deactivated', entity_id: 'sfos.iam' });

    const [event] = await admin.sql<{ type: string; source_module: string }[]>`
      SELECT type, source_module FROM core.outbox_events WHERE company_id = ${companyId}
    `;
    expect(event).toEqual({ type: 'core.module.deactivated', source_module: 'sfos.core' });
  });

  it('rejects deactivation when module is not registered', async () => {
    const service = new ModuleDeactivationService({
      db: tenant.db,
      registry: new InMemoryModuleRegistry(),
      loggerFor: () => logger
    });

    const result = await service.deactivate({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId),
      moduleId: 'sfos.missing',
      correlationId: 'deactivation-missing'
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'module_not_registered', moduleId: 'sfos.missing' }
    });
  });

  it('treats repeated deactivation of disabled module as no-op and reconciles mirror', async () => {
    const registry = new InMemoryModuleRegistry();
    const company = asCompanyId(companyId);
    const lifecycle = recordingLifecycle({ deactivate: 'ok' });
    registry.register({ manifest: fakeManifest({ id: 'sfos.iam' }), lifecycle });
    registry.markActive('sfos.iam', company);
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status, disabled_at)
      VALUES (${companyId}, 'sfos.iam', false, 'disabled', now())
    `;
    const service = new ModuleDeactivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });

    const result = await service.deactivate({
      companyId: company,
      actorUserId: asUserId(userId),
      moduleId: 'sfos.iam',
      correlationId: 'deactivation-repeat'
    });

    expect(result.ok && result.value.changed).toBe(false);
    expect(lifecycle.calls).toEqual([]);
    expect(await registry.isActive('sfos.iam', company)).toBe(false);
    expect(await admin.sql`SELECT id FROM core.audit_logs`).toHaveLength(0);
    expect(await admin.sql`SELECT id FROM core.outbox_events`).toHaveLength(0);
  });

  it('uses documented no-op when module omits deactivate hook', async () => {
    const registry = new InMemoryModuleRegistry();
    const company = asCompanyId(companyId);
    registry.register({
      manifest: fakeManifest({ id: 'sfos.iam' }),
      lifecycle: recordingLifecycle()
    });
    registry.markActive('sfos.iam', company);
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES (${companyId}, 'sfos.iam', true, 'active')
    `;
    const service = new ModuleDeactivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });

    const result = await service.deactivate({
      companyId: company,
      actorUserId: asUserId(userId),
      moduleId: 'sfos.iam',
      correlationId: 'deactivation-no-hook'
    });

    expect(result.ok && result.value.changed).toBe(true);
    expect(await registry.isActive('sfos.iam', company)).toBe(false);
  });

  it('rejects module with no active DB truth', async () => {
    const registry = new InMemoryModuleRegistry();
    registry.register({
      manifest: fakeManifest({ id: 'sfos.iam' }),
      lifecycle: recordingLifecycle()
    });
    const service = new ModuleDeactivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });

    const result = await service.deactivate({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId),
      moduleId: 'sfos.iam',
      correlationId: 'deactivation-inactive'
    });

    expect(result).toEqual({
      ok: false,
      error: { code: 'module_not_active', moduleId: 'sfos.iam', status: 'missing' }
    });
  });

  it('rejects inconsistent active status and enabled flag', async () => {
    const registry = new InMemoryModuleRegistry();
    registry.register({
      manifest: fakeManifest({ id: 'sfos.iam' }),
      lifecycle: recordingLifecycle()
    });
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES (${companyId}, 'sfos.iam', false, 'active')
    `;
    const service = new ModuleDeactivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });

    const result = await service.deactivate({
      companyId: asCompanyId(companyId),
      actorUserId: asUserId(userId),
      moduleId: 'sfos.iam',
      correlationId: 'deactivation-inconsistent'
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'activation_state_inconsistent',
        moduleId: 'sfos.iam',
        status: 'active',
        enabled: false
      }
    });
  });

  it('preserves active truth and registry when deactivate hook fails', async () => {
    const registry = new InMemoryModuleRegistry();
    const company = asCompanyId(companyId);
    const lifecycle = recordingLifecycle({ deactivate: 'err' });
    registry.register({ manifest: fakeManifest({ id: 'sfos.iam' }), lifecycle });
    registry.markActive('sfos.iam', company);
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES (${companyId}, 'sfos.iam', true, 'active')
    `;
    const service = new ModuleDeactivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });

    const result = await service.deactivate({
      companyId: company,
      actorUserId: asUserId(userId),
      moduleId: 'sfos.iam',
      correlationId: 'deactivation-failed'
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'deactivation_hook_failed',
        moduleId: 'sfos.iam',
        message: 'deactivate returned err'
      }
    });
    expect(await registry.isActive('sfos.iam', company)).toBe(true);

    const [activation] = await admin.sql<
      { status: string; enabled: boolean; failure_reason: string | null }[]
    >`
      SELECT status, enabled, failure_reason
      FROM core.company_modules
      WHERE company_id = ${companyId} AND module_id = 'sfos.iam'
    `;
    expect(activation).toEqual({
      status: 'active',
      enabled: true,
      failure_reason: 'deactivate returned err'
    });
    const [event] = await admin.sql<{ type: string }[]>`
      SELECT type FROM core.outbox_events WHERE company_id = ${companyId}
    `;
    expect(event?.type).toBe('core.module.deactivation_failed');
    const [audit] = await admin.sql<{ action: string }[]>`
      SELECT action FROM core.audit_logs WHERE company_id = ${companyId}
    `;
    expect(audit?.action).toBe('core.module.deactivation_failed');
  });

  it('blocks provider deactivation while active dependent requires its capability', async () => {
    const registry = new InMemoryModuleRegistry();
    const company = asCompanyId(companyId);
    registry.register({
      manifest: fakeManifest({
        id: 'sfos.provider',
        capabilities: { provides: [{ key: 'demo.provider@1' }], provides_optional: [] }
      }),
      lifecycle: recordingLifecycle({ deactivate: 'ok' })
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
    registry.markActive('sfos.provider', company);
    registry.markActive('sfos.consumer', company);
    await admin.sql`
      INSERT INTO core.company_modules (company_id, module_id, enabled, status)
      VALUES
        (${companyId}, 'sfos.provider', true, 'active'),
        (${companyId}, 'sfos.consumer', true, 'active')
    `;
    const service = new ModuleDeactivationService({
      db: tenant.db,
      registry,
      loggerFor: () => logger
    });

    const result = await service.deactivate({
      companyId: company,
      actorUserId: asUserId(userId),
      moduleId: 'sfos.provider',
      correlationId: 'deactivation-dependent'
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'active_dependent_exists',
        moduleId: 'sfos.provider',
        dependentModuleId: 'sfos.consumer',
        capability: 'demo.provider@1'
      }
    });
    expect(await registry.isActive('sfos.provider', company)).toBe(true);
  });
});
