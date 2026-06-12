# 06 — Monorepo and Repository Discipline

## Topology

```text
apps/       deployable runtime hosts
packages/   stable shared libraries
modules/    independently owned business contexts
tools/      generators and CI validators
infra/      deployment and migration operations
docs/       architecture, ADRs, plans, and runbooks
```

pnpm workspaces provide package linking. Turborepo runs build, test, lint, and
typecheck tasks.

## Dependency Direction

Allowed:

- Apps import packages and modules.
- Modules import approved packages.
- Packages import lower-level packages declared in package metadata.

Forbidden:

- Package -> app or module.
- Module -> app, another module, or `@sfos/core`.
- App -> another app.
- Circular dependencies.
- Imports from another package’s `dist` or private internals.

Dependency-cruiser enforces the package graph. ESLint surfaces local import
violations and resolves workspace public exports against source in clean
checkouts.

## Package Exports

Consumers import public package roots or declared subpaths. Runtime exports
point to `dist`. Tooling uses TypeScript source mappings only for static
resolution; runtime code does not bypass package exports.

File names and import casing must be identical on Windows and Linux.

## New Code Placement

- Cross-module truth contracts: `packages/contracts`.
- Event construction behavior: `packages/events`.
- Runtime orchestration: `packages/core`.
- Module author contract: `packages/module-sdk`.
- Persistence primitives: `packages/db`.
- Business behavior: owning module.
- CI enforcement: owning tool directory.

Adding a new shared package or dependency edge requires an ADR.

## Module Shape

Every real module includes:

- `package.json`, TypeScript and ESLint config.
- Manifest.
- `MODULE.md` and `OWNERSHIP.md`.
- Server implementation and public contracts.
- Module-owned migrations.
- Events and permissions constants.
- Tests, including tenancy/security coverage where relevant.

Use the module template as a pattern. Its generator command is still planned.

## Validation Pipeline

```text
format:check
lint
typecheck
build
validate:deps
validate:manifests
validate:events
validate:rls
tests
```

Generated `dist`, coverage, Graphify output, local Claude state, and environment
files are not committed.
