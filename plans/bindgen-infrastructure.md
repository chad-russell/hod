# Plan: Hermetic Bindgen Infrastructure

**Status:** Active
**Date:** 2026-05-19
**Current authority:** this plan, `recipes/helpers/rust.ts`, `recipes/toolchain/native-toolchain.ts`, and the final bindgen smoke-test recipes added by this work

## Goal

Add a general, hermetic bindgen capability for hod that works inside the sandbox and can be reused by any Rust crate that runs `bindgen` in `build.rs`.

Success means:

1. a Rust package can run upstream `bindgen` inside the hod sandbox
2. `bindgen` does not depend on host `/usr/include`, host clang, or host `/nix/store` paths
3. final package outputs remain relocatable
4. package recipes do not need vendored bindings or patched upstream `build.rs` files just to make bindgen work

## Why This Pivot Exists

`xdg-desktop-portal-cosmic` exposed a real infrastructure gap: hod does not yet have a first-class bindgen setup equivalent to nixpkgs' `rustPlatform.bindgenHook`.

The failed package-specific approaches were useful for diagnosis but are not the right long-term answer:

1. adding ad hoc `LIBCLANG_PATH` and `BINDGEN_EXTRA_CLANG_ARGS` in `recipes/helpers/cosmic.ts`
2. trying Ubuntu prebuilt LLVM tarballs for `libclang`
3. considering pre-generated bindings for `pipewire-sys` / `libspa-sys`

Those are all side paths around the missing infrastructure.

The proper solution is to add:

1. a reusable build-time `bindgen-clang` dependency
2. reusable bindgen environment wiring in the Rust helper layer
3. toolchain metadata that describes the correct sandbox-relative header search model for bindgen

## Non-Goals

This plan does **not** do the following as the final solution:

1. vendor generated bindings into the repo
2. patch upstream `build.rs` files to avoid bindgen
3. rely on host `/nix/store` paths inside recipe env vars or mounted metadata
4. solve only `xdg-desktop-portal-cosmic`
5. start by rebuilding full LLVM from source unless that becomes unavoidable after the smaller path is exhausted

## Current Cleanup Required

Before implementing the proper solution, remove the current experimental bindgen artifacts.

### Delete these files

1. `recipes/native/llvm/bindgen-llvm-source.ts`
2. `recipes/native/llvm/bindgen-llvm.ts`
3. `recipes/native/xdg-desktop-portal-cosmic/libspa-bindings.rs`
4. `recipes/native/xdg-desktop-portal-cosmic/pipewire-bindings.rs`
5. `recipes/native/xdg-desktop-portal-cosmic/pipewire-bindings.ts`

### Revert bindgen-specific edits in `recipes/helpers/cosmic.ts`

Remove only the experiment-specific changes:

1. `bindgenLlvmRecipe` import
2. bindgen-only `zstdRecipe` import if not otherwise needed
3. `dep("bindgen-llvm", ...)`
4. any bindgen-only extra dep additions
5. `/deps/bindgen-llvm/lib` additions to `LD_LIBRARY_PATH`
6. bindgen-only `/deps/zstd/lib` additions if they were added solely for `libclang`
7. `LIBCLANG_PATH`
8. `BINDGEN_EXTRA_CLANG_ARGS`
9. stale comments referring to pre-generated bindings or empty `build.rs` scripts

### Delete or ignore local temp artifacts

Do not commit or depend on any of these:

1. `/tmp/generate_bindings.rs`
2. `/tmp/gen-bindings/`
3. `/tmp/libspa-bindings.rs`
4. `/tmp/pipewire-bindings.rs`
5. any `/tmp/bindgen-out*` directories

## Design Constraints

The final design must satisfy all of the following:

1. `bindgen` runs inside the sandbox using only declared dependencies
2. `LIBCLANG_PATH` points at a mounted hod dependency such as `/deps/bindgen-clang/lib`
3. `BINDGEN_EXTRA_CLANG_ARGS` uses sandbox-relative paths only
4. the same sysroot/header model is shared between normal C compilation and bindgen
5. `bindgen-clang` is build-time only and does not become a runtime dep of final applications

## Reference Model: nixpkgs

nixpkgs handles this with a very small hook that exports:

1. `LIBCLANG_PATH`
2. `BINDGEN_EXTRA_CLANG_ARGS`

But the key detail is that nixpkgs computes the flags from compiler-wrapper metadata, not from hand-written package logic.

Relevant reference files:

1. `pkgs/build-support/rust/hooks/rust-bindgen-hook.sh`
2. `pkgs/development/tools/rust/bindgen/wrapper.sh`
3. `pkgs/by-name/xd/xdg-desktop-portal-cosmic/package.nix`

hod should copy the architecture of that solution, not the exact file layout.

## Proposed Architecture

### New reusable pieces

1. `recipes/native/llvm/bindgen-clang.ts`
2. bindgen support in `recipes/helpers/rust.ts`
3. toolchain metadata emitted by `recipes/toolchain/native-toolchain.ts`
4. dedicated bindgen smoke-test recipes

### Standard dependency names

Use these names consistently:

1. `toolchain`
2. `rust`
3. `bindgen-clang`

Do not invent package-local aliases for the general bindgen setup.

## Phase 1: Create A Tracking Plan And Clean The Branch

### Actions

1. remove the experiment files listed above
2. revert bindgen-specific edits in `recipes/helpers/cosmic.ts`
3. confirm `git status --short` only shows intended changes

### Validation

Run:

```bash
git status --short
git diff -- recipes/helpers/cosmic.ts
```

### Exit criteria

1. no generated binding files remain under `recipes/native/xdg-desktop-portal-cosmic/`
2. `recipes/helpers/cosmic.ts` no longer contains bindgen-specific env wiring

### Stop condition

If cleanup would overwrite or interfere with unrelated user changes, stop and isolate the cleanup more narrowly.

## Phase 2: Add Smoke Tests Before Touching COSMIC Again

Create small Rust recipes whose only purpose is validating bindgen inside the sandbox.

### Recommended location

Use one directory and keep all smoke tests together, for example:

1. `recipes/native/rust/tests/`

### Test 1: C stdlib bindgen

Create a recipe that:

1. builds a tiny Rust crate with `build.rs`
2. runs `bindgen` over a header that includes `stdint.h` or `stdlib.h`
3. includes the generated Rust bindings in the crate
4. succeeds in the sandbox

### Test 2: C++ stdlib bindgen

Create a recipe that:

1. runs `bindgen` in C++ mode
2. includes a header such as `<cmath>` or `<vector>`
3. proves the generic helper also supports C++ header search paths

### Test 3: external dep bindgen

Create a recipe that:

1. depends on `zlib`
2. runs `bindgen` over `zlib.h`
3. proves the generic setup works with a real external C dependency

### Validation

Each smoke test should be buildable directly with the usual pattern:

```bash
nix develop --accept-flake-config --command sh -lc 'export HOD_BIN="$PWD/target/debug/hod"; bun run recipes/native/rust/tests/<test>.ts'
nix develop --accept-flake-config --command sh -lc 'target/debug/hod build --hash <recipe-hash>'
```

### Exit criteria

1. all three smoke tests are present in the repo
2. they are the only validation targets used until generic bindgen is green

### Rule

Do **not** use `pipewire` or `xdg-desktop-portal-cosmic` as the first validation target.

## Phase 3: Add A Dedicated `bindgen-clang` Recipe

Create `recipes/native/llvm/bindgen-clang.ts`.

### Requirements

The recipe must provide:

1. `lib/libclang.so*`
2. `lib/clang/<version>/include`
3. the runtime `.so` closure needed to load `libclang.so` in the sandbox

### Version choice

Start with LLVM 18.

Reason:

1. `clang-sys 1.8.1` officially supports up to Clang 18
2. it is a lower-risk compatibility target than 21 or 22 for current Rust crates

### Hard constraints

1. prefer a source-built minimal `bindgen-clang`; do not treat prebuilt LLVM tarballs as the final implementation
2. do not emit host `/nix/store/...` paths into recipe env vars or generated metadata
3. do not make this a runtime dep of final GUI apps

If a prebuilt artifact is temporarily accepted for practical reasons, it must
still be hermetic in the Hod sense:

1. fetched from an explicit pinned URL
2. verified by a pinned content hash
3. packaged only from declared Hod deps and fetched sources
4. never copied from the host package manager or host filesystem
5. never allowed to resolve headers or libraries from the outside system

### Implementation guidance

The current upstream Ubuntu LLVM 18 prebuilt may still be kept temporarily as a
diagnostic artifact, but the production path should pivot to a source-built
minimal LLVM/Clang package.

Recommended source-build staging:

1. package `cmake` from source first
2. reuse existing `ninja`
3. fetch the LLVM monorepo source tarball explicitly
4. build only the smallest viable LLVM/Clang subset needed for bindgen

Current status of the pivot:

1. `cmake` is now packaged from source in-tree
2. `ninja` already exists in-tree
3. LLVM 18 monorepo source fetch is the next concrete source input
4. the current prebuilt `bindgen-clang` remains a temporary diagnostic artifact because real bindgen execution still crashes with `SIGSEGV`

Likely first-source-build configure shape for the next slice:

1. generator: `-G Ninja`
2. source dir: `llvm/`
3. build type: `-DCMAKE_BUILD_TYPE=Release`
4. install prefix: `-DCMAKE_INSTALL_PREFIX=/`
5. projects: `-DLLVM_ENABLE_PROJECTS=clang`
6. targets: `-DLLVM_TARGETS_TO_BUILD=X86`
7. shared LLVM dylib: `-DLLVM_BUILD_LLVM_DYLIB=ON`
8. disable tests/examples/docs/benchmarks/bindings where possible
9. prefer `-DLLVM_ENABLE_TERMINFO=OFF` to avoid the current `libtinfo` compatibility issue
10. keep zlib/zstd explicit and hermetic via declared Hod deps

### Validation

Add a direct sanity check recipe or shell validation that confirms, inside the sandbox:

1. `/deps/bindgen-clang/lib/libclang.so` loads
2. the clang resource dir exists
3. no missing shared library error occurs

Example validation script shape:

```bash
test -e /deps/bindgen-clang/lib/libclang.so
test -d /deps/bindgen-clang/lib/clang
```

If possible, also run a tiny program or command that forces `libclang` loading.

### Exit criteria

1. `bindgen-clang` can be mounted in the sandbox without missing library errors

### Stop condition

If `libclang.so` itself cannot load reliably, do not start changing Rust helpers yet.

## Phase 4: Teach The Toolchain To Emit Bindgen Metadata

Update `recipes/toolchain/native-toolchain.ts` so the assembled toolchain emits bindgen-oriented metadata files.

### Suggested location

Write files under:

1. `$OUT/share/hod/cc/cc-cflags`
2. `$OUT/share/hod/cc/libc-cflags`
3. `$OUT/share/hod/cc/libcxx-cxxflags`

### Purpose

These files should describe the sandbox-relative include/search model that bindgen must use.

They are hod's equivalent of nixpkgs' wrapper metadata.

### Required content

The metadata should include the equivalent of:

1. GCC internal include directories
2. GCC include-fixed directories
3. glibc sysroot include directory
4. libstdc++ include directories for C++ mode
5. any other required toolchain-local header flags

### Critical rule

The file contents must use paths valid inside the sandbox, such as:

1. `/deps/toolchain/...`

They must **not** use:

1. host `/nix/store/...`
2. host workspace paths

### Implementation guidance

Do not hardcode GCC versions in TypeScript if they can be discovered during toolchain assembly.

Preferred approach:

1. detect the GCC version directory under `$OUT/lib/gcc/x86_64-linux-gnu/`
2. detect the libstdc++ include version directory under `$OUT/include/c++/` if present
3. write metadata files from those discovered paths

### Validation

After building the toolchain recipe, inspect the metadata files and verify:

1. they exist
2. they contain only sandbox-relative paths
3. they point at directories that actually exist in the toolchain output

Commands to run:

```bash
nix develop --accept-flake-config --command cargo test --no-run
nix develop --accept-flake-config --command sh -lc 'export HOD_BIN="$PWD/target/debug/hod"; bun run recipes/toolchain/native-toolchain.ts'
```

Then inspect the built output paths and read the metadata files.

### Exit criteria

1. toolchain metadata exists and is sufficient to construct bindgen flags without package-local hardcoding

## Phase 5: Add Generic Bindgen Support To `recipes/helpers/rust.ts`

Add a reusable bindgen helper to the Rust helper layer.

### Preferred minimal shape

Use a small opt-in in `cargoBuild()`, for example:

1. `bindgen: true`

This is easier for future recipes than expecting every package to manually inject shell snippets.

### Helper responsibilities

The helper should, at build time, export:

1. `LIBCLANG_PATH=/deps/bindgen-clang/lib`
2. `BINDGEN_EXTRA_CLANG_ARGS=...`

### How to construct `BINDGEN_EXTRA_CLANG_ARGS`

Read and combine:

1. `/deps/toolchain/share/hod/cc/cc-cflags`
2. `/deps/toolchain/share/hod/cc/libc-cflags`
3. `/deps/toolchain/share/hod/cc/libcxx-cxxflags`
4. a bindgen-clang resource-dir flag based on the mounted `bindgen-clang` layout

### Important design rule

Do not keep bindgen logic in `recipes/helpers/cosmic.ts`.

This belongs in the generic Rust helper layer.

### Validation

1. unit-level validation by reading the generated script or env content if practical
2. real validation by rebuilding the smoke tests from Phase 2

### Exit criteria

1. `cargoBuild({ bindgen: true, ... })` is enough to make the smoke tests run bindgen successfully when the recipe includes the `bindgen-clang` dep

## Phase 6: Get The Smoke Tests Green

Only after Phases 3 through 5 are in place.

### Validation order

1. C stdlib bindgen test
2. C++ stdlib bindgen test
3. external zlib bindgen test

### Failure triage

Use this exact split:

1. missing shared libs from `libclang` means fix `bindgen-clang`
2. missing `stdint.h` / `stdlib.h` means fix toolchain or bindgen include flags
3. missing C++ headers means fix `libcxx-cxxflags`
4. missing external headers means inspect the test crate or dep include wiring

### Commands

Good default validation commands:

```bash
nix develop --accept-flake-config --command cargo test --no-run
nix develop --accept-flake-config --command cargo test -- --test-threads=1
```

Plus the per-recipe import/build commands for each smoke test.

### Exit criteria

1. all three smoke tests pass in the sandbox using the generic helper

### Rule

Do not move to COSMIC until all three smoke tests are green.

## Phase 7: Apply The Generic Solution To A Real Package

Once the smoke tests pass, apply the generic bindgen support to a real package.

### Suggested order

1. a simpler Rust package that uses bindgen, if one exists in the tree
2. `xdg-desktop-portal-cosmic`

### For `xdg-desktop-portal-cosmic`

The package should only need:

1. normal package deps
2. `bindgen-clang` via shared Rust or COSMIC infrastructure
3. generic bindgen helper enablement

It should **not** need:

1. vendored generated bindings
2. patched upstream `build.rs`
3. pre-build file replacement hacks

### Validation

Build it through the normal recipe flow:

```bash
nix develop --accept-flake-config --command sh -lc 'export HOD_BIN="$PWD/target/debug/hod"; bun run recipes/native/xdg-desktop-portal-cosmic/xdg-desktop-portal-cosmic.ts'
nix develop --accept-flake-config --command sh -lc 'target/debug/hod build --hash <recipe-hash>'
```

### Exit criteria

1. upstream `libspa-sys` and `pipewire-sys` build scripts run unchanged inside the sandbox
2. `xdg-desktop-portal-cosmic` builds successfully

## Phase 8: Remove Residual Package-Specific Workarounds

After a real package succeeds with the generic helper:

1. remove any leftover bindgen-specific logic from `recipes/helpers/cosmic.ts`
2. remove stale comments about pre-generated bindings or patched `build.rs`
3. check for other Rust recipes carrying ad hoc bindgen env logic and migrate them to the helper over time

### Validation

Run targeted greps:

```bash
rg -n "LIBCLANG_PATH|BINDGEN_EXTRA_CLANG_ARGS|bindgen-llvm|pre-generated bindings" recipes/
```

The remaining matches should be intentional infrastructure code or documentation.

## Phase 9: Documentation And Plan Updates

After the implementation is working, update:

1. `docs/build-environment-and-metadata.md`
2. `docs/recipe-compiler-guide.md`
3. `plans/cosmic-desktop-roadmap.md`
4. `plans/README.md`

### Documentation requirements

Document:

1. what dependency name to use for bindgen clang
2. how to opt in from `cargoBuild()`
3. what environment the helper exports
4. the debugging split between `libclang` load failures, sysroot/header failures, C++ header failures, and package-specific include failures

### Validation

Manually read the updated docs and ensure they distinguish:

1. current implemented behavior
2. future follow-up ideas

## Guardrails For Less Capable Models

Follow these rules strictly:

1. do not touch `xdg-desktop-portal-cosmic` again until the generic smoke tests pass
2. do not add or keep generated `.rs` bindings in the repo
3. do not patch upstream `build.rs` files as the final design
4. do not use host `/nix/store` paths in recipe env vars, helper output, or metadata files
5. do not retry LLVM 19, 21, or 22 experiments before the generic hook exists
6. do not start with a full LLVM source build
7. do not leave bindgen logic in `recipes/helpers/cosmic.ts`
8. do not change multiple layers at once without rerunning the smoke tests

## Validation Matrix

| Target | Purpose | Must prove |
|------|------|------|
| bindgen C stdlib smoke test | basic C headers | `libclang` loads and sees libc headers |
| bindgen C++ stdlib smoke test | C++ header mode | C++ include flags are correct |
| bindgen zlib smoke test | external dependency headers | package deps integrate with bindgen |
| `xdg-desktop-portal-cosmic` | real-world package | upstream bindgen users work unchanged |

## Definition Of Done

This work is complete when all of the following are true:

1. current bindgen experiment files are removed
2. `recipes/helpers/cosmic.ts` no longer carries bindgen hacks
3. hod has a reusable `bindgen-clang` build dependency
4. hod has reusable bindgen support in `recipes/helpers/rust.ts`
5. toolchain metadata exists for bindgen include/sysroot flags
6. the bindgen smoke-test matrix passes
7. `xdg-desktop-portal-cosmic` builds using upstream bindgen behavior
8. docs and plan files describe the new infrastructure clearly

## Recommended First Execution Slice

If only a small amount of work is being done in one pass, do exactly this:

1. remove the current bindgen experiment artifacts
2. add the bindgen smoke-test recipes
3. create `bindgen-clang`
4. extend `native-toolchain.ts` to emit bindgen metadata
5. add generic bindgen support to `recipes/helpers/rust.ts`
6. get the smoke tests green
7. only then return to `xdg-desktop-portal-cosmic`

That order minimizes the chance of getting lost in package-specific debugging.
