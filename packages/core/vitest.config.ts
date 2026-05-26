import { defineConfig } from 'vitest/config';

/**
 * Most core tests are pure unit (no Postgres). The outbox publisher test
 * touches a real DB and self-skips when TEST_DATABASE_URL is unset, the
 * same pattern as @sfos/db.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 15_000,
    reporters: ['default']
  }
});
