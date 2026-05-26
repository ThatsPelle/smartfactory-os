import { z } from 'zod';

/**
 * Safe for client consumption. Token hashes, IP metadata, and revocation
 * internals are intentionally absent.
 */
export const SessionPublicViewSchema = z.object({
  id: z.string(),
  companyId: z.string().uuid(),
  createdAt: z.string().datetime(),
  expiresAt: z.string().datetime(),
  isCurrentSession: z.boolean().optional()
});
export type SessionPublicView = z.infer<typeof SessionPublicViewSchema>;

/**
 * Full session record for service-layer use only.
 * MUST NOT be returned to API callers.
 */
export const SessionInternalViewSchema = z.object({
  id: z.string(),
  userId: z.string().uuid(),
  companyId: z.string().uuid(),
  accessTokenHash: z.string(),
  refreshTokenHash: z.string(),
  expiresAt: z.date(),
  refreshExpiresAt: z.date(),
  revokedAt: z.date().nullable(),
  rotatedFromSessionId: z.string().nullable(),
  createdAt: z.date()
});
export type SessionInternalView = z.infer<typeof SessionInternalViewSchema>;
