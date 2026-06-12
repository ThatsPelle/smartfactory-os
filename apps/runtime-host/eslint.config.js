// @ts-check
import nodeConfig from '@sfos/eslint-config/node';
import testsConfig from '@sfos/eslint-config/tests';

/** @type {import('eslint').Linter.Config[]} */
export default [
  { ignores: ['dist/**', '.turbo/**'] },
  ...nodeConfig,
  {
    files: ['tests/**/*.ts', '**/*.test.ts'],
    rules: testsConfig[testsConfig.length - 1].rules
  }
];
