# AGENTS.md — Hod

Hod is a deterministic, content-addressed build system written in Rust. The full product specification lives in **PRD.md** — read it top to bottom before making changes.

## Key Concepts

- **Recipe files** (`.hod`) are the fundamental unit of work. They are deterministic binary records that form a DAG of build operations. No live object graphs, no runtime serialization.
- **Content addressing** via BLAKE3. A recipe's identity is `blake3(recipe_bytes)` — the hash is computed externally, never stored in the file.
- **Sandboxed builds** using Linux namespaces. Process recipes run in isolated mount/PID/IPC/UTS/network namespaces.
- **Separation of concerns**: The builder only reads `.hod` files. Evaluation (source code → recipes) is explicitly out of scope for V1.
- **Packed executables**: Outputs are relocatable via relative RPATH — no hardcoded store paths in binaries.

## Architecture

```
.hod files on disk → hod build (builder daemon) → Store (SQLite + filesystem)
```

Three layers, only the right two exist in V1:
1. **Evaluator** (future, out of scope)
2. **Recipe files** — binary `.hod` files, each a single recipe node
3. **Builder + Store** — reads recipes, resolves DAG, builds in sandboxes, stores outputs

## Project Structure (Target)

```
src/
  main.rs          CLI entry point, argument parsing
  recipe.rs        Recipe types, binary encoding/decoding, hashing
  store.rs         Store abstraction (SQLite + filesystem)
  store/db.rs      SQLite operations
  store/blobs.rs   Blob storage (read/write/dedup)
  store/recipes.rs Recipe storage (read/write/query)
  build.rs         Build orchestrator (DAG resolution, caching)
  sandbox.rs       Linux namespace sandbox setup
  packed.rs        Packed executable (ELF patching)
  hash.rs          BLAKE3 hashing utilities           ✅ exists
  encoding.rs      Binary encoding helpers             ✅ exists
  download.rs      URL fetching with hash verification
tests/
  recipe_encoding.rs, build_process.rs, store_basic.rs, fixtures/
```

## What's Implemented

- `src/encoding.rs` — `Encoder`/`Decoder` for deterministic binary serialization with round-trip tests.
- `src/hash.rs` — BLAKE3 hashing, hex encoding/decoding, filesystem sharding helpers with tests.
- `src/recipe.rs` — Recipe data types, binary encoding/decoding, content hashing with tests.
- `src/store.rs` + `src/store/` — SQLite + filesystem content-addressed store (blobs, recipes, outputs, build logs, dependencies) with tests.
- `src/build.rs` — Build orchestrator: DAG resolution, output caching, recipe-specific builders for File/Directory/Symlink/Process.
- `src/download.rs` — Download recipe builder stub (awaiting reqwest dependency).
- `Cargo.toml` — depends on `blake3`, `clap` (derive), `hex`, `rusqlite`. Dev-dep: `tempfile`.

## Recipe Binary Format

The recipe file envelope is:

```
"HOD" (3 bytes) | version (u8) | type (u8) | body_len (u32 LE) | body
```

Recipe types: `File` (0x01), `Directory` (0x02), `Symlink` (0x03), `Download` (0x04), `Process` (0x05).

Encoding rules (see PRD §4.3): all integers LE, all strings UTF-8 with fixed-width length prefix, lists length-prefixed and sorted where specified, hashes raw 32-byte BLAKE3, optional fields use presence byte, no padding, no field tags.

## Key Dependencies

| Crate | Purpose |
|-------|---------|
| `blake3` | All hashing |
| `rusqlite` | SQLite store backend (planned) |
| `nix` | Linux namespace/clone/mount syscalls (planned) |
| `clap` (derive) | CLI argument parsing |
| `reqwest` | HTTP client for downloads (planned) |
| `goblin` + `memchr` | ELF parsing for packed executables (planned) |

## Reference: Brioche

Hod draws significant inspiration from **brioche**, a JS-based content-addressed build system. The key problem Hod solves that brioche has is eliminating the live JS object graph / serialization bottleneck (see PRD §2).

Brioche source code for reference:
- **`~/Code/brioche`** — the brioche build system itself (Rust + JS runtime)
- **`~/Code/brioche-packages`** — the brioche package repository

When implementing store operations, sandboxing, or packed executables, the brioche codebase is a useful reference for how a similar system approaches these problems. Look at brioche's approach, then implement the hod-specific design from PRD.md.

## Working Conventions

- **Rust edition 2021**, MSRV per Cargo.toml.
- Run `cargo test -- --test-threads=1` before considering work done.
  - The sandbox uses Linux user namespaces which are rate-limited by the kernel.
  - Running tests with default thread count (>4) causes namespace exhaustion and multi-minute stalls.
  - With `--test-threads=1`, the full suite (163 tests) completes in ~1.2s.
- All encoding must be deterministic — one valid encoding per value, always.
- New recipe types or format changes must be specified in PRD.md first.
- The binary format is the contract — no ad-hoc extensions.
