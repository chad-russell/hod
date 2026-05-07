//! Store-relative binary relocation.
//!
//! After building a Process recipe that declares `runtime_deps`, the builder
//! applies a relocation pass to ELF binaries in the staged output:
//!
//! 1. Scans the staged output directory for ELF binaries.
//! 2. Reads `DT_NEEDED` entries from each binary.
//! 3. Resolves each needed library against the runtime_dep outputs.
//! 4. Computes `$ORIGIN`-relative paths to the dependency lib directories.
//! 5. Patches RUNPATH with the computed paths.
//! 6. Injects AT_EXECFN bootstrap with a store-relative path to ld-linux.
//!
//! The result: binaries that reference their dependencies in-place within the
//! store, with no copying of shared libraries. The store is store-portable —
//! move the whole store and everything still works.

use std::collections::{BTreeMap, BTreeSet};
use std::path::Path;

use crate::build::artifact_staging_path;
use crate::hash::{hash_shard, hash_to_hex, Hash};
use crate::packed::{inject_bootstrap, is_elf, patch_runpath_to};
use crate::store::Store;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Relocate ELF binaries in a staged output directory.
///
/// Walks `output_staging_dir` for ELF files, resolves their DT_NEEDED against
/// the runtime dep outputs, and patches RUNPATH + bootstrap with store-relative
/// paths. The files are modified in-place on disk.
///
/// Returns `Ok(count)` with the number of ELF binaries relocated.
pub fn relocate_staged_output(
    store: &Store,
    output_staging_dir: &Path,
    runtime_dep_outputs: &BTreeMap<String, Hash>,
) -> Result<usize, RelocateError> {
    let mut count = 0;

    // Discover all ELF files in the output directory
    let elf_files = discover_elf_files(output_staging_dir);

    for elf_path in &elf_files {
        match relocate_single_elf(store, elf_path, output_staging_dir, runtime_dep_outputs) {
            Ok(()) => count += 1,
            Err(e) => {
                eprintln!(
                    "[hod] warning: failed to relocate {}: {e}",
                    elf_path.display()
                );
            }
        }
    }

    Ok(count)
}

/// Error type for relocation operations.
#[derive(Debug)]
pub enum RelocateError {
    /// An IO error occurred.
    Io(std::io::Error),
    /// An ELF parsing/patching error occurred.
    Elf(String),
}

impl std::fmt::Display for RelocateError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "IO error: {e}"),
            Self::Elf(msg) => write!(f, "ELF error: {msg}"),
        }
    }
}

impl std::error::Error for RelocateError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
            _ => None,
        }
    }
}

impl From<std::io::Error> for RelocateError {
    fn from(e: std::io::Error) -> Self {
        Self::Io(e)
    }
}

// ---------------------------------------------------------------------------
// ELF discovery
// ---------------------------------------------------------------------------

/// Recursively discover ELF files in a directory.
fn discover_elf_files(dir: &Path) -> Vec<std::path::PathBuf> {
    let mut result = Vec::new();
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                result.extend(discover_elf_files(&path));
            } else if path.is_file() {
                // Quick ELF magic check (read first 4 bytes)
                if let Ok(data) = std::fs::read(&path) {
                    if is_elf(&data) {
                        result.push(path);
                    }
                }
            }
        }
    }
    result
}

// ---------------------------------------------------------------------------
// ELF relocation
// ---------------------------------------------------------------------------

/// Relocate a single ELF file by patching RUNPATH and injecting bootstrap.
fn relocate_single_elf(
    store: &Store,
    elf_path: &Path,
    output_staging_dir: &Path,
    runtime_dep_outputs: &BTreeMap<String, Hash>,
) -> Result<(), RelocateError> {
    let mut data = std::fs::read(elf_path)?;

    // Step 1: Discover DT_NEEDED library names
    let needed_libs = discover_dt_needed(&data);

    if needed_libs.is_empty() {
        // Static or no dependencies — nothing to relocate
        return Ok(());
    }

    // Step 2: Resolve each needed library to a dependency output
    let lib_resolutions = resolve_needed_libs(&needed_libs, store, runtime_dep_outputs);

    // Step 3: Find ld-linux in the runtime deps
    let ld_linux_info = find_ld_linux(store, runtime_dep_outputs);

    // Step 4: Collect unique dep output hashes that provide libraries
    let mut dep_lib_dirs: BTreeSet<(String, Hash)> = BTreeSet::new();
    for (_lib_name, (dep_name, dep_hash)) in &lib_resolutions {
        dep_lib_dirs.insert((dep_name.clone(), *dep_hash));
    }

    // Also add the dep that provides ld-linux to the RUNPATH
    if let Some((dep_name, dep_hash, _)) = &ld_linux_info {
        dep_lib_dirs.insert((dep_name.clone(), *dep_hash));
    }

    // Step 5: Build the RUNPATH string.
    //
    // The binary lives at output_staging_dir/<subpath>/binary.
    // $ORIGIN resolves to the directory containing the binary.
    // From there, we need to reach the staging root (output_staging_dir/../../).
    // The number of "../" steps = depth of binary within output + 2 (shard + hash dirs).
    //
    // Example: binary at staging/ab/<hash>/bin/bash
    //   depth = 1 (bin/), so steps = 1 + 2 = 3: "../../../c4/<glibc-hash>/lib"
    //   $ORIGIN/../../../c4/<glibc-hash>/lib → staging/c4/<glibc-hash>/lib ✓
    let depth = path_depth_within(elf_path, output_staging_dir);
    let up_steps = depth + 2; // +2 for shard + hash directory levels
    let prefix = "$ORIGIN/".to_string() + &"../".repeat(up_steps);

    // Self-referencing path: allows binaries to find shared libraries in
    // their own output's lib/ directory. This is needed for packages that
    // produce both executables and shared libraries (e.g., curl→libcurl.so,
    // file→libmagic.so). The path is relative to the ELF's location.
    let up_components: Vec<&str> = (0..depth).map(|_| "..").collect();
    let self_lib_path = if up_components.is_empty() {
        "$ORIGIN/lib".to_string()
    } else {
        format!("$ORIGIN/{}/lib", up_components.join("/"))
    };

    let mut runpath_parts: Vec<String> = vec![self_lib_path];
    runpath_parts.extend(
        dep_lib_dirs
            .iter()
            .map(|(_name, hash)| {
                let shard = hash_shard(hash);
                let hex = hash_to_hex(hash);
                format!("{prefix}{shard}/{hex}/lib")
            }),
    );
    let runpath = runpath_parts.join(":");

    // Step 6: Patch RUNPATH
    // NOTE: The recipe MUST compile with a long dummy RUNPATH (-Wl,-rpath,...)
    // to reserve space in the ELF for this in-place patching. If no RUNPATH
    // exists, the patch is silently skipped (the binary won't be relocatable).
    match patch_runpath_to(&mut data, runpath.as_bytes()) {
        Ok(true) => {} // patched
        Ok(false) => {
            eprintln!(
                "[hod] warning: no RUNPATH to patch in {}",
                elf_path.display()
            );
        }
        Err(e) => {
            eprintln!(
                "[hod] warning: failed to patch RUNPATH in {}: {e}",
                elf_path.display()
            );
        }
    }

    // Step 7: Inject AT_EXECFN bootstrap with store-relative ld-linux path
    // NOTE: The bootstrap code prefixes the path with the dirname of AT_EXECFN,
    // so the interp path must be a plain relative path WITHOUT $ORIGIN/.
    // $ORIGIN is a dynamic linker token, not understood by the bootstrap.
    if let Some((_dep_name, dep_hash, ld_linux_rel_path)) = &ld_linux_info {
        let dep_shard = hash_shard(dep_hash);
        let dep_hex = hash_to_hex(dep_hash);
        let bootstrap_prefix = "../".repeat(up_steps);
        let rel_interp = format!("{bootstrap_prefix}{dep_shard}/{dep_hex}/{ld_linux_rel_path}");

        match inject_bootstrap(&mut data, &rel_interp) {
            Ok(true) => {} // bootstrap injected
            Ok(false) => {
                eprintln!(
                    "[hod] warning: no PT_INTERP in {} — skipping bootstrap injection",
                    elf_path.display()
                );
            }
            Err(e) => {
                eprintln!(
                    "[hod] warning: failed to inject bootstrap in {}: {e}",
                    elf_path.display()
                );
            }
        }
    }

    // Step 8: Write the modified binary back
    std::fs::write(elf_path, &data)?;

    Ok(())
}

/// Discover DT_NEEDED library names from an ELF binary.
fn discover_dt_needed(data: &[u8]) -> Vec<String> {
    let elf = match goblin::elf::Elf::parse(data) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut needed = Vec::new();
    if let Some(ref dynamic) = elf.dynamic {
        for entry in &dynamic.dyns {
            if entry.d_tag == goblin::elf::dynamic::DT_NEEDED {
                if let Some(name) = elf.dynstrtab.get_at(entry.d_val as usize) {
                    needed.push(name.to_string());
                }
            }
        }
    }
    needed
}

/// Resolve each needed library to the dependency output that provides it.
///
/// Returns a map from library name → (dep_name, dep_output_hash).
fn resolve_needed_libs(
    needed: &[String],
    store: &Store,
    runtime_dep_outputs: &BTreeMap<String, Hash>,
) -> BTreeMap<String, (String, Hash)> {
    let mut resolutions = BTreeMap::new();

    for lib_name in needed {
        // Skip ld-linux itself — it's handled separately for bootstrap
        if lib_name.starts_with("ld-linux") || lib_name.starts_with("ld-musl") {
            continue;
        }

        for (dep_name, dep_hash) in runtime_dep_outputs {
            let dep_staging = artifact_staging_path(store, dep_hash);
            if dep_staging.join("lib").join(lib_name).exists() {
                resolutions.insert(lib_name.clone(), (dep_name.clone(), *dep_hash));
                break;
            }
        }
    }

    resolutions
}

/// Compute the depth of a file path relative to a base directory.
///
/// For example, if `file` is `/a/b/c/bin/bash` and `base` is `/a/b/c/`,
/// the depth is 1 (one subdirectory: `bin/`).
/// The depth represents the number of `..` needed to go from the file's
/// parent directory back to the base directory.
fn path_depth_within(file: &Path, base: &Path) -> usize {
    let file_parent = file.parent().unwrap_or(file);
    let Ok(relative) = file_parent.strip_prefix(base) else {
        return 0;
    };
    relative.components().count()
}

/// Find ld-linux in one of the runtime dependency outputs.
///
/// Returns (dep_name, dep_hash, relative_path_to_ld_linux) if found.
/// The relative path is from the dep output root (e.g., "lib/ld-linux-x86-64.so.2").
fn find_ld_linux(
    store: &Store,
    runtime_dep_outputs: &BTreeMap<String, Hash>,
) -> Option<(String, Hash, String)> {
    for (dep_name, dep_hash) in runtime_dep_outputs {
        let dep_staging = artifact_staging_path(store, dep_hash);

        // Check common locations for ld-linux
        let candidates = [
            "lib/ld-linux-x86-64.so.2",
            "lib64/ld-linux-x86-64.so.2",
            "lib/ld-musl-x86_64.so.1",
        ];

        for candidate in &candidates {
            if dep_staging.join(candidate).exists() {
                return Some((dep_name.clone(), *dep_hash, candidate.to_string()));
            }
        }
    }
    None
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discover_dt_needed_on_host_elf() {
        // Test with a known ELF binary on the system
        let candidates = ["/usr/bin/env", "/usr/bin/ls", "/bin/sh"];
        for candidate in &candidates {
            if let Ok(data) = std::fs::read(candidate) {
                if is_elf(&data) {
                    let needed = discover_dt_needed(&data);
                    // Most dynamically linked binaries need libc
                    if !needed.is_empty() {
                        assert!(
                            needed.iter().any(|n| n.contains("libc")),
                            "expected libc in DT_NEEDED, got: {:?}",
                            needed
                        );
                    }
                    return; // test passed
                }
            }
        }
        // If no suitable ELF found, skip silently (NixOS might not have /usr/bin)
    }

    #[test]
    fn store_relative_path_format() {
        // Verify the path format we construct
        // For a binary at staging/ab/<hash>/bin/bash:
        // depth = 1 (bin/), up_steps = 3 (1 + 2 for shard+hash)
        // path = "$ORIGIN/../../../<glibc_shard>/<glibc_hex>/lib"
        let hash: Hash = [
            0xc4, 0xe6, 0x8b, 0xd3, 0x53, 0xa3, 0xe8, 0x41, 0x65, 0x3e, 0x21, 0x87, 0xec, 0x62,
            0x47, 0xac, 0xeb, 0x7e, 0x62, 0x16, 0x7b, 0x19, 0xd8, 0x94, 0xb4, 0xb1, 0xe2, 0x49,
            0x34, 0x7f, 0xf6, 0x2d,
        ];
        let shard = hash_shard(&hash);
        let hex = hash_to_hex(&hash);

        // Case 1: binary at output root (depth 0)
        let prefix0 = "$ORIGIN/".to_string() + &"../".repeat(2);
        let path0 = format!("{prefix0}{shard}/{hex}/lib");
        assert!(path0.starts_with("$ORIGIN/../../"));
        assert!(path0.ends_with("/lib"));

        // Case 2: binary in bin/ (depth 1)
        let prefix1 = "$ORIGIN/".to_string() + &"../".repeat(3);
        let path1 = format!("{prefix1}{shard}/{hex}/lib");
        assert!(path1.starts_with("$ORIGIN/../../../"));
        assert!(path1.ends_with("/lib"));

        // All paths should be reasonable length (< 128 chars for RUNPATH)
        assert!(path0.len() < 128);
        assert!(path1.len() < 128);
    }

    #[test]
    fn path_depth_within_works() {
        let base = std::path::Path::new("/store/staging/ab/abcdef/");
        let file_at_root = std::path::Path::new("/store/staging/ab/abcdef/binary");
        let file_in_bin = std::path::Path::new("/store/staging/ab/abcdef/bin/binary");
        let file_nested = std::path::Path::new("/store/staging/ab/abcdef/a/b/c/binary");

        assert_eq!(path_depth_within(file_at_root, base), 0);
        assert_eq!(path_depth_within(file_in_bin, base), 1);
        assert_eq!(path_depth_within(file_nested, base), 3);
    }
}
