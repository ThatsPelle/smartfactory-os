import type { CapabilityKey } from '@sfos/contracts/manifest';
import type {
  CapabilityCheckResult,
  ModuleRegistry,
  RegisteredModule
} from '@sfos/module-sdk';
import type { CompanyId } from '@sfos/contracts/brands';

import { ModuleAlreadyRegisteredError } from '../lifecycle/errors.js';

/**
 * In-memory module registry.
 *
 * Built once at startup by the bootstrap flow. After that, mutation is
 * limited to lifecycle state changes (handled by `LifecycleEngine`) and to
 * `markActive`/`markInactive` calls that mirror the DB state of
 * `core.company_modules` for fast lookups.
 *
 * Lookups are O(1) on `id`, O(1) on capability key. The `order` array
 * holds the topological init order produced by capability resolution.
 *
 * This implementation deliberately does not consult the DB on every call —
 * `isActive` and `activeCapabilities` use an in-memory mirror that the
 * registry maintains, and the platform refreshes that mirror on tenant
 * module activate/deactivate events. (Refresh wiring lands when the
 * tenant activation flow ships; the mirror is empty until then.)
 */
export class InMemoryModuleRegistry implements ModuleRegistry {
  readonly #byId = new Map<string, RegisteredModule>();
  readonly #byCapability = new Map<string, RegisteredModule[]>();
  readonly #order: string[] = [];

  /** company_id → set of activated module_ids. Mirrors core.company_modules. */
  readonly #activeByCompany = new Map<CompanyId, Set<string>>();

  /**
   * Add a module to the registry. Raises if the id is already registered.
   * Order is reset whenever a new module joins — bootstrap re-orders the
   * whole set after every addition is complete.
   */
  register(mod: RegisteredModule): void {
    const id = mod.manifest.identity.id;
    if (this.#byId.has(id)) {
      throw new ModuleAlreadyRegisteredError(id);
    }
    this.#byId.set(id, mod);
    for (const cap of mod.manifest.capabilities.provides) {
      const arr = this.#byCapability.get(cap.key) ?? [];
      arr.push(mod);
      this.#byCapability.set(cap.key, arr);
    }
    for (const cap of mod.manifest.capabilities.provides_optional) {
      const arr = this.#byCapability.get(cap.key) ?? [];
      arr.push(mod);
      this.#byCapability.set(cap.key, arr);
    }
  }

  /** Re-order the registry's `list()` output to match the capability graph. */
  setOrder(order: readonly string[]): void {
    // Filter to ids actually registered — bootstrap may pass extra ids
    // from a manifest set that didn't all register.
    this.#order.splice(
      0,
      this.#order.length,
      ...order.filter((id) => this.#byId.has(id))
    );
  }

  list(): readonly RegisteredModule[] {
    const out: RegisteredModule[] = [];
    for (const id of this.#order) {
      const mod = this.#byId.get(id);
      if (mod !== undefined) out.push(mod);
    }
    return out;
  }

  find(moduleId: string): RegisteredModule | undefined {
    return this.#byId.get(moduleId);
  }

  findByCapability(capability: CapabilityKey): readonly RegisteredModule[] {
    return this.#byCapability.get(capability) ?? [];
  }

  async isActive(moduleId: string, companyId: CompanyId): Promise<boolean> {
    return this.#activeByCompany.get(companyId)?.has(moduleId) ?? false;
  }

  async activeCapabilities(companyId: CompanyId): Promise<readonly CapabilityKey[]> {
    const active = this.#activeByCompany.get(companyId) ?? new Set<string>();
    const caps: CapabilityKey[] = [];
    for (const id of active) {
      const mod = this.#byId.get(id);
      if (!mod) continue;
      for (const c of mod.manifest.capabilities.provides) {
        caps.push(c.key);
      }
    }
    return caps;
  }

  /** Mirror state from core.company_modules: mark a module active for a tenant. */
  markActive(moduleId: string, companyId: CompanyId): void {
    let set = this.#activeByCompany.get(companyId);
    if (!set) {
      set = new Set<string>();
      this.#activeByCompany.set(companyId, set);
    }
    set.add(moduleId);
  }

  /** Mirror state from core.company_modules: mark a module inactive for a tenant. */
  markInactive(moduleId: string, companyId: CompanyId): void {
    this.#activeByCompany.get(companyId)?.delete(moduleId);
  }

  /** v1 capability-check helper: does some registered module provide every required cap? */
  checkRequirements(requirements: readonly string[]): CapabilityCheckResult {
    const missing: string[] = [];
    const availableVersions = new Map<string, string>();
    for (const req of requirements) {
      const providers = this.#byCapability.get(req) ?? [];
      const first = providers[0];
      if (first === undefined) {
        missing.push(req);
      } else {
        availableVersions.set(req, first.manifest.identity.version);
      }
    }
    return { satisfied: missing.length === 0, missing, availableVersions };
  }
}
