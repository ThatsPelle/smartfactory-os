// @ts-check
import globals from 'globals';
import baseConfig from './base.js';

/**
 * Tests preset — relaxes a few rules that are noisy inside test files
 * (any-casts for mocks, non-null assertions on fixtures, console for
 * diagnostics) while keeping architectural rules strict.
 *
 * Intended scope: files under `tests/`, `__tests__/`, or with `.test.ts`,
 * `.spec.ts` suffixes. Consumers apply this preset with an appropriate
 * `files` glob in their own eslint.config.js.
 *
 * @type {import('eslint').Linter.Config[]}
 */
const testsConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'no-console': 'off'
    }
  }
];

export default testsConfig;
