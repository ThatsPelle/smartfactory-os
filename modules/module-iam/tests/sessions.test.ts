import { describe, expect, it } from 'vitest';

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
