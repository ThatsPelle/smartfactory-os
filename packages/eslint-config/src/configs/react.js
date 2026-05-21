// @ts-check
import globals from 'globals';
import baseConfig from './base.js';

/**
 * React preset — for the web app and module UI bundles.
 *
 * UI code must NEVER reach into `@sfos/db` or another module's server/db
 * directly; all data flows through the module's typed API client.
 *
 * Note on `no-restricted-imports`: flat config replaces (not merges) rule
 * options when the same rule is set twice. So this preset duplicates the
 * base patterns and adds the UI-specific ones — explicit beats clever.
 *
 * @type {import('eslint').Linter.Config[]}
 */
const reactConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022
      }
    },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // ---------- Inherited from base (re-declared because flat config
            // replaces rather than merges the rule's options) ----------
            {
              group: ['**/internal/*', '**/internal'],
              message: 'Internal modules are private.'
            },
            {
              group: ['**/dist/*', '**/dist'],
              message: 'Import from the package, not from its build output.'
            },

            // ---------- UI-specific ----------
            {
              group: ['@sfos/db', '@sfos/db/*'],
              message: 'UI code must not access the database directly. Call the module API.'
            },
            {
              group: ['**/server/db/*', '**/server/db'],
              message: "UI code must not import from a module's server/db. Use the module API."
            }
          ]
        }
      ]
    }
  }
];

export default reactConfig;
