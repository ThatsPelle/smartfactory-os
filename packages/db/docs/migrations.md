# Migrations

Append-only, numerically-ordered SQL. Drizzle generates table DDL where it
can; everything else (RLS, triggers, functions, role grants, data
migrations) is handwritten.

## Running

```bash
pnpm --filter @sfos/db db:migrate
```

The runner (`scripts/migrate.ts`) connects with `DATABASE_ADMIN_URL`,
records applied migrations in `app.drizzle_migrations`, and refuses to
proceed if a previously-applied file's content hash has changed.

## Adding a migration

1. Decide the **scope**: platform-core (this package) or module-owned.
2. Pick the next sequence number across the whole monorepo. Numbers are
   global; modules don't get their own counter.
3. Choose a description (`snake_case`, verb + noun).
4. Write SQL. Wrap in a `BEGIN; ... COMMIT;` so a failure rolls back.
5. Test locally: `pnpm db:reset && pnpm db:migrate && pnpm test`.

## Hybrid: generated + handwritten

`drizzle-kit generate` produces SQL for additive schema changes (new
columns, new tables, new enums). Diff its output before committing — never
auto-accept. Drizzle does not understand RLS, triggers, or grants, so
those go in handwritten migrations placed adjacent in the sequence.

Convention: when a Drizzle-generated migration would alter an
RLS-enabled table, append a handwritten migration immediately after it
that adjusts policies if needed.

## Append-only philosophy

Once a migration is on `main`, it is frozen. If it is wrong:

- Add a new migration that forward-fixes the state.
- Do **not** edit the old file. The runner will refuse — content hash
  changed — but more importantly, every environment past that migration
  cannot re-run it.

## Rollback

The platform does not support automatic rollback. For destructive changes
(drop, rename, type change) use the *expand-and-contract* pattern:

1. Add the new shape alongside the old (writers populate both).
2. Backfill.
3. Switch readers to the new shape.
4. Stop writing to the old shape.
5. After a soak period: a separate migration drops the old shape.

Each step is its own migration. Each step can be deployed independently.

## Module ownership

Modules own their schemas (`crm.*`, `wms.*`, …). Their migrations live
under `modules/<name>/db/migrations/` but participate in the **global**
sequence:

```
packages/db/drizzle/0001_core_tables.sql
modules/crm/db/migrations/0042_crm_init_contacts.sql
packages/db/drizzle/0043_core_add_billing_email.sql
modules/wms/db/migrations/0044_wms_init_stock_items.sql
```

A future tool collects all migration files across the workspace and feeds
them to the runner in sequence. Until that tool exists, modules are not
yet shipped, and `packages/db/drizzle/` is the only source.

A module migration MUST NOT touch `core.*` or another module's schema.
`dependency-cruiser` enforces this at the code level; the migration runner
will gain a SQL-level check later (parses `ALTER`/`DROP` targets).
