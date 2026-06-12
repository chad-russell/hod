//! Post-build wrapper script generation.
//!
//! After a Process build completes, this module generates POSIX shell wrapper
//! scripts for every executable in `$OUT/bin/`. The wrappers:
//!
//! 1. Discover their own output prefix from `$0` using pure shell parameter
//!    expansion (no external commands like `readlink` or `dirname`).
//! 2. Build `XDG_DATA_DIRS`, `GSETTINGS_SCHEMA_PATH`, and other environment
//!    variables from the runtime dependency staging directories.
//! 3. Exec the real (renamed) binary with the constructed environment.
//!
//! This makes built applications work when invoked directly (e.g., after
//! `hod copy-closure`), without needing `hod run` as an intermediary.
//!
//! The wrapper scripts use only POSIX shell builtins — no external commands
//! from PATH — so they work even when PATH is entirely Hod-managed
//! (e.g., inside an Alpine/musl VM where coreutils come from Hod).

use std::collections::BTreeMap;
use std::path::Path;

use crate::hash::{hash_shard, hash_to_hex, Hash};
use crate::packed::is_elf;
use crate::store::Store;

/// Generate wrapper scripts for all executables in the output's `bin/`
/// directory.
///
/// For each non-wrapper executable in `bin/`:
/// - Moves it into `bin/_hod_wrapped/<name>`
/// - Creates a POSIX shell wrapper at `bin/<name>` that sets up the runtime
///   environment and execs the wrapped binary.
///
/// Returns the number of wrappers generated.
pub fn generate_wrappers(
    store: &Store,
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

    // Detect gio-launch-desktop helper from runtime deps (e.g., glib).
    // GLib's GIO uses this binary to launch desktop apps. It's looked up
    // via the GIO_LAUNCH_DESKTOP env var, a compile-time path, or PATH.
    // Since hod installs to a staging dir, the compile-time path
    // (/libexec/gio-launch-desktop) won't exist, so we set the env var.
    let gio_launch: Option<String> = dep_shard_hex.iter().find_map(|(shard, hex)| {
        let staging = store.root().join("staging").join(shard).join(hex);
        let candidate = staging.join("libexec/gio-launch-desktop");
        if candidate.exists() {
            Some(format!(
                "$staging_root/{shard}/{hex}/libexec/gio-launch-desktop"
            ))
        } else {
            None
        }
    });

    let gio_launch_export = match &gio_launch {
        Some(path) => format!("export GIO_LAUNCH_DESKTOP=\"{path}\"\n"),
        None => String::new(),
    };

    // Detect XKB config root from runtime deps (e.g., xkeyboard-config)
    let xkb_root: Option<String> = runtime_dep_outputs.iter().find_map(|(_name, hash)| {
        let shard = hash_shard(hash);
        let hex = hash_to_hex(hash);
        let staging = store.root().join("staging").join(&shard).join(&hex);
        if staging.join("share/X11/xkb").is_dir() {
            Some(format!("$staging_root/{shard}/{hex}/share/X11/xkb"))
        } else {
            None
        }
    });

    // Detect X11 locale directory from runtime deps (e.g., libX11).
    // xkbcommon uses XLOCALEDIR to find Compose files for input method support.
    let xlocale_dir: Option<String> = runtime_dep_outputs.iter().find_map(|(_name, hash)| {
        let shard = hash_shard(hash);
        let hex = hash_to_hex(hash);
        let staging = store.root().join("staging").join(&shard).join(&hex);
        if staging.join("share/X11/locale").is_dir() {
            Some(format!("$staging_root/{shard}/{hex}/share/X11/locale"))
        } else {
            None
        }
    });

    // Detect Mesa DRI drivers directory from runtime deps.
    // Needed so Mesa's EGL/GL implementation can find its DRI drivers
    // for software rendering when hardware drivers aren't available.
    let mesa_dri_dir: Option<String> = runtime_dep_outputs.iter().find_map(|(_name, hash)| {
        let shard = hash_shard(hash);
        let hex = hash_to_hex(hash);
        let staging = store.root().join("staging").join(&shard).join(&hex);
        if staging.join("lib/dri").is_dir() {
            Some(format!("$staging_root/{shard}/{hex}/lib/dri"))
        } else {
            None
        }
    });

    // Detect EGL vendor ICD directories from runtime deps.
    // libglvnd loads vendor libraries (e.g., Mesa's libEGL_mesa.so) by reading
    // JSON files from directories listed in __EGL_VENDOR_LIBRARY_DIRS. Without
    // this, libglvnd can't find the vendor ICD at runtime and EGL platform
    // display creation fails silently, causing "display handle not supported"
    // errors in applications like Alacritty.
    let egl_vendor_dirs: Vec<String> = runtime_dep_outputs
        .iter()
        .filter_map(|(_name, hash)| {
            let shard = hash_shard(hash);
            let hex = hash_to_hex(hash);
            let staging = store.root().join("staging").join(&shard).join(&hex);
            if staging.join("share/glvnd/egl_vendor.d").is_dir() {
                Some(format!(
                    "$staging_root/{shard}/{hex}/share/glvnd/egl_vendor.d"
                ))
            } else {
                None
            }
        })
        .collect();

    // Detect libmagic database from the output itself or runtime deps.
    // The `file` command needs MAGIC set to find its compiled magic database
    // since the default compile-time path won't exist in the Hod store layout.
    // Check own output first, then runtime deps.
    let magic_path: Option<String> = {
        if output_staging_dir.join("share/misc/magic.mgc").exists() {
            Some("$prefix/share/misc/magic.mgc".to_string())
        } else {
            runtime_dep_outputs.iter().find_map(|(_name, hash)| {
                let shard = hash_shard(hash);
                let hex = hash_to_hex(hash);
                let staging = store.root().join("staging").join(&shard).join(&hex);
                if staging.join("share/misc/magic.mgc").exists() {
                    Some(format!("$staging_root/{shard}/{hex}/share/misc/magic.mgc"))
                } else {
                    None
                }
            })
        }
    };

    // Detect whether the runtime deps include GTK4 (via dep names or
    // the presence of libgtk-4.so in staging dirs). When GTK4 is present
    // but was built without Vulkan/GL support (common in hod sandboxes),
    // force the Cairo software renderer so windows actually render.
    let has_gtk4 = dep_shard_hex.iter().any(|(_shard, hex)| {
        let staging = store.root().join("staging").join(_shard).join(hex);
        // Check for libgtk-4.so* in lib/ — matches any GTK4-containing dep
        staging.join("lib/libgtk-4.so").exists()
            || std::fs::read_dir(staging.join("lib"))
                .ok()
                .map(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .any(|e| e.file_name().to_string_lossy().starts_with("libgtk-4.so"))
                })
                .unwrap_or(false)
    });

    let gsk_export = if has_gtk4 {
        // Only force cairo if no renderer is explicitly requested by the user.
        // This allows GSK_RENDERER=vulkan to override if GTK4 is later rebuilt
        // with Vulkan support.
        "if [ -z \"${GSK_RENDERER:-}\" ]; then export GSK_RENDERER=cairo; fi\n".to_string()
    } else {
        String::new()
    };

    let gio_extra_export = if has_gtk4 {
        "# Prevent GTK from loading system GIO modules (e.g., NixOS gvfs)\n\
         # which link against a different glib and cause symbol conflicts.\n\
         export GIO_EXTRA_MODULES=\"\"\n"
            .to_string()
    } else {
        String::new()
    };

    let xkb_export = match &xkb_root {
        Some(path) => format!("export XKB_CONFIG_ROOT=\"{path}\"\n"),
        None => String::new(),
    };

    let xlocale_export = match &xlocale_dir {
        Some(path) => format!("export XLOCALEDIR=\"{path}\"\n"),
        None => String::new(),
    };

    let mesa_dri_export = match &mesa_dri_dir {
        Some(path) => {
            format!(
                "if [ -z \"${{LIBGL_DRIVERS_PATH:-}}\" ]; then export LIBGL_DRIVERS_PATH=\"{path}\"; fi\n"
            )
        }
        None => String::new(),
    };

    let egl_vendor_export = if egl_vendor_dirs.is_empty() {
        String::new()
    } else {
        let dirs = egl_vendor_dirs.join(":");
        format!(
            "if [ -z \"${{__EGL_VENDOR_LIBRARY_DIRS:-}}\" ]; then export __EGL_VENDOR_LIBRARY_DIRS=\"{dirs}\"; fi\n"
        )
    };

    let magic_export = match &magic_path {
        Some(path) => format!("export MAGIC=\"{path}\"\n"),
        None => String::new(),
    };

    let ghostty_resources_export =
        "if [ -d \"$prefix/share/ghostty\" ]; then export GHOSTTY_RESOURCES_DIR=\"$prefix/share/ghostty\"; fi\n";

    // Detect git exec-path and template-dir from own output.
    // Git hardcodes prefix at build time and resolves libexec/templates relative
    // to it. With prefix=/ and DESTDIR staging, the compiled-in paths point to
    // the filesystem root, not the store. Set GIT_EXEC_PATH and GIT_TEMPLATE_DIR
    // to override.
    let git_exec_export = if output_staging_dir.join("libexec/git-core").is_dir() {
        "if [ -z \"${GIT_EXEC_PATH:-}\" ]; then export GIT_EXEC_PATH=\"$prefix/libexec/git-core\"; fi\n"
    } else {
        ""
    };
    let git_template_export = if output_staging_dir
        .join("share/git-core/templates")
        .is_dir()
    {
        "if [ -z \"${GIT_TEMPLATE_DIR:-}\" ]; then export GIT_TEMPLATE_DIR=\"$prefix/share/git-core/templates\"; fi\n"
    } else {
        ""
    };

    let ld_linux_path: Option<String> = runtime_dep_outputs.iter().find_map(|(_name, hash)| {
        let shard = hash_shard(hash);
        let hex = hash_to_hex(hash);
        let staging = store.root().join("staging").join(&shard).join(&hex);
        for rel in ["lib/ld-linux-x86-64.so.2", "sysroot/lib/ld-linux-x86-64.so.2"] {
            if staging.join(rel).is_file() {
                return Some(format!("$staging_root/{shard}/{hex}/{rel}"));
            }
        }
        None
    });

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
        if name.starts_with('.')
            || name.ends_with("-wrapped")
            || name == "_hod_wrapped"
            || path.is_dir()
        {
            continue;
        }

        // Skip symlinks — they point at already-wrapped binaries or are
        // versioned aliases (e.g., python3 -> python3.12). The target will
        // get its own wrapper.
        if path.is_symlink() {
            continue;
        }

        // Only wrap ELF executables by default. Some packages (notably
        // Ghostty) install a shell launcher that execs the real binary, and
        // that launcher still needs Hod's runtime env setup.
        let data = match std::fs::read(&path) {
            Ok(d) => d,
            Err(_) => continue,
        };
        let is_ghostty_launcher = name == "ghostty" && data.starts_with(b"#!");
        if !is_elf(&data) && !is_ghostty_launcher {
            continue;
        }

        // Skip statically-linked ELFs (no PT_INTERP). Wrapping a static
        // binary in a shell script is harmful because:
        //   1. The wrapper requires /bin/sh to exist before the wrapper
        //      runs, which doesn't hold for sandbox-entry-point binaries
        //      (e.g., the toolchain's musl-static busybox is invoked by
        //      the kernel as the very first command, before any preamble
        //      can set up /bin/sh).
        //   2. Static binaries don't need any of the env-var setup the
        //      wrapper provides — they have no dynamic linker, no DT_RPATH,
        //      and no XDG_DATA_DIRS-style runtime concerns.
        // Static ELFs have no PT_INTERP, which `crate::packed::parse_interp`
        // returns as `None`.
        if is_elf(&data) && crate::packed::parse_interp(&data).is_none() && name != "ghostty-bin" {
            continue;
        }

        // Skip compiler and build-tool executables. These compute internal
        // paths (e.g., iprefix) relative to argv[0]; wrapping them in a
        // shell script breaks that resolution because the real binary ends
        // up in bin/_hod_wrapped/<name>, shifting the relative path by one
        // directory level and making tools like cc1 unreachable.
        if name == "clang" || name == "clang++" || name.starts_with("clang-") {
            continue;
        }

        if matches!(
            name.as_str(),
            "gcc"
                | "g++"
                | "cc"
                | "c++"
                | "cc1"
                | "cc1plus"
                | "collect2"
                | "ld"
                | "x86_64-linux-gnu-gcc"
                | "x86_64-linux-gnu-g++"
                | "x86_64-linux-gnu-ld"
                | "llvm-config"
                | "cmake"
                | "ctest"
                | "cpack"
                | "ccmake"
                | "cmake-gui"
        ) {
            continue;
        }

        let wrapped_dir = bin_dir.join("_hod_wrapped");
        std::fs::create_dir_all(&wrapped_dir).map_err(WrapError::Io)?;
        let wrapped_name = format!("_hod_wrapped/{name}");
        let wrapped_path = bin_dir.join(&wrapped_name);

        // Rename the real binary
        std::fs::rename(&path, &wrapped_path).map_err(WrapError::Io)?;

        // Generate the wrapper script
        let wrapper_content = generate_wrapper_script(
            &name,
            &wrapped_name,
            &dep_shard_hex,
            &gsk_export,
            &gio_extra_export,
            &gio_launch_export,
            &xkb_export,
            &xlocale_export,
            &mesa_dri_export,
            &egl_vendor_export,
            &magic_export,
            ghostty_resources_export,
            git_exec_export,
            git_template_export,
            ld_linux_path.as_deref(),
        );

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
    name: &str,
    wrapped_name: &str,
    dep_shard_hex: &[(String, String)],
    gsk_export: &str,
    gio_extra_export: &str,
    gio_launch_export: &str,
    xkb_export: &str,
    xlocale_export: &str,
    mesa_dri_export: &str,
    egl_vendor_export: &str,
    magic_export: &str,
    ghostty_resources_export: &str,
    git_exec_export: &str,
    git_template_export: &str,
    ld_linux_path: Option<&str>,
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

    // Collect lib/ directories from runtime deps for wrappers that still need
    // LD_LIBRARY_PATH for dlopen()-loaded libraries.
    let ld_lib_parts: Vec<String> = dep_shard_hex
        .iter()
        .map(|(shard, hex)| format!("$staging_root/{shard}/{hex}/lib"))
        .collect();

    // Collect share/glib-2.0/schemas/ for GSETTINGS_SCHEMA_PATH
    let gsettings_parts: Vec<String> = dep_shard_hex
        .iter()
        .map(|(shard, hex)| format!("$staging_root/{shard}/{hex}/share/glib-2.0/schemas"))
        .collect();

    // Collect share/glib-2.0/schemas from own prefix too
    let own_gsettings = "$prefix/share/glib-2.0/schemas";

    let xdg_data_str = xdg_data_parts.join(":");
    let ld_lib_str = ld_lib_parts.join(":");
    let lib_path = format!("$prefix/lib:{ld_lib_str}");
    let gsettings_str = format!("{}:{}", own_gsettings, gsettings_parts.join(":"));

    // Most Hod binaries should not leak Hod's runtime library path to child
    // processes. Tools such as bat spawn system/Nix pagers, and those children
    // can break if they inherit Hod's libc path. Keep LD_LIBRARY_PATH only for
    // GUI/runtime-heavy apps that need dlopen() lookups after startup.
    let keep_ld_library_path = matches!(name, "alacritty" | "ghostty-bin");

    let ld_export = if keep_ld_library_path && name != "ghostty-bin" {
        format!(
            "# Build LD_LIBRARY_PATH from own lib/ and runtime deps for dlopen() resolution\nexport LD_LIBRARY_PATH=\"{lib_path}${{LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}}\"\n"
        )
    } else {
        "# Hod RUNPATH relocation handles linked libraries; do not export Hod LD_LIBRARY_PATH.\n"
            .to_string()
    };

    let exec_line = if name == "ghostty-bin" {
        if let Some(ld_linux_path) = ld_linux_path {
            format!(
                "exec \"{ld_linux_path}\" --library-path \"{lib_path}\" \"$bin_dir/{wrapped_name}\" \"$@\""
            )
        } else {
            format!("exec \"$bin_dir/{wrapped_name}\" \"$@\"")
        }
    } else if name == "alacritty" {
        format!("exec \"$bin_dir/{wrapped_name}\" --option 'env.LD_LIBRARY_PATH=\"\"' \"$@\"")
    } else {
        format!("exec \"$bin_dir/{wrapped_name}\" \"$@\"")
    };

    format!(
        r#"#!/bin/sh
# Hod wrapper — sets up runtime environment and execs the real binary.
# Generated automatically by the hod build system.

# Resolve paths using shell builtins only — no readlink/dirname from PATH.
# Walk upward from $0 to find the output prefix (the directory containing bin/).
case "$0" in
    /*) _wrapper="$0" ;;
    *)  _wrapper="$(pwd)/$0" ;;
esac
_cur="${{_wrapper%/*}}"
while [ "$_cur" != "/" ]; do
    if [ -d "$_cur/bin" ]; then
        prefix="$(cd "$_cur" && pwd -P)"
        break
    fi
    _cur="${{_cur%/*}}"
done
bin_dir="$prefix/bin"
_staging="${{prefix%/*}}"
staging_root="${{_staging%/*}}"

{ld_export}

# Build XDG_DATA_DIRS from own prefix and all runtime deps
if [ -d "$prefix/share" ]; then
    _xdg_data="$prefix/share:{xdg_data_str}"
else
    _xdg_data="{xdg_data_str}"
fi
export XDG_DATA_DIRS="${{_xdg_data}}${{XDG_DATA_DIRS:+:$XDG_DATA_DIRS}}"

# Build GSETTINGS_SCHEMA_PATH for GLib/GTK schema resolution
export GSETTINGS_SCHEMA_PATH="{gsettings_str}${{GSETTINGS_SCHEMA_PATH:+:$GSETTINGS_SCHEMA_PATH}}"

{gsk_export}{gio_extra_export}{gio_launch_export}{xkb_export}{xlocale_export}{mesa_dri_export}{egl_vendor_export}{magic_export}{ghostty_resources_export}{git_exec_export}{git_template_export}{exec_line}
"#
    )
}

#[cfg(test)]
mod tests {
    use super::generate_wrapper_script;

    fn script_for(name: &str) -> String {
        generate_wrapper_script(
            name,
            &format!("_hod_wrapped/{name}"),
            &[("aa".to_string(), "aabbcc".to_string())],
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            "",
            None,
        )
    }

    #[test]
    fn cli_wrapper_does_not_export_hod_ld_library_path() {
        let script = script_for("bat");

        assert!(!script.contains("export LD_LIBRARY_PATH="));
        assert!(script.contains("do not export Hod LD_LIBRARY_PATH"));
        assert!(script.contains("exec \"$bin_dir/_hod_wrapped/bat\" \"$@\""));
    }

    #[test]
    fn alacritty_wrapper_keeps_runtime_ld_library_path_and_scrubs_children() {
        let script = script_for("alacritty");

        assert!(script.contains("export LD_LIBRARY_PATH="));
        assert!(script.contains("--option 'env.LD_LIBRARY_PATH=\"\"'"));
    }
}
