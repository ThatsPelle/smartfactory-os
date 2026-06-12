import type { CapabilityKey, CompanyId } from '@sfos/contracts';
import {
  listCompaniesForHydration,
  listCompanyModuleActivationsForHydration,
  type HydrationCompanyRecord,
  type PersistedCompanyModuleActivationRow,
  type SfosDb
} from '@sfos/db';
import type { ModuleRegistry } from '@sfos/module-sdk';

import {
  ActivationRegistryHydrator,
  type ActivationHydrationDiagnostic,
  type PersistedActivationStateRow
} from './hydration.js';

export type StartupHydrationCompanyDiagnostic =
  | ActivationHydrationDiagnostic
  | {
      readonly code: 'company_activation_query_failed';
      readonly message: string;
    };

export interface StartupHydrationCompanyResult {
  readonly companyId: CompanyId;
  readonly companyName: string;
  readonly companySlug: string;
  readonly ready: boolean;
  readonly activeModuleIds: readonly string[];
  readonly diagnostics: readonly StartupHydrationCompanyDiagnostic[];
}

export interface StartupHydrationEnumerationError {
  readonly code: 'company_enumeration_failed';
  readonly message: string;
}

export interface StartupHydrationReport {
  readonly ready: boolean;
  readonly enumeratedCompanies: number;
  readonly results: readonly StartupHydrationCompanyResult[];
  readonly enumerationError?: StartupHydrationEnumerationError;
}

interface StartupHydrationRegistry extends ModuleRegistry {
  replaceActiveModules(companyId: CompanyId, moduleIds: readonly string[]): void;
}

export interface StartupHydrationOrchestratorOptions {
  readonly db: SfosDb;
  readonly registry: StartupHydrationRegistry;
  readonly platformCapabilities?: readonly CapabilityKey[];
  readonly enumerateCompanies?: (db: SfosDb) => Promise<readonly HydrationCompanyRecord[]>;
  readonly listCompanyActivations?: (
    db: SfosDb,
    companyId: CompanyId
  ) => Promise<readonly PersistedCompanyModuleActivationRow[]>;
}

export class StartupHydrationOrchestrator {
  readonly #db: SfosDb;
  readonly #registry: StartupHydrationRegistry;
  readonly #enumerateCompanies: (db: SfosDb) => Promise<readonly HydrationCompanyRecord[]>;
  readonly #listCompanyActivations: (
    db: SfosDb,
    companyId: CompanyId
  ) => Promise<readonly PersistedCompanyModuleActivationRow[]>;
  readonly #hydrator: ActivationRegistryHydrator;

  constructor(options: StartupHydrationOrchestratorOptions) {
    this.#db = options.db;
    this.#registry = options.registry;
    this.#enumerateCompanies = options.enumerateCompanies ?? listCompaniesForHydration;
    this.#listCompanyActivations =
      options.listCompanyActivations ?? listCompanyModuleActivationsForHydration;
    this.#hydrator = new ActivationRegistryHydrator(
      options.platformCapabilities
        ? {
            registry: options.registry,
            platformCapabilities: options.platformCapabilities
          }
        : {
            registry: options.registry
          }
    );
  }

  async hydrateAllCompanies(): Promise<StartupHydrationReport> {
    let companies: readonly HydrationCompanyRecord[];
    try {
      companies = await this.#enumerateCompanies(this.#db);
    } catch (error) {
      return {
        ready: false,
        enumeratedCompanies: 0,
        results: [],
        enumerationError: {
          code: 'company_enumeration_failed',
          message: error instanceof Error ? error.message : String(error)
        }
      };
    }

    const results: StartupHydrationCompanyResult[] = [];
    for (const company of companies) {
      try {
        const rows: readonly PersistedActivationStateRow[] = await this.#listCompanyActivations(
          this.#db,
          company.companyId
        );
        const result = this.#hydrator.hydrateCompanyRows({
          companyId: company.companyId,
          rows
        });
        results.push({
          ...result,
          companyName: company.name,
          companySlug: company.slug
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.#registry.replaceActiveModules(company.companyId, []);
        results.push({
          companyId: company.companyId,
          companyName: company.name,
          companySlug: company.slug,
          ready: false,
          activeModuleIds: [],
          diagnostics: [{ code: 'company_activation_query_failed', message }]
        });
      }
    }

    return {
      ready: results.every((result) => result.ready),
      enumeratedCompanies: companies.length,
      results
    };
  }
}
