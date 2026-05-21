/**
 * @sfos/events — public API.
 *
 * Builders and validators for the event envelope defined in @sfos/contracts.
 * Module code uses this package to construct events; the event bus uses it
 * for ownership enforcement.
 */

export { newULID, newULIDAt } from './ids.js';
export {
  isValidEventType,
  isValidEventVersion,
  parseEventType,
  assertOwnership
} from './naming.js';
export { buildEnvelope, buildChildEnvelope, type BuildEnvelopeInput } from './builder.js';

// Re-export envelope types for convenience (consumers can avoid two imports).
export type {
  EventEnvelope,
  EventActor,
  EventActorKind,
  EventType,
  EventVersion,
  EventVisibility
} from '@sfos/contracts/envelope';
