export const LOCKOUT_THRESHOLD = 5;
export const LOCKOUT_DURATION_MS = 15 * 60 * 1000;

export interface LockoutState {
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
}

export const isLocked = (state: LockoutState): boolean => {
  if (state.lockedUntil === null) return false;
  return state.lockedUntil > new Date();
};

export const nextLockoutState = (current: LockoutState): LockoutState => {
  const failedAttempts = current.failedAttempts + 1;
  if (failedAttempts >= LOCKOUT_THRESHOLD) {
    return { failedAttempts, lockedUntil: new Date(Date.now() + LOCKOUT_DURATION_MS) };
  }
  return { failedAttempts, lockedUntil: null };
};

export const resetLockoutState = (): LockoutState => ({
  failedAttempts: 0,
  lockedUntil: null
});
