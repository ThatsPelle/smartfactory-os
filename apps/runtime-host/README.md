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

Hydration behavior:

- opt-in only
- company enumeration is explicit
- enumeration failure aborts the hydration pass
- one company row-read failure degrades only that company
- no activation/deactivation hooks, activation events, or activation row writes
