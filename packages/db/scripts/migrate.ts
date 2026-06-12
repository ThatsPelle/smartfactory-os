/**
 * Migration runner.
 *
 * Reads SQL files from ./drizzle in lexicographic order, applies each one
 * inside its own transaction, records it in `app.drizzle_migrations` so the
 * next run skips it. Runs as the admin role.
 *
 * Run with: `pnpm --filter @sfos/db db:migrate`
 *
 * Deliberately minimal. No "down" migrations. No timestamps in filenames
 * (we use a global sequence — see drizzle/README.md). When the schema gets
 * heavy enough to need transaction-per-statement or parallel execution,
 * swap this script — the migration files themselves do not need to change.
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';
import { discoverMigrationFiles, parseMigrationSourceArgs } from './migration-plan.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', 'drizzle');
const migrationSource = parseMigrationSourceArgs(process.argv.slice(2), {
  cwd: process.cwd(),
  defaultDirectory: migrationsDir
});

const adminUrl = process.env['DATABASE_ADMIN_URL'];
if (!adminUrl) {
  throw new Error('DATABASE_ADMIN_URL is not set. Copy packages/db/.env.example to .env first.');
}

const sql = postgres(adminUrl, { max: 1, onnotice: () => undefined });

const ensureLedger = async (): Promise<void> => {
  await sql`CREATE SCHEMA IF NOT EXISTS app`;
  await sql`
    CREATE TABLE IF NOT EXISTS app.drizzle_migrations (
      id          serial      PRIMARY KEY,
      name        text        NOT NULL UNIQUE,
      hash        text        NOT NULL,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `;
};

const hash = async (content: string): Promise<string> => {
  const { createHash } = await import('node:crypto');
  return createHash('sha256').update(content).digest('hex');
};

const main = async (): Promise<void> => {
  await ensureLedger();

  const files = await discoverMigrationFiles(migrationSource);

  const applied = await sql<{ name: string; hash: string }[]>`
    SELECT name, hash FROM app.drizzle_migrations
  `;
  const appliedByName = new Map(applied.map((r) => [r.name, r.hash]));

  for (const { filePath, ledgerName } of files) {
    const content = await readFile(filePath, 'utf8');
    const fileHash = await hash(content);

    const existing = appliedByName.get(ledgerName);
    if (existing !== undefined) {
      if (existing !== fileHash) {
        throw new Error(
          `Migration ${ledgerName} has been edited after being applied. ` +
            `Append a forward-fix migration instead.`
        );
      }
      // eslint-disable-next-line no-console
      console.log(`  skip  ${ledgerName}`);
      continue;
    }

    // eslint-disable-next-line no-console
    console.log(`apply  ${ledgerName}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`
        INSERT INTO app.drizzle_migrations (name, hash) VALUES (${ledgerName}, ${fileHash})
      `;
    });
  }

  await sql.end({ timeout: 5 });
};

main().catch((err) => {
  console.error('migration failed:', err);
  process.exit(1);
});
