import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgEnum, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { coreSchema } from './schemas.js';
import { companies } from './companies.js';

/**
 * Outbox processing status. Linear progression:
 *   pending → processing → published   (happy path)
 *   pending → processing → failed      (publisher gave up)
 *
 * `published` and `failed` are terminal in v1. A retry policy beyond
 * publisher-internal backoff is a future module concern.
 */
export const outboxStatus = pgEnum('outbox_status', [
  'pending',
  'processing',
  'published',
  'failed'
]);

/**
 * core.outbox_events — durable event outbox.
 *
 * The persisted form of @sfos/contracts `EventEnvelope`. Produced inside the
 * same transaction as the business write (transactional outbox pattern) so a
 * crash between the two cannot lose events. A separate publisher process
 * (not in this package — comes with the bus) drains rows in
 * `created_at` order, advances status, and ships the envelope to whatever
 * runtime bus the deployment chose.
 *
 * Tenant scope:
 *   - `company_id` non-null for tenant events. RLS scopes reads to it.
 *   - `company_id` NULL for platform-system events.
 *
 * The full envelope is stored verbatim in `envelope` — schema drift in
 * subscribers does not require re-hydrating from joins.
 */
export const outboxEvents = coreSchema.table(
  'outbox_events',
  {
    /** ULID — matches `envelope.id`. Stored as text(26) to round-trip exactly. */
    id: text('id').primaryKey(),

    /** Tenant scope. NULL only for platform-system events. */
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'restrict' }),

    /** Denormalized for indexing — full event also lives in `envelope`. */
    type: text('type').notNull(),
    version: text('version').notNull(),
    sourceModule: text('source_module').notNull(),
    correlationId: text('correlation_id').notNull(),
    causationId: text('causation_id'),

    /** Verbatim @sfos/contracts EventEnvelope. */
    envelope: jsonb('envelope').notNull(),

    status: outboxStatus('status').notNull().default('pending'),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),

    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    publishedAt: timestamp('published_at', { withTimezone: true })
  },
  (t) => ({
    /** Publisher's hot path: claim the next `pending` row. */
    byStatusRecorded: index('outbox_status_recorded_idx').on(t.status, t.recordedAt),
    byCompany: index('outbox_company_idx').on(t.companyId),
    byCorrelation: index('outbox_correlation_idx').on(t.correlationId)
  })
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
