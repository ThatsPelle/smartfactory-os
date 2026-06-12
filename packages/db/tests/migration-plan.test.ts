import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  assertAppliedMigrationMatches,
  discoverMigrationFiles,
  discoverRepositoryMigrations,
  parseMigrationSourceArgs
} from '../scripts/migration-plan.js';

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

  it('discovers core and all manifest-declared module migrations in global order', async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'sfos-repository-migrations-'));
    temporaryDirectories.push(rootDirectory);

    await writeSql(rootDirectory, 'packages/db/drizzle/0000_core.sql');
    await writeModule(rootDirectory, 'module-alpha', 'sfos.alpha', 'module_alpha', [
      '0041_alpha.sql'
    ]);
    await writeModule(rootDirectory, 'module-beta', 'sfos.beta', 'module_beta', ['0042_beta.sql']);

    const files = await discoverRepositoryMigrations(rootDirectory);

    expect(files.map(({ ledgerName }) => ledgerName)).toEqual([
      '0000_core.sql',
      'module-alpha/0041_alpha.sql',
      'module-beta/0042_beta.sql'
    ]);
    expect(files.map(({ owner }) => owner)).toEqual([
      { kind: 'core', id: 'core', schema: 'core' },
      { kind: 'module', id: 'sfos.alpha', schema: 'module_alpha' },
      { kind: 'module', id: 'sfos.beta', schema: 'module_beta' }
    ]);
  });

  it('preserves frozen core-then-IAM order for legacy duplicate sequences', async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'sfos-legacy-migrations-'));
    temporaryDirectories.push(rootDirectory);

    for (const name of ['0000_init.sql', '0001_core.sql', '0002_core.sql', '0003_core.sql']) {
      await writeSql(rootDirectory, `packages/db/drizzle/${name}`);
    }
    await writeModule(rootDirectory, 'module-iam', 'sfos.iam', 'module_iam', [
      '0001_iam.sql',
      '0002_iam.sql',
      '0003_iam.sql'
    ]);
    await writeSql(rootDirectory, 'packages/db/drizzle/0004_activation.sql');

    const files = await discoverRepositoryMigrations(rootDirectory);

    expect(files.map(({ ledgerName }) => ledgerName)).toEqual([
      '0000_init.sql',
      '0001_core.sql',
      '0002_core.sql',
      '0003_core.sql',
      'module-iam/0001_iam.sql',
      'module-iam/0002_iam.sql',
      'module-iam/0003_iam.sql',
      '0004_activation.sql'
    ]);
  });

  it('rejects duplicate global sequence numbers outside frozen legacy migrations', async () => {
    const rootDirectory = await mkdtemp(path.join(os.tmpdir(), 'sfos-duplicate-migrations-'));
    temporaryDirectories.push(rootDirectory);

    await writeSql(rootDirectory, 'packages/db/drizzle/0042_core.sql');
    await writeModule(rootDirectory, 'module-alpha', 'sfos.alpha', 'module_alpha', [
      '0042_alpha.sql'
    ]);

    await expect(discoverRepositoryMigrations(rootDirectory)).rejects.toThrow(
      /duplicate global migration sequence 0042/
    );
  });

  it('rejects a changed hash for an already-applied migration', () => {
    expect(() =>
      assertAppliedMigrationMatches('module-alpha/0042_alpha.sql', 'old-hash', 'new-hash')
    ).toThrow(/edited after being applied/);
  });
});

const writeSql = async (rootDirectory: string, relativePath: string): Promise<void> => {
  const filePath = path.join(rootDirectory, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, 'SELECT 1;');
};

const writeModule = async (
  rootDirectory: string,
  directoryName: string,
  moduleId: string,
  schema: string,
  migrationNames: readonly string[]
): Promise<void> => {
  const moduleDirectory = path.join(rootDirectory, 'modules', directoryName);
  const migrationsDirectory = path.join(moduleDirectory, 'src', 'migrations');
  const manifestPath = path.join(moduleDirectory, 'dist', 'manifest.js');
  await mkdir(migrationsDirectory, { recursive: true });
  await mkdir(path.dirname(manifestPath), { recursive: true });
  await writeFile(
    manifestPath,
    `export default ${JSON.stringify({
      identity: {
        id: moduleId,
        name: moduleId,
        version: '0.1.0',
        vendor: 'Test',
        license: 'MIT'
      },
      platform: {
        manifest_schema_version: '1',
        platform_version_range: '*',
        runtime_modes_supported: ['self_hosted']
      },
      capabilities: { provides: [], provides_optional: [] },
      dependencies: {
        requires: [],
        requires_optional: [],
        platform_capabilities_required: []
      },
      schema: { namespace: schema, owns_tables: [], published_views: [] },
      migrations: { directory: 'src/migrations', ordering: 'sequential' },
      permissions: [],
      events_produced: [],
      events_consumed: [],
      metadata: { description: 'test module' }
    })};`
  );
  await Promise.all(
    migrationNames.map((name) => writeFile(path.join(migrationsDirectory, name), 'SELECT 1;'))
  );
};
