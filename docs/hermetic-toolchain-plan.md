# Hermetic Toolchain Plan

**Date:** 2026-04-29
**Status:** Approved — Ready for implementation

This document describes the plan to transition Hod from a sandbox that depends on the host OS (`/bin`, `/usr`, `/lib`, etc.) to a fully hermetic, reproducible build environment where every dependency is explicitly provided as a recipe.

Everything in this document was designed through a collaborative research session that surveyed three major build systems — Brioche, Nix, and onelf — to understand their bootstrap strategies and inform our approach.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State](#2-current-state)
3. [Target State](#3-target-state)
4. [Research Findings](#4-research-findings)
5. [Key Design Decisions](#5-key-design-decisions)
6. [Work Streams](#6-work-streams)
7. [Execution Order](#7-execution-order)
8. [Implementation Details](#8-implementation-details)

---

## 1. Executive Summary

Hod currently "cheats" by bind-mounting the host's `/bin`, `/usr`, `/lib`, `/lib64`, `/etc`, and `/sbin` into the sandbox. This means builds are not reproducible across different host distros and fail entirely on NixOS (which has no FHS-compliant filesystem layout).

The goal is to make every sandbox fully self-contained by:

1. Providing a **bootstrap seed** — a minimal set of pre-built binaries (gcc, glibc, bash, coreutils, etc.) downloaded and ingested into the store
2. Using that seed to **build a self-hosted toolchain** from source (glibc → gcc → binutils → core build tools)
3. Adopting the **AT_EXECFN bootstrap** approach (from the onelf project) for self-contained, relocatable packed executables
4. Removing all host bind-mounts once the hermetic dependency chain is complete

The work is organized into independent work streams that can proceed in parallel, with a defined execution order for the critical path.

---

## 2. Current State

### Sandbox (`src/sandbox.rs`)

The `mount_filesystem()` function in the Linux sandbox module bind-mounts these host directories read-only into every sandbox:

```rust
let host_dirs = ["/bin", "/usr", "/lib", "/lib64", "/etc", "/sbin"];
```

This means every Process recipe implicitly depends on the host's entire FHS. Builds produce different results on different distros.

### Packed Executables (`src/packed.rs`)

Currently uses ELF RPATH patching (`$ORIGIN/../resources/lib/`). This approach:
- Requires an existing RPATH/RUNPATH entry in the binary (can't add one)
- Can only patch if the new string fits in the existing slot
- Doesn't address the dynamic linker (`PT_INTERP`) — outputs still need the host's `ld-linux.so`
- Outputs are partially relocatable but not fully self-contained

### Recipe Format (`src/recipe.rs`)

Five recipe types: File (0x01), Directory (0x02), Symlink (0x03), Download (0x04), Process (0x05). Recipes are binary-only with no human-readable representation. The example recipe generator (`examples/src/main.rs`) programmatically builds recipes using Rust code.

### CLI (`src/main.rs`)

Two subcommands: `hod build` and `hod ls-output`. No encode/decode for human-readable recipe inspection.

---

## 3. Target State

### Fully Hermetic Sandbox

The sandbox contains **only** what's explicitly provided by the recipe's dependencies:

```
/                   (tmpfs root)
├── deps/
│   ├── bash/       → materialized output of bash recipe
│   ├── gcc/        → materialized output of gcc recipe
│   ├── coreutils/  → materialized output of coreutils recipe
│   └── ...         → one directory per named dependency
├── tmp/            → writable tmpfs
├── dev/            → bind-mounted from host (null, zero, urandom)
├── proc/           → bind-mounted from host
├── out             → writable dir, process writes output here
└── homeless-shelter/
    └── .           → writable $HOME
```

No host bind-mounts for `/bin`, `/usr`, `/lib`, `/lib64`, `/etc`, `/sbin`.

### Self-Contained Packed Executables

Every built binary has a tiny (~500 byte) AT_EXECFN bootstrap injected into its ELF headers. When executed, the bootstrap:

1. Reads `AT_EXECFN` from the kernel's aux vector (the actual path of the binary)
2. Computes the relative path to the bundled dynamic linker (e.g., `../lib/ld-linux-x86-64.so.2`)
3. Loads the linker into memory and jumps to it
4. `/proc/self/exe` points to the real binary (not a wrapper)

Output structure:
```
<output>/
├── bin/
│   └── my-binary      (ELF with AT_EXECFN bootstrap injected)
└── lib/
    ├── ld-linux-x86-64.so.2
    ├── libc.so.6
    └── ...
```

### Human-Readable Recipes

`hod encode` and `hod decode` allow roundtripping between binary `.hod` files and JSON. Recipe authors write JSON, encode to binary, build with `hod build`.

### Auto-PATH from Dependencies

The builder automatically constructs `$PATH`, `$LIBRARY_PATH`, and `$C_INCLUDE_PATH` by scanning dependency outputs. Recipe authors don't need to manually specify these common paths.

---

## 4. Research Findings

### Brioche's Bootstrap (3 stages)

**Stage 0 — Seed:**
- Downloads a pre-built musl cross-compiler (from tangramdotdev/bootstrap)
- Downloads BusyBox (statically linked)
- Downloads a Debian rootfs (minimal Debian with GCC 12)
- Downloads brioche-runtime-utils (`brioche-ld`, `brioche-packed-exec`)

**Stage 1 — Cross-compiled LFS toolchain (inside Debian rootfs chroot):**
Using the stage0 seed inside a BusyBox `pivot_root` chroot, cross-compiles:
1. binutils → assembler, linker
2. GCC → C/C++ compiler
3. Linux headers → kernel headers
4. glibc → C library
5. libstdc++ → C++ standard library

**Stage 2 — Self-hosted native toolchain:**
Using stage1 as a native toolchain, rebuilds everything + utilities (bash, coreutils, make, tar, etc.) as native binaries.

**Stage 3 (native/) — Full toolchain:**
Each package built independently, then autopacked with `brioche-packer` which rewrites ELF binaries to use `brioche-ld` (userland exec wrapper), patches RPATHs, fixes shebangs.

**Key insight:** Brioche uses `brioche-ld` — a wrapper binary that uses userland-exec to load the real binary without calling `execve()`, so `/proc/self/exe` stays pointing at the wrapper (which is at the "expected" path like `bin/curl`). The brioche author has expressed interest in adopting the onelf AT_EXECFN approach instead.

### Nix's Bootstrap (6 stages)

**Seed:** A 21MB tarball called `bootstrap-tools` containing:
- BusyBox (statically linked against musl)
- glibc (dynamic linker + libc + headers)
- GCC 8/10 (dynamically linked against that glibc)
- binutils, coreutils, tar, bash, findutils, diffutils, sed, grep, awk, gzip, bzip2, patch, patchelf
- Libraries: gmp, mpfr, mpc, zlib, isl, libelf

**Key technique:** Binaries are deliberately broken (hardcode fake `/nix/store/eeee...` paths), then fixed at unpack time by invoking the dynamic linker directly (`/lib/ld-linux-x86-64.so.2 --library-path /lib`) and running `patchelf` to fix the interpreter.

**6-stage tower:** stage0 (raw bootstrap-tools) → stage1 (binutils+perl) → stage2 (glibc rebuild) → stage3 (gmp/mpfr) → stage4 (gcc rebuild) → final (everything rebuilt from nixpkgs source)

**Key insight:** Nix uses glibc (not musl) for its seed and final output. Only the BusyBox is musl-static. The glibc choice is deliberate — musl isn't a drop-in replacement for glibc (DNS resolution differences, etc.).

**Nix also has a `minimal-bootstrap` path** that starts from TinyCC + musl (much smaller seed, but i686/x86_64 only).

**Nix derivation env vars:** Nix derivations are just env vars passed to a bash script. `stdenv.setup.sh`:
- Builds `$PATH` by concatenating `<dep>/bin` for each dependency
- Uses wrapper scripts around gcc/ld that inject `-B`, `-L`, `-isystem`, `-Wl,-dynamic-linker` flags
- Dependencies can be `buildInputs`, `nativeBuildInputs`, `propagatedBuildInputs`
- For env var conflicts: path-like vars get concatenated with `:`, scalar vars use last-write-wins

### onelf's AT_EXECFN Bootstrap

**This is the approach we're adopting.** Instead of wrapping the binary (brioche) or patching RPATH (Nix), it modifies the ELF binary itself:

1. The original `PT_INTERP` program header is rewritten to `PT_LOAD` containing a bootstrap stub
2. The ELF `e_entry` is rewritten to point at this new segment
3. At runtime, the kernel loads the binary and jumps to the bootstrap code
4. The bootstrap reads `AT_EXECFN` from the kernel's aux vector (the actual path of the executable)
5. Computes the directory of the binary: `dirname(AT_EXECFN)`
6. Appends the relative interpreter path to find the bundled dynamic linker
7. Opens and mmaps `ld-linux.so` into memory
8. Patches the aux vector to add `PT_INTERP` for the linker
9. Jumps to the interpreter's entry point

**Why this is superior:**
- `/proc/self/exe` is correct — the kernel did a real `execve()`
- No wrapper binary — the bootstrap is embedded inside the binary (~500 bytes)
- No external runtime component — pure syscalls
- Fully relocatable — uses `AT_EXECFN` to compute relative paths
- CWD-independent — works regardless of where you run from
- Small and auditable — ~300 lines of straightforward C code
- Supports x86_64 and aarch64

The bootstrap code lives in:
- `crates/onelf/src/payload/bootstrap_x86_64.c` — the main bootstrap logic (~300 lines C)
- `crates/onelf/src/payload/trampoline_x86_64.S` — entry point that sets up args for the C code (~30 lines asm)
- `crates/onelf/src/payload/bootstrap_aarch64.c` — aarch64 equivalent
- `crates/onelf/src/payload/trampoline_aarch64.S` — aarch64 trampoline

The injection logic is in `crates/onelf/src/bundle.rs` function `inject_relative_interp()`.

onelf is MIT licensed.

---

## 5. Key Design Decisions

### Decision 1: glibc for the seed and all outputs

We use glibc (not musl) for everything. musl isn't a drop-in replacement for glibc — it has DNS resolution differences, missing GNU extensions, etc. Only the BusyBox in the seed is musl-static (because it needs zero external deps to work).

### Decision 2: AT_EXECFN bootstrap for packed executables

We adopt onelf's approach over brioche's userland-exec wrapper. Rationale:
- Correct `/proc/self/exe` without needing a separate wrapper binary
- ~500 bytes embedded in each binary vs. a separate runtime component
- No external dependency on `userland-execve` crate
- The brioche author has expressed interest in adopting this same approach

### Decision 3: Full paths for commands, auto-PATH from deps

The `command` field in Process recipes uses full paths like `/deps/gcc/bin/gcc`. This is explicit and deterministic — the recipe hash reflects exactly which dep provides the command. Nix derivations do the same (`builder = "/nix/store/.../bin/bash"`).

However, the builder auto-populates `$PATH` (and `$LIBRARY_PATH`, `$C_INCLUDE_PATH`) from all deps' output directories. Build scripts inside the sandbox can use bare command names and they'll resolve correctly.

### Decision 4: Host seed tarball locally in the repo

The bootstrap seed tarball lives at `seed/bootstrap-tools-x86_64-linux.tar.zst` in the repo initially. Eventually it will be hosted on S3 or GitHub releases. The seed is identified by its BLAKE3 hash and is treated as immutable until we explicitly update it.

### Decision 5: Gradual hermeticity via `--strict` flag

Rather than removing host bind-mounts in one shot, we add a `--strict` flag to `hod build` that removes them. The default remains the current (host-mounting) behavior. Once the hermetic toolchain is working, we flip the default.

---

## 6. Work Streams

### Work Stream 1: `hod encode` / `hod decode`

**Status:** DO FIRST — makes all subsequent work dramatically easier

**Stage 1.1: Add dependencies**

Add to `Cargo.toml`:
```toml
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

**Stage 1.2: Create JSON serialization types**

Create `src/recipe_json.rs` (or add serde derives to the existing recipe types). The JSON representation maps 1:1 to the binary recipe types.

Example JSON for a Process recipe:
```json
{
  "type": "process",
  "platform": "x86_64-linux",
  "command": "/deps/bash/bin/bash",
  "args": ["-c", "echo hello > $OUT/hello.txt"],
  "env": [],
  "dependencies": [
    {"name": "bash", "recipe_hash": "a1b2c3d4e5f6..."}
  ],
  "workdir_hash": null,
  "output_scaffold_hash": null,
  "unsafe_flags": 0
}
```

Example JSON for a Download recipe:
```json
{
  "type": "download",
  "url": "https://example.com/foo.tar.gz",
  "hash_algorithm": "blake3",
  "expected_hash": "a1b2c3d4e5f6..."
}
```

Hash values are hex-encoded strings (64 chars) in JSON.

**Implementation approach:**

Option A (preferred): Add `#[derive(Serialize, Deserialize)]` to the existing recipe types in `src/recipe.rs`. Use serde field aliases and custom serializers for:
- `Hash` type → hex string in JSON (use `serde(crate = "...")` if needed)
- `RecipeType` → string name ("file", "directory", "symlink", "download", "process")
- `Recipe` enum → use serde's internally tagged representation with `"type"` field

Option B: Create separate JSON types and conversion functions between them and the binary recipe types.

Recommendation: Option A is cleaner. Use serde's `#[serde(rename_all = "snake_case")]` and custom `serialize_with`/`deserialize_with` for the `Hash` type (which is `[u8; 32]`).

**Stage 1.3: Add `hod decode` subcommand**

```
hod decode <file.hod>
```

Reads a binary `.hod` file, decodes it, prints JSON to stdout. Errors on malformed files.

**Stage 1.4: Add `hod encode` subcommand**

```
hod encode <file.json> [-o output.hod]
```

Reads a JSON file, encodes it to binary `.hod` format. Writes to `-o` path or stdout.

**Stage 1.5: Round-trip tests**

Test that:
- `hod decode file.hod` produces valid JSON
- `hod encode` on that JSON produces identical bytes
- Manual JSON files encode correctly and can be decoded back

Also test error cases: invalid JSON, missing required fields, bad hash hex strings.

**Files to modify:**
- `Cargo.toml` — add serde, serde_json
- `src/recipe.rs` — add serde derives and custom serializers
- `src/hash.rs` — add hex serialization for `Hash`
- `src/main.rs` — add `Decode` and `Encode` subcommands
- `src/lib.rs` — no changes needed (recipe types already exported)
- `tests/` — add round-trip tests

---

### Work Stream 2: Sandbox Improvements

**Stage 2.1: Auto-populate environment variables from deps**

In `src/build.rs`, function `build_process()`, after materializing deps:

**Auto-PATH:** Scan each dep's output for a `bin/` subdirectory. For each found, add `/deps/<name>/bin` to `$PATH`. Construct the PATH string in dep-name sorted order for determinism.

**Auto-LIBRARY_PATH:** Scan each dep's output for a `lib/` subdirectory. For each found, add `/deps/<name>/lib` to `$LIBRARY_PATH`.

**Auto-C_INCLUDE_PATH:** Scan each dep's output for an `include/` subdirectory. For each found, add `/deps/<name>/include` to `$C_INCLUDE_PATH`.

**Precedence rules:**
- The auto-generated vars are set FIRST
- The recipe's explicit `env` vars are set AFTER and override/append
- Standard builder vars (`OUT`, `DEPS`, `TMPDIR`, `HOME`, `HOD_STORE`) are set after everything (they always win)

**Note:** Do NOT inherit `PATH` from the host environment. Remove this from the current code:
```rust
// Remove this block:
for key in &["PATH", "TERM", "LANG", "LC_ALL", "TZ"] {
    if let Ok(val) = std::env::var(key) {
        env.entry(key.to_string()).or_insert(val);
    }
}
```
Replace with only inheriting `TERM` (harmless) and `TZ`/`LANG`/`LC_ALL` (locale settings that don't affect reproducibility). `PATH` should ONLY come from deps + recipe.

**Stage 2.2: Add `--strict` flag to `hod build`**

Add a `--strict` boolean flag to the `Build` CLI subcommand and `BuildOptions` struct.

When `--strict` is set:
- In `sandbox.rs`, skip the host bind-mounts block entirely:
  ```rust
  // Skip these in strict mode:
  let host_dirs = ["/bin", "/usr", "/lib", "/lib64", "/etc", "/sbin"];
  ```
- The sandbox only contains: `/deps/`, `/tmp/`, `/dev/`, `/proc/`, `/out/`, `/homeless-shelter/`
- `/dev/` and `/proc/` are still bind-mounted from the host (these are kernel interfaces, not OS-dependent)

When `--strict` is NOT set (default): current behavior unchanged.

**Stage 2.3: Flip the default (later)**

Once the hermetic toolchain works, `--strict` becomes the default and `--relaxed` enables host mounts.

**Files to modify:**
- `src/build.rs` — auto-PATH construction, remove host PATH inheritance
- `src/main.rs` — add `--strict` flag
- `src/sandbox.rs` — conditional host bind-mounts

---

### Work Stream 3: Bootstrap Seed

**Stage 3.1: Build the seed tarball on nixOS**

Use the nixOS machine at `ssh crussell@192.168.20.26` to build the bootstrap-tools tarball:

```bash
# On the nixOS machine:
cd ~/Code/nixpkgs  # or wherever nixpkgs is checked out
nix build -f ./pkgs/stdenv/linux/make-bootstrap-tools.nix bootstrapFiles
```

Then extract the tarball and re-pack it into a flat structure suitable for hod:

```
seed/
├── bin/
│   ├── bash
│   ├── sh -> bash
│   ├── busybox
│   ├── gcc
│   ├── g++
│   ├── cc -> gcc
│   ├── c++ -> g++
│   ├── ld (the linker)
│   ├── as (the assembler)
│   ├── nm
│   ├── ar
│   ├── ranlib
│   ├── strip
│   ├── objcopy
│   ├── objdump
│   ├── readelf
│   ├── make
│   ├── coreutils (cp, mv, ls, mkdir, install, etc. via symlinks or busybox)
│   ├── tar
│   ├── gzip
│   ├── xz
│   ├── sed
│   ├── grep
│   ├── gawk
│   ├── patch
│   ├── patchelf
│   ├── find
│   ├── diff
│   └── ...
├── lib/
│   ├── ld-linux-x86-64.so.2
│   ├── libc.so.6
│   ├── libc.so (linker script)
│   ├── libm.so.6
│   ├── libdl.so.2
│   ├── libpthread.so.0
│   ├── librt.so.1
│   ├── libcrypt.so.1
│   ├── libgcc_s.so.1
│   ├── crt1.o
│   ├── crti.o
│   ├── crtn.o
│   ├── Scrt1.o
│   ├── rcrt1.o
│   └── ...
├── libexec/
│   └── gcc/
│       └── x86_64-unknown-linux-gnu/
│           └── <version>/
│               ├── cc1
│               ├── cc1plus
│               ├── collect2
│               ├── lto-wrapper
│               └── lto1
├── include/
│   ├── (glibc headers)
│   └── (linux kernel headers)
└── lib/gcc/x86_64-unknown-linux-gnu/<version>/
    ├── (gcc internal headers, libgcc.a, libstdc++.a, etc.)
```

The exact contents will be determined by what nixpkgs produces. The goal is a self-contained directory that can compile a C program without any external dependencies.

**IMPORTANT: Binary patching for relocatability**

The binaries in the seed need to work when placed at an arbitrary path (inside `/deps/seed/`). The nixpkgs bootstrap-tools have hardcoded `/nix/store/...` paths in their `PT_INTERP` and RPATH. We need to:

1. First, use the onelf AT_EXECFN bootstrap injection (from Work Stream 4) to make each binary self-locating
2. OR (simpler initial approach): use `patchelf` to set relative interpreter and RPATH:
   ```bash
   patchelf --set-interpreter ../lib/ld-linux-x86-64.so.2 bin/gcc
   patchelf --set-rpath '$ORIGIN/../lib' bin/gcc
   ```

The patchelf approach works for the seed because the seed binaries are always at `<seed>/bin/` with the linker at `<seed>/lib/`. The AT_EXECFN approach will be used for the final packed outputs.

**Stage 3.2: Add `hod seed` subcommand**

```
hod seed [--path <seed-tarball-path>] [--platform x86_64-linux]
```

Behavior:
1. Read the seed tarball (from local path or eventually a URL)
2. Verify its BLAKE3 hash against a hardcoded expected hash
3. Extract each file as a blob into the store
4. Create File recipes for each binary/library/header (with correct executable bits)
5. Create Directory recipes composing them into the seed toolchain
6. Print the root seed recipe hash

The seed hash should be hardcoded in the binary (or in a config file) so that `hod seed` can verify integrity.

**Stage 3.3: Use seed recipes as hermetic deps**

Once ingested, Process recipes can depend on the seed toolchain and run in `--strict` mode without any host dependencies.

Example: A hermetic hello-world using the seed:
```json
{
  "type": "process",
  "platform": "x86_64-linux",
  "command": "/deps/seed/bin/bash",
  "args": ["-c", "echo 'Hello from hermetic Hod!' > $OUT/hello.txt"],
  "env": [],
  "dependencies": [
    {"name": "seed", "recipe_hash": "<seed_directory_recipe_hash>"}
  ],
  "workdir_hash": null,
  "output_scaffold_hash": null,
  "unsafe_flags": 0
}
```

**Files to modify:**
- `seed/` — new directory containing the seed tarball
- `src/main.rs` — add `Seed` subcommand
- `src/seed.rs` — new module for seed ingestion logic

---

### Work Stream 4: AT_EXECFN Bootstrap (Packed Executables v2)

**Stage 4.1: Port the bootstrap stub code from onelf**

The onelf project (https://github.com/QaidVoid/onelf) is MIT licensed. We adapt its bootstrap code.

Create these files:
- `src/packed/bootstrap_x86_64.c` — adapted from `onelf/crates/onelf/src/payload/bootstrap_x86_64.c`
- `src/packed/trampoline_x86_64.S` — adapted from `onelf/crates/onelf/src/payload/trampoline_x86_64.S`
- `src/packed/payload.ld` — linker script adapted from onelf

The bootstrap code does the following at runtime:
1. Receives `(stack_pointer, metadata_pointer)` from the trampoline
2. Reads `AT_EXECFN` from the kernel's aux vector on the stack
3. Computes `dirname(AT_EXECFN)` to find the binary's directory
4. Appends the relative interpreter path from metadata (e.g., `../lib/ld-linux-x86-64.so.2`)
5. Opens and mmaps the real dynamic linker
6. Patches program headers to add `PT_INTERP`
7. Patches aux vector entries (`AT_BASE`, `AT_PHDR`, `AT_PHNUM`, `AT_ENTRY`)
8. Returns the interpreter's entry address to the trampoline
9. Trampoline jumps to the interpreter

The bootstrap uses only raw Linux syscalls (no libc). It's ~300 lines of C.

Build process: Compile with musl-gcc (or cross-compile) to produce raw binary blobs, then embed via `include_bytes!()` in the Rust code. Add a `Makefile` or build script in `src/packed/`.

**Stage 4.2: Implement `inject_bootstrap()` in Rust**

Port the `inject_relative_interp()` function from `onelf/crates/onelf/src/bundle.rs` into `src/packed.rs`.

The function:
1. Parses the ELF binary using `goblin`
2. Checks it's 64-bit little-endian, x86_64 or aarch64
3. Finds the `PT_INTERP` program header index
4. Computes the highest virtual address from all `PT_LOAD` segments
5. Page-aligns to get a new virtual address
6. Builds the blob: `[trampoline code][bootstrap code][padding to 8-byte align][metadata]`
   - Metadata: `{ entry_delta: i64, rel_path_len: u16, rel_path: [u8] }`
7. Patches the trampoline's metadata-pointer instruction (architecture-specific LEA/ADR patching)
8. Appends the blob to the end of the file (page-aligned)
9. Overwrites the `PT_INTERP` program header to become `PT_LOAD` (type=1, flags=PF_R|PF_X)
10. Rewrites `e_entry` to point at the new segment

Returns `Ok(true)` if injected, `Ok(false)` if no PT_INTERP (static binary), or an error.

**Stage 4.3: Update `build_packed_output()`**

Replace the current RPATH-patching approach in `src/packed.rs`:

Old flow:
- Patch RPATH to `$ORIGIN/../resources/lib/`

New flow:
1. Call `inject_bootstrap()` on the binary, with the relative path to the dynamic linker (e.g., `../lib/ld-linux-x86-64.so.2`)
2. Also patch RUNPATH to `$ORIGIN/../lib/` for good measure (helps the linker find other shared libs)
3. Change the output structure from `bin/ + resources/lib/` to `bin/ + lib/`

Updated output structure:
```
<output>/
├── bin/
│   └── <binary>      (ELF with AT_EXECFN bootstrap + relative RUNPATH)
└── lib/
    ├── ld-linux-x86-64.so.2
    ├── libc.so.6
    └── ...
```

**Stage 4.4: aarch64 support (later)**

Port the aarch64 bootstrap (`bootstrap_aarch64.c`, `trampoline_aarch64.S`) when needed. The injection logic is the same; only the bootstrap code and trampoline differ.

**Files to modify:**
- `src/packed.rs` — major rewrite of packing logic, add `inject_bootstrap()`
- `src/packed/` — new directory with bootstrap C/asm source
- `src/packed/Makefile` — build the bootstrap blobs
- `Cargo.toml` — may need `cc` build dependency for compiling the bootstrap

---

### Work Stream 5: Hermetic Dependency Chain

This is the ordered list of packages to build from the seed. Each step uses only packages from previous steps (plus the seed). Recipes are authored in JSON, encoded with `hod encode`, and built with `hod build --strict`.

**Phase A: Core C toolchain (self-hosted glibc + gcc)**

| # | Package | Source | Dependencies | Notes |
|---|---------|--------|-------------|-------|
| 1 | linux-headers | Download from kernel.org | seed | Kernel API headers needed by glibc. Version: Linux 6.x LTS. |
| 2 | glibc | Download from sourceware.org | linux-headers, seed (gcc, binutils, bash, coreutils, make, sed, grep) | The C library. Configure with `--prefix=/`, build in a separate directory. The hardest package to build correctly. |
| 3 | gmp | Download from gmplib.org | glibc, seed (gcc) | GNU Multi-Precision library. Needed by gcc. |
| 4 | mpfr | Download from mpfr.org | glibc, gmp | Multi-Precision Floating-point Reliable. Needed by gcc. |
| 5 | mpc | Download from multiprecision.org | glibc, gmp, mpfr | Multi-Precision Complex. Needed by gcc. |
| 6 | binutils | Download from sourceware.org | glibc, seed (gcc) | Rebuilt against our glibc. Provides ld, as, nm, ar, ranlib, strip, objcopy. |
| 7 | gcc | Download from gcc.gnu.org | glibc, binutils (from step 6), gmp, mpfr, mpc | The compiler rebuilt against our glibc. The most complex build. Requires building in stages (stage1 cross, stage2 native). |

After Phase A: we have a self-hosted C toolchain. The seed's compiler is no longer needed.

**Phase B: Build essentials (minimal set to compile anything)**

| # | Package | Source | Dependencies | Notes |
|---|---------|--------|-------------|-------|
| 8 | ncurses | Download from invisible-island.net | glibc | Terminal library. Needed by bash and readline. |
| 9 | readline | Download from invisible-island.net | glibc, ncurses | Line editing. Needed by bash. |
| 10 | bash | Download from gnu.org | glibc, readline, ncurses | The shell. Also creates `sh` symlink. |
| 11 | coreutils | Download from gnu.org | glibc | cp, mv, ls, mkdir, install, cat, etc. |
| 12 | make | Download from gnu.org | glibc | GNU Make. |
| 13 | sed | Download from gnu.org | glibc | Stream editor. |
| 14 | grep | Download from gnu.org | glibc | Text search. |
| 15 | gawk | Download from gnu.org | glibc | AWK implementation. |
| 16 | patch | Download from gnu.org | glibc | Apply patches. |
| 17 | tar | Download from gnu.org | glibc | Archive tool. |
| 18 | gzip | Download from gnu.org | glibc | Compression. |
| 19 | xz | Download from tukaani.org | glibc | Compression. |
| 20 | diffutils | Download from gnu.org | glibc | diff command. |
| 21 | findutils | Download from gnu.org | glibc | find, xargs. |
| 22 | patchelf | Download from github.com/NixOS/patchelf | glibc | ELF patching tool. |

After Phase B: we have a complete hermetic build environment. Every tool needed to compile software from source, with zero host dependencies.

**Phase C: Extended toolchain (for more complex builds)**

| # | Package | Source | Dependencies | Notes |
|---|---------|--------|-------------|-------|
| 23 | zlib | Download from zlib.net | glibc | Compression library. |
| 24 | openssl | Download from openssl.org | glibc, perl | TLS/crypto. |
| 25 | curl | Download from curl.se | glibc, openssl, zlib | HTTP client (for Download recipes). |
| 26 | perl | Download from perl.org | glibc, db, gdbm | Scripting language. Needed by autoconf. |
| 27 | autoconf | Download from gnu.org | perl, m4 | Generate configure scripts. |
| 28 | automake | Download from gnu.org | perl, autoconf | Generate Makefiles. |
| 29 | libtool | Download from gnu.org | glibc, perl, automake | Shared library management. |
| 30 | pkgconf | Download from github.com/pkgconf/pkgconf | glibc | .pc file resolution. |
| 31 | bison | Download from gnu.org | glibc, perl | Parser generator. |
| 32 | flex | Download from github.com/westes/flex | glibc | Lexer generator. |
| 33 | m4 | Download from gnu.org | glibc | Macro processor. |

**Recipe authoring pattern:**

Each package requires 2-3 recipes:
1. A `Download` recipe for the source tarball (with BLAKE3 hash)
2. Optionally, `File` recipes for patch files
3. A `Process` recipe that:
   - Depends on the seed (or previously-built packages from the chain)
   - Extracts the source: `tar xf /deps/source/...`
   - Configures: `./configure --prefix=/`
   - Builds: `make`
   - Installs: `make DESTDIR=$OUT install`

Example JSON for building glibc:
```json
{
  "type": "process",
  "platform": "x86_64-linux",
  "command": "/deps/seed/bin/bash",
  "args": ["-c", "set -euo pipefail\ntar xf /deps/glibc-source/glibc-2.38.tar.xz\ncd glibc-2.38\nmkdir build && cd build\n../configure --prefix=/ --enable-kernel=4.14 --with-headers=/deps/linux-headers/include\nmake\nmake DESTDIR=$OUT install"],
  "env": [
    {"key": "M4", "value": "m4"}
  ],
  "dependencies": [
    {"name": "seed", "recipe_hash": "<seed_hash>"},
    {"name": "glibc-source", "recipe_hash": "<download_hash>"},
    {"name": "linux-headers", "recipe_hash": "<linux_headers_hash>"}
  ],
  "workdir_hash": null,
  "output_scaffold_hash": null,
  "unsafe_flags": 0
}
```

---

### Work Stream 6: Recipe Format Improvements

**Stage 6.1: Command resolution — full paths (no changes needed)**

The current `command` field already accepts any string. Recipe authors use `/deps/<name>/bin/<tool>`. No code changes needed — this is a convention, not a format change.

**Stage 6.2: Dep env contributions (future, not blocking)**

Add a convention where a dep can contribute env vars. If a dep has a file at `<dep>/hod-env.d/<VAR_NAME>`, the builder reads it and sets the env var:
- Path-like vars (`PATH`, `LIBRARY_PATH`, `PKG_CONFIG_PATH`) get concatenated with `:`
- Scalar vars get set as fallback (don't override if already set by the recipe)

This mirrors brioche's `brioche-env.d` convention. No recipe format changes needed — it's a builder convention that scans the dep's output at build time.

---

## 7. Execution Order

The critical path through the work streams:

```
1. Work Stream 1 (encode/decode)          ← DO FIRST
   ├── Stage 1.1: Add deps
   ├── Stage 1.2: JSON types
   ├── Stage 1.3: hod decode
   ├── Stage 1.4: hod encode
   └── Stage 1.5: Tests

2. Work Stream 4 (AT_EXECFN bootstrap)    ← SECOND (needed by seed)
   ├── Stage 4.1: Port bootstrap code from onelf
   ├── Stage 4.2: Implement inject_bootstrap()
   └── Stage 4.3: Update build_packed_output()

3. Work Stream 2 (sandbox improvements)   ← THIRD
   ├── Stage 2.1: Auto-PATH from deps
   └── Stage 2.2: --strict flag

4. Work Stream 3 (bootstrap seed)          ← FOURTH
   ├── Stage 3.1: Build seed tarball on nixOS
   ├── Stage 3.2: hod seed subcommand
   └── Stage 3.3: Use seed as hermetic deps

5. Work Stream 5 (hermetic dependency chain) ← FIFTH
   ├── Phase A: Core toolchain (glibc, gcc, binutils)
   ├── Phase B: Build essentials (bash, coreutils, make, etc.)
   └── Phase C: Extended toolchain (autoconf, cmake, etc.)

6. Work Stream 6 (recipe improvements)     ← ONGOING
   └── Stage 6.2: Dep env contributions (when needed)
```

**Work Streams 1 and 4 can proceed in parallel** since they don't depend on each other. Work Stream 2 depends on nothing but should come after 1 for easier debugging. Work Stream 3 depends on 4 (for the seed binaries to be relocatable). Work Stream 5 depends on 1, 2, and 3.

---

## 8. Implementation Details

### Testing Strategy

- **Unit tests** for each new function (in the same file, `#[cfg(test)]` module)
- **Integration tests** for each work stream:
  - `tests/recipe_json_roundtrip.rs` — encode/decode roundtrip tests
  - `tests/sandbox_strict.rs` — strict mode build tests
  - `tests/packed_bootstrap.rs` — AT_EXECFN bootstrap injection tests
  - `tests/seed_ingest.rs` — seed tarball ingestion tests
- Run all tests with `cargo test -- --test-threads=1` (sandbox tests use Linux user namespaces which are rate-limited by the kernel)
- Current test suite: 163 tests in ~1.2s with `--test-threads=1`

### Existing Test Suite

Before making changes, run `cargo test -- --test-threads=1` to confirm all 163 tests pass. After changes, re-run to verify no regressions.

### Conventions

- Rust edition 2021, MSRV per Cargo.toml
- All encoding must be deterministic
- New recipe types or format changes must be specified in PRD.md first
- The binary format is the contract — no ad-hoc extensions
- Use `cargo fmt` and `cargo clippy` before committing

### onelf Source References

When implementing Work Stream 4, refer to these specific files in the onelf repo (https://github.com/QaidVoid/onelf):

- **Bootstrap code:**
  - `crates/onelf/src/payload/bootstrap_x86_64.c` — ~300 lines, the main bootstrap logic
  - `crates/onelf/src/payload/trampoline_x86_64.S` — ~30 lines, entry point
  - `crates/onelf/src/payload/bootstrap_aarch64.c` — aarch64 equivalent
  - `crates/onelf/src/payload/trampoline_aarch64.S` — aarch64 trampoline
  - `crates/onelf/src/payload/payload.ld` — linker script

- **Injection logic:**
  - `crates/onelf/src/bundle.rs` — function `inject_relative_interp()` (~100 lines)
  - This is the key commit that introduced the AT_EXECFN approach: `e9482aeb91a3b5345855bcdd58c0d19e71621e68`

- **License:** MIT — we can adapt the code directly with attribution

### brioche Source References

For reference on how the toolchain packages are built (when implementing Work Stream 5):

- **Toolchain index:** `~/Code/brioche-packages/packages/std/toolchain/index.bri`
- **Stage definitions:**
  - `~/Code/brioche-packages/packages/std/toolchain/stage0/index.bri` — seed
  - `~/Code/brioche-packages/packages/std/toolchain/stage1/index.bri` — cross-compiled LFS
  - `~/Code/brioche-packages/packages/std/toolchain/stage2/index.bri` — self-hosted
- **Individual package recipes:** `~/Code/brioche-packages/packages/std/toolchain/native/*.bri`
- **Key packages to study:**
  - `native/glibc.bri` — glibc build (configure flags, patches)
  - `native/gcc.bri` — gcc build (multi-stage)
  - `native/bash.bri` — simple package example
  - `native/coreutils.bri` — standard autotools package

### nixOS Machine Access

For building the seed tarball:
```
ssh crussell@192.168.20.26
```

nixpkgs bootstrap-tools build command:
```bash
nix build -f ./pkgs/stdenv/linux/make-bootstrap-tools.nix bootstrapFiles
```

---

## Appendix A: JSON Recipe Format Specification

### File Recipe
```json
{
  "type": "file",
  "content_blob_hash": "<64-char hex BLAKE3>",
  "executable": false,
  "resources_hash": null
}
```

### Directory Recipe
```json
{
  "type": "directory",
  "entries": [
    {"name": "bin", "entry_hash": "<64-char hex>"},
    {"name": "lib", "entry_hash": "<64-char hex>"}
  ]
}
```
Note: entries must be sorted by name (enforced by the binary format).

### Symlink Recipe
```json
{
  "type": "symlink",
  "target": "../lib/libfoo.so.1"
}
```

### Download Recipe
```json
{
  "type": "download",
  "url": "https://example.com/foo.tar.gz",
  "hash_algorithm": "blake3",
  "expected_hash": "<64-char hex BLAKE3>"
}
```

### Process Recipe
```json
{
  "type": "process",
  "platform": "x86_64-linux",
  "command": "/deps/seed/bin/bash",
  "args": ["-c", "echo hello > $OUT/hello.txt"],
  "env": [
    {"key": "CC", "value": "gcc"}
  ],
  "dependencies": [
    {"name": "seed", "recipe_hash": "<64-char hex>"}
  ],
  "workdir_hash": null,
  "output_scaffold_hash": null,
  "unsafe_flags": 0
}
```
Note: `env` must be sorted by key, `dependencies` must be sorted by name (enforced by the binary format).
