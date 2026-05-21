/**
 * Module-scoped permission keys.
 *
 * Format: `__MODULE_NAME__.<resource>.<action>`.
 * Verbs from the platform's small set: read | write | delete | approve |
 * execute | manage | export | audit.
 *
 * Constants are referenced from:
 *   - the manifest's `permissions` block (to seed into the catalog),
 *   - server-side authorization checks,
 *   - widget / route declarations in the manifest.
 *
 * Never use string literals at call sites — see planned ESLint rule
 * `no-permission-string-literal`.
 */
export const __MODULE_NAME___PERMISSIONS = {
  // Example shape — replace with real entries as the module grows:
  // ENTITY_READ: '__MODULE_NAME__.entity.read',
  // ENTITY_WRITE: '__MODULE_NAME__.entity.write',
} as const;

export type __MODULE_NAME___Permission =
  (typeof __MODULE_NAME___PERMISSIONS)[keyof typeof __MODULE_NAME___PERMISSIONS];
