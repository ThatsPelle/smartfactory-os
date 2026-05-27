import { defineManifest } from '@sfos/module-sdk';
import { IAM_MODULE_ID } from './server/constants.js';
import { IAM_EVENTS } from './server/events.js';

export default defineManifest({
  identity: {
    id: IAM_MODULE_ID,
    name: 'Identity & Access Management',
    version: '0.1.0',
    vendor: 'SmartFactoryOS',
    license: 'AGPL-3.0-or-later'
  },
  platform: {
    manifest_schema_version: '1',
    platform_version_range: '>=0.0.0',
    runtime_modes_supported: ['cloud', 'self_hosted', 'workstation']
  },
  capabilities: {
    provides: [{ key: 'iam.auth@1' }],
    provides_optional: []
  },
  dependencies: {
    requires: [],
    requires_optional: [],
    platform_capabilities_required: []
  },
  schema: {
    namespace: 'module_iam',
    owns_tables: ['credentials', 'sessions', 'invitations', 'password_reset_tokens'],
    published_views: []
  },
  migrations: {
    directory: 'src/migrations',
    ordering: 'sequential'
  },
  permissions: [
    { key: 'iam.session.read',               default_roles: ['member', 'admin'], scope: 'tenant' },
    { key: 'iam.session.revoke',             default_roles: ['member', 'admin'], scope: 'tenant' },
    { key: 'iam.invitation.create',          default_roles: ['admin'],           scope: 'tenant' },
    { key: 'iam.invitation.read',            default_roles: ['member', 'admin'], scope: 'tenant' },
    { key: 'iam.invitation.revoke',          default_roles: ['admin'],           scope: 'tenant' },
    { key: 'iam.credential.change_password', default_roles: ['member', 'admin'], scope: 'tenant' }
  ],
  events_produced: [
    { type: IAM_EVENTS.SESSION_CREATED,                     version: '1.0', audit_required: true,  ai_readable: false, since_module_version: '0.1.0' },
    { type: IAM_EVENTS.SESSION_REVOKED,                     version: '1.0', audit_required: true,  ai_readable: false, since_module_version: '0.1.0' },
    { type: IAM_EVENTS.AUTH_FAILED,                         version: '1.0', audit_required: true,  ai_readable: false, since_module_version: '0.1.0' },
    { type: IAM_EVENTS.INVITATION_CREATED,                  version: '1.0', audit_required: true,  ai_readable: false, since_module_version: '0.1.0' },
    { type: IAM_EVENTS.INVITATION_ACCEPTED,                 version: '1.0', audit_required: true,  ai_readable: false, since_module_version: '0.1.0' },
    { type: IAM_EVENTS.INVITATION_REVOKED,                  version: '1.0', audit_required: true,  ai_readable: false, since_module_version: '0.1.0' },
    { type: IAM_EVENTS.CREDENTIAL_PASSWORD_CHANGED,         version: '1.0', audit_required: true,  ai_readable: false, since_module_version: '0.1.0' },
    { type: IAM_EVENTS.CREDENTIAL_LOCKED,                   version: '1.0', audit_required: true,  ai_readable: false, since_module_version: '0.1.0' },
    { type: IAM_EVENTS.CREDENTIAL_PASSWORD_RESET_REQUESTED, version: '1.0', audit_required: true,  ai_readable: false, since_module_version: '0.1.0' }
  ],
  events_consumed: [],
  metadata: {
    description: 'Identity and Access Management — authentication, sessions, invitations, and password reset.'
  }
});
