# Module Documentation

This directory holds **canonical per-module documentation** beyond what lives in each module's own `MODULE.md`.

Each module's `MODULE.md` (under `modules/module-<name>/MODULE.md`) is the **first source of truth** — it lives next to the code and evolves with it. Documents here are platform-wide perspectives: cross-module flows, integration patterns, generated catalogs.

## Planned contents

- `events.generated.md` — auto-generated catalog of all events across modules (from manifests).
- `manifests/` — per-module manifest reference pages (auto-generated).
- `permissions.generated.md` — auto-generated permission catalog.
- `capabilities.generated.md` — auto-generated capability map.

The generators that populate this directory will be wired in a later phase (after the first module ships). Until then, this directory is intentionally minimal.
