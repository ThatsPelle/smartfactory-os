export * from './contracts/index.js';

export type { IamError } from './server/errors.js';

export { IAM_EVENTS } from './server/events.js';
export type { IamEventType } from './server/events.js';

export { IAM_PERMISSIONS } from './server/permissions.js';

export { login, logout, validateSession } from './server/api/auth.js';

export { createInvitation, acceptInvitation, revokeInvitation } from './server/api/invitations.js';

export { listSessions, revokeSession, revokeAllSessions } from './server/api/sessions.js';

export { requestPasswordReset, consumePasswordReset } from './server/api/password.js';

export { lifecycle } from './server/index.js';
