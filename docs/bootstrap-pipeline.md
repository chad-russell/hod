# Hod Bootstrap Pipeline

This document describes the full build pipeline from seed to self-hosting,
including the round-trip verification that proves the native compiler is
correct.

## Pipeline Status

| Phase | What | Status |
|-------|------|--------|
| **A** | Hod-built musl toolchain (musl + binutils + gcc from source) | ✅ Complete |
| **B** | Migrate all downstream recipes to Hod-built toolchain | ✅ Complete |
| **C** | Busybox from source + round-trip verification | ✅ Complete |
| **D** | Seed minimization (single GCC binary, seed manifest) | 🔲 Next |

## Pipeline Overview

```
┌──────────────────────────────────────────────────────────────────────┐
│  IRREDUCIBLE BOOTSTRAP SEED (opaque binaries, not Hod-built)         │
│                                                                      │
│  These are the minimal trusted artifacts needed to start building.   │
│  Every build system needs something to bootstrap from.               │
│                                                                      │
│  busybox binary (unknown provenance)  ──┐                            │
│  musl toolchain (downloaded from musl.cc)──►  seed-root.ts           │
│   (GCC 11.2.1, binutils 2.37, musl)        (busybox sh +             │
│                                              musl gcc/binutils/libs) │
└──────────────────────────────────────────┬───────────────────────────┘
                                           │
                  ┌────────────────────────┘
                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  BOOTSTRAP LADDER (uses seed-root as both executor and compiler)    │
│                                                                     │
│  These recipes form a self-contained bootstrapping chain. They      │
│  must use seed-root (pre-built musl.cc) because the Hod-built      │
│  toolchain depends on them — creating a circular dependency if      │
│  seed-root tried to use the Hod-built toolchain.                    │
│                                                                     │
│  shims/make  ─────────────────────┐                                  │
│  cross/gmp, mpfr, mpc ───────────┤                                  │
│  bootstrap/musl-build ───────────┼──►  bootstrap/gcc-musl           │
│  bootstrap/binutils-musl ────────┘     (GCC 14.2.0, C + C++,        │
│                                         self-contained with musl)    │
│                                              │                      │
│                                              ▼                      │
│                                    bootstrap/hod-musl-toolchain     │
│                                    (assembles gcc + binutils under  │
│                                     x86_64-linux-musl-native/)      │
│                                              │                      │
│                                              ▼                      │
│                          bootstrap/busybox-from-source              │
│                          (busybox 1.37.0, built from source)        │
│                          + hod-musl-toolchain                       │
│                                              │                      │
│                                              ▼                      │
│                                    bootstrap/hod-seed-root          │
│                                    (source-built busybox +           │
│                                     Hod-built toolchain)            │
│                                     FULLY AUDITABLE FROM SOURCE     │
└──────────────────────────────────────────────┬──────────────────────┘
                                               │
                                               │  hod-seed-root
                                               ▼
┌─────────────────────────────────────────────────────────────────────┐
│  SHIMS (minimal build tools, compiled with musl)                    │
│  Executor: seed busybox  |  Compiler: seed musl gcc                 │
│                                                                     │
│  m4 ──► bison                                                       │
│  make (standalone)                                                  │
│  sed ──► patch                                                      │
│  gawk                                                               │
│                                                                     │
│  Bundled into shims-bundle. Used by stage 1 and stage 2 recipes     │
│  because they run under seed and can't use glibc-linked tools.      │
│  These are musl-linked, static-ish binaries that work without       │
│  a glibc dynamic linker.                                            │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          │  hod-seed-root + shims
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 1: CROSS (musl → glibc cross-compilation)                    │
│  Executor: seed busybox  |  Compiler: Hod-built musl gcc (14.2.0)   │
│                                                                     │
│  linux-headers                                                       │
│  gmp, mpfr, mpc  ──►  gcc-stage1 (cross-compiler: musl→glibc)       │
│  glibc            ──►  glibc 2.41 (target C library)                │
│  glibc-runtime   ──►  stripped glibc runtime (for packed binaries)   │
│                                                                     │
│  Produces a glibc cross-compiler and target glibc.                  │
│  Everything here is "cross" because the host is musl and the        │
│  target is glibc.                                                   │
│                                                                     │
│  NOTE: gmp/mpfr/mpc use seed-root (not hod-seed-root) because      │
│  they're in the bootstrap ladder — gcc-musl imports them directly.  │
│  The rest of cross/ uses hod-seed-root.                             │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          │  gcc-stage1 + shims
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 2: NATIVE (glibc-linked, built with gcc-stage1)              │
│  Executor: seed busybox  |  Compiler: gcc-stage1 (cross-compiler)   │
│                                                                     │
│  binutils    (native assembler, linker, archiver, etc.)             │
│  bash        (native shell — but NOT used as executor yet)          │
│  coreutils   (cp, ls, mv, cat, etc.)                                │
│  make        (GNU make, native)                                     │
│  sed, grep, gawk, patch, tar, diffutils, findutils                  │
│                                                                     │
│  These are compiled for x86_64-linux-gnu/glibc using gcc-stage1.   │
│  They still use seed busybox as their executor (the dynamic         │
│  linker isn't available until the preamble sets it up).             │
│                                                                     │
│  IMPORTANT: stage2/ has its own gmp/mpfr/mpc because they are       │
│  compiled with gcc-stage1 + native binutils (not the seed           │
│  compiler). This is needed for gcc-stage2 to link against           │
│  native-built math libraries.                                       │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          │  gcc-stage1 + native tools
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 2.5: gcc-stage2 (native compiler, built with gcc-stage1)     │
│  Executor: seed busybox  |  Compiler: gcc-stage1                    │
│                                                                     │
│  gcc-stage2      Full native GCC 13.2.0 (C + C++), compiled to     │
│  gcc-stage2-c    run on glibc. Uses native binutils from stage 2.   │
│                  Links against stage2-built gmp/mpfr/mpc.           │
│                                                                     │
│  This is the compiler that goes into the native toolchain.          │
│  gcc-stage1 is a cross-compiler (musl host, glibc target).          │
│  gcc-stage2 is a native compiler (glibc host, glibc target).        │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          │  gcc-stage2 + all native tools
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  TOOLCHAIN ASSEMBLY                                                 │
│  Executor: seed busybox  |  Compiler: n/a (assembly only)           │
│                                                                     │
│  busybox-native  Static busybox built from source (musl, seed gcc)  │
│  native-toolchain  Bundles gcc-stage2 + binutils + bash +           │
│                    coreutils + make + all GNU tools + busybox-native │
│                    + glibc sysroot into one dep.                    │
│                                                                     │
│  busybox-native is built with hod-seed-root's musl gcc (not         │
│  gcc-stage2) to avoid a circular dep with native-toolchain. It      │
│  uses the standalone shim make.                                     │
│                                                                     │
│  native-toolchain is the last recipe that depends on seed.          │
│  Everything downstream uses shellBuild() and the toolchain's        │
│  built-in static busybox as executor.                               │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          │  native-toolchain only
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  DOWNSTREAM PACKAGES (user-facing)                                  │
│  Executor: toolchain busybox (static)  |  Compiler: gcc-stage2      │
│                                                                     │
│  ncurses  ──►  cbonsai                                              │
│  (future: zlib, openssl, curl, ...)                                 │
│                                                                     │
│  These use shellBuild() and depend only on native-toolchain.        │
│  No reference to seed. No preamble boilerplate.                     │
└─────────────────────────────────────────────────────────────────────┘
                          │
                          │  (verification, not part of the main pipeline)
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  ROUND-TRIP VERIFICATION (Phase C.2)                                │
│  Executor: toolchain busybox  |  Compiler: gcc-stage2 (glibc)       │
│                                                                     │
│  musl-build-stage2         musl 1.2.5 rebuilt by native toolchain   │
│  binutils-musl-stage2      binutils 2.44 targeting musl, rebuilt    │
│  gcc-musl-stage2           GCC 14.2.0 targeting musl, rebuilt       │
│  validate-roundtrip        Proves the round-trip GCC produces       │
│                            correct binaries (C, math, strings)      │
│                                                                     │
│  This is a cross-compilation: host=glibc, target=musl. Proves the   │
│  native toolchain is a correct compiler — it can rebuild its own    │
│  bootstrap toolchain from source. Equivalent to GCC's stage 3.      │
└─────────────────────────────────────────────────────────────────────┘
```

## Two-Tier Seed Architecture

The pipeline uses two seed roots with identical output layouts but different
provenance:

### Tier 1: Irreducible Bootstrap Seed (`seed-root.ts`)

```
busybox (opaque) + musl.cc download → seed-root
```

This is used **only** by the bootstrap ladder — recipes that the Hod-built
musl toolchain depends on. There is a hard circular dependency: if
`seed-root` used the Hod-built toolchain, the bootstrap ladder would need
`seed-root` to build the toolchain that `seed-root` depends on.

**Recipes that must use `seed-root.ts`** (the bootstrap ladder):

| Recipe | Why it's in the ladder |
|--------|----------------------|
| `shims/*` (all) | Musl-compiled build tools, aggregated by shims-bundle |
| `cross/gmp`, `cross/mpfr`, `cross/mpc` | Math libraries linked into gcc-musl |
| `bootstrap/musl-build` | Target C library for gcc-musl |
| `bootstrap/binutils-musl` | Target assembler/linker for gcc-musl |
| `bootstrap/gcc-musl` | The compiler being built |
| `bootstrap/hod-musl-toolchain` | Assembly of gcc-musl + binutils-musl |
| `bootstrap/busybox-from-source` | Source-built busybox (needs seed shell to build) |

Note: the cross/ gmp/mpfr/mpc are in the ladder because gcc-musl imports
them directly. They use shims-bundle, which depends on seed-root.

### Tier 2: Hod-Built Seed (`hod-seed-root.ts`)

```
busybox (source-built 1.37.0) + Hod-built musl toolchain (from source) → hod-seed-root
```

This is used by **all downstream recipes** — everything that doesn't
participate in building the Hod-built musl toolchain itself. These recipes
get a fully source-auditable compiler, C library, *and* shell executor.

**Recipes that use `hod-seed-root.ts`:**

| Group | Recipes |
|-------|---------|
| Stage 1 (cross) | `cross/gcc-stage1`, `cross/glibc`, `cross/glibc-runtime`, `cross/linux-headers` |
| Stage 2 (native) | `native/bash`, `native/coreutils`, `native/make`, `native/binutils`, etc. |
| Stage 2.5 | `stage2/gcc-stage2`, `stage2/gcc-stage2-c` |
| Toolchain assembly | `toolchain/busybox-native`, `toolchain/native-toolchain` |
| Validation | All `validate-*` recipes not in the bootstrap ladder |
| Downstream | `native/ncurses/*`, `native/cbonsai/*` |

### Why This Is Sound

The musl.cc download isn't *removed* — it's *contained*. It becomes the
irreducible bootstrap seed, alongside the opaque busybox binary. The scope
of opaque artifacts is reduced from "the entire pipeline uses them" to
"only the bootstrap ladder uses them."

Every downstream package traces through `hod-seed-root` →
`hod-musl-toolchain` → source code (musl 1.2.5, binutils 2.44, gcc 14.2.0).
The only opaque artifacts are the ones needed to build the first compiler —
the theoretical minimum for any bootstrapping build system.

### Round-Trip Verification (Completed)

The round-trip proves correctness through a different technique than
bit-for-bit comparison:

1. The native glibc toolchain (gcc-stage2, built by musl.cc seed) builds
   musl, binutils, and a complete GCC 14.2.0 targeting musl.
2. The round-trip GCC then compiles C programs that run correctly.
3. This proves the native compiler is a correct compiler — it can
   reproduce its own bootstrap toolchain from source.

Bit-for-bit comparison is not expected because the original `hod-musl-toolchain`
was built by musl.cc GCC 11.2.1 (musl compiler) while the round-trip was
built by GCC 13.2.0 (glibc compiler) — different compilers produce different
object code. The value is *functional* correctness.

Note: the original bootstrap binutils is now 2.44 (upgraded from 2.37 for
musl header compatibility), so the round-trip should also target binutils 2.44.

See `recipes/roundtrip/` for the implementation.

## Executor Evolution

One of the most confusing things is "what runs the shell?" Here's how it
changes across the pipeline:

| Stage | Shell executor | Why |
|-------|---------------|-----|
| Bootstrap ladder + shims | `/deps/seed/bin/busybox` | Only static shell available. |
| Stage 1 (cross) | `/deps/seed/bin/busybox` | Glibc tools can't run until preamble sets up the linker. |
| Stage 2 (native) | `/deps/seed/bin/busybox` | Same — glibc dynamic linker not yet available. |
| Stage 2.5 | `/deps/seed/bin/busybox` | Same. |
| Toolchain assembly | `/deps/seed/bin/busybox` | Assembling the toolchain; can't use what we're building. |
| Downstream packages | `/deps/toolchain/bin/busybox` | The toolchain bundles a static busybox. Seed is not in the deps. |
| Round-trip | `/deps/toolchain/bin/busybox` | Same as downstream — uses native-toolchain's busybox. |

## Compiler Evolution

| Stage | Compiler | Version | Target C lib |
|-------|----------|---------|-------------|
| Bootstrap ladder | seed musl gcc | 11.2.1 | musl |
| Shims | seed musl gcc | 11.2.1 | musl (static) |
| Stage 1 (cross) | Hod-built musl gcc | 14.2.0 | glibc (cross) |
| Stage 2 (native) | gcc-stage1 (cross) | 13.2.0 | glibc (native) |
| Stage 2.5 | gcc-stage1 (cross) | 13.2.0 | glibc (native) |
| Downstream | gcc-stage2 (native) | 13.2.0 | glibc (native) |
| Round-trip | gcc-stage2 (native) | 13.2.0 | musl (cross) |

## Why Do Shims Exist?

The seed provides a musl gcc. Stage 1 produces glibc-linked binaries.
But stage 1 build scripts need tools like `make`, `sed`, `bison` — and
they run inside a sandbox where only the seed's musl runtime is available.

**Shims are musl-compiled build tools** that work in the seed's environment.
They bridge the gap until the native toolchain is ready.

Once native-toolchain exists, downstream recipes don't need shims anymore.

**Important bootstrap detail:** All shim recipes (and all bootstrap ladder
recipes that use the seed gcc) must wrap `/deps/seed/bin/gcc` with a script
that passes `-B` flags pointing at the seed's internal directories
(`libexec/gcc/...`, `lib/gcc/...`, `x86_64-linux-musl/lib/`). The seed
gcc has hardcoded paths from its original build host that don't exist in
the sandbox; without the `-B` flags, configure test compilations fail
silently and produce broken binaries. See `recipes/shims/make.ts` for the
canonical wrapper pattern.

## Folder Map

```
recipes/
  bootstrap/    Seed assembly + Hod-built musl toolchain from source
                  busybox.ts              → fileFromHash (opaque binary)
                  busybox-from-source.ts  → busybox 1.37.0 built from source
                  musl-toolchain.ts       → unpack pre-built musl (from musl.cc)
                  seed-root.ts            → combines opaque busybox + musl.cc
                  hod-seed-root.ts        → source-built busybox + Hod-built toolchain
                  musl-source.ts          → download musl 1.2.5 source
                  musl-build.ts           → build musl from source
                  binutils-source.ts      → download binutils 2.44 source
                  binutils-musl.ts        → build binutils 2.44 targeting musl
                  gcc-source.ts           → download gcc 14.2.0 source
                  gcc-musl.ts             → build gcc 14.2.0 targeting musl (C + C++)
                  hod-musl-toolchain.ts   → assemble gcc + binutils + musl
                  validate-*.ts           → smoke tests for each component
                  python.ts/install       → python for glibc configure script

  shims/        Minimal musl-linked build tools (make, sed, bison, etc.)
                  Each tool is a standalone recipe compiled with seed gcc.
                  shims-bundle.ts aggregates them into one dep.
                  NOTE: part of the bootstrap ladder — must use seed-root.

  cross/        Stage 1: cross-compilation (musl host → glibc target)
                  linux-headers, glibc, glibc-runtime
                  gcc-stage1 (cross-compiler, GCC 13.2.0)
                  validate-stage1, validate-complex
                  NOTE: gmp/mpfr/mpc are in the bootstrap ladder (seed-root).
                  Everything else uses hod-seed-root.

  stage2/       Stage 2.5: gcc-stage2 (native glibc compiler, GCC 13.2.0)
                  gmp, mpfr, mpc (native-built, for gcc-stage2 to link)
                  gcc-stage2, gcc-stage2-c
                  validate-gcc-stage2, validate-gcc-stage2-c

  native/       Stage 2: native glibc-linked tools
                  bash, coreutils, make, sed, grep, gawk, patch, tar
                  binutils, diffutils, findutils
                  validate-bash, validate-reloc, validate-selfhost
                  ncurses/ → cbonsai/ (downstream packages)

  toolchain/    Toolchain assembly
                  busybox-source.ts  → download busybox 1.37.0 source
                  busybox-native.ts  → static busybox (Hod-built musl gcc)
                  native-toolchain.ts → bundles everything together

  roundtrip/    Round-trip verification (Phase C.2)
                  musl-build-stage2.ts       → musl rebuilt by native toolchain
                  binutils-musl-stage2.ts    → binutils-musl 2.44 rebuilt
                  gcc-musl-stage2.ts         → gcc-musl rebuilt (cross-compilation)
                  validate-roundtrip.ts      → proves round-trip GCC works

  sources/      (gitignored) Pre-seeded source tarballs and binaries
                  Used for offline development / avoiding re-downloads.
```

## Known Issues and Future Work

### 1. Seed gcc requires -B wrapper in sandbox

All recipes that use `/deps/seed/bin/gcc` as the compiler must create a
wrapper script that passes `-B` flags for the seed's internal directories.
Without this, the seed gcc cannot find cc1, collect2, libgcc, crt*.o, etc.
in the sandbox (its hardcoded paths point at the original build host).
Configure test compilations fail silently, producing broken or missing
binaries. This was the root cause of the "no acceptable m4" error in the
bootstrap ladder — shim recipes compiled with bare `CC=/deps/seed/bin/gcc`
produced non-functional binaries.

The canonical pattern (from `recipes/shims/make.ts`):
```sh
mkdir -p /tmp/gcc-wrapper
cat > /tmp/gcc-wrapper/gcc << 'WRAPPER'
#!/bin/sh
exec /deps/seed/bin/gcc \\
  -B/deps/seed/libexec/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/lib/gcc/x86_64-linux-musl/11.2.1/ \\
  -B/deps/seed/x86_64-linux-musl/lib/ \\
  "$@"
WRAPPER
chmod +x /tmp/gcc-wrapper/gcc
```

### 2. hermeticPreamble glibc libc.so bug

`hermeticPreamble()` symlinks ALL `$toolchain/lib/*.so*` files into `/lib/`,
including glibc's `libc.so` linker script (a text file, not ELF). The
dynamic linker fails with "invalid ELF header" when it encounters this.
Currently worked around in the roundtrip recipes with a custom preamble.
A proper fix should exclude linker scripts from symlinking.

### 3. Round-trip not bit-for-bit

The round-trip proves *functional* correctness, not bit-identical
reproducibility. The two compilers (musl.cc GCC 11.2.1 vs. native GCC
13.2.0) produce different object code. Achieving bit-for-bit reproducibility
would require solving `__DATE__` macros, `ar` archive ordering, build
timestamps, and using the same compiler version for both stages.

### 4. Opaque busybox still in bootstrap ladder

`seed-root.ts` still bundles the opaque busybox. It's used as the shell
executor for bootstrap ladder builds. `busybox-from-source.ts` depends on
`seed-root.ts` (to avoid circular deps), so the opaque busybox is
technically on the dependency path of the source-built one. See
`plans/bootstrap-roadmap.md` "Future Considerations" for discussion.

### 5. Seed minimization (Phase D)

The musl.cc tarball (~50MB) includes a full GCC installation. Most of
this is redundant since we build musl, binutils, and gcc from source.
Phase D will reduce the seed to a single static GCC binary (~20MB).

## Path to Even More Minimal Bootstrapping

The current irreducible seed is two artifacts: busybox + musl.cc toolchain.
Future work could reduce this further:

1. **Seed minimization** (Phase D). Extract just a single static musl-compiled
   GCC binary from the musl.cc tarball and use it as the sole seed artifact.
   Then build musl, binutils, and the full toolchain from source using just
   that binary. Reduces the seed's attack surface from a full toolchain to
   a single compiler.

2. **Eliminate the opaque busybox from the bootstrap ladder.** If `process`
   recipes could invoke a command directly without a shell (e.g., `make` as
   the command with args), the bootstrap ladder could avoid needing any
   busybox at all — just the musl gcc binary + a shim `make`.

3. **Write a minimal C compiler in assembly** (a la bootstrappable.org's
   mesCC/m2-planet). This is the most minimal possible bootstrap but is a
   much larger project.
