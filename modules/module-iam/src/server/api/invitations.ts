import { sql } from 'drizzle-orm';
import { withTenantContext } from '@sfos/db';
import { asUserId } from '@sfos/contracts';
import { Ok, Err, OkVoid } from '@sfos/contracts/result';
import type { Result } from '@sfos/contracts/result';

import { generateOpaqueToken, hashToken } from '../../internal/session-token.js';
import { invitations } from '../db/schema.js';
import { buildIamEnvelope, IAM_EVENTS, userActor } from '../events.js';
import { INVITE_TTL_MS } from '../constants.js';
import type { IamServiceCtx } from '../context.js';
import type { IamError } from '../errors.js';
import type { InviteInput, InviteView, AcceptInvitationInput, RevokeInvitationInput } from '../../contracts/invite.js';

export const createInvitation = async (
  ctx: IamServiceCtx,
  input: InviteInput
): Promise<Result<{ token: string; invitation: InviteView }, IamError>> => {
  const { systemDb, events, correlationId, companyId, actorUserId } = ctx;

  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const [inv] = await systemDb
    .insert(invitations)
    .values({
      companyId: companyId as string,
      invitedEmail: input.email,
      invitedRole: input.role,
      invitedBy: actorUserId as string,
      tokenHash: hashToken(token),
      expiresAt
    })
    .returning();

  if (!inv) return Err({ code: 'invitation_not_found' });

  await events.emit(buildIamEnvelope({
    type: IAM_EVENTS.INVITATION_CREATED,
    version: '1.0',
    company_id: companyId,
    emitted_by: userActor(actorUserId as string),
    correlation_id: correlationId,
    source_entity_id: inv.id,
    payload: { invitationId: inv.id, email: input.email, role: input.role },
    audit_required: true
  }));

  return Ok({
    token,
    invitation: {
      id: inv.id,
      email: inv.invitedEmail,
      role: inv.invitedRole,
      status: inv.status,
      invitedBy: inv.invitedBy,
      expiresAt: inv.expiresAt.toISOString(),
      createdAt: inv.createdAt.toISOString()
    }
  });
};

export const acceptInvitation = async (
  ctx: Omit<IamServiceCtx, 'actorUserId'>,
  input: AcceptInvitationInput
): Promise<Result<void, IamError>> => {
  const { systemDb, tenantDb, events, correlationId, companyId } = ctx;
  const tokenHash = hashToken(input.token);

  // Atomic consume: only updates the row if status = 'pending' AND not expired.
  const consumed = await systemDb.execute(sql`
    UPDATE module_iam.invitations
    SET    status      = 'accepted',
           accepted_at = now(),
           accepted_by = ${input.acceptingUserId}::uuid
    WHERE  token_hash  = ${tokenHash}
      AND  status      = 'pending'
      AND  expires_at  > now()
    RETURNING id, company_id, invited_email, invited_role, status
  `) as Array<{ id: string; company_id: string; invited_email: string; invited_role: string; status: string }>;

  if (!consumed[0]) {
    const existing = await systemDb.execute(sql`
      SELECT status FROM module_iam.invitations
      WHERE token_hash = ${tokenHash} AND company_id = ${companyId as string}::uuid
      LIMIT 1
    `) as Array<{ status: string }>;

    if (!existing[0]) return Err({ code: 'invitation_not_found' });
    if (existing[0].status === 'accepted') return Err({ code: 'invitation_already_accepted' });
    if (existing[0].status === 'revoked')  return Err({ code: 'invitation_already_revoked' });
    return Err({ code: 'invitation_expired' });
  }

  const inv = consumed[0];

  // Write membership through app_tenant RLS — IAM never bypasses core policies.
  await withTenantContext(
    tenantDb,
    { companyId, userId: asUserId(input.acceptingUserId) },
    async (tx) => {
      await tx.execute(sql`
        INSERT INTO core.memberships (user_id, company_id, role)
        VALUES (${input.acceptingUserId}::uuid, ${companyId as string}::uuid, ${inv.invited_role}::membership_role)
        ON CONFLICT ON CONSTRAINT memberships_user_company_unique DO NOTHING
      `);
    }
  );

  await events.emit(buildIamEnvelope({
    type: IAM_EVENTS.INVITATION_ACCEPTED,
    version: '1.0',
    company_id: companyId,
    emitted_by: userActor(input.acceptingUserId),
    correlation_id: correlationId,
    source_entity_id: inv.id,
    payload: { invitationId: inv.id, acceptedBy: input.acceptingUserId, role: inv.invited_role },
    audit_required: true
  }));

  return OkVoid();
};

export const revokeInvitation = async (
  ctx: IamServiceCtx,
  input: RevokeInvitationInput
): Promise<Result<void, IamError>> => {
  const { systemDb, events, correlationId, companyId, actorUserId } = ctx;

  const revoked = await systemDb.execute(sql`
    UPDATE module_iam.invitations
    SET    status     = 'revoked',
           revoked_at = now(),
           revoked_by = ${actorUserId as string}::uuid
    WHERE  id         = ${input.invitationId}::uuid
      AND  company_id = ${companyId as string}::uuid
      AND  status     = 'pending'
    RETURNING id
  `) as Array<{ id: string }>;

  if (!revoked[0]) {
    const existing = await systemDb.execute(sql`
      SELECT status FROM module_iam.invitations
      WHERE id = ${input.invitationId}::uuid AND company_id = ${companyId as string}::uuid LIMIT 1
    `) as Array<{ status: string }>;

    if (!existing[0]) return Err({ code: 'invitation_not_found' });
    if (existing[0].status === 'revoked')  return Err({ code: 'invitation_already_revoked' });
    if (existing[0].status === 'accepted') return Err({ code: 'invitation_already_accepted' });
    return Err({ code: 'invitation_expired' });
  }

  await events.emit(buildIamEnvelope({
    type: IAM_EVENTS.INVITATION_REVOKED,
    version: '1.0',
    company_id: companyId,
    emitted_by: userActor(actorUserId as string),
    correlation_id: correlationId,
    source_entity_id: revoked[0].id,
    payload: { invitationId: revoked[0].id, revokedBy: actorUserId },
    audit_required: true
  }));

  return OkVoid();
};
