/**
 * SmartFactory OS — dependency-cruiser configuration.
 *
 * This is the mechanical enforcement of the import discipline rules from
 * docs/architecture/06-monorepo.md (Section 7) and 08-bootstrap.md.
 *
 * Every rule here is a boundary that CI rejects on violation.
 *
 * Cardinal rules:
 *   1. Modules MUST NOT import from other modules.
 *   2. Packages MUST NOT import from apps or modules.
 *   3. No circular dependencies.
 *   4. No sub-path imports past a package's `exports`.
 *   5. Apps MUST NOT import from other apps.
 */
module.exports = {
  forbidden: [
    /* ----------------------------------------------------------
     * Circular dependencies — always forbidden, anywhere.
     * ---------------------------------------------------------- */
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'Circular dependencies are forbidden anywhere in the codebase.',
      from: {},
      to: { circular: true }
    },

    /* ----------------------------------------------------------
     * Modules MUST NOT import from other modules.
     * Cross-module access goes through the registry + SDK only.
     * ---------------------------------------------------------- */
    {
      name: 'no-cross-module-imports',
      severity: 'error',
      comment:
        'A module must not import from another module. Cross-module access goes through ' +
        '@sfos/module-sdk and the runtime registry. See docs/architecture/03-bounded-contexts.md.',
      from: { path: '^modules/([^/]+)/' },
      to: {
        path: '^modules/(?!\\1)([^/]+)/',
        pathNot: '^modules/[^/]+/(package\\.json|manifest\\.(ts|json))$'
      }
    },

    /* ----------------------------------------------------------
     * Packages MUST NOT import from apps or modules.
     * Packages are leaf libraries; they cannot depend "up".
     * ---------------------------------------------------------- */
    {
      name: 'no-package-imports-from-apps',
      severity: 'error',
      comment: 'Packages must not depend on apps. Apps are runtimes; packages are libraries.',
      from: { path: '^packages/' },
      to: { path: '^apps/' }
    },
    {
      name: 'no-package-imports-from-modules',
      severity: 'error',
      comment: 'Packages must not depend on modules. Modules sit above packages.',
      from: { path: '^packages/' },
      to: { path: '^modules/' }
    },

    /* ----------------------------------------------------------
     * Modules MUST NOT import from apps.
     * Modules are reused by multiple apps; the dependency is one-way.
     * ---------------------------------------------------------- */
    {
      name: 'no-module-imports-from-apps',
      severity: 'error',
      comment: 'Modules must not depend on apps.',
      from: { path: '^modules/' },
      to: { path: '^apps/' }
    },

    /* ----------------------------------------------------------
     * Apps MUST NOT import from other apps directly.
     * App-to-app communication is via REST/WebSocket, not code imports.
     * ---------------------------------------------------------- */
    {
      name: 'no-cross-app-imports',
      severity: 'error',
      comment: 'Apps must not import each other. Cross-app communication is over the wire.',
      from: { path: '^apps/([^/]+)/' },
      to: { path: '^apps/(?!\\1)([^/]+)/' }
    },

    /* ----------------------------------------------------------
     * Contracts package has NO internal dependencies.
     * It is the trunk of the type tree.
     * ---------------------------------------------------------- */
    {
      name: 'contracts-has-no-internal-deps',
      severity: 'error',
      comment:
        '@sfos/contracts is the foundation; it must not depend on any other @sfos package. ' +
        'The package root eslint.config.{js,mjs,cjs} is a tooling-layer file (consumed only ' +
        'by ESLint, never bundled into the runtime contract surface) so it may pull in ' +
        '@sfos/eslint-config without breaking contracts purity.',
      from: {
        path: '^packages/contracts/',
        pathNot: '^packages/contracts/eslint\\.config\\.(js|mjs|cjs)$'
      },
      to: {
        path: '^(packages|modules|apps)/',
        pathNot: '^packages/contracts/'
      }
    },

    /* ----------------------------------------------------------
     * No orphans — every TS/JS file should be reachable.
     * Surfaces dead code early.
     * ---------------------------------------------------------- */
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Orphan modules indicate dead code or missing wiring.',
      from: {
        orphan: true,
        pathNot: [
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          '\\.d\\.ts$',
          '(^|/)tsconfig\\.json$',
          '(^|/)package\\.json$',
          '(^|/)vitest\\.config\\.[jt]s$',
          '(^|/)eslint\\.config\\.[jt]s$',
          '(^|/)\\.eslintrc\\.cjs$',
          '(^|/)turbo\\.json$',
          '(^|/)manifest\\.ts$'
        ]
      },
      to: {}
    }
  ],

  options: {
    doNotFollow: {
      path: ['node_modules', '\\.turbo', 'dist']
    },
    tsConfig: {
      fileName: 'tsconfig.base.json'
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
      mainFields: ['module', 'main', 'types', 'typings']
    },
    tsPreCompilationDeps: true,
    progress: { type: 'cli-feedback' },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/[^/]+'
      },
      archi: {
        collapsePattern: '^(packages|modules|apps|tools)/[^/]+'
      }
    }
  }
};
