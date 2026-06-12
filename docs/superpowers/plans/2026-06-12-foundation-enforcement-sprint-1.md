# Foundation Enforcement Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the architecture corpus and replace manifest, event, and RLS
validation stubs with deterministic CI gates.

**Architecture:** Keep validation outside runtime packages under the existing
`tools/manifest-validator`, `tools/event-catalog`, and `tools/rls-checker`
ownership boundaries. Manifest and event validators inspect built module
manifests through public package exports; the RLS validator statically inspects
SQL migrations. A lint-only TypeScript project resolves workspace exports to
source on clean CI checkouts.

**Tech Stack:** Node.js ESM, Node built-in test runner, Zod contracts,
`@sfos/events`, pnpm, Turborepo, ESLint v9, PostgreSQL SQL text inspection.

---

### Task 1: Restore Architecture Corpus

**Files:**

- Create: `docs/architecture/01-blueprint.md`
- Create: `docs/architecture/02-wizard.md`
- Create: `docs/architecture/03-bounded-contexts.md`
- Create: `docs/architecture/04-manifest-and-events.md`
- Create: `docs/architecture/05-security-iam-rls.md`
- Create: `docs/architecture/06-monorepo.md`
- Create: `docs/architecture/07-vertical-slice.md`
- Create: `docs/architecture/08-bootstrap.md`
- Modify: `docs/architecture/README.md`

- [ ] Describe only current code and clearly marked planned work.
- [ ] Preserve exact filenames already referenced by repository docs.
- [ ] Verify all eight files exist and Prettier accepts them.

### Task 2: Reproduce and Fix Clean-Checkout Import Resolution

**Files:**

- Create: `tsconfig.eslint.json`
- Modify: `packages/eslint-config/src/configs/base.js`

- [ ] Confirm GitHub CI failure is import-x resolution against absent `dist`.
- [ ] Add lint-only `paths` for public `@sfos/*` exports to source files.
- [ ] Point import-x TypeScript resolver at `tsconfig.eslint.json`.
- [ ] Remove generated `dist` directories and run `pnpm lint`.
- [ ] Run `pnpm build` to restore generated outputs.

### Task 3: Manifest Validator

**Files:**

- Create: `tools/manifest-validator/index.test.mjs`
- Create: `tools/manifest-validator/index.mjs`
- Modify: `package.json`

- [ ] Write failing tests for duplicate ids, malformed package naming,
      duplicate permissions/events/capabilities, invalid required capabilities,
      invalid namespace ownership, missing ownership docs, and `@sfos/core`
      dependencies/imports.
- [ ] Run tests and confirm failure because validator does not exist.
- [ ] Implement deterministic module discovery and compiled manifest import.
- [ ] Validate every manifest with `ManifestSchema` and capability keys with
      `CapabilityKeySchema`.
- [ ] Fail on duplicate ids, permissions, events, and provided capabilities.
- [ ] Enforce `module-<slug>` -> `@sfos/<slug>` and `module_<slug>` namespace.
- [ ] Enforce module-local migration paths and ownership metadata.
- [ ] Enforce no module dependency/import of `@sfos/core`.
- [ ] Run tests and `pnpm validate:manifests`.

### Task 4: Event Catalog Validator and Ownership Regression

**Files:**

- Create: `tools/event-catalog/index.test.mjs`
- Create: `tools/event-catalog/index.mjs`
- Create: `packages/events/tests/naming.test.ts`
- Create: `packages/events/vitest.config.ts`
- Modify: `packages/events/package.json`
- Modify: `packages/events/src/naming.ts`
- Modify: `package.json`

- [ ] Write failing validator tests for malformed, duplicate, undeclared, and
      foreign-owned events.
- [ ] Write failing package test proving `sfos.iam` owns `iam.*` events while
      envelope `source_module` remains `sfos.iam`.
- [ ] Run tests and confirm expected ownership failure.
- [ ] Derive event namespace from the final segment of the manifest module id.
- [ ] Discover exported module event constants and require exact manifest
      catalog alignment.
- [ ] Validate sample envelopes through `buildEnvelope` and
      `EventEnvelopeSchema`.
- [ ] Run package and validator tests plus `pnpm validate:events`.

### Task 5: Static RLS Validator

**Files:**

- Create: `tools/rls-checker/index.test.mjs`
- Create: `tools/rls-checker/index.mjs`
- Modify: `package.json`

- [ ] Write failing tests for missing ENABLE, missing FORCE, missing tenant
      helpers, missing audit immutability, and missing tenant policy context.
- [ ] Run tests and confirm failure because checker does not exist.
- [ ] Discover core and module SQL migrations deterministically.
- [ ] Require ENABLE and FORCE RLS for every discovered `core` and
      `module_*` table.
- [ ] Require `current_company_id`, `current_user_id`, and
      `current_user_has`.
- [ ] Require audit UPDATE/DELETE blocking policies and triggers.
- [ ] Require company-context policies for tables with `company_id`.
- [ ] Run tests and `pnpm validate:rls`.

### Task 6: Canonicalize IAM Contracts

**Files:**

- Modify: `modules/module-iam/src/manifest.ts`
- Modify: `README.md`
- Modify: `modules/module-iam/MODULE.md`
- Modify: `docs/operations/codex-handoff.md`
- Modify: relevant architecture documents

- [x] Replace `iam.auth@1` with `IAM_CAPABILITIES.AUTHENTICATION`
      (`iam.authentication@1`).
- [ ] Reference `IAM_PERMISSIONS` constants from the IAM manifest.
- [ ] Update docs without retaining an undocumented alias.
- [ ] Run manifest and event validators.

### Task 7: Root Scripts and CI Coverage

**Files:**

- Modify: `package.json`
- Modify: `eslint.config.js`
- Modify: `pnpm-lock.yaml`

- [x] Replace all three stub scripts with real validator commands.
- [ ] Add validator tests to root `pnpm test`.
- [ ] Include validator tool files in root lint.
- [ ] Update lockfile for the events package test dependency.
- [ ] Run clean-checkout lint reproduction again.

### Task 8: Full Verification and Graphify

- [ ] Run `pnpm format:check`.
- [ ] Run `pnpm lint`.
- [ ] Run `pnpm typecheck`.
- [ ] Run `pnpm build`.
- [ ] Run `pnpm validate:deps`.
- [ ] Run `pnpm validate`.
- [ ] Run `pnpm test`.
- [ ] Run focused core and IAM tests; report DB skips.
- [ ] Rebuild ignored `graphify-out/` and verify forbidden source paths are zero.
- [ ] Audit staged files for secrets, local paths, generated output, and
      forbidden directories.
- [ ] Show status and diff stat, then commit with the requested message.
