# Module Migrations and Tenant Activation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aggregate manifest-declared module migrations through one ledger, enforce SQL ownership before execution, and add explicit tenant module activation orchestration.

**Architecture:** `@sfos/db` remains migration and persistence owner. `@sfos/core` orchestrates activation using registered manifests and tenant-scoped DB transactions. Modules receive lifecycle context and never write `core.company_modules` directly.

**Tech Stack:** TypeScript, Node.js, PostgreSQL 16, Drizzle ORM, Vitest, pnpm, Turborepo.

---

### Task 1: Repository migration plan

**Files:**

- Modify: `packages/db/scripts/migration-plan.ts`
- Modify: `packages/db/tests/migration-plan.test.ts`
- Modify: `packages/db/scripts/migrate.ts`
- Modify: `packages/db/package.json`
- Modify: `package.json`

- [ ] Add failing tests for core plus multiple manifest-declared module sources, deterministic order, ledger names, frozen legacy sequence handling, and new duplicate sequence rejection.
- [ ] Run `pnpm --filter @sfos/db test -- migration-plan.test.ts` and confirm failures describe missing repository discovery.
- [ ] Add repository discovery that reads built module manifests, resolves migration directories inside module roots, and produces one ordered plan.
- [ ] Keep existing core ledger names unchanged and module ledger names prefixed by module directory.
- [ ] Preserve frozen historical core-then-IAM ordering for sequences `0001` through `0003`; reject every other duplicate global sequence.
- [ ] Replace IAM-specific migration scripts with one general migration command.
- [ ] Re-run focused tests.

### Task 2: SQL ownership enforcement

**Files:**

- Create: `packages/db/scripts/migration-ownership.ts`
- Create: `packages/db/tests/migration-ownership.test.ts`
- Modify: `packages/db/scripts/migrate.ts`

- [ ] Add failing tests for allowed owner-local DDL and forbidden cross-owner `CREATE`, `ALTER`, and `DROP` targets.
- [ ] Run focused tests and confirm ownership validator is missing.
- [ ] Implement deterministic SQL statement inspection for schema, table, type, function, index, and trigger mutation targets.
- [ ] Run ownership validation before ledger lookup or migration execution.
- [ ] Document parser limits: comments and string bodies are stripped; grants and foreign-key references are not mutation targets.
- [ ] Re-run focused tests.

### Task 3: Explicit activation persistence

**Files:**

- Create: `packages/db/drizzle/0004_company_module_activation_status.sql`
- Modify: `packages/db/src/schema/company-modules.ts`
- Modify: `tools/rls-checker/index.mjs`
- Modify: `tools/rls-checker/index.test.mjs`

- [ ] Add failing static RLS/schema tests for activation status migration coverage.
- [ ] Add `pending`, `active`, `disabled`, and `failed` status plus failure and update timestamps without removing existing compatibility columns.
- [ ] Keep `core.company_modules` under enabled and forced RLS.
- [ ] Re-run RLS and DB static tests.

### Task 4: Core activation orchestrator

**Files:**

- Create: `packages/core/src/activation/events.ts`
- Create: `packages/core/src/activation/service.ts`
- Create: `packages/core/src/activation/index.ts`
- Create: `packages/core/tests/activation.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/tests/helpers.ts`

- [ ] Add DB-backed failing tests for successful activation, unavailable module, inactive required capability, and failed lifecycle hook.
- [ ] Implement explicit `ModuleActivationService` dependencies: tenant DB, registry, logger factory, and platform capability set.
- [ ] Validate manifest registration and tenant capability requirements before writes.
- [ ] Run activation hook inside tenant transaction.
- [ ] On success, persist active state, audit row, and `core.module.activated` outbox envelope; update registry after commit.
- [ ] On hook failure, roll back activation work, persist failed state plus audit/outbox failure record, and keep registry inactive.
- [ ] Re-run core tests against PostgreSQL.

### Task 5: Documentation and CI alignment

**Files:**

- Modify: `.github/workflows/ci.yml`
- Modify: `packages/db/docs/migrations.md`
- Modify: `docs/architecture/03-bounded-contexts.md`
- Modify: `docs/architecture/04-manifest-and-events.md`
- Modify: `docs/architecture/08-bootstrap.md`
- Modify: `docs/operations/codex-handoff.md`

- [ ] Build module manifests before general migration discovery in CI.
- [ ] Document global discovery, namespaced ledger entries, frozen legacy ordering exception, ownership checks, activation state, and known limits.
- [ ] Run formatting, lint, typecheck, build, dependency validation, all validators, and all tests.
- [ ] Run PostgreSQL-backed migration and test suites with zero DB skips.
- [ ] Refresh ignored Graphify output, audit sensitive paths, and commit without push.
