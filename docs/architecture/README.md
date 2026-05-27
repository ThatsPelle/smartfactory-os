# Architecture Corpus

The platform's architecture is documented in **eight canonical documents**. Read them in order before contributing.

| #   | Document                    | Owns                                                                 |
| --- | --------------------------- | -------------------------------------------------------------------- |
| 01  | `01-blueprint.md`           | Product vision, deployment posture, tech stack, system topology      |
| 02  | `02-wizard.md`              | Initialization wizard — 6 steps, end-to-end orchestration            |
| 03  | `03-bounded-contexts.md`    | Domain ownership, source-of-truth rules, anti-corruption             |
| 04  | `04-manifest-and-events.md` | Manifest schema, event envelope, registry mechanics, capabilities    |
| 05  | `05-security-iam-rls.md`    | Multi-tenant security, RLS policy patterns, automation/AI boundaries |
| 06  | `06-monorepo.md`            | Repository structure, import discipline, package strategy            |
| 07  | `07-vertical-slice.md`      | First end-to-end implementation — the architecture's acceptance test |
| 08  | `08-bootstrap.md`           | Execution sequencing — how the architecture becomes a working repo   |

## Status

These documents are **frozen foundations** until an ADR supersedes a section. Adding new content is fine; changing existing structural commitments requires ADR + Changeset.

## How to update

1. Open a PR with the proposed change.
2. Include an ADR documenting the rationale (in `docs/adr/`).
3. Update the relevant document.
4. Reference the new ADR from the document's affected section.

## Where to start

- **Trying to understand the platform?** Start with `01-blueprint.md` and skim `03-bounded-contexts.md`.
- **Writing a new module?** Read `03`, `04`, `05`, then the module template under `tools/generators/module-template/`.
- **Touching the database?** Read `05-security-iam-rls.md`.
- **Adding a new package or app?** Read `06-monorepo.md` and write an ADR.
- **AI agent picking up work?** Start with `AGENTS.md` at the repo root.

## Documents

The eight documents will be committed alongside the bootstrap in their final form during the next phase (they exist as the project's planning corpus already, prior to the repository). This README is the index.
