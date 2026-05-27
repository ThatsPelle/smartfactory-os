# Ownership enforcement

A module may emit only the events it owns. Owning an event means the
module declares the event's type in its manifest under `events_produced`
and identifies itself in every envelope's `source_module` field.

This invariant is enforced in two places — the in-process front line in
`@sfos/core`, and the database row-level policies in `@sfos/db`.

## In-process: `ForeignEmissionError`

`EventBus.emit(emittingModuleId, envelope)` compares
`envelope.source_module` against `emittingModuleId`. A mismatch raises
`ForeignEmissionError` immediately — the bus never dispatches the
event.

```ts
class ForeignEmissionError extends Error {
  readonly emittingModuleId: string;
  readonly declaredSourceModule: string;
  readonly eventType: string;
}
```

`UndeclaredEmissionError` exists for the symmetric check: a module that
tries to emit a type not in its manifest's `events_produced`. The wiring
for that check lands when modules ship; the error type is here so the
contract is stable from day one.

## Why two layers

The in-process check fires in microseconds and produces a clean stack
trace pointing straight at the offending caller. It does not survive a
buggy module that builds its own envelopes and writes them to the outbox
directly. That is the second layer's job.

The DB layer enforces the same invariant against `core.outbox_events`:
when modules ship with their own Postgres roles, RLS will refuse an
INSERT whose `source_module` does not match the connection's module
identity. Until then the manifest-level catalog validator (`pnpm
validate:events`, currently a stub) is the cross-check at CI time.

Defense in depth means a single missed check at either layer is
recoverable — both have to fail before a foreign-emission slips
through.

## Where the bus checks

```
EventBus
├── subscribe(moduleId, pattern, handler)   — record subscription
├── emit(emittingModuleId, envelope)        — ownership-checked path
├── dispatch(envelope)                      — internal, used by publisher
└── subscriptions()                         — read-only inspection
```

The publisher uses `dispatch` directly because it has already validated
ownership at insert time (via the DB layer). Tenant code only ever has
access to `emit` through a wrapped `EventEmissionApi` that hard-codes
`emittingModuleId` to the calling module — there is no path to bypass
the check from inside a handler.

## What ownership does NOT cover

- **Read access.** Any subscribed handler can read any event whose
  pattern matches; ownership is about who may _emit_, not who may
  _receive_. Tenant scope is enforced separately through the envelope's
  `company_id` and RLS on outbox reads.
- **Payload contracts.** Ownership says "module A emitted this." It does
  not validate the payload against `events_produced[i].payload_schema`.
  That validation lives in the catalog validator and (at runtime) in
  `EventEnvelopeSchema` for the envelope itself + module-supplied
  payload schemas for the body.
- **Multi-tenant cross-talk.** Two modules in the same process can
  freely subscribe to each other's events; ownership is about emission
  authority, not subscription rights.

## Surface in code

| File                                    | Role                                                  |
| --------------------------------------- | ----------------------------------------------------- |
| `src/events/ownership.ts`               | `ForeignEmissionError`, `UndeclaredEmissionError`     |
| `src/events/bus.ts`                     | `emit` performs the check before dispatch             |
| `src/runtime/bootstrap.ts`              | per-tenant `events.emit` wrapper re-checks the source |
| (future) DB RLS on `core.outbox_events` | matching enforcement at the row layer                 |
