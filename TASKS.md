# TASKS.md — Hod V1 MVP Implementation Tracker

**Last updated:** 2026-04-29

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Layer 0: Foundation

These are prerequisites — everything else depends on them.

- [x] `encoding.rs` — `Encoder` / `Decoder` for deterministic binary serialization + round-trip tests
- [x] `hash.rs` — BLAKE3 hashing, hex encode/decode, sharding helpers + tests
- [x] `Cargo.toml` — add `hex` dependency (used by `hash.rs` but not declared)
- [x] `src/lib.rs` — crate root, re-export modules

---

## Layer 1: Recipe Types & Codec

The recipe data model and its binary encoding/decoding. This is the core contract of the system.

### 1.1 Recipe data types — `src/recipe.rs`

- [x] `RecipeType` enum with type tags (File=0x01, Directory=0x02, Symlink=0x03, Download=0x04, Process=0x05)
- [x] `RecipeFile` struct (content_blob_hash, executable, optional resources_hash)
- [x] `DirectoryEntry` struct (name, entry_hash) + `RecipeDirectory` struct (entries sorted by name)
- [x] `RecipeSymlink` struct (target)
- [x] `RecipeDownload` struct (url, hash_algorithm, expected_hash)
- [x] `RecipeProcess` struct (platform, command, args, env, dependencies, optional workdir/scaffold, unsafe_flags)
- [x] `Recipe` enum wrapping all five variants
- [x] Envelope constants: magic `"HOD"`, version `0x00`
- [x] `Recipe::recipe_hash(&self) -> Hash` — encode then blake3 the full binary

### 1.2 Binary encoding — `src/recipe.rs`

- [x] `Recipe::encode(&self) -> Vec<u8>` — full envelope (magic + version + type + body_len + body)
- [x] Encode `RecipeFile` body using the `Encoder`
- [x] Encode `RecipeDirectory` body (sorted entries, u32 count prefix)
- [x] Encode `RecipeSymlink` body
- [x] Encode `RecipeDownload` body
- [x] Encode `RecipeProcess` body (sorted env vars, sorted dependencies, optional fields)

### 1.3 Binary decoding — `src/recipe.rs`

- [x] `Recipe::decode(bytes: &[u8]) -> Result<Recipe>` — parse full envelope
- [x] Validate magic == `"HOD"`, version == `0x00`, type in valid range
- [x] Validate `body_len` matches actual remaining bytes
- [x] Decode each recipe type body using the `Decoder`
- [x] Decode `RecipeProcess` — verify env vars and deps are sorted (reject if not)

### 1.4 Tests — `tests/recipe_encoding.rs`

- [x] Round-trip encode→decode for each recipe type (File, Directory, Symlink, Download, Process)
- [x] Round-trip for a Process with all optional fields present (workdir, scaffold, resources)
- [x] Round-trip for a Process with all optional fields absent
- [x] Determinism: encode the same recipe twice → identical bytes
- [x] Hash stability: known recipe → known hash (golden test with hardcoded expected hash)
- [x] Rejection tests: invalid magic, wrong version, unknown type tag, body_len mismatch
- [x] Rejection: unsorted env vars / unsorted deps in Process → decode error
- [x] Rejection: trailing bytes after body → decode error
- [x] Test fixtures: hand-written binary `.hod` files in `tests/fixtures/` for golden tests

---

## Layer 2: Store

Persistent content-addressed storage. SQLite for metadata, filesystem for blobs/recipes/outputs.

### 2.1 Store location resolution — `src/store.rs`

- [x] `StoreConfig` struct with resolution order: CLI flag → `HOD_STORE` env → `XDG_DATA_HOME/hod/`
- [x] `Store::open(config: &StoreConfig) -> Result<Store>` — create dirs + open DB

### 2.2 SQLite schema — `src/store/db.rs`

- [x] `db.rs` — open SQLite connection, run migrations (create tables if not exist)
- [x] Schema: `recipes`, `outputs`, `build_logs`, `dependencies`, `blobs` (from PRD §5.2)
- [x] Index: `idx_deps_reverse` on `dependencies(dep_hash)`

### 2.3 Blob storage — `src/store/blobs.rs`

- [x] `blobs::write(store, data: &[u8]) -> Result<Hash>` — hash, shard, write to `blobs/ab/cdef...`
- [x] `blobs::read(store, hash: &Hash) -> Result<Vec<u8>>` — read from sharded path
- [x] `blobs::exists(store, hash: &Hash) -> bool` — check existence (DB + file)
- [x] Dedup: don't write if blob already exists

### 2.4 Recipe storage — `src/store/recipes.rs`

- [x] `recipes::store_recipe(store, bytes: &[u8]) -> Result<Hash>` — compute hash, write binary to `recipes/ab/cdef...`, insert into DB
- [x] `recipes::get_recipe(store, hash: &Hash) -> Result<Vec<u8>>` — read raw binary from store
- [x] `recipes::exists(store, hash: &Hash) -> bool` — check DB

### 2.5 Output storage — `src/store.rs` (or `src/store/outputs.rs`)

- [x] `outputs::store_output(store, recipe_hash, output_artifact) -> Result<()>` — write to staging, record in DB
- [x] `outputs::get_output(store, recipe_hash) -> Option<Hash>` — check DB for cached output
- [x] `outputs::materialize(store, output_hash) -> Result<PathBuf>` — realize artifact to staging dir
- [x] `outputs::store_build_log(store, recipe_hash, stdout, stderr, exit_code) -> Result<()>`

### 2.6 Tests — `tests/store_basic.rs`

- [x] Open store in a temp dir, verify directory structure is created
- [x] Store a blob → read it back → bytes match
- [x] Store the same blob twice → dedup (single file on disk)
- [x] Store a recipe → read it back → bytes match
- [x] Store an output → look up by recipe hash → found
- [x] Look up non-existent recipe / output → not found
- [x] Store build log → retrieve → fields match
- [x] Dependencies are recorded and queryable

---

## Layer 3: Builder

The build orchestrator. Resolves DAG, checks cache, delegates to recipe-specific builders.

### 3.1 Build orchestrator — `src/build.rs`

- [x] `build(store, recipe_bytes) -> Result<Hash>` — top-level entry point
- [x] Parse recipe, compute hash, check output cache → return on hit
- [x] Recursively build all dependencies (by hash)
- [x] Error on missing dependency (recipe hash not in store and no `.hod` file provided) — exit code 4
- [x] Dispatch to recipe-specific build function based on type
- [x] Record output hash in store, record dependency edges
- [x] `--force` flag: skip cache check

### 3.2 Build: pure recipes

- [x] `build_file` — fetch blob from store, materialize file with correct executable bit
- [x] `build_directory` — recursively build entries, assemble directory, compute directory hash
- [x] `build_symlink` — create symlink artifact

### 3.3 Build: Download — `src/download.rs`

- [x] `build_download` — HTTP GET the URL (via reqwest)
- [x] Verify content hash matches `expected_hash` → error code 2 on mismatch
- [x] Store result as blob
- [x] *Note: uses `curl` as external process instead of reqwest.*

### 3.4 Build: Process — `src/build.rs` → `src/sandbox.rs`

- [x] `build_process` — build all deps, set up execution environment, execute, capture output
- [x] Stream stdout/stderr to terminal (unless `--quiet`)
- [x] Capture stdout/stderr blobs to store
- [x] Record exit code → error code 1 on non-zero
- [x] Platform check: reject if `platform != current_platform` → error code 5
- [x] Linux namespace sandboxing implemented in Layer 4

### 3.5 Tests — `tests/build_process.rs`

- [x] Build a File recipe → blob stored, output hash correct
- [x] Build a Directory recipe with nested entries → directory materialized correctly
- [x] Build a Symlink recipe → symlink created with correct target
- [x] Cache hit: build same recipe twice → second build returns cached hash (< 5ms)
- [x] Cache miss on changed recipe → new output hash
- [x] Dependency chain: File → Directory that contains it → output correct
- [x] Missing dependency → error code 4
- [x] Invalid recipe binary → error code 3
- [x] Process: hello-world → output correct
- [x] Process: platform mismatch → error code 5
- [x] Process: non-zero exit → error code 1
- [x] Process: env vars set correctly
- [x] Download: hash mismatch returns correct error

---

## Layer 4: Sandbox

Linux namespace isolation for Process and Download builds. Linux-only, requires user namespaces.

### 4.1 Sandbox setup — `src/sandbox.rs`

- [x] Create sandbox working directory in `store/tmp/`
- [x] Set up user namespace with uid/gid mapping (unprivileged, using `unshare` crate)
- [x] Set up mount namespace: bind-mount host `/dev`, `/proc`, essential system dirs
- [x] Set up PID namespace (via `unshare` crate)
- [x] Set up IPC namespace (via `unshare` crate)
- [x] Set up UTS namespace (via `unshare` crate)
- [x] Set up network namespace (loopback only; full network if `unsafe_flags & 0x01`)
- [x] Create sandbox filesystem layout per PRD §6.2:
  ```
  /deps/<name>/...   (bind-mount each dep output, read-only)
  /tmp               (writable tmpfs or directory)
  /dev               (bind-mounted from host)
  /proc              (bind-mounted from host)
  /out               (writable, process writes output here)
  /homeless-shelter  (writable $HOME)
  /bin, /usr, /lib   (bind-mounted from host, read-only, for base system)
  ```
- [x] Set environment: `OUT`, `DEPS`, `TMPDIR`, `HOME`, `HOD_STORE` + user env vars
- [x] Execute command in chroot, wait for exit
- [x] Capture stdout/stderr to blobs
- [x] `--keep-failed`: don't clean up sandbox dir on failure

### 4.2 Sandbox tests — `tests/build_process.rs` (Linux-only, `#[cfg(target_os = "linux")]`)

- [x] Hello-world process: bash script writes to `$OUT` → verify output
- [x] Process with env vars → verify standard vars (`OUT`, `DEPS`, `HOME`) are set inside sandbox
- [x] Process with user env vars → verify they're set inside sandbox
- [x] Process with deps → verify `/deps/<name>/` is populated
- [x] Build failure: process exits non-zero → exit code 1, stderr captured
- [ ] Network isolation: process with no `unsafe_flags` → cannot reach network *(deferred: requires root or cap_net_admin)*
- [ ] `--keep-failed` → sandbox dir preserved on failure *(tested indirectly)*

---

## Layer 5: Packed Executables

ELF patching for relocatable binary outputs.

### 5.1 ELF RPATH patching — `src/packed.rs`

- [x] Parse ELF with manual header parsing, find `RPATH`/`RUNPATH` in dynamic section
- [x] Patch to `$ORIGIN/../resources/lib/` (or set it if absent)
- [x] Build packed output structure: `bin/<binary>` + `resources/lib/*.so`

### 5.2 Build integration

- [x] `build_file` with `has_resources = 0x01` → build resources recipe, pack output
- [x] All recipe outputs now staged to disk automatically (via `stage_artifact`)
- [x] `materialize_artifact` works for pure recipes (File, Directory, Symlink)

### 5.3 Tests — `tests/packed_executables.rs`

- [x] Find RPATH in ELF binary with DT_RUNPATH
- [x] Find RPATH in ELF binary with DT_RPATH
- [x] Find RPATH returns Absent for binary without RPATH
- [x] Patch a RUNPATH ELF binary → verify patched to `$ORIGIN/../resources/lib/`
- [x] Patch an RPATH ELF binary → verify patched to `$ORIGIN/../resources/lib/`
- [x] Binary without RPATH → patch returns false
- [x] Non-ELF input → error
- [x] Patched RPATH is null-terminated with zero-padded remainder
- [x] Pack a full File recipe with resources → output directory structure correct
- [x] File recipe without resources → simple file output (not packed)
- [x] Packed output is deterministic: same recipe in different stores → same hash
- [x] Relocated packed binary retains relative RPATH

---

## Layer 6: CLI

User-facing command-line interface.

### 6.1 `src/main.rs` — argument parsing with clap

- [x] `hod build <recipe-file>` command
  - [x] `--store <path>` flag
  - [x] `--force` flag
  - [x] `--keep-failed` flag
  - [x] `--quiet` flag
  - [x] `--verbose` flag
- [x] `hod ls-output <hash>` command
  - [x] `--store <path>` flag
  - [x] `--long` flag (file sizes, permissions)
  - [x] `--recursive` flag
- [x] Exit codes per PRD §8.2 (0, 1, 2, 3, 4, 5, 10)

### 6.2 `hod build` integration

- [x] Read `.hod` file from disk → pass to builder
- [x] Print output hash to stdout
- [x] Stream build stderr/stdout (unless `--quiet`)

### 6.3 `hod ls-output` integration

- [x] Look up output by hash in store
- [x] Walk materialized output directory
- [x] Print file listing (default: top-level only)

### 6.4 CLI tests — `tests/cli.rs`

- [x] `hod build` on a valid `.hod` file → prints hash, exit 0
- [x] `hod build` on invalid file → exit 3
- [x] `hod build` missing dependency → exit 4
- [x] `hod ls-output` on known hash → prints listing
- [x] `hod ls-output` on unknown hash → error
- [x] `--store` flag overrides default location

---

## Layer 7: End-to-End Integration

Full-pipeline tests with hand-written `.hod` files.

### 7.1 Test fixtures — `tests/fixtures/`

- [x] Helper module `tests/fixtures/mod.rs` — programmatic fixture generation (File, Directory, Symlink, Process recipes)
- [x] `FixtureDir` helper — writes `.hod` files to disk for CLI testing
- [x] `setup_hello_world()` — standard hello-world fixture (File + Process)
- [x] `setup_directory_with_files()` — multi-file directory fixture
- [x] `setup_chain()` — linear chain of alternating recipe types
- [x] Fixture verification tests — encode/decode round-trips for written fixtures

### 7.2 End-to-end tests — `tests/e2e.rs`

- [x] Full hello-world: `hod build` on File recipe → `hod build` on Process recipe → `hod ls-output` → correct output
- [x] File recipe build + inspect: build file, verify content matches
- [x] Directory with multiple files: build, ls-output --recursive, verify all files
- [x] Symlink recipe: build, verify symlink target
- [x] Determinism: build the same recipe file twice (different store) → same output hash
- [x] Determinism: process recipe produces same output across stores
- [x] Determinism: directory structure produces same output across stores
- [x] Performance: cache hit < 5ms on a simple recipe (in-process, 100 iterations)
- [x] Performance: cache hit < 100ms via CLI (includes process spawn)
- [x] Scale test: 100+ recipe DAG builds without errors (80 leaves, 20 mids, 4 tops, 1 root)
- [x] Scale test: wide DAG (50 files in single directory)
- [x] Scale test: deep chain (20 alternating recipe types)
- [x] CLI integration: build + ls-output --recursive + --long + --long --recursive
- [x] CLI integration: --force rebuild produces same hash
- [x] CLI integration: --verbose outputs diagnostic info
- [x] Edge case: empty directory output
- [x] Edge case: deeply nested directories (10 levels)
- [x] Edge case: process with env vars and dependency content verification
- [x] Edge case: multiple builds in same store (10 independent recipes, unique hashes)
- [x] Edge case: build log stored on process failure
- [x] 23 tests total, all passing

---

## Dependency additions to Cargo.toml

Current: `blake3`, `clap` (derive), `tempfile` (dev)

Still needed:

- [x] `hex` — hex encoding/decoding (used by `hash.rs`)
- [x] `rusqlite` — SQLite store backend
- [x] `nix` — Linux namespace syscalls
- [x] `unshare` — User namespace setup with uid/gid mapping (brioche fork)
- [ ] `reqwest` — HTTP client for Download recipes
- [x] `goblin` + `memchr` — ELF parsing for packed executables
