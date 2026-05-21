import { z } from 'zod';

/**
 * Event types + payload schemas for the __DISPLAY_NAME__ module.
 *
 * Each event type is a constant referenced from the manifest's `events_produced`
 * block and from server code that emits the event. String literals at call
 * sites are forbidden (planned ESLint rule `no-event-type-string-literal`).
 *
 * Payload schemas are declared with Zod here and validated by the event bus
 * before publish.
 */

export const __MODULE_NAME___EVENTS = {
  // Example shape — replace with real entries:
  // ENTITY_CREATED: '__MODULE_NAME__.entity.created',
  // ENTITY_UPDATED: '__MODULE_NAME__.entity.updated',
} as const;

export type __MODULE_NAME___EventType =
  (typeof __MODULE_NAME___EVENTS)[keyof typeof __MODULE_NAME___EVENTS];

// Example payload schemas — keep these adjacent to the event type constants
// so a single file documents the full event contract.
//
// export const EntityCreatedPayloadSchema = z.object({
//   entity_id: z.string(),
//   /* ... */
// });
// export type EntityCreatedPayload = z.infer<typeof EntityCreatedPayloadSchema>;

// Avoid unused-import errors until real payloads are declared.
void z;
