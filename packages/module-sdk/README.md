# @sfos/module-sdk

**The public contract for SmartFactory OS modules.** Licensed MIT so third-party modules can be authored without AGPL propagation.

## What's here

- `ModuleLifecycle` — the interface every module implements (`preFlight`, `activate`, `deactivate`, `register`).
- `PlatformContext`, `TenantContext` — what the platform passes to lifecycle hooks.
- `defineManifest(...)` — type-checked + runtime-validated manifest declaration.
- `ModuleRegistry`, `RegisteredModule` — types for cross-module reference (typed at compile time, indirected at runtime).
- Re-exports of `Manifest`, `PermissionKey`, `CapabilityKey` from `@sfos/contracts` for convenience.

## Authoring a module

```ts
// modules/module-warehouse/manifest.ts
import { defineManifest } from '@sfos/module-sdk';

export default defineManifest({
  identity: { id: 'org.smartfactory-os.warehouse', name: 'warehouse.name', version: '0.1.0', vendor: 'SmartFactory OS', license: 'AGPL-3.0-or-later' },
  platform: { manifest_schema_version: '1', platform_version_range: '>=0.1 <1.0', runtime_modes_supported: ['cloud', 'self_hosted', 'workstation'] },
  capabilities: { provides: [{ key: 'warehouse.inventory_tracking@1' }] },
  dependencies: { platform_capabilities_required: ['core.tenancy@1', 'core.event_bus@1'] },
  schema: { namespace: 'module_warehouse', owns_tables: ['items', 'movements'] },
  migrations: { directory: './src/migrations' },
  permissions: [
    { key: 'warehouse.item.read', default_roles: ['admin', 'supervisor', 'warehouse'] },
    { key: 'warehouse.item.write', default_roles: ['admin', 'warehouse'] }
  ],
  events_produced: [
    { type: 'warehouse.item.created', version: '1.0', audit_required: true, since_module_version: '0.1.0' }
  ],
  metadata: { description: 'Items, movements, stock — warehouse operations.' }
});
```

```ts
// modules/module-warehouse/src/server/index.ts
import type { ModuleLifecycle } from '@sfos/module-sdk';

const warehouse: ModuleLifecycle = {
  async preFlight() { /* ... */ return { ok: true, value: undefined }; },
  async activate(ctx) { /* ... */ return { ok: true, value: undefined }; },
  async register(ctx) { /* ... subscribe handlers ... */ return { ok: true, value: undefined }; }
};

export default warehouse;
```

The registry calls these hooks in the documented sequence; the module never touches platform internals.

## Boundaries

- **Modules may depend on** `@sfos/module-sdk`, `@sfos/contracts`, `@sfos/events`, and a few shared packages.
- **Modules MUST NOT depend on** other modules' packages. Cross-module access goes through the registry's typed API references.
- **Modules MUST NOT bypass** the SDK to reach platform internals.

These rules are mechanically enforced by `dependency-cruiser`.
