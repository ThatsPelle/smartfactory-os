import { z } from 'zod';

const MembershipRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);

export const InviteInputSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  role: MembershipRoleSchema.default('member')
});
export type InviteInput = z.infer<typeof InviteInputSchema>;

export const InviteViewSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: MembershipRoleSchema,
  status: z.enum(['pending', 'accepted', 'revoked', 'expired']),
  invitedBy: z.string().uuid(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime()
});
export type InviteView = z.infer<typeof InviteViewSchema>;

export const AcceptInvitationInputSchema = z.object({
  token: z.string().min(1),
  acceptingUserId: z.string().uuid()
});
export type AcceptInvitationInput = z.infer<typeof AcceptInvitationInputSchema>;

export const RevokeInvitationInputSchema = z.object({
  invitationId: z.string().uuid()
});
export type RevokeInvitationInput = z.infer<typeof RevokeInvitationInputSchema>;
