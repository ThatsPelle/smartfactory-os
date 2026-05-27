# @sfos/core

Runtime orchestration for SmartFactory OS. Owns the single boot path the
platform goes through: load manifests, resolve capabilities, register
modules, initialize them, expose diagnostics. Also owns the in-process
event bus, the outbox publisher that drains `core.outbox_events`, and the
audit sink that centralizes writes to `core.audit_logs`.

It does **not** own:

- any business logic
- any module logic
- any HTTP / RPC / realtime / websocket transport
- any distributed broker — Kafka, RabbitMQ, etc., are explicitly out of scope
- any tenant request lifecycle (auth, RLS binding) — that lives in the BFF

The package is intentionally small. If you find yourself reaching for a
service locator, an IoC container, or "registering" something at module
import time, stop — that is not the shape of this runtime.

## Public surface

```ts
import {
  bootstrap,
  EventBus,
  OutboxPublisher,
  AuditSink,
  renderDiagnostics
} from '@sfos/core';

const { registry, bus, engine, diagnostics } = await bootstrap({
  platformVersion: '0.1.0',
  runtimeMode: 'self_hosted',
  modules: [
    { manifest: crmManifest, lifecycle: crmLifecycle }
    // …more modules
  ]
});

console.log(renderDiagnostics(diagnostics));

// Later, in a background loop:
const publisher = new OutboxPublisher(adminDb, bus);
await publisher.run();
```

The `bootstrap` call is the one and only entry point. There is no
`@sfos/core.init()` global side effect. There are no decorators.

## Topics

- [Runtime architecture](./docs/runtime-architecture.md) — the boot phases, why each exists
- [Lifecycle](./docs/lifecycle.md) — the module state machine
- [Capability system](./docs/capabilities.md) — declarative dependency resolution
- [Ownership enforcement](./docs/ownership-enforcement.md) — modules emit only what they own
- [Diagnostics](./docs/diagnostics.md) — runtime truth, surfaced explicitly
- [Module integration](./docs/module-integration.md) — how a module wires up

## What lives where

```
packages/core/
├── README.md
├── package.json
├── tsconfig.json
├── eslint.config.js
├── vitest.config.ts
│
├── docs/
│   ├── runtime-architecture.md
│   ├── lifecycle.md
│   ├── capabilities.md
│   ├── ownership-enforcement.md
│   ├── diagnostics.md
│   └── module-integration.md
│
├── src/
│   ├── index.ts                   — public barrel
│   ├── runtime/
│   │   ├── bootstrap.ts           — load → resolve → register → initialize
│   │   └── logger.ts              — minimal JSON-line ModuleLogger
│   ├── manifests/loader.ts        — runtime validation + duplicate + version check
│   ├── registry/module-registry.ts— InMemoryModuleRegistry implementation
│   ├── lifecycle/
│   │   ├── state.ts               — state enum + transition matrix
│   │   ├── engine.ts              — small state machine + history
│   │   └── errors.ts              — typed lifecycle errors
│   ├── capabilities/
│   │   ├── version.ts             — capability key parser + semver match
│   │   └── graph.ts               — Tarjan SCC, Kahn topo sort
│   ├── events/
│   │   ├── matcher.ts             — pattern → type matching
│   │   ├── bus.ts                 — in-process EventBus
│   │   └── ownership.ts           — ForeignEmissionError
│   ├── outbox/publisher.ts        — claim → dispatch → mark
│   ├── audit/sink.ts              — append-only audit write helper
│   └── diagnostics/
│       ├── state.ts               — RuntimeDiagnostics snapshot type
│       └── reporter.ts            — human-readable render
│
└── tests/
    ├── helpers.ts
    ├── lifecycle.test.ts
    ├── registry.test.ts
    ├── capabilities.test.ts
    ├── events.test.ts
    ├── bootstrap.test.ts
    └── outbox.test.ts             — needs TEST_DATABASE_URL (skips otherwise)
```
