import { sql } from 'drizzle-orm';
import { pgEnum, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { coreSchema } from './schemas.js';
import { companies } from './companies.js';
import { users } from './users.js';

/**
 * Roles inside a company.
 *
 * Frozen at v1. Permission *strings* (used by `app.current_user_has`) are
 * defined in @sfos/contracts; this enum is just the membership tier.
 *   - owner: founders / billing contacts. Can install modules.
 *   - admin: full operational control inside the company.
 *   - member: regular user. Permissions gated module-by-module.
 *   - viewer: read-only.
 */
export const membershipRole = pgEnum('membership_role', ['owner', 'admin', 'member', 'viewer']);

/**
 * core.memberships — user ↔ company relationship.
 *
 * Tenant-scoped: `company_id` is the RLS anchor. A user may have many rows
 * (one per company they belong to). A `(user_id, company_id)` pair is unique.
 */
export const memberships = coreSchema.table(
  'memberships',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull().default('member'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`)
  },
  (t) => ({
    userCompanyUnique: unique('memberships_user_company_unique').on(t.userId, t.companyId)
  })
);

export type Membership = typeof memberships.$inferSelect;
export type NewMembership = typeof memberships.$inferInsert;
