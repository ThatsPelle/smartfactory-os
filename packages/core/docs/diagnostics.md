# Diagnostics

`bootstrap()` returns a `RuntimeDiagnostics` snapshot describing what
happened at startup. The snapshot is a plain data object — fully JSON
serializable, easy to log, easy to surface in a future admin UI, easy to
diff between runs.

There is no push channel and no global observer. The operator either
logs the snapshot, polls for it, or feeds it into their own monitoring.

## Shape

```ts
interface RuntimeDiagnostics {
  readonly platformVersion: string;
  readonly runtimeMode: 'cloud' | 'self_hosted' | 'workstation' | string;
  readonly startedAt: Date;
  readonly ready: boolean;
  readonly phaseDurations: Readonly<Record<string, number>>;
  readonly loadIssues: readonly ManifestLoadIssue[];
  readonly capabilityCycles: readonly (readonly string[])[];
  readonly modules: readonly ModuleDiagnostic[];
  readonly lifecycleHistory: readonly LifecycleHistoryEntry[];
}

interface ModuleDiagnostic {
  readonly moduleId: string;
  readonly version: string;
  readonly state: ModuleState;
  readonly unresolved: readonly CapabilityRequirement[];
  readonly providers: readonly string[];
}
```

### `ready`

`true` iff every module ended in `initialized` or `disabled`. The
operator can treat `ready === false` as a deploy-time failure; the
detail of *why* lives in `modules[i].state` + `loadIssues` +
`capabilityCycles`.

### `phaseDurations`

Wall-clock ms per startup phase. The keys are exactly
`'load' | 'resolve' | 'initialize'`. Useful for spotting a slow module
(`initialize` ballooning) vs. a slow manifest load (registry on disk).

### `loadIssues`

Pre-registration problems. The kinds are:

- `schema_invalid` — manifest did not pass `ManifestSchema`.
- `duplicate_id` — two manifests with the same `identity.id`.
- `platform_version_mismatch` — manifest required a platform version the
  runtime is not.
- `unsupported_runtime_mode` — manifest does not declare support for the
  current runtime mode.

A module that fails to load does NOT have a `ModuleDiagnostic` entry
when its id was never readable; otherwise it appears with
`state: 'failed'`. The diagnostics never silently drop a failure.

### `capabilityCycles`

One entry per detected cycle. Each entry is an ordered list of module
ids that form the cycle. Cycle members are also represented in
`modules[i].state === 'failed'`.

### `modules`

Per-module: id, declared version, current lifecycle state, unresolved
requirements (if any), provider module ids (if any). Ordered by the
registry's topological order, then by load-issue order for entries that
never registered.

### `lifecycleHistory`

The full append-only transition history (soft-capped at 1024 entries by
the lifecycle engine). Each entry: `{ moduleId, from, to, at, reason }`.
The `reason` field is the most useful field when reading the log —
"preFlight: missing DATABASE_URL" tells you exactly what to fix.

## Rendering for humans

```ts
import { bootstrap, renderDiagnostics } from '@sfos/core';

const r = await bootstrap(input);
console.log(renderDiagnostics(r.diagnostics));
```

`renderDiagnostics` produces plain ASCII suitable for a log line or a
copy/paste bug report. Failure blocks (load issues, cycles, unresolved
caps) appear before the OK blocks so operators read the bad news first.

For programmatic use, `JSON.stringify(r.diagnostics, null, 2)` is the
canonical form.

## What diagnostics are NOT

- **Not a metrics pipeline.** Diagnostics describe a single boot. Use
  OpenTelemetry / Prometheus for steady-state observability — those are
  wired in modules, not in `@sfos/core`.
- **Not a status endpoint.** A `/healthz` route is a transport concern;
  it lives in the BFF, which calls `renderDiagnostics` or selects the
  fields it wants.
- **Not a notification channel.** The runtime never wakes the operator
  on its own. If a module fails after boot, that's the `degraded`
  transition + module-emitted events, surfaced through the operator's
  existing alerting.

## Where diagnostics live in code

| File | Role |
| --- | --- |
| `src/diagnostics/state.ts` | `RuntimeDiagnostics` + `ModuleDiagnostic` types |
| `src/diagnostics/reporter.ts` | `renderDiagnostics` ASCII printer |
| `src/runtime/bootstrap.ts` | composes the snapshot from registry + engine + load result |
| `src/lifecycle/engine.ts` | `history()` feeds `lifecycleHistory` |
