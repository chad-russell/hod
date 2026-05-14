# Docs Index

This directory is the **current documentation authority** for Hod.

> There is no top-level `PRD.md` in this checkout. If code or notes still mention a PRD, prefer the docs here plus the current Rust/TypeScript source.

## Read by task

| Task | Start here |
|------|------------|
| Understand the project quickly | `../README.md`, `../AGENTS.md`, this file |
| Author or update recipes | `recipe-compiler-guide.md`, `agent-package-guide.md` |
| Understand bootstrap/self-hosting | `bootstrap-pipeline.md` |
| Debug a build | `debugging-builds.md` |
| Understand runtime relocation / portability | `relocatable-binaries-guide.md`, `closure-transfer.md` |
| Work on profiles / end-user activation | `profiles.md` |
| Work on build env policy / metadata | `build-environment-and-metadata.md` |

## Current docs

- `agent-package-guide.md` — practical package-authoring guide and patterns.
- `bootstrap-pipeline.md` — seed → toolchain → downstream pipeline and current bootstrap status.
- `build-environment-and-metadata.md` — current build-env model and future metadata direction.
- `closure-transfer.md` — `hod closure` and `hod copy-closure` behavior.
- `debugging-builds.md` — current debugging workflows.
- `profiles.md` — TypeScript profiles and symlink-farm activation.
- `recipe-compiler-guide.md` — TypeScript SDK / recipe import workflow.
- `relocatable-binaries-guide.md` — ELF relocation, bootstrap injection, wrappers, portability.

## Historical plans

Historical or in-progress design notes live in `../plans/`.

Read `../plans/README.md` before trusting any individual plan file.

## Recent milestone

Hod now has a proven end-to-end portability milestone:

- build **Geany** from source
- copy its closure to another machine
- run it there successfully from the transferred store

That milestone is the best evidence that the current relocation + closure-transfer stack is real, not just theoretical.

## Suggested next fronts

If you are looking for the highest-value next work after the Geany milestone:

1. generalize GUI runtime metadata/wrappers
2. improve closure pull/cache workflows
3. keep shrinking the bootstrap trust base
