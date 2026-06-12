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
import { assertAppliedMigrationMatches, discoverRepositoryMigrations } from './migration-plan.ts';
import { validateMigrationOwnership } from './migration-ownership.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDirectory = path.resolve(here, '..', '..', '..');

const ensureLedger = async (sql: postgres.Sql): Promise<void> => {
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
  const files = await discoverRepositoryMigrations(rootDirectory);
  const prepared = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(file.filePath, 'utf8');
      const errors = validateMigrationOwnership(content, file.owner);
      if (errors.length > 0) {
        throw new Error(
          `Migration ownership validation failed for ${file.ledgerName}:\n${errors
            .map((error) => `- ${error}`)
            .join('\n')}`
        );
      }
      return { ...file, content, fileHash: await hash(content) };
    })
  );

  const adminUrl = process.env['DATABASE_ADMIN_URL'];
  if (!adminUrl) {
    throw new Error('DATABASE_ADMIN_URL is not set. Copy packages/db/.env.example to .env first.');
  }
  const sql = postgres(adminUrl, { max: 1, onnotice: () => undefined });
  await ensureLedger(sql);

  const applied = await sql<{ name: string; hash: string }[]>`
    SELECT name, hash FROM app.drizzle_migrations
  `;
  const appliedByName = new Map(applied.map((r) => [r.name, r.hash]));

  for (const { ledgerName, content, fileHash } of prepared) {
    const existing = appliedByName.get(ledgerName);
    if (existing !== undefined) {
      assertAppliedMigrationMatches(ledgerName, existing, fileHash);
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
