// @ts-check
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importX, { createNodeResolver } from 'eslint-plugin-import-x';
import { createTypeScriptImportResolver } from 'eslint-import-resolver-typescript';
import architecturePlugin from '../plugin-architecture.js';

// Extensions list — mirrors what `importX.flatConfigs.typescript` ships.
const TS_EXTENSIONS = ['.ts', '.tsx', '.cts', '.mts'];
const ALL_EXTENSIONS = [...TS_EXTENSIONS, '.js', '.jsx', '.cjs', '.mjs'];

// Resolve monorepo root from this file's location so project globs work
// regardless of which package's CWD ESLint runs in (turbo invokes per-package).
const MONOREPO_ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const toPosix = (/** @type {string} */ p) => p.split(path.sep).join('/');
const TS_PROJECT_GLOBS = [
  toPosix(path.join(MONOREPO_ROOT, 'packages/*/tsconfig.json')),
  toPosix(path.join(MONOREPO_ROOT, 'apps/*/tsconfig.json')),
  toPosix(path.join(MONOREPO_ROOT, 'modules/*/tsconfig.json')),
  toPosix(path.join(MONOREPO_ROOT, 'tools/*/*/tsconfig.json'))
];

/**
 * Base flat-config preset.
 *
 * Used by every other preset (node, react, tests) and by every package's
 * own eslint.config.js. Composed by spreading into a flat-config array.
 *
 * Layering vs legacy `extends`:
 *   - In flat config, configs are an *array* of objects, evaluated in order.
 *   - A later config object's rule entry REPLACES an earlier one (no deep
 *     merge of rule options). The presets below ship `no-restricted-imports`
 *     with the full pattern list inline rather than relying on merge.
 *
 * @type {import('eslint').Linter.Config[]}
 */
const baseConfig = [
  // 1. ESLint's recommended core rules.
  js.configs.recommended,

  // 2. typescript-eslint's recommended set (non-type-checked for speed).
  //    Type-aware rules are opt-in per package via `recommendedTypeChecked`.
  ...tseslint.configs.recommended,

  // 3. Import discipline — flat-config-native variant of eslint-plugin-import.
  importX.flatConfigs.recommended,

  // 3a. TypeScript-aware resolver wiring.
  //
  // `importX.flatConfigs.typescript` ships:
  //     'import-x/resolver': { typescript: true }
  // which is the LEGACY resolver shorthand. import-x's loader tries
  // `require('eslint-import-resolver-typescript')`, fails over to
  // `require('typescript')` (the compiler), then validates the interface
  // and throws:
  //     "typescript with invalid interface loaded as resolver"
  //
  // import-x v4 prefers the new v3-interface resolver via
  // `import-x/resolver-next`. We pair:
  //   - `createTypeScriptImportResolver` → TS-aware: follows package.json
  //     `exports`, maps `.js` import specifiers to `.ts` sources (NodeNext),
  //     resolves workspace `@sfos/*` packages through the pnpm symlinks.
  //   - `createNodeResolver` → plain-JS fallback for `.cjs`/`.mjs` config
  //     files (e.g. this package's own .js sources).
  //
  // Project globs are absolute (computed from MONOREPO_ROOT) so resolution
  // works regardless of the CWD turbo runs ESLint in.
  {
    name: '@sfos/eslint-config/typescript-resolver',
    settings: {
      'import-x/extensions': ALL_EXTENSIONS,
      'import-x/external-module-folders': ['node_modules', 'node_modules/@types'],
      'import-x/parsers': {
        '@typescript-eslint/parser': TS_EXTENSIONS
      },
      'import-x/resolver-next': [
        createTypeScriptImportResolver({
          alwaysTryTypes: true,
          project: TS_PROJECT_GLOBS,
          // The resolver picks the best-matching tsconfig per source file;
          // the multi-project notice is informational, not a defect.
          noWarnOnMultipleProjects: true
        }),
        createNodeResolver()
      ]
    },
    rules: {
      // Mirrors `importX.flatConfigs.typescript` — `named` is redundant with
      // typescript-eslint's own checking and produces false positives on
      // re-exports through .d.ts files.
      'import-x/named': 'off'
    }
  },

  // 4. SmartFactory OS architecture plugin (scaffold; rules added incrementally).
  {
    plugins: {
      architecture: architecturePlugin
    }
  },

  // 5. Project rules — SmartFactory OS discipline layered on top of recommended.
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      }
    },
    rules: {
      // ---------- TypeScript ----------
      '@typescript-eslint/no-explicit-any': [
        'error',
        { fixToUnknown: true, ignoreRestArgs: false }
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' }
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // ---------- Hygiene ----------
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'error',
      'no-throw-literal': 'error',
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],

      // ---------- Import discipline ----------
      // dependency-cruiser owns the inter-package boundary graph; these rules
      // surface within-file violations inline in the editor.
      'import-x/no-default-export': 'off',
      'import-x/no-cycle': ['error', { maxDepth: 10 }],
      'import-x/no-self-import': 'error',
      'import-x/no-useless-path-segments': 'error',
      'import-x/no-duplicates': 'error',

      // ---------- Boundary helpers ----------
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/internal/*', '**/internal'],
              message:
                "Internal modules of a package are private. Use the package's public exports."
            },
            {
              group: ['**/dist/*', '**/dist'],
              message: 'Import from the package, not from its build output.'
            }
          ]
        }
      ]
    }
  }
];

export default baseConfig;
