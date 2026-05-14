# Plan: Merge RUNPATH + Bootstrap Into Single PT_LOAD Segment

**Status:** Implemented; historical design note  
**Current authority:** `src/packed.rs`, `src/relocate.rs`, `docs/relocatable-binaries-guide.md`

## Motivation

Currently, when a binary has both a RUNPATH overflow (new RUNPATH longer
than the 580-char dummy slot) *and* a `PT_INTERP` that needs the AT_EXECFN
bootstrap, the relocation pass creates **two** new `PT_LOAD` segments:

1. **Step 7** calls `patch_elf_with_new_segment(data, runpath, None)`,
   which creates one new `PT_LOAD` for the updated `.dynstr` with the
   long RUNPATH.

2. **Step 8** calls `inject_bootstrap(data, interp)`, which replaces
   `PT_INTERP` with another `PT_LOAD` for the bootstrap code.

This consumes **two program header slots**. If the ELF has no
`PT_GNU_STACK` to repurpose and no gap in the phdr table, **Step 7
fails silently** and falls back to in-place patching — which truncates
the RUNPATH to 580 characters. The bootstrap injection still works
(Step 8 gets a slot from `PT_INTERP` itself), but the RUNPATH is
missing most dependency paths.

The fix: handle both in a single `patch_elf_with_new_segment()` call,
using one phdr slot for both the new dynstr and the new interp path.

## Current Flow (two segments)

```text
relocate_single_elf():
  runpath = build_full_runpath(all_runtime_deps)  // may be 3000+ chars
  interp  = build_interp_path(ld_linux_dep)

  // Step 7: patch RUNPATH only
  patch_elf_for_relocation(&mut data, runpath, None)
    └── patch_elf_with_new_segment(data, runpath, None)
        ├── Phase 3: find_phdr_slot()  →  uses one slot
        ├── Phase 6: update DT_STRTAB, DT_STRSZ, DT_RUNPATH
        └── Phase 7: skip (no interp)

  // Step 8: inject bootstrap
  inject_bootstrap(data, interp)
    └── replaces PT_INTERP → another PT_LOAD slot

  // Total: 2 phdr slots used
```

## Proposed Flow (single segment)

```text
relocate_single_elf():
  runpath = build_full_runpath(all_runtime_deps)
  interp  = build_interp_path(ld_linux_dep)

  // Combined patching: RUNPATH + interp in one new segment
  patch_elf_for_relocation(&mut data, runpath, Some(interp))
    └── patch_elf_with_new_segment(data, runpath, Some(interp))
        ├── Phase 2: append both new RUNPATH AND new interp to segment content
        ├── Phase 3: find_phdr_slot()  →  uses ONE slot total
        ├── Phase 6: update DT_STRTAB, DT_STRSZ, DT_RUNPATH
        ├── Phase 7: update PT_INTERP phdr  →  points into new segment
        └── Phase 8: update .dynstr section header

  // inject_bootstrap() detects that PT_INTERP already points
  // into a new segment and skips its own segment creation
```

The key change in `inject_bootstrap`: when it detects the current
`PT_INTERP` offset is beyond the original file bounds (i.e., already
patched into a new segment), it skips the PT_LOAD creation and only
injects the bootstrap code blob. The interp path is already in the
segment created by `patch_elf_with_new_segment`.

## Code Changes

### `src/relocate.rs` — `relocate_single_elf()`

```rust
// Before:
match patch_elf_for_relocation(&mut data, runpath.as_bytes(), None) { ... }
if let Some(interp) = new_interp.as_deref() {
    match inject_bootstrap(&mut data, interp) { ... }
}

// After:
let interp_arg = new_interp.as_deref();
match patch_elf_for_relocation(&mut data, runpath.as_bytes(), interp_arg) { ... }
// inject_bootstrap is either handled inline by patch_elf_with_new_segment
// OR the bootstrap still runs with a flag saying "interp already relocated"
```

### `src/packed.rs` — `inject_bootstrap()`

Add a mode where `inject_bootstrap` still injects the bootstrap code blob
and rewrites `e_entry`, but skips replacing `PT_INTERP` with `PT_LOAD`
because the interp string is already in the new segment. Detection:

```rust
// Parse current PT_INTERP - if its p_offset is past the original
// file bounds (i.e., it already points into a new segment), just
// inject the bootstrap code and update e_entry.
let interp_phdr = elf.program_headers.iter()
    .find(|p| p.p_type == PT_INTERP)?;
let original_eof = /* snapshot before patching */;
if interp_phdr.p_offset > original_eof {
    // Interp already in new segment — just inject bootstrap code
    inject_bootstrap_code_only(data, rel_interp)?;
    return Ok(true);
}
// Otherwise, do the full PT_INTERP → PT_LOAD conversion as before
```

### `src/packed.rs` — `patch_elf_with_new_segment()`

Already supports `new_interp: Option<&[u8]>`. No changes needed — the
function already appends the interp path to the segment content in Phase 2
and updates `PT_INTERP` in Phase 7. The only missing piece is making
`inject_bootstrap` aware that it's already been handled.

## Risk Assessment

**What could go wrong:**

1. **Single phdr slot for both, but the content is larger.** Each `PT_LOAD`
   entry is 56 bytes. The combined segment has both dynstr + interp content,
   but that's still just one entry in the phdr table — same as before.

2. **Bootstrap code needs interp path, not just the phdr entry.**
   `inject_bootstrap` reads the interp path and embeds it in its metadata
   blob. If the interp is already in the new segment, the bootstrap just
   needs to read the same path — no change needed.

3. **Edge case: non-x86_64.** `inject_bootstrap` already returns
   `UnsupportedArch` for non-x86_64. Fallback to launcher mode.
   `patch_elf_with_new_segment` works regardless of arch.

4. **Section headers after bootstrap.** `inject_bootstrap` also modifies
   the ELF (rewrites `e_entry`, adds a bootstrap code PT_LOAD). After the
   merge, these modifications happen *after* the section header update in
   Phase 8. The bootstrap PT_LOAD and `e_entry` changes don't affect
   `.dynstr`, so no conflict.

## Testing Plan

### Unit tests (in `tests/packed_executables.rs`)

1. **Combined RUNPATH + interp patch.**
   - Take a test ELF with `PT_INTERP` and a short RUNPATH.
   - Call `patch_elf_with_new_segment(data, long_runpath, Some(interp))`.
   - Verify: single new PT_LOAD, DT_STRTAB updated, PT_INTERP updated,
     `.dynstr` section header matches DT_STRTAB.
   - Verify the ELF still passes `readelf` validation.

2. **Single segment for RUNPATH-only (libraries).**
   - Test with `new_interp = None` (shared library path).
   - Verify: RUNPATH updated, no PT_INTERP change, section header matches.
   - Verify downstream `ld` can link against the patched library.

3. **No phdr slot available.**
   - Test with an ELF that has no PT_GNU_STACK and no gap.
   - Verify: falls back with an appropriate error (not silent truncation).

### Integration test (in `tests/`)

4. **End-to-end: library with many deps → binary links against it.**
   - Create a recipe that builds a shared library with 15+ `runtime_deps`.
   - Create a recipe that builds a binary linking against that library.
   - Build both, verify the binary runs.
   - Verify `readelf -S lib | grep dynstr` shows matching vaddr with
     `readelf -d lib | grep STRTAB`.

### Rollback plan

If the merged approach introduces regressions:

1. **Keep the merged path gated behind a flag.** Add a
   `--combined-relocation` flag to `patch_elf_for_relocation()`. Default
   to the two-segment approach. After validation, make the merged path
   the default.

2. **Keep `inject_bootstrap` unchanged.** Add a helper
   `inject_bootstrap_after_relocation(data, interp, already_relocated: bool)`.
   When `already_relocated = true`, skip the PT_LOAD creation. When
   `false`, do the full conversion as before. Rollback means calling with
   `false`.

3. **Existing behavior preserved for `File.resources_hash` packed outputs.**
   Those use `patch_runpath_in_place` (not the new-segment path) and
   `inject_bootstrap` directly — unaffected by the merge.

## Files Changed

| File | Change |
|------|--------|
| `src/relocate.rs` | Pass `new_interp` to `patch_elf_for_relocation` instead of `None` |
| `src/packed.rs` | Add `already_relocated` flag to `inject_bootstrap`; skip PT_LOAD creation when set |
| `tests/packed_executables.rs` | Add combined-patching tests |
| `docs/relocatable-binaries-guide.md` | Update to reflect single-segment approach |

## Estimate

~100 lines of Rust, mostly in `packed.rs`. The integration test is the
heaviest part since it needs a multi-dep recipe chain.
