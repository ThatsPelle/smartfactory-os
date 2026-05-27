import { asCompanyId } from '@sfos/contracts';
import type { RegisteredModule, PlatformContext, ModuleLogger, TenantContext } from '@sfos/module-sdk';

import { resolveCapabilities } from '../capabilities/graph.js';
import { EventBus } from '../events/bus.js';
import { ForeignEmissionError } from '../events/ownership.js';
import { LifecycleEngine } from '../lifecycle/engine.js';
import { loadModules, type LoadOptions, type ManifestLoadIssue } from '../manifests/loader.js';
import { InMemoryModuleRegistry } from '../registry/module-registry.js';
import type {
  ModuleDiagnostic,
  RuntimeDiagnostics
} from '../diagnostics/state.js';

import { createDefaultLogger } from './logger.js';

/**
 * Runtime bootstrap.
 *
 * The single canonical startup flow. The app (BFF, CLI, test harness)
 * builds a `BootstrapInput`, calls `bootstrap`, and gets back a
 * `BootstrapResult` carrying the registry, the event bus, and the
 * diagnostics snapshot. From there the app starts the outbox publisher
 * and accepts traffic — the runtime is ready.
 *
 * Failure isolation: any single module that fails preFlight or register
 * is marked `failed` and excluded from event handling. The bootstrap as
 * a whole does NOT throw — the diagnostics carry the truth. The caller
 * (typically a deployment-mode-specific wrapper) decides whether a
 * partial start is acceptable.
 *
 * Phases (in this exact order):
 *   1. load        — validate manifests, dedupe ids, platform-version check
 *   2. resolve     — capability graph, topological order, cycle detection
 *   3. register    — build registry from valid modules, install order
 *   4. initialize  — call each module's preFlight + register hooks
 *   5. snapshot    — compose diagnostics
 *
 * The PHASE names appear verbatim in `diagnostics.phaseDurations` keys.
 */

export interface BootstrapInput {
  readonly platformVersion: string;
  readonly runtimeMode: 'cloud' | 'self_hosted' | 'workstation';
  readonly modules: readonly { manifest: unknown; lifecycle: RegisteredModule['lifecycle'] }[];
  /** Optional logger factory; defaults to JSON-line stdout. */
  readonly loggerFor?: (moduleId: string) => ModuleLogger;
  /** Optional shared settings store passed into module preFlight/register. */
  readonly settings?: PlatformContext['settings'];
}

export interface BootstrapResult {
  readonly registry: InMemoryModuleRegistry;
  readonly bus: EventBus;
  readonly engine: LifecycleEngine;
  readonly diagnostics: RuntimeDiagnostics;
}

const noopSettings: PlatformContext['settings'] = {
  get: () => undefined,
  has: () => false
};

export const bootstrap = async (input: BootstrapInput): Promise<BootstrapResult> => {
  const startedAt = new Date();
  const phaseDurations: Record<string, number> = {};
  const time = async <T>(phase: string, fn: () => Promise<T> | T): Promise<T> => {
    const start = Date.now();
    try {
      return await fn();
    } finally {
      phaseDurations[phase] = Date.now() - start;
    }
  };

  const registry = new InMemoryModuleRegistry();
  const bus = new EventBus();
  const engine = new LifecycleEngine();
  let loadIssues: readonly ManifestLoadIssue[] = [];
  let unresolvedByModule: ReadonlyMap<string, readonly { capability: string; versionRange: string }[]> =
    new Map();
  let providersByModule: ReadonlyMap<string, readonly string[]> = new Map();
  let cycles: readonly (readonly string[])[] = [];

  const loadOpts: LoadOptions = {
    platformVersion: input.platformVersion,
    runtimeMode: input.runtimeMode
  };

  // ---------- Phase 1: load ----------
  const valid = await time('load', () => {
    const r = loadModules(input.modules, loadOpts);
    loadIssues = r.issues;
    for (const m of r.valid) engine.introduce(m.manifest.identity.id, 'loaded');
    return r.valid;
  });

  // Anything that fell out of load is permanently failed (no manifest = no
  // module). We don't enter them in the lifecycle engine because we don't
  // even have a stable id for every load failure.

  // ---------- Phase 2: resolve ----------
  await time('resolve', () => {
    for (const m of valid) engine.transition(m.manifest.identity.id, 'validated');
    const resolution = resolveCapabilities(valid);
    providersByModule = resolution.providersByModule;
    unresolvedByModule = resolution.unresolvedByModule;
    cycles = resolution.cycles;

    // Modules with unresolved requirements are failed BEFORE registration —
    // they cannot satisfy their contract.
    for (const [moduleId] of unresolvedByModule) {
      engine.transition(moduleId, 'failed', 'unresolved capability requirements');
    }
    // Modules in a cycle are also failed.
    const cycleMembers = new Set(cycles.flat());
    for (const id of cycleMembers) {
      if (engine.stateOf(id) === 'validated') {
        engine.transition(id, 'failed', 'capability cycle');
      }
    }

    // Re-order the registry per topological order, restricted to still-valid.
    const stillValid = valid.filter((m) => engine.stateOf(m.manifest.identity.id) === 'validated');
    for (const m of stillValid) registry.register(m);
    registry.setOrder(resolution.order);
    for (const m of stillValid) engine.transition(m.manifest.identity.id, 'registered');
  });

  // ---------- Phase 3+4: initialize ----------
  await time('initialize', async () => {
    for (const m of registry.list()) {
      const id = m.manifest.identity.id;
      const logger = input.loggerFor?.(id) ?? createDefaultLogger({ moduleId: id });
      const ctx: PlatformContext = {
        logger,
        moduleId: id,
        settings: input.settings ?? noopSettings,
        events: {
          // Subscription wrapper: the module-sdk surface takes
          // `(event, ctx)`, but the platform's bus only knows envelopes.
          // We bridge by building a minimal tenant context per dispatch
          // from the envelope itself.
          //
          // Two intentional limitations of this foundation:
          //   - Events with `company_id === null` (platform-system events)
          //     are skipped. They need a system-context dispatch path,
          //     which is a deferred concern (see docs/runtime-architecture.md).
          //   - `actorUserId` is not populated. The envelope's `emitted_by`
          //     may or may not be a user; resolving that to a branded
          //     UserId belongs to the future tenant-aware request layer,
          //     not this foundation.
          //
          // Handlers that need user attribution should read `event.emitted_by`
          // directly until that layer ships.
          subscribe: (pattern, handler) => {
            bus.subscribe(id, pattern, async (event) => {
              if (event.company_id === null) return;
              const tenantCtx: TenantContext = {
                companyId: asCompanyId(event.company_id),
                logger,
                moduleId: id,
                events: {
                  emit: async (env) => {
                    if (env.source_module !== id) {
                      throw new ForeignEmissionError(id, env.source_module, env.type);
                    }
                    // Cross-handler emit at this layer is intentionally not
                    // implemented yet — the outbox is the canonical path. A
                    // handler that needs to emit publishes to the outbox.
                  }
                }
              };
              await handler(event, tenantCtx);
            });
          }
        }
      };

      try {
        if (m.lifecycle.preFlight) {
          const r = await m.lifecycle.preFlight(ctx);
          if (!r.ok) {
            engine.transition(id, 'failed', `preFlight: ${r.error}`);
            logger.error('preFlight failed', { error: r.error });
            continue;
          }
        }
        if (m.lifecycle.register) {
          const r = await m.lifecycle.register(ctx);
          if (!r.ok) {
            engine.transition(id, 'failed', `register: ${r.error}`);
            logger.error('register failed', { error: r.error });
            continue;
          }
        }
        engine.transition(id, 'initialized');
        logger.info('module initialized');
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        engine.transition(id, 'failed', message);
        logger.error('module init threw', { error: message });
      }
    }
  });

  // ---------- Phase 5: snapshot ----------
  const modules: ModuleDiagnostic[] = [];
  const seen = new Set<string>();

  // 1. Registered + initialized (or failed during init) — registry order.
  for (const m of registry.list()) {
    const id = m.manifest.identity.id;
    modules.push({
      moduleId: id,
      version: m.manifest.identity.version,
      state: engine.stateOf(id) ?? 'discovered',
      unresolved: unresolvedByModule.get(id) ?? [],
      providers: providersByModule.get(id) ?? []
    });
    seen.add(id);
  }

  // 2. Modules that loaded and entered the lifecycle engine but were
  //    failed BEFORE registration (unresolved deps, cycle members).
  //    These never reach registry.list(); we surface them from the engine
  //    snapshot so diagnostics never lie about which modules failed.
  for (const m of valid) {
    const id = m.manifest.identity.id;
    if (seen.has(id)) continue;
    modules.push({
      moduleId: id,
      version: m.manifest.identity.version,
      state: engine.stateOf(id) ?? 'failed',
      unresolved: unresolvedByModule.get(id) ?? [],
      providers: providersByModule.get(id) ?? []
    });
    seen.add(id);
  }

  // 3. Modules that never even loaded (schema invalid, duplicate id,
  //    platform/runtime mismatch). Report whatever id we managed to read
  //    from the load issue.
  for (const issue of loadIssues) {
    if (issue.moduleId && !modules.some((m) => m.moduleId === issue.moduleId)) {
      modules.push({
        moduleId: issue.moduleId,
        version: 'unknown',
        state: 'failed',
        unresolved: [],
        providers: []
      });
    }
  }

  const diagnostics: RuntimeDiagnostics = {
    platformVersion: input.platformVersion,
    runtimeMode: input.runtimeMode,
    startedAt,
    ready: modules.every((m) => m.state === 'initialized' || m.state === 'disabled'),
    phaseDurations,
    loadIssues,
    capabilityCycles: cycles,
    modules,
    lifecycleHistory: engine.history()
  };

  return { registry, bus, engine, diagnostics };
};
