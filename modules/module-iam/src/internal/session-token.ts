import { randomBytes, createHash } from 'node:crypto';

/** Cryptographically random 32-byte token, base64url-encoded. Never stored. */
export const generateOpaqueToken = (): string =>
  randomBytes(32).toString('base64url');

/** SHA-256 hex digest. Stored in DB; plaintext never persisted. */
export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');
