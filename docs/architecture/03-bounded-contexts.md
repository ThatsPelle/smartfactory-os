# 03 — Bounded Contexts and Ownership

## Source-of-Truth Rule

Each business fact has one owner. Other contexts may read published views,
invoke typed APIs, or react to events. They do not write the owner’s tables or
emit the owner’s events.

## Current Contexts

| Context            | Owns                                                                     | Does not own                             |
| ------------------ | ------------------------------------------------------------------------ | ---------------------------------------- |
| Platform contracts | Manifest, envelope, brands, shared keys                                  | Runtime behavior or persistence          |
| Platform DB        | Companies, users, memberships, company modules, audit, outbox            | Module business data                     |
| Core runtime       | Module loading, capability graph, lifecycle, event dispatch, diagnostics | Authentication or operational behavior   |
| IAM                | Credentials, sessions, invitations, password reset                       | Company records or another module’s data |

## Planned Contexts

- **Workspace:** layouts, visibility, saved views, module activation surfaces.
  It does not own warehouse, production, maintenance, or quality records.
- **Warehouse:** items, stock positions, lots, and movements.
- **Production:** orders, operations, execution, and production outcomes.
- **Maintenance:** assets, work orders, failure and maintenance records.

Planned contexts become real only when their module package, manifest,
ownership document, migrations, tests, and validation coverage exist.

## Code Boundaries

- A module is one package under `modules/module-<name>/`.
- Modules may import stable packages such as contracts, events, DB, and the
  module SDK.
- Modules never import another module or `@sfos/core`.
- Apps compose core and modules. The reverse dependency is forbidden.

## Data Boundaries

- Each module owns one PostgreSQL schema, normally `module_<name>`.
- A module migration changes only its own schema.
- Cross-module writes use an owning module API.
- Cross-module reads use typed APIs or explicitly published read-only views.
- Tenant-scoped tables carry `company_id` and use enabled and forced RLS.

IAM is security-sensitive and has platform-scoped tables as well as
tenant-scoped tables. All current IAM tables still have explicit RLS coverage
to fail closed for tenant connections.

## Event Boundaries

- Event type: `<module_namespace>.<entity>.<past_tense_action>`.
- Envelope `source_module` is the full manifest module id.
- The event namespace is derived from the final segment of that id.
- A module declares every produced event in its manifest.
- Consumers treat events as immutable notifications.

## Anti-Corruption

When a context consumes another context:

1. Depend on a capability or published contract.
2. Translate external data into local concepts at the boundary.
3. Do not reuse foreign internal tables or implementation types.
4. Keep retries and idempotency explicit for event handlers.
