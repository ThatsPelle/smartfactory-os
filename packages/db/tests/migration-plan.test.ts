import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { discoverMigrationFiles, parseMigrationSourceArgs } from '../scripts/migration-plan.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('migration source arguments', () => {
  it('keeps existing core ledger names when no prefix is supplied', () => {
    expect(
      parseMigrationSourceArgs([], {
        cwd: '/repo/packages/db',
        defaultDirectory: '/repo/packages/db/drizzle'
      })
    ).toEqual({
      directory: path.resolve('/repo/packages/db/drizzle'),
      ledgerPrefix: ''
    });
  });

  it('resolves a module directory and validates its ledger prefix', () => {
    expect(
      parseMigrationSourceArgs(
        ['--dir', '../../modules/module-iam/src/migrations', '--ledger-prefix', 'module-iam'],
        {
          cwd: '/repo/packages/db',
          defaultDirectory: '/repo/packages/db/drizzle'
        }
      )
    ).toEqual({
      directory: path.resolve('/repo/packages/db', '../../modules/module-iam/src/migrations'),
      ledgerPrefix: 'module-iam'
    });
  });

  it('rejects a module directory without a ledger prefix', () => {
    expect(() =>
      parseMigrationSourceArgs(['--dir', '../module'], {
        cwd: '/repo/packages/db',
        defaultDirectory: '/repo/packages/db/drizzle'
      })
    ).toThrow(/ledger-prefix/);
  });
});

describe('migration discovery', () => {
  it('sorts SQL files and namespaces module ledger names', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sfos-migrations-'));
    temporaryDirectories.push(directory);
    await writeFile(path.join(directory, '0002_second.sql'), 'SELECT 2;');
    await writeFile(path.join(directory, '0001_first.sql'), 'SELECT 1;');
    await writeFile(path.join(directory, 'README.md'), 'ignored');

    const files = await discoverMigrationFiles({
      directory,
      ledgerPrefix: 'module-iam'
    });

    expect(files.map(({ ledgerName }) => ledgerName)).toEqual([
      'module-iam/0001_first.sql',
      'module-iam/0002_second.sql'
    ]);
  });
});
