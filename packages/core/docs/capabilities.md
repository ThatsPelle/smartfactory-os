# Capability system

Modules declare what they **provide** and what they **require** as a list of
capability keys in the manifest. The runtime turns those lists into a
graph, refuses to start anything whose requirements cannot be satisfied,
and orders initialization so a provider is always ready before its
consumers.

The system is **declarative**. A module never asks the registry "who
implements X?" at runtime — the registry has already wired the answer at
boot.

## Capability key

```
<name>@<major>
```

- `name` is reverse-domain, lowercase: `core.event_bus`, `crm.contacts`.
- `major` is the contract version. Within one major, the contract evolves
  additively (fields may be added, never removed or repurposed). Across
  majors, consumers must opt in to the new major explicitly.

```
core.event_bus@1
warehouse.stock_levels@2
```

A consumer requires a capability key + a semver **range** against the
provider module's package version:

```jsonc
"requires": [
  { "capability": "core.event_bus@1", "version_range": ">=0.1.0" }
]
```

The `@major` half of the key must match exactly between requirement and
provider; `version_range` is matched loosely (semver) against the
provider's `identity.version`. This separation keeps contract versioning
distinct from release versioning.

## Resolution

Resolution happens in the `resolve` phase of bootstrap and produces a
`CapabilityResolution`:

```ts
interface CapabilityResolution {
  readonly order: readonly string[];
  readonly providersByModule: ReadonlyMap<string, readonly string[]>;
  readonly unresolvedByModule: ReadonlyMap<string, readonly CapabilityRequirement[]>;
  readonly cycles: readonly (readonly string[])[];
}
```

- **order** — initialization order. Leaves first, roots last. Computed
  with Kahn's algorithm.
- **providersByModule** — for each consumer, the provider module ids that
  satisfy its `requires`. Empty when the consumer has no dependencies.
- **unresolvedByModule** — requirements with no matching provider. The
  consumer is transitioned to `failed` before registration.
- **cycles** — strongly-connected components > 1, plus self-loops.
  Detected with Tarjan. Every cycle is treated as a packaging mistake
  (capabilities are contracts, not bidirectional channels); each member
  goes to `failed`.

## Policy decisions (intentional)

- **One provider per requirement.** If two registered modules both
  provide `core.event_bus@1` and a consumer requires it, the requirement
  is surfaced as unresolved. A future "select provider" manifest field
  may relax this; for v1 the deployment must remove the conflict.
- **Optional capabilities don't affect ordering.** `provides_optional`
  participates in the provider index for `findByCapability`, but
  `requires_optional` is not part of the graph — by definition the
  consumer must handle absence.
- **Self-loops are cycles.** A module that requires a capability it also
  provides is rejected. No exceptions.
- **Tarjan + Kahn run independently.** If a cycle exists Kahn produces a
  partial order; the cycle members are reported via `cycles`, and the
  partial order is still emitted so diagnostics aren't blank.

## Diagnostics surface

`RuntimeDiagnostics.modules[i]` exposes per-module:

- `providers` — the resolved provider ids (from `providersByModule`).
- `unresolved` — the requirements with no provider (from `unresolvedByModule`).

`RuntimeDiagnostics.capabilityCycles` lists every detected cycle as an
ordered id list.

`renderDiagnostics` prints both blocks under the module summary.

## What the system does NOT do

- It does not load code dynamically. Modules ship their lifecycle as a
  plain object; the registry never imports a file off the filesystem.
- It does not resolve capabilities lazily at request time. The
  resolution is computed once, at boot.
- It does not allow runtime substitution. A module's `requires` list is
  read from its manifest; there is no `withMock` or `inject` API.
