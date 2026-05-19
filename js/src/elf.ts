//! ELF relocation utilities.
//!
//! These constants support the store-relative relocation pass in src/relocate.rs.
//! The long dummy RUNPATH reserves space in the ELF for in-place patching after
//! the build completes.

/** Path string that reserves ELF space for store-relative relocation.
 *
 * The relocation pass first tries to overwrite the dummy RUNPATH in-place.
 * If the final RUNPATH (computed from runtime_deps) is longer than the
 * dummy, the pass automatically falls back to the new PT_LOAD segment
 * strategy (see patch_elf_with_new_segment in src/packed.rs), which has
 * no upper limit on RUNPATH length.
 *
 * The current length supports in-place patching for ~6 runtime deps.
 * This covers most packages; heavier recipes (e.g., nautilus with 69 deps)
 * transparently use the new-segment fallback.
 *
 * Do not change this without coordinating with src/packed.rs and
 * src/relocate.rs.
 */
export const HOD_DUMMY_RUNPATH =
  "/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" +
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" +
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" +
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" +
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" +
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" +
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/" +
  "dummy";

/** Linker flag that injects the dummy RUNPATH.  Use in LDFLAGS or build-system
 * equivalent to reserve ELF space for the relocation pass. */
export const HOD_DUMMY_RPATH_FLAG = `-Wl,-rpath,${HOD_DUMMY_RUNPATH}`;
