import assert from 'node:assert/strict';
import test from 'node:test';

import { validateManifestRecords } from './index.mjs';

const validManifest = (overrides = {}) => ({
  identity: {
    id: 'sfos.iam',
    name: 'Identity & Access Management',
    version: '0.1.0',
    vendor: 'SmartFactoryOS',
    license: 'AGPL-3.0-or-later'
  },
  platform: {
    manifest_schema_version: '1',
    platform_version_range: '>=0.0.0',
    runtime_modes_supported: ['self_hosted']
  },
  capabilities: {
    provides: [{ key: 'iam.authentication@1' }],
    provides_optional: []
  },
  dependencies: {
    requires: [],
    requires_optional: [],
    platform_capabilities_required: ['core.tenancy@1']
  },
  schema: {
    namespace: 'module_iam',
    owns_tables: ['sessions'],
    published_views: []
  },
  migrations: {
    directory: 'src/migrations',
    ordering: 'sequential'
  },
  permissions: [
    {
      key: 'iam.session.read',
      default_roles: ['member'],
      scope: 'tenant'
    }
  ],
  events_produced: [
    {
      type: 'iam.session.created',
      version: '1.0',
      audit_required: true,
      ai_readable: false,
      since_module_version: '0.1.0'
    }
  ],
  events_consumed: [],
  metadata: {
    description: 'IAM'
  },
  ...overrides
});

const validRecord = (overrides = {}) => ({
  directoryName: 'module-iam',
  modulePath: 'modules/module-iam',
  packageJson: {
    name: '@sfos/iam',
    dependencies: {
      '@sfos/contracts': 'workspace:*'
    }
  },
  manifest: validManifest(),
  hasModuleDoc: true,
  hasOwnershipDoc: true,
  migrationsDirectoryExists: true,
  sourceImportsCore: false,
  permissionConstants: ['iam.session.read'],
  ...overrides
});

test('accepts a valid module manifest record', () => {
  assert.deepEqual(validateManifestRecords([validRecord()]), []);
});

test('rejects manifest permissions that do not match owning constants', () => {
  const errors = validateManifestRecords([
    validRecord({ permissionConstants: ['iam.session.revoke'] })
  ]).join('\n');

  assert.match(errors, /permission constants/);
});

test('rejects duplicate ids, permissions, events, and provided capabilities', () => {
  const manifest = validManifest({
    capabilities: {
      provides: [
        { key: 'iam.authentication@1' },
        { key: 'iam.authentication@1' }
      ],
      provides_optional: []
    },
    permissions: [
      { key: 'iam.session.read', default_roles: [], scope: 'tenant' },
      { key: 'iam.session.read', default_roles: [], scope: 'tenant' }
    ],
    events_produced: [
      {
        type: 'iam.session.created',
        version: '1.0',
        audit_required: true,
        ai_readable: false,
        since_module_version: '0.1.0'
      },
      {
        type: 'iam.session.created',
        version: '1.0',
        audit_required: true,
        ai_readable: false,
        since_module_version: '0.1.0'
      }
    ]
  });

  const errors = validateManifestRecords([
    validRecord({ manifest }),
    validRecord({ modulePath: 'modules/module-iam-copy' })
  ]).join('\n');

  assert.match(errors, /duplicate module id/);
  assert.match(errors, /duplicate permission/);
  assert.match(errors, /duplicate event/);
  assert.match(errors, /duplicate provided capability/);
});

test('rejects invalid naming, capability requirements, ownership, and core access', () => {
  const manifest = validManifest({
    dependencies: {
      requires: [{ capability: 'not valid', version_range: '*' }],
      requires_optional: [],
      platform_capabilities_required: ['also invalid']
    },
    schema: {
      namespace: 'foreign_schema',
      owns_tables: ['other.sessions'],
      published_views: []
    },
    migrations: {
      directory: '../outside',
      ordering: 'sequential'
    }
  });

  const errors = validateManifestRecords([
    validRecord({
      directoryName: 'iam',
      packageJson: {
        name: '@sfos/wrong',
        dependencies: { '@sfos/core': 'workspace:*' }
      },
      manifest,
      hasModuleDoc: false,
      hasOwnershipDoc: false,
      migrationsDirectoryExists: false,
      sourceImportsCore: true
    })
  ]).join('\n');

  assert.match(errors, /directory must match module-<slug>/);
  assert.match(errors, /package name/);
  assert.match(errors, /invalid required capability/);
  assert.match(errors, /invalid platform capability/);
  assert.match(errors, /namespace/);
  assert.match(errors, /owned table/);
  assert.match(errors, /migration directory/);
  assert.match(errors, /MODULE.md/);
  assert.match(errors, /OWNERSHIP.md/);
  assert.match(errors, /@sfos\/core/);
});
