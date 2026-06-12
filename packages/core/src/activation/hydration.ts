import type { CapabilityKey, CompanyId, UserId } from '@sfos/contracts';
import { schema, withTenantContext, type SfosDb } from '@sfos/db';
import type { ModuleRegistry, RegisteredModule } from '@sfos/module-sdk';
import { eq } from 'drizzle-orm';

import { satisfies } from '../capabilities/version.js';

type ActivationStatus = 'pending' | 'active' | 'disabled' | 'failed';

export interface PersistedActivationStateRow {
  readonly moduleId: string;
  readonly status: ActivationStatus;
  readonly enabled: boolean;
}

export type ActivationHydrationDiagnostic =
  | {
      readonly code: 'activation_state_inconsistent';
      readonly moduleId: string;
      readonly status: ActivationStatus;
      readonly enabled: boolean;
    }
  | { readonly code: 'module_not_registered'; readonly moduleId: string }
  | {
      readonly code: 'required_capability_unavailable';
      readonly moduleId: string;
      readonly capability: string;
    }
  | {
      readonly code: 'required_capability_inactive';
      readonly moduleId: string;
      readonly capability: string;
    }
  | {
      readonly code: 'platform_capability_unavailable';
      readonly moduleId: string;
      readonly capability: string;
    };

export interface HydrateCompanyActivationsInput {
  readonly companyId: CompanyId;
  readonly actorUserId: UserId;
}

export interface ActivationHydrationResult {
  readonly companyId: CompanyId;
  readonly ready: boolean;
  readonly activeModuleIds: readonly string[];
  readonly diagnostics: readonly ActivationHydrationDiagnostic[];
}

interface HydrationRegistry extends ModuleRegistry {
  replaceActiveModules(companyId: CompanyId, moduleIds: readonly string[]): void;
}

interface ActivationRegistryHydratorOptions {
  readonly db?: SfosDb;
  readonly registry: HydrationRegistry;
  readonly platformCapabilities?: readonly CapabilityKey[];
}

export class ActivationRegistryHydrator {
  readonly #db: SfosDb | undefined;
  readonly #registry: HydrationRegistry;
  readonly #platformCapabilities: ReadonlySet<string>;

  constructor(options: ActivationRegistryHydratorOptions) {
    this.#db = options.db;
    this.#registry = options.registry;
    this.#platformCapabilities = new Set(options.platformCapabilities ?? []);
  }

  async hydrateCompany(input: HydrateCompanyActivationsInput): Promise<ActivationHydrationResult> {
    if (!this.#db) {
      throw new Error('ActivationRegistryHydrator requires db for hydrateCompany()');
    }
    const rows = await withTenantContext(
      this.#db,
      { companyId: input.companyId, userId: input.actorUserId },
      (tx) =>
        tx
          .select({
            moduleId: schema.companyModules.moduleId,
            status: schema.companyModules.status,
            enabled: schema.companyModules.enabled
          })
          .from(schema.companyModules)
          .where(eq(schema.companyModules.companyId, input.companyId))
          .orderBy(schema.companyModules.moduleId)
    );

    return this.hydrateCompanyRows({ companyId: input.companyId, rows });
  }

  hydrateCompanyRows(input: {
    readonly companyId: CompanyId;
    readonly rows: readonly PersistedActivationStateRow[];
  }): ActivationHydrationResult {
    const diagnostics: ActivationHydrationDiagnostic[] = [];
    const activeIds = new Set<string>();

    for (const row of input.rows) {
      if (row.enabled !== (row.status === 'active')) {
        diagnostics.push({
          code: 'activation_state_inconsistent',
          moduleId: row.moduleId,
          status: row.status,
          enabled: row.enabled
        });
        continue;
      }
      if (row.status === 'active') activeIds.add(row.moduleId);
    }

    for (const moduleId of [...activeIds].sort()) {
      if (!this.#registry.find(moduleId)) {
        diagnostics.push({ code: 'module_not_registered', moduleId });
      }
    }

    for (const moduleId of [...activeIds].sort()) {
      const module = this.#registry.find(moduleId);
      if (!module) continue;
      this.#checkRequirements(module, activeIds, diagnostics);
    }

    diagnostics.sort((left, right) => {
      const moduleOrder = left.moduleId.localeCompare(right.moduleId);
      if (moduleOrder !== 0) return moduleOrder;
      const codeOrder = left.code.localeCompare(right.code);
      if (codeOrder !== 0) return codeOrder;
      const leftCapability = 'capability' in left ? left.capability : '';
      const rightCapability = 'capability' in right ? right.capability : '';
      return leftCapability.localeCompare(rightCapability);
    });

    if (diagnostics.length > 0) {
      this.#registry.replaceActiveModules(input.companyId, []);
      return {
        companyId: input.companyId,
        ready: false,
        activeModuleIds: [],
        diagnostics
      };
    }

    const activeModuleIds = [...activeIds].sort();
    this.#registry.replaceActiveModules(input.companyId, activeModuleIds);
    return {
      companyId: input.companyId,
      ready: true,
      activeModuleIds,
      diagnostics: []
    };
  }

  #checkRequirements(
    module: RegisteredModule,
    activeIds: ReadonlySet<string>,
    diagnostics: ActivationHydrationDiagnostic[]
  ): void {
    for (const capability of module.manifest.dependencies.platform_capabilities_required) {
      if (!this.#platformCapabilities.has(capability)) {
        diagnostics.push({
          code: 'platform_capability_unavailable',
          moduleId: module.manifest.identity.id,
          capability
        });
      }
    }

    for (const requirement of module.manifest.dependencies.requires) {
      const providers = this.#registry
        .findByCapability(requirement.capability as CapabilityKey)
        .filter((provider) =>
          satisfies(
            {
              capability: requirement.capability,
              versionRange: requirement.version_range
            },
            requirement.capability,
            provider.manifest.identity.version
          )
        );
      if (providers.length === 0) {
        diagnostics.push({
          code: 'required_capability_unavailable',
          moduleId: module.manifest.identity.id,
          capability: requirement.capability
        });
      } else if (!providers.some((provider) => activeIds.has(provider.manifest.identity.id))) {
        diagnostics.push({
          code: 'required_capability_inactive',
          moduleId: module.manifest.identity.id,
          capability: requirement.capability
        });
      }
    }
  }
}
