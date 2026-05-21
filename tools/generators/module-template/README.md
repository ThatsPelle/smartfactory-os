# Module Template

The canonical skeleton for every SmartFactory OS module.

Place tokens (`__MODULE_NAME__`, `__MODULE_SLUG__`, `__SCHEMA_NAME__`) are
substituted by the `pnpm new:module` generator (added in a later phase).
Until the generator lands, copy this directory by hand and replace tokens
consistently:

| Token | Example | Where it appears |
|---|---|---|
| `__MODULE_NAME__` | `warehouse` | filenames, identifiers, paths |
| `__MODULE_SLUG__` | `module-warehouse` | package name, directory name |
| `__MODULE_FULL_ID__` | `org.smartfactory-os.warehouse` | manifest identity id |
| `__SCHEMA_NAME__` | `module_warehouse` | Postgres schema namespace |
| `__DISPLAY_NAME__` | `Warehouse` | human-readable name |

## What the template contains

```
manifest.ts                       Manifest declaration (typed)
MODULE.md                         Human + AI README — required, must be filled
OWNERSHIP.md                      Per-module ownership notes — required
package.json                      Workspace package metadata
tsconfig.json                     Extends @sfos/tsconfig/node
src/
  server/
    index.ts                      Lifecycle export
    permissions.ts                Module-scoped permission keys
    events.ts                     Event type constants + payload schemas
    capabilities.ts               Capabilities this module provides/requires
  ui/
    index.ts                      UI registration entry (widgets, routes)
  shared/
    types.ts                      Types shared between server and ui
  migrations/
    0001_initial.sql              First migration — uses RLS macros
  locales/
    en.json                       Module's English strings
    it.json                       Module's Italian strings
tests/
  manifest.test.ts                Validates manifest at build time
```

## Rules every module follows

1. **Owns one Postgres schema** (`module_<name>`).
2. **Declares everything in the manifest** — events, permissions, capabilities.
3. **Emits an event for every state change**, in the same transaction.
4. **Tenant-scoped tables include `company_id` + RLS policy** (use the macro).
5. **No imports from other modules' packages.** Cross-module access through `@sfos/module-sdk`.
6. **UI never touches the DB directly.** UI calls module APIs.

See `docs/architecture/03-bounded-contexts.md` and `docs/architecture/04-manifest-and-events.md`.
