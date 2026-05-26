import { describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../src/internal/password-hash.js';
import { safeEqual } from '../src/internal/crypto-compare.js';
import {
  isLocked,
  nextLockoutState,
  resetLockoutState,
  LOCKOUT_THRESHOLD,
  LOCKOUT_DURATION_MS
} from '../src/internal/lockout.js';

describe('password-hash', () => {
  it('hashes and verifies correctly', async () => {
    const h = await hashPassword('correct-horse-battery-staple');
    expect(await verifyPassword(h, 'correct-horse-battery-staple')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
  });

  it('uses argon2id algorithm', async () => {
    const h = await hashPassword('test');
    expect(h).toMatch(/^\$argon2id\$/);
  });

  it('salts each hash (same input → different output)', async () => {
    const h1 = await hashPassword('same-password');
    const h2 = await hashPassword('same-password');
    expect(h1).not.toBe(h2);
  });
});

describe('crypto-compare', () => {
  it('returns true for equal strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings of same length', () => {
    expect(safeEqual('abc', 'xyz')).toBe(false);
  });

  it('returns false for strings of different length without throwing', () => {
    expect(safeEqual('short', 'a-much-longer-string')).toBe(false);
  });

  it('returns false for empty vs non-empty', () => {
    expect(safeEqual('', 'x')).toBe(false);
  });
});

describe('lockout', () => {
  const NOW = 1_000_000_000_000; // fixed ms timestamp for deterministic tests

  it('not locked with zero attempts', () => {
    expect(isLocked({ failedAttempts: 0, lockedUntil: null }, NOW)).toBe(false);
  });

  it('not locked below threshold', () => {
    let state = resetLockoutState();
    for (let i = 0; i < LOCKOUT_THRESHOLD - 1; i++) {
      state = nextLockoutState(state, NOW);
    }
    expect(isLocked(state, NOW)).toBe(false);
  });

  it('locks at threshold', () => {
    let state = resetLockoutState();
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      state = nextLockoutState(state, NOW);
    }
    expect(isLocked(state, NOW)).toBe(true);
    expect(state.lockedUntil).not.toBeNull();
    // lockedUntil should be exactly 15 minutes after NOW
    expect(state.lockedUntil!.getTime()).toBe(NOW + LOCKOUT_DURATION_MS);
  });

  it('expired lock is not active', () => {
    const past = new Date(NOW - 1);
    expect(isLocked({ failedAttempts: 10, lockedUntil: past }, NOW)).toBe(false);
  });

  it('resetLockoutState clears everything', () => {
    const state = resetLockoutState();
    expect(state.failedAttempts).toBe(0);
    expect(state.lockedUntil).toBeNull();
  });

  it('additional failed attempts past threshold extend lockedUntil', () => {
    let state = resetLockoutState();
    for (let i = 0; i < LOCKOUT_THRESHOLD; i++) {
      state = nextLockoutState(state, NOW);
    }
    // One more attempt after lock — lockedUntil updated with a later NOW
    const laterNow = NOW + 1000;
    const extended = nextLockoutState(state, laterNow);
    expect(extended.lockedUntil!.getTime()).toBe(laterNow + LOCKOUT_DURATION_MS);
    expect(extended.failedAttempts).toBe(LOCKOUT_THRESHOLD + 1);
  });
});
