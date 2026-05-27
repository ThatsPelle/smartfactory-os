# Module integration

A module is **two things**, wired together by the host app:

1. A **manifest** — a plain data object validated against
   `ManifestSchema` from `@sfos/contracts`. Declares identity, the
   capabilities it provides, the capabilities it requires, the events
   it produces and consumes, the permissions it asks for, the database
   namespace it owns.
2. A **lifecycle implementation** — an object of type `ModuleLifecycle`
   from `@sfos/module-sdk`. Implements optional `preFlight` and
   `register` hooks (plus future `activate` / `deactivate` for per-tenant
   flows, not invoked by this foundation).

A module never imports `@sfos/core`. The runtime hands it exactly what
it needs through `PlatformContext`.

## A minimal module

```ts
// manifest.ts
import { defineManifest } from '@sfos/module-sdk';

export const manifest = defineManifest({
  identity: {
    id: 'crm',
    name: 'CRM',
    version: '0.1.0',
    vendor: 'Acme',
    license: 'MIT'
  },
  platform: {
    manifest_schema_version: '1',
    platform_version_range: '>=0.1.0',
    runtime_modes_supported: ['cloud', 'self_hosted', 'workstation']
  },
  capabilities: {
    provides: [{ key: 'crm.contacts@1' }],
    provides_optional: []
  },
  dependencies: {
    requires: [{ capability: 'core.event_bus@1', version_range: '>=0.1.0' }],
    requires_optional: [],
    platform_capabilities_required: []
  },
  schema: { namespace: 'crm', owns_tables: ['contacts'], published_views: [] },
  migrations: { directory: 'db/migrations', ordering: 'sequential' },
  permissions: [],
  events_produced: [
    { type: 'crm.contact.created', version: '1.0' /* + payload_schema */ }
  ],
  events_consumed: [],
  metadata: { description: 'Customer relationship management' }
});

// lifecycle.ts
import type { ModuleLifecycle } from '@sfos/module-sdk';

export const lifecycle: ModuleLifecycle = {
  preFlight: async (ctx) => {
    if (!ctx.settings.has('CRM_FEATURE_FLAG')) {
      return { ok: false, error: 'CRM_FEATURE_FLAG not set' };
    }
    return { ok: true, value: undefined };
  },

  register: async (ctx) => {
    ctx.events.subscribe('orders.placed.*', async (event, tenantCtx) => {
      tenantCtx.logger.info('crm received order', { orderId: event.id });
      // Domain work goes here.
    });
    return { ok: true, value: undefined };
  }
};
```

The host app then registers it with the runtime:

```ts
// app.ts
import { bootstrap } from '@sfos/core';
import { manifest as crmManifest, lifecycle as crmLifecycle } from './crm/index.js';

const { registry, bus, engine, diagnostics } = await bootstrap({
  platformVersion: '0.1.0',
  runtimeMode: 'self_hosted',
  modules: [{ manifest: crmManifest, lifecycle: crmLifecycle }]
});
```

## What the module receives

```ts
interface PlatformContext {
  readonly logger: ModuleLogger;
  readonly moduleId: string;
  readonly settings: PlatformSettings;
  readonly events: EventSubscriptionApi;
}
```

- **logger** — a structured `ModuleLogger`. The runtime's default writes
  JSON lines to stdout; the host swaps in pino / OpenTelemetry by passing
  `loggerFor` to `bootstrap`.
- **moduleId** — the manifest's `identity.id`. Cached here so the module
  does not need to import its own manifest.
- **settings** — a read-only `get` / `has` over a key/value store the
  host populated. Used for env-style configuration that the module
  should not pull from `process.env` directly.
- **events.subscribe(pattern, handler)** — the only subscription path.
  The handler signature is `(event, tenantCtx) => Promise<void>`. The
  runtime fabricates `tenantCtx` from the envelope's `company_id` per
  dispatch.

Inside a handler the module gets a `TenantContext` (companyId, logger,
moduleId, ownership-checked `events.emit`). Cross-handler emission goes
through the outbox so persistence + replay still work; the in-bus
`emit` exists for synchronous flows and is not part of this foundation.

## Lifecycle hooks

```ts
interface ModuleLifecycle {
  readonly preFlight?: (ctx: PlatformContext) => Promise<Result<void, string>>;
  readonly register?: (ctx: PlatformContext) => Promise<Result<void, string>>;
  readonly activate?: (ctx: TenantContext) => Promise<Result<void, string>>;
  readonly deactivate?: (ctx: TenantContext) => Promise<Result<void, string>>;
}
```

- **preFlight** — fast, side-effect-free environment check. Confirm that
  required env / settings / external services are reachable. Return
  `{ ok: false, error }` to refuse to start; the module goes to
  `failed`, the rest of the system continues without it.
- **register** — install subscriptions and any module-local state.
  Idempotent within one boot. Return `{ ok: false }` to refuse — same
  failure isolation as `preFlight`.
- **activate / deactivate** — per-tenant. The tenant activation flow
  invokes these when a company turns the module on or off; the
  foundation bootstrap does NOT call them.

A hook that throws is equivalent to returning `{ ok: false, error: e.message }`;
the runtime captures and marks `failed` with the thrown message as the
`reason`.

## Where modules live

The repository layout is intentional: modules live under `modules/`,
not `packages/`. The dependency rules:

- `packages/core` → never imports a module.
- A module → imports `@sfos/contracts` and `@sfos/module-sdk`. Never
  imports `@sfos/core`. Never imports another module directly —
  cross-module integration is via events and capabilities only.
- A module → imports `@sfos/db` to compose queries, but only against
  its own namespace (enforced by RLS + dependency-cruiser rules added
  when modules ship).

## Testing a module without `bootstrap`

The lifecycle implementation is a plain object; tests can call it
directly with a hand-built `PlatformContext`:

```ts
import { lifecycle } from './lifecycle.js';

const calls: string[] = [];
const ctx = {
  logger: { info: () => {}, warn: () => {}, error: () => {}, debug: () => {}, child: () => ctx.logger },
  moduleId: 'crm',
  settings: { get: () => undefined, has: () => true },
  events: { subscribe: (p, h) => { calls.push(p); } }
};

await lifecycle.preFlight!(ctx as any);
await lifecycle.register!(ctx as any);
expect(calls).toContain('orders.placed.*');
```

For end-to-end tests, build a one-module input and call `bootstrap` —
the runtime is fast (<10ms for a single module on commodity hardware)
and produces a `diagnostics` snapshot that asserts cleanly.
