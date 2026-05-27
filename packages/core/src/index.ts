/**
 * @sfos/core — public surface.
 *
 * The runtime orchestration layer. Apps consume:
 *   - `bootstrap(input)` — the canonical startup flow
 *   - the produced `registry`, `bus`, `engine`, `diagnostics`
 *
 * Modules consume `@sfos/module-sdk`, not this package. The boundary is
 * enforced by dependency-cruiser (rule lands with the modules workspace).
 */

export {
  bootstrap,
  type BootstrapInput,
  type BootstrapResult,
  createDefaultLogger
} from './runtime/index.js';

export { InMemoryModuleRegistry } from './registry/index.js';

export {
  LifecycleEngine,
  MODULE_STATES,
  allowedTransitions,
  canTransition,
  isServing,
  type ModuleState,
  type LifecycleHistoryEntry,
  IllegalLifecycleTransitionError,
  ModuleAlreadyRegisteredError,
  UnknownModuleError
} from './lifecycle/index.js';

export {
  resolveCapabilities,
  parseCapabilityKey,
  satisfies as capabilitySatisfies,
  type CapabilityRequirement,
  type CapabilityResolution
} from './capabilities/index.js';

export {
  EventBus,
  matches as eventTypeMatches,
  ForeignEmissionError,
  UndeclaredEmissionError,
  type DispatchResult,
  type EventHandler,
  type HandlerFailure,
  type Subscription
} from './events/index.js';

export {
  OutboxPublisher,
  DEFAULT_PUBLISHER_CONFIG,
  type PublisherConfig,
  type RunResult as OutboxRunResult
} from './outbox/index.js';

export { AuditSink, type AuditWrite } from './audit/index.js';

export {
  renderDiagnostics,
  type ModuleDiagnostic,
  type RuntimeDiagnostics
} from './diagnostics/index.js';

export {
  loadModules,
  type LoadOptions,
  type LoadResult,
  type ManifestLoadIssue
} from './manifests/index.js';
