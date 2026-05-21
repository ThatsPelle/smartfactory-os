/**
 * Well-known capability keys.
 *
 * Capabilities are versioned contracts that modules `provide` and `require`
 * (instead of depending on each other by name). This makes alternative
 * implementations swappable — a community module can provide
 * `warehouse.inventory_tracking@1` and satisfy every consumer.
 *
 * Format: `<key>@<major-version>`. Within a major version, contracts evolve
 * additively (consumers tolerant of unknown fields).
 *
 * Modules contribute their own capability keys through their manifests; the
 * constants below cover the platform itself.
 */

// ---------- Core platform capabilities ----------

export const CORE_CAPABILITIES = {
  TENANCY: 'core.tenancy@1',
  EVENT_BUS: 'core.event_bus@1',
  AUDIT_LOG: 'core.audit_log@1',
  NOTIFICATIONS: 'core.notifications@1',
  WORKSPACE_ENGINE: 'core.workspace_engine@1',
  I18N: 'core.i18n@1',
  MODULE_REGISTRY: 'core.module_registry@1'
} as const;
export type CoreCapability = (typeof CORE_CAPABILITIES)[keyof typeof CORE_CAPABILITIES];

// ---------- IAM capabilities ----------

export const IAM_CAPABILITIES = {
  RBAC: 'iam.rbac@1',
  AUTHENTICATION: 'iam.authentication@1',
  SERVICE_PRINCIPALS: 'iam.service_principals@1'
} as const;
export type IamCapability = (typeof IAM_CAPABILITIES)[keyof typeof IAM_CAPABILITIES];

// ---------- Union ----------

export type PlatformCapability = CoreCapability | IamCapability;

/** All platform capabilities flat (for module pre-flight requirement checks). */
export const ALL_PLATFORM_CAPABILITIES = [
  ...Object.values(CORE_CAPABILITIES),
  ...Object.values(IAM_CAPABILITIES)
] as const satisfies readonly PlatformCapability[];
