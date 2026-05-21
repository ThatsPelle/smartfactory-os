// @ts-check
import nodeConfig from './src/configs/node.js';

/**
 * Self-lint for @sfos/eslint-config.
 *
 * The presets it ships are also linted by themselves — uses node preset
 * because the package's files are Node-targeted ESM.
 *
 * Local relative import (`./src/configs/node.js`) used instead of the
 * `@sfos/eslint-config/node` subpath to avoid a self-resolve cycle through
 * the package's `exports` field during install.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  { ignores: ['dist/**', '.turbo/**'] },
  ...nodeConfig
];
