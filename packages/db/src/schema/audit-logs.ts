import { sql } from 'drizzle-orm';
import { index, jsonb, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { coreSchema } from './schemas.js';
import { companies } from './companies.js';

/**
 * core.audit_logs — append-only audit trail.
 *
 * Every meaningful change (entity created/updated/deleted, permission
 * granted, module installed, etc.) lands here. Immutability is enforced by
 * a trigger in drizzle/0003_rls_policies.sql — UPDATE and DELETE on this
 * table raise a Postgres exception, full stop.
 *
 * Tenant scope:
 *   - `company_id` non-null for tenant operations. RLS scopes reads to it.
 *   - `company_id` NULL for platform-system events (cross-tenant operations,
 *     platform maintenance). Those rows are visible only to the admin role.
 *
 * Fields are chosen to make a row independently reconstructable without
 * joining anything else — auditors want grep-friendly records.
 */
export const auditLogs = coreSchema.table(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Tenant scope. NULL only for platform-system events. */
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'restrict' }),

    /** Who acted. Matches @sfos/contracts EventActor. */
    actorKind: text('actor_kind').notNull(),
    actorId: text('actor_id').notNull(),

    /** What happened. Free-form domain verb (e.g. `'company.module.installed'`). */
    action: text('action').notNull(),

    /** Subject. `entity_kind` is e.g. `'company_module'`, `entity_id` is its PK. */
    entityKind: text('entity_kind').notNull(),
    entityId: text('entity_id').notNull(),

    /** Before / after diff. `null` allowed for actions that have no diff. */
    changes: jsonb('changes'),

    /** Free-form context the actor wants preserved (request id, IP, etc.). */
    metadata: jsonb('metadata')
      .notNull()
      .default(sql`'{}'::jsonb`),

    /** Linkage to the originating envelope. ULID per @sfos/contracts. */
    correlationId: text('correlation_id'),
    causationId: text('causation_id'),

    /** When the business event occurred (caller-supplied). */
    occurredAt: timestamp('occurred_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    /** When the DB recorded the row. Server clock. Never trust occurredAt for ordering. */
    recordedAt: timestamp('recorded_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
  },
  (t) => ({
    byCompanyTime: index('audit_logs_company_recorded_idx').on(t.companyId, t.recordedAt),
    byEntity: index('audit_logs_entity_idx').on(t.entityKind, t.entityId),
    byCorrelation: index('audit_logs_correlation_idx').on(t.correlationId)
  })
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type NewAuditLog = typeof auditLogs.$inferInsert;
