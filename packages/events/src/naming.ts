import { EVENT_TYPE_PATTERN, EVENT_VERSION_PATTERN } from '@sfos/contracts/envelope';

/**
 * Naming validators — runtime checks for event types and versions.
 *
 * The producing module is the only legitimate emitter of an event whose type
 * begins with that module's id. The bus enforces this at publish time using
 * `assertOwnership`.
 */

/** Returns true if `type` matches the canonical `<module>.<entity>.<action>` shape. */
export const isValidEventType = (type: string): boolean => EVENT_TYPE_PATTERN.test(type);

/** Returns true if `version` matches `<major>.<minor>`. */
export const isValidEventVersion = (version: string): boolean =>
  EVENT_VERSION_PATTERN.test(version);

/**
 * Parse an event type into its three components.
 * Returns null if the type is malformed.
 */
export const parseEventType = (
  type: string
): { module: string; entity: string; action: string } | null => {
  if (!isValidEventType(type)) return null;
  const parts = type.split('.');
  // EVENT_TYPE_PATTERN guarantees exactly three components.
  const [moduleName, entity, action] = parts as [string, string, string];
  return { module: moduleName, entity, action };
};

/**
 * Throw if `type` is not owned by `sourceModule`.
 * Used by the event bus on publish: a module cannot emit events on another
 * module's behalf.
 */
export const assertOwnership = (type: string, sourceModule: string): void => {
  const parsed = parseEventType(type);
  if (!parsed) {
    throw new Error(`Invalid event type: "${type}"`);
  }
  if (parsed.module !== sourceModule) {
    throw new Error(
      `Module "${sourceModule}" cannot emit events with type "${type}" ` +
        `(owned by module "${parsed.module}")`
    );
  }
};
