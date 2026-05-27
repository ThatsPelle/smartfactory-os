import { sql } from 'drizzle-orm';
import { boolean, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { coreSchema } from './schemas.js';
import { companies } from './companies.js';

/**
 * core.company_modules — which modules a tenant has enabled.
 *
 * One row per (company, module). `enabled = false` is preserved for audit so
 * we can tell "installed and disabled" apart from "never installed". The
 * registry consults this table when a request comes in for `<module>/...`
 * routes — if the row is missing or disabled, the request 404s.
 *
 * Tenant-scoped: `company_id` is the RLS anchor.
 *
 * `module_id` is a free-form text identifier (e.g. `'crm'`, `'wms'`) matched
 * against the module manifest's `id`. Not an FK — modules are code, not
 * rows. Validity is enforced by the registry at install time.
 */
export const companyModules = coreSchema.table(
  'company_modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => companies.id, { onDelete: 'cascade' }),
    moduleId: text('module_id').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    enabledAt: timestamp('enabled_at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    disabledAt: timestamp('disabled_at', { withTimezone: true })
  },
  (t) => ({
    companyModuleUnique: unique('company_modules_company_module_unique').on(t.companyId, t.moduleId)
  })
);

export type CompanyModule = typeof companyModules.$inferSelect;
export type NewCompanyModule = typeof companyModules.$inferInsert;
