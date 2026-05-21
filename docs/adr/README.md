# Architecture Decision Records

This directory holds the canonical record of structural decisions for SmartFactory OS. ADRs are **append-only**: a superseded decision is replaced by a new ADR that references it; the old ADR is never edited beyond marking its `status: superseded`.

## Why ADRs

Architecture documents describe the system today. ADRs describe **why** it became that way. When a future contributor (or AI agent) asks "why is X this way?", the answer is in an ADR.

## When to write an ADR

Write an ADR when the change:

- Introduces a new top-level package.
- Adds a new dependency edge between packages.
- Modifies a frozen surface (manifest schema, event envelope, permission naming).
- Changes a CI gate or architectural lint rule.
- Reverses a previous decision.
- Adopts (or drops) a third-party technology in core paths.

You do **not** need an ADR for routine feature work inside a module.

## Format

Each ADR is one Markdown file in this directory:

```
docs/adr/NNNN-short-kebab-title.md
```

`NNNN` is a zero-padded sequence number. Titles are short and stable.

Use the template in `_template.md` (below). Sections:

- **Status**: `proposed` → `accepted` → `superseded` (or `rejected`).
- **Date**: ISO date the decision was accepted.
- **Context**: what problem this solves, with enough background that the decision makes sense in isolation.
- **Decision**: the chosen approach. Stated plainly, not hedged.
- **Consequences**: positive and negative outcomes, including new constraints.
- **Alternatives considered**: what else was on the table and why it lost.

Keep ADRs short — 200-600 words typical. Long ADRs usually mean the decision wasn't ready.

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-monorepo-and-tooling.md) | Monorepo, pnpm, Turborepo, dependency-cruiser | accepted | 2026-05-20 |
| [0002](0002-eslint-v9-flat-config.md) | Adopt ESLint v9 Flat Config | accepted | 2026-05-20 |

(Update this table when adding a new ADR.)
