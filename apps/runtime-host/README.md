# Runtime Host

Minimal SmartFactory OS runtime composition package.

Responsibilities:

- import `@sfos/core`
- import module manifests and lifecycles, currently IAM
- call `bootstrap()` with explicit module list
- optionally enumerate companies and hydrate per-company activation mirrors after bootstrap
- return diagnostics and hydration results for a caller to report

Non-responsibilities:

- no HTTP server
- no UI
- no workspace engine
- no app-level business logic
- no direct activation state mutation

Use `composeRuntime()` as the single entry point.

CLI entrypoint:

- `pnpm --filter @sfos/runtime-host build`
- `pnpm --filter @sfos/runtime-host start`
- `pnpm --filter @sfos/runtime-host cli -- --help`

CLI behavior:

- thin process wrapper only
- default startup runs bootstrap only
- `--hydrate` enables explicit company enumeration + mirror hydration
- `--json` prints machine-readable diagnostics
- `--pretty` prints human-readable diagnostics
- `--fail-on-degraded` returns non-zero on degraded diagnostics
- CLI reports diagnostics only; it does not repair state
- CLI does not start HTTP, UI, or workspace engine

Hydration behavior:

- opt-in only
- company enumeration is explicit
- enumeration failure aborts the hydration pass
- one company row-read failure degrades only that company
- no activation/deactivation hooks, activation events, or activation row writes

Hydration configuration:

- `--hydrate` requires platform DB connection env for system-context reads
- production path uses `DATABASE_ADMIN_URL`
- tests may inject `TEST_DATABASE_URL`
- CLI never prints configured DB URLs
