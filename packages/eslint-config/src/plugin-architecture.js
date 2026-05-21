// @ts-check

/**
 * @sfos/eslint-config — architecture plugin (flat-config compatible).
 *
 * SCAFFOLD. Real rule implementations are added incrementally as patterns
 * solidify across modules. For the V1 bootstrap, the heavy lifting is done by:
 *
 *   - dependency-cruiser (cross-package boundaries, circular deps, dist/ imports)
 *   - tsconfig strictness (types)
 *   - per-preset `no-restricted-imports` (path-level guards)
 *
 * This plugin reserves the `architecture/*` namespace so consumers can
 * extend with project-wide rules without renaming later.
 *
 * Planned rules (tracked in docs/architecture/04-manifest-and-events.md §18
 * and 06-monorepo.md §7):
 *
 *   - architecture/no-permission-string-literal
 *       Permission keys must come from @sfos/contracts constants.
 *   - architecture/no-event-type-string-literal
 *       Event types must come from generated module event constants.
 *   - architecture/no-cross-module-imports
 *       Mirrors the dependency-cruiser rule; surfaces in the editor.
 *   - architecture/no-foreign-event-emission
 *       A module can only emit events whose `source_module` matches itself.
 *   - architecture/no-direct-db-access-from-ui
 *       UI files cannot import `@sfos/db` or another module's db schema.
 *   - architecture/require-tenant-context
 *       Server queries on tenant-scoped tables must use a `withTenantContext`
 *       helper or set `app.current_company_id` first.
 *
 * Each rule lands as a separate file under src/rules/<rule-name>.js with its
 * own tests, and is added to `rules` below.
 *
 * @type {import('eslint').ESLint.Plugin}
 */
const architecturePlugin = {
  meta: {
    name: '@sfos/eslint-config/plugin-architecture',
    version: '0.0.0'
  },
  rules: {
    // Rule implementations will be added here. Intentionally empty for V1.
  },
  configs: {
    // Future flat-config preset enabling all architecture rules.
    recommended: {
      // Once rules exist, populate as:
      //   plugins: { architecture: architecturePlugin },
      //   rules: { 'architecture/<rule>': 'error', ... }
    }
  }
};

export default architecturePlugin;
