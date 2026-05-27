# Ownership

**Module:** `sfos.iam`  
**Team:** Platform Core  
**Contact:** platform@smartfactoryos.internal  
**Escalation:** @platform-core on #platform-alerts

## Security-sensitive areas

- `src/internal/` — crypto, hashing, lockout
- `src/server/api/auth.ts` — login flow, lockout enforcement
- `src/server/api/password.ts` — reset token lifecycle
- `src/migrations/0003_iam_rls.sql` — RLS policies

Any changes to these paths require a security review.
