/**
 * Module lifecycle state machine.
 *
 * Platform-level state of a module within the runtime registry. Per-tenant
 * activation status is NOT tracked here — that lives in
 * `core.company_modules` (read at request time) and is intentionally
 * separate from the platform state machine.
 *
 * Transitions are explicit and one-way under the happy path:
 *
 *   discovered → validated → registered → initialized
 *
 * Side branches:
 *
 *   any of {validated, registered, initialized} → failed       (hard error)
 *   initialized → degraded                                     (handler crashed)
 *   degraded   → initialized                                   (no auto path; operator only)
 *   {initialized, degraded, failed} → disabled                 (admin off)
 *
 * `disabled` is terminal until the runtime restarts.
 */

export const MODULE_STATES = [
  'discovered',
  'validated',
  'registered',
  'initialized',
  'degraded',
  'failed',
  'disabled'
] as const;

export type ModuleState = (typeof MODULE_STATES)[number];

/**
 * The allowed transition matrix. A transition NOT listed here is rejected
 * by `LifecycleEngine` — silent illegal transitions are the bug we want
 * the most help catching.
 */
const TRANSITIONS: Readonly<Record<ModuleState, readonly ModuleState[]>> = {
  discovered: ['validated', 'failed', 'disabled'],
  validated: ['registered', 'failed', 'disabled'],
  registered: ['initialized', 'failed', 'disabled'],
  initialized: ['degraded', 'failed', 'disabled'],
  degraded: ['initialized', 'failed', 'disabled'],
  failed: ['disabled'],
  disabled: []
};

export const canTransition = (from: ModuleState, to: ModuleState): boolean =>
  TRANSITIONS[from].includes(to);

export const allowedTransitions = (from: ModuleState): readonly ModuleState[] => TRANSITIONS[from];

/** A state from which the module is still serving traffic. */
export const isServing = (s: ModuleState): boolean => s === 'initialized' || s === 'degraded';
