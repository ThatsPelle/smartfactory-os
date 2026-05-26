/**
 * Adversarial tenancy tests.
 *
 * These tests are written from the ATTACKER'S point of view. Each `it`
 * describes an attack that the platform must reject. A green test means
 * the attack was defeated; if you change RLS later, a red test means you
 * just opened a hole.
 *
 * Conventions:
 *   - The "tenant" client connects as the RLS-bound `app_tenant` role.
 *   - The "admin" client connects as the superuser. Used to set up rows
 *     that the tenant should NOT be able to see, and to verify side
 *     effects after blocked writes.
 *   - Every attack uses `withTenantContext` exactly the way production
 *     code would. We do not poke session GUCs directly — the threat model
 *     is "what can a confused tenant request achieve", not "what can a
 *     malicious DB connection do".
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { withTenantContext } from '../src/context.js';
import { asCompanyId, asUserId } from '@sfos/contracts';
import * as schema from '../src/schema/index.js';

import {
  buildClients,
  ensureMigrationsApplied,
  resetData,
  seedTwoTenants,
  type SeedResult
} from './helpers.js';

const adminUrl = process.env['TEST_DATABASE_URL'];

// Skip cleanly when no DB is available. The runner prints a clear notice so
// CI without a Postgres service doesn't silently look green.
const suite = adminUrl ? describe : describe.skip;

suite('adversarial tenancy', () => {
  let clients: ReturnType<typeof buildClients>;
  let seed: SeedResult;

  beforeAll(async () => {
    await ensureMigrationsApplied(adminUrl!);
    clients = buildClients(adminUrl!);
  });

  afterAll(async () => {
    await clients.tenant.close();
    await clients.admin.close();
  });

  beforeEach(async () => {
    await resetData(clients.admin.sql);
    seed = await seedTwoTenants(clients.admin.sql);
  });

  // ============================================================================
  // SELECT — cross-tenant read
  // ============================================================================
  it('rejects: reading the other tenant\'s memberships', async () => {
    const rows = await withTenantContext(
      clients.tenant.db,
      { companyId: asCompanyId(seed.companyA.id), userId: asUserId(seed.alice.id) },
      (tx) => tx.select().from(schema.memberships)
    );
    // RLS returns rows that belong to A, but NEVER any belonging to B.
    expect(rows.every((r) => r.companyId === seed.companyA.id)).toBe(true);
    expect(rows.some((r) => r.companyId === seed.companyB.id)).toBe(false);
  });

  it('rejects: reading the other tenant\'s company row', async () => {
    const rows = await withTenantContext(
      clients.tenant.db,
      { companyId: asCompanyId(seed.companyA.id), userId: asUserId(seed.alice.id) },
      (tx) => tx.select().from(schema.companies)
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(seed.companyA.id);
  });

  it('rejects: enumerating users across tenants', async () => {
    const rows = await withTenantContext(
      clients.tenant.db,
      { companyId: asCompanyId(seed.companyA.id), userId: asUserId(seed.alice.id) },
      (tx) => tx.select().from(schema.users)
    );
    // Alice sees herself + colleagues in A. Bob (in B) is invisible.
    expect(rows.find((u) => u.id === seed.alice.id)).toBeDefined();
    expect(rows.find((u) => u.id === seed.bob.id)).toBeUndefined();
  });

  // ============================================================================
  // INSERT — cross-tenant write
  // ============================================================================
  it('rejects: inserting a membership into the other tenant', async () => {
    await expect(
      withTenantContext(
        clients.tenant.db,
        { companyId: asCompanyId(seed.companyA.id), userId: asUserId(seed.alice.id) },
        (tx) =>
          tx.insert(schema.memberships).values({
            userId: seed.alice.id,
            companyId: seed.companyB.id, // <-- attack: smuggle a row into B
            role: 'admin'
          })
      )
    ).rejects.toThrow(/row-level security|violates row-level/i);
  });

  it('rejects: inserting an audit_log attributed to the other tenant', async () => {
    await expect(
      withTenantContext(
        clients.tenant.db,
        { companyId: asCompanyId(seed.companyA.id), userId: asUserId(seed.alice.id) },
        (tx) =>
          tx.insert(schema.auditLogs).values({
            companyId: seed.companyB.id, // <-- attack
            actorKind: 'user',
            actorId: seed.alice.id,
            action: 'tampered',
            entityKind: 'membership',
            entityId: 'x'
          })
      )
    ).rejects.toThrow(/row-level security|violates row-level/i);
  });

  it('rejects: inserting an outbox event for the other tenant', async () => {
    await expect(
      withTenantContext(
        clients.tenant.db,
        { companyId: asCompanyId(seed.companyA.id), userId: asUserId(seed.alice.id) },
        (tx) =>
          tx.insert(schema.outboxEvents).values({
            id: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
            companyId: seed.companyB.id, // <-- attack
            type: 'crm.contact.created',
            version: '1.0',
            sourceModule: 'crm',
            correlationId: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
            envelope: { spoof: true },
            occurredAt: new Date()
          })
      )
    ).rejects.toThrow(/row-level security|violates row-level/i);
  });

  // ============================================================================
  // Missing / invalid context
  // ============================================================================
  it('rejects: querying without a tenant context (fail-closed)', async () => {
    // Top-level db (no SET LOCAL) — RLS sees NULL → 0 rows for SELECT and
    // a WITH CHECK violation for INSERT.
    const rows = await clients.tenant.db.select().from(schema.companies);
    expect(rows).toHaveLength(0);

    await expect(
      clients.tenant.db.insert(schema.memberships).values({
        userId: seed.alice.id,
        companyId: seed.companyA.id,
        role: 'member'
      })
    ).rejects.toThrow();
  });

  it('rejects: a malformed company id at the context boundary', async () => {
    await expect(
      withTenantContext(
        clients.tenant.db,
        // @ts-expect-error - intentional: probing the validator
        { companyId: 'not-a-uuid', userId: seed.alice.id },
        async () => undefined
      )
    ).rejects.toThrow();
  });

  // ============================================================================
  // Audit immutability
  // ============================================================================
  it('rejects: updating an audit_log row, even as admin (trigger fires)', async () => {
    // Seed a row via the tenant role first so it's a realistic audit entry.
    await withTenantContext(
      clients.tenant.db,
      { companyId: asCompanyId(seed.companyA.id), userId: asUserId(seed.alice.id) },
      (tx) =>
        tx.insert(schema.auditLogs).values({
          companyId: seed.companyA.id,
          actorKind: 'user',
          actorId: seed.alice.id,
          action: 'company.module.installed',
          entityKind: 'company_module',
          entityId: 'crm'
        })
    );

    // Admin (BYPASSRLS) tries to mutate — trigger still raises.
    await expect(
      clients.admin.sql`UPDATE core.audit_logs SET action = 'tampered'`
    ).rejects.toThrow(/append-only/i);

    await expect(
      clients.admin.sql`DELETE FROM core.audit_logs`
    ).rejects.toThrow(/append-only/i);
  });

  // ============================================================================
  // Outbox tenant isolation (SELECT)
  // ============================================================================
  it('rejects: enumerating the other tenant\'s outbox events', async () => {
    // Admin seeds an outbox row for B.
    await clients.admin.sql`
      INSERT INTO core.outbox_events
        (id, company_id, type, version, source_module, correlation_id, envelope, occurred_at)
      VALUES
        ('01ARZ3NDEKTSV4RRFFQ69G5FAV',
         ${seed.companyB.id},
         'crm.contact.created',
         '1.0',
         'crm',
         '01ARZ3NDEKTSV4RRFFQ69G5FAV',
         '{}'::jsonb,
         now())
    `;

    const rows = await withTenantContext(
      clients.tenant.db,
      { companyId: asCompanyId(seed.companyA.id), userId: asUserId(seed.alice.id) },
      (tx) => tx.select().from(schema.outboxEvents)
    );
    expect(rows).toHaveLength(0);
  });

  // ============================================================================
  // Defense in depth: SET LOCAL leak across transactions
  // ============================================================================
  it('does not leak tenant context across transactions on a pooled connection', async () => {
    // Bind to A, do work, exit transaction.
    await withTenantContext(
      clients.tenant.db,
      { companyId: asCompanyId(seed.companyA.id), userId: asUserId(seed.alice.id) },
      async (tx) => {
        const rows = await tx.select().from(schema.companies);
        expect(rows[0]!.id).toBe(seed.companyA.id);
      }
    );

    // Immediately after, on the SAME pooled client, do a context-free query.
    // RLS must see NULL again — `SET LOCAL` lifetime is the transaction.
    const orphaned = await clients.tenant.db.execute(
      sql`SELECT app.current_company_id() AS cid`
    );
    expect(orphaned[0]!['cid']).toBeNull();
  });
});
