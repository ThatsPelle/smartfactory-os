// @ts-check
import nodeConfig from '@sfos/eslint-config/node';
import testsConfig from '@sfos/eslint-config/tests';

/**
 * @sfos/db ESLint config.
 *
 * Production code (src/**) uses the full strictness of the node preset.
 * Tests (tests/**, **\/*.test.ts) layer in the tests preset, which relaxes
 * a couple of rules that are noisy for adversarial fixtures (any-casts for
 * malformed-id probes, non-null assertions on freshly-inserted rows).
 *
 * The tests preset is intentionally narrow — architectural rules
 * (no-restricted-imports, import-x/*) stay on for test files too, so a
 * relaxed lint cannot mask a tenancy bug.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  { ignores: ['dist/**', '.turbo/**', 'drizzle/meta/**'] },
  ...nodeConfig,
  // The tests preset is itself an array; the last element holds the
  // test-specific rule overrides. Constrain to test files only.
  {
    files: ['tests/**/*.ts', '**/*.test.ts'],
    rules: testsConfig[testsConfig.length - 1].rules
  }
];
