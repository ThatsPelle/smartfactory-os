// @ts-check
import baseConfig from './configs/base.js';
import nodeConfig from './configs/node.js';
import reactConfig from './configs/react.js';
import testsConfig from './configs/tests.js';
import architecturePlugin from './plugin-architecture.js';

/**
 * @sfos/eslint-config — entry point.
 *
 * Consumers should import a specific preset by subpath rather than from this
 * barrel:
 *
 *   import nodeConfig from '@sfos/eslint-config/node';
 *
 * The named exports below exist for tooling that introspects the package
 * (manifest validators, doc generators).
 */
export {
  baseConfig as base,
  nodeConfig as node,
  reactConfig as react,
  testsConfig as tests,
  architecturePlugin as architecture
};

export default {
  base: baseConfig,
  node: nodeConfig,
  react: reactConfig,
  tests: testsConfig,
  plugins: {
    architecture: architecturePlugin
  }
};
