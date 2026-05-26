# Local setup

Self-hostable, Docker-based, no cloud lock-in. Roughly five minutes from a
clean checkout to passing adversarial tests.

## Prerequisites

- Docker Engine 20+
- Docker Compose v2 (`docker compose ...`)
- Node 20+
- pnpm 9+

## Step by step

```bash
# 1. From the monorepo root.
cd packages/db

# 2. Local credentials.
cp .env.example .env

# 3. Start Postgres 16 (named volume keeps data across restarts).
pnpm db:up

# 4. Apply migrations using the admin role.
pnpm db:migrate

# 5. Run the adversarial test suite.
pnpm test
```

## What got created

After step 4 the cluster has:

- schemas: `core`, `app`
- extensions: `pgcrypto`
- roles: `postgres` (admin, BYPASSRLS), `app_tenant` (NOBYPASSRLS)
- tables: `core.companies`, `core.users`, `core.memberships`,
  `core.company_modules`, `core.audit_logs`, `core.outbox_events`
- helper functions: `app.current_company_id()`, `app.current_user_id()`,
  `app.current_user_has()`, `app.touch_updated_at()`,
  `app.audit_logs_block_mutation()`
- a `core.audit_logs_block_(update|delete)` trigger pair
- RLS policies on every tenant-scoped table
- a migration ledger at `app.drizzle_migrations`

## psql access

```bash
pnpm db:psql               # admin shell into sfos_dev
```

A handy `app_tenant` shell (for poking at RLS by hand):

```bash
docker compose exec postgres psql 'postgres://app_tenant:app_tenant@localhost:5432/sfos_dev'
```

Inside, bind a tenant:

```sql
BEGIN;
SELECT set_config('app.current_company_id', '<uuid>', true);
SELECT set_config('app.current_user_id',    '<uuid>', true);
SELECT * FROM core.memberships;   -- RLS-filtered
COMMIT;
```

## Resetting

```bash
pnpm db:reset       # docker compose down -v + up — wipes the volume
pnpm db:migrate
```

## Troubleshooting

**"FATAL: password authentication failed for user 'app_tenant'"**
Migration `0000` creates the role on first run. If you started Postgres
before migrating, `app_tenant` doesn't exist yet. Run `pnpm db:migrate`.

**"role 'app_tenant' does not exist" inside the tests**
Same cause as above. Tests apply migrations in `beforeAll`, but only when
`TEST_DATABASE_URL` is set. Check `.env`.

**"connection refused at localhost:5432"**
Check `docker compose ps` — the container may be unhealthy. Logs:
`docker compose logs postgres`. Often a stale volume after a Postgres
major-version bump; `pnpm db:reset` resolves it.

**"port 5432 already allocated"**
Another Postgres on the host. Stop it or change the port mapping in
`docker-compose.yml` (and `.env`).
