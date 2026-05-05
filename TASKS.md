# TASKS — Get Integration Tests Passing After Strict Mode Removal

## Context

Strict mode was removed in the previous agent session. The sandbox is now **always hermetic** — no host filesystem bind-mounts (`/bin`, `/usr`, `/lib`, `/lib64`, `/etc`, `/sbin`, `/nix`). All 45 unit tests pass. The 27 integration tests are marked `#[ignore]` and require a hermetic bash from the bootstrap chain to run.

The integration tests currently **cannot run** due to three distinct issues. This document describes each issue and what needs to be done.

## Issue 1: Dynamic Linker Not Available Inside Sandbox

### Problem

The gcc-stage1 binary is a musl-linked executable with `PT_INTERP=/lib/ld-musl-x86_64.so.1`. Inside the hermetic sandbox, `/lib` is an empty directory — there's no dynamic linker. When the recipe script runs `/deps/gcc-stage1/bin/x86_64-linux-gnu-gcc`, the kernel can't find the ELF interpreter and returns "not found" (this manifests as `sh: /deps/gcc-stage1/bin/x86_64-linux-gnu-gcc: not found` — confusingly, `sh` reports it, but it's really the kernel's `ENOEXEC`).

Before strict mode was removed, `/lib` was bind-mounted from the host, so `/lib/ld-musl-x86_64.so.1` was always available.

### Fix

The seed dependency already contains `ld-musl-x86_64.so.1` at `/deps/seed/lib/ld-musl-x86_64.so.1`. The sandbox setup code needs to create a symlink so the musl dynamic linker is available at the expected path:

```
/lib/ld-musl-x86_64.so.1 → /deps/seed/lib/ld-musl-x86_64.so.1
```

But there's a bootstrapping problem: we don't know which dep provides the musl linker until we inspect them. The solution in `docs/hermetic-bootstrap-tasks.md` is that **recipes should create these symlinks themselves** as part of their build script:

```bash
ln -sf /deps/seed/lib/ld-musl-x86_64.so.1 /lib/ld-musl-x86_64.so.1
```

However, for convenience (and because many recipes need it), it would be better to do this automatically in the sandbox setup code in `src/sandbox.rs`. The approach:

1. After mounting all deps, scan `/deps/*/lib/` for files named `ld-musl-*.so.1` or `ld-linux-*.so.2`
2. Create symlinks in `/lib/` and `/lib64/` pointing to them
3. This ensures dynamically-linked binaries from deps can find their interpreters

### Files to change
- `src/sandbox.rs` — in `mount_filesystem()`, after the dep mounting loop, add dynamic linker symlink creation

### Validation
- Build `recipes/cross/validate-stage1.hod` against `~/.local/share/hod` store
- The gcc binary should now be executable inside the sandbox

## Issue 2: Stale Recipe Files (Removed `unpack` Recipe Type)

### Problem

Two recipe JSON files reference a recipe type `"unpack"` which no longer exists in the codebase:

- `recipes/bootstrap/musl-toolchain.json` — type `"unpack"`
- `recipes/bootstrap/python.json` — type `"unpack"`

The `RecipeType` enum only has: `File(0x01)`, `Directory(0x02)`, `Symlink(0x03)`, `Download(0x04)`, `Process(0x05)`. There is no `Unpack(0x06)`.

The `musl-toolchain` recipe is a transitive dependency of almost everything (seed-root → musl-toolchain). Without it, the bootstrap chain cannot be rebuilt from scratch.

### Fix

The `unpack` functionality needs to be either:
1. **Re-added** as a recipe type (cleanest — it's a legitimate operation: download + extract an archive)
2. **Replaced** with a `Process` recipe that uses busybox `tar xf` to extract the archive (more work but avoids adding a recipe type)

Option 1 is likely simpler. The `Unpack` recipe type would:
- Take an `archive_hash` (reference to a blob) and a `format` (`tar_gz`, `tar_xz`, etc.)
- At build time, extract the archive from the store blob into the output directory
- No sandbox needed — it's a pure filesystem operation

### Files to change
- `src/recipe.rs` — add `Unpack` variant to `RecipeType` and `Recipe` enum, add binary encoding/decoding
- `src/build.rs` — add `build_unpack()` function
- `docs/hermetic-bootstrap-tasks.md` — note that unpack type was re-added

### Validation
- `hod encode recipes/bootstrap/musl-toolchain.json` should succeed
- `hod build recipes/bootstrap/musl-toolchain.hod --store ~/.local/share/hod` should produce the musl toolchain output

## Issue 3: Integration Tests Need Full Bootstrap Chain in a Temp Store

### Problem

The integration tests (`tests/seed_validation.rs`, `tests/sandbox_improvements.rs`, `tests/build_process.rs`) create a fresh temp store for each test and build from scratch. They call `hod build <recipe.hod>` which needs the `.hod` file and **all its transitive dependency `.hod` files** to be importable.

The test helper `hod_build()` shells out to the `hod` binary, which imports the top-level recipe but can't find transitive deps that aren't already in the store. This results in `dependency not found: recipe <hash> references <hash> which is not in the store`.

### Fix (choose one approach)

**Approach A: Use the default store** — Change the tests to use the existing `~/.local/share/hod` store instead of creating temp stores. This is simpler but means tests aren't isolated from each other or from the developer's store state.

**Approach B: Import all transitive deps** — Create a test helper that imports all `.hod` files from `recipes/` into the temp store before building. Something like:

```rust
fn import_all_recipes(store_path: &Path) {
    for hod_file in glob("recipes/**/*.hod") {
        Command::new(hod_bin())
            .args(["import-recipe", hod_file, "--store", store_path])
            .output();
    }
}
```

This ensures the temp store has all the recipe metadata needed for DAG resolution. The actual outputs will be built on-demand (or cached if the store is shared).

**Approach C: Share the store but use `--force` for isolation** — Use the default store but add `--force` to bypass cache when needed. Best of both worlds but risks polluting the developer's store.

Approach B is recommended for proper test isolation.

### Files to change
- `tests/seed_validation.rs` — add `import_all_recipes()` helper, call before builds
- `tests/sandbox_improvements.rs` — same (or share helper via a test module)
- `tests/build_process.rs` — same

### Validation
- `cargo test --test seed_validation -- --test-threads=1 --ignored` should pass (assuming Issues 1 and 2 are also fixed)

## Suggested Order

1. **Fix Issue 1** (dynamic linker symlinks) — this is the most impactful; without it, no Process recipe that uses musl-linked binaries can run
2. **Fix Issue 2** (re-add unpack recipe type) — needed to rebuild the bootstrap chain from scratch
3. **Re-encode all stale `.hod` files** — `find recipes -name '*.json' | xargs -I{} hod encode {} --output {}.hod` to regenerate all binary recipe files
4. **Fix Issue 3** (test infrastructure) — add the `import_all_recipes` helper to integration tests
5. **Run full test suite** — `cargo test -- --test-threads=1` (unit) + `cargo test -- --test-threads=1 --ignored` (integration)

## Reference: Existing Bootstrap Chain Status

The default store at `~/.local/share/hod` has cached outputs for the entire bootstrap chain. These outputs are valid — they were built with the hermetic sandbox (strict mode was already the default in practice). The cache hits prove the hermetic sandbox works:

```
seed-root          → cache hit ✓
gcc-stage1         → cache hit ✓
glibc              → cache hit ✓
validate-seed      → cache hit ✓
```

The only thing that doesn't work is **rebuilding** them from the `.hod` files, due to the three issues above.

## Key Files

| File | Purpose |
|------|---------|
| `src/sandbox.rs` | Sandbox setup, mount logic, dep bind-mounting |
| `src/recipe.rs` | Recipe types and binary encoding |
| `src/build.rs` | Build orchestrator, Process recipe builder |
| `src/main.rs` | CLI entry point |
| `tests/seed_validation.rs` | Seed integration tests (4 tests, `#[ignore]`) |
| `tests/sandbox_improvements.rs` | Sandbox env var tests (13 tests, `#[ignore]`) |
| `tests/build_process.rs` | Build process tests (10 `#[ignore]` + 19 unit) |
| `recipes/bootstrap/` | Bootstrap recipe chain (seed, musl, busybox) |
| `recipes/cross/` | Cross-compile recipes (gcc-stage1, glibc) |
| `recipes/native/` | Native packages (bash, coreutils, etc.) |
