# ADR-0002: Adopt ESLint v9 Flat Config (`eslint.config.js`)

- **Status:** accepted
- **Date:** 2026-05-20
- **Supersedes:** part of ADR-0001 (the legacy `.eslintrc.cjs` choice)

## Context

The initial bootstrap (ADR-0001) standardized on ESLint 9.x but used legacy
`.eslintrc.cjs` for per-package configuration. ESLint v9 ships **flat config**
(`eslint.config.js`) as the official, supported configuration system; legacy
config requires an opt-in environment flag and is on a deprecation trajectory.

A first integration attempt surfaced the mismatch: running `eslint` with the
default v9 settings rejects `.eslintrc.cjs` files. We have three options:

1. Downgrade ESLint to 8.x — rejected. ESLint 8 is in maintenance; new
   tooling assumes 9+.
2. Set `ESLINT_USE_FLAT_CONFIG=false` and keep legacy configs — rejected.
   This pins us to a deprecated path; the migration debt only grows.
3. Migrate to flat config now, while the codebase is tiny — chosen.

The migration is cheaper today than at any future point. Six `.eslintrc.cjs`
files exist; in three months, it would be thirty.

## Decision

1. **Adopt ESLint v9 Flat Config (`eslint.config.js`) across the repository.**
   - Root `eslint.config.js` declares global ignores and a defensive base.
   - Each workspace package owns its own `eslint.config.js` and imports the
     appropriate preset from `@sfos/eslint-config`.
   - `.eslintrc.cjs` is deleted everywhere.

2. **`@sfos/eslint-config` becomes ESM-native.**
   - `"type": "module"` (was `"commonjs"`).
   - Source files become `.js` (ESM) instead of `.cjs`.
   - Each preset exports a flat-config array as its default export.

3. **Plugin / parser distribution updated to flat-config-native packages.**
   - `typescript-eslint` (combined v8 package) replaces direct deps on
     `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`.
   - `eslint-plugin-import-x` replaces `eslint-plugin-import` for cleaner
     flat-config integration (the original plugin works but with rough
     edges around resolver setup).
   - `@eslint/js` provides `js.configs.recommended`.
   - `globals` provides the Node / browser / ES2022 global sets that
     previously came from `env: { node: true, browser: true, es2022: true }`.

4. **Custom architecture plugin scaffold remains.** Reserves the
   `architecture/*` namespace; rule implementations land incrementally
   (`no-permission-string-literal`, `no-event-type-string-literal`,
   `no-foreign-event-emission`, ...).

5. **`dependency-cruiser` config stays CJS (`.dependency-cruiser.cjs`).**
   It is its own tool; flat config doesn't apply to it. The cross-package
   boundary graph is still enforced there.

## Consequences

### Positive

- We are on ESLint's supported configuration system. No `--use-legacy-config`
  flag; no opt-in environment variable.
- Plugins are imported as actual modules — type-checked, IDE-navigable,
  no string-based plugin loading.
- Flat config arrays are explicit. The merge order is clear; there is no
  hidden `extends` graph to mentally resolve.
- Per-package configs are smaller and import-aware. A reader knows what's
  active by reading the file.
- Migration friction is contained: the architectural-rule scaffold (the
  `architecture/*` plugin namespace) didn't change. Future rule additions
  proceed unchanged.

### Negative

- **No deep merging of rule options.** When the same rule appears in multiple
  config objects in the array, the later one *replaces* the former. We
  re-declare `no-restricted-imports` patterns in the React preset rather than
  inheriting them. Slightly more verbose; explicit beats clever.
- **`globals` package adds a small dep**, replacing the previous `env` config.
  This is the standard flat-config pattern.
- **VSCode ESLint extension** must be a version that supports flat config
  (1.21+ auto-detects). Older versions need
  `"eslint.experimental.useFlatConfig": true` (added to `.vscode/settings.json`
  for safety).
- **No `root: true`.** Flat config doesn't search upward, so the directive
  isn't needed; this was previously a footgun if forgotten.
- **`eslint-plugin-import` migration debt** — we moved to `-x` rather than
  staying on the original. We accept the dependency change because `-x` is
  the flat-config-native maintenance fork; its API is identical for the rules
  we use.

## Alternatives considered

| Option | Why not |
|---|---|
| Downgrade to ESLint 8.x | Maintenance-only; new plugins assume v9; debt grows. |
| Keep `.eslintrc.cjs` with `ESLINT_USE_FLAT_CONFIG=false` | Pins us to a deprecated path; every CI run carries the env-var override; new contributors trip over it. |
| Use only the root flat config (no per-package configs) | Removes per-package overrides; the React preset's UI-specific `no-restricted-imports` wouldn't apply cleanly. Per-package configs are the documented flat-config pattern for monorepos. |
| Use `eslint-plugin-import` (vanilla) | Works in flat config but the resolver setup is awkward and the maintenance signal is weaker than `-x`. |
| Adopt `typescript-eslint` type-checked rules now | Defer — type-aware rules need per-package `parserOptions.project` and noticeably slow the lint pass. Opt in per package later if value emerges. |

## How architectural rules evolve from here

The migration didn't change *what* rules we enforce; it changed *how* they
are configured. The architectural enforcement strategy remains:

1. **dependency-cruiser** — the inter-package graph. Cross-module imports,
   circular dependencies, package→app/module imports. Owns the boundary graph
   because flat config (and ESLint generally) cannot see across package
   boundaries cleanly.

2. **`no-restricted-imports` in flat config presets** — within-file path
   guards (no `**/internal/*`, no `@sfos/db` from UI). Surfaces in the editor.

3. **`@sfos/eslint-config/plugin-architecture`** — reserved namespace for
   project-specific custom rules. Rule implementations land incrementally:
   - `architecture/no-permission-string-literal` (first candidate; needs
     a small AST visitor over imports + member accesses).
   - `architecture/no-event-type-string-literal`.
   - `architecture/no-foreign-event-emission`.
   - `architecture/require-tenant-context`.

   Each new rule ships with tests in `packages/eslint-config/tests/rules/`
   (added when the first rule lands).

4. **Type-aware rules opt-in per package** — when a package needs them,
   it adds `tseslint.configs.recommendedTypeChecked` and configures
   `parserOptions.project` locally. Not all packages need them; opting in
   per package keeps the lint pass fast.

## References

- [ESLint Flat Config documentation](https://eslint.org/docs/latest/use/configure/configuration-files)
- [typescript-eslint v8 release notes](https://typescript-eslint.io/blog/announcing-typescript-eslint-v8)
- [eslint-plugin-import-x](https://github.com/un-ts/eslint-plugin-import-x)
- ADR-0001 (this ADR amends its ESLint-related decisions)
- `packages/eslint-config/` — the migrated package
- `.dependency-cruiser.cjs` — the cross-package boundary graph (unchanged)
