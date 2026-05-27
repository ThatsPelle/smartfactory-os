import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import type { UserId } from '@sfos/contracts';
import { createIamDb } from '../src/server/db/client.js';
import { login, logout, validateSession } from '../src/server/api/auth.js';
import { createInvitation, acceptInvitation } from '../src/server/api/invitations.js';
import { requestPasswordReset, consumePasswordReset } from '../src/server/api/password.js';
import { makeIamCtx, seedUser, seedMembership, cleanup } from './helpers.js';

const DB_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!DB_URL)('adversarial security tests', () => {
  let iamClient: ReturnType<typeof createIamDb>;

  beforeAll(async () => {
    iamClient = createIamDb(DB_URL!);
  });

  afterEach(async () => {
    await cleanup(iamClient.db);
  });

  afterAll(async () => {
    await iamClient.close();
  });

  it('AUTH-1: unknown email returns invalid_credentials (no user enumeration)', async () => {
    await seedUser(iamClient.db, 'known@test.example', 'SecurePass123!');
    const { ctx } = makeIamCtx(iamClient.db);

    const unknownEmailResult = await login(ctx, {
      email: 'nobody@test.example',
      password: 'whatever'
    });
    const wrongPasswordResult = await login(ctx, {
      email: 'known@test.example',
      password: 'WrongPass!'
    });

    expect(unknownEmailResult.ok).toBe(false);
    expect(wrongPasswordResult.ok).toBe(false);
    if (unknownEmailResult.ok || wrongPasswordResult.ok) return;

    // Same error code — cannot distinguish "email not found" from "wrong password"
    expect(unknownEmailResult.error.code).toBe('invalid_credentials');
    expect(wrongPasswordResult.error.code).toBe('invalid_credentials');
  });

  it('AUTH-2: 5 failed attempts lock the account', async () => {
    await seedUser(iamClient.db, 'victim@test.example', 'CorrectPass123!');
    const { ctx } = makeIamCtx(iamClient.db);

    for (let i = 0; i < 5; i++) {
      const r = await login(ctx, { email: 'victim@test.example', password: 'WrongPass!' });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      // First 4 failures: invalid_credentials. 5th: still invalid_credentials (lockout applied, but error not changed).
      expect(r.error.code).toBe('invalid_credentials');
    }

    // 6th attempt: account is now locked
    const lockedResult = await login(ctx, { email: 'victim@test.example', password: 'WrongPass!' });
    expect(lockedResult.ok).toBe(false);
    if (lockedResult.ok) return;
    expect(lockedResult.error.code).toBe('account_locked');
  });

  it('SESSION-1: revoked access token returns session_revoked', async () => {
    const { userId } = await seedUser(iamClient.db, 'revoketest@test.example', 'Pass123!');
    const { ctx } = makeIamCtx(iamClient.db, { actorUserId: userId as unknown as UserId });

    const loginResult = await login(ctx, {
      email: 'revoketest@test.example',
      password: 'Pass123!'
    });
    expect(loginResult.ok).toBe(true);
    if (!loginResult.ok) return;

    const { accessToken, sessionId } = loginResult.value;

    // Revoke the session
    const logoutResult = await logout(ctx, { sessionId });
    expect(logoutResult.ok).toBe(true);

    // Validate with the now-revoked access token
    const validateResult = await validateSession(ctx, { accessToken });
    expect(validateResult.ok).toBe(false);
    if (validateResult.ok) return;
    expect(validateResult.error.code).toBe('session_revoked');
  });

  it('INVITE-1: concurrent accept of same invitation — exactly one wins', async () => {
    const { userId: adminId } = await seedUser(
      iamClient.db,
      'invite-admin@test.example',
      'Pass123!'
    );
    const { userId: user1Id } = await seedUser(iamClient.db, 'acceptor1@test.example', 'Pass123!');
    const { userId: user2Id } = await seedUser(iamClient.db, 'acceptor2@test.example', 'Pass123!');
    await seedMembership(iamClient.db, adminId);

    const { ctx } = makeIamCtx(iamClient.db, { actorUserId: adminId as unknown as UserId });

    // Create invitation for a shared email address
    const invResult = await createInvitation(ctx, {
      email: 'shared-acceptee@test.example',
      role: 'member'
    });
    expect(invResult.ok).toBe(true);
    if (!invResult.ok) return;

    // Fire two concurrent accept calls with different acceptingUserIds
    const [r1, r2] = await Promise.allSettled([
      acceptInvitation(ctx, { token: invResult.value.token, acceptingUserId: user1Id }),
      acceptInvitation(ctx, { token: invResult.value.token, acceptingUserId: user2Id })
    ]);

    // Both settled (no unhandled rejection)
    expect(r1.status).toBe('fulfilled');
    expect(r2.status).toBe('fulfilled');

    const v1 = r1.status === 'fulfilled' ? r1.value : null;
    const v2 = r2.status === 'fulfilled' ? r2.value : null;

    const successes = [v1, v2].filter((r) => r?.ok === true);
    const failures = [v1, v2].filter((r) => r?.ok === false);

    // Exactly one wins
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    // The loser gets invitation_already_accepted
    const loser = failures[0];
    if (!loser || loser.ok) return;
    expect(loser.error.code).toBe('invitation_already_accepted');
  });

  it('RESET-1: double-consume of reset token returns reset_token_consumed', async () => {
    const { userId } = await seedUser(iamClient.db, 'reset-victim@test.example', 'OldPass123!');
    await seedMembership(iamClient.db, userId);
    const { ctx } = makeIamCtx(iamClient.db);

    const reqResult = await requestPasswordReset(ctx, { email: 'reset-victim@test.example' });
    expect(reqResult.ok).toBe(true);
    if (!reqResult.ok || !reqResult.value) return;

    // First consume: succeeds
    const first = await consumePasswordReset(ctx, {
      token: reqResult.value.token,
      newPassword: 'NewPass456!'
    });
    expect(first.ok).toBe(true);

    // Second consume: must be rejected
    const second = await consumePasswordReset(ctx, {
      token: reqResult.value.token,
      newPassword: 'AnotherPass789!'
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('reset_token_consumed');
  });
});
