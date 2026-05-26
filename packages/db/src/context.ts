import { CompanyIdSchema, UserIdSchema, type CompanyId, type UserId } from '@sfos/contracts';
import { sql } from 'drizzle-orm';

import type { SfosDb } from './client.js';

/**
 * Tenant context.
 *
 * Every tenant-facing operation MUST run inside `withTenantContext`. The
 * helper wraps the work in a transaction and stamps two session GUCs:
 *
 *   - `app.current_company_id`  → read by `app.current_company_id()` SQL fn
 *   - `app.current_user_id`     → read by `app.current_user_id()`
 *
 * Properties this gives us:
 *
 *   - **Explicit:** no global mutable state. The context is the function
 *     argument; what RLS sees is exactly what the caller passed.
 *   - **Scoped:** `SET LOCAL` lifetimes equal the transaction's, so the
 *     context can't leak between requests on a pooled connection.
 *   - **Testable:** adversarial tests use this helper to attack tenants;
 *     production code uses the exact same path.
 *   - **Fail-closed:** when context is missing, RLS sees NULL and denies
 *     every row — no need to validate "did someone forget to set it".
 *
 * Why a transaction at all? Two reasons:
 *
 *   1. `SET LOCAL` only applies inside a transaction. Outside one, it is a
 *      no-op that silently sets the session value — which would leak.
 *   2. Tenant operations almost always span >1 statement and want
 *      transactional atomicity anyway.
 */

export interface TenantContext {
  readonly companyId: CompanyId;
  readonly userId: UserId;
}

export interface SystemContext {
  /**
   * Tag-only branding for the admin/migrations callback shape. The system
   * context does NOT set any session GUCs — the caller must be connected
   * with the BYPASSRLS admin role for it to bypass RLS.
   */
  readonly kind: 'system';
}

/**
 * Run `fn` with the given tenant bound to the transaction's RLS predicates.
 *
 * `fn` receives the transaction-scoped Drizzle client; further queries on
 * that client inherit the context. Queries issued on the top-level `db`
 * (outside `fn`) do NOT inherit the context — RLS denies them.
 */
export const withTenantContext = async <T>(
  db: SfosDb,
  ctx: TenantContext,
  fn: (tx: SfosDb) => Promise<T>
): Promise<T> => {
  // Validate at the boundary. A malformed id at this point either reflects
  // a misconfigured caller or a probing attacker — fail loud before opening
  // a connection.
  const companyId = CompanyIdSchema.parse(ctx.companyId);
  const userId = UserIdSchema.parse(ctx.userId);

  return db.transaction(async (tx) => {
    // Two separate statements (not one chained SET) so a malformed value
    // surfaces with a specific column name in the error.
    await tx.execute(sql`SELECT set_config('app.current_company_id', ${companyId}, true)`);
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${userId}, true)`);
    return fn(tx as SfosDb);
  });
};

/**
 * Run `fn` as the admin/system role. Tenancy is NOT set — every query the
 * callback issues sees ALL rows (because the connection is BYPASSRLS).
 *
 * Use sparingly:
 *   - migrations
 *   - the publisher process draining the outbox
 *   - the adversarial test harness (which seeds cross-tenant rows so it
 *     can later attack them)
 *
 * Module / app code MUST NOT reach for this. dependency-cruiser blocks it
 * (rule lands when modules ship; for now the type-level marker discourages
 * misuse and makes audit easy).
 */
export const withSystemContext = async <T>(
  db: SfosDb,
  fn: (tx: SfosDb, ctx: SystemContext) => Promise<T>
): Promise<T> => {
  return db.transaction(async (tx) => fn(tx as SfosDb, { kind: 'system' }));
};
