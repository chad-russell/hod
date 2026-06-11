//! Profile management — evaluate TypeScript profile modules, build packages,
//! create symlink farms, deploy managed config files, and write activation
//! env scripts.
//!
//! A profile is a `.ts` file exporting `{ name, packages, user_units?, files? }`.
//! This module evaluates it via Bun, builds any unbuilt packages, and produces
//! a symlink farm at `~/.hod/profiles/<name>/` with `env.sh` and `env.fish`.
//!
//! ## Farm layout
//!
//! Instead of merging individual files into shared `bin/`, `lib/`, etc.
//! directories (which fights Hod's store-relocation design), each package's
//! entire staging output is linked as a directory symlink under `pkgs/`.
//! The env scripts compose PATH/MANPATH/XDG_DATA_DIRS from those linked
//! directories.
//!
//! This works with store-relocation because binaries are invoked through the
//! symlink chain, the kernel resolves to the store staging path, and the
//! bootstrap + RPATH relative paths resolve correctly from there.
//!
//! Runtime deps (toolchain libc, ld-linux, shared assets) are linked under
//! `runtime/` for inspection and debugging; the profile env scripts do not use
//! them via `LD_LIBRARY_PATH`.

use std::path::{Path, PathBuf};
use std::process::Command;

use serde::{Deserialize, Serialize};

use crate::build::{self, BuildOptions};
use crate::hash::{hash_to_hex, hex_to_hash, Hash};
use crate::store::{Store, StoreConfig};

// ---------------------------------------------------------------------------
// Bun evaluation
// ---------------------------------------------------------------------------

/// Parsed output from evaluating a profile module via Bun.
#[derive(Debug, Deserialize)]
struct ProfileOutput {
    name: String,
    packages: Vec<ProfilePackageOutput>,
    #[serde(default)]
    user_units: Vec<UserUnit>,
    #[serde(default)]
    files: Vec<ManagedFile>,
}

#[derive(Debug, Deserialize)]
struct ProfilePackageOutput {
    name: Option<String>,
    hash: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfilePackage {
    pub name: Option<String>,
    pub hash: Hash,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserUnit {
    pub name: String,
    pub content: String,
    pub enable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagedFile {
    pub target: String,
    pub content_hash: String,
    #[serde(default)]
    pub executable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProfileDefinition {
    pub name: String,
    pub packages: Vec<ProfilePackage>,
    #[serde(default)]
    pub user_units: Vec<UserUnit>,
    #[serde(default)]
    pub files: Vec<ManagedFile>,
}

pub fn package_hashes(packages: &[ProfilePackage]) -> Vec<Hash> {
    packages.iter().map(|pkg| pkg.hash).collect()
}

/// Evaluate a profile `.ts` file via Bun and return the resolved profile.
///
/// This writes a temporary evaluation script, runs `bun run` on it, and
/// parses a single JSON line from stdout containing `{ name, packages, user_units }`.
///
/// Side effects: evaluating the profile imports all recipe modules, which
/// call `importToStore()` — so all recipes end up in the store.
pub fn evaluate_profile(
    profile_path: &Path,
    _store_config: &StoreConfig,
) -> Result<ProfileDefinition, String> {
    // Canonicalize to absolute path so the Bun import works from any cwd
    let abs_path = profile_path.canonicalize().map_err(|e| {
        format!(
            "cannot resolve profile path {}: {e}",
            profile_path.display()
        )
    })?;

    let profile_str = abs_path.to_string_lossy();

    // Write a temporary evaluation script
    let tmp = std::env::temp_dir().join("hod-profile-eval.ts");
    let script = format!(
        r#"
import {{ profile }} from "{profile_str}";
const pkgs = profile.packages.map((p, index) => {{
  if (typeof p === 'string') return {{ hash: p }};
  if (p && typeof p === 'object' && 'hash' in p) return {{ name: p.name, hash: p.hash }};
  const recipe = p?.recipe ?? p?.package;
  if (recipe && typeof recipe === 'object' && 'hash' in recipe) return {{ name: p.name, hash: recipe.hash }};
  throw new Error(`invalid profile package at index ${{index}}`);
}});
const rawFiles = profile.files ?? [];
const files = rawFiles.length > 0 ? await Promise.all(rawFiles) : [];
console.log(JSON.stringify({{
  name: profile.name,
  packages: pkgs,
  user_units: profile.user_units ?? [],
  files: files,
}}));
"#,
        profile_str = profile_str,
    );
    std::fs::write(&tmp, &script).map_err(|e| format!("cannot write eval script: {e}"))?;

    // Run bun
    let bun = std::env::var("BUN").unwrap_or_else(|_| "bun".to_string());
    let mut command = Command::new(&bun);
    command.arg("run").arg(&tmp);
    if std::env::var_os("HOD_BIN").is_none() {
        if let Ok(current_exe) = std::env::current_exe() {
            command.env("HOD_BIN", current_exe);
        }
    }
    let output = command
        .output()
        .map_err(|e| format!("failed to run `{bun} run`: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "`{bun} run` failed (exit {:?})\n{stdout}{stderr}",
            output.status.code()
        ));
    }

    // Parse JSON from stdout — Bun may print other lines (from importToStore etc.)
    // so we look for the JSON line specifically.
    let stdout = String::from_utf8_lossy(&output.stdout);
    let json_line = stdout
        .lines()
        .filter(|l| l.trim_start().starts_with('{'))
        .last()
        .ok_or_else(|| {
            format!(
                "profile evaluation produced no JSON output.\n\
                 stdout: {stdout}"
            )
        })?;

    let profile_out: ProfileOutput = serde_json::from_str(json_line.trim())
        .map_err(|e| format!("failed to parse profile JSON: {e}\nline: {json_line}"))?;

    // Parse package hashes
    let mut packages = Vec::with_capacity(profile_out.packages.len());
    for (i, pkg) in profile_out.packages.iter().enumerate() {
        let hash = hex_to_hash(&pkg.hash).ok_or_else(|| {
            format!(
                "package [{}] has invalid hash '{}' (expected 64 hex chars)",
                i, pkg.hash
            )
        })?;
        packages.push(ProfilePackage {
            name: pkg.name.clone(),
            hash,
        });
    }

    Ok(ProfileDefinition {
        name: profile_out.name,
        packages,
        user_units: profile_out.user_units,
        files: profile_out.files,
    })
}

// ---------------------------------------------------------------------------
// Building
// ---------------------------------------------------------------------------

/// Build any unbuilt packages in the profile. Returns the number of packages
/// that were actually built (vs already cached).
pub fn build_profile(
    store: &Store,
    hashes: &[Hash],
    quiet: bool,
    keep_failed: bool,
) -> Result<usize, String> {
    // Determine which packages need building
    let mut unbuilt: Vec<Hash> = Vec::new();
    for hash in hashes {
        match store.get_output(hash) {
            Ok(Some(_)) => {} // already built
            Ok(None) => unbuilt.push(*hash),
            Err(e) => return Err(format!("store error checking output: {e}")),
        }
    }

    if unbuilt.is_empty() {
        return Ok(0);
    }

    eprintln!("[hod] building {} unbuilt package(s)...", unbuilt.len());

    let options = BuildOptions {
        force: false,
        quiet,
        keep_failed,
    };

    let mut built = 0;
    for (i, hash) in unbuilt.iter().enumerate() {
        let hex = hash_to_hex(hash);
        eprintln!("[hod] [{}/{}] building {}...", i + 1, unbuilt.len(), hex);

        let recipe_bytes = store
            .get_recipe(hash)
            .map_err(|e| format!("recipe {} not in store: {e}", hex))?;

        match build::build(store, &recipe_bytes, &options) {
            Ok(output_hash) => {
                eprintln!(
                    "[hod] [{}/{}] built {} → {}",
                    i + 1,
                    unbuilt.len(),
                    hex,
                    hash_to_hex(&output_hash)
                );
                built += 1;
            }
            Err(e) => {
                return Err(format!(
                    "build failed for package {} ({} of {}): {e}",
                    hex,
                    i + 1,
                    unbuilt.len()
                ));
            }
        }
    }

    Ok(built)
}

// ---------------------------------------------------------------------------
// Profiles directory
// ---------------------------------------------------------------------------

/// Resolve the profiles directory.
///
/// Priority: `HOD_PROFILES_DIR` env → `~/.hod/profiles/`
fn profiles_dir() -> PathBuf {
    if let Ok(p) = std::env::var("HOD_PROFILES_DIR") {
        return PathBuf::from(p);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".hod/profiles")
}

fn user_systemd_dir() -> PathBuf {
    if let Ok(p) = std::env::var("XDG_CONFIG_HOME") {
        return PathBuf::from(p).join("systemd/user");
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".into());
    PathBuf::from(home).join(".config/systemd/user")
}

fn managed_units_manifest_path(profile_name: &str) -> PathBuf {
    user_systemd_dir().join(format!(".hod-{profile_name}-units.manifest"))
}

// ---------------------------------------------------------------------------
// Resolved package info (for env.sh generation)
// ---------------------------------------------------------------------------

/// A resolved package with its staging path and deduced binary name.
struct ResolvedPackage {
    /// Short name for the package directory symlink (derived from the binary name).
    link_name: String,
    /// Absolute path to the staging directory.
    #[allow(dead_code)]
    staging_path: PathBuf,
}

/// Public form of [`ResolvedPackage`] for cross-module callers.
///
/// Used by `crate::system` to compose its own farm layout while reusing the
/// profile resolution + runtime-dep walk logic.
pub struct FarmEntry {
    pub link_name: String,
    pub staging_path: PathBuf,
}

/// Populate `target_dir` with a symlink farm: `pkgs/<name> → store path` and
/// `runtime/<dep> → store path` for each package's runtime closure.
///
/// `target_dir` must exist and should be empty. The caller decides what to do
/// with the populated directory (atomic rename for user profiles, generation
/// move for system profiles, etc.).
///
/// Does NOT write env scripts. Callers that need env composition should call
/// `write_user_env_snippets` afterward; system profiles intentionally skip
/// shell env composition.
pub fn populate_farm(
    target_dir: &Path,
    store: &Store,
    profile_packages: &[ProfilePackage],
) -> Result<Vec<FarmEntry>, String> {
    std::fs::create_dir_all(target_dir.join("pkgs"))
        .map_err(|e| format!("cannot create pkgs dir: {e}"))?;
    std::fs::create_dir_all(target_dir.join("runtime"))
        .map_err(|e| format!("cannot create runtime dir: {e}"))?;

    let mut entries: Vec<FarmEntry> = Vec::new();
    let mut seen_names = std::collections::HashSet::new();

    for package in profile_packages {
        let hash = &package.hash;
        let hex = hash_to_hex(hash);

        let output_hash = store
            .get_output(hash)
            .map_err(|e| format!("store error for package {}: {e}", hex))?
            .ok_or_else(|| format!("package {} has not been built yet", hex))?;

        let staging_path = build::artifact_staging_path(store, &output_hash);
        if !staging_path.exists() {
            return Err(format!(
                "staging path for package {} does not exist: {}",
                hex,
                staging_path.display()
            ));
        }

        let link_name = match &package.name {
            Some(name) => unique_package_name(name, &mut seen_names),
            None => derive_package_name(&staging_path, &hex, &mut seen_names),
        };

        let link_path = target_dir.join("pkgs").join(&link_name);

        // Check if this package has packed binaries (no PT_INTERP).
        // For packed binaries, create wrapper scripts that exec the actual
        // store binary. This ensures AT_EXECFN points to the store path,
        // which is required for the packed binary's interpreter bootstrap
        // (relative path resolution).
        let staging_bin = staging_path.join("bin");
        if staging_bin.is_dir() {
            let has_packed = std::fs::read_dir(&staging_bin)
                .ok()
                .map(|entries| {
                    entries
                        .filter_map(|e| e.ok())
                        .any(|e| is_packed_elf(&e.path()))
                })
                .unwrap_or(false);

            if has_packed {
                // Create a directory farm instead of a single symlink.
                // This allows wrapper scripts for packed binaries while
                // keeping other paths as symlinks.
                let pkg_dir = link_path;
                std::fs::create_dir_all(&pkg_dir).map_err(|e| {
                    format!("cannot create pkg dir {}: {e}", pkg_dir.display())
                })?;

                // Symlink everything from the staging output into the pkg dir.
                for entry in std::fs::read_dir(&staging_path).ok().into_iter().flatten() {
                    let entry = match entry {
                        Ok(e) => e,
                        Err(_) => continue,
                    };
                    let name = entry.file_name();
                    let name_str = match name.to_str() {
                        Some(s) => s,
                        None => continue,
                    };
                    let src = entry.path();
                    let dst = pkg_dir.join(&name);

                    if name_str == "bin" && src.is_dir() {
                        // Create bin/ with wrappers for packed binaries.
                        std::fs::create_dir_all(&dst).map_err(|e| {
                            format!("cannot create bin dir {}: {e}", dst.display())
                        })?;
                        for bin_entry in
                            std::fs::read_dir(&src).ok().into_iter().flatten()
                        {
                            let bin_entry = match bin_entry {
                                Ok(e) => e,
                                Err(_) => continue,
                            };
                            let bin_name = bin_entry.file_name();
                            let bin_src = bin_entry.path();
                            let bin_dst = dst.join(&bin_name);

                            if is_packed_elf(&bin_src)
                                && bin_name.to_string_lossy() != "ghostty-bin"
                            {
                                // Write a wrapper script that execs the store binary.
                                // Set _LIBCONTAINER_CLONED_BINARY=1 to prevent crun
                                // from re-exec'ing itself via memfd (which breaks
                                // packed binary AT_EXECFN resolution). Harmless for
                                // non-crun binaries.
                                let wrapper = format!(
                                    "#!/bin/sh\nexport _LIBCONTAINER_CLONED_BINARY=1\nexec {} \"$@\"\n",
                                    bin_src.display()
                                );
                                std::fs::write(&bin_dst, &wrapper).map_err(|e| {
                                    format!(
                                        "cannot write wrapper {}: {e}",
                                        bin_dst.display()
                                    )
                                })?;
                                use std::os::unix::fs::PermissionsExt;
                                std::fs::set_permissions(
                                    &bin_dst,
                                    std::fs::Permissions::from_mode(0o755),
                                )
                                .map_err(|e| {
                                    format!(
                                        "cannot chmod wrapper {}: {e}",
                                        bin_dst.display()
                                    )
                                })?;
                            } else {
                                // Regular binary — just symlink.
                                std::os::unix::fs::symlink(&bin_src, &bin_dst)
                                    .map_err(|e| {
                                        format!(
                                            "cannot symlink bin {}: {e}",
                                            bin_dst.display()
                                        )
                                    })?;
                            }
                        }
                    } else {
                        // Non-bin — symlink the whole directory/file.
                        std::os::unix::fs::symlink(&src, &dst).map_err(|e| {
                            format!("cannot symlink {}: {e}", dst.display())
                        })?;
                    }
                }
            } else {
                std::os::unix::fs::symlink(&staging_path, &link_path).map_err(|e| {
                    format!(
                        "cannot symlink {} → {}: {e}",
                        link_path.display(),
                        staging_path.display()
                    )
                })?;
            }
        } else {
            std::os::unix::fs::symlink(&staging_path, &link_path).map_err(|e| {
                format!(
                    "cannot symlink {} → {}: {e}",
                    link_path.display(),
                    staging_path.display()
                )
            })?;
        }

        entries.push(FarmEntry {
            link_name,
            staging_path,
        });
    }

    // Resolve runtime deps (deduplicated across all packages).
    let mut runtime_deps: Vec<(String, PathBuf)> = Vec::new();
    let mut seen_runtime: std::collections::HashSet<[u8; 32]> = std::collections::HashSet::new();

    for package in profile_packages {
        collect_runtime_deps(store, &package.hash, &mut runtime_deps, &mut seen_runtime)?;
    }

    for (dep_name, dep_staging) in &runtime_deps {
        let link_path = target_dir.join("runtime").join(dep_name);
        if link_path.exists() || link_path.is_symlink() {
            let _ = std::fs::remove_file(&link_path);
        }
        std::os::unix::fs::symlink(dep_staging, &link_path)
            .map_err(|e| format!("cannot symlink runtime dep {}: {e}", dep_name))?;
    }

    // Create hash-based symlinks at the profile root for each runtime dep's
    // output hash. Packed binaries use AT_EXECFN + relative paths to find
    // their dynamic linker (e.g. ../../../7d/7d010ed4.../lib/ld-linux-x86-64.so.2).
    // When accessed through the profile symlink farm, these relative traversals
    // resolve against the profile root, so we must mirror the store's
    // shard/hex directory structure here.
    {
        let mut seen_staging: std::collections::HashSet<String> =
            std::collections::HashSet::new();
        for (_dep_name, dep_staging) in &runtime_deps {
            // dep_staging is .../store/staging/<shard>/<hex>/
            // Extract shard and hex from the path components.
            let hex_opt = dep_staging.file_name().and_then(|n| n.to_str());
            let shard_opt = dep_staging.parent().and_then(|p| p.file_name()).and_then(|n| n.to_str());
            let (shard, hex) = match (shard_opt, hex_opt) {
                (Some(s), Some(h)) => (s, h),
                _ => continue,
            };
            if shard.len() != 2 || hex.len() != 64 {
                continue;
            }
                let key = format!("{shard}/{hex}");
                if seen_staging.contains(&key) {
                    continue;
                }
                seen_staging.insert(key.clone());
                let shard_dir_path = target_dir.join(shard);
                if !shard_dir_path.exists() {
                    std::fs::create_dir(&shard_dir_path).map_err(|e| {
                        format!("cannot create shard dir {}: {e}", shard_dir_path.display())
                    })?;
                }
                let link_path = target_dir.join(&key);
                if link_path.exists() || link_path.is_symlink() {
                    let _ = std::fs::remove_file(&link_path);
                }
                std::os::unix::fs::symlink(dep_staging, &link_path).map_err(|e| {
                    format!("cannot symlink hash path {}: {e}", link_path.display())
                })?;
            }
    }

    Ok(entries)
}

/// Check if a file is a packed ELF binary (has ELF magic but no PT_INTERP).
fn is_packed_elf(path: &std::path::Path) -> bool {
    let Ok(data) = std::fs::read(path) else {
        return false;
    };
    if data.len() < 64 || data[0..4] != [0x7f, 0x45, 0x4c, 0x46] {
        return false;
    }
    let e_phoff = u64::from_le_bytes(data[32..40].try_into().unwrap_or([0; 8]));
    let e_phentsize = u16::from_le_bytes(data[54..56].try_into().unwrap_or([0; 2]));
    let e_phnum = u16::from_le_bytes(data[56..58].try_into().unwrap_or([0; 2]));
    if e_phentsize == 0 || e_phnum == 0 {
        return false;
    }
    let pt_interp: u32 = 3;
    for i in 0..e_phnum {
        let off = e_phoff as usize + (i as usize) * (e_phentsize as usize);
        if off + 56 > data.len() {
            return false;
        }
        let p_type = u32::from_le_bytes(data[off..off + 4].try_into().unwrap_or([0; 4]));
        if p_type == pt_interp {
            return false;
        }
    }
    true
}

// ---------------------------------------------------------------------------
// Symlink farm
// ---------------------------------------------------------------------------

/// Create a symlink farm for the profile with atomic swap.
///
/// Layout:
///
/// ```text
/// ~/.hod/profiles/<name>/
///   pkgs/<link-name> → <store staging path>
///   runtime/<dep-name> → <runtime dep staging path>
///   units/<unit-name> → <systemd unit content>
///   files/<target> → <file content from store blob>
///   files.manifest → list of managed file targets
///   files.dirs → directories hod created (for cleanup)
///   env.sh
///   env.fish
/// ```
///
/// Each package's entire staging output is symlinked as a directory. This
/// preserves the store-relative paths that the bootstrap and RPATH rely on.
/// Runtime deps are linked separately under `runtime/` for inspection and for
/// wrapper/runtime logic outside the profile env scripts.
/// Managed files are written from store blobs into `files/` and symlinked into
/// the user's home directory during activation.
pub fn create_farm(store: &Store, name: &str, hashes: &[Hash]) -> Result<PathBuf, String> {
    let profile = ProfileDefinition {
        name: name.to_string(),
        packages: hashes
            .iter()
            .map(|hash| ProfilePackage {
                name: None,
                hash: *hash,
            })
            .collect(),
        user_units: Vec::new(),
        files: Vec::new(),
    };
    create_farm_from_profile(store, &profile)
}

pub fn create_farm_from_packages(
    store: &Store,
    name: &str,
    profile_packages: &[ProfilePackage],
) -> Result<PathBuf, String> {
    let profile = ProfileDefinition {
        name: name.to_string(),
        packages: profile_packages.to_vec(),
        user_units: Vec::new(),
        files: Vec::new(),
    };
    create_farm_from_profile(store, &profile)
}

pub fn create_farm_from_profile(
    store: &Store,
    profile: &ProfileDefinition,
) -> Result<PathBuf, String> {
    let base = profiles_dir();
    let farm_dir = base.join(&profile.name);
    let tmp_dir = base.join(format!(".{}.tmp", profile.name));
    let old_dir = base.join(format!(".{}.old", profile.name));
    let changed_units = changed_user_units(&farm_dir, &profile.user_units)?;

    // Ensure base directory exists
    std::fs::create_dir_all(&base)
        .map_err(|e| format!("cannot create profiles dir {}: {e}", base.display()))?;

    // Clean up any stale temp/old dirs
    if tmp_dir.exists() {
        std::fs::remove_dir_all(&tmp_dir)
            .map_err(|e| format!("cannot remove stale temp dir: {e}"))?;
    }

    // Populate pkgs/ and runtime/ via the shared helper.
    let entries = populate_farm(&tmp_dir, store, &profile.packages)?;
    let packages: Vec<ResolvedPackage> = entries
        .into_iter()
        .map(|e| ResolvedPackage {
            link_name: e.link_name,
            staging_path: e.staging_path,
        })
        .collect();

    // Write env snippets (user-profile-specific; system profiles skip this).
    write_env_snippets(&tmp_dir, &profile.name, &packages)?;
    write_user_units(&tmp_dir, &profile.user_units)?;
    write_managed_files_to_farm(store, &tmp_dir, &profile.files)?;

    // Atomic swap
    if farm_dir.exists() {
        if old_dir.exists() {
            std::fs::remove_dir_all(&old_dir).map_err(|e| format!("cannot remove old dir: {e}"))?;
        }
        std::fs::rename(&farm_dir, &old_dir)
            .map_err(|e| format!("cannot rename existing farm to .old: {e}"))?;
    }

    std::fs::rename(&tmp_dir, &farm_dir)
        .map_err(|e| format!("cannot rename temp farm into place: {e}"))?;

    if old_dir.exists() {
        let _ = std::fs::remove_dir_all(&old_dir);
    }

    if !profile.user_units.is_empty() || managed_units_manifest_path(&profile.name).exists() {
        activate_user_units(&profile.name, &farm_dir, &profile.user_units, &changed_units)?;
    }

    if !profile.files.is_empty() || managed_files_manifest_path(&profile.name).exists() {
        activate_managed_files(&profile.name, &farm_dir, &profile.files)?;
    }

    Ok(farm_dir)
}

fn write_user_units(farm_dir: &Path, user_units: &[UserUnit]) -> Result<(), String> {
    if user_units.is_empty() {
        return Ok(());
    }
    let units_dir = farm_dir.join("units");
    std::fs::create_dir_all(&units_dir)
        .map_err(|e| format!("cannot create units dir {}: {e}", units_dir.display()))?;
    for unit in user_units {
        std::fs::write(units_dir.join(&unit.name), &unit.content)
            .map_err(|e| format!("cannot write unit {}: {e}", unit.name))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Managed files
// ---------------------------------------------------------------------------

fn home_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_else(|_| "/tmp".into()))
}

fn managed_files_manifest_path(profile_name: &str) -> PathBuf {
    profiles_dir().join(profile_name).join("files.manifest")
}

fn managed_dirs_path(profile_name: &str) -> PathBuf {
    profiles_dir().join(profile_name).join("files.dirs")
}

/// Read the list of previously managed file target paths from the manifest.
fn read_managed_files(profile_name: &str) -> Result<Vec<String>, String> {
    let manifest_path = managed_files_manifest_path(profile_name);
    if !manifest_path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("cannot read {}: {e}", manifest_path.display()))?;
    Ok(text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

/// Read the list of directories hod created (for cleanup).
fn read_managed_dirs(profile_name: &str) -> Result<Vec<String>, String> {
    let dirs_path = managed_dirs_path(profile_name);
    if !dirs_path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&dirs_path)
        .map_err(|e| format!("cannot read {}: {e}", dirs_path.display()))?;
    Ok(text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

/// Write managed file content to the farm under `files/`.
///
/// For each ManagedFile, reads the content blob from the store and writes it
/// to `farm/files/<target>`. Sets executable bit if requested.
fn write_managed_files_to_farm(
    store: &Store,
    farm_dir: &Path,
    files: &[ManagedFile],
) -> Result<(), String> {
    if files.is_empty() {
        return Ok(());
    }

    for file in files {
        let content_hash = hex_to_hash(&file.content_hash).ok_or_else(|| {
            format!(
                "invalid content_hash '{}' for file '{}'",
                file.content_hash, file.target
            )
        })?;

        let content = store.read_blob(&content_hash).map_err(|e| {
            format!(
                "cannot read content blob {} for file '{}': {e}",
                file.content_hash, file.target
            )
        })?;

        let file_path = farm_dir.join("files").join(&file.target);
        if let Some(parent) = file_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("cannot create files dir {}: {e}", parent.display()))?;
        }

        std::fs::write(&file_path, &content)
            .map_err(|e| format!("cannot write farm file {}: {e}", file_path.display()))?;

        if file.executable {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&file_path, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| format!("cannot chmod farm file {}: {e}", file_path.display()))?;
        }
    }

    Ok(())
}

/// Deploy managed file symlinks from the farm to the user's home directory.
///
/// After the farm is atomically swapped into place, this function:
/// 1. Removes symlinks for files no longer in the profile
/// 2. Cleans up empty directories that hod created
/// 3. Creates new symlinks from target paths → farm copies
/// 4. Refuses to overwrite unmanaged files (safety)
/// 5. Writes updated manifest and dirs tracking files
fn activate_managed_files(
    profile_name: &str,
    farm_dir: &Path,
    files: &[ManagedFile],
) -> Result<(), String> {
    let home = home_dir();
    let files_dir = farm_dir.join("files");

    let previous_files = read_managed_files(profile_name)?;
    let previous_dirs = read_managed_dirs(profile_name)?;

    let desired_targets: std::collections::HashSet<&str> =
        files.iter().map(|f| f.target.as_str()).collect();

    // Remove files no longer in the profile
    for target in &previous_files {
        if desired_targets.contains(target.as_str()) {
            continue;
        }
        let abs_target = home.join(target);
        if abs_target.is_symlink() {
            let _ = std::fs::remove_file(&abs_target);
        } else if abs_target.exists() {
            eprintln!(
                "[hod] warning: not removing managed file {} (no longer a symlink)",
                abs_target.display()
            );
        }
    }

    // Clean up empty directories that hod created (bottom-up by depth)
    let mut dirs_to_check: Vec<String> = previous_dirs;
    dirs_to_check.sort_by(|a, b| b.len().cmp(&a.len()));
    for dir_rel in &dirs_to_check {
        let dir_abs = home.join(dir_rel);
        if dir_abs.is_dir() {
            let is_empty = std::fs::read_dir(&dir_abs)
                .map(|mut entries| entries.next().is_none())
                .unwrap_or(false);
            if is_empty {
                let _ = std::fs::remove_dir(&dir_abs);
            }
        }
    }

    // Collect directories that hod will need to create
    let mut managed_dirs: Vec<String> = Vec::new();

    // Deploy new/updated files
    for file in files {
        let abs_target = home.join(&file.target);
        let farm_copy = files_dir.join(&file.target);

        if !farm_copy.exists() {
            return Err(format!(
                "farm copy for '{}' does not exist at {}",
                file.target,
                farm_copy.display()
            ));
        }

        // Ensure parent directories exist, tracking which ones we create
        if let Some(parent_rel) = Path::new(&file.target).parent() {
            let parent_rel_str = parent_rel.to_string_lossy();
            if !parent_rel_str.is_empty() {
                let abs_parent = home.join(parent_rel);
                if !abs_parent.exists() {
                    // Walk up and track each directory we need to create
                    let mut components: Vec<String> = Vec::new();
                    for component in parent_rel.components() {
                        components.push(component.as_os_str().to_string_lossy().to_string());
                        let partial = components.join("/");
                        let partial_abs = home.join(&partial);
                        if !partial_abs.exists() {
                            managed_dirs.push(partial);
                        }
                    }
                    std::fs::create_dir_all(&abs_parent).map_err(|e| {
                        format!(
                            "cannot create directory {}: {e}",
                            abs_parent.display()
                        )
                    })?;
                }
            }
        }

        // Safety check: refuse to overwrite unmanaged files
        if abs_target.exists() || abs_target.is_symlink() {
            let managed = previous_files.iter().any(|t| t == &file.target);
            if !managed {
                return Err(format!(
                    "refusing to overwrite unmanaged file {} at {}",
                    file.target,
                    abs_target.display()
                ));
            }
            // Remove old symlink/file managed by hod
            if abs_target.is_symlink() {
                let _ = std::fs::remove_file(&abs_target);
            } else {
                std::fs::remove_file(&abs_target)
                    .map_err(|e| format!("cannot remove old file {}: {e}", abs_target.display()))?;
            }
        }

        std::os::unix::fs::symlink(&farm_copy, &abs_target).map_err(|e| {
            format!(
                "cannot link {} -> {}: {e}",
                abs_target.display(),
                farm_copy.display()
            )
        })?;
    }

    // Write manifest
    let manifest_path = managed_files_manifest_path(profile_name);
    let mut targets: Vec<&str> = files.iter().map(|f| f.target.as_str()).collect();
    targets.sort_unstable();
    if targets.is_empty() {
        if manifest_path.exists() {
            let _ = std::fs::remove_file(&manifest_path);
        }
    } else {
        let manifest = format!("{}\n", targets.join("\n"));
        std::fs::write(&manifest_path, manifest)
            .map_err(|e| format!("cannot write {}: {e}", manifest_path.display()))?;
    }

    // Write dirs tracking
    let dirs_path = managed_dirs_path(profile_name);
    managed_dirs.sort();
    managed_dirs.dedup();
    if managed_dirs.is_empty() {
        if dirs_path.exists() {
            let _ = std::fs::remove_file(&dirs_path);
        }
    } else {
        let dirs_content = format!("{}\n", managed_dirs.join("\n"));
        std::fs::write(&dirs_path, dirs_content)
            .map_err(|e| format!("cannot write {}: {e}", dirs_path.display()))?;
    }

    Ok(())
}

fn changed_user_units(farm_dir: &Path, user_units: &[UserUnit]) -> Result<Vec<String>, String> {
    let mut changed = Vec::new();
    for unit in user_units {
        let existing_path = farm_dir.join("units").join(&unit.name);
        let differs = match std::fs::read_to_string(&existing_path) {
            Ok(existing) => existing != unit.content,
            Err(_) => true,
        };
        if differs {
            changed.push(unit.name.clone());
        }
    }
    Ok(changed)
}

fn read_managed_units(profile_name: &str) -> Result<Vec<String>, String> {
    let manifest_path = managed_units_manifest_path(profile_name);
    if !manifest_path.exists() {
        return Ok(Vec::new());
    }
    let text = std::fs::read_to_string(&manifest_path)
        .map_err(|e| format!("cannot read {}: {e}", manifest_path.display()))?;
    Ok(text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect())
}

fn run_systemctl_user(args: &[&str]) -> Result<(), String> {
    let status = Command::new("systemctl")
        .arg("--user")
        .args(args)
        .status()
        .map_err(|e| format!("failed to run systemctl --user {}: {e}", args.join(" ")))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!(
            "systemctl --user {} failed with exit {:?}",
            args.join(" "),
            status.code()
        ))
    }
}

fn systemctl_user_status(args: &[&str]) -> Result<bool, String> {
    let status = Command::new("systemctl")
        .arg("--user")
        .args(args)
        .status()
        .map_err(|e| format!("failed to run systemctl --user {}: {e}", args.join(" ")))?;
    Ok(status.success())
}

fn activate_user_units(
    profile_name: &str,
    farm_dir: &Path,
    user_units: &[UserUnit],
    changed_units: &[String],
) -> Result<(), String> {
    let systemd_dir = user_systemd_dir();
    std::fs::create_dir_all(&systemd_dir)
        .map_err(|e| format!("cannot create systemd user dir {}: {e}", systemd_dir.display()))?;

    let previous_units = read_managed_units(profile_name)?;
    let desired_names: std::collections::HashSet<&str> =
        user_units.iter().map(|unit| unit.name.as_str()).collect();

    for unit_name in &previous_units {
        if desired_names.contains(unit_name.as_str()) {
            continue;
        }
        let _ = run_systemctl_user(&["stop", unit_name]);
        let _ = run_systemctl_user(&["disable", unit_name]);
        let link_path = systemd_dir.join(unit_name);
        if link_path.exists() || link_path.is_symlink() {
            std::fs::remove_file(&link_path)
                .map_err(|e| format!("cannot remove unit link {}: {e}", link_path.display()))?;
        }
    }

    for unit in user_units {
        let link_path = systemd_dir.join(&unit.name);
        let target = farm_dir.join("units").join(&unit.name);
        if link_path.exists() || link_path.is_symlink() {
            let managed = previous_units.iter().any(|name| name == &unit.name);
            if !managed {
                return Err(format!(
                    "refusing to overwrite unmanaged user unit {} at {}",
                    unit.name,
                    link_path.display()
                ));
            }
            std::fs::remove_file(&link_path)
                .map_err(|e| format!("cannot replace unit link {}: {e}", link_path.display()))?;
        }
        std::os::unix::fs::symlink(&target, &link_path)
            .map_err(|e| format!("cannot link {} -> {}: {e}", link_path.display(), target.display()))?;
    }

    let needs_reload = !previous_units.is_empty() || !user_units.is_empty();
    if needs_reload {
        run_systemctl_user(&["daemon-reload"])?;
    }

    for unit in user_units {
        if unit.enable {
            run_systemctl_user(&["enable", &unit.name])?;
        } else if systemctl_user_status(&["is-enabled", "--quiet", &unit.name])? {
            run_systemctl_user(&["disable", &unit.name])?;
        }
    }

    for unit_name in changed_units {
        if systemctl_user_status(&["is-active", "--quiet", unit_name])? {
            run_systemctl_user(&["restart", unit_name])?;
        }
    }

    let mut names: Vec<&str> = user_units.iter().map(|unit| unit.name.as_str()).collect();
    names.sort_unstable();
    let manifest_path = managed_units_manifest_path(profile_name);
    if names.is_empty() {
        if manifest_path.exists() {
            std::fs::remove_file(&manifest_path)
                .map_err(|e| format!("cannot remove {}: {e}", manifest_path.display()))?;
        }
    } else {
        let manifest = format!("{}\n", names.join("\n"));
        std::fs::write(&manifest_path, manifest)
            .map_err(|e| format!("cannot write {}: {e}", manifest_path.display()))?;
    }

    Ok(())
}

fn unique_package_name(name: &str, seen: &mut std::collections::HashSet<String>) -> String {
    let base = sanitize_package_name(name);
    let mut candidate = base.clone();
    let mut counter = 2;
    while seen.contains(&candidate) {
        candidate = format!("{}-{}", base, counter);
        counter += 1;
    }
    seen.insert(candidate.clone());
    candidate
}

fn sanitize_package_name(name: &str) -> String {
    let sanitized: String = name
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' {
                c
            } else {
                '-'
            }
        })
        .collect();
    let trimmed = sanitized.trim_matches('-');
    if trimmed.is_empty() || trimmed.starts_with('.') {
        "package".to_string()
    } else {
        trimmed.to_string()
    }
}

/// Derive a short, human-readable name for a package directory symlink.
///
/// Tries, in order:
/// 1. The name of the first binary in `bin/`
/// 2. Falls back to the first 12 chars of the recipe hash
fn derive_package_name(
    staging_path: &Path,
    hex: &str,
    seen: &mut std::collections::HashSet<String>,
) -> String {
    let bin_dir = staging_path.join("bin");
    let candidate = if bin_dir.is_dir() {
        std::fs::read_dir(&bin_dir).ok().and_then(|entries| {
            let mut candidates: Vec<String> = entries
                .filter_map(|e| e.ok())
                .filter(|e| e.path().is_file() || e.path().is_symlink())
                .filter_map(|e| {
                    let name = e.file_name().to_string_lossy().to_string();
                    if name.starts_with('.')
                        || name.ends_with("-wrapped")
                        || name.ends_with("-config")
                    {
                        None
                    } else {
                        Some(name)
                    }
                })
                .collect();
            candidates.sort();
            candidates.into_iter().next()
        })
    } else {
        None
    };

    let base = candidate.unwrap_or_else(|| hex[..12].to_string());

    unique_package_name(&base, seen)
}

/// Collect runtime dependencies for a package by decoding its recipe.
///
/// For Process recipes with `runtime_deps`, resolves each named dep to its
/// staging path. Deduplicates by recipe hash.
fn collect_runtime_deps(
    store: &Store,
    recipe_hash: &Hash,
    runtime_deps: &mut Vec<(String, PathBuf)>,
    seen: &mut std::collections::HashSet<[u8; 32]>,
) -> Result<(), String> {
    let recipe_bytes = store
        .get_recipe(recipe_hash)
        .map_err(|e| format!("cannot load recipe {}: {e}", hash_to_hex(recipe_hash)))?;

    let recipe = crate::recipe::Recipe::decode(&recipe_bytes)
        .map_err(|e| format!("cannot decode recipe {}: {e}", hash_to_hex(recipe_hash)))?;

    let process = match recipe {
        crate::recipe::Recipe::Process(p) => p,
        _ => return Ok(()),
    };

    let runtime_dep_names = match &process.runtime_deps {
        Some(names) => names,
        None => return Ok(()),
    };

    let dep_map: std::collections::HashMap<&str, &Hash> = process
        .dependencies
        .iter()
        .map(|d| (d.name.as_str(), &d.recipe_hash))
        .collect();

    for dep_name in runtime_dep_names {
        let dep_recipe_hash = match dep_map.get(dep_name.as_str()) {
            Some(h) => *h,
            None => continue,
        };

        if !seen.insert(*dep_recipe_hash) {
            continue; // already collected
        }

        let dep_output_hash = match store.get_output(&dep_recipe_hash) {
            Ok(Some(h)) => h,
            _ => continue,
        };

        let dep_staging = build::artifact_staging_path(store, &dep_output_hash);
        if dep_staging.exists() {
            runtime_deps.push((dep_name.clone(), dep_staging));
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Environment snippets
// ---------------------------------------------------------------------------

/// Write `env.sh`, `env.fish`, and `env.systemd` into the farm directory.
///
/// Composes PATH, MANPATH, and XDG_DATA_DIRS from the linked package
/// directories.
///
/// NOTE: We intentionally do NOT set `LD_LIBRARY_PATH`. Hod binaries use
/// store-relative RPATH + AT_EXECFN bootstrap to find their libraries, so
/// `LD_LIBRARY_PATH` is unnecessary for them. Setting it would poison system
/// binaries that use `DT_RUNPATH` (resolved *after* `LD_LIBRARY_PATH`),
/// causing them to load Hod's glibc instead of their own. This was the root
/// cause of segfaults when sourcing `env.sh` on NixOS.
fn generate_containers_conf(farm_path: &str, pkg_names: &[&str]) -> String {
    let helper_dir = format!("{farm_path}/pkgs/netavark/bin");
    let runtime = pkg_names
        .iter()
        .find(|n| **n == "crun")
        .map(|_| format!("{farm_path}/pkgs/crun/bin/crun"))
        .unwrap_or_else(|| "crun".to_string());
    let conmon = pkg_names
        .iter()
        .find(|n| **n == "conmon")
        .map(|_| format!("{farm_path}/pkgs/conmon/bin/conmon"))
        .unwrap_or_else(|| "/usr/bin/conmon".to_string());
    let network_cmd = pkg_names
        .iter()
        .find(|n| **n == "netavark")
        .map(|_| "netavark".to_string())
        .unwrap_or_else(|| "cni".to_string());
    let pasta = pkg_names
        .iter()
        .find(|n| **n == "passt")
        .map(|_| format!("{farm_path}/pkgs/passt/bin/pasta"))
        .unwrap_or_else(|| "/usr/bin/pasta".to_string());

    format!(
        r#"[containers]
volumes = []

[engine]
helper_binaries_dir = ["{helper_dir}"]
runtime = "{runtime}"
conmon_path = ["{conmon}"]
network_cmd_path = "{network_cmd}"
cgroup_manager = "cgroupfs"
events_logger = "file"
stop_signal = "SIGTERM"

[network]
network_backend = "netavark"
pasta_path = "{pasta}"
"#,
    )
}

fn write_env_snippets(
    farm_dir: &Path,
    name: &str,
    packages: &[ResolvedPackage],
) -> Result<(), String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "$HOME".to_string());
    let farm_path = format!("{home}/.hod/profiles/{name}");

    // Build colon-separated paths for each env var
    let mut path_parts: Vec<String> = Vec::new();
    let mut man_parts: Vec<String> = Vec::new();
    let mut xdg_parts: Vec<String> = Vec::new();

    let pkg_names: Vec<&str> = packages.iter().map(|p| p.link_name.as_str()).collect();

    for pkg in packages {
        let p = format!("{farm_path}/pkgs/{}/bin", pkg.link_name);
        path_parts.push(p);
        let m = format!("{farm_path}/pkgs/{}/share/man", pkg.link_name);
        man_parts.push(m);
        let x = format!("{farm_path}/pkgs/{}/share", pkg.link_name);
        xdg_parts.push(x);
    }

    // env.sh
    let path_val = path_parts.join(":");
    let man_val = man_parts.join(":");
    let xdg_val = xdg_parts.join(":");

    let mut extra_env_sh = String::new();
    let mut extra_env_systemd = String::new();

    // Generate containers.conf when the profile includes podman.
    if pkg_names.iter().any(|n| *n == "podman") {
        let containers_conf = generate_containers_conf(&farm_path, &pkg_names);
        std::fs::write(farm_dir.join("containers.conf"), &containers_conf)
            .map_err(|e| format!("cannot write containers.conf: {e}"))?;
        extra_env_sh.push_str(&format!(
            "export CONTAINERS_CONF=\"{farm_path}/containers.conf\"\n"
        ));
        extra_env_systemd.push_str(&format!("CONTAINERS_CONF={farm_path}/containers.conf\n"));
    }

    let env_sh = format!(
        r#"# hod profile: {name}
export HOD_PROFILE="{name}"
export PATH="{path_val}:$PATH"
export MANPATH="{man_val}${{MANPATH:+:$MANPATH}}"
export XDG_DATA_DIRS="{xdg_val}${{XDG_DATA_DIRS:+:$XDG_DATA_DIRS}}"
{extra_env_sh}"#,
    );
    std::fs::write(farm_dir.join("env.sh"), &env_sh)
        .map_err(|e| format!("cannot write env.sh: {e}"))?;

    let env_systemd = format!(
        "# hod profile: {name}\nHOD_PROFILE={name}\nPATH={path_val}:/usr/local/bin:/usr/bin:/bin\nMANPATH={man_val}\nXDG_DATA_DIRS={xdg_val}\n{extra_env_systemd}",
    );
    std::fs::write(farm_dir.join("env.systemd"), &env_systemd)
        .map_err(|e| format!("cannot write env.systemd: {e}"))?;

    // env.fish
    let fish_path = path_parts.join("\" $PATH \"");
    let fish_man = man_parts.join("\" $MANPATH \"");
    let fish_xdg = xdg_parts.join("\" $XDG_DATA_DIRS \"");

    let env_fish = format!(
        r#"# hod profile: {name}
set -gx HOD_PROFILE "{name}"
set -gx PATH {fish_path} $PATH
set -gx MANPATH {fish_man} $MANPATH
set -gx XDG_DATA_DIRS {fish_xdg} $XDG_DATA_DIRS
"#,
    );
    std::fs::write(farm_dir.join("env.fish"), &env_fish)
        .map_err(|e| format!("cannot write env.fish: {e}"))?;

    Ok(())
}
