# @sfos/events

Builders and validators for the platform event envelope.

`@sfos/contracts` declares **what** an event envelope is (frozen schema). `@sfos/events` provides **how** to build, validate, and chain envelopes correctly.

## What's here

- `buildEnvelope(input)` — construct a validated event envelope.
- `buildChildEnvelope(parent, input)` — continue a causation chain.
- `assertOwnership(type, sourceModule)` — enforce "only a module's own events."
- `parseEventType(type)` — split a dotted event type into module/entity/action.
- `newULID()` / `newULIDAt(ts)` — generate sortable, globally-unique ids.

## Why a separate package

`@sfos/contracts` stays dependency-free (zero internal deps). Anything that needs `ulid` or other runtime libraries belongs here, layered on top.

## Usage

```ts
import { buildEnvelope } from '@sfos/events';

const envelope = buildEnvelope({
  type: 'warehouse.item.created',
  version: '1.0',
  source_module: 'warehouse',
  company_id: companyId,
  emitted_by: { kind: 'user', id: userId },
  correlation_id: correlationId,
  source_entity_id: itemId,
  payload: { item_id: itemId, sku: 'ABC-123', name: 'Widget' },
  audit_required: true
});
```

`buildEnvelope` enforces:

- The event type belongs to `source_module`.
- The envelope is structurally valid per the Zod schema.

If either check fails, it throws. Producers should not catch these errors; they indicate a bug in module code.
