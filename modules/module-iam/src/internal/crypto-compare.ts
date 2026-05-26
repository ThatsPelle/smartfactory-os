import { timingSafeEqual, createHash } from 'node:crypto';

/**
 * Constant-time string equality via SHA-256 pre-hashing.
 * Both inputs are hashed to a fixed 32-byte digest before comparison,
 * so the timingSafeEqual call is always on equal-length buffers.
 *
 * Use for all token hash comparisons to prevent timing attacks.
 */
export const safeEqual = (a: string, b: string): boolean => {
  const hashA = createHash('sha256').update(a, 'utf8').digest();
  const hashB = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(hashA, hashB);
};
