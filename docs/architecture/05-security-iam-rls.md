# 05 — Security, IAM, and Row-Level Security

## Security Floor

PostgreSQL row-level security is the tenant boundary. Application checks,
permissions, and API filters are additional layers.

## Tenant Context

`withTenantContext` binds company and user identifiers with `SET LOCAL` inside
a transaction. Missing context returns `NULL`; RLS predicates therefore match
no tenant rows.

Required helpers:

- `app.current_company_id()`
- `app.current_user_id()`
- `app.current_user_has(permission)`

Tenant predicate helpers are not `SECURITY DEFINER`.

## Roles

| Role                 | Purpose                                                         |
| -------------------- | --------------------------------------------------------------- |
| Migration/admin role | Schema changes, controlled system operations, outbox publishing |
| `app_tenant`         | Tenant request traffic, `NOBYPASSRLS`                           |
| `module_iam_role`    | IAM-owned credential/session behavior, `NOBYPASSRLS`            |

Production secrets are managed outside the repository.

## RLS Rules

- Every current `core` and `module_*` table has explicit RLS coverage.
- RLS is both `ENABLE`d and `FORCE`d.
- Tenant write policies use `WITH CHECK`.
- Missing context fails closed.
- Cross-tenant rows are not visible or writable.

Static CI validation verifies migration text. Database adversarial tests verify
runtime behavior when `TEST_DATABASE_URL` is available.

## Audit and Outbox

- `core.audit_logs` is append-only.
- RLS denies tenant UPDATE and DELETE.
- Database triggers block UPDATE and DELETE even for a bypass role.
- `core.outbox_events` persists event envelopes before asynchronous dispatch.
- Tenant roles cannot rewrite publisher status.

## IAM Ownership

IAM owns:

- Credentials and lockout state.
- Sessions and revocation.
- Invitations.
- Password reset tokens.
- IAM permissions, events, and authentication capability.

IAM does not own company or membership truth. Invitation acceptance uses the
tenant DB path and core RLS to create membership state.

## Automation and AI

Planned automation executes as a tracked principal with explicit permissions
and audit records. AI may propose actions but does not become operational
source of truth or receive implicit write authority.

## Forbidden Shortcuts

- No RLS bypass via application filtering.
- No unreviewed `SECURITY DEFINER`.
- No shared admin client in module public APIs.
- No secrets in source, docs, generated graphs, or commits.
- No deletion of adversarial tests to obtain a green pipeline.
