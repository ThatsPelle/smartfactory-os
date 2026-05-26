/**
 * Schema namespace declarations.
 *
 * Kept in a separate file (not the barrel) so each table file can import the
 * schema object it lives under without creating a cycle through `index.ts`.
 */

import { pgSchema } from 'drizzle-orm/pg-core';

/** Platform tables live under `core.*`. */
export const coreSchema = pgSchema('core');

/** Helper functions / triggers live under `app.*`. */
export const appSchema = pgSchema('app');
