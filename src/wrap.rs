//! Post-build wrapper script generation.
//!
//! After a Process build completes, this module generates POSIX shell wrapper
//! scripts for every executable in `$OUT/bin/`. The wrappers:
//!
//! 1. Discover their own output prefix from `$0` (using `readlink -f`
//!    and `dirname`) and the enclosing staging root.
//! 2. Build `XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_PATH`, and other environment
//!    variables from the runtime dependency staging directories.
//! 3. Exec the real (renamed) binary with the constructed environment.
//!
//! This makes built applications work when invoked directly (e.g., after
//! `hod copy-closure`), without needing `hod run` as an intermediary.
//!
//! The wrapper scripts use only POSIX shell constructs and `readlink -f`
//! (available on all Linux distributions), so they work without any hod
//! runtime dependency.

use std::collections::BTreeMap;
use std::path::Path;

use crate::hash::{hash_shard, hash_to_hex, Hash};
use crate::packed::is_elf;
use crate::store::Store;

/// Generate wrapper scripts for all executables in the output's `bin/`
/// directory.
///
/// For each non-wrapper executable in `bin/`:
/// - Renames it to `bin/.<name>-wrapped`
/// - Creates a POSIX shell wrapper at `bin/<name>` that sets up the runtime
///   environment and execs the wrapped binary.
///
/// Returns the number of wrappers generated.
pub fn generate_wrappers(
    _store: &Store,
    output_staging_dir: &Path,
    runtime_dep_outputs: &BTreeMap<String, Hash>,
) -> Result<usize, WrapError> {
    let bin_dir = output_staging_dir.join("bin");
    if !bin_dir.is_dir() {
        return Ok(0);
    }

    // Collect runtime dep staging paths (relative to the staging root)
    let dep_shard_hex: Vec<(String, String)> = runtime_dep_outputs
        .iter()
        .map(|(_name, hash)| {
            let shard = hash_shard(hash);
            let hex = hash_to_hex(hash);
            (shard, hex)
        })
        .collect();

    let mut count = 0;

    // Read directory entries first, then process — avoids borrow issues
    let entries: Vec<_> = std::fs::read_dir(&bin_dir)
        .map_err(WrapError::Io)?
        .filter_map(|e| e.ok())
        .collect();

    for entry in entries {
        let path = entry.path();
        let name = match entry.file_name().to_str() {
            Some(n) => n.to_string(),
            None => continue,
        };

        // Skip already-wrapped binaries, hidden files, and directories
        if name.starts_with('.') || name.ends_with("-wrapped") || path.is_dir() {
            continue;
        }

        // Skip symlinks — they point at already-wrapped binaries or are
        // versioned aliases (e.g., python3 -> python3.12). The target will
        // get its own wrapper.
        if path.is_symlink() {
            continue;
        }

        // Only wrap ELF executables (skip shell scripts the package may
        // have installed, like wrapper scripts from libtool)
        let data = match std::fs::read(&path) {
            Ok(d) => d,
            Err(_) => continue,
        };
        if !is_elf(&data) {
            continue;
        }

        let wrapped_name = format!(".{name}-wrapped");
        let wrapped_path = bin_dir.join(&wrapped_name);

        // Rename the real binary
        std::fs::rename(&path, &wrapped_path).map_err(WrapError::Io)?;

        // Generate the wrapper script
        let wrapper_content = generate_wrapper_script(&name, &wrapped_name, &dep_shard_hex);

        std::fs::write(&path, &wrapper_content).map_err(WrapError::Io)?;

        // Make the wrapper executable
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o755))
                .map_err(WrapError::Io)?;
        }

        count += 1;
    }

    Ok(count)
}

/// Error type for wrapper generation.
#[derive(Debug)]
pub enum WrapError {
    /// An IO error occurred.
    Io(std::io::Error),
}

impl std::fmt::Display for WrapError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(e) => write!(f, "IO error: {e}"),
        }
    }
}

impl std::error::Error for WrapError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::Io(e) => Some(e),
        }
    }
}

/// Generate a POSIX shell wrapper script.
///
/// The wrapper:
/// 1. Resolves its own canonical path via `readlink -f` and `dirname`.
/// 2. Computes the staging root by ascending from `bin/` through the staged
///    output's shard/hash directories.
/// 3. Constructs environment variable lists from the runtime dep staging dirs.
/// 4. Execs the wrapped binary with the computed environment.
fn generate_wrapper_script(
    _name: &str,
    wrapped_name: &str,
    dep_shard_hex: &[(String, String)],
) -> String {
    // Build the list of runtime dep staging paths for XDG_DATA_DIRS.
    // Each path is: $staging_root/<shard>/<hex>/share
    //
    // The staging root is computed from $0:
    //   $0 = .../staging/XX/<hash>/bin/<wrapper>
    //   bin_dir = $(dirname "$0")       →  .../staging/XX/<hash>/bin
    //   output  = $(dirname "$bin_dir") →  .../staging/XX/<hash>
    //   shard   = $(dirname "$output")  →  .../staging/XX
    //   staging_root = $(dirname "$shard") → .../staging
    //
    // So from $bin_dir, staging_root = $(cd "$bin_dir/../../.." && pwd)

    // Collect share/ directories from runtime deps
    let xdg_data_parts: Vec<String> = dep_shard_hex
        .iter()
        .map(|(shard, hex)| format!("$staging_root/{shard}/{hex}/share"))
        .collect();

    // Collect share/glib-2.0/schemas/ for GSETTINGS_SCHEMA_PATH
    let gsettings_parts: Vec<String> = dep_shard_hex
        .iter()
        .map(|(shard, hex)| format!("$staging_root/{shard}/{hex}/share/glib-2.0/schemas"))
        .collect();

    // Collect share/glib-2.0/schemas from own prefix too
    let own_gsettings = "$prefix/share/glib-2.0/schemas";

    let xdg_data_str = xdg_data_parts.join(":");
    let gsettings_str = format!("{}:{}", own_gsettings, gsettings_parts.join(":"));

    format!(
        r#"#!/bin/sh
# Hod wrapper — sets up runtime environment and execs the real binary.
# Generated automatically by the hod build system.

# Resolve canonical path (handles symlinks, relative paths, etc.)
self="$(readlink -f "$0")"
bin_dir="$(dirname "$self")"
prefix="$(cd "$bin_dir/.." && pwd)"
staging_root="$(cd "$bin_dir/../../.." && pwd)"

# Build XDG_DATA_DIRS from own prefix and all runtime deps
if [ -d "$prefix/share" ]; then
    _xdg_data="$prefix/share:{xdg_data_str}"
else
    _xdg_data="{xdg_data_str}"
fi
export XDG_DATA_DIRS="${{_xdg_data}}${{XDG_DATA_DIRS:+:$XDG_DATA_DIRS}}"

# Build GSETTINGS_SCHEMA_PATH for GLib/GTK schema resolution
export GSETTINGS_SCHEMA_PATH="{gsettings_str}${{GSETTINGS_SCHEMA_PATH:+:$GSETTINGS_SCHEMA_PATH}}"

exec "$bin_dir/{wrapped_name}" "$@"
"#
    )
}
