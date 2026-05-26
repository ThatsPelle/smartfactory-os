import { z } from 'zod';

export const PasswordResetRequestInputSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase())
});
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestInputSchema>;

export const PasswordResetInputSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(12, 'password must be at least 12 characters')
});
export type PasswordResetInput = z.infer<typeof PasswordResetInputSchema>;
