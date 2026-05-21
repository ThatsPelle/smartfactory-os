import {
  EventEnvelopeSchema,
  type EventActor,
  type EventEnvelope,
  type EventType,
  type EventVersion,
  type EventVisibility
} from '@sfos/contracts/envelope';
import { newULID } from './ids.js';
import { assertOwnership } from './naming.js';

/**
 * Input for building an event envelope.
 *
 * Fields with sensible defaults (id, recorded_at, depth, visibility, metadata)
 * are optional; the rest are required to make the envelope's invariants
 * explicit at the call site.
 */
export interface BuildEnvelopeInput {
  /** Dotted event type. Must match producer's module. */
  type: EventType;
  /** Payload schema version (`<major>.<minor>`). */
  version: EventVersion;
  /** The producing module's id (used to enforce ownership). */
  source_module: string;
  /** Tenant scope. Pass `null` only for platform-system events. */
  company_id: string | null;
  /** Who emitted the event. */
  emitted_by: EventActor;
  /** Logical operation id. Re-use the existing one for events in a chain. */
  correlation_id: string;
  /** Domain-specific payload. Conforms to the event's payload schema. */
  payload: unknown;
  /** Whether the audit sink must persist this event. */
  audit_required: boolean;

  // ---------- Optional with defaults ----------
  /** When the business event happened. Defaults to `now()`. ISO 8601 UTC. */
  occurred_at?: string;
  /** The entity the event is about (FK pointer). */
  source_entity_id?: string | null;
  /** The directly-causing event id, if any. */
  causation_id?: string | null;
  /** OpenTelemetry trace id, if propagated. */
  trace_id?: string | null;
  /** Cascade depth from the original user action. Default 0. */
  depth?: number;
  /** Non-contractual extras. */
  metadata?: Record<string, unknown>;
  /** Visibility. Default `public`. */
  visibility?: EventVisibility;
}

/**
 * Build a validated event envelope.
 *
 * Throws if:
 *   - The type does not belong to `source_module`.
 *   - The Zod schema rejects the result (defense in depth).
 *
 * Callers (typically modules' event helpers) should use this rather than
 * constructing envelopes by hand. Direct construction is forbidden in module
 * code (planned ESLint rule).
 */
export const buildEnvelope = (input: BuildEnvelopeInput): EventEnvelope => {
  assertOwnership(input.type, input.source_module);

  const now = new Date().toISOString();
  const envelope: EventEnvelope = {
    id: newULID(),
    type: input.type,
    version: input.version,
    occurred_at: input.occurred_at ?? now,
    recorded_at: now,
    company_id: input.company_id,
    source_module: input.source_module,
    source_entity_id: input.source_entity_id ?? null,
    emitted_by: input.emitted_by,
    correlation_id: input.correlation_id,
    causation_id: input.causation_id ?? null,
    trace_id: input.trace_id ?? null,
    depth: input.depth ?? 0,
    payload: input.payload,
    metadata: input.metadata ?? {},
    visibility: input.visibility ?? 'public',
    audit_required: input.audit_required
  };

  // Defense in depth — never publish a malformed envelope, even if the type
  // checker missed something at the call site.
  return EventEnvelopeSchema.parse(envelope);
};

/**
 * Continue a causation chain — given a parent envelope, build a child that
 * shares `correlation_id` and bumps `depth`.
 */
export const buildChildEnvelope = (
  parent: EventEnvelope,
  input: Omit<BuildEnvelopeInput, 'correlation_id' | 'causation_id' | 'depth'>
): EventEnvelope =>
  buildEnvelope({
    ...input,
    correlation_id: parent.correlation_id,
    causation_id: parent.id,
    depth: parent.depth + 1
  });
