# Module — __DISPLAY_NAME__

> **One-line summary**: replace this with what the module is for.

This file is read by both humans and AI agents when working on or with this
module. Keep it accurate; out-of-date `MODULE.md` is worse than no `MODULE.md`.

## Purpose

What does this module own? Why does it exist? Two paragraphs maximum.

## Entities

The module owns these entities in schema `__SCHEMA_NAME__`:

| Entity | Description | Owner role |
|---|---|---|
| (table) | (purpose) | (which role primarily mutates) |

## Capabilities provided

| Capability | Notes |
|---|---|
| `__MODULE_NAME__.example@1` | What it lets other modules / widgets / AI do. |

## Capabilities required

| Capability | Hard / Soft |
|---|---|
| `core.tenancy@1` | hard |
| `core.event_bus@1` | hard |

## Events produced

| Event type | Version | When |
|---|---|---|
| `__MODULE_NAME__.entity.action` | `1.0` | When the action happens. |

## Events consumed

| Pattern | Handler | Why |
|---|---|---|
| — | — | — |

## Permissions

| Key | Default roles | What it allows |
|---|---|---|
| `__MODULE_NAME__.entity.read` | admin, supervisor | Reading entity |
| `__MODULE_NAME__.entity.write` | admin | Mutating entity |

## Widgets

| Widget id | Kind | Default size |
|---|---|---|
| (none yet) | — | — |

## Quick start: common modifications

### Add a new entity

1. Create migration in `src/migrations/` using the `create_tenant_table` macro.
2. Add Drizzle schema in `src/server/db/schema.ts`.
3. Declare permissions in `src/server/permissions.ts` + add to manifest.
4. Add event types in `src/server/events.ts` + add to manifest's `events_produced`.
5. Expose API endpoints in `src/server/api/`.
6. Update this MODULE.md.

### Add a widget

1. Implement in `src/ui/widgets/`.
2. Declare in manifest under `widgets` (block added when widgets are first introduced).
3. Update this MODULE.md.

## Boundaries — what this module MUST NOT do

- Write to another module's schema.
- Emit events with a `source_module` that is not this one.
- Import from another module's package.
- Bypass RLS via `SECURITY DEFINER` without explicit review.
- Allow UI to access the database directly.

## See also

- The architecture corpus in `docs/architecture/`.
- `AGENTS.md` (repo root) — conventions for AI agents.
