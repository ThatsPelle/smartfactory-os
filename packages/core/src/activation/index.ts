export {
  ModuleActivationService,
  type ActivateModuleInput,
  type ActivatedModule,
  type ModuleActivationError
} from './service.js';

export { CORE_MODULE_ACTIVATION_EVENTS, CORE_RUNTIME_MODULE_ID } from './events.js';

export {
  ModuleDeactivationService,
  type DeactivateModuleInput,
  type DeactivatedModule,
  type ModuleDeactivationError
} from './deactivation-service.js';

export {
  ActivationRegistryHydrator,
  type HydrateCompanyActivationsInput,
  type ActivationHydrationDiagnostic,
  type ActivationHydrationResult,
  type PersistedActivationStateRow
} from './hydration.js';

export {
  StartupHydrationOrchestrator,
  type StartupHydrationCompanyDiagnostic,
  type StartupHydrationCompanyResult,
  type StartupHydrationEnumerationError,
  type StartupHydrationOrchestratorOptions,
  type StartupHydrationReport
} from './startup-hydration.js';
