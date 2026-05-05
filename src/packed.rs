//! Packed executables — self-contained ELF binaries with bundled runtime.
//!
//! When building a `File` recipe that has `has_resources = 0x01`, the builder
//! produces a "packed" output: the binary and its runtime dependencies are
//! assembled into a relocatable directory structure.
//!
//! ```text
//! <output>/
//! ├── bin/
//! │   ├── binary        (launcher or AT_EXECFN bootstrap)
//! │   └── binary.real   (original unmodified ELF, launcher mode only)
//! └── lib/
//!     ├── ld-linux-x86-64.so.2
//!     ├── libc.so.6
//!     └── ...
//! ```
//!
//! # Packing Modes
//!
//! ## Bootstrap Mode (default, direct-exec semantics)
//!
//! Injects a ~500-byte bootstrap stub into the ELF binary itself (adapted from
//! the onelf project, MIT licensed). The bootstrap:
//!
//! 1. Runs as the ELF entry point (the kernel does a real `execve()`)
//! 2. Reads `AT_EXECFN` from the kernel's aux vector
//! 3. Computes the relative path to the dynamic linker
//! 4. Opens and mmaps the real dynamic linker
//! 5. Patches program headers to add `PT_INTERP` for the linker
//! 6. Jumps to the interpreter's entry point
//!
//! This preserves `/proc/self/exe` correctness and requires no extra process.
//! Requires glibc >= 2.41 in the bundled runtime. The hermetic toolchain
//! now builds glibc 2.41, so this mode works for all hod-built binaries.
//!
//! ## Launcher Mode (fallback, robust)
//!
//! A small static launcher binary replaces the original executable. It:
//!
//! 1. Reads `/proc/self/exe` to find its own path
//! 2. Computes relative paths to `../lib/ld-linux-x86-64.so.2` and `binary.real`
//! 3. Exec's the dynamic linker with the real binary
//!
//! This works with any glibc version and any ELF layout. The trade-off is that
//! `/proc/self/exe` points at the launcher, not the real binary. Use this mode
//! as a fallback when packaging binaries linked against older glibc runtimes.
//!
//! See `src/packed/payload/` for the bootstrap C/asm source code.

use goblin::elf::{header, program_header, Elf};

use crate::build::{Artifact, BuildError, Result};
use crate::hash::Hash;
use crate::store::Store;

// ---------------------------------------------------------------------------
// Embedded bootstrap payload (compiled from src/packed/payload/)
// ---------------------------------------------------------------------------

/// Pre-compiled x86_64 bootstrap payload.
///
/// Adapted from onelf (https://github.com/QaidVoid/onelf) — MIT licensed.
const BOOTSTRAP_X86_64: &[u8] = include_bytes!("packed/payload/bootstrap_x86_64.bin");

/// Pre-compiled x86_64 launcher payload.
///
/// A small static musl binary that exec's the bundled ld-linux with the
/// real (unmodified) binary. Works with any glibc version.
const LAUNCHER_X86_64: &[u8] = include_bytes!("packed/payload/launcher_x86_64.bin");

/// Offset of the LEA displacement in the x86_64 trampoline.
///
/// The trampoline contains `lea _hod_metadata(%rip), %rsi` at offset 0x0a.
/// The displacement (4 bytes, little-endian) is at offset 0x0d.
/// The next instruction starts at offset 0x11 (the RIP value for the calculation).
const X86_64_LEA_DISP_OFFSET: usize = 0x0d;
const X86_64_LEA_RIP: usize = 0x11;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// The target RUNPATH we patch into ELF binaries.
///
/// `$ORIGIN` resolves to the directory containing the ELF binary at runtime.
/// Since the binary lives at `<output>/bin/<name>`, `$ORIGIN/../lib/`
/// resolves to `<output>/lib/`.
const TARGET_RUNPATH: &[u8] = b"$ORIGIN/../lib";

/// Default relative path from binary to the dynamic linker.
///
/// For binaries in `bin/`, the linker is at `../lib/ld-linux-x86-64.so.2`.
const DEFAULT_REL_INTERP: &str = "../lib/ld-linux-x86-64.so.2";

// ---------------------------------------------------------------------------
// Bootstrap injection
// ---------------------------------------------------------------------------

/// Error type for packed executable operations.
#[derive(Debug)]
pub enum PackedError {
    /// The binary is not a valid ELF file.
    NotElf(String),
    /// The ELF file has no dynamic section (statically linked).
    NoDynamicSection,
    /// The ELF file has no PT_INTERP (static binary) — not an error, just skip.
    NoInterp,
    /// The RUNPATH string is too short to be patched in-place.
    RunpathTooShort {
        existing_len: usize,
        needed_len: usize,
    },
    /// Architecture not supported for bootstrap injection.
    UnsupportedArch(u16),
    /// An IO error occurred.
    Io(std::io::Error),
}

impl std::fmt::Display for PackedError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::NotElf(msg) => write!(f, "not a valid ELF file: {msg}"),
            Self::NoDynamicSection => write!(f, "ELF has no dynamic section (statically linked)"),
            Self::NoInterp => write!(f, "ELF has no PT_INTERP (static binary)"),
            Self::RunpathTooShort {
                existing_len,
                needed_len,
            } => write!(
                f,
                "existing RUNPATH is {existing_len} bytes, need at least {needed_len} bytes"
            ),
            Self::UnsupportedArch(machine) => {
                write!(f, "unsupported ELF architecture: {machine}")
            }
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
    /// No RPATH or RUNPATH was found.
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

/// Check if the given bytes look like an ELF binary.
pub fn is_elf(data: &[u8]) -> bool {
    data.len() >= header::ELFMAG.len() && &data[..header::ELFMAG.len()] == header::ELFMAG
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
        match entry.d_tag {
            goblin::elf::dynamic::DT_RPATH => rpath_entry = Some(entry),
            goblin::elf::dynamic::DT_RUNPATH => runpath_entry = Some(entry),
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
    let strtab_file_offset = vaddr_to_file_offset(&elf, strtab_vaddr as u64)?;
    let str_idx = chosen.d_val;
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
fn vaddr_to_file_offset(elf: &Elf, vaddr: u64) -> std::result::Result<u64, PackedError> {
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

    // Fallback: for simple binaries, VA == file offset
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
        None => Err(PackedError::NotElf("string not null-terminated".into())),
    }
}

/// Patch the RPATH/RUNPATH in an ELF binary's raw bytes with a specific path.
///
/// If an existing RPATH or RUNPATH is found, it is overwritten in-place with
/// `new_rpath`. The existing string must be long enough to hold the new
/// value (padded with null bytes).
///
/// Returns `Ok(true)` if patched, `Ok(false)` if no RPATH/RUNPATH found.
pub fn patch_runpath_to(
    data: &mut [u8],
    new_rpath: &[u8],
) -> std::result::Result<bool, PackedError> {
    let info = find_rpath(data)?;

    match info {
        RpathInfo::Absent => Ok(false),
        RpathInfo::Rpath { offset, len } | RpathInfo::Runpath { offset, len } => {
            let new_len = new_rpath.len();

            if len < new_len {
                return Err(PackedError::RunpathTooShort {
                    existing_len: len,
                    needed_len: new_len,
                });
            }

            let off = offset as usize;
            // Write the new runpath
            data[off..off + new_len].copy_from_slice(new_rpath);
            // Zero-fill the remainder
            data[off + new_len..off + len].fill(0);

            Ok(true)
        }
    }
}

/// Patch the RPATH/RUNPATH in an ELF binary's raw bytes with `TARGET_RUNPATH`.
///
/// If an existing RPATH or RUNPATH is found, it is overwritten in-place with
/// `TARGET_RUNPATH`. The existing string must be long enough to hold the new
/// value (padded with null bytes).
///
/// Returns `Ok(true)` if patched, `Ok(false)` if no RPATH/RUNPATH found.
pub fn patch_runpath_in_place(data: &mut [u8]) -> std::result::Result<bool, PackedError> {
    patch_runpath_to(data, TARGET_RUNPATH)
}

/// Backwards-compatible name for patching RPATH/RUNPATH in place.
pub fn patch_rpath_in_place(data: &mut [u8]) -> std::result::Result<bool, PackedError> {
    patch_runpath_in_place(data)
}

/// Patch the RPATH/RUNPATH in an ELF binary file on disk.
///
/// Reads the file, patches RPATH/RUNPATH in-place, writes it back.
/// Returns `Ok(true)` if patched, `Ok(false)` if no RPATH/RUNPATH was found.
pub fn patch_rpath_file(path: &std::path::Path) -> std::result::Result<bool, PackedError> {
    let mut data = std::fs::read(path)?;
    let patched = patch_rpath_in_place(&mut data)?;
    if patched {
        std::fs::write(path, &data)?;
    }
    Ok(patched)
}

/// Inject the AT_EXECFN bootstrap into an ELF binary's raw bytes.
///
/// This replaces the original `PT_INTERP` program header with a `PT_LOAD`
/// containing the bootstrap code, rewrites `e_entry` to point at the
/// bootstrap, and appends the bootstrap blob + metadata to the end of the file.
///
/// The bootstrap code uses `AT_EXECFN` to locate the dynamic linker relative
/// to the binary's own path at runtime.
///
/// # Arguments
/// * `data` - The raw ELF binary bytes (modified in-place, then extended).
///   Caller should pass a mutable `Vec<u8>`.
/// * `rel_interp` - Relative path from the binary's directory to the dynamic
///   linker (e.g., `"../lib/ld-linux-x86-64.so.2"`).
///
/// # Returns
/// * `Ok(true)` if the bootstrap was injected successfully.
/// * `Ok(false)` if the binary has no PT_INTERP (static binary — nothing to do).
/// * `Err` if the binary is malformed or unsupported.
pub fn inject_bootstrap(
    data: &mut Vec<u8>,
    rel_interp: &str,
) -> std::result::Result<bool, PackedError> {
    let elf = Elf::parse(data).map_err(|e| PackedError::NotElf(e.to_string()))?;

    // Only 64-bit little-endian
    if elf.header.e_ident[4] != 2 || elf.header.e_ident[5] != 1 {
        return Ok(false);
    }

    // Only x86_64 for now
    let is_x86_64 = elf.header.e_machine == header::EM_X86_64;
    if !is_x86_64 {
        return Err(PackedError::UnsupportedArch(elf.header.e_machine));
    }

    // Find PT_INTERP — if none, it's a static binary
    let phdr_idx = match elf
        .program_headers
        .iter()
        .position(|p| p.p_type == program_header::PT_INTERP)
    {
        Some(i) => i,
        None => return Ok(false),
    };

    // Compute the highest virtual address from all PT_LOAD segments
    let highest_vend: u64 = elf
        .program_headers
        .iter()
        .filter(|p| p.p_type == program_header::PT_LOAD)
        .map(|p| p.p_vaddr + p.p_memsz)
        .max()
        .unwrap_or(0);

    let page_size: u64 = 4096;
    let new_vaddr = (highest_vend + page_size - 1) & !(page_size - 1);
    let orig_entry = elf.header.e_entry;
    let e_phoff = elf.header.e_phoff as usize;
    let e_phentsize = elf.header.e_phentsize as usize;

    // Drop the parsed elf (we're about to modify the data)
    drop(elf);

    let code = BOOTSTRAP_X86_64;
    let rel_bytes = rel_interp.as_bytes();

    // Build blob: [code] [padding to 8-byte align] [entry_delta u64] [path_len u16] [path NUL]
    let mut blob = Vec::with_capacity(code.len() + 64);
    blob.extend_from_slice(code);
    while blob.len() % 8 != 0 {
        blob.push(0);
    }
    let metadata_offset = blob.len();
    let entry_delta = (orig_entry as i64) - (new_vaddr as i64);
    blob.extend_from_slice(&entry_delta.to_le_bytes());
    blob.extend_from_slice(&(rel_bytes.len() as u16).to_le_bytes());
    blob.extend_from_slice(rel_bytes);
    blob.push(0); // NUL terminator

    // Patch the trampoline's LEA instruction to point at the metadata offset.
    // LEA displacement = metadata_offset - RIP_value
    // In the raw blob, the LEA's RIP is at X86_64_LEA_RIP (0x11).
    let disp = (metadata_offset as i32) - (X86_64_LEA_RIP as i32);
    blob[X86_64_LEA_DISP_OFFSET..X86_64_LEA_DISP_OFFSET + 4].copy_from_slice(&disp.to_le_bytes());

    // Pad the ELF data to page alignment so p_offset % p_align == p_vaddr % p_align.
    let page = page_size as usize;
    while data.len() % page != 0 {
        data.push(0);
    }
    let file_offset = data.len() as u64;
    let blob_len = blob.len() as u64;
    data.extend_from_slice(&blob);

    // Overwrite PT_INTERP phdr -> PT_LOAD
    let phdr_off = e_phoff + phdr_idx * e_phentsize;
    data[phdr_off..phdr_off + 4].copy_from_slice(&1u32.to_le_bytes()); // PT_LOAD
    data[phdr_off + 4..phdr_off + 8].copy_from_slice(&5u32.to_le_bytes()); // PF_R|PF_X
    data[phdr_off + 8..phdr_off + 16].copy_from_slice(&file_offset.to_le_bytes());
    data[phdr_off + 16..phdr_off + 24].copy_from_slice(&new_vaddr.to_le_bytes());
    data[phdr_off + 24..phdr_off + 32].copy_from_slice(&new_vaddr.to_le_bytes());
    data[phdr_off + 32..phdr_off + 40].copy_from_slice(&blob_len.to_le_bytes());
    data[phdr_off + 40..phdr_off + 48].copy_from_slice(&blob_len.to_le_bytes());
    data[phdr_off + 48..phdr_off + 56].copy_from_slice(&page_size.to_le_bytes());

    // Swap our phdr entry with the last one so original PT_LOADs come first.
    // The kernel uses the FIRST PT_LOAD to compute the ASLR base. If our
    // high-vaddr segment is first, the base is too high and original segments
    // at lower vaddrs fall outside the reserved region.
    let e_phnum = u16::from_le_bytes(data[56..58].try_into().unwrap()) as usize;
    let last_phdr_off = e_phoff + (e_phnum - 1) * e_phentsize;
    if phdr_off != last_phdr_off {
        let mut tmp = vec![0u8; e_phentsize];
        tmp.copy_from_slice(&data[phdr_off..phdr_off + e_phentsize]);
        data.copy_within(last_phdr_off..last_phdr_off + e_phentsize, phdr_off);
        data[last_phdr_off..last_phdr_off + e_phentsize].copy_from_slice(&tmp);
    }

    // Rewrite e_entry to point at the new bootstrap segment
    data[24..32].copy_from_slice(&new_vaddr.to_le_bytes());

    Ok(true)
}

/// Parse the PT_INTERP string from an ELF binary.
///
/// Returns the interpreter path (e.g., "/lib64/ld-linux-x86-64.so.2"),
/// or `None` if the binary has no PT_INTERP (static binary).
pub fn parse_interp(data: &[u8]) -> Option<String> {
    let elf = Elf::parse(data).ok()?;
    elf.interpreter
        .map(|s| s.trim_end_matches('\0').to_string())
}

// ---------------------------------------------------------------------------
// Packed output construction
// ---------------------------------------------------------------------------

/// Packing mode for packed executables.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PackedMode {
    /// Inject AT_EXECFN bootstrap into the ELF binary.
    /// Default mode. Direct-exec semantics, preserves /proc/self/exe.
    /// Requires glibc >= 2.41 in the bundled runtime.
    Bootstrap,
    /// Use a static launcher binary that exec's ld-linux with the real binary.
    /// Fallback mode. Works with any glibc version and ELF layout.
    Launcher,
}

/// Build a packed output for a File recipe that has resources.
///
/// Takes the file artifact's content blob and the resources directory artifact,
/// and assembles them into a relocatable packed output structure.
///
/// Uses the bootstrap mode by default (direct-exec semantics, requires glibc >= 2.41).
/// Falls back to launcher mode if the binary is not a dynamic ELF.
///
/// Returns the output artifact (a Directory).
pub fn build_packed_output(
    store: &Store,
    file_content_hash: &Hash,
    executable: bool,
    resources_output_hash: &Hash,
) -> Result<Artifact> {
    build_packed_output_with_mode(
        store,
        file_content_hash,
        executable,
        resources_output_hash,
        PackedMode::Bootstrap,
    )
}

/// Build a packed output with a specific packing mode.
pub fn build_packed_output_with_mode(
    store: &Store,
    file_content_hash: &Hash,
    executable: bool,
    resources_output_hash: &Hash,
    mode: PackedMode,
) -> Result<Artifact> {
    let binary_data = store.read_blob(file_content_hash)?;

    match mode {
        PackedMode::Launcher => build_launcher_packed(
            store,
            file_content_hash,
            executable,
            resources_output_hash,
            &binary_data,
        ),
        PackedMode::Bootstrap => build_bootstrap_packed(
            store,
            file_content_hash,
            executable,
            resources_output_hash,
            binary_data,
        ),
    }
}

/// Launcher mode: create bin/binary (static launcher) + bin/binary.real (original)
/// + lib/ (runtime dependencies).
///
/// The launcher reads /proc/self/exe, computes relative paths, and
/// exec's ld-linux with the real binary.
fn build_launcher_packed(
    store: &Store,
    file_content_hash: &Hash,
    executable: bool,
    resources_output_hash: &Hash,
    binary_data: &[u8],
) -> Result<Artifact> {
    // Patch RUNPATH on the original binary if it's an ELF
    let real_binary_hash = if is_elf(binary_data) {
        let mut modified = binary_data.to_vec();
        match patch_runpath_in_place(&mut modified) {
            Ok(true) | Ok(false) => store.write_blob(&modified)?,
            Err(PackedError::RunpathTooShort { .. }) => {
                eprintln!("[hod] warning: RUNPATH too short to patch, packed binary may not resolve libraries");
                *file_content_hash
            }
            Err(PackedError::NoDynamicSection) => *file_content_hash,
            Err(e) => {
                eprintln!("[hod] warning: failed to patch RUNPATH: {e}");
                *file_content_hash
            }
        }
    } else {
        *file_content_hash
    };

    // Store the launcher binary
    let launcher_hash = store.write_blob(LAUNCHER_X86_64)?;

    // Store the real binary
    let real_hash = store.write_blob(&store.read_blob(&real_binary_hash)?)?;

    // Build bin/ directory: binary (launcher) + binary.real (original)
    let launcher_artifact_hash = crate::build::artifact_to_hash(&Artifact::File {
        content_hash: launcher_hash,
        executable: true,
    });
    let real_artifact_hash = crate::build::artifact_to_hash(&Artifact::File {
        content_hash: real_hash,
        executable,
    });

    let bin_dir = Artifact::Directory {
        entries: vec![
            ("binary".to_string(), launcher_artifact_hash),
            ("binary.real".to_string(), real_artifact_hash),
        ],
    };
    let bin_dir_hash = crate::build::artifact_to_hash(&bin_dir);
    stage_launcher_bin_dir(store, &launcher_hash, &real_hash, executable, &bin_dir_hash)?;

    // Top-level: bin/ + lib/
    Ok(Artifact::Directory {
        entries: vec![
            ("bin".to_string(), bin_dir_hash),
            ("lib".to_string(), *resources_output_hash),
        ],
    })
}

/// Bootstrap mode: inject AT_EXECFN bootstrap into the ELF binary.
fn build_bootstrap_packed(
    store: &Store,
    file_content_hash: &Hash,
    executable: bool,
    resources_output_hash: &Hash,
    binary_data: Vec<u8>,
) -> Result<Artifact> {
    let mut modified_data = binary_data;

    // Step 1: Inject the AT_EXECFN bootstrap
    match inject_bootstrap(&mut modified_data, DEFAULT_REL_INTERP) {
        Ok(true) => {
            // Bootstrap injected — also patch RUNPATH
            if let Err(e) = patch_runpath_in_place(&mut modified_data) {
                match e {
                    PackedError::NoDynamicSection | PackedError::NoInterp => {}
                    PackedError::RunpathTooShort { .. } => {
                        eprintln!(
                            "[hod] warning: RUNPATH too short to patch after bootstrap injection"
                        );
                    }
                    e => {
                        eprintln!("[hod] warning: failed to patch RUNPATH: {e}");
                    }
                }
            }

            let patched_hash = store.write_blob(&modified_data)?;
            let bin_hash = crate::build::artifact_to_hash(&Artifact::File {
                content_hash: patched_hash,
                executable: true,
            });
            stage_binary(store, &patched_hash, true, &bin_hash)?;

            return assemble_packed_artifact(store, &bin_hash, resources_output_hash);
        }
        Ok(false) => {
            // No PT_INTERP — static binary. Fall through to RUNPATH-only.
        }
        Err(PackedError::UnsupportedArch(_)) => {
            // Not x86_64 — fall through to RUNPATH-only.
        }
        Err(e) => {
            return Err(BuildError::Io(std::io::Error::other(format!(
                "failed to inject AT_EXECFN bootstrap: {e}"
            ))));
        }
    }

    // Fall back: try RUNPATH-only patching
    if is_elf(&modified_data) {
        match patch_runpath_in_place(&mut modified_data) {
            Ok(true) => {
                let patched_hash = store.write_blob(&modified_data)?;
                let bin_hash = crate::build::artifact_to_hash(&Artifact::File {
                    content_hash: patched_hash,
                    executable: true,
                });
                stage_binary(store, &patched_hash, true, &bin_hash)?;

                return assemble_packed_artifact(store, &bin_hash, resources_output_hash);
            }
            Ok(false) => {}
            Err(PackedError::RunpathTooShort { .. }) => {
                eprintln!(
                    "[hod] warning: existing RUNPATH too short to patch, \
                     packed binary may not resolve libraries"
                );
            }
            Err(PackedError::NoDynamicSection) => {}
            Err(e) => {
                return Err(BuildError::Io(std::io::Error::other(format!(
                    "failed to patch ELF RUNPATH: {e}"
                ))));
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

/// Assemble the packed output directory artifact: `bin/` + `lib/`.
fn assemble_packed_artifact(
    store: &Store,
    binary_artifact_hash: &Hash,
    resources_output_hash: &Hash,
) -> Result<Artifact> {
    // lib/ → the resources output is used as-is
    // Use the resources output as the lib/ directory directly.
    // The resources_output_hash points to the staged resources directory.
    let lib_dir_hash = *resources_output_hash;

    // bin/binary → the patched binary
    let bin_dir = Artifact::Directory {
        entries: vec![("binary".to_string(), *binary_artifact_hash)],
    };
    let bin_dir_hash = crate::build::artifact_to_hash(&bin_dir);
    // Create the bin/ directory with the binary copied in
    let bin_dir_staging = artifact_staging_path(store, &bin_dir_hash);
    if !bin_dir_staging.exists() {
        ensure_parent(&bin_dir_staging)?;
        std::fs::create_dir_all(&bin_dir_staging)?;
        let binary_staging = artifact_staging_path(store, binary_artifact_hash);
        let target = bin_dir_staging.join("binary");
        if !target.exists() {
            std::fs::copy(&binary_staging, &target)?;
        }
    }

    // Top-level: bin/ + lib/
    Ok(Artifact::Directory {
        entries: vec![
            ("bin".to_string(), bin_dir_hash),
            ("lib".to_string(), lib_dir_hash),
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

/// Create the `bin/` directory in staging with the launcher and real binary.
fn stage_launcher_bin_dir(
    store: &Store,
    launcher_content_hash: &Hash,
    real_content_hash: &Hash,
    real_executable: bool,
    dir_artifact_hash: &Hash,
) -> Result<()> {
    let staging_path = artifact_staging_path(store, dir_artifact_hash);
    if staging_path.exists() {
        return Ok(());
    }
    ensure_parent(&staging_path)?;
    std::fs::create_dir_all(&staging_path)?;

    // Stage the launcher as "binary"
    let launcher_data = store.read_blob(launcher_content_hash)?;
    let target = staging_path.join("binary");
    if !target.exists() {
        std::fs::write(&target, &launcher_data)?;
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&target, std::fs::Permissions::from_mode(0o755))?;
    }

    // Stage the real binary as "binary.real"
    let real_data = store.read_blob(real_content_hash)?;
    let target_real = staging_path.join("binary.real");
    if !target_real.exists() {
        std::fs::write(&target_real, &real_data)?;
        if real_executable {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&target_real, std::fs::Permissions::from_mode(0o755))?;
        }
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

    // -----------------------------------------------------------------------
    // Helper: build a minimal ELF binary for testing
    // -----------------------------------------------------------------------

    /// Build a minimal x86_64 ELF binary with a PT_INTERP and optional RPATH.
    ///
    /// This creates a valid (but non-functional) ELF with:
    /// - ELF header (64 bytes)
    /// - Program headers: PT_PHDR, PT_INTERP, PT_LOAD, (PT_DYNAMIC if runpath)
    /// - .interp string: "/lib64/ld-linux-x86-64.so.2"
    /// - .dynamic section with DT_STRTAB, DT_STRSZ, DT_RUNPATH, DT_NULL
    /// - .dynstr with the runpath string
    /// - A small code segment
    fn build_minimal_elf_with_interp(runpath: Option<&str>) -> Vec<u8> {
        let interp_str = b"/lib64/ld-linux-x86-64.so.2\0";
        let interp_len = interp_str.len();

        let runpath_bytes = runpath.map(|r| {
            let mut s = r.as_bytes().to_vec();
            s.push(0);
            s
        });
        let runpath_len = runpath_bytes.as_ref().map_or(0, |r| r.len());

        let e_phoff: u64 = 64;
        let phentsize: u16 = 56;

        // Number of program headers depends on whether we have dynamic section
        let e_phnum: u16 = if runpath.is_some() { 4 } else { 3 };

        let phdr_total = (e_phnum as usize) * (phentsize as usize);
        let interp_offset = (e_phoff as usize) + phdr_total;

        let has_dynamic = runpath.is_some();

        // Dynamic section: DT_STRTAB, DT_STRSZ, DT_RUNPATH, DT_NULL = 4 entries
        let num_dyn_entries: usize = if has_dynamic { 4 } else { 0 };
        let dyn_offset = interp_offset + interp_len;
        let dyn_size = num_dyn_entries * 16;

        // Dynstr comes after dynamic section
        let dynstr_offset = if has_dynamic {
            dyn_offset + dyn_size
        } else {
            0
        };

        // Code after everything
        let code_start = if has_dynamic {
            dynstr_offset + runpath_len
        } else {
            interp_offset + interp_len
        };
        let code_start = (code_start + 7) & !7; // align to 8 bytes

        let code: &[u8] = &[
            0xc3, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90, 0x90,
            0x90, 0x90,
        ];
        let total_size = code_start + code.len();

        let mut elf = vec![0u8; total_size];

        // Helper: write a program header at the given index
        let phdr_write = |elf: &mut [u8],
                          idx: usize,
                          p_type: u32,
                          p_flags: u32,
                          p_offset: u64,
                          p_vaddr: u64,
                          p_paddr: u64,
                          p_filesz: u64,
                          p_memsz: u64,
                          p_align: u64| {
            let off = e_phoff as usize + idx * (phentsize as usize);
            elf[off..off + 4].copy_from_slice(&p_type.to_le_bytes());
            elf[off + 4..off + 8].copy_from_slice(&p_flags.to_le_bytes());
            elf[off + 8..off + 16].copy_from_slice(&p_offset.to_le_bytes());
            elf[off + 16..off + 24].copy_from_slice(&p_vaddr.to_le_bytes());
            elf[off + 24..off + 32].copy_from_slice(&p_paddr.to_le_bytes());
            elf[off + 32..off + 40].copy_from_slice(&p_filesz.to_le_bytes());
            elf[off + 40..off + 48].copy_from_slice(&p_memsz.to_le_bytes());
            elf[off + 48..off + 56].copy_from_slice(&p_align.to_le_bytes());
        };

        // ELF header
        elf[0..4].copy_from_slice(b"\x7fELF");
        elf[4] = 2; // ELFCLASS64
        elf[5] = 1; // ELFDATA2LSB
        elf[6] = 1; // EV_CURRENT
        elf[16..18].copy_from_slice(&2u16.to_le_bytes()); // ET_EXEC
        elf[18..20].copy_from_slice(&62u16.to_le_bytes()); // EM_X86_64
        elf[20..24].copy_from_slice(&1u32.to_le_bytes()); // e_version
        elf[24..32].copy_from_slice(&(code_start as u64).to_le_bytes()); // e_entry
        elf[32..40].copy_from_slice(&e_phoff.to_le_bytes()); // e_phoff
        elf[40..48].copy_from_slice(&0u64.to_le_bytes()); // e_shoff
        elf[52..54].copy_from_slice(&64u16.to_le_bytes()); // e_ehsize
        elf[54..56].copy_from_slice(&phentsize.to_le_bytes());
        elf[56..58].copy_from_slice(&e_phnum.to_le_bytes());

        // Program headers
        let phdr_filesz = (e_phnum as u64) * (phentsize as u64);
        phdr_write(
            &mut elf,
            0,
            6,
            4,
            e_phoff,
            e_phoff,
            e_phoff,
            phdr_filesz,
            phdr_filesz,
            8,
        );
        phdr_write(
            &mut elf,
            1,
            3,
            4,
            interp_offset as u64,
            interp_offset as u64,
            interp_offset as u64,
            interp_len as u64,
            interp_len as u64,
            1,
        );
        phdr_write(
            &mut elf,
            2,
            1,
            5,
            0,
            0,
            0,
            total_size as u64,
            total_size as u64,
            0x1000,
        );
        if has_dynamic {
            phdr_write(
                &mut elf,
                3,
                2,
                6,
                dyn_offset as u64,
                dyn_offset as u64,
                dyn_offset as u64,
                dyn_size as u64,
                dyn_size as u64,
                8,
            );
        }

        // .interp string
        elf[interp_offset..interp_offset + interp_len].copy_from_slice(interp_str);

        // Dynamic section entries (if we have runpath)
        if has_dynamic {
            // .dynamic entries
            let dyn_write = |elf: &mut [u8], base: usize, idx: usize, tag: u64, val: u64| {
                let off = base + idx * 16;
                elf[off..off + 8].copy_from_slice(&tag.to_le_bytes());
                elf[off + 8..off + 16].copy_from_slice(&val.to_le_bytes());
            };

            // DT_STRTAB = 5 — points to virtual address of .dynstr
            dyn_write(&mut elf, dyn_offset, 0, 5, dynstr_offset as u64);
            // DT_STRSZ = 10 — size of .dynstr
            dyn_write(&mut elf, dyn_offset, 1, 10, runpath_len as u64);
            // DT_RUNPATH = 29 — index into .dynstr
            dyn_write(&mut elf, dyn_offset, 2, 29, 0); // index 0
                                                       // DT_NULL = 0
            dyn_write(&mut elf, dyn_offset, 3, 0, 0);

            // .dynstr — the runpath string
            if let Some(ref rp) = runpath_bytes {
                elf[dynstr_offset..dynstr_offset + rp.len()].copy_from_slice(rp);
            }
        }

        // Code
        elf[code_start..code_start + code.len()].copy_from_slice(code);

        elf
    }

    /// Build a minimal static ELF binary (no PT_INTERP).
    fn build_static_elf() -> Vec<u8> {
        let mut elf = vec![0u8; 256];

        // ELF header
        elf[0..4].copy_from_slice(b"\x7fELF");
        elf[4] = 2; // ELFCLASS64
        elf[5] = 1; // ELFDATA2LSB
        elf[6] = 1; // EV_CURRENT
        elf[16..18].copy_from_slice(&2u16.to_le_bytes()); // ET_EXEC
        elf[18..20].copy_from_slice(&62u16.to_le_bytes()); // EM_X86_64
        elf[20..24].copy_from_slice(&1u32.to_le_bytes()); // e_version
        elf[24..32].copy_from_slice(&0x100u64.to_le_bytes()); // e_entry
        elf[32..40].copy_from_slice(&64u64.to_le_bytes()); // e_phoff
        elf[52..54].copy_from_slice(&64u16.to_le_bytes()); // e_ehsize
        elf[54..56].copy_from_slice(&56u16.to_le_bytes()); // e_phentsize
        elf[56..58].copy_from_slice(&1u16.to_le_bytes()); // e_phnum = 1

        // PT_LOAD covering entire file
        elf[64..68].copy_from_slice(&1u32.to_le_bytes()); // PT_LOAD
        elf[68..72].copy_from_slice(&5u32.to_le_bytes()); // PF_R|PF_X
        elf[72..80].copy_from_slice(&0u64.to_le_bytes()); // p_offset
        elf[80..88].copy_from_slice(&0u64.to_le_bytes()); // p_vaddr
        elf[88..96].copy_from_slice(&0u64.to_le_bytes()); // p_paddr
        elf[96..104].copy_from_slice(&256u64.to_le_bytes()); // p_filesz
        elf[104..112].copy_from_slice(&256u64.to_le_bytes()); // p_memsz
        elf[112..120].copy_from_slice(&0x1000u64.to_le_bytes()); // p_align

        elf
    }

    // -----------------------------------------------------------------------
    // Basic tests
    // -----------------------------------------------------------------------

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
    fn test_target_runpath_value() {
        assert!(TARGET_RUNPATH.starts_with(b"$ORIGIN"));
        assert!(TARGET_RUNPATH.ends_with(b"lib"));
        assert!(memchr::memchr(b'/', &TARGET_RUNPATH[1..]).is_some());
    }

    // -----------------------------------------------------------------------
    // parse_interp tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_parse_interp_with_interp() {
        let elf = build_minimal_elf_with_interp(None);
        let interp = parse_interp(&elf).expect("should parse interp");
        assert_eq!(interp, "/lib64/ld-linux-x86-64.so.2");
    }

    #[test]
    fn test_parse_interp_static() {
        let elf = build_static_elf();
        assert!(parse_interp(&elf).is_none());
    }

    #[test]
    fn test_parse_interp_non_elf() {
        assert!(parse_interp(b"not an elf").is_none());
    }

    // -----------------------------------------------------------------------
    // inject_bootstrap tests
    // -----------------------------------------------------------------------

    #[test]
    fn test_inject_bootstrap_basic() {
        let mut elf = build_minimal_elf_with_interp(None);
        let orig_entry = u64::from_le_bytes(elf[24..32].try_into().unwrap());

        let result = inject_bootstrap(&mut elf, "../lib/ld-linux-x86-64.so.2")
            .expect("injection should succeed");
        assert!(result, "should inject into dynamic ELF");

        // e_entry should have changed
        let new_entry = u64::from_le_bytes(elf[24..32].try_into().unwrap());
        assert_ne!(new_entry, orig_entry, "e_entry should have changed");

        // The original PT_INTERP should now be PT_LOAD
        // Find the PT_LOAD at the highest vaddr (our bootstrap segment)
        let parsed = Elf::parse(&elf).expect("should parse modified ELF");
        let max_load = parsed
            .program_headers
            .iter()
            .filter(|p| p.p_type == program_header::PT_LOAD)
            .max_by_key(|p| p.p_vaddr);
        assert!(max_load.is_some(), "should have at least one PT_LOAD");
        let bootstrap = max_load.unwrap();
        assert!(
            bootstrap.p_vaddr >= 0x1000,
            "bootstrap segment should be at high address, got {:#x}",
            bootstrap.p_vaddr
        );

        // Should NOT have PT_INTERP anymore (it was converted to PT_LOAD)
        let has_interp = parsed
            .program_headers
            .iter()
            .any(|p| p.p_type == program_header::PT_INTERP);
        assert!(
            !has_interp,
            "PT_INTERP should have been converted to PT_LOAD"
        );
    }

    #[test]
    fn test_inject_bootstrap_static_binary() {
        let mut elf = build_static_elf();
        let result = inject_bootstrap(&mut elf, "../lib/ld-linux-x86-64.so.2")
            .expect("should not error on static binary");
        assert!(
            !result,
            "should return false for static binary (no PT_INTERP)"
        );
    }

    #[test]
    fn test_inject_bootstrap_preserves_elf_magic() {
        let mut elf = build_minimal_elf_with_interp(None);
        inject_bootstrap(&mut elf, "../lib/ld-linux-x86-64.so.2").unwrap();
        assert_eq!(&elf[0..4], b"\x7fELF", "ELF magic should be preserved");
    }

    #[test]
    fn test_inject_bootstrap_preserves_machine() {
        let mut elf = build_minimal_elf_with_interp(None);
        inject_bootstrap(&mut elf, "../lib/ld-linux-x86-64.so.2").unwrap();
        let machine = u16::from_le_bytes(elf[18..20].try_into().unwrap());
        assert_eq!(machine, 62, "e_machine should still be x86_64");
    }

    #[test]
    fn test_inject_bootstrap_non_elf() {
        let mut data = b"not an elf".to_vec();
        let result = inject_bootstrap(&mut data, "../lib/ld-linux-x86-64.so.2");
        assert!(result.is_err(), "should error on non-ELF data");
    }

    #[test]
    fn test_inject_bootstrap_invalid_class() {
        // ELF with wrong class (32-bit)
        let mut elf = build_minimal_elf_with_interp(None);
        elf[4] = 1; // ELFCLASS32
        let result = inject_bootstrap(&mut elf, "../lib/ld-linux-x86-64.so.2");
        assert!(
            result.is_err() || matches!(result, Ok(false)),
            "should reject 32-bit ELF"
        );
    }

    #[test]
    fn test_inject_bootstrap_metadata_integrity() {
        // Verify that the metadata in the injected blob is correct
        let mut elf = build_minimal_elf_with_interp(None);
        let orig_entry = u64::from_le_bytes(elf[24..32].try_into().unwrap());

        let rel_interp = "../lib/ld-linux-x86-64.so.2";
        inject_bootstrap(&mut elf, rel_interp).unwrap();

        // Find the bootstrap segment
        let parsed = Elf::parse(&elf).expect("should parse");
        let bootstrap_phdr = parsed
            .program_headers
            .iter()
            .filter(|p| p.p_type == program_header::PT_LOAD)
            .max_by_key(|p| p.p_vaddr)
            .expect("should have at least one PT_LOAD");

        let new_vaddr = bootstrap_phdr.p_vaddr;
        let file_offset = bootstrap_phdr.p_offset as usize;
        let file_size = bootstrap_phdr.p_filesz as usize;

        // The metadata is at the end of the blob:
        // [code][padding to 8-byte align][entry_delta: i64][path_len: u16][path][NUL]
        let blob = &elf[file_offset..file_offset + file_size];

        // Find the metadata: entry_delta is after padding
        // The bootstrap code is BOOTSTRAP_X86_64 (2208 bytes), padded to 8-byte align (already 2208 = 276*8)
        let code_len = BOOTSTRAP_X86_64.len();
        let padded_code_len = (code_len + 7) & !7;

        let metadata_start = padded_code_len;
        assert!(
            metadata_start + 8 + 2 + rel_interp.len() + 1 <= blob.len(),
            "metadata should fit in blob"
        );

        // Read entry_delta
        let entry_delta =
            i64::from_le_bytes(blob[metadata_start..metadata_start + 8].try_into().unwrap());
        assert_eq!(
            entry_delta,
            (orig_entry as i64) - (new_vaddr as i64),
            "entry_delta should be orig_entry - new_vaddr"
        );

        // Read path_len
        let path_len = u16::from_le_bytes(
            blob[metadata_start + 8..metadata_start + 10]
                .try_into()
                .unwrap(),
        );
        assert_eq!(path_len as usize, rel_interp.len(), "path_len should match");

        // Read path
        let path = &blob[metadata_start + 10..metadata_start + 10 + path_len as usize];
        assert_eq!(path, rel_interp.as_bytes(), "path should match");
    }

    #[test]
    fn test_inject_bootstrap_lea_displacement() {
        // Verify the LEA instruction in the trampoline points to the metadata
        let mut elf = build_minimal_elf_with_interp(None);
        inject_bootstrap(&mut elf, "../lib/ld-linux-x86-64.so.2").unwrap();

        let parsed = Elf::parse(&elf).expect("should parse");
        let bootstrap_phdr = parsed
            .program_headers
            .iter()
            .filter(|p| p.p_type == program_header::PT_LOAD)
            .max_by_key(|p| p.p_vaddr)
            .expect("should have at least one PT_LOAD");

        let file_offset = bootstrap_phdr.p_offset as usize;
        let blob = &elf[file_offset..];

        // Read the LEA displacement from offset X86_64_LEA_DISP_OFFSET
        let disp = i32::from_le_bytes(
            blob[X86_64_LEA_DISP_OFFSET..X86_64_LEA_DISP_OFFSET + 4]
                .try_into()
                .unwrap(),
        );

        // The target should be at the metadata offset
        let code_len = BOOTSTRAP_X86_64.len();
        let padded_code_len = (code_len + 7) & !7;

        let expected_target = padded_code_len as i32;
        let computed_target = X86_64_LEA_RIP as i32 + disp;
        assert_eq!(
            computed_target, expected_target,
            "LEA should point at metadata offset"
        );
    }

    // -----------------------------------------------------------------------
    // find_rpath / patch_runpath tests with synthetic ELF
    // -----------------------------------------------------------------------

    #[test]
    fn test_find_rpath_in_synthetic_elf() {
        // Use a long runpath that can be patched
        let elf = build_minimal_elf_with_interp(Some("/this/is/a/long/runpath/that/is/enough"));
        let info = find_rpath(&elf).expect("should parse");
        match info {
            RpathInfo::Runpath { offset, len } => {
                let path_str =
                    std::str::from_utf8(&elf[offset as usize..offset as usize + len - 1])
                        .expect("valid utf8");
                assert_eq!(path_str, "/this/is/a/long/runpath/that/is/enough");
            }
            other => panic!("expected Runpath, got {:?}", other),
        }
    }

    #[test]
    fn test_patch_runpath_in_synthetic_elf() {
        let mut elf = build_minimal_elf_with_interp(Some("/this/is/a/long/runpath/that/is/enough"));
        let result = patch_runpath_in_place(&mut elf).expect("should patch");
        assert!(result, "should successfully patch");

        // Verify the new value
        let info = find_rpath(&elf).expect("should find");
        match info {
            RpathInfo::Runpath { offset, len } => {
                let path_str = std::str::from_utf8(
                    &elf[offset as usize..offset as usize + TARGET_RUNPATH.len()],
                )
                .expect("valid utf8");
                assert_eq!(path_str, std::str::from_utf8(TARGET_RUNPATH).unwrap());
                // Remaining bytes should be zero
                for i in TARGET_RUNPATH.len()..len {
                    assert_eq!(elf[offset as usize + i], 0, "padding should be zero");
                }
            }
            other => panic!("expected Runpath, got {:?}", other),
        }
    }

    #[test]
    fn test_patch_runpath_too_short() {
        let mut elf = build_minimal_elf_with_interp(Some("/short"));
        let result = patch_runpath_in_place(&mut elf);
        assert!(
            matches!(result, Err(PackedError::RunpathTooShort { .. })),
            "should fail when runpath is too short"
        );
    }

    #[test]
    fn test_patch_runpath_no_dynamic() {
        let mut elf = build_static_elf();
        let result = patch_runpath_in_place(&mut elf);
        assert!(result.is_err(), "static ELF has no dynamic section");
    }

    #[test]
    fn test_patch_runpath_absent() {
        // Build an ELF with interp but no runpath/dynamic section
        let mut elf = build_minimal_elf_with_interp(None);
        // This should return Err(NoDynamicSection) because there's no dynamic section
        let result = patch_runpath_in_place(&mut elf);
        assert!(
            matches!(result, Err(PackedError::NoDynamicSection)),
            "should fail with NoDynamicSection when no dynamic section exists"
        );
    }

    // -----------------------------------------------------------------------
    // Integration: inject + runpath together
    // -----------------------------------------------------------------------

    #[test]
    fn test_inject_then_runpath() {
        let mut elf = build_minimal_elf_with_interp(Some(
            "/this/is/a/very/long/runpath/that/has/plenty/of/room",
        ));

        // First inject bootstrap
        let injected = inject_bootstrap(&mut elf, "../lib/ld-linux-x86-64.so.2")
            .expect("injection should succeed");
        assert!(injected);

        // Then patch runpath — this should still work because the dynamic
        // section is still intact in the original part of the file
        // (bootstrap injection only appends and modifies phdrs)
        let patched = patch_runpath_in_place(&mut elf).expect("runpath patch should work");
        // The original ELF had a runpath, so this should patch it
        assert!(
            patched,
            "runpath should be patched after bootstrap injection"
        );
    }

    #[test]
    fn test_bootstrap_payload_is_valid() {
        // Basic sanity check on the embedded payload
        assert!(!BOOTSTRAP_X86_64.is_empty(), "payload should not be empty");
        assert!(
            BOOTSTRAP_X86_64.len() < 4096,
            "payload should be small (< 4KB)"
        );
        assert!(
            BOOTSTRAP_X86_64.len() % 8 == 0,
            "payload should be 8-byte aligned (convenient)"
        );
    }

    #[test]
    fn test_launcher_payload_exists() {
        // Verify the launcher payload is embedded and is a valid ELF
        use super::LAUNCHER_X86_64;
        assert!(
            !LAUNCHER_X86_64.is_empty(),
            "launcher payload should not be empty"
        );
        assert!(is_elf(LAUNCHER_X86_64), "launcher should be a valid ELF");

        // The launcher should be statically linked (no PT_INTERP)
        if let Ok(elf) = goblin::elf::Elf::parse(LAUNCHER_X86_64) {
            let has_interp = elf
                .program_headers
                .iter()
                .any(|p| p.p_type == program_header::PT_INTERP);
            assert!(!has_interp, "launcher should be static (no PT_INTERP)");
        }
    }

    #[test]
    fn test_lea_offsets_within_payload() {
        // Verify the LEA patch offsets are within the payload
        assert!(
            X86_64_LEA_DISP_OFFSET + 4 <= BOOTSTRAP_X86_64.len(),
            "LEA displacement should be within payload"
        );
        assert!(
            X86_64_LEA_RIP <= BOOTSTRAP_X86_64.len(),
            "LEA RIP should be within payload"
        );
    }
}
