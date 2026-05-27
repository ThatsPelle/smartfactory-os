import { buildEnvelope } from '@sfos/events';
import type { BuildEnvelopeInput, EventEnvelope, EventActor } from '@sfos/events';

import { IAM_MODULE_ID } from './constants.js';

export const IAM_EVENTS = {
  SESSION_CREATED: 'iam.session.created',
  SESSION_REVOKED: 'iam.session.revoked',
  AUTH_FAILED: 'iam.auth.failed',
  INVITATION_CREATED: 'iam.invitation.created',
  INVITATION_ACCEPTED: 'iam.invitation.accepted',
  INVITATION_REVOKED: 'iam.invitation.revoked',
  CREDENTIAL_PASSWORD_CHANGED: 'iam.credential.password_changed',
  CREDENTIAL_LOCKED: 'iam.credential.locked',
  CREDENTIAL_PASSWORD_RESET_REQUESTED: 'iam.credential.password_reset_requested'
} as const;

export type IamEventType = (typeof IAM_EVENTS)[keyof typeof IAM_EVENTS];

type IamEnvelopeInput = Omit<BuildEnvelopeInput, 'source_module'>;

export const buildIamEnvelope = (input: IamEnvelopeInput): EventEnvelope =>
  buildEnvelope({ ...input, source_module: IAM_MODULE_ID });

export const systemActor = (): EventActor => ({
  kind: 'system',
  id: IAM_MODULE_ID
});

export const userActor = (userId: string): EventActor => ({
  kind: 'user',
  id: userId
});
