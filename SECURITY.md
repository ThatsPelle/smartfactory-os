# Security Policy

## Reporting a vulnerability

**Do not** open a public issue for security vulnerabilities.

Report privately to: `security@smartfactory-os.dev` (or, until that address is live, by opening a private security advisory on GitHub).

Include:
- A description of the vulnerability.
- Steps to reproduce.
- Affected versions / deployment modes.
- Suggested remediation if any.

## Response process

1. We acknowledge receipt within 72 hours.
2. We confirm the vulnerability and assess severity within 7 days.
3. We coordinate on disclosure timing with the reporter.
4. We release a fix with a security advisory and credit the reporter (if they wish).

## Scope

In scope:
- The platform core (`packages/core`, `packages/contracts`, `packages/module-sdk`).
- All built-in modules under `modules/`.
- All apps under `apps/`.
- Default Docker compose / deployment templates under `infra/`.

Out of scope:
- Third-party / community modules (report to their maintainers).
- Self-host configurations that diverge from documented defaults.
- Social-engineering attacks not exploiting a platform vulnerability.

## Security-relevant guarantees

This platform is built on these durable commitments. A defect in any is in-scope:

1. **Tenant isolation** — Postgres RLS denies cross-tenant access.
2. **AI never writes** — the AI service principal has no write permissions on operational schemas.
3. **Automation acts as a tracked principal** — every automation action is audited.
4. **Audit is append-only** — `audit_logs` refuses UPDATE and DELETE.
5. **Module schemas isolate writes** — per-module Postgres roles prevent cross-schema writes.

If you find a way to violate any of these in default configurations, that is a security bug.

## Supported versions

While in v0.x, only the latest minor receives security patches.
