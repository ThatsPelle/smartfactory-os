import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createIamDb } from '../src/server/db/client.js';
import { requestPasswordReset, consumePasswordReset } from '../src/server/api/password.js';
import { login } from '../src/server/api/auth.js';
import { makeIamCtx, seedUser, seedMembership, cleanup } from './helpers.js';
import { IAM_EVENTS } from '../src/server/events.js';

const DB_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!DB_URL)('password reset — integration', () => {
  let iamClient: ReturnType<typeof createIamDb>;

  beforeAll(async () => { iamClient = createIamDb(DB_URL!); });
  afterAll(async () => { await cleanup(iamClient.db); await iamClient.close(); });

  it('requestPasswordReset returns Ok(null) for unknown email (no user enumeration)', async () => {
    const { ctx } = makeIamCtx(iamClient.db);
    const result = await requestPasswordReset(ctx, { email: 'nobody@test.example' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toBeNull();
  });

  it('reset flow: request → consume → login with new password succeeds', async () => {
    const { userId } = await seedUser(iamClient.db, 'resetme@test.example', 'OldPassword123!');
    await seedMembership(iamClient.db, userId);
    const { ctx, emitted } = makeIamCtx(iamClient.db);

    const reqResult = await requestPasswordReset(ctx, { email: 'resetme@test.example' });
    expect(reqResult.ok).toBe(true);
    if (!reqResult.ok || !reqResult.value) return;

    const consumeResult = await consumePasswordReset(ctx, {
      token: reqResult.value.token,
      newPassword: 'NewPassword456!'
    });
    expect(consumeResult.ok).toBe(true);
    expect(emitted.some((e) => e.type === IAM_EVENTS.CREDENTIAL_PASSWORD_CHANGED)).toBe(true);

    const loginResult = await login(ctx, { email: 'resetme@test.example', password: 'NewPassword456!' });
    expect(loginResult.ok).toBe(true);
  });

  it('consuming the same token twice returns reset_token_consumed', async () => {
    const { userId } = await seedUser(iamClient.db, 'doubleconsume@test.example', 'Pass123!');
    await seedMembership(iamClient.db, userId);
    const { ctx } = makeIamCtx(iamClient.db);

    const reqResult = await requestPasswordReset(ctx, { email: 'doubleconsume@test.example' });
    expect(reqResult.ok).toBe(true);
    if (!reqResult.ok || !reqResult.value) return;

    await consumePasswordReset(ctx, { token: reqResult.value.token, newPassword: 'NewPass123456!' });

    const second = await consumePasswordReset(ctx, {
      token: reqResult.value.token,
      newPassword: 'AnotherPass789!'
    });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe('reset_token_consumed');
  });
});
