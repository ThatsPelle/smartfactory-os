import type { SfosDb } from '@sfos/db';
import { schema } from '@sfos/db';
import type { EventEnvelope } from '@sfos/contracts/envelope';

/**
 * Audit sink — the only legal way for the runtime to write to
 * `core.audit_logs`.
 *
 * Why a sink rather than letting modules INSERT directly?
 *   - One place to enforce attribution shape (actor + module + entity).
 *   - One place to link audit rows to event envelopes via correlation /
 *     causation ids.
 *   - One place to add fields later (request id, ip, ...) without each
 *     module having to migrate.
 *
 * The sink is INTENTIONALLY thin — no buffering, no async batching, no
 * dual-writes to a separate store. It is one INSERT per call. Modules
 * that want to write 1000 entries in a loop wrap their loop in a tx.
 *
 * Tenant scope: the caller is responsible for issuing the write inside a
 * `withTenantContext` transaction. The sink does NOT open its own
 * transaction or change the tenant binding — that would silently undo
 * RLS scoping. Platform-system writes (no tenant) use the admin DB
 * client and pass `companyId: null`.
 */

export interface AuditWrite {
  /** Null for platform-system events. */
  readonly companyId: string | null;
  /** Matches @sfos/contracts EventActorKind. */
  readonly actorKind: string;
  readonly actorId: string;
  /** The module that initiated the audited operation. */
  readonly moduleId: string;
  /** Free-form domain verb. */
  readonly action: string;
  readonly entityKind: string;
  readonly entityId: string;
  readonly changes?: unknown;
  /** Anything extra. Merged with module attribution. */
  readonly metadata?: Record<string, unknown>;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly occurredAt?: Date;
}

export class AuditSink {
  readonly #db: SfosDb;

  constructor(db: SfosDb) {
    this.#db = db;
  }

  async write(input: AuditWrite): Promise<void> {
    const metadata = { ...(input.metadata ?? {}), module: input.moduleId };
    await this.#db.insert(schema.auditLogs).values({
      companyId: input.companyId,
      actorKind: input.actorKind,
      actorId: input.actorId,
      action: input.action,
      entityKind: input.entityKind,
      entityId: input.entityId,
      changes: input.changes ?? null,
      metadata,
      correlationId: input.correlationId ?? null,
      causationId: input.causationId ?? null,
      occurredAt: input.occurredAt ?? new Date()
    });
  }

  /**
   * Convenience: write an audit row derived from an outbox envelope.
   * Used by future event handlers that want a one-line "and audit it"
   * after handling a domain event.
   */
  async writeFromEnvelope(
    envelope: EventEnvelope,
    overrides: Partial<AuditWrite> & Pick<AuditWrite, 'moduleId' | 'entityKind' | 'entityId'>
  ): Promise<void> {
    // With exactOptionalPropertyTypes the AuditWrite optionals do not accept
    // `undefined` — they must be omitted entirely. Build the object
    // conditionally so the shape matches.
    const write: AuditWrite = {
      companyId: envelope.company_id,
      actorKind: envelope.emitted_by.kind,
      actorId: envelope.emitted_by.id,
      moduleId: overrides.moduleId,
      action: envelope.type,
      entityKind: overrides.entityKind,
      entityId: overrides.entityId,
      changes: overrides.changes ?? null,
      metadata: { ...(overrides.metadata ?? {}), envelope_id: envelope.id },
      correlationId: envelope.correlation_id,
      occurredAt: new Date(envelope.occurred_at)
    };
    if (envelope.causation_id !== null) {
      (write as { causationId: string }).causationId = envelope.causation_id;
    }
    await this.write(write);
  }
}
