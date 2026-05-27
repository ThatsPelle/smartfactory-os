import type { PermissionKey } from '@sfos/contracts';

export const IAM_PERMISSIONS = {
  SESSION_READ: 'iam.session.read' as PermissionKey,
  SESSION_REVOKE: 'iam.session.revoke' as PermissionKey,
  INVITATION_CREATE: 'iam.invitation.create' as PermissionKey,
  INVITATION_READ: 'iam.invitation.read' as PermissionKey,
  INVITATION_REVOKE: 'iam.invitation.revoke' as PermissionKey,
  CREDENTIAL_CHANGE_PW: 'iam.credential.change_password' as PermissionKey
} as const;
