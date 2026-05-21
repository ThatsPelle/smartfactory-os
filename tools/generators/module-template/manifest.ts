import { defineManifest } from '@sfos/module-sdk';
import { CORE_CAPABILITIES } from '@sfos/contracts/capabilities';

/**
 * __DISPLAY_NAME__ module manifest.
 *
 * Frozen contract surface — change is reviewed and bumps the module version.
 * See docs/architecture/04-manifest-and-events.md.
 */
export default defineManifest({
  identity: {
    id: '__MODULE_FULL_ID__',
    name: '__MODULE_NAME__.name',
    version: '0.0.0',
    vendor: 'SmartFactory OS',
    license: 'AGPL-3.0-or-later'
  },

  platform: {
    manifest_schema_version: '1',
    platform_version_range: '>=0.1.0 <1.0.0',
    runtime_modes_supported: ['cloud', 'self_hosted', 'workstation']
  },

  capabilities: {
    provides: [
      // Add capability declarations here, e.g.:
      // { key: '__MODULE_NAME__.some_capability@1' }
    ],
    provides_optional: []
  },

  dependencies: {
    requires: [],
    requires_optional: [],
    platform_capabilities_required: [
      CORE_CAPABILITIES.TENANCY,
      CORE_CAPABILITIES.EVENT_BUS,
      CORE_CAPABILITIES.AUDIT_LOG
    ]
  },

  schema: {
    namespace: '__SCHEMA_NAME__',
    owns_tables: [],
    published_views: []
  },

  migrations: {
    directory: './src/migrations',
    ordering: 'sequential'
  },

  permissions: [
    // Module-scoped permission keys. Use constants from src/server/permissions.ts.
  ],

  events_produced: [
    // Event declarations. Use constants from src/server/events.ts.
  ],

  events_consumed: [],

  metadata: {
    description: '__DISPLAY_NAME__ module — replace this description.'
  }
});
