import type { Manifest, CapabilityKey } from '@sfos/contracts/manifest';
import type { CompanyId } from '@sfos/contracts/brands';
import type { ModuleLifecycle } from './lifecycle.js';

/**
 * A registered module — the manifest plus the runtime lifecycle implementation.
 *
 * The platform's module registry stores these and exposes lookups by id and
 * by capability.
 */
export interface RegisteredModule {
  readonly manifest: Manifest;
  readonly lifecycle: ModuleLifecycle;
}

/**
 * Public registry interface — consumed by other modules, the BFF, and tests.
 *
 * The platform's concrete registry implementation lives in @sfos/core. This
 * interface is the contract; consumers depend on the type, not the impl.
 */
export interface ModuleRegistry {
  /** All registered modules, in topological order. */
  list(): readonly RegisteredModule[];

  /** Lookup a module by its manifest identity id. */
  find(moduleId: string): RegisteredModule | undefined;

  /** Modules providing a given capability key (across versions). */
  findByCapability(capability: CapabilityKey): readonly RegisteredModule[];

  /** Whether a tenant has activated a given module. */
  isActive(moduleId: string, companyId: CompanyId): Promise<boolean>;

  /** Resolve all active capabilities for a tenant. */
  activeCapabilities(companyId: CompanyId): Promise<readonly CapabilityKey[]>;
}

/**
 * Capability requirement check result.
 *
 * Returned by `checkRequirements` (a registry helper) when a consumer needs
 * to confirm a capability is available before invoking a feature that depends
 * on it.
 */
export interface CapabilityCheckResult {
  readonly satisfied: boolean;
  readonly missing: readonly string[];
  readonly availableVersions: ReadonlyMap<string, string>;
}
