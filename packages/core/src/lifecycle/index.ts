export {
  MODULE_STATES,
  allowedTransitions,
  canTransition,
  isServing,
  type ModuleState
} from './state.js';

export { LifecycleEngine, type LifecycleHistoryEntry } from './engine.js';

export {
  IllegalLifecycleTransitionError,
  ModuleAlreadyRegisteredError,
  UnknownModuleError
} from './errors.js';
