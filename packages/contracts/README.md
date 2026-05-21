# @sfos/contracts

**The trunk of the type tree.** Frozen contracts shared by every other package, module, and app in the platform.

This package depends on `zod` only. It has zero internal dependencies (enforced by `dependency-cruiser`). Changes to anything in `src/` require an ADR + a Changeset.

## What's here

| Module | Exposes |
|---|---|
| `brands.ts` | Branded primitive types (`CompanyId`, `UserId`, `ULID`, ...) + Zod schemas |
| `result.ts` | `Result<T, E>` + `Ok`/`Err` constructors |
| `envelope.ts` | The event envelope schema — **frozen at v1** |
| `manifest.ts` | The module manifest schema — **frozen at v1** |
| `permissions.ts` | Well-known platform permission keys |
| `capabilities.ts` | Well-known platform capability keys |

## Usage

```ts
import type { EventEnvelope } from '@sfos/contracts/envelope';
import type { Manifest } from '@sfos/contracts/manifest';
import { CORE_PERMISSIONS } from '@sfos/contracts/permissions';
import { CORE_CAPABILITIES } from '@sfos/contracts/capabilities';
import type { CompanyId, UserId } from '@sfos/contracts/brands';
```

## Frozen surfaces

- The envelope structure cannot change without a platform major version.
- Permission key naming pattern (`<scope>.<resource>.<action>`) cannot change.
- Capability key format (`<key>@<major>`) cannot change.
- Branded primitives can be added but not renamed.

## What does NOT belong here

- Runtime logic.
- I/O.
- Module-specific events, permissions, or capabilities (those live in the owning module).
- React components.
- Database client code.

If you find yourself wanting to import a runtime library here, you have crossed the wrong boundary.
