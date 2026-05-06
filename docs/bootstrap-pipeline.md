# Hod Bootstrap Pipeline

This document describes the full build pipeline from seed to self-hosting.
The goal is to make it easy to understand what each stage produces, why it
exists, and what executes it.

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
│                                             (busybox sh +             │
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
│  bootstrap/binutils-musl ────────┘     (C + C++, self-contained)    │
│                                              │                      │
│                                              ▼                      │
│                                    bootstrap/hod-musl-toolchain     │
│                                    (assembles gcc + binutils under  │
│                                     x86_64-linux-musl-native/)      │
│                                              │                      │
│                                              ▼                      │
│                                    bootstrap/hod-seed-root          │
│                                    (busybox + Hod-built toolchain)  │
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
                          │  stage 1 + shims
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│  STAGE 1: CROSS (musl → glibc cross-compilation)                    │
│  Executor: seed busybox  |  Compiler: seed musl gcc                 │
│                                                                     │
│  linux-headers                                                       │
│  gmp, mpfr, mpc  ──►  gcc-stage1 (cross-compiler: musl→glibc)       │
│  glibc            ──►  glibc (target C library)                      │
│  glibc-runtime   ──►  stripped glibc runtime (for packed binaries)   │
│                                                                     │
│  Produces a glibc cross-compiler and target glibc.                  │
│  Everything here is "cross" because the host is musl and the        │
│  target is glibc.                                                   │
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
│  gcc-stage2      Full native GCC (C + C++), compiled to run on      │
│  gcc-stage2-c    glibc. Uses native binutils from stage 2.          │
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
│  busybox-native is built with seed's musl gcc (not gcc-stage2)      │
│  to avoid a circular dep with native-toolchain. It uses the         │
│  standalone shim make.                                              │
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
| `shims/make` | Build tool for musl-build, binutils-musl, gcc-musl |
| `shims/*` (all others) | Aggregated by shims-bundle, used by cross/ recipes |
| `cross/gmp` | Math library linked into gcc-musl |
| `cross/mpfr` | Math library linked into gcc-musl |
| `cross/mpc` | Math library linked into gcc-musl |
| `bootstrap/musl-build` | Target C library for gcc-musl |
| `bootstrap/binutils-musl` | Target assembler/linker for gcc-musl |
| `bootstrap/gcc-musl` | The compiler being built |
| `bootstrap/hod-musl-toolchain` | Assembly of gcc-musl + binutils-musl |
| `bootstrap/hod-seed-root` | Assembly of busybox + Hod-built toolchain |

Note: the cross/ gmp/mpfr/mpc are in the ladder because gcc-musl imports
them directly. They use shims-bundle, which depends on seed-root.

### Tier 2: Hod-Built Seed (`hod-seed-root.ts`)

```
busybox (opaque) + Hod-built musl toolchain (from source) → hod-seed-root
```

This is used by **all downstream recipes** — everything that doesn't
participate in building the Hod-built musl toolchain itself. These recipes
get a fully source-auditable compiler and C library.

**Recipes that should use `hod-seed-root.ts`:**

| Group | Recipes |
|-------|---------|
| Stage 1 (cross) | `cross/gcc-stage1`, `cross/glibc`, `cross/glibc-runtime`, `cross/linux-headers` |
| Stage 2 (native) | `native/bash`, `native/coreutils`, `native/make`, `native/binutils`, etc. |
| Stage 2.5 | `stage2/gcc-stage2`, `stage2/gcc-stage2-c` |
| Toolchain assembly | `toolchain/busybox-native`, `toolchain/native-toolchain` |
| Validation | All `validate-*` recipes not in the bootstrap ladder |
| Downstream | `native/ncurses/*`, etc. |

### Why This Is Sound

The musl.cc download isn't *removed* — it's *contained*. It becomes the
irreducible bootstrap seed, alongside the opaque busybox binary. The scope
of opaque artifacts is reduced from "the entire pipeline uses them" to
"only the bootstrap ladder uses them."

Every downstream package traces through `hod-seed-root` →
`hod-musl-toolchain` → source code (musl 1.2.5, binutils 2.37, gcc 11.2.0).
The only opaque artifacts are the ones needed to build the first compiler —
the theoretical minimum for any bootstrapping build system.

### Round-Trip Verification (Future)

Once downstream recipes use `hod-seed-root`, we can prove correctness:

1. Use `hod-seed-root` (Hod-built gcc 11.2.0) to rebuild `gcc-musl`
2. That produces a second-generation gcc
3. Compare its output hash with the first-generation gcc

If they match (or differences are explained by nondeterminism like build
timestamps), we've proven the Hod-built toolchain is a correct compiler.
This is the same technique GCC uses (stage 1 → stage 2 → stage 3 comparison).

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

## Compiler Evolution

| Stage | Compiler | Target C lib |
|-------|----------|-------------|
| Bootstrap ladder | seed musl gcc 11.2.1 | musl |
| Shims | seed musl gcc 11.2.1 | musl (static) |
| Stage 1 (cross) | seed musl gcc 11.2.1 | glibc (cross) |
| Stage 2 (native) | gcc-stage1 (cross) | glibc (native) |
| Stage 2.5 | gcc-stage1 (cross) | glibc (native) |
| Downstream | gcc-stage2 (native) | glibc (native) |

## Why Do Shims Exist?

The seed provides a musl gcc. Stage 1 produces glibc-linked binaries.
But stage 1 build scripts need tools like `make`, `sed`, `bison` — and
they run inside a sandbox where only the seed's musl runtime is available.

**Shims are musl-compiled build tools** that work in the seed's environment.
They bridge the gap until the native toolchain is ready.

Once native-toolchain exists, downstream recipes don't need shims anymore.

## Folder Map

```
recipes/
  bootstrap/    Seed assembly + Hod-built musl toolchain from source
                  busybox.ts              → fileFromHash (opaque binary)
                  musl-toolchain.ts       → unpack pre-built musl (from musl.cc)
                  seed-root.ts            → combines both into the bootstrap seed
                  hod-seed-root.ts        → busybox + Hod-built toolchain
                  musl-source.ts          → download musl 1.2.5 source
                  musl-build.ts           → build musl from source
                  binutils-source.ts      → download binutils 2.37 source
                  binutils-musl.ts        → build binutils targeting musl
                  gcc-source.ts           → download gcc 11.2.0 source
                  gcc-musl.ts             → build gcc targeting musl (C + C++)
                  hod-musl-toolchain.ts   → assemble gcc + binutils + musl
                  validate-*.ts           → smoke tests for each component
                  python.ts/install       → python for glibc configure script

  shims/        Minimal musl-linked build tools (make, sed, bison, etc.)
                  Each tool is a standalone recipe compiled with seed gcc.
                  shims-bundle.ts aggregates them into one dep.
                  NOTE: part of the bootstrap ladder — must use seed-root.

  cross/        Stage 1: cross-compilation (musl host → glibc target)
                  linux-headers, gmp, mpfr, mpc → gcc-stage1
                  glibc, glibc-runtime
                  validate-stage1, validate-complex
                  hello-packed, run-packed-hello (packed binary tests)
                  NOTE: gmp/mpfr/mpc are in the bootstrap ladder.

  stage2/       Stage 2.5: gcc-stage2 (native glibc compiler)
                  gmp, mpfr, mpc (native-built, for gcc-stage2 to link)
                  gcc-stage2, gcc-stage2-c
                  validate-gcc-stage2, validate-gcc-stage2-c

  native/       Stage 2: native glibc-linked tools
                  bash, coreutils, make, sed, grep, gawk, patch, tar
                  binutils, diffutils, findutils
                  validate-bash, validate-reloc, validate-selfhost
                  ncurses/ → cbonsai/ (downstream packages, already migrated)
                NOTE: most still use seed as executor + gcc-stage1 as compiler.
                They haven't been migrated to the native toolchain yet.

  toolchain/    Toolchain assembly
                  busybox-source.ts  → download busybox source
                  busybox-native.ts  → static busybox (seed musl gcc)
                  native-toolchain.ts → bundles everything together

  sources/      (gitignored) Pre-seeded source tarballs and binaries
                  Used for offline development / avoiding re-downloads.
```

## Known Issues and Gaps

### 1. Downstream recipes still use seed-root, not hod-seed-root

Most `recipes/cross/`, `recipes/native/`, `recipes/stage2/`, and
`recipes/toolchain/` files import `seedRootRecipe`. They should be migrated
to `hodSeedRootRecipe` so the downstream pipeline uses the fully auditable,
Hod-built musl toolchain instead of the pre-built musl.cc download.

The bootstrap ladder recipes (shims, cross/gmp|mpfr|mpc, bootstrap/gcc-musl
and its dependencies) must continue using `seedRootRecipe` to avoid the
circular dependency.

### 2. Native recipes still use gcc-stage1, not gcc-stage2

Most `recipes/native/` files (bash, coreutils, make, etc.) import
`gcc-stage1` as their compiler. Only `native-toolchain` uses `gcc-stage2`.
This works because gcc-stage1 is a functioning cross-compiler, but it
means the native tools aren't truly self-hosted yet — they were cross-compiled.

This doesn't affect correctness (the output is the same glibc-linked
binary either way), but it means the "native" tools aren't truly
self-hosted yet — they were cross-compiled.

### 3. Seed busybox is opaque

`recipes/bootstrap/busybox.ts` uses `fileFromHash` with no source URL.
We don't know what version of busybox it is or how it was built.
`busybox-native` (built from source) replaces it for downstream use,
but the seed blob is still the initial executor for everything.

## Path to Even More Minimal Bootstrapping

The current irreducible seed is two artifacts: busybox + musl.cc toolchain.
Future work could reduce this further:

1. **Build busybox from source** (Phase 6 in the build-musl-from-source plan)
   using the Hod-built toolchain. This would leave only the musl.cc download
   as the irreducible seed — but it would be used *only* to bootstrap
   gcc-musl, not by the rest of the pipeline.

2. **Write a minimal C compiler in assembly** (a la bootstrappable.org's
   mesCC/m2-planet). This is the most minimal possible bootstrap but is a
   much larger project.

3. **Separate the bootstrap ladder into more stages**. Currently gcc-musl
   is built in one stage. A multi-stage approach (minimal C-only gcc first,
   then a full C++ gcc using the minimal one) could allow parts of the
   bootstrap ladder to switch to hod-seed-root sooner.
