/**
 * Outbox publisher integration test.
 *
 * Requires Postgres. Skips with a visible notice when TEST_DATABASE_URL is
 * unset, matching the @sfos/db test pattern.
 *
 * Strategy: bootstrap the runtime, set up a subscription on the bus, seed
 * an outbox row via the admin client (RLS-bypassing) so the publisher can
 * claim it, run one publisher cycle, assert the row went to `published`
 * and the handler was invoked exactly once. Then a failure path: seed a
 * row whose handler throws, run two cycles, assert it lands in `pending`
 * with attempts=1 then `failed` after the configured max.
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createAdminClient, type SfosClient } from '@sfos/db/client';
import { EventBus } from '../src/events/bus.js';
import { OutboxPublisher } from '../src/outbox/publisher.js';

const adminUrl = process.env['TEST_DATABASE_URL'];
const suite = adminUrl ? describe : describe.skip;

const ULID_A = '01ARZ3NDEKTSV4RRFFQ69G5F00';
const ULID_B = '01ARZ3NDEKTSV4RRFFQ69G5F01';

const buildEnvelope = (id: string, companyId: string, type: string): object => ({
  id,
  type,
  version: '1.0',
  occurred_at: new Date().toISOString(),
  recorded_at: new Date().toISOString(),
  company_id: companyId,
  source_module: 'test',
  source_entity_id: null,
  emitted_by: { kind: 'system', id: 'test' },
  correlation_id: id,
  causation_id: null,
  trace_id: null,
  depth: 0,
  payload: { stub: true },
  metadata: {},
  visibility: 'public',
  audit_required: false
});

const insertOutbox = async (
  admin: SfosClient,
  id: string,
  companyId: string,
  type: string
): Promise<void> => {
  await admin.sql`
    INSERT INTO core.outbox_events
      (id, company_id, type, version, source_module, correlation_id, envelope, occurred_at)
    VALUES
      (${id}, ${companyId}, ${type}, '1.0', 'test', ${id},
       ${admin.sql.json(buildEnvelope(id, companyId, type))}::jsonb,
       now())
  `;
};

suite('outbox publisher', () => {
  let admin: SfosClient;
  let companyId: string;

  beforeAll(async () => {
    admin = createAdminClient(adminUrl!);
    // Ensure the schema is migrated. Tests assume the operator ran
    // `pnpm --filter @sfos/db db:migrate` first.
    const [c] = await admin.sql<{ id: string }[]>`
      INSERT INTO core.companies (name, slug) VALUES ('outbox-test', 'outbox-test-${Math.random().toString(36).slice(2, 8)}')
      RETURNING id
    `;
    companyId = c!.id;
  });

  afterAll(async () => {
    await admin.sql`DELETE FROM core.outbox_events WHERE company_id = ${companyId}`;
    await admin.sql`DELETE FROM core.companies WHERE id = ${companyId}`;
    await admin.close();
  });

  beforeEach(async () => {
    await admin.sql`DELETE FROM core.outbox_events WHERE company_id = ${companyId}`;
  });

  it('claims pending rows, dispatches, and marks published', async () => {
    const bus = new EventBus();
    const seen: string[] = [];
    bus.subscribe('test', 'test.event.*', async (e) => {
      seen.push(e.id);
    });
    await insertOutbox(admin, ULID_A, companyId, 'test.event.created');

    const publisher = new OutboxPublisher(admin.db, bus, { batchSize: 10, maxAttempts: 3 });
    const r = await publisher.run();

    expect(r.claimed).toBe(1);
    expect(r.published).toBe(1);
    expect(seen).toEqual([ULID_A]);

    const [row] = await admin.sql<{ status: string; published_at: Date | null }[]>`
      SELECT status, published_at FROM core.outbox_events WHERE id = ${ULID_A}
    `;
    expect(row?.status).toBe('published');
    expect(row?.published_at).not.toBeNull();
  });

  it('re-queues on handler failure, marks failed after maxAttempts', async () => {
    const bus = new EventBus();
    bus.subscribe('test', '**', async () => {
      throw new Error('handler boom');
    });
    await insertOutbox(admin, ULID_B, companyId, 'test.event.fails');

    const publisher = new OutboxPublisher(admin.db, bus, { batchSize: 10, maxAttempts: 2 });

    const first = await publisher.run();
    expect(first.requeued).toBe(1);

    let row = (
      await admin.sql<{ status: string; attempts: number; last_error: string }[]>`
        SELECT status, attempts, last_error FROM core.outbox_events WHERE id = ${ULID_B}
      `
    )[0]!;
    expect(row.status).toBe('pending');
    expect(row.attempts).toBe(1);
    expect(row.last_error).toMatch(/handler boom/);

    const second = await publisher.run();
    expect(second.failedTerminally).toBe(1);

    row = (
      await admin.sql<{ status: string; attempts: number }[]>`
        SELECT status, attempts FROM core.outbox_events WHERE id = ${ULID_B}
      `
    )[0]!;
    expect(row.status).toBe('failed');
    expect(row.attempts).toBe(2);
  });

  it('does not re-claim rows once they are published', async () => {
    const bus = new EventBus();
    bus.subscribe('test', '**', async () => undefined);
    await insertOutbox(admin, ULID_A, companyId, 'test.event.created');

    const publisher = new OutboxPublisher(admin.db, bus, { batchSize: 10, maxAttempts: 3 });
    await publisher.run();
    const second = await publisher.run();
    expect(second.claimed).toBe(0);

    // Re-claim count via raw DB to be sure.
    const [count] = await admin.sql<{ n: string }[]>`
      SELECT count(*)::text AS n FROM core.outbox_events
      WHERE company_id = ${companyId} AND status = 'pending'
    `;
    expect(count?.n).toBe('0');
  });

  // Suppress unused-import warning for `sql` if vitest tree-shakes.
  void sql;
});
