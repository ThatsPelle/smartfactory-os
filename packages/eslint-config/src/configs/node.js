// @ts-check
import globals from 'globals';
import baseConfig from './base.js';

/**
 * Node preset — for server packages and Node-targeted libs
 * (BFF, workers, module server code).
 *
 * @type {import('eslint').Linter.Config[]}
 */
const nodeConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022
      }
    }
  }
];

export default nodeConfig;
