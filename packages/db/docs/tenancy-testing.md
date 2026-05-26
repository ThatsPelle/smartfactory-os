# Tenancy testing

Tests live under `packages/db/tests/`. Every test must describe an
**attacker action** and assert that the platform rejects it. We do not
add happy-path coverage at this layer — those tests belong to the modules
that own the operation.

## What "adversarial" means here

The threat model is **confused-deputy + curious-tenant**. We assume:

- The application code calling into `@sfos/db` is honest.
- The tenant's input to that code may be malicious.
- The DB role used is `app_tenant` (NOBYPASSRLS).

Out of scope (other test layers cover these):

- A malicious app developer with shell access to the DB cluster.
- A compromised admin credential. Operational hardening, not code.

## The seven scenarios

The minimum bar before merging changes to `@sfos/db` or to any RLS-bearing
migration:

1. **Cross-tenant read** — Alice in A reads, gets nothing belonging to B.
2. **Cross-tenant write** — Alice tries to `INSERT` with `company_id = B`,
   gets `42501` (row-level-security violation).
3. **Missing context** — query outside `withTenantContext`, sees zero rows
   and cannot write.
4. **Invalid context** — malformed UUID at the context boundary fails
   loud before reaching SQL.
5. **Audit immutability** — `UPDATE`/`DELETE` on `core.audit_logs` raises,
   even from the admin role (trigger).
6. **Outbox isolation** — admin seeds a row for B; Alice queries outbox
   and sees zero rows.
7. **Pooled-connection leak** — after a transaction binds A, a follow-up
   query on the same client (no transaction) sees NULL context.

All seven are implemented in `tests/adversarial.test.ts`. When you add a
new RLS-bearing table you add a row in each scenario for it.

## Skipping vs failing

When `TEST_DATABASE_URL` is unset the whole suite is `describe.skip`'d
with a visible notice. CI runs that lack a Postgres service do not
silently look green — the skip is loud.

## Running

```bash
# Start the local DB and apply migrations.
pnpm --filter @sfos/db db:up
pnpm --filter @sfos/db db:migrate

# Run once.
pnpm --filter @sfos/db test

# Watch mode for editing tests.
pnpm --filter @sfos/db test:watch
```

The suite is **serial** (`fileParallelism: false`). Tests share tables,
truncate before each test, and would race themselves under parallel
execution.

## Adding a scenario

When you add a new tenant-scoped table:

```ts
it('rejects: enumerating the other tenant\'s <thing>', async () => {
  // 1. Admin seeds a row for company B.
  // 2. Tenant client binds to company A.
  // 3. Tenant queries the table.
  // 4. Expect zero rows.
});

it('rejects: inserting a <thing> attributed to the other tenant', async () => {
  // 1. Tenant binds to A, attempts INSERT with companyId = B.
  // 2. Expect rejects.toThrow(/row-level security|violates row-level/i)
});
```

Two tests, every new table, minimum.
