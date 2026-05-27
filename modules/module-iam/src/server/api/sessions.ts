import { and, eq, gt, isNull, sql } from 'drizzle-orm';
import { Ok, Err, OkVoid } from '@sfos/contracts/result';
import type { Result } from '@sfos/contracts/result';
import type { UserId } from '@sfos/contracts';

import { sessions } from '../db/schema.js';
import { buildIamEnvelope, IAM_EVENTS, userActor } from '../events.js';
import type { IamServiceCtx } from '../context.js';
import type { IamError } from '../errors.js';
import type { SessionPublicView } from '../../contracts/session.js';

type AuthedCtx = IamServiceCtx & { actorUserId: UserId };

export const listSessions = async (
  ctx: AuthedCtx
): Promise<Result<SessionPublicView[], IamError>> => {
  const { systemDb, companyId, actorUserId } = ctx;
  const now = new Date();

  const rows = await systemDb.query.sessions.findMany({
    where: and(
      eq(sessions.userId, actorUserId as string),
      eq(sessions.companyId, companyId as string),
      isNull(sessions.revokedAt),
      gt(sessions.refreshExpiresAt, now)
    )
  });

  return Ok(
    rows.map((s) => ({
      id: s.id,
      companyId: s.companyId,
      createdAt: s.createdAt.toISOString(),
      expiresAt: s.expiresAt.toISOString()
    }))
  );
};

export const revokeSession = async (
  ctx: AuthedCtx,
  sessionId: string
): Promise<Result<void, IamError>> => {
  const { systemDb, events, correlationId, companyId, actorUserId } = ctx;

  const updated = await systemDb.execute(sql`
    UPDATE module_iam.sessions
    SET    revoked_at = now()
    WHERE  id         = ${sessionId}
      AND  user_id    = ${actorUserId as string}::uuid
      AND  company_id = ${companyId as string}::uuid
      AND  revoked_at IS NULL
    RETURNING id
  `) as Array<{ id: string }>;

  if (!updated[0]) return Err({ code: 'session_not_found' });

  await events.emit(buildIamEnvelope({
    type: IAM_EVENTS.SESSION_REVOKED,
    version: '1.0',
    company_id: companyId,
    emitted_by: userActor(actorUserId as string),
    correlation_id: correlationId,
    source_entity_id: sessionId,
    payload: { sessionId, userId: actorUserId },
    audit_required: true
  }));

  return OkVoid();
};

export const revokeAllSessions = async (
  ctx: AuthedCtx
): Promise<Result<{ count: number }, IamError>> => {
  const { systemDb, events, correlationId, companyId, actorUserId } = ctx;

  const updated = await systemDb.execute(sql`
    UPDATE module_iam.sessions
    SET    revoked_at = now()
    WHERE  user_id    = ${actorUserId as string}::uuid
      AND  company_id = ${companyId as string}::uuid
      AND  revoked_at IS NULL
    RETURNING id
  `) as Array<{ id: string }>;

  await Promise.all(updated.map((s) => events.emit(buildIamEnvelope({
    type: IAM_EVENTS.SESSION_REVOKED,
    version: '1.0',
    company_id: companyId,
    emitted_by: userActor(actorUserId as string),
    correlation_id: correlationId,
    source_entity_id: s.id,
    payload: { sessionId: s.id, userId: actorUserId },
    audit_required: true
  }))));

  return Ok({ count: updated.length });
};
