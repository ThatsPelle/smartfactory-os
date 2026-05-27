import { sql } from 'drizzle-orm';
import type { SfosDb } from '@sfos/db';
import { EventEnvelopeSchema, type EventEnvelope } from '@sfos/contracts/envelope';

import type { EventBus } from '../events/bus.js';

/**
 * Outbox publisher — foundation only.
 *
 * Responsibilities:
 *   1. Claim a batch of `pending` rows by flipping them to `processing`
 *      in a single statement (`UPDATE ... RETURNING`). The atomicity of
 *      that statement is the only locking the publisher needs.
 *   2. Decode each row's envelope, dispatch to the in-process bus.
 *   3. On success, mark `published` with `published_at = now()`.
 *   4. On failure, increment `attempts`, store the last error, and either:
 *        - return to `pending` for retry (when attempts < maxAttempts), or
 *        - mark `failed` and stop.
 *
 * The publisher does NOT decide its own schedule. The runtime calls `run()`
 * either in a loop or via an external scheduler. Trying to be cleverer
 * than that creates timing-dependent bugs in tests for no real benefit at
 * this foundation stage.
 *
 * Out of scope (explicitly):
 *   - dead-letter queues
 *   - partitioning by company / type
 *   - exponential backoff (current retry is simple: re-queue and try again)
 *   - distributed multi-publisher coordination
 *
 * The admin DB role drives this — RLS would otherwise hide outbox rows
 * across tenants.
 */

export interface PublisherConfig {
  /** Rows to claim per `run()`. */
  readonly batchSize: number;
  /** Max attempts before marking `failed`. */
  readonly maxAttempts: number;
}

export const DEFAULT_PUBLISHER_CONFIG: PublisherConfig = {
  batchSize: 32,
  maxAttempts: 5
};

export interface RunResult {
  readonly claimed: number;
  readonly published: number;
  readonly requeued: number;
  readonly failedTerminally: number;
}

interface ClaimedRow {
  id: string;
  envelope: unknown;
  attempts: number;
}

export class OutboxPublisher {
  readonly #db: SfosDb;
  readonly #bus: EventBus;
  readonly #config: PublisherConfig;

  constructor(db: SfosDb, bus: EventBus, config: PublisherConfig = DEFAULT_PUBLISHER_CONFIG) {
    this.#db = db;
    this.#bus = bus;
    this.#config = config;
  }

  async run(): Promise<RunResult> {
    const rows = await this.#claim();
    let published = 0;
    let requeued = 0;
    let failedTerminally = 0;

    for (const row of rows) {
      const parsed = EventEnvelopeSchema.safeParse(row.envelope);
      if (!parsed.success) {
        // A malformed envelope was persisted — programmer error elsewhere.
        // Mark failed terminally: retrying won't fix the bytes.
        await this.#markFailed(
          row.id,
          row.attempts + 1,
          `envelope did not validate: ${parsed.error.message}`,
          true
        );
        failedTerminally += 1;
        continue;
      }
      const envelope: EventEnvelope = parsed.data;
      const result = await this.#bus.dispatch(envelope);
      if (result.failures.length === 0) {
        await this.#markPublished(row.id);
        published += 1;
        continue;
      }
      const detail = result.failures
        .map((f) => `${f.subscription.moduleId}/${f.subscription.pattern}: ${f.error.message}`)
        .join(' | ');
      const nextAttempts = row.attempts + 1;
      if (nextAttempts >= this.#config.maxAttempts) {
        await this.#markFailed(row.id, nextAttempts, detail, true);
        failedTerminally += 1;
      } else {
        await this.#requeue(row.id, nextAttempts, detail);
        requeued += 1;
      }
    }

    return { claimed: rows.length, published, requeued, failedTerminally };
  }

  async #claim(): Promise<ClaimedRow[]> {
    // `FOR UPDATE SKIP LOCKED` lets multiple publisher processes share the
    // outbox without stepping on each other. With one publisher the SKIP
    // LOCKED is a no-op; with more it stays correct.
    const result = await this.#db.execute(sql`
      WITH claimed AS (
        SELECT id
        FROM core.outbox_events
        WHERE status = 'pending'
        ORDER BY recorded_at
        LIMIT ${this.#config.batchSize}
        FOR UPDATE SKIP LOCKED
      )
      UPDATE core.outbox_events o
      SET status = 'processing'
      FROM claimed c
      WHERE o.id = c.id
      RETURNING o.id, o.envelope, o.attempts
    `);
    return (result as unknown as ClaimedRow[]).map((r) => ({
      id: r.id,
      envelope: r.envelope,
      attempts: Number(r.attempts)
    }));
  }

  async #markPublished(id: string): Promise<void> {
    await this.#db.execute(sql`
      UPDATE core.outbox_events
      SET status = 'published', published_at = now(), last_error = NULL
      WHERE id = ${id}
    `);
  }

  async #requeue(id: string, attempts: number, lastError: string): Promise<void> {
    await this.#db.execute(sql`
      UPDATE core.outbox_events
      SET status = 'pending', attempts = ${attempts}, last_error = ${lastError}
      WHERE id = ${id}
    `);
  }

  async #markFailed(
    id: string,
    attempts: number,
    lastError: string,
    terminal: boolean
  ): Promise<void> {
    await this.#db.execute(sql`
      UPDATE core.outbox_events
      SET status = ${terminal ? 'failed' : 'pending'},
          attempts = ${attempts},
          last_error = ${lastError}
      WHERE id = ${id}
    `);
  }
}
