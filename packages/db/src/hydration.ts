import { asCompanyId, type CompanyId } from '@sfos/contracts';
import { asc, eq } from 'drizzle-orm';

import type { SfosDb } from './client.js';
import { withSystemContext } from './context.js';
import * as schema from './schema/index.js';

export interface HydrationCompanyRecord {
  readonly companyId: CompanyId;
  readonly name: string;
  readonly slug: string;
}

export interface PersistedCompanyModuleActivationRow {
  readonly moduleId: string;
  readonly status: 'pending' | 'active' | 'disabled' | 'failed';
  readonly enabled: boolean;
}

/**
 * Platform-owned company enumeration for startup hydration.
 *
 * This runs with the admin role and returns a deterministic slug/id order.
 * It does not mutate any tenant truth.
 */
export const listCompaniesForHydration = async (
  db: SfosDb
): Promise<readonly HydrationCompanyRecord[]> =>
  withSystemContext(db, async (tx) =>
    (
      await tx
        .select({
          companyId: schema.companies.id,
          name: schema.companies.name,
          slug: schema.companies.slug
        })
        .from(schema.companies)
        .orderBy(asc(schema.companies.slug), asc(schema.companies.id))
    ).map((row) => ({
      companyId: asCompanyId(row.companyId),
      name: row.name,
      slug: row.slug
    }))
  );

/**
 * Read persisted activation truth for one company during startup hydration.
 *
 * This is a platform-level, read-only system query. The core hydrator still
 * applies per-company validation and mirror replacement one company at a time.
 */
export const listCompanyModuleActivationsForHydration = async (
  db: SfosDb,
  companyId: CompanyId
): Promise<readonly PersistedCompanyModuleActivationRow[]> =>
  withSystemContext(db, async (tx) =>
    tx
      .select({
        moduleId: schema.companyModules.moduleId,
        status: schema.companyModules.status,
        enabled: schema.companyModules.enabled
      })
      .from(schema.companyModules)
      .where(eq(schema.companyModules.companyId, companyId))
      .orderBy(asc(schema.companyModules.moduleId))
  );
