# @sfos/eslint-config

Shared **ESLint v9 flat-config** presets for SmartFactory OS. The package owns the architectural lint rules — boundary checks, import discipline, naming conventions.

## Presets

| Preset                      | Use for                                                  |
| --------------------------- | -------------------------------------------------------- |
| `@sfos/eslint-config/base`  | Any package or module (foundation; the others spread it) |
| `@sfos/eslint-config/node`  | Node-targeted libraries (BFF, workers, module server)    |
| `@sfos/eslint-config/react` | React apps + module UI                                   |
| `@sfos/eslint-config/tests` | Test files (relaxes some rules)                          |

Each preset exports a **flat-config array** as its default export.

## Usage

In a package's `eslint.config.js`:

```js
// @ts-check
import nodeConfig from '@sfos/eslint-config/node';

/** @type {import('eslint').Linter.Config[]} */
export default [{ ignores: ['dist/**'] }, ...nodeConfig];
```

For a UI package:

```js
import reactConfig from '@sfos/eslint-config/react';
export default [{ ignores: ['dist/**'] }, ...reactConfig];
```

For a package with both source and tests:

```js
import nodeConfig from '@sfos/eslint-config/node';
import testsConfig from '@sfos/eslint-config/tests';

export default [
  { ignores: ['dist/**'] },
  ...nodeConfig,
  {
    files: ['tests/**', '**/*.test.ts', '**/*.spec.ts'],
    ...testsConfig.at(-1) // pick the rule overrides from the tests preset
  }
];
```

## What it enforces

- **TypeScript discipline**: `no-explicit-any`, `consistent-type-imports`, `no-non-null-assertion`.
- **Import discipline** (via `eslint-plugin-import-x`): no circular imports, no self-imports, no duplicate imports, no useless path segments.
- **Boundary helpers**: `no-restricted-imports` blocks `**/internal/*` and `**/dist/*`. The React preset additionally blocks `@sfos/db` and any `**/server/db/*` from UI code.

The full inter-package boundary enforcement lives in `.dependency-cruiser.cjs` at the repo root — that catches what ESLint can't (cross-package paths).

## Flat config notes

- Configs are **arrays** of objects; spread the preset into your config.
- There is **no `extends`** field. Each preset re-declares everything it needs.
- Rule options **do not merge** across config objects. When the React preset
  needs to extend the base's `no-restricted-imports`, it re-declares the full
  pattern list. Explicit beats clever.
- The `architecture/*` namespace is reserved for project-specific custom rules
  (scaffolded in `src/plugin-architecture.js`; rule implementations land
  incrementally as patterns solidify — see ADR-0002 for the planned set).

## Why these dependency choices

| Dep                               | Why                                                                                                                                                      |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@eslint/js`                      | Provides `js.configs.recommended` for the core JS rules.                                                                                                 |
| `typescript-eslint` (combined v8) | Provides parser + plugin + flat-config presets in one package. Replaces direct deps on `@typescript-eslint/parser` + `@typescript-eslint/eslint-plugin`. |
| `eslint-plugin-import-x`          | Flat-config-native fork of `eslint-plugin-import`. Cleaner integration; same rule names + behavior we use.                                               |
| `globals`                         | Provides the Node / browser / ES2022 global sets that previously came from `env` declarations. Standard flat-config pattern.                             |

See [ADR-0002](../../docs/adr/0002-eslint-v9-flat-config.md) for the full migration rationale.
