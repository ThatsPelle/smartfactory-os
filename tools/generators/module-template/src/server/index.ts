import type { ModuleLifecycle } from '@sfos/module-sdk';

/**
 * __DISPLAY_NAME__ module — lifecycle.
 *
 * The platform's module registry calls these hooks in a documented sequence.
 * See @sfos/module-sdk for the contract and docs/architecture/04-manifest-and-events.md
 * for the platform's startup orchestration.
 */
const module__MODULE_NAME__: ModuleLifecycle = {
  async preFlight(_ctx) {
    // Cheap sanity checks (env vars, schema readiness). Must complete < 1s.
    return { ok: true, value: undefined };
  },

  async register(_ctx) {
    // Subscribe event handlers, schedule jobs, register internal services.
    return { ok: true, value: undefined };
  },

  async activate(_ctx) {
    // Per-tenant initialization beyond migrations + seeds (which the registry
    // applies automatically from manifest declarations).
    return { ok: true, value: undefined };
  },

  async deactivate(_ctx) {
    // Clean shutdown of module-local resources for this tenant.
    // Data is retained until explicit uninstall.
    return { ok: true, value: undefined };
  }
};

export default module__MODULE_NAME__;
