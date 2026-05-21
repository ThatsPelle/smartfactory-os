// @ts-check
import baseConfig from '@sfos/eslint-config/base';

/**
 * Root ESLint flat config.
 *
 * Each workspace package owns its own `eslint.config.js` and the right preset.
 * This root config exists to catch stray `.ts` / `.js` files that live outside
 * any package (currently none — kept lean) and to declare global ignores.
 *
 * Flat config note: a config object containing ONLY `ignores` becomes a
 * global ignore list. Other objects' `ignores` apply only to their own block.
 *
 * @type {import('eslint').Linter.Config[]}
 */
export default [
  // Repo-wide ignores. Keep narrow; per-package configs cover the rest.
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.turbo/**',
      '**/coverage/**',
      '**/*.generated.*',
      '.changeset/**',
      'pnpm-lock.yaml'
    ]
  },

  // Rules for any TS/JS at the root level (rare; mostly defensive).
  ...baseConfig
];
