# Contributing to SmartFactory OS

Thank you for your interest. This project is a modular industrial platform with strong architectural discipline. Please read this guide before opening a PR.

## Before contributing

1. Read `README.md`.
2. Read at least `ARCHITECTURE.md` and the parts of `docs/architecture/` relevant to your change.
3. Open a discussion (or issue) before non-trivial changes. Architectural changes require an ADR.

## Setup

Prerequisites:
- Node 20.10+
- pnpm 9+
- Docker (for Postgres in dev)

```bash
git clone <repo>
cd smartfactory-os
pnpm install
pnpm validate         # full validation
```

## Branch & PR workflow

- Branch from `main`.
- Name branches `feat/...`, `fix/...`, `docs/...`, `refactor/...`, `adr/...`.
- One PR per logical change.
- PRs must pass CI (lint, typecheck, validate, tests).
- PRs touching architecture require an accompanying ADR.

## Commit messages

Use conventional commits where reasonable:
- `feat(module-warehouse): add lot tracking`
- `fix(iam): correct session expiration check`
- `docs(architecture): clarify event causation rules`
- `refactor(core): extract permission resolver`

## Architectural rules

These are enforced by CI. Don't try to work around them.

- **No cross-module imports.** A module never imports from another module's package.
- **No circular dependencies.** Anywhere.
- **No `any` without comment.** Justify every escape hatch.
- **Every tenant-scoped table has RLS.** Use the migration template's macro.
- **Every state-changing operation emits an event + writes audit.** In the same transaction.
- **Permission keys and event types from constants.** Not string literals.

If a rule blocks something legitimate, write an ADR proposing an exception.

## Adding a module

Use the generator:

```bash
pnpm new:module <kebab-name>
```

The generated module compiles and its skeleton tests pass immediately. Update the manifest, declare your entities, write migrations using the RLS macro, then build out the API.

## Code style

- Prettier formats everything; commits should be `pnpm format`-clean.
- ESLint v9 **flat config** (`eslint.config.js`) enforces architectural rules; commits should be `pnpm lint`-clean. Do not create `.eslintrc.cjs` files — see [ADR-0002](docs/adr/0002-eslint-v9-flat-config.md).
- File size: target 200-400 lines. Refactor at 500+.
- Naming: descriptive, snake_case for DB, camelCase for TS, PascalCase for components.

## Testing

- Unit tests next to code: `*.test.ts`.
- Integration tests in `tests/integration/` per module.
- Tenancy + RLS tests are mandatory for every tenant-scoped table.
- Run `pnpm test` before pushing.

## Security

See [`SECURITY.md`](SECURITY.md). Report vulnerabilities privately.

## Code of conduct

Be respectful, technical, and constructive. We aim for sustainable contribution over hot takes.
