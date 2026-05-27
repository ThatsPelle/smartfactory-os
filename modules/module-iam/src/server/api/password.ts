import { eq, sql } from 'drizzle-orm';
import { Ok, Err, OkVoid } from '@sfos/contracts/result';
import type { Result } from '@sfos/contracts/result';

import { generateOpaqueToken, hashToken } from '../../internal/session-token.js';
import { hashPassword } from '../../internal/password-hash.js';
import { credentials, passwordResetTokens } from '../db/schema.js';
import { buildIamEnvelope, IAM_EVENTS, systemActor, userActor } from '../events.js';
import { RESET_TOKEN_TTL_MS } from '../constants.js';
import type { IamServiceCtx } from '../context.js';
import type { IamError } from '../errors.js';
import type { PasswordResetRequestInput, PasswordResetInput } from '../../contracts/password.js';

export const requestPasswordReset = async (
  ctx: Omit<IamServiceCtx, 'actorUserId'>,
  input: PasswordResetRequestInput
): Promise<Result<{ token: string } | null, IamError>> => {
  const { systemDb, events, correlationId, companyId } = ctx;

  // Single JOIN ensures user exists AND is a member of this company.
  // Returns Ok(null) for unknown email OR non-member — no user enumeration.
  const userRows = await systemDb.execute(
    sql`SELECT u.id FROM core.users u
        JOIN core.memberships m ON m.user_id = u.id AND m.company_id = ${companyId as string}::uuid
        WHERE lower(u.email) = ${input.email.toLowerCase()}
        LIMIT 1`
  ) as Array<{ id: string }>;

  if (!userRows[0]) return Ok(null);
  const userId = userRows[0].id;

  const token = generateOpaqueToken();
  await systemDb.insert(passwordResetTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS)
  });

  await events.emit(buildIamEnvelope({
    type: IAM_EVENTS.CREDENTIAL_PASSWORD_RESET_REQUESTED,
    version: '1.0',
    company_id: companyId,
    emitted_by: systemActor(),
    correlation_id: correlationId,
    payload: { userId },
    audit_required: true
  }));

  return Ok({ token });
};

export const consumePasswordReset = async (
  ctx: Omit<IamServiceCtx, 'actorUserId'>,
  input: PasswordResetInput
): Promise<Result<void, IamError>> => {
  const { systemDb, events, correlationId, companyId } = ctx;
  const tokenHash = hashToken(input.token);

  // SELECT FOR UPDATE + UPDATE in one transaction — prevents double-consume race.
  const result = await systemDb.transaction(async (tx) => {
    const rows = await tx.execute(sql`
      SELECT id, user_id, consumed_at, expires_at
      FROM module_iam.password_reset_tokens
      WHERE token_hash = ${tokenHash}
      LIMIT 1
      FOR UPDATE
    `) as Array<{ id: string; user_id: string; consumed_at: unknown; expires_at: unknown }>;

    if (!rows[0]) return Err<IamError>({ code: 'reset_token_invalid' });
    const row = rows[0];

    if (row.consumed_at != null) return Err<IamError>({ code: 'reset_token_consumed' });
    if (new Date(row.expires_at as string).getTime() <= Date.now()) {
      return Err<IamError>({ code: 'reset_token_expired' });
    }

    await tx.execute(sql`
      UPDATE module_iam.password_reset_tokens
      SET consumed_at = now()
      WHERE id = ${row.id}::uuid
    `);

    const newHash = await hashPassword(input.newPassword);
    const credRows = await tx.update(credentials)
      .set({
        passwordHash: newHash,
        lastPasswordChangedAt: new Date(),
        failedAttempts: 0,
        lockedUntil: null
      })
      .where(eq(credentials.userId, row.user_id as string))
      .returning({ userId: credentials.userId });

    if (!credRows[0]) return Err<IamError>({ code: 'reset_token_invalid' });

    return Ok(row.user_id as string);
  });

  if (!result.ok) return Err(result.error);

  await events.emit(buildIamEnvelope({
    type: IAM_EVENTS.CREDENTIAL_PASSWORD_CHANGED,
    version: '1.0',
    company_id: companyId,
    emitted_by: userActor(result.value),
    correlation_id: correlationId,
    payload: { userId: result.value, method: 'reset' },
    audit_required: true
  }));

  return OkVoid();
};
