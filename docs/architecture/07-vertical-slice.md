# 07 — First Vertical Slice

## Status

Planned acceptance target. Do not implement until foundation validators are
active and the architecture corpus matches current code.

## Purpose

The first vertical slice proves that platform boundaries work end to end. It is
not a reason to collapse contexts or bypass contracts for speed.

## Planned Scope

1. IAM authenticates a user and validates a session.
2. A runtime host binds tenant context.
3. Workspace metadata exposes an activated operational module.
4. One operational command changes data in its owning module.
5. The same transaction records audit and outbox event state.
6. Core publishes the event and exposes diagnostics.
7. A read path returns tenant-isolated operational truth.

The initial operational module is expected to be warehouse-oriented, but its
domain model requires a separate approved plan.

## Acceptance Criteria

- No module imports another module or `@sfos/core`.
- Runtime app composes manifests and lifecycle objects explicitly.
- Capability resolution succeeds before traffic.
- Every tenant query is RLS-bound.
- Cross-tenant adversarial tests fail closed.
- State mutation writes owned data, audit, and event atomically.
- Event ownership and manifest declaration validators pass.
- Workspace stores layout/visibility only, not operational records.
- Failure appears in diagnostics without corrupting sibling module state.

## Excluded

- UI polish.
- Realtime transport.
- AI and automation.
- Distributed brokers.
- Service extraction.
- Broad warehouse, production, or maintenance feature sets.

## Sequence

1. Finish foundation enforcement.
2. Define runtime host boundary.
3. Design workspace context.
4. Design one operational command.
5. Implement the smallest end-to-end path with adversarial tests.
