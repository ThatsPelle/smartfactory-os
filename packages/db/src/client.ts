import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import * as schema from './schema/index.js';

/**
 * Connection factory.
 *
 * Two roles, two factories, on purpose:
 *
 *   - `createTenantClient` connects as the `app_tenant` Postgres role. That
 *     role does NOT have BYPASSRLS. Every query is subject to RLS. This is
 *     the ONLY client tenant-facing code is allowed to import.
 *
 *   - `createAdminClient` connects as the superuser. Used for migrations and
 *     for the adversarial test harness (which must be able to seed
 *     cross-tenant rows so it can later attack them). NEVER reachable from
 *     module or app code in production.
 *
 * dependency-cruiser enforces this separation — see the
 * `no-admin-client-from-modules` rule (added when modules land).
 */

export type SfosDb = PostgresJsDatabase<typeof schema>;

export interface SfosClient {
  readonly db: SfosDb;
  readonly sql: Sql;
  /** Closes the underlying connection pool. Call on shutdown. */
  readonly close: () => Promise<void>;
}

interface ClientOptions {
  /** Optional pool size override. Drizzle/postgres.js default is 10. */
  readonly max?: number;
  /** Optional connection idle timeout in seconds. */
  readonly idleTimeout?: number;
}

const buildClient = (url: string, opts: ClientOptions): SfosClient => {
  const sql = postgres(url, {
    max: opts.max ?? 10,
    idle_timeout: opts.idleTimeout ?? 30,
    // Force UTC at the session level so timestamptz read/write round-trips
    // without timezone surprises.
    connection: { timezone: 'UTC' },
    // The library otherwise prints noisy debug to stderr on bad params.
    onnotice: () => undefined
  });
  const db = drizzle(sql, { schema });
  return {
    db,
    sql,
    close: async () => {
      await sql.end({ timeout: 5 });
    }
  };
};

/**
 * Build a tenant-bound client. RLS-enforced.
 *
 * Use {@link withTenantContext} (see ./context.ts) to bind a request's
 * company/user to a transaction before issuing tenant-scoped queries.
 */
export const createTenantClient = (url: string, opts: ClientOptions = {}): SfosClient =>
  buildClient(url, opts);

/**
 * Build an admin client. BYPASSRLS. Migrations and adversarial tests only.
 *
 * Production app code MUST NOT import this. If you find yourself needing it
 * outside of migrations or tests, your design is wrong — push the work back
 * through the tenant context.
 */
export const createAdminClient = (url: string, opts: ClientOptions = {}): SfosClient =>
  buildClient(url, opts);
