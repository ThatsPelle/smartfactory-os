# 08 — Bootstrap and Execution Sequence

## Repository Bootstrap

The foundation is built in dependency order:

1. Monorepo tooling and strict TypeScript.
2. Frozen contracts.
3. Event helpers and module SDK.
4. PostgreSQL schema, tenant context, audit, and outbox.
5. Core runtime.
6. IAM module.
7. Architecture and CI enforcement.
8. Runtime hosts and vertical slices.

Steps 1-6 exist. Step 7 is the current foundation enforcement stage. Runtime
features start only after it passes. A minimal runtime host now exists under
`apps/runtime-host`; it now includes a thin CLI/process entrypoint for
bootstrap and diagnostics. Workspace/warehouse execution remains deferred.

## Runtime Bootstrap

`@sfos/core` exposes one explicit `bootstrap(input)` path:

1. **Load:** validate manifests, compatibility, and unique ids.
2. **Resolve:** build capability graph and detect missing providers/cycles.
3. **Register:** populate registry in topological order.
4. **Initialize:** call `preFlight` and `register`.
5. **Snapshot:** return registry, event bus, lifecycle engine, and diagnostics.

There is no global runtime state, decorator registration, hidden DI container,
or service locator.

## Tenant Activation

Tenant activation is separate from platform bootstrap. `activate` and
`deactivate` hooks exist in the SDK. `ModuleActivationService` now performs
explicit company activation through tenant-scoped DB orchestration:

1. Resolve registered manifest and required capabilities.
2. Invoke the module activation hook.
3. Persist active or failed status in `core.company_modules`.
4. Persist audit and outbox records.
5. Update the registry mirror only after committed success.

Tenant deactivation is also explicit:

1. Read active DB truth and validate manifest/dependent capabilities.
2. Invoke optional `deactivate` (omission is a no-op).
3. Persist disabled state, audit, and outbox records.
4. Update the registry mirror only after committed success.

After platform bootstrap, a runtime host hydrates one company at a time from
persisted active rows. Company enumeration is explicit and platform-owned:
`@sfos/db` lists companies and activation rows with read-only system context,
and `@sfos/core` orchestrates per-company hydration from that persisted truth.

Hydration validates all rows first, atomically replaces the tenant mirror on
success, and returns degraded diagnostics with an empty mirror on failure. It
never calls activation hooks, emits activation events, writes activation rows,
or auto-repairs state.

Enumeration failure is fail-fast for the whole hydration pass. Per-company row
read failure degrades only that company and clears only that company mirror.

Automatic bootstrap activation and workspace integration remain unimplemented.
Bootstrap still does not silently mutate activation state.

## Runtime Host CLI

`apps/runtime-host` now exposes first thin process wrapper around
`composeRuntime()`:

- default run: bootstrap only
- `--hydrate`: explicit company enumeration + hydration
- `--json` / `--pretty`: deterministic diagnostics output
- `--fail-on-degraded`: operator-controlled non-zero exit on degraded state

The CLI reports diagnostics only. It does not auto-activate modules, repair
invalid activation state, start HTTP, start UI, or start workspace engine.

## Current Foundation Gates

- Formatting, lint, typecheck, build.
- Dependency-cruiser boundaries.
- Manifest discovery and contract validation.
- Event catalog and ownership validation.
- Static migration RLS validation.
- Unit tests.
- Optional PostgreSQL integration/adversarial tests.

DB-backed tests that skip without `TEST_DATABASE_URL` are not full validation.

## Next Safe Work

After all gates pass on a clean Linux CI checkout:

1. Close remaining documented enforcement warnings.
2. Add explicit shutdown/outbox-process lifecycle around runtime host
   without adding product behavior.
3. Design workspace engine through an ADR/plan before implementation.

Do not start UI or operational feature breadth during bootstrap work.
