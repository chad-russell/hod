//! ELF relocation utilities.
//!
//! These constants support the store-relative relocation pass in src/relocate.rs.
//! The long dummy RUNPATH reserves space in the ELF for in-place patching after
//! the build completes.

/** Path string that reserves ELF space for store-relative relocation.
 *
 * Must be long enough for the relocation pass to overwrite in-place with
 * $ORIGIN-relative paths to all runtime dependency outputs.  Currently
 * supports ~6 runtime deps at ~88 chars each plus a self-referencing
 * $ORIGIN/../lib path.
 *
 * Do not change this without coordinating with src/packed.rs and
 * src/relocate.rs — the relocation pass does in-place RUNPATH replacement
 * and needs the slot to be long enough for the computed paths.
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
