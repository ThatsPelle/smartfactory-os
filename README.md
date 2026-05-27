# SmartFactory OS

> Open-source modular industrial operations platform for factories, workshops, warehouses, and operational teams.

**Status:** Early foundation phase — core runtime, IAM module, and platform primitives are implemented. Architecture-first. Not production-ready.

---

## What this is

SmartFactory OS is an open-source platform for factories, workshops, warehouses, and logistics operations. It is built as a **modular monolith first** with sharp boundaries that allow service extraction later without rewriting domain logic. It runs in the cloud, on a self-hosted server, or on a single workstation.

The product philosophy in three lines:
- Adaptive over prescriptive — the platform reshapes itself around the company.
- Operational, not administrative — built for the shop floor, not just the back office.
- Dense, not decorative — every pixel earns its place.

---

## Why this project exists

Industrial software is often rigid, expensive, closed, and outdated. ERP systems are monolithic and assume a fixed process. Warehouse tools are islands. Factory MES software is vendor-locked and treats developer access as a risk.

SmartFactory OS aims for:
- **Modularity** — operational domains are independent and composable.
- **Operational density** — everything the floor needs, nothing it doesn't.
- **Self-hosting** — runs on a single machine or a cluster, without cloud lock-in.
- **Modern developer experience** — TypeScript-first, manifest-driven, testable at every layer.

---

## Core principles

- **PostgreSQL-first.** One database engine across all deployment modes. No ORM abstraction replaces SQL where SQL is the right tool.
- **RLS as security floor.** Row-level security is not optional. Every tenant-scoped table has `FORCE ROW LEVEL SECURITY`. The database rejects unauthorized access even if application code is wrong.
- **Modular monolith first.** One deployable artifact; many logical modules. Service extraction is a transport change, not a redesign.
- **Modules own their domains.** Each module owns its Postgres schema, its migrations, its events. No cross-module writes. No shared mutable state.
- **Capability-driven dependencies.** Modules depend on capabilities (`iam.auth@1`), not on other modules by name.
- **Events notify, they do not secretly mutate.** The event envelope is frozen. Only the owning module mutates its data. Events are read-only signals for everyone else.
- **AI assists, it does not become source of truth.** AI proposes; humans approve; automation executes via tracked principals.

---

## Current foundation

| Area | Status |
|---|---|
| pnpm + Turborepo monorepo | ✅ Stable |
| ESLint v9 Flat Config | ✅ Stable |
| `dependency-cruiser` architecture enforcement | ✅ Active |
| `@sfos/tsconfig` | ✅ Stable |
| `@sfos/eslint-config` | ✅ Stable |
| `@sfos/contracts` — branded types, Result<T,E>, manifest schema, event envelope | ✅ Stable |
| `@sfos/events` — event builder, ULID ids, naming helpers | ✅ Stable |
| `@sfos/module-sdk` — ModuleLifecycle, defineManifest, context interfaces | ✅ Stable |
| `@sfos/db` — PostgreSQL/RLS/audit/outbox foundation, withTenantContext | ✅ Stable |
| `@sfos/core` — runtime bootstrap, event bus, lifecycle engine, module registry | ✅ Stable |
| `module-iam` — auth, sessions, invitations, password reset, manifest, adversarial tests | ✅ Complete |

---

## Architecture

Before reading code, read the architecture index: [`docs/architecture/README.md`](docs/architecture/README.md).

For a one-page overview: [`ARCHITECTURE.md`](ARCHITECTURE.md).

Supporting docs:
- [`AGENTS.md`](AGENTS.md) — guidance for AI assistants working in this repository
- [`OWNERSHIP.md`](OWNERSHIP.md) — which directories belong to which domains
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — contribution process
- [`docs/adr/`](docs/adr/) — Architecture Decision Records

---

## Repository layout

```
apps/         Deployable applications (web, BFF, gateway, worker)
packages/     Shared libraries (contracts, module-sdk, db, events, core, ...)
modules/      Operational modules (module-iam, ...)
infra/        Docker, migration runner, deployment scripts
tools/        Generators, validators, codemods
docs/         Architecture docs, ADRs, module docs
locales/      Translation files (en, it)
```

**Boundary rules (enforced by dependency-cruiser and ESLint, CI fails on violation):**
- Apps import from packages and modules.
- Modules import from `@sfos/module-sdk`, `@sfos/contracts`, `@sfos/db`, `@sfos/events` — never from `@sfos/core` and never from other modules.
- Packages never import from apps or modules.
- Circular dependencies are forbidden everywhere.

---

## Development

Prerequisites: Node 20.10+, pnpm 9+, Docker (for Postgres in integration tests).

```bash
pnpm install              # install workspace dependencies
pnpm typecheck            # verify the full type graph
pnpm lint                 # lint all packages and modules
pnpm build                # build all packages
pnpm validate:deps        # dependency-cruiser architecture check
pnpm validate             # full validation suite (deps + manifests + events + rls + lint + typecheck)
```

Running module tests:

```bash
pnpm --filter @sfos/iam test      # unit tests (no DB required)
pnpm --filter @sfos/core test     # runtime unit tests

# Integration and adversarial tests require a live database:
TEST_DATABASE_URL=postgres://... pnpm --filter @sfos/iam test
```

Integration tests skip cleanly with `describe.skipIf(!TEST_DATABASE_URL)` — they are never deleted.

---

## Security

- No secrets, tokens, or credentials belong in this repository. `.env` files are gitignored.
- Local tooling state (`.claude/settings.local.json`, `.claude/worktrees/`) is gitignored.
- RLS is the primary tenancy boundary — every module-owned table has `FORCE ROW LEVEL SECURITY`.
- `module-iam` includes mandatory adversarial tests: brute-force lockout, no user enumeration, concurrent accept races, single-use token enforcement.
- Security disclosures: [`SECURITY.md`](SECURITY.md).

---

## Roadmap

1. **Foundation stabilization** — monorepo, core runtime, module SDK *(done)*
2. **IAM module** — authentication, sessions, invitations, password reset *(done)*
3. **Workspace engine** — tenant workspace orchestration, module activation
4. **First vertical slice** — auth + workspace + one operational module end-to-end
5. **Warehouse module** — inventory, movements, stock events
6. **UI / workbench** — operator interface, module widget system
7. **Self-host distribution** — single-binary / Docker Compose deployment

---

## License

- Core platform: **AGPL-3.0-or-later** — see [`LICENSE`](LICENSE).
- Module SDK (`packages/module-sdk`): **MIT** — encourages third-party module development.
