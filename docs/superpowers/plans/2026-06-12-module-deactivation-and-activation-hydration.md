# Module Deactivation and Activation Hydration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit tenant module deactivation and fail-closed restart hydration from `core.company_modules`.

**Architecture:** Core remains sole activation-state orchestrator. Deactivation reads and changes tenant DB truth transactionally, invokes optional module lifecycle hooks, writes audit/outbox facts, then updates the registry mirror. Hydration reads one tenant at a time, validates registered manifests and active capability dependencies, atomically replaces the in-memory mirror, and never invokes hooks or writes persistence.

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL 16/RLS, Vitest, pnpm/Turborepo.

---

### Task 1: Define deactivation behavior with DB-backed tests

**Files:**

- Modify: `packages/core/tests/activation.test.ts`
- Modify: `packages/core/tests/helpers.ts`

- [ ] Add tests for successful deactivation, unknown module, deterministic inactive behavior, hook failure, dependent capability blocking, audit/outbox persistence, post-commit registry updates, and lifecycle context isolation.
- [ ] Extend `recordingLifecycle` with an optional `deactivate` result and context observer.
- [ ] Run `pnpm --filter @sfos/core test -- activation.test.ts` with `TEST_DATABASE_URL`.
- [ ] Verify RED failures show missing deactivation API and constants.

### Task 2: Implement deactivation orchestration

**Files:**

- Create: `packages/core/src/activation/deactivation-service.ts`
- Create: `packages/core/src/activation/module-events.ts`
- Modify: `packages/core/src/activation/service.ts`
- Modify: `packages/core/src/activation/events.ts`
- Modify: `packages/core/src/activation/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] Extract tenant lifecycle event emission into a shared helper that enforces module ownership, declaration, and company scope.
- [ ] Add `ModuleDeactivationService.deactivate(input)`.
- [ ] Read `core.company_modules` as tenant DB truth.
- [ ] Treat an already-disabled row as an idempotent no-op; reject missing, pending, or failed rows.
- [ ] Block deactivation when an active dependent has no alternate active provider.
- [ ] Invoke optional `deactivate`; omission is the SDK-defined no-op.
- [ ] Persist disabled state, audit, and `core.module.deactivated` outbox event in one transaction.
- [ ] On hook failure, preserve active truth, store failure metadata, persist audit and `core.module.deactivation_failed`, and leave registry active.
- [ ] Update registry only after persistence commits.
- [ ] Run focused core tests and verify GREEN.

### Task 3: Define hydration behavior with DB-backed tests

**Files:**

- Create: `packages/core/tests/activation-hydration.test.ts`
- Modify: `packages/core/tests/registry.test.ts`

- [ ] Add tests for active-row hydration, disabled-row exclusion, missing manifest diagnostics, missing active capability diagnostics, no hooks/events/writes, and tenant isolation.
- [ ] Add registry test for atomic per-company mirror replacement.
- [ ] Run focused tests with `TEST_DATABASE_URL`.
- [ ] Verify RED failures show missing hydrator and registry replacement API.

### Task 4: Implement fail-closed hydration

**Files:**

- Create: `packages/core/src/activation/hydration.ts`
- Modify: `packages/core/src/registry/module-registry.ts`
- Modify: `packages/core/src/activation/index.ts`
- Modify: `packages/core/src/index.ts`

- [ ] Add `replaceActiveModules(companyId, moduleIds)` to the concrete registry mirror.
- [ ] Add `ActivationRegistryHydrator.hydrateCompany(input)`.
- [ ] Read active rows inside `withTenantContext`; do not write rows.
- [ ] Validate every active module is registered.
- [ ] Validate platform capability requirements and active registered providers.
- [ ] Sort diagnostics deterministically.
- [ ] On any diagnostic, clear that tenant mirror and return degraded failure.
- [ ] On success, atomically replace the tenant mirror with DB active rows.
- [ ] Do not invoke `activate`/`deactivate`, emit events, or auto-repair DB rows.
- [ ] Run focused tests and verify GREEN.

### Task 5: Align SDK and architecture documentation

**Files:**

- Modify: `packages/module-sdk/src/lifecycle.ts`
- Modify: `packages/module-sdk/README.md`
- Modify: `packages/core/README.md`
- Modify: `packages/core/docs/lifecycle.md`
- Modify: `docs/architecture/04-manifest-and-events.md`
- Modify: `docs/architecture/08-bootstrap.md`
- Modify: `docs/operations/codex-handoff.md`

- [ ] Document omitted `deactivate` as a safe no-op that retains module data.
- [ ] Document explicit activate/deactivate persistence and post-commit mirror updates.
- [ ] Document per-company restart hydration after bootstrap.
- [ ] State hydration performs no hooks, events, writes, activation, or repair.
- [ ] State unresolved active rows degrade/fail hydration deterministically.

### Task 6: Validate with PostgreSQL and repository gates

**Files:**

- Modify only if a test exposes a scoped defect.

- [ ] Run migrations against disposable PostgreSQL 16.
- [ ] Run `pnpm test:ci` with `TEST_DATABASE_URL`; require zero skips.
- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm validate:deps`.
- [ ] Run `pnpm validate`.
- [ ] Run `pnpm test`.
- [ ] Run DB/core/IAM package tests.

### Task 7: Refresh graph, audit, and commit

**Files:**

- Generated `graphify-out/` remains ignored.

- [ ] Run Graphify refresh and record nodes, edges, communities, and excluded-path counts.
- [ ] Show `git status` and `git diff --stat`.
- [ ] Audit staged paths/content for secrets, local paths, and generated files.
- [ ] Commit exactly: `feat(core): support module deactivation and activation hydration`.
- [ ] Do not push.
