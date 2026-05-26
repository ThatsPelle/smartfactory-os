# @sfos/db

PostgreSQL foundation for SmartFactory OS. Owns:

- the **core schema** (companies, users, memberships, modules, audit, outbox)
- the **RLS predicates** (`app.current_company_id`, `current_user_id`, `current_user_has`)
- the **tenant context** helper (`withTenantContext`)
- the **migration runner** and the discipline around it
- the **local Postgres** via `docker-compose.yml`

It does **not** own:

- any business logic
- any module logic
- any UI concern
- the runtime event bus (only the outbox table that feeds it)

The DB layer is intentionally thin. Modules consume it; they do not extend it.

## Quick start

```bash
cp packages/db/.env.example packages/db/.env   # local dev creds
pnpm --filter @sfos/db db:up                    # start Postgres 16
pnpm --filter @sfos/db db:migrate               # apply all migrations
pnpm --filter @sfos/db test                     # run adversarial tests
```

See [`docs/local-setup.md`](./docs/local-setup.md) for the long version.

## Public surface

```ts
import {
  createTenantClient,
  withTenantContext,
  schema
} from '@sfos/db';

const client = createTenantClient(process.env.DATABASE_URL!);

await withTenantContext(
  client.db,
  { companyId, userId },
  async (tx) => {
    // Every query inside this callback is RLS-bound to `companyId`.
    return tx.select().from(schema.memberships);
  }
);
```

There is intentionally no `createAdminClient` re-exported from the package
root. Admin reaches modules through a separate subpath (`@sfos/db/client`)
that future dependency-cruiser rules will deny to module code.

## Topics

- [RLS strategy](./docs/rls.md) — what the predicates mean and why
- [Migration discipline](./docs/migrations.md) — append-only, hybrid drizzle + handwritten
- [Tenancy testing](./docs/tenancy-testing.md) — adversarial-first tests
- [Local setup](./docs/local-setup.md) — docker, env, troubleshooting

## What lives where

```
packages/db/
├── docker-compose.yml         # local Postgres 16
├── drizzle.config.ts          # drizzle-kit knobs
├── .env.example
│
├── drizzle/                   # SQL migrations (append-only)
│   ├── 0000_init_schemas.sql        — schemas, extensions, app_tenant role
│   ├── 0001_core_tables.sql         — companies/users/memberships/...
│   ├── 0002_app_rls_helpers.sql     — RLS predicate functions
│   ├── 0003_rls_policies.sql        — policies + audit immutability triggers
│   └── templates/                   — module migration starting point
│
├── scripts/
│   └── migrate.ts             # admin-role migration runner
│
├── src/
│   ├── index.ts               # public surface
│   ├── client.ts              # tenant + admin client factories
│   ├── context.ts             # withTenantContext / withSystemContext
│   ├── env.ts                 # central env access
│   └── schema/                # Drizzle TS table definitions
│
└── tests/
    ├── helpers.ts             # seed, reset, migration apply
    └── adversarial.test.ts    # cross-tenant attacks (must fail)
```
