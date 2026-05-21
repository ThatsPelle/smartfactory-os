import { z } from 'zod';
import { EVENT_TYPE_PATTERN, EVENT_VERSION_PATTERN } from './envelope.js';

/**
 * Module manifest schema — FROZEN AT v1.
 *
 * Every module ships a manifest.ts (typed against this schema) at its root.
 * The platform validates manifests at build time and at runtime startup.
 *
 * The structure is described in detail in docs/architecture/04-manifest-and-events.md §3.
 * Changes to the schema require a manifest_schema_version bump + ADR + migration plan.
 */

// ---------- Primitives ----------

export const PERMISSION_KEY_PATTERN = /^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$/;
export const PermissionKeySchema = z
  .string()
  .regex(PERMISSION_KEY_PATTERN, 'permission key must match <scope>.<resource>.<action>');
export type PermissionKey = z.infer<typeof PermissionKeySchema>;

export const CAPABILITY_KEY_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*@\d+$/;
export const CapabilityKeySchema = z
  .string()
  .regex(CAPABILITY_KEY_PATTERN, 'capability key must match <key>@<major-version>');
export type CapabilityKey = z.infer<typeof CapabilityKeySchema>;

export const RuntimeModeSchema = z.enum(['cloud', 'self_hosted', 'workstation']);
export type RuntimeMode = z.infer<typeof RuntimeModeSchema>;

// ---------- Manifest blocks ----------

export const ManifestIdentitySchema = z.object({
  /** Reverse-domain unique id, immutable across versions. */
  id: z.string().regex(/^[a-z][a-z0-9.-]*[a-z0-9]$/),
  /** Display name (i18n key). */
  name: z.string().min(1),
  /** Module package version (semver). */
  version: z.string().regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/),
  vendor: z.string().min(1),
  license: z.string().min(1)
});

export const ManifestPlatformSchema = z.object({
  manifest_schema_version: z.literal('1'),
  /** Semver range of platforms this module supports. */
  platform_version_range: z.string().min(1),
  runtime_modes_supported: z.array(RuntimeModeSchema).min(1)
});

export const ManifestCapabilitiesSchema = z.object({
  provides: z
    .array(
      z.object({
        key: CapabilityKeySchema,
        description_i18n_key: z.string().optional()
      })
    )
    .default([]),
  provides_optional: z
    .array(
      z.object({
        key: CapabilityKeySchema,
        description_i18n_key: z.string().optional()
      })
    )
    .default([])
});

export const ManifestDependenciesSchema = z.object({
  requires: z
    .array(
      z.object({
        capability: z.string().min(1),
        version_range: z.string().min(1)
      })
    )
    .default([]),
  requires_optional: z
    .array(
      z.object({
        capability: z.string().min(1),
        version_range: z.string().min(1)
      })
    )
    .default([]),
  platform_capabilities_required: z.array(z.string()).default([])
});

export const ManifestSchemaBlockSchema = z.object({
  /** Postgres schema name. Conventionally `module_<short_id>`. */
  namespace: z.string().regex(/^[a-z][a-z0-9_]*$/),
  /** Tables owned by this module. CI ensures no other module writes to them. */
  owns_tables: z.array(z.string()).default([]),
  /** Read-only views published to public schema for cross-module consumption. */
  published_views: z.array(z.string()).default([])
});

export const ManifestMigrationsSchema = z.object({
  /** Path relative to the module root. */
  directory: z.string().min(1),
  ordering: z.enum(['sequential', 'dependency-graph']).default('sequential'),
  /** Name of an exported function that runs before migrations apply. */
  pre_flight_check: z.string().optional(),
  /** Name of an exported function that runs after migrations succeed. */
  post_migration_hook: z.string().optional()
});

export const ManifestPermissionSchema = z.object({
  key: PermissionKeySchema,
  description_i18n_key: z.string().optional(),
  default_roles: z.array(z.string()).default([]),
  scope: z.enum(['tenant', 'resource']).default('tenant')
});

export const ManifestEventProducedSchema = z.object({
  type: z.string().regex(EVENT_TYPE_PATTERN),
  version: z.string().regex(EVENT_VERSION_PATTERN),
  description_i18n_key: z.string().optional(),
  realtime_channel: z.string().optional(),
  audit_required: z.boolean(),
  ai_readable: z.boolean().default(false),
  since_module_version: z.string()
});

export const ManifestEventConsumedSchema = z.object({
  /** Event type or wildcard pattern (e.g., `warehouse.stock.*`). */
  type: z.string().min(1),
  /** Exported function name in the module that handles this event. */
  handler: z.string().min(1),
  delivery: z.enum(['at_least_once', 'at_most_once']).default('at_least_once'),
  idempotency: z.enum(['required', 'not_required']).default('required'),
  dead_letter: z.enum(['inbox', 'discard', 'alert']).default('inbox')
});

export const ManifestMetadataSchema = z.object({
  description: z.string().min(1),
  icon: z.string().optional(),
  documentation_url: z.string().url().optional(),
  repository_url: z.string().url().optional(),
  support_url: z.string().url().optional()
});

// ---------- The manifest ----------

export const ManifestSchema = z.object({
  identity: ManifestIdentitySchema,
  platform: ManifestPlatformSchema,
  capabilities: ManifestCapabilitiesSchema.default({ provides: [], provides_optional: [] }),
  dependencies: ManifestDependenciesSchema.default({
    requires: [],
    requires_optional: [],
    platform_capabilities_required: []
  }),
  schema: ManifestSchemaBlockSchema,
  migrations: ManifestMigrationsSchema,
  permissions: z.array(ManifestPermissionSchema).default([]),
  events_produced: z.array(ManifestEventProducedSchema).default([]),
  events_consumed: z.array(ManifestEventConsumedSchema).default([]),
  metadata: ManifestMetadataSchema
});

export type Manifest = z.infer<typeof ManifestSchema>;

/** Current manifest schema version. */
export const MANIFEST_SCHEMA_VERSION = '1' as const;
