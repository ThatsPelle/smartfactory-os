import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CapabilityKeySchema,
  ManifestSchema
} from '@sfos/contracts/manifest';

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const MODULE_DIRECTORY_PATTERN = /^module-([a-z][a-z0-9-]*)$/;

const duplicateValues = (values) => {
  const seen = new Set();
  const duplicates = new Set();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
};

const packageDependencies = (packageJson) => ({
  ...(packageJson.dependencies ?? {}),
  ...(packageJson.devDependencies ?? {}),
  ...(packageJson.peerDependencies ?? {})
});

const formatZodIssues = (modulePath, issues) =>
  issues.map(
    (issue) =>
      `${modulePath}: invalid manifest ${issue.path.join('.') || '<root>'}: ${issue.message}`
  );

const moduleSlug = (directoryName) => {
  const match = MODULE_DIRECTORY_PATTERN.exec(directoryName);
  return match?.[1] ?? null;
};

const validateDuplicates = (errors, modulePath, label, values) => {
  for (const duplicate of duplicateValues(values)) {
    errors.push(`${modulePath}: duplicate ${label} "${duplicate}"`);
  }
};

export const validateManifestRecords = (records) => {
  const errors = [];
  const moduleIds = [];
  const globalPermissions = [];
  const globalEvents = [];
  const globalCapabilities = [];

  for (const record of records) {
    const slug = moduleSlug(record.directoryName);
    if (!slug) {
      errors.push(
        `${record.modulePath}: directory must match module-<slug>`
      );
    }

    const expectedSlug = slug ?? record.directoryName.replace(/^module-/, '');
    const expectedPackageName = `@sfos/${expectedSlug}`;
    if (record.packageJson.name !== expectedPackageName) {
      errors.push(
        `${record.modulePath}: package name must be "${expectedPackageName}"`
      );
    }

    const parsed = ManifestSchema.safeParse(record.manifest);
    if (!parsed.success) {
      errors.push(...formatZodIssues(record.modulePath, parsed.error.issues));
      continue;
    }

    const manifest = parsed.data;
    moduleIds.push(manifest.identity.id);

    if (!record.hasModuleDoc) {
      errors.push(`${record.modulePath}: MODULE.md is required`);
    }
    if (!record.hasOwnershipDoc) {
      errors.push(`${record.modulePath}: OWNERSHIP.md is required`);
    }

    const identitySlug = manifest.identity.id.split('.').at(-1);
    const namespaceSlug = slug ?? identitySlug;
    if (namespaceSlug) {
      const expectedNamespace = `module_${namespaceSlug.replaceAll('-', '_')}`;
      if (manifest.schema.namespace !== expectedNamespace) {
        errors.push(
          `${record.modulePath}: schema namespace must be "${expectedNamespace}"`
        );
      }
    }

    for (const table of manifest.schema.owns_tables) {
      if (!IDENTIFIER_PATTERN.test(table)) {
        errors.push(
          `${record.modulePath}: owned table "${table}" must be an unqualified identifier`
        );
      }
    }
    for (const view of manifest.schema.published_views) {
      if (!IDENTIFIER_PATTERN.test(view)) {
        errors.push(
          `${record.modulePath}: published view "${view}" must be an unqualified identifier`
        );
      }
    }

    const migrationsDirectory = manifest.migrations.directory.replaceAll(
      '\\',
      '/'
    );
    if (
      path.isAbsolute(manifest.migrations.directory) ||
      migrationsDirectory === '..' ||
      migrationsDirectory.startsWith('../') ||
      migrationsDirectory.includes('/../') ||
      !record.migrationsDirectoryExists
    ) {
      errors.push(
        `${record.modulePath}: migration directory must exist inside the module`
      );
    }

    const providedCapabilities = [
      ...manifest.capabilities.provides,
      ...manifest.capabilities.provides_optional
    ].map((capability) => capability.key);
    const requiredCapabilities = [
      ...manifest.dependencies.requires,
      ...manifest.dependencies.requires_optional
    ].map((requirement) => requirement.capability);

    for (const capability of requiredCapabilities) {
      if (!CapabilityKeySchema.safeParse(capability).success) {
        errors.push(
          `${record.modulePath}: invalid required capability "${capability}"`
        );
      }
    }
    for (const capability of manifest.dependencies
      .platform_capabilities_required) {
      if (!CapabilityKeySchema.safeParse(capability).success) {
        errors.push(
          `${record.modulePath}: invalid platform capability "${capability}"`
        );
      }
    }

    const permissions = manifest.permissions.map((permission) => permission.key);
    const events = manifest.events_produced.map((event) => event.type);
    validateDuplicates(
      errors,
      record.modulePath,
      'permission',
      permissions
    );
    validateDuplicates(errors, record.modulePath, 'event', events);
    validateDuplicates(
      errors,
      record.modulePath,
      'provided capability',
      providedCapabilities
    );

    if (record.permissionConstants) {
      const declared = [...new Set(permissions)].sort();
      const constants = [...new Set(record.permissionConstants)].sort();
      if (declared.join('\n') !== constants.join('\n')) {
        errors.push(
          `${record.modulePath}: manifest permissions must match owning permission constants`
        );
      }
    }

    globalPermissions.push(
      ...permissions.map((value) => ({
        modulePath: record.modulePath,
        value
      }))
    );
    globalEvents.push(
      ...events.map((value) => ({ modulePath: record.modulePath, value }))
    );
    globalCapabilities.push(
      ...providedCapabilities.map((value) => ({
        modulePath: record.modulePath,
        value
      }))
    );

    const dependencies = packageDependencies(record.packageJson);
    if (
      Object.hasOwn(dependencies, '@sfos/core') ||
      record.sourceImportsCore
    ) {
      errors.push(`${record.modulePath}: modules must not depend on @sfos/core`);
    }
  }

  for (const duplicate of duplicateValues(moduleIds)) {
    errors.push(`duplicate module id "${duplicate}"`);
  }

  const validateGlobalDuplicates = (label, entries) => {
    const grouped = new Map();
    for (const entry of entries) {
      const paths = grouped.get(entry.value) ?? new Set();
      paths.add(entry.modulePath);
      grouped.set(entry.value, paths);
    }
    for (const [value, paths] of grouped) {
      if (paths.size > 1) {
        errors.push(
          `duplicate ${label} "${value}" across ${[...paths].sort().join(', ')}`
        );
      }
    }
  };

  validateGlobalDuplicates('permission', globalPermissions);
  validateGlobalDuplicates('event', globalEvents);
  validateGlobalDuplicates('provided capability', globalCapabilities);

  return [...new Set(errors)].sort();
};

const exists = async (target) => {
  try {
    await stat(target);
    return true;
  } catch {
    return false;
  }
};

const readSourceFiles = async (directory) => {
  const contents = [];
  const visit = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await visit(target);
      } else if (entry.isFile() && /\.(?:ts|tsx|mts|cts)$/.test(entry.name)) {
        contents.push(await readFile(target, 'utf8'));
      }
    }
  };
  if (await exists(directory)) await visit(directory);
  return contents.join('\n');
};

const importDefault = async (filePath) => {
  const imported = await import(pathToFileURL(filePath).href);
  return imported.default;
};

const collectStringConstants = async (filePath) => {
  if (!(await exists(filePath))) return [];
  const imported = await import(pathToFileURL(filePath).href);
  const values = [];
  for (const exported of Object.values(imported)) {
    if (!exported || typeof exported !== 'object' || Array.isArray(exported)) {
      continue;
    }
    for (const value of Object.values(exported)) {
      if (typeof value === 'string') values.push(value);
    }
  }
  return [...new Set(values)].sort();
};

export const discoverManifestRecords = async (rootDirectory) => {
  const modulesDirectory = path.join(rootDirectory, 'modules');
  const entries = await readdir(modulesDirectory, { withFileTypes: true });
  const records = [];

  for (const entry of entries
    .filter((candidate) => candidate.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const moduleDirectory = path.join(modulesDirectory, entry.name);
    const packagePath = path.join(moduleDirectory, 'package.json');
    const manifestPath = path.join(moduleDirectory, 'dist', 'manifest.js');
    const sourceManifestPath = path.join(moduleDirectory, 'src', 'manifest.ts');
    if (
      !(await exists(packagePath)) ||
      (!(await exists(manifestPath)) && !(await exists(sourceManifestPath)))
    ) {
      continue;
    }
    if (!(await exists(manifestPath))) {
      throw new Error(
        `${path.relative(rootDirectory, moduleDirectory)}: built manifest missing; run the build before validation`
      );
    }

    const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));
    const manifest = await importDefault(manifestPath);
    const migrationsPath = path.resolve(
      moduleDirectory,
      manifest.migrations?.directory ?? ''
    );
    const relativeMigrationsPath = path.relative(
      moduleDirectory,
      migrationsPath
    );
    const source = await readSourceFiles(path.join(moduleDirectory, 'src'));

    records.push({
      directoryName: entry.name,
      modulePath: path
        .relative(rootDirectory, moduleDirectory)
        .split(path.sep)
        .join('/'),
      packageJson,
      manifest,
      hasModuleDoc: await exists(path.join(moduleDirectory, 'MODULE.md')),
      hasOwnershipDoc: await exists(
        path.join(moduleDirectory, 'OWNERSHIP.md')
      ),
      migrationsDirectoryExists:
        relativeMigrationsPath !== '..' &&
        !relativeMigrationsPath.startsWith(`..${path.sep}`) &&
        (await exists(migrationsPath)),
      sourceImportsCore:
        /(?:from\s+|import\s*\()['"]@sfos\/core(?:[/.'"])/.test(source),
      eventConstants: await collectStringConstants(
        path.join(moduleDirectory, 'dist', 'server', 'events.js')
      ),
      permissionConstants: await collectStringConstants(
        path.join(moduleDirectory, 'dist', 'server', 'permissions.js')
      )
    });
  }

  return records;
};

export const runManifestValidation = async (rootDirectory) => {
  const records = await discoverManifestRecords(rootDirectory);
  if (records.length === 0) {
    return ['no module manifests discovered'];
  }
  return validateManifestRecords(records);
};

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMain) {
  const rootDirectory = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../..'
  );
  const errors = await runManifestValidation(rootDirectory);
  if (errors.length > 0) {
    process.stderr.write(
      `Manifest validation failed:\n${errors.map((error) => `- ${error}`).join('\n')}\n`
    );
    process.exitCode = 1;
  } else {
    process.stdout.write('Manifest validation passed.\n');
  }
}
