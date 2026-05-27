# RLS strategy

Row-level security IS the tenant boundary. Application-level filters are
defense in depth, not the primary mechanism.

## Five rules

1. **Every tenant-scoped table has RLS enabled and FORCED.** `FORCE ROW LEVEL
SECURITY` makes the policies apply to the owning role too, which prevents
   a future grant from accidentally creating a hole.
2. **Missing context fails closed.** `app.current_company_id()` returns
   `NULL` when `app.current_company_id` is unset; every `USING` clause
   compares `company_id = app.current_company_id()`, so `NULL = NULL` is
   false and zero rows are returned. Never error, never default.
3. **Writes have `WITH CHECK`.** An `INSERT` or `UPDATE` whose target
   `company_id` does not match the session's binding is rejected with a
   row-level-security violation. The attacker cannot smuggle a row.
4. **The audit table is immutable.** RLS denies tenant `UPDATE`/`DELETE`,
   AND a `BEFORE UPDATE OR DELETE` trigger raises even for the BYPASSRLS
   admin role. Two layers, on purpose.
5. **No SECURITY DEFINER on tenant predicates.** The helper functions run
   as the caller. If the caller cannot read memberships, neither can the
   helper.

## Context propagation

The application sets the session bindings via `SET LOCAL` inside a
transaction. The TS helper that does this is `withTenantContext`. It is
the **only** way to bind context in production code.

`SET LOCAL` is critical: a plain `SET` persists for the connection
lifetime, which would leak across requests on a pooled connection. The
adversarial test `does not leak tenant context across transactions on a
pooled connection` proves this every CI run.

## Why not put RLS in the ORM?

- The ORM is a _client_. A second client (psql, a future Go service, a
  cron job) gets none of those checks.
- A bug in the ORM's query builder bypasses ORM-level filters silently.
  RLS is opaque to the ORM — it cannot bypass what it cannot see.
- Audits do not believe ORM filters. They believe Postgres.

## Role model

Two Postgres roles:

| Role         | `BYPASSRLS`? | Use                                                   |
| ------------ | -----------: | ----------------------------------------------------- |
| `postgres`   |          yes | migrations, the outbox publisher, the test harness    |
| `app_tenant` |           no | every application connection that handles tenant data |

Production rotates the `app_tenant` password out of band. The compose
file's `app_tenant` password (set in migration `0000`) is for local dev
only.

## The `current_user_has` stub

In v1 the function returns `true` iff the current user holds an `owner`
or `admin` membership in the current company. When the full permission
catalog in `@sfos/contracts/permissions` lands, the body of the function
expands to a real lookup against a permissions table — the SQL signature
does not change, so policies referencing it stay stable.

The `_permission` argument is intentionally unused today and intentionally
present. Today's policies pass the future permission name (`'membership.invite'`,
`'module.install'`, …) so they need no SQL change when the body lights up.

## Adding RLS to a new table

Follow the template in `packages/db/drizzle/templates/module-skeleton.sql.template`.
Briefly:

```sql
ALTER TABLE <m>.<t> ENABLE ROW LEVEL SECURITY;
ALTER TABLE <m>.<t> FORCE ROW LEVEL SECURITY;

CREATE POLICY <m>_<t>_select_in_company ON <m>.<t>
  FOR SELECT TO app_tenant
  USING (company_id = app.current_company_id());

CREATE POLICY <m>_<t>_insert_in_company ON <m>.<t>
  FOR INSERT TO app_tenant
  WITH CHECK (
    company_id = app.current_company_id()
    AND app.current_user_has('<m>.<t>.create')
  );

-- UPDATE / DELETE similarly. Both USING and WITH CHECK on UPDATE.
```

Every `WITH CHECK` clause includes the company predicate. Do NOT collapse
it to "trust the FK". The FK enforces referential integrity; RLS enforces
who can write what.
