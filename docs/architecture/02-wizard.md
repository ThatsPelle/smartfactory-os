# 02 — Factory Initialization Wizard

## Status

Planned. No wizard runtime or UI exists.

The wizard is the controlled bootstrap path for a new deployment. It gathers
configuration and invokes platform APIs; it does not bypass migrations, RLS,
module lifecycle, or audit rules.

## Six Planned Steps

1. **Deployment**
   - Choose cloud, self-hosted, or workstation mode.
   - Verify runtime and PostgreSQL prerequisites.
2. **Database**
   - Configure admin and tenant connections.
   - Apply ordered core and module migrations.
   - Verify required extensions, roles, schemas, and RLS.
3. **Organization**
   - Create the first company.
   - Bind company identity used by tenant context.
4. **Administrator**
   - Create the first user and IAM credential.
   - Create owner membership through audited platform behavior.
5. **Modules**
   - Load manifests.
   - Resolve capabilities.
   - Select modules whose requirements are satisfied.
6. **Review and Activate**
   - Show diagnostics and security checks.
   - Activate selected modules for the company.
   - Persist completion state and emit owned events.

## Orchestration Rules

- The host runtime owns sequencing.
- `@sfos/core` validates manifests and lifecycle readiness.
- `@sfos/db` owns core persistence and tenant context.
- Each module owns its migrations and activation behavior.
- The wizard calls APIs; it never writes module tables directly.
- A failed step is retryable and must not create hidden partial state.

## Security Requirements

- Secrets are entered or injected at runtime and never committed.
- Tenant connections use a `NOBYPASSRLS` role.
- Provisioning operations run as explicit system or user principals.
- Every state-changing operation writes audit and event records in the same
  transaction when that behavior is implemented.

## Acceptance Boundary

Wizard work starts only after:

- Static manifest, event, and RLS validators are active.
- Runtime host boundaries are defined.
- Company provisioning and tenant activation APIs exist.
