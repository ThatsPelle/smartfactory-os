import { describe, expect, it, beforeAll, afterAll } from 'vitest';

import { generateOpaqueToken, hashToken } from '../src/internal/session-token.js';

describe('session-token', () => {
  it('generates unique tokens each call', () => {
    const tokens = new Set(Array.from({ length: 20 }, generateOpaqueToken));
    expect(tokens.size).toBe(20);
  });

  it('token decodes to at least 32 bytes', () => {
    const token = generateOpaqueToken();
    const bytes = Buffer.from(token, 'base64url');
    expect(bytes.length).toBeGreaterThanOrEqual(32);
  });

  it('hashToken is deterministic', () => {
    const token = generateOpaqueToken();
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it('different tokens produce different hashes', () => {
    const t1 = generateOpaqueToken();
    const t2 = generateOpaqueToken();
    expect(hashToken(t1)).not.toBe(hashToken(t2));
  });

  it('hash is 64-char hex (SHA-256)', () => {
    const h = hashToken(generateOpaqueToken());
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});

// ============================================================
// Integration tests — skipped when TEST_DATABASE_URL is unset
// ============================================================
import { createIamDb } from '../src/server/db/client.js';
import { login, logout, validateSession } from '../src/server/api/auth.js';
import { makeIamCtx, seedUser, cleanup } from './helpers.js';
import type { IamServiceCtx } from '../src/server/context.js';

const DB_URL = process.env['TEST_DATABASE_URL'];

describe.skipIf(!DB_URL)('auth service — integration', () => {
  let iamClient: ReturnType<typeof createIamDb>;

  beforeAll(async () => {
    iamClient = createIamDb(DB_URL!);
  });

  afterAll(async () => {
    await cleanup(iamClient.db);
    await iamClient.close();
  });

  it('login returns tokens for valid credentials', async () => {
    const { userId } = await seedUser(iamClient.db, 'alice@test.example', 'Password123!');
    const { ctx } = makeIamCtx(iamClient.db);
    const result = await login(ctx, { email: 'alice@test.example', password: 'Password123!' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.accessToken).toBeTruthy();
    expect(result.value.userId).toBe(userId);
  });

  it('login returns invalid_credentials for wrong password', async () => {
    await seedUser(iamClient.db, 'bob@test.example', 'CorrectPassword!');
    const { ctx } = makeIamCtx(iamClient.db);
    const result = await login(ctx, { email: 'bob@test.example', password: 'WrongPassword!' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('invalid_credentials');
  });

  it('validateSession returns output for a valid token', async () => {
    await seedUser(iamClient.db, 'carol@test.example', 'SecurePass123!');
    const { ctx } = makeIamCtx(iamClient.db);
    const loginResult = await login(ctx, {
      email: 'carol@test.example',
      password: 'SecurePass123!'
    });
    expect(loginResult.ok).toBe(true);
    if (!loginResult.ok) return;
    const validateResult = await validateSession(ctx, {
      accessToken: loginResult.value.accessToken
    });
    expect(validateResult.ok).toBe(true);
    if (!validateResult.ok) return;
    expect(validateResult.value.userId).toBe(loginResult.value.userId);
  });

  it('validateSession returns session_revoked for a revoked session', async () => {
    const { userId } = await seedUser(iamClient.db, 'dave@test.example', 'SecurePass123!');
    const { ctx } = makeIamCtx(iamClient.db, {
      actorUserId: userId as IamServiceCtx['actorUserId']
    });
    const loginResult = await login(ctx, {
      email: 'dave@test.example',
      password: 'SecurePass123!'
    });
    expect(loginResult.ok).toBe(true);
    if (!loginResult.ok) return;

    await logout(ctx as IamServiceCtx, { sessionId: loginResult.value.sessionId });
    const validateResult = await validateSession(ctx, {
      accessToken: loginResult.value.accessToken
    });
    expect(validateResult.ok).toBe(false);
    if (validateResult.ok) return;
    expect(validateResult.error.code).toBe('session_revoked');
  });
});
