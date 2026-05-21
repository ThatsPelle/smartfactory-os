import { z } from 'zod';

/**
 * Event envelope — FROZEN AT v1.
 *
 * Every event published on the platform's bus carries this envelope.
 * Any change to envelope structure is a platform major version + ADR + migration plan.
 *
 * The envelope's *payload* is per-event and versioned independently
 * (see `version` field). The envelope itself does not change casually.
 *
 * See docs/architecture/04-manifest-and-events.md §7 for the rationale of each field.
 */

// ---------- Actor ----------

export const EventActorKindSchema = z.enum(['user', 'automation', 'ai', 'system', 'webhook']);
export type EventActorKind = z.infer<typeof EventActorKindSchema>;

export const EventActorSchema = z.object({
  kind: EventActorKindSchema,
  id: z.string().min(1),
  /** If kind ≠ 'user' but the chain originated from a user, the originating user id. */
  on_behalf_of: z.string().optional()
});
export type EventActor = z.infer<typeof EventActorSchema>;

// ---------- Naming conventions ----------

/**
 * Event types are dotted: `<module>.<entity>.<action>`.
 * - module: lowercase, snake-case-friendly identifier (no dots).
 * - entity: lowercase singular noun.
 * - action: past-tense verb describing what happened.
 */
export const EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
export const EventTypeSchema = z
  .string()
  .regex(EVENT_TYPE_PATTERN, 'event type must match <module>.<entity>.<action>');
export type EventType = z.infer<typeof EventTypeSchema>;

/** Payload schema versions are `<major>.<minor>`. */
export const EVENT_VERSION_PATTERN = /^\d+\.\d+$/;
export const EventVersionSchema = z
  .string()
  .regex(EVENT_VERSION_PATTERN, 'event version must be <major>.<minor>');
export type EventVersion = z.infer<typeof EventVersionSchema>;

// ---------- Visibility ----------

export const EventVisibilitySchema = z.enum(['public', 'internal', 'system']);
export type EventVisibility = z.infer<typeof EventVisibilitySchema>;

// ---------- Envelope ----------

export const EventEnvelopeSchema = z.object({
  /** ULID — sortable, globally unique. */
  id: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'must be a ULID'),

  /** Dotted event type. */
  type: EventTypeSchema,

  /** Payload schema version. */
  version: EventVersionSchema,

  /** When the business event happened (may be earlier than recorded_at). ISO 8601 UTC. */
  occurred_at: z.string().datetime(),

  /** When the platform persisted the event to the outbox. ISO 8601 UTC. */
  recorded_at: z.string().datetime(),

  /**
   * Tenant scope. NULL only for platform-system events (cross-tenant ops,
   * platform metrics). Tenant-scoped events MUST set this.
   */
  company_id: z.string().nullable(),

  /** The producing module's id. Must match the emitter's authenticated identity. */
  source_module: z.string().min(1),

  /** The entity the event is about (FK target). Generic pointer; concrete FK lives in payload. */
  source_entity_id: z.string().nullable(),

  /** Who emitted the event. */
  emitted_by: EventActorSchema,

  /** Logical operation id; shared across events in one user-initiated transaction. */
  correlation_id: z.string().min(1),

  /** The event that directly caused this one. Null when the event has a non-event origin. */
  causation_id: z.string().nullable(),

  /** OpenTelemetry trace id (if propagated). */
  trace_id: z.string().nullable(),

  /** Depth from the original user action. 0 for user-initiated. Increments per handler. */
  depth: z.number().int().nonnegative(),

  /** Domain-specific payload. Conforms to the event's declared payload_schema for `version`. */
  payload: z.unknown(),

  /** Producer-specific non-contractual extras. Consumers must NOT depend on these. */
  metadata: z.record(z.string(), z.unknown()).default({}),

  /** Who may receive this event. */
  visibility: EventVisibilitySchema,

  /** Whether the audit sink must persist this event. */
  audit_required: z.boolean()
});

export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

/** Maximum cascade depth before the bus halts further propagation. */
export const DEFAULT_MAX_CASCADE_DEPTH = 10;
