# ADR-0001: Monorepo, pnpm, Turborepo, dependency-cruiser

- **Status:** accepted
- **Date:** 2026-05-20
- **Supersedes:** none

## Context

SmartFactory OS is a modular monolith composed of:

- Shared **packages** (contracts, SDK, UI, db, ...).
- Operational **modules** (warehouse, production, maintenance, ...) — each its own package.
- Deployable **apps** (web, BFF, gateway, ...).

The architecture corpus (`docs/architecture/`) requires:

- **Strict module boundaries**, mechanically enforced. A module must not be able to import another module's internals.
- **Atomic changes** across modules when SDK contracts evolve.
- **Shared tooling** — one ESLint, one tsconfig, one CI.
- **Independent module versioning** (Changesets-friendly).
- **Solo-developer manageable** — no bespoke build system to maintain.

We need a repository topology and toolchain that delivers these from commit 1, before any feature lands.

## Decision

1. **Monorepo** containing apps, packages, and modules in one git repository.
2. **pnpm workspaces** as the package manager.
   - Strict by default (no undeclared dependencies, no phantom hoisting).
   - `node-linker=isolated` keeps each workspace's `node_modules` clean.
   - `workspace:*` protocol for internal references.
3. **Turborepo** as the task orchestrator.
   - `turbo.json` declares the task graph: `build`, `test`, `lint`, `typecheck`, `validate`.
   - Local cache from commit 1; remote cache introduced when CI volume warrants (deferred).
4. **TypeScript** with strict settings (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `useUnknownInCatchVariables`).
   - One canonical `tsconfig.base.json` at the repo root; `@sfos/tsconfig` package re-exports variants (`base`, `lib`, `node`, `app`, `react`).
5. **dependency-cruiser** enforces the inter-package graph.
   - Forbidden patterns codified in `.dependency-cruiser.cjs`: no cross-module imports, no packages importing apps/modules, no circular deps, no `dist/` imports.
   - CI fails on violation.
6. **ESLint** enforces within-file architectural rules.
   - Shared config at `@sfos/eslint-config` with `base`/`node`/`react`/`tests` presets.
   - Custom plugin `@sfos/eslint-config/plugin-architecture` scaffolded for project-specific rules (added incrementally).

## Consequences

### Positive

- A boundary violation is a build failure, not a code-review finding.
- Refactoring across modules is atomic — one PR, one history.
- Shared tooling means new contributors learn one stack, not five.
- Service extraction later is a transport change, not a repo split.
- AI agents have a predictable structure to navigate and copy from.

### Negative

- pnpm strict mode is unforgiving when third-party packages omit declared peers. We accept the upfront friction; the alternative (silent transitive imports) is worse.
- Turborepo cache invalidation requires care with cache inputs. Defaults are conservative; we will revisit if cache hits drop.
- One large repo means CI runs more on each PR. Mitigated by Turborepo task filtering + per-package incremental builds.

## Alternatives considered

| Option                                        | Why not                                                                                                                                                                                 |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Polyrepo** (one repo per module)            | Atomic SDK changes become a multi-PR dance across N repos. Boundary enforcement weaker; community modules become disconnected.                                                          |
| **npm workspaces**                            | Phantom dependencies in hoisting; less strict than pnpm; slower install.                                                                                                                |
| **yarn (classic) workspaces**                 | Project unmaintained for our needs; Berry adds more friction than it removes.                                                                                                           |
| **Nx**                                        | More powerful than Turborepo but heavier; generators and plugin ecosystem add cognitive load disproportionate to benefit at this scale. Revisit if the project grows past ~50 packages. |
| **Bazel / Buck**                              | Excellent for hundreds of engineers; punishing for a solo developer; weak TypeScript ergonomics.                                                                                        |
| **No dependency-cruiser** (rely on lint only) | ESLint can't see cross-package paths cleanly; we need a graph-aware tool.                                                                                                               |

## References

- `docs/architecture/06-monorepo.md` — full monorepo design.
- `docs/architecture/08-bootstrap.md` — execution sequencing.
- `.dependency-cruiser.cjs` — encoded boundary rules.
- `turbo.json` — task graph.
- `tsconfig.base.json` — strict TS settings.
