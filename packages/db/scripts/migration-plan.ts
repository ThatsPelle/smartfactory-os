import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { ManifestSchema } from '@sfos/contracts/manifest';

export interface MigrationOwner {
  readonly kind: 'core' | 'module';
  readonly id: string;
  readonly schema: string;
}

export interface MigrationSource {
  readonly directory: string;
  readonly ledgerPrefix: string;
  readonly owner?: MigrationOwner;
}

export interface MigrationFile {
  readonly filePath: string;
  readonly ledgerName: string;
  readonly sequence: number;
  readonly owner: MigrationOwner;
}

interface ParseOptions {
  readonly cwd: string;
  readonly defaultDirectory: string;
}

const LEDGER_PREFIX_PATTERN = /^[a-z][a-z0-9-]*$/;
const MIGRATION_NAME_PATTERN = /^(\d{4})_[a-z0-9_]+\.sql$/;
const MODULE_DIRECTORY_PATTERN = /^module-[a-z][a-z0-9-]*$/;
const CORE_OWNER: MigrationOwner = { kind: 'core', id: 'core', schema: 'core' };

const legacyCollisionAllowed = (sequence: number, files: readonly MigrationFile[]): boolean => {
  if (sequence < 1 || sequence > 3 || files.length !== 2) return false;
  return (
    files
      .map(({ owner }) => owner.id)
      .sort()
      .join(',') === 'core,sfos.iam'
  );
};

const migrationSequence = (name: string): number => {
  const match = MIGRATION_NAME_PATTERN.exec(name);
  if (!match?.[1]) {
    throw new Error(
      `Migration filename "${name}" must match <four-digit-sequence>_<description>.sql`
    );
  }
  return Number.parseInt(match[1], 10);
};

const pathIsInside = (parent: string, target: string): boolean => {
  const relative = path.relative(parent, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

const exists = async (target: string): Promise<boolean> => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

export const parseMigrationSourceArgs = (
  args: readonly string[],
  options: ParseOptions
): MigrationSource => {
  let directory = options.defaultDirectory;
  let ledgerPrefix = '';
  let customDirectory = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--') continue;

    const value = args[index + 1];
    if (argument === '--dir' && value) {
      directory = path.resolve(options.cwd, value);
      customDirectory = true;
      index += 1;
      continue;
    }
    if (argument === '--ledger-prefix' && value) {
      ledgerPrefix = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown or incomplete migration argument: ${argument}`);
  }

  if (customDirectory && !ledgerPrefix) {
    throw new Error('--ledger-prefix is required when --dir is used');
  }
  if (ledgerPrefix && !LEDGER_PREFIX_PATTERN.test(ledgerPrefix)) {
    throw new Error('--ledger-prefix must use lowercase letters, digits, and hyphens');
  }

  return {
    directory: path.resolve(directory),
    ledgerPrefix
  };
};

export const discoverMigrationFiles = async (source: MigrationSource): Promise<MigrationFile[]> => {
  const entries = await readdir(source.directory, { withFileTypes: true });
  const owner = source.owner ?? CORE_OWNER;
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => ({
      filePath: path.join(source.directory, entry.name),
      ledgerName: source.ledgerPrefix ? `${source.ledgerPrefix}/${entry.name}` : entry.name,
      sequence: migrationSequence(entry.name),
      owner
    }));

  if (files.length === 0) {
    throw new Error(`No SQL migrations found in ${source.directory}`);
  }

  return files;
};

const discoverModuleSources = async (rootDirectory: string): Promise<MigrationSource[]> => {
  const modulesDirectory = path.join(rootDirectory, 'modules');
  if (!(await exists(modulesDirectory))) return [];

  const entries = await readdir(modulesDirectory, { withFileTypes: true });
  const sources: MigrationSource[] = [];
  for (const entry of entries
    .filter((candidate) => candidate.isDirectory() && MODULE_DIRECTORY_PATTERN.test(candidate.name))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const moduleDirectory = path.join(modulesDirectory, entry.name);
    const manifestPath = path.join(moduleDirectory, 'dist', 'manifest.js');
    if (!(await exists(manifestPath))) {
      throw new Error(
        `${path.relative(rootDirectory, moduleDirectory)}: built manifest missing; build modules before migrating`
      );
    }

    const imported = (await import(
      `${pathToFileURL(manifestPath).href}?migration-discovery=1`
    )) as {
      default: unknown;
    };
    const manifest = ManifestSchema.parse(imported.default);
    const migrationsDirectory = path.resolve(moduleDirectory, manifest.migrations.directory);
    if (!pathIsInside(moduleDirectory, migrationsDirectory)) {
      throw new Error(`${entry.name}: manifest migration directory must stay inside module`);
    }

    sources.push({
      directory: migrationsDirectory,
      ledgerPrefix: entry.name,
      owner: {
        kind: 'module',
        id: manifest.identity.id,
        schema: manifest.schema.namespace
      }
    });
  }
  return sources;
};

export const discoverRepositoryMigrations = async (
  rootDirectory: string
): Promise<MigrationFile[]> => {
  const core = await discoverMigrationFiles({
    directory: path.join(rootDirectory, 'packages', 'db', 'drizzle'),
    ledgerPrefix: '',
    owner: CORE_OWNER
  });
  const moduleSources = await discoverModuleSources(rootDirectory);
  const modules = (
    await Promise.all(moduleSources.map((source) => discoverMigrationFiles(source)))
  ).flat();
  const files = [...core, ...modules];

  const bySequence = new Map<number, MigrationFile[]>();
  for (const file of files) {
    const group = bySequence.get(file.sequence) ?? [];
    group.push(file);
    bySequence.set(file.sequence, group);
  }
  for (const [sequence, group] of bySequence) {
    if (group.length > 1 && !legacyCollisionAllowed(sequence, group)) {
      const formatted = sequence.toString().padStart(4, '0');
      throw new Error(
        `duplicate global migration sequence ${formatted}: ${group
          .map(({ ledgerName }) => ledgerName)
          .sort()
          .join(', ')}`
      );
    }
  }

  const legacyCore = files
    .filter(({ owner, sequence }) => owner.kind === 'core' && sequence <= 3)
    .sort((left, right) => left.sequence - right.sequence);
  const legacyIam = files
    .filter(({ owner, sequence }) => owner.id === 'sfos.iam' && sequence <= 3)
    .sort((left, right) => left.sequence - right.sequence);
  const legacyNames = new Set([...legacyCore, ...legacyIam].map(({ ledgerName }) => ledgerName));
  const globallyOrdered = files
    .filter(({ ledgerName }) => !legacyNames.has(ledgerName))
    .sort(
      (left, right) =>
        left.sequence - right.sequence || left.ledgerName.localeCompare(right.ledgerName)
    );

  return [...legacyCore, ...legacyIam, ...globallyOrdered];
};

export const assertAppliedMigrationMatches = (
  ledgerName: string,
  appliedHash: string,
  fileHash: string
): void => {
  if (appliedHash !== fileHash) {
    throw new Error(
      `Migration ${ledgerName} has been edited after being applied. ` +
        `Append a forward-fix migration instead.`
    );
  }
};
