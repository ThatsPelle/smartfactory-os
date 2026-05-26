/**
 * Schema barrel.
 *
 * Re-exports every table under the `core` schema so a single `import * as
 * schema from '@sfos/db/schema'` is sufficient for the Drizzle client and for
 * future modules that need to reference platform tables.
 *
 * Modules MUST define their own schema files under their own package and
 * MUST NOT re-export tables from `core` — they consume FK columns, not
 * platform internals.
 */

export { coreSchema, appSchema } from './schemas.js';

export * from './companies.js';
export * from './users.js';
export * from './memberships.js';
export * from './company-modules.js';
export * from './audit-logs.js';
export * from './outbox-events.js';
