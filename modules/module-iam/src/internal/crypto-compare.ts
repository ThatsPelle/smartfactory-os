import { timingSafeEqual } from 'node:crypto';

/**
 * Constant-time string equality. Returns false for different lengths without
 * leaking length information via early exit.
 *
 * Use for all token hash comparisons to prevent timing attacks.
 */
export const safeEqual = (a: string, b: string): boolean => {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Still run timingSafeEqual against a dummy buffer of same length as bufA
    // to avoid leaking bufA.length via timing.
    timingSafeEqual(bufA, Buffer.alloc(bufA.length));
    return false;
  }
  return timingSafeEqual(bufA, bufB);
};
