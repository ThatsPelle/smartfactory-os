import { hash, verify } from '@node-rs/argon2';

// Algorithm.Argon2id = 2 — cannot import const enum under verbatimModuleSyntax
const ARGON2ID = 2 as const;

const OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4
} as const;

export const hashPassword = (plaintext: string): Promise<string> =>
  hash(plaintext, OPTIONS);

export const verifyPassword = (storedHash: string, plaintext: string): Promise<boolean> =>
  verify(storedHash, plaintext);
