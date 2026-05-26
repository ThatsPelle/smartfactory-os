import type { ModuleState } from './state.js';

/**
 * Domain errors for the lifecycle engine.
 *
 * All carry the module id and enough context to produce a clear log line —
 * a runtime failure should never read like a stack trace.
 */

export class IllegalLifecycleTransitionError extends Error {
  readonly moduleId: string;
  readonly from: ModuleState;
  readonly to: ModuleState;

  constructor(moduleId: string, from: ModuleState, to: ModuleState) {
    super(
      `Module "${moduleId}" cannot transition from "${from}" to "${to}". ` +
        `If this is intentional, add the transition to lifecycle/state.ts.`
    );
    this.name = 'IllegalLifecycleTransitionError';
    this.moduleId = moduleId;
    this.from = from;
    this.to = to;
  }
}

export class UnknownModuleError extends Error {
  readonly moduleId: string;

  constructor(moduleId: string) {
    super(`Module "${moduleId}" is not registered.`);
    this.name = 'UnknownModuleError';
    this.moduleId = moduleId;
  }
}

export class ModuleAlreadyRegisteredError extends Error {
  readonly moduleId: string;

  constructor(moduleId: string) {
    super(
      `Module "${moduleId}" is already registered. ` +
        `Duplicate manifest ids are rejected at registration time.`
    );
    this.name = 'ModuleAlreadyRegisteredError';
    this.moduleId = moduleId;
  }
}
