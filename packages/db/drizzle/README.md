# Migrations

Append-only SQL migrations for `@sfos/db`. Read top-to-bottom is the install order.

## Naming

```
NNNN_<scope>_<description>.sql
```

- `NNNN` — zero-padded sequence, append-only. Never reuse a number, never edit a merged migration.
- `<scope>` — `init`, `core`, `app`, `rls`, or a module id once modules land.
- `<description>` — `snake_case`. Short. Verb + noun preferred (`add_companies`, `enable_rls`).

Examples:

```
0000_init_schemas.sql
0001_core_tables.sql
0002_app_rls_helpers.sql
0003_rls_policies.sql
```

## Hybrid: generated + handwritten

| What                                                        | How                                       |
| ----------------------------------------------------------- | ----------------------------------------- |
| Tables, columns, FKs, indexes, enums                        | `drizzle-kit generate` from `src/schema/` |
| `SET LOCAL` helpers, `CREATE POLICY`, immutability triggers | Handwritten SQL                           |
| Backfills, data migrations                                  | Handwritten SQL                           |
| Postgres extensions, role creation                          | Handwritten SQL                           |

drizzle-kit overwrites generated migrations on regeneration. Handwritten
migrations are filed next to generated ones in the same sequence and are
never regenerated.

## Append-only philosophy

A migration that has been merged to `main` is immutable. If it was wrong:

1. Add a new migration that _forward-fixes_ it.
2. Do NOT edit the merged file.

Rationale: any environment past the broken migration cannot re-run it. The
forward-fix is the only path that keeps every environment converging.

Rollback strategy: every destructive migration (DROP, RENAME, type change)
must be preceded by a deprecation migration that adds a parallel column /
table and a code change that writes to both. Roll forward by removing the
old one once code has caught up. The platform does **not** support
auto-rollback.

## Module ownership

When a module adds a migration:

- The file lives under the module's package: `modules/<name>/db/migrations/`.
- Filename prefix is the global sequence (so `0042_crm_add_contacts.sql`),
  not a module-local sequence. This keeps a single linear order.
- The migration creates objects under its module's schema (`crm.*`), not
  under `core.*`.

`core.*` is platform-owned. Modules **may not** modify or extend it.
