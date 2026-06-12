import { readdir } from 'node:fs/promises';
import path from 'node:path';

export interface MigrationSource {
  readonly directory: string;
  readonly ledgerPrefix: string;
}

export interface MigrationFile {
  readonly filePath: string;
  readonly ledgerName: string;
}

interface ParseOptions {
  readonly cwd: string;
  readonly defaultDirectory: string;
}

const LEDGER_PREFIX_PATTERN = /^[a-z][a-z0-9-]*$/;

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
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => ({
      filePath: path.join(source.directory, entry.name),
      ledgerName: source.ledgerPrefix ? `${source.ledgerPrefix}/${entry.name}` : entry.name
    }));

  if (files.length === 0) {
    throw new Error(`No SQL migrations found in ${source.directory}`);
  }

  return files;
};
