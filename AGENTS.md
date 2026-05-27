# AGENTS.md — Working in this repository as an AI agent

This file is a brief for AI coding agents (Claude, GPT, Codex, etc.). Read this before reading other code.

## Read the architecture first

The architecture is _not_ in the code. It is in `docs/architecture/` as eight documents. Read at least:

- `01-blueprint.md` — overall posture
- `03-bounded-contexts.md` — domain ownership rules (most important for any data change)
- `04-manifest-and-events.md` — module contract format
- `05-security-iam-rls.md` — tenancy + RLS (most important for any DB change)
- `06-monorepo.md` — import discipline (most important for any new file)
- `08-bootstrap.md` — what currently exists and what doesn't

If you skip these, you will produce code that CI rejects.

## Repository orientation

```
apps/         runtimes (web, bff, ...)
packages/     shared libraries (contracts, sdk, db, ui, ...)
modules/      operational modules (iam, workspace, warehouse, ...)
tools/        generators + validators (CI gates)
docs/         architecture + ADRs
```

Owning rule: **modules never import other modules**. Cross-module access goes through `@sfos/module-sdk` and the runtime registry. Violations fail CI via `dependency-cruiser`.

## Where to put new code

| Adding...                      | Goes in...                                                     | Read first                     |
| ------------------------------ | -------------------------------------------------------------- | ------------------------------ |
| A new type used across modules | `packages/contracts/src/`                                      | 04-manifest-and-events.md §7   |
| A new helper used in modules   | `packages/utils/src/` or a more specific package               | 06-monorepo.md §5              |
| A new operational entity       | `modules/module-<name>/src/server/db/`                         | 03-bounded-contexts.md §7      |
| A new event                    | Producing module's `events.ts` + manifest's `events_produced`  | 04-manifest-and-events.md §6-7 |
| A new permission               | Producing module's `permissions.ts` + manifest's `permissions` | 05-security-iam-rls.md §4      |
| A new widget                   | Module's `src/ui/widgets/` + manifest's `widgets`              | 03-bounded-contexts.md §6      |
| A new module                   | `pnpm new:module <name>` (uses the template)                   | 06-monorepo.md §6              |
| A new ADR                      | `docs/adr/NNNN-title.md`                                       | `docs/adr/README.md`           |

## Conventions

- **File size:** target 200-400 lines. Warn at 500. Refactor at 800.
- **Naming:** descriptive, no abbreviations beyond the published glossary (OEE, BOM, NCR, MTBF, MTTR, lot, batch).
- **No `any`.** If you genuinely need it, comment why.
- **No string literals for permissions or event types.** Use constants from `@sfos/contracts`.
- **No cross-module imports.** Period.
- **No direct DB writes from UI code.** UI calls module APIs.
- **Every tenant-scoped table needs RLS.** Use `create_tenant_table` macro (see migration template).
- **Every state-changing mutation emits an event AND writes an audit entry** in the same transaction.
- **Past-tense events:** `warehouse.item.created`, not `create_item`.

## Validation commands

Run before claiming a change is done:

```bash
pnpm typecheck            # TS errors
pnpm lint                 # ESLint (includes architecture rules)
pnpm validate:deps        # dependency-cruiser
pnpm validate             # everything
```

If `validate:deps` fails with "no-cross-module-imports", you imported one module from another. Use the SDK + registry instead.

If `validate:rls` (once wired) fails, you added a tenant-scoped table without an RLS policy.

## ESLint — flat config

This repo uses **ESLint v9 flat config**. The configuration file is `eslint.config.js` (ESM) at the root and in each workspace package. **Do not create `.eslintrc.cjs` files.** See [ADR-0002](docs/adr/0002-eslint-v9-flat-config.md).

Presets live in `@sfos/eslint-config`: `base`, `node`, `react`, `tests`. Import them as ESM default exports and spread into your config array:

```js
import nodeConfig from '@sfos/eslint-config/node';
export default [{ ignores: ['dist/**'] }, ...nodeConfig];
```

Flat config does not merge rule options across config objects in the array. If you need to extend a rule's options (e.g., adding patterns to `no-restricted-imports`), re-declare the full rule. The React preset is the reference example.

## What you must NOT do

- Don't redesign the architecture. The eight documents are frozen until ADRs supersede them.
- Don't add a new shared package without an ADR.
- Don't introduce a new event envelope field — propose an ADR.
- Don't bypass RLS with `SECURITY DEFINER` without explicit review.
- Don't add `any`, `@ts-ignore`, or `eslint-disable` without an inline comment justifying it.
- Don't write to another module's tables.
- Don't emit events on another module's behalf.
- Don't create a `lib/`, `common/`, `shared/`, or `misc/` folder. Code belongs to a specific module or package.

## What you should do

- Read `MODULE.md` of any module before changing it.
- Update `MODULE.md` and `OWNERSHIP.md` when changing boundaries.
- Write an ADR for any structural decision.
- Run validation locally before suggesting "this is done."
- Prefer adding a tiny module than expanding an existing one beyond its remit.
- Match the existing patterns. The first module (`module-iam`) is the canonical example; copy from it.

## Quick links

- ADRs: `docs/adr/`
- Architecture corpus: `docs/architecture/`
- Module template: `tools/generators/module-template/`
- Contracts: `packages/contracts/src/`
- SDK: `packages/module-sdk/src/`

If something seems wrong with these conventions, file an ADR proposing the change. Don't just diverge.
