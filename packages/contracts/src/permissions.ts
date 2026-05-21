/**
 * Well-known permission keys.
 *
 * Platform-level permissions (core, IAM, workspace, audit) live here as
 * constants. Modules contribute their own permission keys via their manifest;
 * those are loaded into the platform's catalog at module activation.
 *
 * Rule: code referencing a permission MUST use a constant from this file
 * (for platform permissions) or from the relevant module's permissions.ts
 * (for module-scoped permissions). String literals are forbidden — see
 * planned ESLint rule `no-permission-string-literal`.
 *
 * Naming: `<scope>.<resource>.<action>`. Verbs from a small, opinionated set:
 *   read | write | delete | approve | execute | manage | export | audit
 */

// ---------- Core ----------

export const CORE_PERMISSIONS = {
  COMPANY_READ: 'core.company.read',
  COMPANY_WRITE: 'core.company.write',
  COMPANY_DELETE: 'core.company.delete',
  USER_INVITE: 'core.user.invite',
  USER_DELETE: 'core.user.delete',
  MODULE_ACTIVATE: 'core.module.activate',
  MODULE_DEACTIVATE: 'core.module.deactivate',
  SETTINGS_READ: 'core.settings.read',
  SETTINGS_WRITE: 'core.settings.write',
  NOTIFICATION_READ: 'core.notification.read'
} as const;
export type CorePermission = (typeof CORE_PERMISSIONS)[keyof typeof CORE_PERMISSIONS];

// ---------- IAM ----------

export const IAM_PERMISSIONS = {
  USER_READ: 'iam.user.read',
  USER_WRITE: 'iam.user.write',
  ROLE_READ: 'iam.role.read',
  ROLE_MANAGE: 'iam.role.manage',
  MEMBERSHIP_READ: 'iam.membership.read',
  MEMBERSHIP_WRITE: 'iam.membership.write',
  AUDIT_READ: 'iam.audit.read'
} as const;
export type IamPermission = (typeof IAM_PERMISSIONS)[keyof typeof IAM_PERMISSIONS];

// ---------- Workspace ----------

export const WORKSPACE_PERMISSIONS = {
  WORKSPACE_READ: 'workspace.workspace.read',
  WORKSPACE_WRITE: 'workspace.workspace.write',
  DASHBOARD_READ: 'workspace.dashboard.read',
  DASHBOARD_WRITE: 'workspace.dashboard.write',
  DASHBOARD_SHARE: 'workspace.dashboard.share',
  TEMPLATE_MANAGE: 'workspace.template.manage'
} as const;
export type WorkspacePermission =
  (typeof WORKSPACE_PERMISSIONS)[keyof typeof WORKSPACE_PERMISSIONS];

// ---------- Audit ----------

export const AUDIT_PERMISSIONS = {
  LOG_READ: 'audit.log.read',
  LOG_EXPORT: 'audit.log.export'
} as const;
export type AuditPermission = (typeof AUDIT_PERMISSIONS)[keyof typeof AUDIT_PERMISSIONS];

// ---------- Union ----------

export type PlatformPermission =
  | CorePermission
  | IamPermission
  | WorkspacePermission
  | AuditPermission;

/** All platform permission keys as a flat readonly array (for catalog seeding). */
export const ALL_PLATFORM_PERMISSIONS = [
  ...Object.values(CORE_PERMISSIONS),
  ...Object.values(IAM_PERMISSIONS),
  ...Object.values(WORKSPACE_PERMISSIONS),
  ...Object.values(AUDIT_PERMISSIONS)
] as const satisfies readonly PlatformPermission[];
