/**
 * Ownership enforcement for event emission.
 *
 * Every event envelope carries `source_module`. A module emitting an event
 * with a `source_module` other than its own id is a violation of the
 * platform's ownership invariant — modules emit only events they own. The
 * bus raises this error rather than dispatching, and the caller (usually
 * the per-tenant `EventEmissionApi`) surfaces it to the requesting code.
 *
 * Defense in depth: the same invariant is also enforced at the DB level
 * by `core.outbox_events` RLS (a module connection cannot insert a row
 * whose source_module is not its own — wired when modules ship with
 * their own DB roles). This class is the in-process front line.
 */

export class ForeignEmissionError extends Error {
  readonly emittingModuleId: string;
  readonly declaredSourceModule: string;
  readonly eventType: string;

  constructor(emittingModuleId: string, declaredSourceModule: string, eventType: string) {
    super(
      `Module "${emittingModuleId}" tried to emit event "${eventType}" ` +
        `with source_module="${declaredSourceModule}". Modules may only emit ` +
        `events they own.`
    );
    this.name = 'ForeignEmissionError';
    this.emittingModuleId = emittingModuleId;
    this.declaredSourceModule = declaredSourceModule;
    this.eventType = eventType;
  }
}

/**
 * Confirm that a manifest declares the event type it tries to emit. The
 * registry calls this when a module attempts to emit an event whose type
 * is not in its `events_produced` list — a forgotten manifest entry is a
 * loud failure here rather than a silent unrouteable event later.
 */
export class UndeclaredEmissionError extends Error {
  readonly moduleId: string;
  readonly eventType: string;

  constructor(moduleId: string, eventType: string) {
    super(
      `Module "${moduleId}" emitted event "${eventType}" but does not declare ` +
        `it in its manifest's events_produced. Add the type to the manifest ` +
        `(both at runtime and in CI catalog validation).`
    );
    this.name = 'UndeclaredEmissionError';
    this.moduleId = moduleId;
    this.eventType = eventType;
  }
}
