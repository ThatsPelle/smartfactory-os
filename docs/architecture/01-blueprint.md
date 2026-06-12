# 01 — Platform Blueprint

## Purpose

SmartFactory OS is an open-source industrial operations platform for factories,
workshops, warehouses, and logistics teams. It provides shared platform
primitives and independently owned operational modules without collapsing all
business logic into one application layer.

## Operating Posture

- **Modular monolith first.** One deployment can host many modules, but package,
  schema, manifest, and event boundaries remain explicit.
- **PostgreSQL-first.** PostgreSQL is the persistence engine in cloud,
  self-hosted, and workstation modes.
- **RLS-first tenancy.** Application filters supplement PostgreSQL row-level
  security; they do not replace it.
- **Manifest-driven composition.** A module declares identity, compatibility,
  capabilities, schema ownership, permissions, and events.
- **Capability-driven dependency.** Modules require stable capabilities, not
  concrete module packages.
- **Event-disciplined integration.** Events report completed facts. They do not
  transfer write ownership.

## System Layers

| Layer             | Responsibility                                  | Current implementation |
| ----------------- | ----------------------------------------------- | ---------------------- |
| Contracts         | Stable truth definitions                        | `@sfos/contracts`      |
| Persistence       | Core schema, RLS, audit, outbox                 | `@sfos/db`             |
| Runtime           | Load, resolve, register, initialize, diagnose   | `@sfos/core`           |
| Module contract   | Lifecycle and registry interfaces               | `@sfos/module-sdk`     |
| Event primitives  | Envelope construction and ownership checks      | `@sfos/events`         |
| Business behavior | Module-owned APIs, data, events, permissions    | `modules/module-*`     |
| Runtime hosts     | Compose core plus modules and expose transports | Planned under `apps/`  |

Dependencies point toward stable contracts. Modules never import the core
runtime or another module.

## Deployment Modes

Manifests can declare `cloud`, `self_hosted`, and `workstation` support. These
modes share contracts and PostgreSQL behavior. Packaging, operations, and scale
differ; domain rules do not.

## Current State

Implemented:

- pnpm/Turborepo monorepo and strict TypeScript configuration.
- ESLint v9 and dependency-cruiser enforcement.
- Contracts, events, module SDK, DB foundation, and core runtime.
- IAM module with credentials, sessions, invitations, password reset,
  migrations, and security tests.

Not implemented:

- Runtime applications under `apps/`.
- Initialization wizard.
- Workspace engine.
- First operational vertical slice.
- UI, realtime, automation, AI, and distribution packaging.

## Durable Rules

- Only an owning module writes its operational data.
- Workspaces aggregate visibility; they do not own operational truth.
- AI proposes. Humans approve. Tracked principals execute.
- Structural changes require an ADR.
