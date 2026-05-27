import { eq, sql } from 'drizzle-orm';
import { newULID } from '@sfos/events';
import { Ok, Err, OkVoid } from '@sfos/contracts/result';
import type { Result } from '@sfos/contracts/result';

import { verifyPassword } from '../../internal/password-hash.js';
import { generateOpaqueToken, hashToken } from '../../internal/session-token.js';
import { isLocked, nextLockoutState, resetLockoutState } from '../../internal/lockout.js';
import { credentials, sessions } from '../db/schema.js';
import { buildIamEnvelope, IAM_EVENTS, systemActor, userActor } from '../events.js';
import { ACCESS_TOKEN_TTL_MS, REFRESH_TOKEN_TTL_MS } from '../constants.js';
import type { IamServiceCtx } from '../context.js';
import type { IamError } from '../errors.js';
import type {
  LoginInput,
  LoginOutput,
  LogoutInput,
  ValidateSessionInput,
  ValidateSessionOutput
} from '../../contracts/login.js';

export const login = async (
  ctx: Omit<IamServiceCtx, 'actorUserId'>,
  input: LoginInput
): Promise<Result<LoginOutput, IamError>> => {
  const { systemDb, events, logger, correlationId, companyId } = ctx;

  // 1. Lookup user by email — raw SQL because core.users is outside module_iam schema.
  const userRows = (await systemDb.execute(
    sql`SELECT id FROM core.users WHERE lower(email) = ${input.email.toLowerCase()} LIMIT 1`
  )) as Array<{ id: string }>;

  // Do not reveal whether the email exists — always return invalid_credentials.
  if (!userRows[0]) {
    logger.warn('login: email not found', { email: input.email });
    return Err({ code: 'invalid_credentials' });
  }
  const userId = userRows[0].id;

  // 2. Fetch credentials.
  const cred = await systemDb.query.credentials.findFirst({
    where: eq(credentials.userId, userId)
  });
  if (!cred) {
    logger.warn('login: no credentials for user', { userId });
    return Err({ code: 'invalid_credentials' });
  }

  // 3. Lockout check.
  const lockState = { failedAttempts: cred.failedAttempts, lockedUntil: cred.lockedUntil ?? null };
  if (isLocked(lockState)) {
    return Err({ code: 'account_locked', lockedUntil: cred.lockedUntil! });
  }

  // 4. Verify password.
  const valid = await verifyPassword(cred.passwordHash, input.password);
  if (!valid) {
    const next = nextLockoutState(lockState);
    await systemDb
      .update(credentials)
      .set({ failedAttempts: next.failedAttempts, lockedUntil: next.lockedUntil })
      .where(eq(credentials.userId, userId));

    await events.emit(
      buildIamEnvelope({
        type: IAM_EVENTS.AUTH_FAILED,
        version: '1.0',
        company_id: companyId,
        emitted_by: systemActor(),
        correlation_id: correlationId,
        payload: { userId, reason: 'invalid_password', failedAttempts: next.failedAttempts },
        audit_required: true
      })
    );

    if (isLocked(next)) {
      await events.emit(
        buildIamEnvelope({
          type: IAM_EVENTS.CREDENTIAL_LOCKED,
          version: '1.0',
          company_id: companyId,
          emitted_by: systemActor(),
          correlation_id: correlationId,
          payload: { userId, lockedUntil: next.lockedUntil },
          audit_required: true
        })
      );
    }

    return Err({ code: 'invalid_credentials' });
  }

  // 5. Create session atomically with lockout reset.
  const accessToken = generateOpaqueToken();
  const refreshToken = generateOpaqueToken();
  const sessionId = newULID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_MS);
  const refreshExpiresAt = new Date(now.getTime() + REFRESH_TOKEN_TTL_MS);
  const reset = resetLockoutState();

  await systemDb.transaction(async (tx) => {
    await tx
      .update(credentials)
      .set({ failedAttempts: reset.failedAttempts, lockedUntil: reset.lockedUntil })
      .where(eq(credentials.userId, userId));

    await tx.insert(sessions).values({
      id: sessionId,
      userId,
      companyId: companyId as string,
      accessTokenHash: hashToken(accessToken),
      refreshTokenHash: hashToken(refreshToken),
      expiresAt,
      refreshExpiresAt
    });
  });

  await events.emit(
    buildIamEnvelope({
      type: IAM_EVENTS.SESSION_CREATED,
      version: '1.0',
      company_id: companyId,
      emitted_by: userActor(userId),
      correlation_id: correlationId,
      source_entity_id: sessionId,
      payload: { sessionId, userId },
      audit_required: false
    })
  );

  return Ok({
    accessToken,
    refreshToken,
    expiresAt: expiresAt.toISOString(),
    refreshExpiresAt: refreshExpiresAt.toISOString(),
    sessionId,
    userId
  });
};

export const logout = async (
  ctx: IamServiceCtx,
  input: LogoutInput
): Promise<Result<void, IamError>> => {
  const { systemDb, events, correlationId, companyId, actorUserId } = ctx;

  const session = await systemDb.query.sessions.findFirst({
    where: eq(sessions.id, input.sessionId)
  });

  if (
    !session ||
    session.companyId !== (companyId as string) ||
    session.userId !== (actorUserId as string | undefined)
  ) {
    return Err({ code: 'session_not_found' });
  }

  // Don't re-revoke an already-revoked session.
  if (session.revokedAt !== null) {
    return Err({ code: 'session_revoked' });
  }

  await systemDb
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.id, input.sessionId));

  await events.emit(
    buildIamEnvelope({
      type: IAM_EVENTS.SESSION_REVOKED,
      version: '1.0',
      company_id: companyId,
      emitted_by: userActor(actorUserId as string),
      correlation_id: correlationId,
      source_entity_id: input.sessionId,
      payload: { sessionId: input.sessionId, userId: actorUserId },
      audit_required: true
    })
  );

  return OkVoid();
};

export const validateSession = async (
  ctx: Omit<IamServiceCtx, 'actorUserId'>,
  input: ValidateSessionInput
): Promise<Result<ValidateSessionOutput, IamError>> => {
  const { systemDb } = ctx;
  const tokenHash = hashToken(input.accessToken);

  const session = await systemDb.query.sessions.findFirst({
    where: eq(sessions.accessTokenHash, tokenHash)
  });

  if (!session) return Err({ code: 'session_not_found' });
  if (session.revokedAt !== null) return Err({ code: 'session_revoked' });
  if (session.expiresAt <= new Date()) return Err({ code: 'session_expired' });

  return Ok({
    userId: session.userId,
    companyId: session.companyId,
    sessionId: session.id
  });
};
