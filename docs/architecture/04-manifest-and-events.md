# 04 — Manifests, Capabilities, and Events

## Manifest Contract

Every module exports one manifest validated by `ManifestSchema` from
`@sfos/contracts`. The v1 shape contains:

- `identity`: stable id, display name, version, vendor, license.
- `platform`: manifest schema version, platform range, runtime modes.
- `capabilities`: required and optional provided capabilities.
- `dependencies`: required and optional capabilities.
- `schema`: owned namespace, tables, and published views.
- `migrations`: module-local migration directory and ordering.
- `permissions`: dotted permission catalog entries.
- `events_produced` and `events_consumed`.
- `metadata`: description and optional links.

The manifest schema is frozen at v1. Structural changes require an ADR,
versioning plan, and compatibility strategy.

## Module Identity and Namespace

- Package directory: `modules/module-<slug>`.
- Package name: `@sfos/<slug>`.
- PostgreSQL namespace: `module_<slug_with_underscores>`.
- Manifest id: stable full module identity, currently `sfos.iam` for IAM.
- Event namespace: final identity segment, currently `iam`.

## Capabilities

Capability keys use `<name>@<major>`. The major identifies the capability
contract; the provider module version separately satisfies a semver range.

Current IAM authentication capability:

```text
iam.authentication@1
```

Modules declare requirements. `@sfos/core` builds the provider graph, rejects
missing or ambiguous requirements, detects cycles, and initializes providers
before consumers.

## Lifecycle

`@sfos/module-sdk` defines:

- `preFlight`: fast platform-level readiness check.
- `register`: event subscriptions and module-local registration.
- `activate`: tenant activation hook invoked by explicit core orchestration.
- `deactivate`: planned tenant deactivation hook.

Modules receive explicit contexts. No service locator or import-time singleton
registration exists.

Activation validates the registered manifest and required active capability
providers. Successful activation persists `core.company_modules`, audit, and
outbox truth before the in-memory registry mirror changes. Bootstrap does not
activate modules automatically.

## Event Envelope

The frozen v1 envelope includes identity, type, payload version, tenant,
source, actor, correlation, causation, trace, cascade depth, payload,
visibility, and audit requirement.

Rules:

- Event type uses `<module>.<entity>.<action>`.
- Action describes a completed fact.
- `source_module` carries the full manifest module id.
- Only the owning module emits the event.
- Payload versions evolve independently from the envelope.
- State changes persist their event through the outbox transaction.

## Enforcement

- `defineManifest` validates at module import.
- Manifest validator checks discovery, naming, duplicates, ownership, and
  capability syntax.
- Event validator compares exported event constants with manifest declarations
  and builds sample envelopes through `@sfos/events`.
- EventBus checks emitting module id against envelope `source_module`.
- Database outbox ownership enforcement remains defense-in-depth work where
  noted in current core documentation.
