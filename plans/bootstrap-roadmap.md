# Bootstrap Roadmap — Single Source of Truth

**Status:** Phase A ✅ Complete. Phase B ✅ Complete. Phase C next.
**Session log:** See [Session Summaries](#session-summaries) at bottom of this file.
**Purpose:** This document supersedes `plans/build-musl-from-source.md`, `plans/gcc-stage2-bootstrap-plan.md`, `plans/migrate-to-hod-seed-root.md`, `plans/native-busybox-and-shellbuild-plan.md`, and `plans/bootstrap-executor-options.md`. Those files are kept for historical reference but should not be treated as active plans.

---

## Overview

Hod's bootstrap pipeline takes opaque pre-built binaries (a musl.cc toolchain + an unknown busybox) and, through a series of staged builds, produces a fully self-hosting native GCC toolchain where every artifact traces back to source code. The only opaque inputs are the irreducible bootstrap seed.

The pipeline follows the same staged pattern as Nixpkgs's 5-stage stdenv tower, StageX's stage 0–3 compiler bootstrapping, and Guix's full-source bootstrap chain — but pragmatically accepts a small set of hash-verified seed binaries rather than bootstrapping from hex0.

The pipeline has three major phases, plus medium-term and long-term goals:

| Phase | What | Status |
|-------|------|--------|
| **A: Hod-built musl toolchain** | Build musl + binutils + gcc from source, assemble into `hod-seed-root` | ✅ Complete |
| **B: Migrate downstream to hod-seed-root** | Switch all non-ladder recipes from musl.cc to Hod-built toolchain | ✅ Complete |
| **C: Busybox from source + round-trip verification** | Replace opaque busybox, prove toolchain correctness | 🔲 Next |
| **D: Seed minimization** | Reduce seed to a single static GCC binary, document seed manifest | 🔲 Future |
| **E: nixpkgs-parity** | Modern GCC, broad package coverage, stdenv-like phases | 🔲 Future |

---

## Pipeline Architecture

```
IRREDUCIBLE SEED (opaque)
  busybox (unknown origin) + musl.cc toolchain (downloaded)
       │
       ▼
  seed-root.ts          ← used only by bootstrap ladder
       │
       ├─► shims (make, sed, patch, gawk, m4, bison) ──┐
       ├─► cross/gmp, mpfr, mpc ────────────────────────┤
       │                                                │
       │                    bootstrap ladder             │
       ├─► bootstrap/musl-build ────────────────────────┤
       ├─► bootstrap/binutils-musl ─────────────────────┤
       └─► bootstrap/gcc-musl ──────────────────────────┤
                    │                                   │
                    ▼                                   │
          hod-musl-toolchain                            │
          (assembles gcc + binutils + musl)             │
                    │                                   │
                    ▼                                   │
          hod-seed-root.ts  ← used by everything else ──┘
                    │        (breaks the cycle)
                    ▼
          cross/gcc-stage1 (musl→glibc cross-compiler)
                    │
                    ▼
          native tools (bash, coreutils, make, binutils, ...)
          stage2/gmp, mpfr, mpc
                    │
                    ▼
          stage2/gcc-stage2 (native glibc compiler, C+C++)
                    │
                    ▼
          toolchain/native-toolchain (bundles everything)
                    │
                    ▼
          downstream packages (ncurses, cbonsai, ...)
          use shellBuild(), no seed reference
```

---

## Phase A: Hod-built musl toolchain — COMPLETE ✅

All done. These recipes exist and are validated:

| Recipe | What it builds |
|--------|---------------|
| `bootstrap/musl-build.ts` | musl 1.2.5 from source |
| `bootstrap/binutils-musl.ts` | binutils 2.37 targeting musl |
| `bootstrap/gcc-musl.ts` | gcc 14.2.0 targeting musl (C+C++) |
| `bootstrap/hod-musl-toolchain.ts` | Assembles above into `x86_64-linux-musl-native/` layout |
| `bootstrap/hod-seed-root.ts` | busybox + Hod-built toolchain = auditable seed root |
| `bootstrap/validate-hod-seed-root.ts` | 10 tests pass (C/C++, dynamic/static) |

The gcc-musl recipe was updated during Phase B with three fixes:
1. `--disable-gnu-indirect-function` — matches musl-cross-make
2. `ld.bfd` and `ld.gold` symlinks in binutils-musl — matches musl.cc layout
3. GCC version upgraded from 11.2.0 → 14.2.0 — glibc 2.41 requires GCC ≥ 11.5

---

## Phase B: Migrate downstream to hod-seed-root — COMPLETE ✅

**Goal:** Switch all non-ladder recipes from `seedRootRecipe` (musl.cc) to `hodSeedRootRecipe` (Hod-built).

### Validation results (all passed)

| Step | What | Result |
|------|------|--------|
| 1 | Build glibc 2.41 | ✅ ~70s |
| 2 | Build gcc-stage1 (cross-compiler) | ✅ ~168s |
| 3 | cross/validate-stage1 | ✅ 161ms |
| 3 | cross/validate-complex | ✅ 173ms |
| 4 | Build 11 native tools (bash, coreutils, make, binutils, etc.) | ✅ ~2min total |
| 5 | native/validate-bash | ✅ 109ms |
| 5 | native/validate-selfhost | ✅ 142ms |
| 6 | Build stage2/gmp, mpfr, mpc | ✅ cached (built by gcc-stage2) |
| 6 | Build stage2/gcc-stage2 (native compiler) | ✅ ~177s |
| 7 | stage2/validate-gcc-stage2-c | ✅ C-only validation passed |
| 7 | stage2/validate-gcc-stage2 | ✅ C+C++ validation passed |
| 8 | Build toolchain/native-toolchain | ✅ ~1.5s |
| 9 | Build ncurses | ✅ ~21s |
| 9 | Build cbonsai | ✅ 881ms |

### Fixes applied during Phase B

1. **GCC 11.2.0 → 14.2.0** — glibc 2.41 requires GCC ≥ 11.5
2. **`CXX=no-such-compiler` in glibc** — prevents musl-built libstdc++ conflicting with glibc's hidden `atexit` symbol
3. **`--disable-gnu-indirect-function`** on gcc-musl — matches musl-cross-make
4. **`ld.bfd` and `ld.gold` symlinks** in binutils-musl — matches musl.cc layout
5. **`--disable-shared` in native binutils** — prevents `crtbeginT.o` relocation error when building `libdep.la`
6. **Linux headers dependency for busybox-native** — busybox's `defconfig` enables applets needing `linux/kd.h` etc.

### Files changed in this phase

| File | Change |
|------|--------|
| 34 downstream recipes (cross/, native/, stage2/, toolchain/, bootstrap/) | `seedRootRecipe` → `hodSeedRootRecipe` |
| `recipes/bootstrap/binutils-musl.ts` | Added unprefixed `ld.bfd`, `ld.gold` symlinks |
| `recipes/bootstrap/gcc-musl.ts` | Added `--disable-gnu-indirect-function`, GCC 14.2.0 |
| `recipes/bootstrap/gcc-source.ts` | GCC 11.2.0 → 14.2.0 |
| `recipes/cross/glibc.ts` | Added `CXX=no-such-compiler` |
| `recipes/bootstrap/hod-musl-toolchain.ts` | C++ header path 11.2.0 → 14.2.0 |
| `recipes/native/binutils.ts` | Added `--disable-shared` |
| `recipes/toolchain/busybox-native.ts` | Added `linux-headers` dependency for kernel headers |

---

## Phase C: Busybox from source + round-trip verification — NEXT 🔲

Depends on Phase B completing. This is the highest-value next step because the opaque busybox is the executor for every build in the pipeline — its quirks propagate everywhere.

### C.1: Replace opaque busybox — HIGH PRIORITY

`recipes/bootstrap/busybox.ts` currently uses `fileFromHash` with no source URL. Replace with busybox built from source.

**Why this matters:** The opaque busybox is used as the shell executor for every build up to and including `native-toolchain` assembly. Any busybox bugs or behavioral quirks silently affect the entire pipeline. Replacing it with a source-built version eliminates the last truly opaque artifact and makes the entire bootstrap auditable from source.

**Implementation plan:**

1. Build a bootstrap busybox using `hod-musl-toolchain` (the Hod-built musl compiler from Phase A). This avoids circular dependency with `native-toolchain` — same approach as `toolchain/busybox-native.ts` which already builds static busybox with the seed's musl gcc.
2. Verify functional compatibility with the opaque busybox by running all existing validation recipes.
3. Replace `bootstrap/busybox.ts`'s `fileFromHash` with the source-built recipe.
4. Rebuild the entire pipeline to confirm nothing breaks.

**Open question:** The seed busybox version may differ from 1.37.0 (what `busybox-source.ts` downloads). If the opaque busybox is an older version with different applet behavior, we may need to use a matching version or verify that 1.37.0 is a compatible superset. Test this during implementation.

**After C.1, the only opaque artifact left is the musl.cc download.**

### C.2: Round-trip reproducibility — DEFER TO AFTER C.1

Use the full pipeline (hod-seed-root → gcc-stage2) to rebuild `hod-musl-toolchain` itself. Compare output hashes. If they match, we have proven the toolchain is a correct compiler. This is the same technique GCC uses (stage 1 → stage 2 → stage 3 comparison).

**Why defer:** Round-trip reproducibility requires solving `__DATE__` macros, build timestamps, file ordering in `ar` archives, and other sources of nondeterminism first. Do this after C.1 eliminates the opaque busybox — the results will be cleaner.

**Expected gaps:**
- `__DATE__` / `__TIME__` macros in GCC and binutils
- File ordering in `ar` archives (affected by `LC_ALL`, readdir order)
- Build timestamps embedded in debug info or comment sections
- Potential musl.cc 11.2.1 vs. Hod-built 11.2.0 output differences (same major version, functionally identical, but may differ in internal metadata)

### C.3: Suppress `hod: open interp` spam — TRIVIAL FIX

`src/relocate.rs` prints "hod: open interp" for every binary whose PT_INTERP it can't read on the host. Should be debug-level only. Not blocking anything; fix whenever convenient.

---

## Phase D: Seed Minimization — FUTURE 🔲

After Phase C, the only opaque artifact is the musl.cc toolchain download. This phase reduces and documents the seed.

### D.1: Create a seed manifest

Explicitly list every opaque artifact, its BLAKE3 hash, where it came from, and what it's used for. This is Hod's equivalent of Nixpkgs's `pkgs/stdenv/linux/bootstrap-files/` directory.

```
SEED MANIFEST
=============

1. musl.cc toolchain (x86_64-linux-musl-native)
   Hash: a77bdfcf09a27aacf21aba8cd4282e7adefc83f91769e0742864b77d0dd46fb2
   Source: https://musl.cc/x86_64-linux-musl-native.tgz
   Used by: bootstrap ladder only (seed-root.ts)
   Contains: GCC 11.2.1, binutils 2.37, musl 1.2.x, headers
   Size: ~50MB compressed

2. busybox binary
   Hash: 41eee14fead1f5f637e613b5bb865caab4fd3624f6bf5ebbe5280de5a8a6abac
   Source: unknown
   Used by: seed-root.ts, hod-seed-root.ts (executor)
   Size: ~2MB
   REMOVED BY: Phase C.1
```

This should be a file checked into the repository (e.g., `docs/seed-manifest.md`) and kept up to date as the seed evolves.

### D.2: Simplify the seed to a single artifact

The musl.cc tarball is ~50MB and includes a full GCC installation with sysroot, headers, libraries, libexec, etc. Most of this is redundant — we build musl, binutils, and the full toolchain from source in Phase A.

**Potential simplification:** Extract just a single static musl-compiled GCC binary (~20MB) from the musl.cc tarball and use it as the sole seed artifact. Then:
- Build musl from source using just that GCC binary
- Build binutils from source using just that GCC binary
- Build GCC itself from source (the full gcc-musl recipe)

This reduces the seed's attack surface from a full toolchain to a single compiler binary. It's a straightforward change to `bootstrap/musl-toolchain-source.ts` and `bootstrap/seed-root.ts`.

---

## Phase E: nixpkgs Parity — LONG-TERM 🔲

The end goal is to be able to build anything nixpkgs could build, reproducibly and hermetically.

### E.1: Upgrade GCC versions

gcc-stage2 is at 13.2.0, which is reasonable today but will age. Add a stage that rebuilds GCC 14.x (or later) with the native toolchain, so downstream packages get a modern compiler. This is a new recipe that uses `shellBuild()` and depends on `native-toolchain` — no seed involvement.

### E.2: Broad package coverage

ncurses + cbonsai proves the `shellBuild()` concept works. For nixpkgs-parity, the next tier of packages needed is:

**Tier 1 (build infrastructure):** zlib, openssl, curl, pkg-config, cmake, autoconf, automake, libtool

**Tier 2 (common dependencies):** ncurses (done), readline, libffi, glib, expat, libxml2, sqlite, xz, zstd, bzip2

**Tier 3 (applications):** Python, Rust (via mrustc bootstrap), Go (via GCC→Go chain), NodeJS

Each follows the same `shellBuild()` pattern. The main challenge is version compatibility and configure flag tuning, not architectural changes.

### E.3: Consider a `stdenv`-like phase abstraction

Nixpkgs's `stdenv.mkDerivation` wraps the toolchain with standard build phases (configure, build, install, fixup) and hardening options. Hod's `shellBuild()` is a rough equivalent but lacks standardized phases. Adding phase support would:
- Make recipes more consistent and easier to write
- Enable automatic application of hardening flags (PIE, stack protector, FORTIFY_SOURCE)
- Mirror what package authors expect from a build system

This is not urgent — `shellBuild()` works well for the current scale — but will become valuable as the package set grows.

---

## Already-Completed Work (from prior sessions)

These items from the old plan documents are **done** and don't need revisiting:

### gcc-stage2 + native-toolchain ✅

- `recipes/stage2/gcc-stage2-c.ts` — C-only native GCC, built and validated
- `recipes/stage2/gcc-stage2.ts` — Full C+C++ native GCC, built and validated
- `recipes/stage2/validate-gcc-stage2-c.ts` — all checks pass
- `recipes/stage2/validate-gcc-stage2.ts` — all checks pass
- `recipes/stage2/gmp.ts`, `mpfr.ts`, `mpc.ts` — glibc-hosted math libraries

### Native toolchain + shellBuild ✅

- `recipes/toolchain/native-toolchain.ts` — bundles gcc-stage2 + binutils + bash + coreutils + make + all GNU tools + busybox-native + glibc sysroot
- `recipes/toolchain/busybox-native.ts` — static busybox built from source
- `js/src/shell.ts` — `shellBuild()` SDK helper
- `recipes/native/ncurses/ncurses.ts` — uses `shellBuild()`, zero seed references
- `recipes/native/cbonsai/cbonsai.ts` — uses `shellBuild()`, zero seed references

### Hermetic preamble ✅

- `js/src/preamble.ts` — `hermeticPreamble()` creates `/bin/sh`, dynamic linker symlinks, glibc runtime in `/lib/`
- All recipes converted to use it
- Sandbox `/tmp` changed from tmpfs (512MB) to plain directory

### Cross-compilation infrastructure ✅

- `recipes/cross/linux-headers.ts` — with `HOSTCFLAGS="-O2 -static"`
- `recipes/cross/glibc.ts` — with Python support, PYTHONHOME
- `recipes/cross/gcc-stage1.ts` — musl→glibc cross-compiler
- `recipes/cross/gmp.ts`, `mpfr.ts`, `mpc.ts` — with `.la` cleanup

---

## Design Decisions

### Two-tier seed architecture

`seed-root.ts` (musl.cc) is kept for the bootstrap ladder only. `hod-seed-root.ts` (Hod-built) is used by everything else. This avoids circular dependencies while making the downstream pipeline auditable.

After Phase C.1, the opaque busybox is replaced everywhere and the two tiers use the same source-built busybox. After Phase D.2, the seed may be a single GCC binary.

### Static busybox as executor

The native-toolchain bundles a statically-linked busybox built from source. This is the executor for `shellBuild()` recipes — no dynamic linker needed, no seed dependency.

### `--disable-gnu-indirect-function` on gcc-musl

Matches the musl.cc toolchain. Safe because gcc-musl is a build tool (musl-targeting seed compiler), not the end-user compiler. gcc-stage2 is a separate build with its own flags.

### `shellBuild()` as the user-facing API

Downstream recipes use `shellBuild()` which wraps `process()` with the hermetic preamble and static busybox executor. Recipe authors don't need to know about seed, preamble, or dynamic linkers.

### musl → glibc cross-compilation (the cross stage)

The seed is musl-based but the target is glibc (for nixpkgs-parity). This means the entire `cross/` stage cross-compiles from musl to glibc, which requires:
- `hermeticPreamble()` to set up the glibc dynamic linker in the sandbox
- gcc-stage1 as a cross-compiler (musl host → glibc target)
- Shims (musl-compiled build tools) because glibc tools can't run in a musl-only sandbox

**This is the biggest source of pipeline complexity** (~50% of the total). An alternative would be to target musl for everything (like Alpine/StageX), which would eliminate the cross stage, shims, and preamble complexity entirely. We chose glibc because nixpkgs targets glibc and that's our parity goal.

### Why gmp/mpfr/mpc are built three times

These math libraries are compiled in three different contexts:

1. `cross/gmp.ts` (and mpfr/mpc) — built with `seed-root`'s musl gcc, static-only. Used by gcc-musl's `--with-gmp` in the bootstrap ladder.
2. Reused by `gcc-stage1` — same cross/ recipes, same musl compiler.
3. `stage2/gmp.ts` (and mpfr/mpc) — built with gcc-stage1 (glibc cross-compiler), linked against glibc. Used by gcc-stage2's `--with-gmp`.

They must be separate because they're compiled by different compilers against different libcs. The cross/ variants are static musl; the stage2/ variants are dynamic glibc. This is standard practice — Nixpkgs does the same thing across its stdenv stages.

---

## Landscape Comparison

How Hod's bootstrap approach compares to other systems:

| System | Seed Size | Approach | Reproducible | Bootstrapped |
|--------|-----------|----------|-------------|-------------|
| **Guix** | ~357 bytes (hex0) | Full source bootstrap via Mes/M2-Planet | Partial (90%) | Yes |
| **StageX** | ~190 bytes (hex0) | Full source bootstrap, musl-based containers | Yes (100%) | Yes |
| **Nixpkgs** | ~21MB (bootstrap-tools tarball) | Pre-built gcc+glibc+busybox+coreutils | Partial (95%) | Partially |
| **Hod** | ~52MB (musl.cc + opaque busybox) | Pre-built musl toolchain + busybox, source-built from there | TBD | Partially (Phase C completes) |

**What we chose not to do:** Bootstrap from hex0 (Guix/StageX). This requires maintaining a chain through Mes, M2-Planet, TinyCC, and vintage GCC versions — a massive ongoing maintenance burden. Our approach trades maximal minimality for pragmatism.

**What we do that Nixpkgs doesn't:**
- Nixpkgs uses `patchelf` to rewrite interpreter/RPATH in pre-built binaries. Hod uses `relocate.rs` for ELF relocation, integrated into the build system.
- Nixpkgs doesn't verify round-trip reproducibility of the bootstrap. Hod plans to (C.2).
- Hod separates the seed into two named artifacts (busybox + musl toolchain) with clear provenance tracking, vs. Nixpkgs's single opaque tarball.

**What we can learn from Nixpkgs:**
- Nixpkgs's 5-stage stdenv tower proves the seed can be made to "disappear" — final stdenv has no runtime reference to bootstrap-tools. Hod achieves the same: downstream packages depend only on `native-toolchain`.
- Nixpkgs rebuilds glibc *twice* (once early, once with the rebuilt gcc). Hod builds it once, which is fine — glibc is built with the Hod-built musl compiler, not the opaque seed.

---

## Open Questions

1. **Root cause of the `atexit` IFUNC error.** ✅ RESOLVED. Two separate issues: (a) GCC 11.2.0 is below glibc 2.41's minimum of 11.5 — fixed by upgrading to GCC 14.2.0. (b) glibc's C++ support program (`links-dso-program.cc`) links against musl-built `libstdc++.so` which references `atexit`, but `atexit` is hidden in glibc's `libc_nonshared.a` and can't be referenced from PIE/DSO — fixed by setting `CXX=no-such-compiler`.

2. **Seed busybox provenance.** We don't know what version or config the opaque busybox was built with. Phase C.1 addresses this by replacing it entirely.

3. **musl.cc patches.** ✅ RESOLVED. Upgraded gcc-musl to GCC 14.2.0 which is well above both the musl.cc version (11.2.1) and glibc's minimum (11.5). The version/patch gap is no longer relevant since our compiler is much newer.

4. **Future: musl-only target?** If we ever want to simplify the pipeline dramatically, targeting musl for everything (like Alpine/StageX) would eliminate the cross-compilation stage, shims, and preamble complexity. This is a major architectural change and not currently planned, but worth remembering as an option.

---

## Session Summaries

### Session 2026-05-06: Phase B progress, infrastructure fixes, glibc blocker

**Accomplished:**

1. **Implemented `hod import-blob` CLI command** (`src/main.rs`). Allows importing files as content blobs into the store. Needed because the fresh store had no blobs and there was no other way to seed them.

2. **Implemented `build_unpack` builder** (`src/build.rs`). Previously a stub returning "not yet implemented". Now extracts tar archives (gz/xz) to a temp directory, captures the output as a Directory artifact, and stages it. Added `ArchiveFormat` to the import list.

3. **Fixed 3 recipes with stale `PHANTOM_SHIMS_HASH`** — `recipes/shims/m4.ts`, `recipes/shims/bison.ts`, and `recipes/cross/linux-headers.ts` referenced a hardcoded hash of a previous shims-bundle recipe that no longer existed. Root cause: circular dependency between m4/bison and shims-bundle. **Fix:** removed the shims-bundle dep from m4.ts and bison.ts (they didn't actually use `/deps/shims/` at runtime), and added `makeRecipe` as a dep instead (m4/bison both run `make`). Added `export PATH=/deps/make/bin:...` to both build scripts.

4. **Aligned gcc-musl configure flags with musl-cross-make** (`recipes/bootstrap/gcc-musl.ts`). Added `--enable-initfini-array`, `--enable-tls`, `--enable-libstdcxx-time=rt`, `--disable-libmudflap`, `--disable-libmpx`.

5. **Aligned binutils-musl configure flags with musl-cross-make** (`recipes/bootstrap/binutils-musl.ts`). Added `--disable-separate-code`, `--enable-deterministic-archives`.

6. **Rebuilt the entire bootstrap ladder** with the new flags: binutils-musl (~39s), gcc-musl (~100s), hod-musl-toolchain, hod-seed-root. All succeed.

7. **Confirmed glibc builds with musl.cc seed-root** but **fails with hod-seed-root**. The `atexit` IFUNC error persists despite the flag alignment. This proves the issue is not just configure flags — it's gcc version/patches.

**Current blocker:**

The Hod-built gcc-musl 11.2.0 (vanilla GNU release) cannot build glibc 2.41. The musl.cc pre-built toolchain (gcc 11.2.1 with musl-cross-make patches) works fine. The configure flag alignment was necessary but not sufficient.

**Next step:**

Upgrade `recipes/bootstrap/gcc-musl.ts` and `recipes/bootstrap/gcc-source.ts` to use a GCC version that matches or exceeds the musl.cc toolchain. Specifically:

1. Check what GCC version the current musl.cc download actually contains (the wrapper scripts reference `11.2.1` paths). Consider upgrading to GCC 14.x or later (current musl-cross-make defaults to 9.4.0 but the musl.cc binary releases use newer snapshots).
2. Update `recipes/bootstrap/gcc-source.ts` to download the new GCC tarball.
3. Update the configure flags and build script in `recipes/bootstrap/gcc-musl.ts` for the new version (path changes, any flag differences).
4. Rebuild gcc-musl, hod-musl-toolchain, hod-seed-root.
5. Test glibc build with the upgraded toolchain.
6. If glibc builds, continue with the Phase B validation steps from the roadmap.

**Files changed this session:**

| File | Change |
|------|--------|
| `src/main.rs` | Added `import-blob` CLI command |
| `src/build.rs` | Implemented `build_unpack` (was stub); added `ArchiveFormat` import |
| `recipes/shims/m4.ts` | Removed PHANTOM_SHIMS_HASH, added makeRecipe dep, PATH fix |
| `recipes/shims/bison.ts` | Removed PHANTOM_SHIMS_HASH, added makeRecipe dep, PATH fix |
| `recipes/cross/linux-headers.ts` | Replaced PHANTOM_SHIMS_HASH with shimsBundleRecipe import |
| `recipes/bootstrap/gcc-musl.ts` | Added `--enable-initfini-array`, `--enable-tls`, `--enable-libstdcxx-time=rt`, `--disable-libmudflap`, `--disable-libmpx` |
| `recipes/bootstrap/binutils-musl.ts` | Added `--disable-separate-code`, `--enable-deterministic-archives` |

**Key reference: musl-cross-make configure flags** (from `https://github.com/richfelker/musl-cross-make/blob/master/litecross/Makefile`):

```
# GCC:
--disable-gnu-indirect-function
--enable-initfini-array
--enable-libstdcxx-time=rt
--enable-tls
--disable-libmudflap
--disable-libsanitizer
--disable-libmpx
--disable-bootstrap
--disable-assembly
--disable-werror
--disable-nls
--disable-multilib

# binutils:
--disable-separate-code
--enable-deterministic-archives
--disable-werror
```

### Session 2026-05-06 (Session 2): GCC upgrade, glibc CXX fix, gate test passed

**Accomplished:**

1. **Identified root cause of glibc build failure:** glibc 2.41 requires GCC ≥ 11.5. Our gcc-musl was 11.2.0 (below minimum). The `atexit` hidden symbol error was NOT caused by `--disable-gnu-indirect-function` but by the GCC version being too old.

2. **Upgraded gcc-musl from GCC 11.2.0 → 14.2.0:**
   - Updated `gcc-source.ts` with new URL and BLAKE3 hash
   - Updated `gcc-musl.ts`: version refs, removed `--disable-libmudflap` (removed in GCC 12), removed `--disable-libmpx` (removed in GCC 12)
   - Removed `--enable-default-pie` and `--enable-default-ssp` (not used by musl-cross-make)
   - Updated `hod-musl-toolchain.ts` C++ header path

3. **Fixed glibc `atexit` error with `CXX=no-such-compiler`:** Even after upgrading to GCC 14.2.0, glibc failed with the same `atexit` error. Root cause: glibc's configure detects `g++` in the seed, builds `links-dso-program.cc` with `-lstdc++ -pie`. The musl-built `libstdc++.so` references `atexit`, which is hidden in glibc's `libc_nonshared.a`. PIE executables can't reference hidden symbols. Fix: set `CXX=no-such-compiler` to prevent glibc from finding C++ and force the C-only `links-dso-program-c.c`.

4. **Gate test passed:** glibc 2.41 builds successfully with the Hod-built GCC 14.2.0 toolchain. Build time: ~1m10s.

**Key insight:** The `atexit` error was caused by two separate issues, not one:
1. GCC 11.2.0 was below glibc 2.41's minimum (11.5) — fixed by upgrading to 14.2.0
2. glibc's C++ support program conflicts with musl-built libstdc++ — fixed by disabling CXX

Both had to be fixed for glibc to build.

**Build times for the upgraded ladder:**
- binutils-musl: ~40s
- gcc-musl 14.2.0: ~2m20s
- hod-musl-toolchain: ~1s
- hod-seed-root: ~1s
- glibc 2.41: ~1m10s

**Next step:** Continue Phase B validation: build gcc-stage1, validate, build native tools, build gcc-stage2, build native-toolchain.

### Session 2026-05-06 (Session 3): Phase B validation complete

**Accomplished:**

Completed the full Phase B validation pipeline (steps 2–9 from the roadmap). All builds and tests pass.

**Step-by-step results:**

1. **gcc-stage1** (cross-compiler): Built in ~168s. Much faster than roadmap's 30min estimate.
2. **cross/validate-stage1**: Passed (161ms). gcc-stage1 can compile C programs.
3. **cross/validate-complex**: Passed (173ms). Multi-file C program with make.
4. **11 native tools**: All built successfully (bash, coreutils, make, binutils, diffutils, findutils, grep, gawk, sed, patch, tar). ~2min total.
5. **validate-bash**: Passed (109ms).
6. **validate-selfhost**: Passed (142ms) after fixing two issues.
7. **gcc-stage2** (native glibc compiler): Built in ~177s with C+C++ support.
8. **validate-gcc-stage2-c**: Passed. C-only native compilation verified.
9. **validate-gcc-stage2**: Passed. C++ native compilation verified (libstdc++, libm, libgcc_s, libc).
10. **native-toolchain**: Built in ~1.5s (assembles gcc-stage2 + binutils + bash + coreutils + all GNU tools + busybox-native + glibc sysroot).
11. **ncurses**: Built in ~21s using `shellBuild()`.
12. **cbonsai**: Built in 881ms using `shellBuild()`.

**Fixes applied:**

1. **`--disable-shared` in native binutils** — The binutils build failed because `libdep.la` in `ld/` tried to build as a shared library. The musl gcc's `crtbeginT.o` has relocations incompatible with shared objects. Fixed by adding `--disable-shared` to configure flags.

2. **Linux headers dependency for busybox-native** — The native-toolchain assembly builds `busybox-native` which uses `defconfig` (all applets enabled). Several applets (`console-tools/kbd_mode`, `init`) need `<linux/kd.h>` and `<linux/vt.h>` which aren't in the musl sysroot. Fixed by adding `linux-headers` as a dependency and adding `-I/deps/linux-headers/include` to CFLAGS.

**Files changed:**

| File | Change |
|------|--------|
| `recipes/native/binutils.ts` | Added `--disable-shared` to configure |
| `recipes/toolchain/busybox-native.ts` | Added `linux-headers` dep and include path |

**Store state:** 92 outputs in the store, covering the full pipeline from seed to native-toolchain to downstream packages.

**Phase B is now complete.** The entire pipeline from opaque seed → native glibc toolchain → downstream packages works with the Hod-built musl toolchain.
