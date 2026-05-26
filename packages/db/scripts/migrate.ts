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

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import postgres from 'postgres';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '..', 'drizzle');

const adminUrl = process.env['DATABASE_ADMIN_URL'];
if (!adminUrl) {
  throw new Error(
    'DATABASE_ADMIN_URL is not set. Copy packages/db/.env.example to .env first.'
  );
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

  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith('.sql'))
    .map((e) => e.name)
    .sort();

  const applied = await sql<{ name: string; hash: string }[]>`
    SELECT name, hash FROM app.drizzle_migrations
  `;
  const appliedByName = new Map(applied.map((r) => [r.name, r.hash]));

  for (const name of files) {
    const filePath = path.join(migrationsDir, name);
    const content = await readFile(filePath, 'utf8');
    const fileHash = await hash(content);

    const existing = appliedByName.get(name);
    if (existing !== undefined) {
      if (existing !== fileHash) {
        throw new Error(
          `Migration ${name} has been edited after being applied. ` +
            `Append a forward-fix migration instead.`
        );
      }
      // eslint-disable-next-line no-console
      console.log(`  skip  ${name}`);
      continue;
    }

    // eslint-disable-next-line no-console
    console.log(`apply  ${name}`);
    await sql.begin(async (tx) => {
      await tx.unsafe(content);
      await tx`
        INSERT INTO app.drizzle_migrations (name, hash) VALUES (${name}, ${fileHash})
      `;
    });
  }

  await sql.end({ timeout: 5 });
};

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('migration failed:', err);
  process.exit(1);
});
