import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';

import { createTenantClient, createAdminClient, type SfosClient } from '../src/client.js';
import * as schema from '../src/schema/index.js';

const execFileP = promisify(execFile);

/**
 * Build a tenant-role URL from the admin URL by swapping in `app_tenant`
 * credentials. Cluster password for app_tenant is fixed in migration 0000
 * for local dev — production rotates it out of band.
 */
export const tenantUrlFromAdmin = (adminUrl: string): string => {
  const u = new URL(adminUrl);
  u.username = 'app_tenant';
  u.password = 'app_tenant';
  return u.toString();
};

/**
 * Apply migrations using the migration runner CLI. We shell out instead of
 * importing the runner so the test path matches the operator's path —
 * if the CLI is broken, tests fail in the same way production would.
 */
export const ensureMigrationsApplied = async (adminUrl: string): Promise<void> => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const scriptPath = path.resolve(here, '..', 'scripts', 'migrate.ts');
  await execFileP(process.execPath, ['--experimental-strip-types', scriptPath], {
    env: { ...process.env, DATABASE_ADMIN_URL: adminUrl },
    cwd: path.resolve(here, '..')
  });
};

/** Hard reset: truncates every tenant-scoped table to keep tests isolated. */
export const resetData = async (admin: Sql): Promise<void> => {
  // Order matters because of FK ON DELETE RESTRICT on audit_logs / outbox.
  await admin.unsafe(`
    TRUNCATE
      core.outbox_events,
      core.audit_logs,
      core.company_modules,
      core.memberships,
      core.users,
      core.companies
    RESTART IDENTITY CASCADE
  `);
};

export interface SeedResult {
  readonly companyA: { id: string };
  readonly companyB: { id: string };
  readonly alice: { id: string };
  readonly bob: { id: string };
}

/** Seed two companies + two users + memberships. Uses the admin role. */
export const seedTwoTenants = async (admin: Sql): Promise<SeedResult> => {
  const [companyA] = await admin<{ id: string }[]>`
    INSERT INTO core.companies (name, slug) VALUES ('Company A', 'company-a') RETURNING id
  `;
  const [companyB] = await admin<{ id: string }[]>`
    INSERT INTO core.companies (name, slug) VALUES ('Company B', 'company-b') RETURNING id
  `;
  const [alice] = await admin<{ id: string }[]>`
    INSERT INTO core.users (email, name) VALUES ('alice@a.test', 'Alice') RETURNING id
  `;
  const [bob] = await admin<{ id: string }[]>`
    INSERT INTO core.users (email, name) VALUES ('bob@b.test', 'Bob') RETURNING id
  `;
  await admin`
    INSERT INTO core.memberships (user_id, company_id, role)
    VALUES (${alice!.id}, ${companyA!.id}, 'owner'),
           (${bob!.id},   ${companyB!.id}, 'owner')
  `;
  return {
    companyA: { id: companyA!.id },
    companyB: { id: companyB!.id },
    alice: { id: alice!.id },
    bob: { id: bob!.id }
  };
};

/** Convenience: build both clients for a test suite. */
export const buildClients = (adminUrl: string): { admin: SfosClient; tenant: SfosClient } => {
  const admin = createAdminClient(adminUrl, { max: 2 });
  const tenant = createTenantClient(tenantUrlFromAdmin(adminUrl), { max: 2 });
  return { admin, tenant };
};

/** Re-export for tests that build their own ad-hoc connections. */
export { drizzle, postgres, schema };
