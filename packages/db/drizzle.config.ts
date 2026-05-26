import { defineConfig } from 'drizzle-kit';

/**
 * Drizzle Kit configuration.
 *
 * `drizzle-kit generate` produces SQL migration files in `./drizzle/` from the
 * TS schema. RLS, helper functions, policies, and immutability triggers are
 * HAND-WRITTEN SQL migrations (drizzle-kit does not yet understand them).
 * See drizzle/README.md for the hybrid generated-vs-handwritten discipline.
 */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    // Generation only — never hit the DB at runtime.
    url: process.env['DATABASE_ADMIN_URL'] ?? 'postgres://postgres:postgres@localhost:5432/sfos_dev'
  },
  // Force readable migration filenames; we append-only the numeric prefix.
  migrations: {
    prefix: 'index',
    table: 'drizzle_migrations',
    schema: 'app'
  },
  strict: true,
  verbose: true
});
