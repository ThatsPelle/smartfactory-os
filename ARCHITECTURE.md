# SmartFactory OS — Architecture at a Glance

This is the one-page summary. The full corpus is in `docs/architecture/`.

## Posture

- **Modular monolith first.** One deployable artifact; many logical modules. Service extraction is a transport change, not a redesign.
- **PostgreSQL-first.** One database engine across every deployment mode (cloud / self-hosted / workstation). RLS is the primary tenancy boundary.
- **Workspace-centric, not module-centric.** The user's reality is the workspace; modules own the data the workspace surfaces.
- **Manifest-driven.** Every module declares its contract in a manifest. The platform builds itself from manifests.
- **Capability-driven dependencies.** Modules depend on capabilities (`warehouse.inventory_tracking@1`), not on other modules by name. Alternative providers can satisfy the same capability.
- **Event-disciplined.** Events notify; only owning modules mutate. Standard envelope, versioned payloads, append-only outbox.
- **AI as proposer, automation as principal.** AI proposes; humans approve; automation executes via APIs as a tracked service principal.

## The seven boundaries

1. **Tenancy** — every row carries `company_id`; every tenant-scoped table has RLS.
2. **Module schemas** — each module owns its Postgres schema; per-module DB role grants prevent cross-schema writes.
3. **Module packages** — each module is its own pnpm package; cross-module code imports are mechanically forbidden.
4. **Manifest** — the module's published contract (events, permissions, capabilities, widgets, routes).
5. **Event envelope** — frozen v1 structure; carries `correlation_id`, `causation_id`, `company_id`, `emitted_by`.
6. **Permission catalog** — dotted keys (`<scope>.<resource>.<action>`); modules contribute; IAM owns assignment.
7. **Workspace metadata** — workspaces own layouts, never operational data.

## Stability tiers

| Tier | Examples | Change cost |
|---|---|---|
| Trunk | tenancy, IAM, event bus | very high |
| Engine | workspace engine, audit sink, notifications | high |
| Modules | warehouse, production, … | independent |
| Module SDK | the plugin contract | high |
| Infrastructure | storage, queue, gateway | moderate |

## What is intentionally absent

This repository starts with **discipline and contracts**, not features. The first vertical slice (see `docs/architecture/07-vertical-slice.md`) brings auth + workspaces + one operational module end-to-end. Until then: no business logic, no UI polish, no realtime, no AI, no automation.

## How decisions get recorded

See [`docs/adr/`](docs/adr/). Every structural decision lands as an ADR. ADRs are numbered, dated, never deleted (superseded only).
