# Lifecycle

A registered module passes through a small, explicit state machine:

```
       ┌──────────────┐
       │  discovered  │  manifest received by load phase
       └──────┬───────┘
              │ schema ok, id unique, platform/runtime mode compatible
              ▼
       ┌──────────────┐
       │  validated   │  about to enter resolve
       └──────┬───────┘
              │ all `requires` satisfied, no cycle
              ▼
       ┌──────────────┐
       │  registered  │  in registry, init order known
       └──────┬───────┘
              │ preFlight + register hooks returned Ok
              ▼
       ┌──────────────┐
       │ initialized  │  serving traffic
       └──────┬───────┘
              │ a handler crashed   ┌──────────┐
              ├────────────────────►│ degraded │
              │                     └────┬─────┘
              │ ◄── operator recovered ──┘
              │
              │ unrecoverable error
              ▼
       ┌──────────────┐       ┌──────────┐
       │   failed     │──────►│ disabled │  terminal until restart
       └──────────────┘       └──────────┘
```

The transition matrix lives in `lifecycle/state.ts`. The engine refuses
any transition not in the matrix — silent illegal transitions are the bug
we want to catch loudest.

## States in detail

- **discovered** — load received the candidate but has not yet validated
  it. A module only stays here for the duration of one phase.
- **validated** — schema ok, id unique, platform & runtime match. Sits
  here only while resolve is computing the capability graph.
- **registered** — module is in the `InMemoryModuleRegistry`, has a slot
  in the topological init order, but its hooks have not run yet.
- **initialized** — `preFlight` and `register` returned `Ok`. The module
  is wired into the event bus and serving traffic.
- **degraded** — operationally functional but a non-fatal failure
  occurred (a handler raised, a background task crashed). The module is
  still wired in; the operator decides whether to restore or fail it.
- **failed** — preFlight returned `Err`, register threw, an unresolved
  requirement was found, or the module belongs to a capability cycle.
  Failed modules are NOT in the registry's `list()` output — they cannot
  serve.
- **disabled** — operator-driven off-switch. Terminal until restart.

## Where transitions happen

Every transition is recorded in `engine.history()` with a `reason` field:

```ts
engine.transition('crm', 'failed', 'preFlight: missing DATABASE_URL');
```

Bootstrap drives the legal transitions for every module. The `reason`
strings are stable enough to grep across log lines.

| Phase           | Transition driver                                    |
| --------------- | ---------------------------------------------------- |
| load            | `engine.introduce(id, 'loaded')` puts in `discovered`|
| resolve         | `validated`, then `failed` on unresolved/cycle       |
| register        | `registered` for everyone the registry accepted     |
| initialize      | `initialized` on hook success; `failed` otherwise   |
| (runtime)       | `degraded` when a subscribed handler raises          |
| (operator)      | `disabled` (admin endpoint, not yet wired)           |

## Per-tenant activation is separate

The lifecycle engine tracks **platform** state. Per-tenant activation
(a tenant turning a module on or off) is tracked in
`core.company_modules`. The registry mirrors that via `markActive` /
`markInactive`, but the lifecycle engine itself does not know who has
activated what. That separation is intentional — module state across
the platform and module activation per tenant change at very different
rates, and conflating them would push the engine into doing two jobs.

## History

`engine.history()` returns an append-only buffer (soft-capped at 1024
entries). Each entry has `{ moduleId, from, to, at, reason }`. The
diagnostics snapshot embeds this in full — when troubleshooting a slow
or stuck startup, the history is where to look first.
