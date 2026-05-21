# Ownership — __DISPLAY_NAME__

## Code ownership

This module is owned by: `@maintainer`

CODEOWNERS at the repo root routes review for changes inside this directory.

## Data ownership

This module is the **only** writer of these schemas and tables:

- Postgres schema: `__SCHEMA_NAME__`
- Owned tables: (list once tables exist)
- Published views (read-only, in `public`): (list once views exist)

Other modules MAY read these via the published views (preferred) or via the
module's typed API. Other modules MAY NOT write to these tables; the
per-module Postgres role mechanically prevents it.

## Event ownership

This module is the **only** emitter of events whose type begins with
`__MODULE_NAME__.`. The event bus enforces this at publish.

## Capability ownership

Capabilities provided by this module are listed in `manifest.ts` under
`capabilities.provides`. Each capability is a stable contract within its
major version; breaking changes bump the major.

## Permission ownership

Permission keys in the `__MODULE_NAME__.*` namespace are owned by this module
and declared in `src/server/permissions.ts` + manifest. Other modules may
require them as part of cross-module workflows but may not add or rename
them.
