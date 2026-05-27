# Runtime architecture

The runtime has **one** entry point: `bootstrap(input)`. It returns the
runtime state explicitly — registry, bus, lifecycle engine, diagnostics —
and never installs anything on `globalThis`. An app that wants two
isolated runtimes in the same process gets two `bootstrap()` results.

## Five phases, in order

```
bootstrap(input)
   │
   ├── 1. load       — validate manifests, dedupe ids, check platform version
   ├── 2. resolve    — build capability graph, topological order, detect cycles
   ├── 3. register   — file modules into the registry in topo order
   ├── 4. initialize — call preFlight + register hooks per module
   └── 5. snapshot   — compose RuntimeDiagnostics
```

Each phase is timed; the elapsed ms is in `diagnostics.phaseDurations`
under those exact keys.

Phases are **deterministic**: same input modules, same diagnostics
shape. Failures during any phase are recorded into the diagnostics and
do not throw out of `bootstrap`. The caller decides whether a partial
start is acceptable.

## Why phases at all

Each phase enforces an invariant the next phase depends on:

- **load** rejects malformed manifests and duplicate ids so resolve can
  assume every input has a unique, schema-valid manifest.
- **resolve** computes a capability graph so register can install modules
  in an order where every requirement is already in the registry.
- **register** populates the in-memory registry so initialize can run
  hooks against a stable lookup surface.
- **initialize** runs each module's hooks in the topological order; a
  module's `register` hook can safely call `bus.subscribe` because
  prior phases proved the bus exists and the order is sound.

If a phase fails for a module, that module is marked `failed` and
subsequent phases skip it. Sibling modules continue. This is
**failure isolation**: one broken module does not crash the platform.

## Why not a service locator / IoC container

A service locator turns runtime ownership questions into resolution
questions. "Where did this dependency come from?" stops being something
you read in a file and starts being something you query. We have chosen
the opposite default.

- Modules receive a `PlatformContext` (logger, settings, event subscription
  api) from `bootstrap`. They do not pull anything from a global.
- Cross-module integration is via **events** and **capabilities**, never
  via "give me the `CRMService` instance".
- The runtime never reaches into a module to fetch a function. Modules
  expose what they want exposed by emitting events, by subscribing to
  events, and by listing what they provide in the manifest.

## What stays out of @sfos/core

Recurring decisions documented so a future change does not relitigate them:

| Concern | Where it lives | Why not here |
| --- | --- | --- |
| HTTP transport | the BFF / app | the runtime should be process-agnostic |
| Auth, session, RLS binding | the BFF | tenant context is a request concern |
| Realtime / WebSocket | a dedicated module | not foundational, not minimal |
| Distributed event bus | a future module behind capability `core.event_bus@1` | swappable, not built-in |
| Job scheduler / cron | a future module | same |
| Dashboards, automation, AI | modules | not platform |

The runtime is the **floor** other things sit on. It is not the place
where every operational concern accumulates.

## Threading model

Single-threaded inside a Node process. The bus dispatches sequentially
per envelope; the publisher claims batches and processes them one by one
within a single `run()`. If we ever need horizontal scaling of the
publisher, the `FOR UPDATE SKIP LOCKED` claim already supports it —
multiple processes can drain the same outbox without coordination.

## Deferred (with explicit reasons)

- **System-context dispatch path.** Events with `company_id IS NULL`
  (platform-system events) are skipped by the per-module subscription
  wrapper. They need a system-context invocation path that ships with
  the tenant-aware request layer, not this foundation.
- **Per-tenant lifecycle hooks.** `activate(ctx)` / `deactivate(ctx)`
  on `ModuleLifecycle` exist in the SDK but are not invoked by this
  bootstrap — the tenant activation flow is a separate layer.
- **Per-handler emit.** A handler that wants to emit a downstream event
  must publish to the outbox (so persistence + replay still work). The
  in-bus `emit` exists for synchronous flows only — those are not part
  of this foundation.
- **Hot module reload.** `bootstrap` is a one-shot operation. A future
  add will support `registry.replace(moduleId, registeredModule)` with
  its own lifecycle policy.
