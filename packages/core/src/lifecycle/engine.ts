import { canTransition, type ModuleState } from './state.js';
import { IllegalLifecycleTransitionError, UnknownModuleError } from './errors.js';

/**
 * Lifecycle engine — tracks the state of every registered module and
 * exposes a single `transition` operation that either advances the
 * machine or raises with a clear error.
 *
 * Deliberately tiny. The hooks that ACTUALLY transition modules
 * (manifest loader, capability resolver, bootstrap) call into this. The
 * engine itself has no notion of what a module does — it only knows
 * which transitions are legal.
 *
 * Observability: every transition emits a record onto the history
 * buffer, which the diagnostics reporter pretty-prints. The buffer is
 * append-only with a soft cap; older entries are discarded.
 */

export interface LifecycleHistoryEntry {
  readonly moduleId: string;
  readonly from: ModuleState | null;
  readonly to: ModuleState;
  readonly at: Date;
  readonly reason: string | undefined;
}

const DEFAULT_HISTORY_LIMIT = 1024;

export class LifecycleEngine {
  readonly #states = new Map<string, ModuleState>();
  readonly #history: LifecycleHistoryEntry[] = [];
  readonly #historyLimit: number;

  constructor(historyLimit: number = DEFAULT_HISTORY_LIMIT) {
    this.#historyLimit = historyLimit;
  }

  /** Insert a new module at `discovered`. Raises if the id is already known. */
  introduce(moduleId: string, reason?: string): void {
    if (this.#states.has(moduleId)) {
      throw new Error(`Module "${moduleId}" already introduced to the lifecycle engine.`);
    }
    this.#states.set(moduleId, 'discovered');
    this.#record(moduleId, null, 'discovered', reason);
  }

  /** Current state, or undefined if the module is not introduced. */
  stateOf(moduleId: string): ModuleState | undefined {
    return this.#states.get(moduleId);
  }

  /**
   * Advance a module's state. Raises if the transition is illegal — silent
   * failures are the bug we want to catch loudest.
   */
  transition(moduleId: string, to: ModuleState, reason?: string): void {
    const from = this.#states.get(moduleId);
    if (from === undefined) {
      throw new UnknownModuleError(moduleId);
    }
    if (!canTransition(from, to)) {
      throw new IllegalLifecycleTransitionError(moduleId, from, to);
    }
    this.#states.set(moduleId, to);
    this.#record(moduleId, from, to, reason);
  }

  /** Read-only view of all module states. */
  snapshot(): ReadonlyMap<string, ModuleState> {
    return new Map(this.#states);
  }

  /** Append-only history of transitions. Newest last. */
  history(): readonly LifecycleHistoryEntry[] {
    return this.#history;
  }

  #record(
    moduleId: string,
    from: ModuleState | null,
    to: ModuleState,
    reason: string | undefined
  ): void {
    this.#history.push({ moduleId, from, to, at: new Date(), reason });
    if (this.#history.length > this.#historyLimit) {
      this.#history.splice(0, this.#history.length - this.#historyLimit);
    }
  }
}
