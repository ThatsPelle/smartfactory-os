import type { CapabilityKey, CompanyId, UserId } from '@sfos/contracts';
import { Err, Ok, type Result } from '@sfos/contracts/result';
import type { EventEnvelope } from '@sfos/contracts/envelope';
import { schema, withTenantContext, type SfosDb } from '@sfos/db';
import { buildEnvelope } from '@sfos/events';
import type { ModuleLogger, ModuleRegistry, RegisteredModule } from '@sfos/module-sdk';
import { eq } from 'drizzle-orm';

import { AuditSink } from '../audit/sink.js';
import { ForeignEmissionError, UndeclaredEmissionError } from '../events/ownership.js';
import { satisfies } from '../capabilities/version.js';
import { createDefaultLogger } from '../runtime/logger.js';

import { CORE_MODULE_ACTIVATION_EVENTS, CORE_RUNTIME_MODULE_ID } from './events.js';

export type ModuleActivationError =
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
    }
  | {
      readonly code: 'activation_hook_failed';
      readonly moduleId: string;
      readonly message: string;
    };

export interface ActivateModuleInput {
  readonly companyId: CompanyId;
  readonly actorUserId: UserId;
  readonly moduleId: string;
  readonly correlationId: string;
}

export interface ActivatedModule {
  readonly companyId: CompanyId;
  readonly moduleId: string;
  readonly status: 'active';
}

interface ModuleActivationServiceOptions {
  readonly db: SfosDb;
  readonly registry: ActivationRegistry;
  readonly loggerFor?: (moduleId: string) => ModuleLogger;
  readonly platformCapabilities?: readonly CapabilityKey[];
}

interface ActivationRegistry extends ModuleRegistry {
  markActive(moduleId: string, companyId: CompanyId): void;
}

class ActivationHookFailure extends Error {}

export class ModuleActivationService {
  readonly #db: SfosDb;
  readonly #registry: ActivationRegistry;
  readonly #loggerFor: (moduleId: string) => ModuleLogger;
  readonly #platformCapabilities: ReadonlySet<string>;

  constructor(options: ModuleActivationServiceOptions) {
    this.#db = options.db;
    this.#registry = options.registry;
    this.#loggerFor = options.loggerFor ?? ((moduleId) => createDefaultLogger({ moduleId }));
    this.#platformCapabilities = new Set(options.platformCapabilities ?? []);
  }

  async activate(
    input: ActivateModuleInput
  ): Promise<Result<ActivatedModule, ModuleActivationError>> {
    const module = this.#registry.find(input.moduleId);
    if (!module) {
      return Err({ code: 'module_not_registered', moduleId: input.moduleId });
    }

    const requirementError = await this.#checkRequirements(module, input.companyId);
    if (requirementError) return Err(requirementError);

    const logger = this.#loggerFor(input.moduleId);
    try {
      await withTenantContext(
        this.#db,
        { companyId: input.companyId, userId: input.actorUserId },
        async (tx) => {
          const activationId = await this.#writePending(tx, input);
          const events = this.#moduleEvents(tx, module, input.companyId);

          if (module.lifecycle.activate) {
            try {
              const result = await module.lifecycle.activate({
                companyId: input.companyId,
                actorUserId: input.actorUserId,
                logger,
                events,
                moduleId: input.moduleId
              });
              if (!result.ok) throw new ActivationHookFailure(result.error);
            } catch (error) {
              if (error instanceof ActivationHookFailure) throw error;
              throw new ActivationHookFailure(
                error instanceof Error ? error.message : String(error)
              );
            }
          }

          await tx
            .update(schema.companyModules)
            .set({
              status: 'active',
              enabled: true,
              enabledAt: new Date(),
              disabledAt: null,
              failureReason: null
            })
            .where(eq(schema.companyModules.id, activationId));
          await this.#recordOutcome(tx, input, activationId, 'active');
        }
      );
    } catch (error) {
      if (!(error instanceof ActivationHookFailure)) throw error;
      await this.#recordFailure(input, error.message);
      return Err({
        code: 'activation_hook_failed',
        moduleId: input.moduleId,
        message: error.message
      });
    }

    this.#registry.markActive(input.moduleId, input.companyId);
    return Ok({ companyId: input.companyId, moduleId: input.moduleId, status: 'active' });
  }

  async #checkRequirements(
    module: RegisteredModule,
    companyId: CompanyId
  ): Promise<ModuleActivationError | undefined> {
    for (const capability of module.manifest.dependencies.platform_capabilities_required) {
      if (!this.#platformCapabilities.has(capability)) {
        return {
          code: 'platform_capability_unavailable',
          moduleId: module.manifest.identity.id,
          capability
        };
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
        return {
          code: 'required_capability_unavailable',
          moduleId: module.manifest.identity.id,
          capability: requirement.capability
        };
      }
      const active = await Promise.all(
        providers.map((provider) =>
          this.#registry.isActive(provider.manifest.identity.id, companyId)
        )
      );
      if (!active.some(Boolean)) {
        return {
          code: 'required_capability_inactive',
          moduleId: module.manifest.identity.id,
          capability: requirement.capability
        };
      }
    }
    return undefined;
  }

  async #writePending(tx: SfosDb, input: ActivateModuleInput): Promise<string> {
    const [row] = await tx
      .insert(schema.companyModules)
      .values({
        companyId: input.companyId,
        moduleId: input.moduleId,
        enabled: false,
        status: 'pending',
        failureReason: null,
        disabledAt: null
      })
      .onConflictDoUpdate({
        target: [schema.companyModules.companyId, schema.companyModules.moduleId],
        set: {
          enabled: false,
          status: 'pending',
          failureReason: null,
          disabledAt: null
        }
      })
      .returning({ id: schema.companyModules.id });
    if (!row) throw new Error(`Activation row missing for ${input.moduleId}`);
    return row.id;
  }

  #moduleEvents(tx: SfosDb, module: RegisteredModule, companyId: CompanyId) {
    const declared = new Set(module.manifest.events_produced.map(({ type }) => type));
    return {
      emit: async (envelope: EventEnvelope): Promise<void> => {
        if (envelope.source_module !== module.manifest.identity.id) {
          throw new ForeignEmissionError(
            module.manifest.identity.id,
            envelope.source_module,
            envelope.type
          );
        }
        if (!declared.has(envelope.type)) {
          throw new UndeclaredEmissionError(module.manifest.identity.id, envelope.type);
        }
        if (envelope.company_id !== companyId) {
          throw new Error(`Activation event ${envelope.type} has wrong company_id`);
        }
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
    };
  }

  async #recordFailure(input: ActivateModuleInput, message: string): Promise<void> {
    await withTenantContext(
      this.#db,
      { companyId: input.companyId, userId: input.actorUserId },
      async (tx) => {
        const [row] = await tx
          .insert(schema.companyModules)
          .values({
            companyId: input.companyId,
            moduleId: input.moduleId,
            enabled: false,
            status: 'failed',
            failureReason: message,
            disabledAt: null
          })
          .onConflictDoUpdate({
            target: [schema.companyModules.companyId, schema.companyModules.moduleId],
            set: {
              enabled: false,
              status: 'failed',
              failureReason: message,
              disabledAt: null
            }
          })
          .returning({ id: schema.companyModules.id });
        if (!row) throw new Error(`Activation failure row missing for ${input.moduleId}`);
        await this.#recordOutcome(tx, input, row.id, 'failed', message);
      }
    );
  }

  async #recordOutcome(
    tx: SfosDb,
    input: ActivateModuleInput,
    activationId: string,
    status: 'active' | 'failed',
    failureReason?: string
  ): Promise<void> {
    const type =
      status === 'active'
        ? CORE_MODULE_ACTIVATION_EVENTS.ACTIVATED
        : CORE_MODULE_ACTIVATION_EVENTS.ACTIVATION_FAILED;
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
        status,
        ...(failureReason ? { failure_reason: failureReason } : {})
      },
      visibility: 'internal',
      audit_required: true
    });

    await new AuditSink(tx).writeFromEnvelope(envelope, {
      moduleId: CORE_RUNTIME_MODULE_ID,
      entityKind: 'company_module',
      entityId: input.moduleId,
      changes: { status, ...(failureReason ? { failure_reason: failureReason } : {}) }
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
