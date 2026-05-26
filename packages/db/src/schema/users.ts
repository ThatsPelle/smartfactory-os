import { sql } from 'drizzle-orm';
import { text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { coreSchema } from './schemas.js';

/**
 * core.users — platform user identity.
 *
 * Users are PLATFORM-SCOPED, not tenant-scoped. The same person can belong
 * to multiple companies via `core.memberships`. There is no `company_id` on
 * this row by design.
 *
 * RLS posture (see drizzle/0003_rls_policies.sql):
 *   - SELECT: a tenant role can read users only via the visible memberships,
 *     so cross-tenant directory enumeration is not possible.
 *   - INSERT / UPDATE: signup and profile updates go through the auth
 *     module, which uses the admin role inside a vetted RPC.
 *
 * Email is the natural login identifier; collation `citext`-style is faked
 * with `lower(email)` unique index (see migration 0001) so tooling does not
 * need a `citext` extension on the cluster.
 */
export const users = coreSchema.table('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
