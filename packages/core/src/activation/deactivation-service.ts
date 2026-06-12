import type { CapabilityKey, CompanyId, UserId } from '@sfos/contracts';
import { Err, Ok, type Result } from '@sfos/contracts/result';
import { schema, withTenantContext, type SfosDb } from '@sfos/db';
import { buildEnvelope } from '@sfos/events';
import type { ModuleLogger, ModuleRegistry, RegisteredModule } from '@sfos/module-sdk';
import { and, eq } from 'drizzle-orm';

import { AuditSink } from '../audit/sink.js';
import { satisfies } from '../capabilities/version.js';
import { createDefaultLogger } from '../runtime/logger.js';

import { CORE_MODULE_ACTIVATION_EVENTS, CORE_RUNTIME_MODULE_ID } from './events.js';
import { createModuleEventEmitter } from './module-events.js';

type ActivationStatus = 'pending' | 'active' | 'disabled' | 'failed';

export type ModuleDeactivationError =
  | { readonly code: 'module_not_registered'; readonly moduleId: string }
  | {
      readonly code: 'module_not_active';
      readonly moduleId: string;
      readonly status: ActivationStatus | 'missing';
    }
  | {
      readonly code: 'activation_state_inconsistent';
      readonly moduleId: string;
      readonly status: ActivationStatus;
      readonly enabled: boolean;
    }
  | {
      readonly code: 'active_module_not_registered';
      readonly moduleId: string;
      readonly activeModuleId: string;
    }
  | {
      readonly code: 'active_dependent_exists';
      readonly moduleId: string;
      readonly dependentModuleId: string;
      readonly capability: string;
    }
  | {
      readonly code: 'deactivation_hook_failed';
      readonly moduleId: string;
      readonly message: string;
    };

export interface DeactivateModuleInput {
  readonly companyId: CompanyId;
  readonly actorUserId: UserId;
  readonly moduleId: string;
  readonly correlationId: string;
}

export interface DeactivatedModule {
  readonly companyId: CompanyId;
  readonly moduleId: string;
  readonly status: 'disabled';
  readonly changed: boolean;
}

interface DeactivationRegistry extends ModuleRegistry {
  markInactive(moduleId: string, companyId: CompanyId): void;
}

interface ModuleDeactivationServiceOptions {
  readonly db: SfosDb;
  readonly registry: DeactivationRegistry;
  readonly loggerFor?: (moduleId: string) => ModuleLogger;
}

type TransactionResult =
  | { readonly kind: 'deactivated'; readonly activationId: string }
  | { readonly kind: 'already_disabled' }
  | { readonly kind: 'error'; readonly error: ModuleDeactivationError };

class DeactivationHookFailure extends Error {}

export class ModuleDeactivationService {
  readonly #db: SfosDb;
  readonly #registry: DeactivationRegistry;
  readonly #loggerFor: (moduleId: string) => ModuleLogger;

  constructor(options: ModuleDeactivationServiceOptions) {
    this.#db = options.db;
    this.#registry = options.registry;
    this.#loggerFor = options.loggerFor ?? ((moduleId) => createDefaultLogger({ moduleId }));
  }

  async deactivate(
    input: DeactivateModuleInput
  ): Promise<Result<DeactivatedModule, ModuleDeactivationError>> {
    const module = this.#registry.find(input.moduleId);
    if (!module) {
      return Err({ code: 'module_not_registered', moduleId: input.moduleId });
    }

    try {
      const result = await withTenantContext(
        this.#db,
        { companyId: input.companyId, userId: input.actorUserId },
        async (tx): Promise<TransactionResult> => {
          const [row] = await tx
            .select({
              id: schema.companyModules.id,
              status: schema.companyModules.status,
              enabled: schema.companyModules.enabled
            })
            .from(schema.companyModules)
            .where(
              and(
                eq(schema.companyModules.companyId, input.companyId),
                eq(schema.companyModules.moduleId, input.moduleId)
              )
            )
            .limit(1);

          if (!row) {
            return {
              kind: 'error',
              error: {
                code: 'module_not_active',
                moduleId: input.moduleId,
                status: 'missing'
              }
            };
          }
          if (row.enabled !== (row.status === 'active')) {
            return {
              kind: 'error',
              error: {
                code: 'activation_state_inconsistent',
                moduleId: input.moduleId,
                status: row.status,
                enabled: row.enabled
              }
            };
          }
          if (row.status === 'disabled') return { kind: 'already_disabled' };
          if (row.status !== 'active') {
            return {
              kind: 'error',
              error: {
                code: 'module_not_active',
                moduleId: input.moduleId,
                status: row.status
              }
            };
          }

          const dependencyError = await this.#checkActiveDependents(tx, module, input);
          if (dependencyError) return { kind: 'error', error: dependencyError };

          if (module.lifecycle.deactivate) {
            const logger = this.#loggerFor(input.moduleId);
            try {
              const hookResult = await module.lifecycle.deactivate({
                companyId: input.companyId,
                actorUserId: input.actorUserId,
                logger,
                events: createModuleEventEmitter(tx, module, input.companyId),
                moduleId: input.moduleId
              });
              if (!hookResult.ok) throw new DeactivationHookFailure(hookResult.error);
            } catch (error) {
              if (error instanceof DeactivationHookFailure) throw error;
              throw new DeactivationHookFailure(
                error instanceof Error ? error.message : String(error)
              );
            }
          }

          await tx
            .update(schema.companyModules)
            .set({
              status: 'disabled',
              enabled: false,
              disabledAt: new Date(),
              failureReason: null
            })
            .where(eq(schema.companyModules.id, row.id));
          await this.#recordOutcome(tx, input, row.id, 'disabled');
          return { kind: 'deactivated', activationId: row.id };
        }
      );

      if (result.kind === 'error') return Err(result.error);
      this.#registry.markInactive(input.moduleId, input.companyId);
      return Ok({
        companyId: input.companyId,
        moduleId: input.moduleId,
        status: 'disabled',
        changed: result.kind === 'deactivated'
      });
    } catch (error) {
      if (!(error instanceof DeactivationHookFailure)) throw error;
      await this.#recordFailure(input, error.message);
      return Err({
        code: 'deactivation_hook_failed',
        moduleId: input.moduleId,
        message: error.message
      });
    }
  }

  async #checkActiveDependents(
    tx: SfosDb,
    target: RegisteredModule,
    input: DeactivateModuleInput
  ): Promise<ModuleDeactivationError | undefined> {
    const activeRows = await tx
      .select({ moduleId: schema.companyModules.moduleId })
      .from(schema.companyModules)
      .where(
        and(
          eq(schema.companyModules.companyId, input.companyId),
          eq(schema.companyModules.status, 'active'),
          eq(schema.companyModules.enabled, true)
        )
      )
      .orderBy(schema.companyModules.moduleId);
    const activeIds = new Set(activeRows.map(({ moduleId }) => moduleId));

    for (const { moduleId } of activeRows) {
      if (moduleId === input.moduleId) continue;
      const dependent = this.#registry.find(moduleId);
      if (!dependent) {
        return {
          code: 'active_module_not_registered',
          moduleId: input.moduleId,
          activeModuleId: moduleId
        };
      }
      for (const requirement of dependent.manifest.dependencies.requires) {
        const targetProvides = this.#providerSatisfies(target, requirement);
        if (!targetProvides) continue;
        const alternate = this.#registry
          .findByCapability(requirement.capability as CapabilityKey)
          .some(
            (provider) =>
              provider.manifest.identity.id !== input.moduleId &&
              activeIds.has(provider.manifest.identity.id) &&
              this.#providerSatisfies(provider, requirement)
          );
        if (!alternate) {
          return {
            code: 'active_dependent_exists',
            moduleId: input.moduleId,
            dependentModuleId: moduleId,
            capability: requirement.capability
          };
        }
      }
    }
    return undefined;
  }

  #providerSatisfies(
    provider: RegisteredModule,
    requirement: { readonly capability: string; readonly version_range: string }
  ): boolean {
    const provides = [
      ...provider.manifest.capabilities.provides,
      ...provider.manifest.capabilities.provides_optional
    ].some(({ key }) => key === requirement.capability);
    return (
      provides &&
      satisfies(
        {
          capability: requirement.capability,
          versionRange: requirement.version_range
        },
        requirement.capability,
        provider.manifest.identity.version
      )
    );
  }

  async #recordFailure(input: DeactivateModuleInput, message: string): Promise<void> {
    await withTenantContext(
      this.#db,
      { companyId: input.companyId, userId: input.actorUserId },
      async (tx) => {
        const [row] = await tx
          .update(schema.companyModules)
          .set({ failureReason: message })
          .where(
            and(
              eq(schema.companyModules.companyId, input.companyId),
              eq(schema.companyModules.moduleId, input.moduleId),
              eq(schema.companyModules.status, 'active'),
              eq(schema.companyModules.enabled, true)
            )
          )
          .returning({ id: schema.companyModules.id });
        if (!row) throw new Error(`Active deactivation row missing for ${input.moduleId}`);
        await this.#recordOutcome(tx, input, row.id, 'failed', message);
      }
    );
  }

  async #recordOutcome(
    tx: SfosDb,
    input: DeactivateModuleInput,
    activationId: string,
    outcome: 'disabled' | 'failed',
    failureReason?: string
  ): Promise<void> {
    const type =
      outcome === 'disabled'
        ? CORE_MODULE_ACTIVATION_EVENTS.DEACTIVATED
        : CORE_MODULE_ACTIVATION_EVENTS.DEACTIVATION_FAILED;
    const envelope = buildEnvelope({
      type,
      version: '1.0',
      source_module: CORE_RUNTIME_MODULE_ID,
      company_id: input.companyId,
      source_entity_id: activationId,
      emitted_by: { kind: 'user', id: input.actorUserId },
      correlation_id: input.correlationId,
      payload: {
        module_id: input.moduleId,
        status: outcome === 'disabled' ? 'disabled' : 'active',
        ...(failureReason ? { failure_reason: failureReason } : {})
      },
      visibility: 'internal',
      audit_required: true
    });

    await new AuditSink(tx).writeFromEnvelope(envelope, {
      moduleId: CORE_RUNTIME_MODULE_ID,
      entityKind: 'company_module',
      entityId: input.moduleId,
      changes: {
        status: outcome === 'disabled' ? 'disabled' : 'active',
        ...(failureReason ? { failure_reason: failureReason } : {})
      }
    });
    await tx.insert(schema.outboxEvents).values({
      id: envelope.id,
      companyId: envelope.company_id,
      type: envelope.type,
      version: envelope.version,
      sourceModule: envelope.source_module,
      correlationId: envelope.correlation_id,
      causationId: envelope.causation_id,
      envelope,
      occurredAt: new Date(envelope.occurred_at)
    });
  }
}
