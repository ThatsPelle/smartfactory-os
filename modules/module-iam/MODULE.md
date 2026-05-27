# module-iam

Identity and Access Management for SmartFactoryOS.

## Responsibilities

- Email/password authentication with lockout
- Session management (access + refresh tokens, opaque)
- Invitation-based onboarding
- Password reset (secure, single-use tokens)

## Database role

Connects as `module_iam_role` (NOBYPASSRLS) via `DATABASE_IAM_URL`.

## Public API

Import from `@sfos/iam`:

- `login`, `logout`, `validateSession` — auth flow
- `createInvitation`, `acceptInvitation`, `revokeInvitation` — onboarding
- `listSessions`, `revokeSession`, `revokeAllSessions` — session management
- `requestPasswordReset`, `consumePasswordReset` — password reset

Import contracts from `@sfos/iam/contracts`.
