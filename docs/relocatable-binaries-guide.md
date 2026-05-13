# Relocatable Binaries in Hod

**Date:** 2026-05-03, updated 2026-05-04

Hod’s goal is to produce binaries that run regardless of where the store lives on disk. This guide explains how, why, and what the constraints are.

> Current status: `File.resources_hash` packed outputs use the restored AT_EXECFN bootstrap path when possible, patch RUNPATH/RPATH to `$ORIGIN/../lib`, and assemble `bin/binary` plus `lib/`. Process recipes with encoded `runtime_deps` run the store-relative relocation pass in `src/relocate.rs` after output staging, patch RUNPATH into the store, and inject the bootstrap for executable ELFs so they work both from the host store and inside sandboxes.

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
└── lib/
    ├── libc.so.6
    └── ...
```

Current behavior in `src/packed.rs`:

1. Read the file blob from the store.
2. If it is a supported dynamic ELF, inject the AT_EXECFN bootstrap using `../lib/ld-linux-x86-64.so.2`.
3. Patch an existing RPATH/RUNPATH in place to `$ORIGIN/../lib` when possible.
4. Store the patched binary blob and assemble `bin/binary` plus `lib/`.

Important constraints:

- Hod does **not** currently add a new RUNPATH when one is absent.
- The existing RPATH/RUNPATH must be long enough for in-place replacement.
- AT_EXECFN bootstrap injection is currently implemented for x86_64 ELF binaries; unsupported/static binaries fall back to RUNPATH-only behavior.
- `PackedMode` exists in `src/packed.rs`; bootstrap mode is the default, with launcher mode retained as fallback code.

## 4. AT_EXECFN Bootstrap Design (Implemented for x86_64)

The implemented bootstrap design is:

1. Convert `PT_INTERP` into a `PT_LOAD` containing bootstrap code.
2. Append bootstrap metadata, including the original entry point and a relative interpreter path.
3. Rewrite `e_entry` to point at the bootstrap.
4. At runtime, read `AT_EXECFN` to locate the executable, map the intended dynamic linker, patch aux-vector/program-header state, and jump to the linker.

The advantage is direct execution without a wrapper process, while avoiding a fixed absolute store path for `PT_INTERP`. The core APIs are `parse_interp`, `patch_runpath_to`, and `inject_bootstrap` in `src/packed.rs`.

---

## 5. Store-Relative Relocation (New Design)

**Status:** Implemented and in production. `src/relocate.rs` is exported and called by the Process builder when `runtime_deps` is present in the decoded recipe. See `docs/relocation-redesign.md` for full design details.

### 5.0.1 New PT_LOAD Segment Strategy for RUNPATH/PT_INTERP Patching

When the new RUNPATH is longer than the dummy RUNPATH slot (580 characters),
the relocation pass cannot patch in-place. For executables and shared
libraries with many runtime dependencies (e.g., GTK3 with 37 deps needs
~3300 characters), a **new PT_LOAD segment** strategy is used instead.

The strategy is implemented in `patch_elf_with_new_segment()` in
`src/packed.rs`, which proceeds in eight phases:

**Phase 1 — Parse.** Parse the ELF and extract all needed metadata
(highest `PT_LOAD` vaddr, `PT_INTERP` phdr offset, dynamic section entries
for `DT_STRTAB`/`DT_STRSZ`/`DT_RUNPATH`, old dynstr content range,
`.dynstr` section header offset).

**Phase 2 — Build new segment content.** Copy the old dynstr content into
a buffer, append the new RUNPATH string (NUL-terminated), optionally
append the new interp path (if `PT_INTERP` is being patched), and pad
to 8-byte alignment.

**Phase 3 — Find a program header slot.** Acquire a `PT_LOAD` slot by
repurposing `PT_GNU_STACK` (purely advisory, zero content) or by filling
a zero-padded gap after the phdr table. If neither is available, the
patching fails — a "shift-file" fallback is deferred for future
implementation.

**Phase 4 — Compute new segment location.** Place the new segment at
a virtual address beyond all existing segments (including BSS), aligned
to the page size (4096 bytes). Append the segment content to the end of
the file.

**Phase 5 — Write the `PT_LOAD` phdr entry.** Overwrite the acquired
slot with a `PT_LOAD` entry pointing at the new file offset, virtual
address, and content size.

**Phase 6 — Update dynamic section.** Update `DT_STRTAB` to point at
the new dynstr location, `DT_STRSZ` to reflect the new dynstr size,
and `DT_RUNPATH` to point at the offset of the new RUNPATH within
the new dynstr. Null out the old RUNPATH string in the original dynstr.

**Phase 7 — Update PT_INTERP.** If the ELF has `PT_INTERP` (executables),
update its phdr to point at the new interp string within the new segment.
Shared libraries (no `PT_INTERP`) skip this phase.

**Phase 8 — Update `.dynstr` section header.** This is **critical** for
downstream linking. GNU `ld` validates string offsets against the `.dynstr`
section header's `sh_size`. If the section header still points to the old
(now-truncated) dynstr, downstream linkers reject the library with
`invalid string offset N >= N`. Phase 8 updates `sh_addr`, `sh_offset`,
and `sh_size` to match the new segment.

**Why Phase 8 matters.** Without updating the section header, the linker
sees the old dynstr (with the RUNPATH nulled out) and validates all
`DT_NEEDED`/`DT_RUNPATH` string offsets against the old `sh_size`.
Strings in the *new* dynstr have offsets that exceed the old `sh_size`,
causing link failures. The `.dynstr` section is identified by finding
the first `SHT_STRTAB` (type 3) section in the section header table —
no matching against `sh_addr` is needed, since `DT_STRTAB` may already
point to a different address from a prior patching pass.

This new-segment strategy replaced the old append-extension approach
that corrupted BSS in large binaries like `librustc_driver.so` (83 MB
BSS).

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

The current packed-output system already relies on reserving enough space in an existing RPATH/RUNPATH for in-place patching (dummy RUNPATH → `$ORIGIN/../lib`). Store-relative uses the same in-place patching mechanism with paths into sibling store outputs.

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

1. **Keep the existing `File` + `resources_hash` pipeline** working. ✅
2. **Use the restored ELF bootstrap APIs** for packed outputs and store-relative relocation. ✅
3. **Run store-relative relocation from `build.rs`** after Process output capture/staging. ✅
4. **Use encoded `runtime_deps`** to select which dependency outputs provide runtime libraries. ✅
5. **New PT_LOAD segment strategy** for prebuilt binaries with short RUNPATHs/BSS. ✅
6. **Bootstrap-backed Process relocation** — Process outputs patch RUNPATH into the store and inject the bootstrap for executable ELFs. ✅
7. **Sandbox closure mounting** — dependency closures are mounted at canonical store-shaped paths so relocated tools run via `/deps/<name>` aliases too. ✅
8. **Rust toolchain support** — prebuilt Rust binaries relocated and working in sandbox. ✅
9. **`cargoBuild` SDK helper** — builds Rust packages using the relocated toolchain. ✅
10. **ripgrep proof-of-concept** — real Rust package built via `cargoBuild`. ✅

---

## 6. glibc Version Requirement for the Bootstrap Design

The AT_EXECFN bootstrap design requires **glibc ≥ 2.41** in the bundled runtime.

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
Outputs use `$ORIGIN`-relative RUNPATH entries pointing at other store outputs. No copying of shared libraries. Dependencies live exactly once in the store. **Implemented prototype via `runtime_deps`.**

### Layer 3: Bootstrap for PT_INTERP
AT_EXECFN bootstrap injection is the preferred design for the kernel's absolute `PT_INTERP` requirement without a fixed store root. **Implemented for x86_64 in `src/packed.rs` and used by both packed outputs and relocated Process executables.**

### Layer 4: Automatic relocation in the builder
Current behavior: when a Process recipe declares `runtime_deps`, the builder automatically:
- Compiles with a long dummy RUNPATH (recipe or evaluator provides the LDFLAGS)
- After building, resolves DT_NEEDED against runtime_dep outputs
- Patches RUNPATH with store-relative paths
- Injects the AT_EXECFN bootstrap for executable ELFs using a store-relative ld-linux path
- **No separate File recipe needed** — relocation is part of the Process build

The sandbox mounts dependency closures at canonical store-shaped paths (`/<shard>/<hash>/`, with `/store/...` and `/deps/<name>/` aliases) so these relocated Process outputs can also be executed as build tools inside the sandbox.

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

### Existing coverage

The AT_EXECFN bootstrap needs testing across:
- PIE and non-PIE executables
- C and C++ binaries (libstdc++, libgcc_s)
- Binaries with sibling shared libraries
- TLS, dlopen, stripped binaries
- Binaries with and without existing RUNPATH
- Other architectures if Hod supports them

Current caveat: `tests/at_execfn_validation.rs` is intentionally ignored by
default because it builds the heavyweight GCC/glibc chain, but it now
compiles against the restored bootstrap APIs.

Store-relative additionally needs:
- Multi-dependency RUNPATH (binary depending on libs from multiple store outputs)
- Long hash paths (64-char directory names don't break RUNPATH length limits)
- Moving the store to a different root and verifying binaries still run

### Known test gap: new-segment patching + downstream linking

A specific critical path is not yet covered by tests: a shared library with
many `runtime_deps` (so its RUNPATH overflows the 580-char dummy slot and
triggers the new-PT_LOAD-segment strategy), consumed by a *downstream build*
that uses the host toolchain's `ld` to link against it. This is the scenario
that revealed both the missing section-header update (Phase 8) and the
`dynstr_shdr_offset` matching bug. A regression test for this path should:

1. Build a library recipe with 15+ `runtime_deps` (to overflow the dummy RUNPATH).
2. Build a second recipe that links a binary against that library using the
   toolchain's `ld`.
3. Verify the binary links successfully and runs.
4. Verify that `readelf -S` on the library shows `.dynstr` pointing at the
   same vaddr as `DT_STRTAB`.
