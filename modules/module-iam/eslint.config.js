// @ts-check
import nodeConfig from '@sfos/eslint-config/node';
import testsConfig from '@sfos/eslint-config/tests';

/**
 * @sfos/iam ESLint config.
 *
 * src/** uses the full node preset; tests/** gain the tests preset's
 * relaxations (any/non-null) without losing architectural rules.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  { ignores: ['dist/**', '.turbo/**'] },
  ...nodeConfig,
  {
    files: ['tests/**/*.ts', '**/*.test.ts'],
    rules: testsConfig[testsConfig.length - 1].rules
  }
];
