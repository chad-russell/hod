# AGENTS.md — Hod

Hod is a deterministic, content-addressed build system written in Rust. This file is the agent quick-start and table of contents; keep detailed design material in `docs/` and implementation status in code/tests.

> Current note: there is no top-level `PRD.md` in this checkout. Older comments may still say “see PRD”; treat the docs below plus the Rust/TS source as the current authority.

## Project Map

### Core Rust

```
src/
  main.rs          CLI entry point (`build`, `build --hash`, `ls-output`, `encode`, `decode`, `hash-file`, `import-recipe`, `import-from-json`, `inspect`, `export-recipe`)
  lib.rs           crate module exports
  recipe.rs        recipe types, deterministic binary encoding/decoding, JSON serde
  encoding.rs      binary encoding helpers
  hash.rs          BLAKE3 hashing, hex, filesystem sharding helpers
  store.rs         store facade (SQLite + filesystem)
  store/           DB, blob, and recipe storage internals
  build.rs         DAG resolution, caching, artifact staging, recipe builders
  sandbox.rs       Linux sandbox setup for Process recipes
  download.rs      Download builder using external `curl`
  packed.rs        packed-output support for `File.resources_hash` (RUNPATH patching + AT_EXECFN bootstrap)
  relocate.rs      store-relative ELF relocation pass used for Process `runtime_deps`
```

### TypeScript SDK

```
js/
  src/             Bun/TypeScript SDK that shells out to the `hod` CLI
  tests/           Bun tests for the SDK
```

The SDK currently provides `fileFromPath`, `fileFromHash`, `download`, `unpack`, `process`, `dep`, `fromHod`, `importToStore`, and `importFromJson`.

### Recipes and tests

```
recipes/           TypeScript recipe scripts (.ts) — sole source of truth
recipes/           no .json or .hod recipe files — recipes are imported to the store at evaluation time
tests/             Rust unit/integration tests; many sandbox/bootstrap tests are #[ignore]
examples/          small example recipes
plans/             planning notes, not necessarily current implementation
```

## Docs Table of Contents

- `docs/bootstrap-pipeline.md` — full build pipeline from seed to self-hosting: stages, executor/compiler evolution, folder map, and path to full self-hosting.
- `docs/recipe-compiler-guide.md` — current practical guide for authoring recipes with the Bun/TypeScript SDK and `hod encode`/`decode`/`hash-file`.
- `docs/debugging-builds.md` — current build-debugging workflow. `hod shell` and `hod import-file` are not implemented in this checkout.
- `docs/relocatable-binaries-guide.md` — current packed executable behavior and store-relative/AT_EXECFN relocation design/status.
- `docs/evaluator-resolver-prd.md` — deferred resolver/path-reference design. Not implemented; current recipes use concrete BLAKE3 dependency hashes.

## Core Concepts and Contracts

- **Recipe files** (`.hod` binary format) are deterministic binary records. They form a build DAG through recipe hashes. Recipes live in the Hod store (SQLite + sharded blobs); `.hod` files on disk are only produced by `hod export-recipe` for debugging.
- **TypeScript is the source of truth.** `.ts` recipe files in `recipes/` define the build DAG. Evaluating a `.ts` file with `bun run` encodes and imports each recipe into the store via `importToStore()`. No `.hod` or `.json` files remain in `recipes/`.
- **Content addressing** uses BLAKE3. A recipe’s identity is `blake3(recipe_bytes)`; the hash is computed externally and is never stored inside the file.
- **Binary format is the contract.** Avoid ad-hoc extensions. New recipe types or format changes should be documented first and must preserve deterministic encoding.
- **Builder inputs are concrete recipes.** `hod build` accepts either a `.hod` file path (`hod build <recipe.hod>`) or a store hash (`hod build --hash <hex>`). Dependencies must be concrete 32-byte recipe hashes. Path refs/resolution are a deferred design, not current behavior.
- **Store** is SQLite metadata plus sharded filesystem content under `$HOD_STORE` or `$XDG_DATA_HOME/hod`.
- **Process builds are sandboxed on Linux.** Current code uses user and mount namespaces, and a network namespace unless `unsafe_flags & 0x01` allows networking. Do not assume PID/IPC/UTS isolation unless you verify/update `src/sandbox.rs`.

## Recipe Binary Format

Envelope:

```text
"HOD" (3 bytes) | version (u8) | type (u8) | body_len (u32 LE) | body
```

Current recipe type tags:

| Type | Tag | Status |
|------|-----|--------|
| `File` | `0x01` | buildable |
| `Directory` | `0x02` | buildable |
| `Symlink` | `0x03` | buildable |
| `Download` | `0x04` | buildable via `curl` |
| `Process` | `0x05` | buildable via sandbox |
| `Unpack` | `0x06` | encodes/decodes; build is currently a stub |

Encoding rules: little-endian integers; UTF-8 strings with fixed-width length prefixes; raw 32-byte hashes; presence byte for optional fields; no padding or field tags. Lists that represent maps/sets must be sorted by their key (`Directory.entries`, process env, process dependencies, process `runtime_deps`). Process `runtime_deps` is a backward-compatible tail field: absent in older recipes, or encoded as an optional list when present.

## Current Caveats Agents Should Know

- `PRD.md` is absent; do not add references to it unless it is restored.
- `hod shell`, `hod import-file`, and `hod resolve` are not current CLI commands.
- `runtime_deps` is encoded as a backward-compatible Process tail field and is acted on by `build.rs` via `src/relocate.rs`. When using `shellBuild`, declare `runtime_deps` for any recipe that produces dynamically-linked binaries. `shellBuild` injects a long dummy RPATH (`$HOD_DUMMY_RPATH`) automatically; recipes that set their own `LDFLAGS` must include it. The relocation pass also adds a self-referencing `$ORIGIN/../lib` path so binaries can find shared libs in their own output.
- `src/relocate.rs` is an implemented prototype exported from `lib.rs` and integrated into the Process builder.
- AT_EXECFN bootstrap APIs (`parse_interp`, `patch_runpath_to`, `inject_bootstrap`) are present in `src/packed.rs`; heavyweight validation tests remain ignored by default.
- `Unpack` recipes can be represented and hashed, but `build_unpack` returns “not yet implemented”.

## Dependencies

| Crate/tool | Purpose |
|------------|---------|
| `blake3`, `hex` | hashing and hex encoding |
| `serde`, `serde_json` | JSON recipe encode/decode CLI |
| `clap` | CLI parsing |
| `rusqlite` | SQLite store metadata |
| `nix`, `unshare` | Linux namespace sandbox setup |
| `goblin`, `memchr` | ELF/RPATH parsing and patching |
| external `curl` | Download recipe fetching |
| Bun | TypeScript SDK tests/recipe generation |

## Working Conventions

- Rust edition: 2021.
- Use the dev shell if tools are missing: `nix develop --accept-flake-config` (also used by `.envrc`).
- Prefer `rg`, `find`, and targeted file reads before editing.
- Usual Rust validation is `cargo test -- --test-threads=1`; current known caveat is that the suite does not compile until the missing packed-bootstrap APIs referenced by `tests/at_execfn_validation.rs` are restored or the tests are updated.
- Do not run ignored bootstrap/sandbox integration tests unless requested; they can require network access and long builds.
- Preserve deterministic encoding: one value must have one valid byte representation.
- When editing docs, separate “implemented now” from “planned/design”.

## Brioche Reference

Hod draws inspiration from Brioche, especially around content-addressed builds, sandboxing, and packed executables. Reference checkouts may exist at:

- `~/Code/brioche`
- `~/Code/brioche-packages`

Use them for ideas, but implement Hod-specific behavior from this repository’s docs and source.
