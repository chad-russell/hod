# Hod — V1 MVP Product Requirements Document

**Date:** 2026-04-29
**Status:** Draft
**Author:** Collective design session

---

## 1. Vision

Hod is a deterministic, content-addressed build system. Its sole input is a set of serialized recipe files (`.hod` files) — flat, self-describing binary records that form a DAG of build operations. The builder resolves dependencies by hash, executes sandboxed builds on Linux, and produces content-addressed outputs.

The name comes from the bricklayer's hod — a tool for carrying bricks and mortar to the wall. Hod carries your build specifications to the sandbox.

### Design Principles (in priority order)

1. **Reproducibility.** Same recipe hash → same output hash. Always. No ifs, no buts, no "works on my machine."
2. **Performance.** Recipe files are first-class binary artifacts — cheap to parse, cheap to hash, cheap to store. No live object graphs, no runtime serialization, no promise accumulation.
3. **Rigor.** The recipe format is a custom deterministic binary encoding with a version tag. Every byte is specified. There is one valid encoding for each recipe.
4. **Separation of concerns.** Evaluation (source code → recipe files) is not the builder's job. The builder sees only `.hod` files. This separation is structural, not aspirational.

---

## 2. Problem Statement

Existing build systems suffer from fundamental architecture problems:

| System | Core Problem |
|--------|-------------|
| **Nix** | Hardcoded `/nix/store` path baked into outputs. ATerm format is obscure and fragile. Evaluation is tangled with building. Content-addressing is incomplete (ca-derivations still experimental). |
| **Brioche** | Evaluation builds a massive live JS object graph in V8, then serializes it. 883× object amplification for gtk4 (761K JS objects for 862 unique hashes). Serialization is >95% of build time. The JS↔Rust bridge is a performance minefield. |
| **Bazel** | Excellent distributed model but heavy infrastructure. Requires gRPC server, proto schemas, JDK. Not suitable for single-machine, low-overhead builds. |

Hod solves these by making serialized recipe files the fundamental unit of work, eliminating the live object graph problem entirely.

---

## 3. Architecture Overview

```
 ┌─────────────┐       ┌──────────────────┐       ┌─────────────┐
 │  Evaluator  │──────▶│   .hod files     │──────▶│  hod build  │
 │ (out of     │       │  (binary, on     │       │  (builder   │
 │  scope V1)  │       │   disk)          │       │   daemon)   │
 └─────────────┘       └──────────────────┘       └──────┬──────┘
                                                          │
                                                   ┌──────▼──────┐
                                                   │    Store     │
                                                   │ SQLite + FS  │
                                                   └─────────────┘
```

**Three layers (only the right two exist in V1):**

1. **Evaluator** (future): Any language/runtime that can emit `.hod` files. JS, DSL, WASM, Python — doesn't matter. Not our problem in V1.
2. **Recipe files**: Binary `.hod` files on disk, each a single recipe node. They reference other recipes by BLAKE3 hash. The set of reachable recipes from a root forms the build DAG.
3. **Builder + Store**: Reads `.hod` files, resolves the DAG, builds in sandboxes, stores outputs.

---

## 4. Recipe File Format

### 4.1 General Structure

Every `.hod` file is a self-contained binary record with this envelope:

```
┌──────────────────────────────────────────────┐
│  magic:        3 bytes  "HOD"                │
│  version:      u8        format version (0)  │
│  type:         u8        recipe type tag      │
│  body_len:     u32 LE    bytes in body        │
│  body:         [u8]      type-specific data   │
└──────────────────────────────────────────────┘
```

**The recipe hash is NOT in the file.** It is computed externally: `blake3(magic + version + type + body_len + body)`. The hash becomes the file's identity (its "name" in the store). This is the Nix `.drv` convention: the hash is derived from the contents, not stored in them.

### 4.2 Recipe Types

#### Type Tag 0x01: `File`

A file with known content.

```
body:
  content_blob_hash:   [u8; 32]    BLAKE3 hash of file contents
  executable:          u8          0x00 = not executable, 0x01 = executable
  has_resources:       u8          0x00 = no, 0x01 = yes
  resources_hash:      [u8; 32]?   BLAKE3 hash of resources directory recipe (if has_resources)
```

Semantics: When built, returns a file artifact containing the blob identified by `content_blob_hash`, with the specified executable bit. If `has_resources`, the resources recipe is built and associated with the file (for packed executables).

#### Type Tag 0x02: `Directory`

A directory with named entries.

```
body:
  entry_count:         u32 LE      number of entries
  entries:             [entry]     sorted by name (deterministic ordering)
    entry:
      name_len:        u16 LE      length of entry name in bytes
      name:            [u8]        UTF-8 filename (tick-encoded for special chars)
      entry_hash:      [u8; 32]    BLAKE3 hash of the recipe for this entry
```

Semantics: When built, returns a directory artifact. Each entry is built recursively. Entries are sorted lexicographically by name for deterministic hashing.

#### Type Tag 0x03: `Symlink`

A symbolic link.

```
body:
  target_len:          u16 LE      length of target path
  target:              [u8]        UTF-8 target path (relative)
```

Semantics: When built, returns a symlink artifact pointing to `target`.

#### Type Tag 0x04: `Download`

Fetch a file from a URL with a known content hash.

```
body:
  url_len:             u16 LE      length of URL
  url:                 [u8]        UTF-8 URL string
  hash_algorithm:      u8          0x01 = BLAKE3
  expected_hash:       [u8; 32]    hash of expected file contents
```

Semantics: When built, fetches the URL, verifies the content hash, and stores the result as a blob. Returns a file artifact. This is the only recipe type with network access (in a fixed-output sandbox).

#### Type Tag 0x05: `Process`

Run a command in a sandbox.

```
body:
  platform_len:        u16 LE      length of platform string
  platform:            [u8]        UTF-8 platform (e.g., "x86_64-linux")

  command_len:         u16 LE
  command:             [u8]        UTF-8 command string (resolved within deps)

  args_count:          u32 LE
  args:                [arg]
    arg_len:           u16 LE
    arg:               [u8]        UTF-8 argument string

  env_count:           u32 LE
  env_vars:            [env_var]   sorted by key
    key_len:           u16 LE
    key:               [u8]        UTF-8 variable name
    value_len:         u16 LE
    value:             [u8]        UTF-8 variable value

  deps_count:          u32 LE
  dependencies:        [dep]       sorted by name
    name_len:          u16 LE
    name:              [u8]        UTF-8 dependency name (e.g., "bash")
    recipe_hash:       [u8; 32]    BLAKE3 hash of dependency recipe

  has_workdir:         u8          0x00 = no, 0x01 = yes
  workdir_hash:        [u8; 32]?   recipe hash for working directory contents

  has_output_scaffold: u8          0x00 = no, 0x01 = yes
  output_scaffold_hash: [u8; 32]?  recipe hash for initial output directory contents

  unsafe_flags:        u8          bitmask: 0x01 = allow networking
```

Semantics: When built, the builder:
1. Recursively builds all dependencies
2. Mounts each dependency's output at `/deps/<name>/` inside the sandbox
3. Sets environment variables (user-specified + standard ones below)
4. Runs the command in a Linux namespace sandbox
5. Captures the output at `$OUT`
6. Returns whatever artifact (file, directory, symlink) was written to `$OUT`

**Standard environment variables** (set by the builder, not the recipe):
- `OUT`: path where the process must write its output
- `DEPS`: path to the dependencies directory (`/deps/`)
- `TMPDIR`: path to a writable temporary directory (`/tmp/`)
- `HOME`: path to a writable home directory (`/homeless-shelter/`)
- `HOD_STORE`: path to the store root (for future use)

### 4.3 Encoding Rules

These rules ensure deterministic hashing — there is exactly one valid binary encoding for any given recipe:

1. **All integers are little-endian.**
2. **All strings are UTF-8.** Length-prefixed with a fixed-width length field (u16 or u32 as specified).
3. **All lists are length-prefixed** and sorted where specified.
4. **All hashes are raw 32-byte BLAKE3 digests** (not hex-encoded).
5. **Optional fields use a presence byte** (0x00 = absent, 0x01 = present) followed by the data.
6. **No padding.** Fields are tightly packed.
7. **No field tags.** The type tag and field order define the schema. This is a fixed-format encoding, not a self-describing one.

---

## 5. Store Design

### 5.1 Storage Backend: SQLite + Filesystem (V1)

```
<store_root>/
  hod.db                  SQLite database (metadata)
  blobs/
    ab/                   sharded by first 2 hex chars of hash
      cdef0123...         raw blob content
    ...
  recipes/
    ab/
      cdef0123...         raw .hod binary content
    ...
  outputs/
    ab/
      cdef0123...         symlink to materialized output in staging/
    ...
  staging/                materialized build outputs
    ab/
      cdef0123...         actual directory tree / file
    ...
  tmp/                    build sandbox working directories
```

### 5.2 SQLite Schema

```sql
-- Recipe registry
CREATE TABLE recipes (
    recipe_hash  TEXT PRIMARY KEY,  -- hex-encoded BLAKE3 hash
    recipe_type  INTEGER NOT NULL,  -- type tag (1-5)
    stored_at    TEXT NOT NULL,     -- ISO 8601 timestamp
    body_size    INTEGER NOT NULL   -- size of recipe body in bytes
);

-- Build outputs: maps recipe hash → output artifact hash
CREATE TABLE outputs (
    recipe_hash  TEXT PRIMARY KEY,
    output_hash  TEXT NOT NULL,     -- BLAKE3 hash of the output artifact
    built_at     TEXT NOT NULL,     -- ISO 8601 timestamp
    build_ms     INTEGER NOT NULL   -- wall-clock build time in ms
);

-- Build logs
CREATE TABLE build_logs (
    recipe_hash  TEXT PRIMARY KEY,
    stdout_blob  TEXT,              -- hash of stdout blob (may be NULL)
    stderr_blob  TEXT,              -- hash of stderr blob (may be NULL)
    exit_code    INTEGER NOT NULL,
    built_at     TEXT NOT NULL
);

-- Dependency edges (for GC and DAG queries)
CREATE TABLE dependencies (
    recipe_hash  TEXT NOT NULL,
    dep_hash     TEXT NOT NULL,
    dep_name     TEXT,              -- NULL except for process deps
    PRIMARY KEY (recipe_hash, dep_hash)
);
CREATE INDEX idx_deps_reverse ON dependencies (dep_hash);

-- Blobs registry
CREATE TABLE blobs (
    blob_hash    TEXT PRIMARY KEY,  -- hex-encoded BLAKE3 hash
    blob_size    INTEGER NOT NULL,
    stored_at    TEXT NOT NULL
);
```

### 5.3 Store Location

The store location is user-configurable, resolved in this order:
1. `--store <path>` CLI flag
2. `HOD_STORE` environment variable
3. `$XDG_DATA_HOME/hod/` (defaulting to `~/.local/share/hod/`)

No hardcoded paths. No global store directory. The store is fully relocatable.

---

## 6. Sandbox Design

### 6.1 Linux Namespace Sandbox

Process recipes execute in isolated Linux namespaces:

| Namespace | Isolation |
|-----------|-----------|
| **Mount** | Private mount namespace. Only store paths, deps, tmp, and minimal `/dev`, `/proc` are mounted. |
| **PID** | Private PID namespace. Process sees only itself and children. |
| **IPC** | Private IPC namespace. No shared memory with host. |
| **UTS** | Private UTS namespace. Isolated hostname. |
| **Network** | Private network namespace (no network unless `unsafe_flags & 0x01`). Loopback only. |

### 6.2 Sandbox Filesystem Layout

Inside the sandbox, the process sees:

```
/                   (tmpfs root)
├── deps/
│   ├── bash/       → materialized output of bash recipe
│   ├── coreutils/  → materialized output of coreutils recipe
│   └── ...         → one directory per named dependency
├── tmp/            → writable tmpfs
├── dev/
│   ├── null
│   ├── zero
│   ├── urandom
│   └── ...
├── proc/           → procfs
├── out             → writable dir, process writes output here
└── homeless-shelter/
    └── .           → writable $HOME
```

### 6.3 Fixed-Output Sandboxes (Downloads)

Download recipes run in a sandbox with network access (to fetch the URL) but the builder verifies the output hash against `expected_hash` before accepting the result. If the hash doesn't match, the build fails.

---

## 7. Packed Executables

### 7.1 Motivation

Built outputs must be runnable without requiring a specific store path. Unlike Nix (which bakes `/nix/store/...` into binaries), Hod uses a relative-path approach inspired by brioche's packed executables.

### 7.2 Mechanism

When building a `File` recipe that has `has_resources = 0x01`:
1. The resources recipe is built, producing a directory artifact
2. The file (typically an ELF binary) gets patched so its `RPATH` / `RUNPATH` points to a relative path: `$ORIGIN/../resources/`
3. The final output places the file alongside a `resources/` directory containing the dependency libraries

Output structure:
```
<output>/
├── bin/
│   └── my-binary      (ELF with relative RPATH)
└── resources/
    └── lib/
        ├── libc.so.6
        └── ...
```

This makes outputs fully relocatable — move the directory anywhere and it still works.

---

## 8. CLI Interface

### 8.1 Commands

#### `hod build <recipe-file>`

Build a recipe file and all its transitive dependencies.

```
$ hod build ./my-app.hod
```

Behavior:
1. Read the `.hod` binary file
2. Compute its BLAKE3 hash
3. Check if output already exists in store (cache hit)
4. If not, resolve all dependency recipe hashes, recursively build
5. Execute the recipe in a sandbox (if Process) or assemble (if pure type)
6. Store the output and print the output hash

Flags:
- `--store <path>`: Override store location
- `--force`: Rebuild even if output is cached
- `--keep-failed`: Keep the sandbox working directory on build failure (for debugging)
- `--quiet`: Suppress stdout/stderr streaming from build processes
- `--verbose`: Print detailed DAG resolution info

Output: The BLAKE3 hash of the built artifact, printed to stdout.

#### `hod ls-output <hash>`

List the contents of a built output.

```
$ hod ls-output a1b2c3d4e5f6...
bin/
bin/my-binary
lib/
lib/libfoo.so
```

Flags:
- `--store <path>`: Override store location
- `--long`: Show file sizes and permissions
- `--recursive`: Recurse into subdirectories

### 8.2 Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Build failed (process exited non-zero) |
| 2 | Hash verification failed (download or integrity check) |
| 3 | Recipe file invalid (malformed binary) |
| 4 | Dependency not found (referenced recipe hash not in store and no .hod file available) |
| 5 | Platform mismatch (recipe targets different platform) |
| 10 | Store error (corruption, disk full, permissions) |

---

## 9. Build Execution Flow

```
hod build ./my-app.hod
         │
         ▼
   Parse .hod file ──────────────────────┐
   Compute recipe hash                    │
         │                               │
         ▼                               │
   Check output cache ──── HIT ────────▶ Return cached output hash
         │
        MISS
         │
         ▼
   Resolve dependencies (by hash)
   For each dep:
     - Check recipe store for .hod file
     - If not present, error (V1: no auto-fetch)
     - Recursively build
         │
         ▼
   Materialize deps into /deps/<name>/
         │
         ▼
   Set up sandbox (namespaces, mounts)
         │
         ▼
   Execute process / assemble artifact
   Stream stdout/stderr to terminal
   Capture logs to store
         │
         ├── SUCCESS ──▶ Store output artifact
         │               Record output hash in SQLite
         │               Record dependency edges
         │               Return output hash
         │
         └── FAILURE ──▶ Store logs in SQLite
                         Discard output (unless --keep-failed)
                         Exit code 1
```

---

## 10. Content Addressing

### 10.1 What gets hashed

| Object | Hash input | Hash function |
|--------|-----------|---------------|
| Recipe file | Raw binary `.hod` contents (magic + version + type + body_len + body) | BLAKE3 |
| Blob (file contents) | Raw bytes | BLAKE3 |
| Directory artifact | Sorted (name → entry_hash) pairs, recursively | BLAKE3 of canonical binary encoding |
| Build output | The artifact hash (recursive) | BLAKE3 |

### 10.2 Recipe identity

A recipe's identity is `blake3(recipe_bytes)`. Two recipe files with identical bytes produce identical hashes. The recipe file format is deterministic by construction (sorted maps, fixed-width fields, no optional padding), so semantically identical recipes always produce identical hashes.

### 10.3 Early cutoff

Because recipes are content-addressed, if a dependency changes but its *output hash* doesn't change (e.g., a build script was reformatted but produces the same binary), all downstream recipes that depend on it by *output hash* can be cached. This is "early cutoff" — a significant advantage over input-addressed systems like traditional Nix.

For V1, process recipes depend on their input *recipe hashes* (not output hashes), so changing a process recipe always invalidates it. But pure recipes (Directory, File, Symlink) depend on the output hashes of their children, so they benefit from early cutoff naturally.

---

## 11. Project Structure

Single Rust crate (V1):

```
hod/
├── Cargo.toml
├── PRD.md
├── src/
│   ├── main.rs              CLI entry point, argument parsing
│   ├── recipe.rs            Recipe types, binary encoding/decoding, hashing
│   ├── store.rs             Store abstraction (SQLite + filesystem)
│   ├── store/
│   │   ├── db.rs            SQLite operations
│   │   ├── blobs.rs         Blob storage (read/write/dedup)
│   │   └── recipes.rs       Recipe storage (read/write/query)
│   ├── build.rs             Build orchestrator (DAG resolution, caching)
│   ├── sandbox.rs           Linux namespace sandbox setup
│   ├── packed.rs            Packed executable (ELF patching)
│   ├── hash.rs              BLAKE3 hashing utilities
│   ├── encoding.rs          Binary encoding helpers
│   └── download.rs          URL fetching with hash verification
└── tests/
    ├── recipe_encoding.rs   Round-trip encoding tests
    ├── build_process.rs     End-to-end sandbox build tests
    ├── store_basic.rs       Store CRUD tests
    └── fixtures/            Test .hod files (hand-written binary)
```

### Key Dependencies

| Crate | Purpose |
|-------|---------|
| `blake3` | Hashing (everything) |
| `rusqlite` | SQLite store backend |
| `nix` | Linux namespace/clone/mount syscalls |
| `clap` | CLI argument parsing |
| `reqwest` | HTTP client (for downloads) |
| `object` + `memchr` | ELF parsing for packed executables |

---

## 12. Out of Scope (V1)

These are explicitly deferred to future versions. The system should be *designed towards* them but not *built for* them:

| Feature | Target Version | Design consideration |
|---------|---------------|---------------------|
| Evaluation language / compiler | V2 | Recipe format is stable foundation for any evaluator to target |
| Incremental evaluation (Salsa/Adapton) | V3 | Recipe hashes enable future cache invalidation |
| Cross-compilation | V2 | Platform field in Process recipe is reserved |
| Multi-language evaluators | V2 | `.hod` is the stable interface; any language can emit it |
| Distributed builds / remote execution | V3 | Store abstraction designed to swap SQLite for gRPC CAS |
| Registry / package sharing | V2 | Content-addressed recipes are inherently shareable |
| Garbage collection | V2 | `dependencies` table in SQLite enables reachability analysis |
| DAG optimization / pure function compilation | V4+ | Recipe types form a pure functional language; compiler can optimize |
| macOS / Windows support | V3 | Sandbox abstraction isolated in `sandbox.rs` |
| Multiple outputs per recipe | V2 | Extension point: recipe type tags 0x06+ |

---

## 13. Success Criteria

The V1 MVP is successful when:

1. **Correctness**: `hod build` on the same `.hod` file always produces the same output hash, on any machine with the same store contents.
2. **Performance**: Building a hello-world process recipe (bash + coreutils deps) completes in < 500ms (cache miss). Cache hit is < 5ms.
3. **Scale**: A DAG of 1,000 recipes (with realistic dependency fan-out) builds without OOM or unreasonable latency.
4. **Ergonomics**: A developer can hand-write a `.hod` file (using a hex editor or a small helper script) and build it without learning an evaluation language.
5. **Packed executables**: A built binary can be moved to any path on the filesystem and still runs correctly.

---

## 14. Example: Hello World

A minimal example showing the full pipeline. This would be hand-written in V1 (no evaluator).

**File recipe** for a shell script:
```
HOD  \x00  \x01  <body_len: u32>  <blob_hash: 32 bytes>  \x01  \x00
      ver   file                    content blob hash      exec   no res
```

**Process recipe** that runs the script:
```
HOD  \x00  \x05  <body_len>
      ver   proc
  <platform: "x86_64-linux">
  <command: "/deps/bash/bin/bash">
  <args: ["-c", "/deps/hello-script/hello.sh > $OUT"]>
  <env: []>
  <deps: [("bash", <bash_recipe_hash>), ("hello-script", <file_recipe_hash>)]>
  <no workdir, no output scaffold, no unsafe flags>
```

**Build:**
```bash
# Store the recipes
$ hod build ./hello-script.hod
a1b2c3...  # output hash of the file

$ hod build ./hello-process.hod
d4e5f6...  # output hash of the process

# Inspect the output
$ hod ls-output d4e5f6...
hello.txt
```

---

## Appendix A: Design Decisions Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Recipe format | Custom binary | Deterministic by construction, fast to parse, not tied to any serialization framework |
| Hash function | BLAKE3 | Fastest available, Merkle tree internally, widely supported |
| Store backend | SQLite + filesystem | Atomic transactions, fast lookups, blobs on disk for large content |
| Store path | User-configurable | No hardcoded paths; relocatable outputs via packed executables |
| Dependency mounting | Named at `/deps/<name>/` | Human-readable, explicit, hash-covered |
| Sandbox | Linux namespaces | Full isolation, no container runtime needed |
| Recipe→recipe references | By raw BLAKE3 hash (32 bytes) | Deduplication is structural — shared deps exist once |
| Hash in recipe file | No — computed externally | Like Nix .drv: hash is the name, not the content |
| Stdout/stderr | Stream + capture | Users see builds in real-time; logs stored for later inspection |
| Packed executables | Relative RPATH + resources dir | Outputs are relocatable without a global store path |
