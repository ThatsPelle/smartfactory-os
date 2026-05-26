import { defineConfig } from 'vitest/config';

/**
 * Adversarial tests touch a real Postgres. They are slow by unit-test
 * standards (per-test seed) but fast enough to run on every PR.
 *
 * Sequential, not parallel — every test truncates the same tables. A
 * parallel run would race itself.
 */
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    reporters: ['default']
  }
});
