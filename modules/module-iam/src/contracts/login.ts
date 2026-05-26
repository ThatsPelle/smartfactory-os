import { z } from 'zod';

export const LoginInputSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});
export type LoginInput = z.infer<typeof LoginInputSchema>;

export const LoginOutputSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string().datetime(),
  refreshExpiresAt: z.string().datetime(),
  sessionId: z.string(),
  userId: z.string().uuid()
});
export type LoginOutput = z.infer<typeof LoginOutputSchema>;

export const LogoutInputSchema = z.object({
  sessionId: z.string().min(1)
});
export type LogoutInput = z.infer<typeof LogoutInputSchema>;

export const ValidateSessionInputSchema = z.object({
  accessToken: z.string().min(1)
});
export type ValidateSessionInput = z.infer<typeof ValidateSessionInputSchema>;

export const ValidateSessionOutputSchema = z.object({
  userId: z.string().uuid(),
  companyId: z.string().uuid(),
  sessionId: z.string()
});
export type ValidateSessionOutput = z.infer<typeof ValidateSessionOutputSchema>;
