/**
 * @sfos/contracts — public API.
 *
 * This package is the platform's frozen contract surface. Everything here
 * is treated as a stable interface: changes require an ADR + a Changeset.
 *
 * Subpaths are exposed via the package's `exports` field so consumers can
 * import only what they need:
 *
 *   import type { EventEnvelope } from '@sfos/contracts/envelope';
 *   import { CORE_PERMISSIONS } from '@sfos/contracts/permissions';
 *
 * The barrel below is the convenience surface; sub-path imports are
 * preferred for tree-shakability.
 */

export * from './brands.js';
export * from './result.js';
export * from './envelope.js';
export * from './manifest.js';
export * from './permissions.js';
export * from './capabilities.js';
