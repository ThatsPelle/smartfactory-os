import { sql } from 'drizzle-orm';
import { text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { coreSchema } from './schemas.js';

/**
 * core.companies — tenant root.
 *
 * Every row in every tenant-scoped table joins back here through a
 * `company_id` FK. The row's `id` is what RLS compares against
 * `app.current_company_id()`.
 *
 * Deliberately minimal: name + slug. Branding, billing, settings live in
 * later tables and modules.
 */
export const companies = coreSchema.table('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** URL-safe handle. Unique across the platform. */
  slug: text('slug').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .default(sql`now()`)
});

export type Company = typeof companies.$inferSelect;
export type NewCompany = typeof companies.$inferInsert;
