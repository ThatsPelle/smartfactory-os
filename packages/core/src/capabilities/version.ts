import semverSatisfies from 'semver/functions/satisfies.js';

/**
 * Capability key parsing.
 *
 * Capability keys are `<name>@<major>` (e.g. `core.event_bus@1`). The major
 * is the contract version — within a major, the contract evolves additively.
 *
 * `requires` entries express a semver RANGE against the providing module's
 * package version (`identity.version`), NOT against the capability major
 * (the major must match exactly).
 */

const CAPABILITY_KEY_PATTERN = /^(?<name>[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*)@(?<major>\d+)$/;

export interface ParsedCapabilityKey {
  readonly name: string;
  readonly major: number;
  readonly full: string;
}

export const parseCapabilityKey = (key: string): ParsedCapabilityKey => {
  const m = CAPABILITY_KEY_PATTERN.exec(key);
  const name = m?.groups?.['name'];
  const major = m?.groups?.['major'];
  if (name === undefined || major === undefined) {
    throw new Error(
      `Invalid capability key "${key}". Expected "<name>@<major>", e.g. "core.event_bus@1".`
    );
  }
  return { name, major: Number(major), full: key };
};

/** A capability requirement: capability name+major plus a semver range on the provider's package version. */
export interface CapabilityRequirement {
  readonly capability: string;
  readonly versionRange: string;
}

/**
 * Does a provider whose manifest declares `provided` (key string) and whose
 * package version is `providerVersion` satisfy the requirement?
 */
export const satisfies = (
  requirement: CapabilityRequirement,
  provided: string,
  providerVersion: string
): boolean => {
  const reqParsed = parseCapabilityKey(requirement.capability);
  const provParsed = parseCapabilityKey(provided);
  if (reqParsed.name !== provParsed.name) return false;
  if (reqParsed.major !== provParsed.major) return false;
  return semverSatisfies(providerVersion, requirement.versionRange);
};
