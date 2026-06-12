# Migrations

Append-only, numerically-ordered SQL. Drizzle generates table DDL where it
can; everything else (RLS, triggers, functions, role grants, data
migrations) is handwritten.

## Running

```bash
pnpm db:migrate
```

The root command builds module manifests, then the single runner
(`scripts/migrate.ts`) discovers core migrations plus every module migration
directory declared by a built manifest. It connects with
`DATABASE_ADMIN_URL`, records applied migrations in
`app.drizzle_migrations`, and refuses to proceed if a previously-applied
file's content hash has changed.

CI uses the same repository-wide command:

```bash
pnpm db:migrate:test
```

Module migration ledger names are path-namespaced, such as
`module-iam/0001_iam_schema.sql`. Existing core ledger names remain unchanged.

Frozen history contains overlapping core and IAM sequences `0001` through
`0003`. The planner preserves their applied order: all frozen core entries,
then frozen IAM entries. Starting with `0004`, sequence numbers are global and
any duplicate fails before a database connection is opened.

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
(drop, rename, type change) use the _expand-and-contract_ pattern:

1. Add the new shape alongside the old (writers populate both).
2. Backfill.
3. Switch readers to the new shape.
4. Stop writing to the old shape.
5. After a soak period: a separate migration drops the old shape.

Each step is its own migration. Each step can be deployed independently.

## Module ownership

Modules own their manifest namespace. Their migration directory is declared by
`manifest.migrations.directory` and participates in the **global** sequence:

```
packages/db/drizzle/0041_core_add_billing_email.sql
modules/module-crm/src/migrations/0042_crm_init_contacts.sql
packages/db/drizzle/0043_core_add_billing_email.sql
modules/module-wms/src/migrations/0044_wms_init_stock_items.sql
```

A module migration MUST NOT touch `core.*` or another module's schema.
Before execution, the runner inspects schema-qualified `CREATE`, `ALTER`, and
`DROP` targets for schemas, tables, types, functions, indexes, triggers, and
policies. Module schema objects must be qualified with their owned namespace.
Core migrations may mutate only `core.*` and `app.*`.

This is a pragmatic text validator, not a full PostgreSQL parser. It strips
comments, quoted strings, and dollar-quoted bodies. Dynamic SQL and privilege
grants are not interpreted. Review remains required for those constructs.
