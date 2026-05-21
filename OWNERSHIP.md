# Ownership Map

Every directory has an owning domain. This document is the source of truth.

## Top-level

| Path | Owning domain | Stability |
|---|---|---|
| `apps/web/` | Platform | High |
| `apps/bff/` | Platform | High |
| `apps/realtime-gateway/` | Platform (coupled to bff in V1) | Moderate |
| `apps/worker/` | Platform (Phase 2) | Moderate |
| `apps/docs/` | Platform | Low |
| `packages/contracts/` | Platform — trunk | Very high |
| `packages/module-sdk/` | Platform — public contract | Very high |
| `packages/core/` | Platform | Very high |
| `packages/eslint-config/` | Platform | Moderate |
| `packages/tsconfig/` | Platform | Moderate |
| `packages/ui/` | Platform | Moderate |
| `packages/i18n/` | Platform | Moderate |
| `packages/db/` | Platform | High |
| `packages/events/` | Platform | High |
| `modules/module-iam/` | Identity & Access | Independent |
| `modules/module-workspace/` | Workspace Engine | Independent |
| `modules/module-warehouse/` | Warehouse | Independent |
| `modules/module-*` (future) | Per module | Independent |
| `infra/docker/` | Platform / DevOps | Moderate |
| `infra/migrations/` | Platform | High |
| `tools/generators/` | Platform — DX | Moderate |
| `tools/manifest-validator/` | Platform — CI gate | High |
| `tools/event-catalog/` | Platform — CI gate | High |
| `tools/rls-checker/` | Platform — CI gate | High |
| `docs/architecture/` | Platform — canon | High |
| `docs/adr/` | Platform — canon | Append-only |
| `docs/modules/<name>/` | The module's owner | Living |
| `locales/<lang>/` | Community + Platform | Living |

## Ownership rules

1. **One owner per directory.** If a directory needs two owners, it should probably be split.
2. **CODEOWNERS enforces review routing.** Changes to a directory require review by its owner.
3. **Ownership transfers are explicit.** Renaming an owner happens in an ADR + a CODEOWNERS update.
4. **Modules own everything inside them.** `modules/module-warehouse/` is the warehouse team's domain, end to end.

## Data ownership

Data ownership is documented per module in each module's `OWNERSHIP.md`. The platform-level rule:

- Each module owns its Postgres schema (`module_<name>`).
- No module writes to another module's schema.
- Cross-module reads via published views (`<module>_public.*`) or typed APIs.
- The Postgres role per module mechanically enforces this.

## Asking "who owns X?"

1. Find the directory holding X.
2. Read this file (or `CODEOWNERS`).
3. Answer is one line away.

If it takes longer, the ownership map needs an update.
