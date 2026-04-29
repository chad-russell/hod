//! Packed executables — ELF RPATH patching for relocatable binary outputs.
//!
//! When building a `File` recipe that has `has_resources = 0x01`, the builder
//! produces a "packed" output: the binary gets its ELF `RPATH`/`RUNPATH`
//! patched to a relative path (`$ORIGIN/../resources/lib/`), and the final
//! output is a directory structure:
//!
//! ```text
//! <output>/
//! ├── bin/
//! │   └── <binary>      (ELF with relative RPATH)
//! └── resources/
//!     └── lib/
//!         ├── libc.so.6
//!         └── ...
//! ```
//!
//! This makes outputs fully relocatable — move the directory anywhere and it
//! still works, because the dynamic linker resolves shared libraries relative
//! to the binary's own location.
//!
//! # ELF RPATH patching
//!
//! We use [goblin](https://docs.rs/goblin) to parse ELF headers, program
//! headers, and the dynamic section. This gives us the string table index for
//! the existing `DT_RPATH` or `DT_RUNPATH` entry. We then convert the virtual
//! address of the dynamic string table to a file offset (via `PT_LOAD`
//! segments) so we can patch the string in-place without rewriting the binary.
//!
//! See PRD §7 for the full design.

use std::io::{Read, Seek, SeekFrom, Write};
use std::path::Path;

use goblin::elf::{dynamic, header, program_header, Elf};

use crate::build::{Artifact, BuildError, Result};
use crate::hash::Hash;
use crate::store::Store;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// The target RPATH we patch into ELF binaries.
///
/// `$ORIGIN` resolves to the directory containing the ELF binary at runtime.
/// Since the binary lives at `<output>/bin/<name>`, `$ORIGIN/../resources/lib/`
/// resolves to `<output>/resources/lib/`.
const TARGET_RPATH: &[u8] = b"$ORIGIN/../resources/lib/";

// ---------------------------------------------------------------------------
// ELF RPATH patching
// ---------------------------------------------------------------------------

/// Error type for packed executable operations.
#[derive(Debug)]
pub enum PackedError {
    /// The binary is not a valid ELF file.
    NotElf(String),
    /// The ELF file has no dynamic section (statically linked).
    NoDynamicSection,
    /// The RPATH/RUNPATH string is too short to be patched in-place.
    RpathTooShort {
        tag: String,
        existing_len: usize,
        needed_len: usize,
    },
    /// An IO error occurred.
    Io(std::io::Error),
}

impl std::fmt::Display for PackedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotElf(msg) => write!(f, "not a valid ELF file: {msg}"),
            Self::NoDynamicSection => write!(f, "ELF has no dynamic section (statically linked)"),
            Self::RpathTooShort {
                tag,
                existing_len,
                needed_len,
            } => write!(
                f,
                "existing {tag} is {existing_len} bytes, need at least {needed_len} bytes for new value"
            ),
            Self::Io(e) => write!(f, "IO error: {e}"),
        }
    }
}

impl std::error::Error for PackedError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for PackedError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

/// The result of examining an ELF binary's RPATH/RUNPATH state.
#[derive(Debug, Clone)]
pub enum RpathInfo {
    /// No RPATH or RUNPATH was found — needs a new one added.
    Absent,
    /// RPATH was found at the given offset in the file.
    Rpath {
        /// Byte offset in the file where the RPATH string starts.
        offset: u64,
        /// Length of the existing RPATH string (including null terminator).
        len: usize,
    },
    /// RUNPATH was found at the given offset in the file.
    Runpath {
        /// Byte offset in the file where the RUNPATH string starts.
        offset: u64,
        /// Length of the existing RUNPATH string (including null terminator).
        len: usize,
    },
}

/// Find RPATH or RUNPATH in an ELF binary's dynamic section.
///
/// Returns information about the first RPATH or RUNPATH entry found
/// (preferring RPATH if both exist), or `Absent` if neither is present.
///
/// Returns `Err` if the file is not a valid ELF or has no dynamic section.
pub fn find_rpath(data: &[u8]) -> std::result::Result<RpathInfo, PackedError> {
    let elf = Elf::parse(data).map_err(|e| PackedError::NotElf(e.to_string()))?;

    let dynamic = match elf.dynamic {
        Some(ref d) => d,
        None => return Err(PackedError::NoDynamicSection),
    };

    // Find the first DT_RPATH or DT_RUNPATH entry, preferring RPATH.
    let mut rpath_entry = None;
    let mut runpath_entry = None;

    for entry in &dynamic.dyns {
        match entry.d_tag as u64 {
            dynamic::DT_RPATH => rpath_entry = Some(entry),
            dynamic::DT_RUNPATH => runpath_entry = Some(entry),
            _ => {}
        }
    }

    // Prefer RPATH over RUNPATH (RPATH takes precedence at runtime)
    let chosen = rpath_entry.or(runpath_entry);
    let chosen = match chosen {
        Some(e) => e,
        None => return Ok(RpathInfo::Absent),
    };

    let is_rpath = rpath_entry.is_some();

    // Get the string table's virtual address from DynamicInfo
    let strtab_vaddr = dynamic.info.strtab;
    if strtab_vaddr == 0 {
        return Ok(RpathInfo::Absent);
    }

    // Convert the string table virtual address to a file offset,
    // then add the string index from the dynamic entry to get the
    // absolute file offset of the RPATH/RUNPATH string.
    let strtab_file_offset = vaddr_to_file_offset(&elf, strtab_vaddr as u64, data)?;
    let str_idx = chosen.d_val as u64;
    let string_offset = strtab_file_offset + str_idx;

    let len = null_terminated_len(data, string_offset as usize)?;

    Ok(if is_rpath {
        RpathInfo::Rpath {
            offset: string_offset,
            len,
        }
    } else {
        RpathInfo::Runpath {
            offset: string_offset,
            len,
        }
    })
}

/// Convert a virtual address to a file offset using PT_LOAD program headers.
///
/// The ELF dynamic section stores virtual addresses (VAs), but we need file
/// offsets to read/write the actual bytes. Each `PT_LOAD` segment maps a
/// range of VAs to a range of file offsets: `file_offset = p_offset + (va - p_vaddr)`.
fn vaddr_to_file_offset(
    elf: &Elf,
    vaddr: u64,
    _data: &[u8],
) -> std::result::Result<u64, PackedError> {
    for ph in &elf.program_headers {
        if ph.p_type == program_header::PT_LOAD {
            let p_offset = ph.p_offset;
            let p_vaddr = ph.p_vaddr;
            let p_filesz = ph.p_filesz;

            if vaddr >= p_vaddr && vaddr < p_vaddr + p_filesz {
                return Ok(p_offset + (vaddr - p_vaddr));
            }
        }
    }

    // Fallback: for simple binaries, VA == file offset (e.g. single PT_LOAD
    // with p_vaddr == p_offset == 0, or if the string table is in the first
    // segment that is identity-mapped). This is a last resort.
    Ok(vaddr)
}

/// Find the length of a null-terminated byte string at `offset` (including the null byte).
fn null_terminated_len(data: &[u8], offset: usize) -> std::result::Result<usize, PackedError> {
    if offset >= data.len() {
        return Err(PackedError::NotElf("string offset out of bounds".into()));
    }
    let remaining = &data[offset..];
    match memchr::memchr(0, remaining) {
        Some(i) => Ok(i + 1), // include the null byte
        None => Err(PackedError::NotElf(
            "string not null-terminated".into(),
        )),
    }
}

/// Patch the RPATH/RUNPATH in an ELF binary's raw bytes.
///
/// If an existing RPATH or RUNPATH is found, it is overwritten in-place with
/// `TARGET_RPATH`. The existing string must be long enough to hold the new
/// value (padded with null bytes).
///
/// If no RPATH/RUNPATH exists, returns `Ok(false)` (caller should handle this
/// by using external tooling like `patchelf` to add one).
///
/// Returns `Ok(true)` if the patch was applied successfully.
pub fn patch_rpath_in_place(data: &mut [u8]) -> std::result::Result<bool, PackedError> {
    let info = find_rpath(data)?;

    match info {
        RpathInfo::Absent => Ok(false),
        RpathInfo::Rpath { offset, len } | RpathInfo::Runpath { offset, len } => {
            let new_rpath = TARGET_RPATH;
            let new_len = new_rpath.len();

            if len < new_len {
                return Err(PackedError::RpathTooShort {
                    tag: if matches!(info, RpathInfo::Rpath { .. }) {
                        "RPATH".into()
                    } else {
                        "RUNPATH".into()
                    },
                    existing_len: len,
                    needed_len: new_len,
                });
            }

            let off = offset as usize;
            // Write the new rpath
            data[off..off + new_len].copy_from_slice(new_rpath);
            // Zero-fill the remainder
            data[off + new_len..off + len].fill(0);

            Ok(true)
        }
    }
}

/// Patch the RPATH/RUNPATH in an ELF binary file on disk.
///
/// Reads the file, patches RPATH in-place, writes it back.
/// Returns `Ok(true)` if patched, `Ok(false)` if no RPATH/RUNPATH was found
/// to patch.
pub fn patch_rpath_file(path: &Path) -> std::result::Result<bool, PackedError> {
    let mut file = std::fs::OpenOptions::new()
        .read(true)
        .write(true)
        .open(path)?;

    let mut data = Vec::new();
    file.read_to_end(&mut data)?;

    let mut data = data.into_boxed_slice();
    let patched = patch_rpath_in_place(&mut data)?;

    if patched {
        file.seek(SeekFrom::Start(0))?;
        file.set_len(0)?;
        file.write_all(&data)?;
    }

    Ok(patched)
}

/// Check if the given bytes look like an ELF binary.
pub fn is_elf(data: &[u8]) -> bool {
    data.len() >= header::ELFMAG.len() && &data[..header::ELFMAG.len()] == header::ELFMAG
}

// ---------------------------------------------------------------------------
// Packed output construction
// ---------------------------------------------------------------------------

/// Build a packed output for a File recipe that has resources.
///
/// Takes the file artifact's content blob and the resources directory artifact,
/// and assembles them into the packed output structure:
///
/// ```text
/// <output>/
/// ├── bin/
/// │   └── <binary>      (ELF with RPATH patched to $ORIGIN/../resources/lib/)
/// └── resources/
///     └── lib/
///         ├── libfoo.so
///         └── ...
/// ```
///
/// Returns the output artifact (a Directory).
pub fn build_packed_output(
    store: &Store,
    file_content_hash: &Hash,
    executable: bool,
    resources_output_hash: &Hash,
) -> Result<Artifact> {
    let binary_data = store.read_blob(file_content_hash)?;

    if is_elf(&binary_data) {
        let mut patched_data = binary_data;
        match patch_rpath_in_place(&mut patched_data) {
            Ok(true) => {
                // Patched successfully — store patched binary and assemble output
                let patched_hash = store.write_blob(&patched_data)?;
                let bin_hash = crate::build::artifact_to_hash(&Artifact::File {
                    content_hash: patched_hash,
                    executable: true,
                });
                stage_binary(store, &patched_hash, true, &bin_hash)?;

                return assemble_packed_artifact(store, &bin_hash, resources_output_hash);
            }
            Ok(false) => {
                // No RPATH/RUNPATH — packed structure still correct for future patching
            }
            Err(PackedError::RpathTooShort { .. }) => {
                eprintln!(
                    "[hod] warning: existing RPATH too short to patch, \
                     packed binary may not resolve libraries"
                );
            }
            Err(PackedError::NoDynamicSection) => {
                // Statically linked — no RPATH needed
            }
            Err(e) => {
                return Err(BuildError::Io(std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("failed to patch ELF RPATH: {e}"),
                )));
            }
        }
    }

    // Non-ELF or unpatchable: still create the packed structure
    let bin_hash = crate::build::artifact_to_hash(&Artifact::File {
        content_hash: *file_content_hash,
        executable,
    });
    stage_binary(store, file_content_hash, executable, &bin_hash)?;

    assemble_packed_artifact(store, &bin_hash, resources_output_hash)
}

/// Assemble the packed output directory artifact: `bin/` + `resources/lib/`.
fn assemble_packed_artifact(
    store: &Store,
    binary_artifact_hash: &Hash,
    resources_output_hash: &Hash,
) -> Result<Artifact> {
    // resources/lib/ → the resources output is used as-is for lib/
    let resources_dir = Artifact::Directory {
        entries: vec![("lib".to_string(), *resources_output_hash)],
    };
    let resources_dir_hash = crate::build::artifact_to_hash(&resources_dir);
    stage_resources_dir(store, resources_output_hash, &resources_dir_hash)?;

    // bin/binary → the patched (or unpatched) binary
    let bin_dir = Artifact::Directory {
        entries: vec![("binary".to_string(), *binary_artifact_hash)],
    };
    let bin_dir_hash = crate::build::artifact_to_hash(&bin_dir);
    stage_bin_dir(store, binary_artifact_hash, &bin_dir_hash)?;

    // Top-level: bin/ + resources/
    Ok(Artifact::Directory {
        entries: vec![
            ("bin".to_string(), bin_dir_hash),
            ("resources".to_string(), resources_dir_hash),
        ],
    })
}

/// Check if a File recipe needs packed executable handling.
///
/// Returns true if the file has `resources_hash` set.
pub fn needs_packing(recipe: &crate::recipe::RecipeFile) -> bool {
    recipe.resources_hash.is_some()
}

// ---------------------------------------------------------------------------
// Staging helpers
// ---------------------------------------------------------------------------

/// Write a binary blob to the staging directory.
fn stage_binary(
    store: &Store,
    content_hash: &Hash,
    executable: bool,
    artifact_hash: &Hash,
) -> Result<()> {
    let staging_path = artifact_staging_path(store, artifact_hash);
    if staging_path.exists() {
        return Ok(());
    }
    ensure_parent(&staging_path)?;

    let data = store.read_blob(content_hash)?;
    std::fs::write(&staging_path, &data)?;

    if executable {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&staging_path, std::fs::Permissions::from_mode(0o755))?;
    }

    Ok(())
}

/// Create the `resources/lib/` directory in staging, populating it from the resources output.
fn stage_resources_dir(
    store: &Store,
    resources_output_hash: &Hash,
    dir_artifact_hash: &Hash,
) -> Result<()> {
    let staging_path = artifact_staging_path(store, dir_artifact_hash);
    if staging_path.exists() {
        return Ok(());
    }
    ensure_parent(&staging_path)?;
    std::fs::create_dir_all(&staging_path)?;

    let lib_dir = staging_path.join("lib");
    std::fs::create_dir_all(&lib_dir)?;

    let resources_staging = crate::build::artifact_staging_path(store, resources_output_hash);
    if resources_staging.exists() {
        crate::build::materialize_artifact(store, resources_output_hash, &lib_dir)?;
    }

    Ok(())
}

/// Create the `bin/` directory in staging with the binary copied in.
fn stage_bin_dir(
    store: &Store,
    binary_artifact_hash: &Hash,
    dir_artifact_hash: &Hash,
) -> Result<()> {
    let staging_path = artifact_staging_path(store, dir_artifact_hash);
    if staging_path.exists() {
        return Ok(());
    }
    ensure_parent(&staging_path)?;
    std::fs::create_dir_all(&staging_path)?;

    let binary_staging = crate::build::artifact_staging_path(store, binary_artifact_hash);
    let target = staging_path.join("binary");
    if !target.exists() {
        std::fs::copy(&binary_staging, &target)?;
    }

    Ok(())
}

/// Compute the staging path for an artifact hash.
fn artifact_staging_path(store: &Store, hash: &Hash) -> std::path::PathBuf {
    let shard = crate::hash::hash_shard(hash);
    let hex = crate::hash::hash_to_hex(hash);
    store.staging_dir().join(&shard).join(&hex)
}

/// Create the parent directory of `path` if it doesn't exist.
fn ensure_parent(path: &std::path::Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_elf_valid() {
        assert!(is_elf(b"\x7fELF"));
        assert!(is_elf(b"\x7fELF\x02\x01\x01\x00..."));
    }

    #[test]
    fn test_is_elf_invalid() {
        assert!(!is_elf(b"#!/bin/bash"));
        assert!(!is_elf(b"Hello, world!"));
        assert!(!is_elf(b""));
        assert!(!is_elf(b"\x7f"));
    }

    #[test]
    fn test_find_rpath_non_elf() {
        assert!(find_rpath(b"#!/bin/bash\necho hello\n").is_err());
    }

    #[test]
    fn test_find_rpath_truncated_elf() {
        assert!(find_rpath(b"\x7fELF\x02\x01").is_err());
    }

    #[test]
    fn test_patch_non_elf() {
        let mut data = b"#!/bin/bash\necho hello\n".to_vec();
        assert!(patch_rpath_in_place(&mut data).is_err());
    }

    #[test]
    fn test_target_rpath_value() {
        assert!(TARGET_RPATH.starts_with(b"$ORIGIN"));
        assert!(TARGET_RPATH.ends_with(b"/"));
        assert!(memchr::memchr(b'/', &TARGET_RPATH[1..]).is_some());
    }
}
