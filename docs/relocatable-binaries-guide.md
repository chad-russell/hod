# Relocatable Binaries in Hod

**Date:** 2026-05-03, updated 2026-05-04

Hod’s goal is to produce binaries that run regardless of where the store lives on disk. This guide explains how, why, and what the constraints are.

> Current status: the implemented `File.resources_hash` packed-output path in `src/packed.rs` only patches an existing ELF RPATH/RUNPATH to `$ORIGIN/../resources/lib/` and assembles `bin/binary` plus `resources/lib/`. AT_EXECFN bootstrap injection and store-relative relocation are design/prototype work, not current builder behavior. `src/relocate.rs` is not exported from `lib.rs` or wired into `build.rs` and references future `packed` APIs that are not currently present.

---

## 1. The Problem

Nix uses a fixed store root (`/nix/store/...`). Hod wants the store to live anywhere:

```text
/home/alice/.local/share/hod/...
/mnt/cache/hod/...
/opt/hod/...
```

and still allow copying closures between machines with different store roots. Runtime references must not depend on the absolute store path.

The portability goal is **store-portable**: you can move the entire hod store to another machine and everything works. You do not need to move individual binaries in isolation — the store is always there.

---

## 2. ELF Runtime Path Types

### 2.1 `PT_INTERP` — Dynamic Linker Path

Example: `/lib64/ld-linux-x86-64.so.2`

Read by the Linux kernel. Usually absolute, cannot use `$ORIGIN`, handled before glibc loads. If wrong, the process does not start. **This is the hardest ELF relocation problem.**

### 2.2 `DT_NEEDED` — Shared Library Names

Example: `libc.so.6`, `libstdc++.so.6`

Usually bare names resolved by the dynamic linker's search path.

### 2.3 `RPATH` / `RUNPATH` — Library Search Paths

Example: `$ORIGIN/../lib`

`$ORIGIN` expands to the directory containing the ELF binary. For `<store>/ab/bin/foo` referring to `<store>/cd/lib/libbar.so`, the RUNPATH `$ORIGIN/../../cd/lib` works at any store root.

### 2.4 Non-ELF Runtime Paths

Python sysconfig paths, GTK schemas, Rust sysroots, Firefox resources, etc. ELF patching doesn't solve these — Hod will need declarative runtime metadata eventually.

---

## 3. Packed Executable Design (Implemented Today)

A `File` recipe with `resources_hash` triggers the current packed-output pipeline. Output:

```text
<output>/
├── bin/
│   └── binary        # original file, with RUNPATH patched when possible
└── resources/
    └── lib/
        ├── libc.so.6
        └── ...
```

Current behavior in `src/packed.rs`:

1. Read the file blob from the store.
2. If it is an ELF file, try to patch an existing RPATH/RUNPATH in place to `$ORIGIN/../resources/lib/`.
3. Store the patched binary blob if patching succeeded.
4. Assemble a directory artifact containing `bin/binary` and `resources/lib`.

Important constraints:

- Hod does **not** currently add a new RUNPATH when one is absent.
- The existing RPATH/RUNPATH must be long enough for in-place replacement.
- This path does **not** currently solve `PT_INTERP`; the dynamic linker path remains whatever is in the ELF.
- There is no `PackedMode` enum in current `src/packed.rs`.

## 4. AT_EXECFN Bootstrap Design (Not Implemented)

The intended bootstrap design is still useful background, but it is not current implementation. The design is:

1. Convert `PT_INTERP` into a `PT_LOAD` containing bootstrap code.
2. Append bootstrap metadata, including the original entry point and a relative interpreter path.
3. Rewrite `e_entry` to point at the bootstrap.
4. At runtime, read `AT_EXECFN` to locate the executable, map the intended dynamic linker, patch aux-vector/program-header state, and jump to the linker.

The expected advantage is direct execution without a wrapper process, while avoiding a fixed absolute store path for `PT_INTERP`. This work depends on APIs such as `inject_bootstrap` that are referenced by prototype/tests but are not currently present in `src/packed.rs`.

---

## 5. Store-Relative Relocation (New Design)

**Status:** Design/prototype. `src/relocate.rs` sketches this pipeline, but it is not exported or called by the builder.

### 5.1 Motivation

The current "copy everything" approach (§3) bundles a copy of the glibc runtime into every packed output. This is wasteful — the same `libc.so.6` and `ld-linux-x86-64.so.2` already live in the store under the glibc output hash. When you have 100 binaries, you have 100 copies of glibc.

Since Hod's portability goal is **store-portable** (move the whole store, not individual binaries), we can reference dependencies by their store-relative paths instead of copying them.

### 5.2 Why ld-linux Must Be Different Per-Binary

`ld-linux` is part of glibc and tightly coupled to its exact version. Multiple ld-linux versions can coexist in the store:

- **glibc upgrades**: binary A linked against glibc 2.41, binary B against glibc 2.42 — each needs its own ld-linux.
- **Different libcs**: musl binaries use `/lib/ld-musl-x86_64.so.1`, glibc binaries use `/lib64/ld-linux-x86-64.so.2`.
- **Mixing versions**: an older package built against glibc 2.38, a newer against 2.41, both runnable from the same store.

Store-relative references naturally handle this: each binary's bootstrap points at *its* ld-linux wherever it lives in the store.

### 5.3 Store Layout

Hod stages outputs at:

```text
<store_root>/staging/<2-char-shard>/<64-char-hash>/contents...
```

For example:
```text
~/.local/share/hod/staging/b8/b885aa70.../bin/bash         (bash output)
~/.local/share/hod/staging/c4/c4e68bd3.../lib/ld-linux...   (glibc output)
~/.local/share/hod/staging/c4/c4e68bd3.../lib/libc.so.6     (glibc output)
```

A relative path from bash's `bin/` to glibc's `lib/`:
```text
../../c4/c4e68bd3.../lib
```

So the RUNPATH in bash would be:
```
$ORIGIN/../../c4/c4e68bd3.../lib
```

And the bootstrap's interp path (relative to the binary) would be:
```
../../c4/c4e68bd3.../lib/ld-linux-x86-64.so.2
```

### 5.4 The Key Challenge: Hash-Dependent Paths

The relative path from a binary to its dependencies depends on the **output hash** of the dependency, which is only known after building. This creates a two-phase problem:

1. **Build phase**: compile the binary with a long dummy RUNPATH (reserves space in the ELF for patching).
2. **Relocation phase**: after all dependency outputs are known, patch the RUNPATH and bootstrap interp path to the correct store-relative paths.

The current packed-output system already relies on reserving enough space in an existing RPATH/RUNPATH for in-place patching (dummy RUNPATH → `$ORIGIN/../resources/lib/`). Store-relative would change the target paths and make relocation part of the Process-output pipeline.

### 5.5 How It Works

#### Phase A: Build (unchanged)

The Process recipe compiles the binary with a long dummy RUNPATH:
```
-Wl,-rpath,/this/is/a/very/long/dummy/runpath/for/packing
```

This is the same as today. No changes needed at the recipe level.

#### Phase B: Relocate (new pipeline)

Instead of the current `File` recipe with `resources_hash` (which copies libs), we introduce a **relocation pass** that:

1. **Inspects the binary's ELF** — reads `DT_NEEDED` entries (e.g., `libc.so.6`, `libdl.so.2`).
2. **Resolves each needed library** — looks up which dependency output contains it (using the dep name → output hash mapping already available in the builder).
3. **Computes store-relative paths** — given the binary's output hash and each dependency's output hash, computes the relative path between them.
4. **Patches the ELF**:
   - Bootstrap interp path → relative path to ld-linux in the glibc output
   - RUNPATH → colon-separated list of `$ORIGIN/../../XX/<hash>/lib` entries (one per dependency that provides libs)
5. **No copying** — the output is just the patched binary. Libraries stay in their existing store locations.

#### Output Structure

```text
<store>/staging/b8/<bash-hash>/bin/bash    (bootstrap-injected, RUNPATH points into store)
```

No `lib/` directory. No copies. The binary references dependencies in-place.

#### RUNPATH Example

For bash with dependencies on glibc and gcc-stage1 (which provides libgcc_s.so etc.):

```
$ORIGIN/../../c4/c4e68bd3.../lib:$ORIGIN/../../03/0369de75.../lib
```

The dynamic linker searches each path in order, finding `libc.so.6` in the first and `libgcc_s.so.1` in the second.

### 5.6 Builder Integration: The `runtime_deps` Field

The relocation pass needs to know which dependency outputs to search for libraries. Today's `resources_hash` on `File` recipes points at a single "runtime bundle" output. For store-relative, we need a list.

**Option: Extend the Process recipe with a `runtime_deps` field** (or equivalent):

```json
{
  "type": "process",
  "runtime_deps": ["glibc", "gcc-stage1"],
  ...
}
```

This tells the builder: "after building, scan the binary's DT_NEEDED and resolve them against these dependency outputs, then patch RUNPATH with store-relative paths."

The `runtime_deps` list is a subset of the build `dependencies` — only the ones needed at runtime. The builder already has their output hashes from the build phase.

**Alternative: automatic detection.** The builder could scan all dependency outputs for `lib/` directories and include all of them in the RUNPATH. Simpler for recipe authors but potentially over-includes. Could start with this and add explicit `runtime_deps` later for precision.

### 5.7 Bootstrap Interp Path

The bootstrap stub needs the relative path to `ld-linux-x86-64.so.2`. This is computed from:
- Binary location: `<store>/staging/<shard>/<binary-hash>/bin/<name>`
- ld-linux location: `<store>/staging/<shard>/<glibc-hash>/lib/ld-linux-x86-64.so.2`

Relative path: `../../<glibc-shard>/<glibc-hash>/lib/ld-linux-x86-64.so.2`

This is passed to the bootstrap as metadata (the same mechanism as today's `../lib/ld-linux-x86-64.so.2`, just a longer relative path).

### 5.8 Transition Plan

The transition from "copy everything" to "store-relative" is incremental:

1. **Keep the existing `File` + `resources_hash` pipeline** working.
2. **Implement/export the missing ELF bootstrap APIs** or choose another `PT_INTERP` strategy.
3. **Wire store-relative relocation into `build.rs`** after Process output capture/staging.
4. **Make `runtime_deps` semantically real** — it currently exists in JSON/TS but is not encoded into `.hod` bytes and is not used by the builder.
5. **Migrate recipes incrementally** — bash, coreutils, etc. are candidate consumers once the builder path exists.

Longer term, the evaluator can automate this: when producing a Process recipe for a dynamically linked binary, it automatically adds `runtime_deps` and the dummy RUNPATH LDFLAGS.

---

## 6. glibc Version Requirement for the Bootstrap Design

The AT_EXECFN bootstrap design requires **glibc ≥ 2.41** in the bundled runtime. This is not relevant to the current RPATH-only `File.resources_hash` implementation except as context for future bootstrap work.

### Why

The bootstrap modifies the binary's program headers (converting `PT_INTERP` to `PT_LOAD`, appending a new `PT_INTERP`). The glibc dynamic linker re-processes these modified phdrs during its `_dl_start` self-relocation phase.

In glibc ≤ 2.40, the dynamic linker crashes when processing the bootstrap's modified phdr table — it dereferences corrupted pointers during RELATIVE relocation processing. The crash occurs regardless of:
- PIE vs non-PIE application binary
- Application segment alignment (4 KiB vs 2 MiB)
- Whether upstream onelf or Hod's port is used
- How the interpreter is mapped (simple vs kernel-like mapper)

In glibc ≥ 2.41, the dynamic linker handles the modified phdrs correctly.

### How this was determined

A systematic cross-combination test matrix isolated the crash to the ld-linux version specifically:

| ld-linux version | Bootstrap works? |
|------------------|-----------------|
| Host glibc 2.42 | ✅ |
| Host glibc 2.41 | ✅ |
| Host glibc 2.40 | ❌ |
| Hod glibc 2.38 | ❌ |

Cross-testing with both host-built and Hod-built application binaries confirmed the application ELF layout is irrelevant — only the bundled ld-linux matters.

### Version choice

The hermetic toolchain now builds **glibc 2.41** (upgraded from 2.38). Version 2.41 was chosen over 2.42 because the seed toolchain (gcc 11.2.1, binutils 2.37) cannot satisfy glibc 2.42's build requirements (gcc ≥ 12.1, binutils ≥ 2.39). glibc 2.41 only requires gcc ≥ 6.2 and binutils ≥ 2.26.

---

## 7. Long-Term Relocation Architecture

### Layer 1: Hermetic builds
Builds run in hermetic sandboxes with declared dependencies only. Already Hod's core model. ✅

### Layer 2: Store-relative RUNPATH
Outputs use `$ORIGIN`-relative RUNPATH entries pointing at other store outputs. No copying of shared libraries. Dependencies live exactly once in the store. **Prototype/design only.**

### Layer 3: Bootstrap for PT_INTERP
AT_EXECFN bootstrap injection is the preferred design for the kernel's absolute `PT_INTERP` requirement without a fixed store root. **Not implemented in current `src/packed.rs`.**

### Layer 4: Automatic relocation in the builder
Target behavior: when a Process recipe declares `runtime_deps`, the builder automatically:
- Compiles with a long dummy RUNPATH (recipe or evaluator provides the LDFLAGS)
- After building, resolves DT_NEEDED against runtime_dep outputs
- Patches RUNPATH with store-relative paths
- Injects bootstrap with store-relative ld-linux path
- **No separate File recipe needed** — relocation is part of the Process build

This would eliminate the current manual two-step (compile → File recipe → packed output). Current `build.rs` does not do this yet.

### Layer 5: Evaluator automation
When Hod has an evaluator, it can automatically:
- Detect that a recipe produces dynamically linked binaries
- Add the dummy RUNPATH LDFLAGS automatically
- Infer `runtime_deps` from link-time dependencies
- The user writes `build_relocatable_binary("bash", deps=[...])` and gets a store-relative relocatable binary

### Layer 6: Runtime metadata and wrappers
For non-ELF paths (Python, Rust, GTK, etc.), Hod will need declarative runtime metadata:

```json
{
  "runtime": {
    "env": {
      "XDG_DATA_DIRS": ["self:share", "dep:gtk/share"],
      "GI_TYPELIB_PATH": ["dep:gobject-introspection/lib/girepository-1.0"],
      "SSL_CERT_FILE": ["dep:cacert/etc/ssl/certs/ca-bundle.crt"]
    }
  }
}
```

---

## 8. Alternative Execution Strategies

### Canonical virtual store path

`/hod/store → /actual/location`. Extremely robust, closest to Nix's model, but reintroduces a fixed absolute path. Useful emergency escape hatch. **Rejected as primary approach** — eliminating the fixed store root is a core Hod design goal.

### Canonical symlink for ld-linux

`/etc/hod-ld-linux → store-path/lib/ld-linux`. One-time setup per machine. Avoids bootstrap injection entirely (PT_INTERP=/etc/hod-ld-linux works everywhere). Simple but requires setup and doesn't support multiple glibc versions. **Available as fallback** but bootstrap injection is preferred.

### Runtime namespace / overlay

`hod run` creates an FHS-like namespace with `/lib`, `/usr`, `/etc`. Useful for GUI/browser stacks as a fallback, not core foundation.

---

## 9. Test Coverage

The future AT_EXECFN bootstrap needs testing across:
- PIE and non-PIE executables
- C and C++ binaries (libstdc++, libgcc_s)
- Binaries with sibling shared libraries
- TLS, dlopen, stripped binaries
- Binaries with and without existing RUNPATH
- Other architectures if Hod supports them

Current caveat: `tests/at_execfn_validation.rs` references bootstrap APIs that are not present in current `src/packed.rs`, so the test target does not currently compile. Treat the bootstrap test matrix below as desired coverage after the implementation is restored.

Store-relative additionally needs:
- Multi-dependency RUNPATH (binary depending on libs from multiple store outputs)
- Long hash paths (64-char directory names don't break RUNPATH length limits)
- Moving the store to a different root and verifying binaries still run
