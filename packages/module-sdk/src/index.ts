/**
 * @sfos/module-sdk — public API.
 *
 * Everything a module author needs to plug into the platform:
 *   - The lifecycle interface to implement.
 *   - The `defineManifest` helper for type-checked manifests.
 *   - Registry types for cross-module reference (typed, indirected at runtime).
 *
 * This package is licensed MIT (vs the platform's AGPL) so third-party modules
 * can be authored without copyleft propagation.
 */

export {
  type ModuleLifecycle,
  type PlatformContext,
  type TenantContext,
  type ModuleLogger,
  type PlatformSettings,
  type EventSubscriptionApi,
  type EventEmissionApi
} from './lifecycle.js';

export { defineManifest } from './manifest-helpers.js';

export {
  type RegisteredModule,
  type ModuleRegistry,
  type CapabilityCheckResult
} from './registry-types.js';

// Re-export the manifest type so module authors only need one import.
export type { Manifest, PermissionKey, CapabilityKey } from '@sfos/contracts/manifest';
