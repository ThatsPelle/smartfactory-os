# SmartFactory OS

> A modular industrial operating platform — adaptive, open source, PostgreSQL-first, deployment-agnostic.

**Status:** v0.0.0 — repository bootstrap. No features yet. The architecture is being established before any operational module ships.

---

## What this is

SmartFactory OS is an open-source platform for factories, workshops, warehouses, and logistics operations. It is built as a **modular monolith first** with sharp boundaries that allow service extraction later without rewriting domain logic. It runs in the cloud, on a self-hosted server, or on a single workstation.

The product philosophy in three lines:
- Adaptive over prescriptive — the platform reshapes itself around the company.
- Operational, not administrative — built for the shop floor, not just the back office.
- Dense, not decorative — every pixel earns its place.

## Architecture corpus

Before reading any code, read the architecture. Order matters.

1. [`docs/architecture/01-blueprint.md`](docs/architecture/01-blueprint.md) — product vision + system architecture
2. [`docs/architecture/02-wizard.md`](docs/architecture/02-wizard.md) — initialization wizard
3. [`docs/architecture/03-bounded-contexts.md`](docs/architecture/03-bounded-contexts.md) — domain ownership
4. [`docs/architecture/04-manifest-and-events.md`](docs/architecture/04-manifest-and-events.md) — module contracts + event envelope
5. [`docs/architecture/05-security-iam-rls.md`](docs/architecture/05-security-iam-rls.md) — multi-tenant security
6. [`docs/architecture/06-monorepo.md`](docs/architecture/06-monorepo.md) — repository structure + import discipline
7. [`docs/architecture/07-vertical-slice.md`](docs/architecture/07-vertical-slice.md) — first end-to-end implementation
8. [`docs/architecture/08-bootstrap.md`](docs/architecture/08-bootstrap.md) — execution sequencing

Plus:
- [`ARCHITECTURE.md`](ARCHITECTURE.md) — one-page architecture overview
- [`OWNERSHIP.md`](OWNERSHIP.md) — which directories belong to which domains
- [`AGENTS.md`](AGENTS.md) — guidance for AI assistants working in this repo
- [`docs/adr/`](docs/adr/) — Architecture Decision Records

## Repository layout

```
apps/         Deployable applications (web, bff, gateway, worker, docs)
packages/     Shared libraries (contracts, sdk, ui, db, ...)
modules/      Operational modules (iam, workspace, warehouse, ...)
infra/        Docker, migrations runner, scripts
tools/        Generators, validators (manifest, events, rls), codemods
docs/         Architecture + ADRs + module docs
locales/      Translation files (en, it)
```

Boundary rules:
- **Apps** import from packages and modules.
- **Modules** import from `@sfos/core`, `@sfos/module-sdk`, `@sfos/contracts`, and a few shared packages — never from other modules.
- **Packages** never import from apps or modules.
- **Circular dependencies are forbidden anywhere.**

These rules are enforced by `dependency-cruiser` and ESLint. CI fails on violation.

## Getting started

Prerequisites: Node 20.10+, pnpm 9+, Docker (for Postgres in dev).

```bash
pnpm install            # install workspace dependencies
pnpm typecheck          # verify the type graph
pnpm lint               # lint everything
pnpm validate           # full validation suite (deps + manifests + events + rls + lint + typecheck)
```

The first operational module is targeted by the vertical slice (see `docs/architecture/07-vertical-slice.md`). Until that lands, this repository is intentionally empty of business code — the architecture is being mechanically enforced first.

## License

- Core platform: **AGPL-3.0-or-later**.
- Module SDK (`packages/module-sdk`): **MIT** (encourages third-party module development).

See [`LICENSE`](LICENSE) and [`LICENSE-SDK`](LICENSE-SDK).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Security disclosures: [`SECURITY.md`](SECURITY.md).
