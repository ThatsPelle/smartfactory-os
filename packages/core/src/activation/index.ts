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
  type ActivationHydrationResult
} from './hydration.js';
